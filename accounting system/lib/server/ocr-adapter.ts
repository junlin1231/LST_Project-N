import "server-only"

import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import zlib from "node:zlib"
import type { BankStatementTransaction, NormalizedDocumentFields } from "@/lib/accounting/document-types"
import { chatCompletionsUrl, fetchAiJson } from "./ai-endpoint"
import { getServerEnv } from "./env"
import type { ReceiptRegion } from "./receipt-splitter"

const execFileAsync = promisify(execFile)

export interface OcrResult {
  rawText: string
  fields: Partial<NormalizedDocumentFields>
  confidence?: number
  pageCount?: number
  engine: string
}

export interface OcrAdapter {
  extract(input: {
    filePath: string
    mimeType: string
    originalFilename: string
  }): Promise<OcrResult>
  detectReceiptRegions(input: {
    filePath: string
    mimeType: string
    originalFilename: string
  }): Promise<ReceiptRegion[]>
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function inferAmount(text: string) {
  const match = text.match(/(?:grand\s+total|total|amount|rm|myr)\s*[:=\-]?\s*(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?|\d{1,7}(?:\.\d{1,2})?)/i)
  if (!match) return 0
  const total = Number(match[1].replace(/,/g, ""))
  return Number.isFinite(total) && total > 0 && total <= 1_000_000 ? total : 0
}

function extractReadablePdfText(buffer: Buffer) {
  const latin = buffer.toString("latin1")
  const streams = [latin]
  for (const match of latin.matchAll(/<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const dictionary = match[1]
    const streamBytes = Buffer.from(match[2], "latin1")
    if (!dictionary.includes("/FlateDecode")) {
      streams.push(streamBytes.toString("latin1"))
      continue
    }
    try {
      streams.push(zlib.inflateSync(streamBytes).toString("latin1"))
    } catch {
      try {
        streams.push(zlib.inflateRawSync(streamBytes).toString("latin1"))
      } catch {
        // Ignore streams that cannot be decoded by the lightweight local parser.
      }
    }
  }

  const snippets = streams.flatMap((stream) => extractPdfTextSnippets(stream))
    .map((value) => decodePdfText(value).trim())
    .filter((value) => value.length > 1)
  return Array.from(new Set(snippets)).join("\n")
}

function analyzePdf(buffer: Buffer) {
  const latin = buffer.toString("latin1")
  const pageCount = Math.max(1, (latin.match(/\/Type\s*\/Page\b/g) ?? []).length)
  const imageCount = (latin.match(/\/Subtype\s*\/Image\b/g) ?? []).length
  const hasCcittImages = latin.includes("/CCITTFaxDecode")
  const hasDctImages = latin.includes("/DCTDecode")
  const producerMatch = latin.match(/\/Producer\s*\(([^)]*)\)/)
  const header = latin.slice(0, 200)
  const producer = producerMatch ? decodePdfText(producerMatch[1]) : ""
  const looksScanned = imageCount > 0 && (hasCcittImages || hasDctImages || /scan|scanner|sharp/i.test(`${producer} ${header}`))
  return { pageCount, imageCount, hasCcittImages, producer, looksScanned }
}

function extractPdfTextSnippets(stream: string) {
  const snippets: string[] = []
  for (const match of stream.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj/g)) {
    snippets.push(match[0].replace(/\s*Tj$/, "").slice(1, -1))
  }
  for (const match of stream.matchAll(/\[([\s\S]*?)\]\s*TJ/gm)) {
    for (const item of match[1].matchAll(/\((?:\\.|[^\\()])*\)/g)) {
      snippets.push(item[0].slice(1, -1))
    }
  }
  return snippets
}

function decodePdfText(value: string) {
  return value
    .replace(/\\([nrtbf])/g, (_match, code: string) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" })[code] ?? code)
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\(\d{1,3})/g, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
    .replace(/\s+/g, " ")
}

async function extractLocalText(input: { filePath: string; mimeType: string }) {
  if (input.mimeType.startsWith("text/")) {
    return fs.readFile(input.filePath, "utf8").catch(() => "")
  }
  if (input.mimeType === "application/pdf") {
    const popplerText = await execFileAsync("pdftotext", ["-layout", input.filePath, "-"], {
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    }).then(({ stdout }) => stdout.trim()).catch(() => "")
    if (popplerText.length > 0) return popplerText

    const buffer = await fs.readFile(input.filePath).catch(() => Buffer.alloc(0))
    return extractReadablePdfText(buffer)
  }
  if (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const buffer = await fs.readFile(input.filePath).catch(() => Buffer.alloc(0))
    return buffer.toString("utf8").replace(/[^\x20-\x7E]+/g, " ").slice(0, 4000)
  }
  return ""
}

async function analyzeLocalPdf(input: { filePath: string; mimeType: string }) {
  if (input.mimeType !== "application/pdf") return null
  const buffer = await fs.readFile(input.filePath).catch(() => Buffer.alloc(0))
  return buffer.length > 0 ? analyzePdf(buffer) : null
}

async function renderPdfPages(input: { filePath: string; maxPages?: number }) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-pdf-"))
  const outputPrefix = path.join(tempDir, "page")
  try {
    await execFileAsync("pdftoppm", ["-jpeg", "-jpegopt", "quality=72", "-r", "150", "-f", "1", "-l", String(input.maxPages ?? 10), input.filePath, outputPrefix], {
      timeout: 90_000,
      maxBuffer: 4 * 1024 * 1024,
    })
    const files = (await fs.readdir(tempDir))
      .filter((file) => /^page-\d+\.jpe?g$/.test(file))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    return Promise.all(files.map(async (file) => ({
      mimeType: "image/jpeg",
      bytes: await fs.readFile(path.join(tempDir, file)),
    })))
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

function buildFallbackFields(input: { rawText: string; originalFilename: string; aiWarning?: string }) {
  const baseName = path.basename(input.originalFilename, path.extname(input.originalFilename))
  const bankTransactions = inferBankTransactionsFromText(input.rawText)
  const totalAmount = inferAmount(input.rawText)
  const subtotal = totalAmount > 0 ? Number((totalAmount / 1.06).toFixed(2)) : 0
  const taxAmount = totalAmount > 0 ? Number((totalAmount - subtotal).toFixed(2)) : 0
  const lower = input.rawText.toLowerCase()
  const description = lower.includes("petrol") ? "Petrol" : lower.includes("entertain") ? "Entertainment" : "Document line"
  const warnings = totalAmount > 0 || bankTransactions?.length
    ? []
    : ["Amount was not detected locally. Configure the Gemma endpoint or enter totals before posting."]
  if (input.aiWarning) warnings.unshift(input.aiWarning)

  return {
    documentDate: today(),
    documentNumber: baseName || input.originalFilename,
    currency: "MYR",
    vendorName: "",
    subtotal,
    otherCharges: 0,
    taxAmount,
    totalAmount,
    paymentMethod: "",
    bankTransactions,
    lineItems: totalAmount > 0
      ? [{ description, quantity: 1, unitPrice: subtotal, taxRate: 0.06, taxAmount, lineTotal: totalAmount }]
      : bankTransactions?.length
        ? []
        : [{ description, quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, lineTotal: 0 }],
    warnings,
  }
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] ?? text
  const start = candidate.indexOf("{")
  const end = candidate.lastIndexOf("}")
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function normalizedNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(number) ? number : NaN
}

function normalizeReceiptRegions(value: unknown): ReceiptRegion[] {
  if (!Array.isArray(value)) return []
  const regions = value.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const region = item as Record<string, unknown>
    const x = normalizedNumber(region.x)
    const y = normalizedNumber(region.y)
    const width = normalizedNumber(region.width)
    const height = normalizedNumber(region.height)
    if (![x, y, width, height].every(Number.isFinite)) return []
    // The detection prompt uses normalized coordinates. A region must be large enough to be a receipt.
    if (x < 0 || y < 0 || width < 0.08 || height < 0.08 || x + width > 1.001 || y + height > 1.001) return []
    return [{ x, y, width, height }]
  })
  return regions
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .filter((region, index, all) => !all.slice(0, index).some((other) => {
      const overlapWidth = Math.max(0, Math.min(other.x + other.width, region.x + region.width) - Math.max(other.x, region.x))
      const overlapHeight = Math.max(0, Math.min(other.y + other.height, region.y + region.height) - Math.max(other.y, region.y))
      const overlap = overlapWidth * overlapHeight
      return overlap / Math.min(other.width * other.height, region.width * region.height) > 0.9
    }))
    .slice(0, 10)
}

async function detectReceiptRegionsWithGemma(input: { filePath: string; mimeType: string; originalFilename: string }): Promise<ReceiptRegion[]> {
  const env = getServerEnv()
  if (!env.aiBaseUrl || !input.mimeType.startsWith("image/")) return []
  if (env.aiProvider !== "openai") throw new Error(`Unsupported LLM_PROVIDER for receipt detection: ${env.aiProvider}.`)

  const bytes = await fs.readFile(input.filePath)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (env.aiApiKey) headers.Authorization = `Bearer ${env.aiApiKey}`
  const payload = await fetchAiJson(chatCompletionsUrl(env.aiBaseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: env.aiModel,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "You detect separate, physically distinct receipts in a single image.",
            "Return only JSON: {\"receipts\":[{\"x\":0,\"y\":0,\"width\":0,\"height\":0}]}",
            "Coordinates must be normalized fractions from 0 to 1 of the whole image.",
            "Include a region only when it is a complete separate receipt, invoice, or payment slip. Do not split one long receipt into sections.",
            "Return exactly one region or an empty receipts array when there are not at least two separate receipts.",
            "Keep a small margin around every receipt and do not return overlapping regions.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Find separately scannable receipts in ${input.originalFilename}.` },
            { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${bytes.toString("base64")}`, detail: "high" } },
          ],
        },
      ],
    }),
  }, env.aiOcrTimeoutMs, { retries: 2 }) as { choices?: Array<{ message?: { content?: string } }> }
  const json = extractJsonObject(payload.choices?.[0]?.message?.content ?? "")
  const regions = normalizeReceiptRegions(json?.receipts)
  return regions.length > 1 ? regions : []
}

function numberValue(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? "").replace(/,/g, "").replace(/^RM\s*/i, ""))
  return Number.isFinite(number) ? number : fallback
}

function optionalNumberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? "").replace(/,/g, "").replace(/^RM\s*/i, ""))
  return Number.isFinite(number) ? number : 0
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function optionalStringValue(value: unknown, fallback = "") {
  const text = stringValue(value, fallback).trim()
  return text === "0" ? "" : text
}

function currencyValue(value: unknown) {
  const currency = optionalStringValue(value).toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : "MYR"
}

function paymentMethodValue(value: unknown) {
  const text = optionalStringValue(value).toLowerCase().replace(/[_-]+/g, " ")
  if (!text) return ""
  if (text.includes("cash")) return "cash"
  if (text.includes("online")) return "online_banking"
  if (text.includes("bank") || text.includes("transfer") || text.includes("duitnow") || text.includes("fpx")) return "bank_transfer"
  if (text.includes("credit")) return "credit_card"
  if (text.includes("debit")) return "debit_card"
  if (text.includes("wallet") || text.includes("touch") || text.includes("tng") || text.includes("grabpay") || text.includes("boost")) return "e_wallet"
  if (text.includes("cheque") || text.includes("check")) return "cheque"
  if (text.includes("card")) return "credit_card"
  return "other"
}

function dateValue(value: unknown, fallback = "") {
  const text = optionalStringValue(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function statementDateValue(value: string) {
  const trimmed = value.trim()
  const numeric = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (numeric) {
    const year = numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]
    return `${year}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`
  }

  const named = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/)
  if (!named) return ""
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(named[2].slice(0, 3).toLowerCase()) + 1
  return month > 0 ? `${named[3]}-${String(month).padStart(2, "0")}-${named[1].padStart(2, "0")}` : ""
}

function statementDateWithDefaultYear(value: string, fallbackYear: string) {
  const fullDate = statementDateValue(value)
  if (fullDate) return fullDate
  const partial = value.trim().match(/^(\d{1,2})[/-](\d{1,2})$/)
  return partial && fallbackYear ? `${fallbackYear}-${partial[2].padStart(2, "0")}-${partial[1].padStart(2, "0")}` : ""
}

function moneyValue(value: string) {
  const normalized = value.replace(/,/g, "").replace(/^RM\s*/i, "")
  const number = Number.parseFloat(normalized)
  return Number.isFinite(number) ? number : 0
}

function statementYearFromText(rawText: string) {
  const statementDate = rawText.match(/Statement Date\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i)
    ?? rawText.match(/Tarikh Penyata[\s\S]{0,80}?(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i)
  const parsed = statementDate?.[1] ? statementDateValue(statementDate[1]) : ""
  return parsed.slice(0, 4) || new Date().getFullYear().toString()
}

function isBalanceLine(value: string) {
  return /\b(balance\s+(?:from last statement|b\/f|c\/f)|closing balance)\b/i.test(value)
}

function isBankStatementBoilerplate(value: string) {
  return /\b(?:penyata ini dicetak|computer generated statement|no signature is required|tandatangan tidak diperlukan)\b/i.test(value)
    || /\b(?:public bank berhad|public bank|ipoh main office|jln dato maharajalela|perak darul ridzuan)\b/i.test(value)
    || /\b(?:nombor akaun|account number|tarikh penyata|statement date|muka surat|page no\.?|tel:|fax:)\b/i.test(value)
    || /\b(?:pendeposit|depositor)\b/i.test(value)
    || /\b(?:baki harian|daily and closing balances|terima kasih|thank you for banking|privacy notice|notis privasi|perhatian|attention|anti-bribery|anti-corruption|anti-rasuah|anti-sogokan)\b/i.test(value)
}

function looksLikeStatementProse(value: string) {
  const words = value.match(/[A-Za-z]{3,}/g) ?? []
  if (words.length < 6) return false
  const titleCaseWords = words.filter((word) => /^[A-Z][a-z]+$/.test(word)).length
  const lowerCaseWords = words.filter((word) => /^[a-z]+$/.test(word)).length
  const transactionTokens = value.match(/\b[A-Z0-9]{4,}\b/g) ?? []
  return transactionTokens.length === 0 && (value.includes(".") || titleCaseWords + lowerCaseWords >= 6)
}

function isLikelyBankTransactionContinuation(value: string) {
  if (isBankStatementBoilerplate(value) || isBalanceLine(value) || looksLikeStatementProse(value)) return false
  if (/\b(?:date|transaction|debit|credit|balance|tarikh|urus niaga)\b/i.test(value)) return false
  if (/^\d+\s*(?:\/\s*\d+)?$/.test(value)) return false
  const hasReferenceToken = /\b[A-Z0-9]{4,}\b/.test(value)
  const hasTransactionKeyword = /\b(?:invoice|inv|ref|date|fpx|duitnow|giro|jomp?ay|lhdn|hasil|epf|kwsp|socso|perkeso|bill|payment|pymt|transfer|tsfr|name|beneficiary|recipient)\b/i.test(value)
  return hasReferenceToken || hasTransactionKeyword
}

function cleanBankTransactionDescription(value: string) {
  const markers = [
    /\bBaki Harian\b/i,
    /\bDaily And Closing Balances\b/i,
    /\bTerima Kasih\b/i,
    /\bThank You For Banking\b/i,
    /\bPERHATIAN\s*\/\s*ATTENTION\b/i,
    /\bPenyata ini dicetak\b/i,
    /\bThis is a computer generated statement\b/i,
  ]
  const firstMarker = markers.reduce((position, marker) => {
    const match = value.match(marker)
    return match?.index === undefined ? position : Math.min(position, match.index)
  }, value.length)
  return value.slice(0, firstMarker).replace(/\s+/g, " ").trim()
}

function bankStatementTableHeader(value: string) {
  return /\b(?:tarikh\s+urus\s+niaga|date\s+transaction)\b/i.test(value)
}

function bankStatementEndMarker(value: string) {
  return /\b(?:closing balance|balance\s+c\/f)\b/i.test(value)
}

function hasTransactionContinuationIndent(value: string) {
  const leadingSpaces = value.match(/^\s*/)?.[0].length ?? 0
  return leadingSpaces >= 8
}

function directionFromTransaction(description: string, amountColumn: "left" | "right") {
  const lower = description.toLowerCase()
  if (/\b(?:dep|cr|credit)\b/.test(lower) || lower.includes("trsf cr")) return "in"
  if (/\b(?:dr|debit|giro pymt|jompay|fpx)\b/.test(lower) || lower.includes("trsf dr") || lower.includes("fund dr")) return "out"
  return amountColumn === "right" ? "in" : "out"
}

function bankAccountSuggestion(code: string) {
  const names: Record<string, string> = {
    "1010": "Cash / Bank",
    "1200": "Trade Receivables",
    "2000": "Accounts Payable",
    "2150": "Statutory Payables",
    "4000": "Sales Revenue",
    "5000": "Rent Expense",
    "5100": "Salary Expense",
    "5200": "Utilities Expense",
    "5300": "General Expenses",
    "5400": "Marketing Expense",
    "5500": "Software Subscriptions",
    "5600": "Cost of Goods Sold",
    "5800": "Meals and Entertainment",
    "5900": "Travel Expense",
    "5950": "Fuel and Transport Expense",
  }
  return { code, name: names[code] ?? "General Expenses" }
}

function inferBankTransactionAccounts(description: string, direction: "in" | "out") {
  const lower = description.toLowerCase()
  if (direction === "in") {
    const credit = /\b(?:interest|hibah)\b/.test(lower)
      ? bankAccountSuggestion("4000")
      : bankAccountSuggestion("1200")
    return {
      debit: bankAccountSuggestion("1010"),
      credit,
    }
  }

  const debit = /\b(?:lhdn|hasil|tax|sst|pcb|epf|kwsp|socso|perkeso|eis|sip)\b/.test(lower)
    ? bankAccountSuggestion("2150")
    : /\b(?:salary|payroll|wage|gaji)\b/.test(lower)
      ? bankAccountSuggestion("5100")
      : /\b(?:tnb|electric|electricity|water|telekom|internet|utility|utilities)\b/.test(lower)
        ? bankAccountSuggestion("5200")
        : /\b(?:rent|rental|lease)\b/.test(lower)
          ? bankAccountSuggestion("5000")
          : /\b(?:fuel|petrol|diesel|parking|toll|grab|taxi|transport|courier|logistic)\b/.test(lower)
            ? bankAccountSuggestion("5950")
            : /\b(?:meal|restaurant|cafe|coffee|food|entertainment)\b/.test(lower)
              ? bankAccountSuggestion("5800")
              : /\b(?:software|subscription|saas|cloud|hosting|domain)\b/.test(lower)
                ? bankAccountSuggestion("5500")
                : /\b(?:marketing|advertising|promotion|facebook|google ads)\b/.test(lower)
                  ? bankAccountSuggestion("5400")
                  : /\b(?:supplier|vendor|payable)\b/.test(lower)
                    ? bankAccountSuggestion("2000")
                    : bankAccountSuggestion("5300")
  return {
    debit,
    credit: bankAccountSuggestion("1010"),
  }
}

function inferBankTransactionsFromText(rawText: string): BankStatementTransaction[] | undefined {
  const lower = rawText.toLowerCase()
  const looksLikeStatement = lower.includes("bank statement")
    || lower.includes("statement of account")
    || lower.includes("penyata akaun")
    || lower.includes("account details and transaction history")
    || (lower.includes("debit") && lower.includes("credit") && lower.includes("balance"))
    || (lower.includes("money in") && lower.includes("money out") && lower.includes("balance"))
  if (!looksLikeStatement) return undefined

  const fallbackYear = statementYearFromText(rawText)
  let currentDate = ""
  let current: BankStatementTransaction | null = null
  const transactions: BankStatementTransaction[] = []
  let inTransactionTable = false

  function pushCurrent() {
    if (current && !isBalanceLine(current.description) && (current.moneyIn > 0 || current.moneyOut > 0)) {
      current.description = cleanBankTransactionDescription(current.description)
      if (current.description) transactions.push(current)
    }
    current = null
  }

  for (const rawLine of rawText.split(/\r?\n/)) {
    const hadPageBreak = rawLine.includes("\f")
    const line = hadPageBreak ? rawLine.slice(rawLine.lastIndexOf("\f") + 1) : rawLine
    if (hadPageBreak) {
      pushCurrent()
      inTransactionTable = false
    }

    const trimmedLine = line.trim()
    if (bankStatementTableHeader(trimmedLine)) {
      pushCurrent()
      inTransactionTable = true
      continue
    }

    if (!inTransactionTable) continue

    const dateMatch = line.match(/^\s*(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s+(.*)$/)
    const lineDate = dateMatch ? statementDateWithDefaultYear(dateMatch[1], fallbackYear) : ""
    if (lineDate) currentDate = lineDate

    const content = (dateMatch?.[2] ?? line).trim()
    if (!content || /^(date|transaction|debit|credit|balance|tarikh|urus niaga)$/i.test(content)) continue
    if (bankStatementEndMarker(content)) {
      pushCurrent()
      if (/closing balance/i.test(content)) inTransactionTable = false
      continue
    }
    if (isBankStatementBoilerplate(content)) {
      pushCurrent()
      inTransactionTable = false
      continue
    }

    const amountMatches = [...line.matchAll(/\b(?:RM\s*)?\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/g)]
    if (amountMatches.length >= 2 && currentDate) {
      pushCurrent()
      const transactionAmountMatch = amountMatches.at(-2)
      const balanceMatch = amountMatches.at(-1)
      const amount = moneyValue(transactionAmountMatch?.[0] ?? "0")
      const balance = moneyValue(balanceMatch?.[0] ?? "0")
      const beforeAmount = transactionAmountMatch?.index ?? line.length
      const description = line.slice(dateMatch ? (dateMatch.index ?? 0) + dateMatch[1].length : 0, beforeAmount).replace(/\s+/g, " ").trim()
      const amountColumn = beforeAmount > 100 ? "right" : "left"
      const direction = directionFromTransaction(description, amountColumn)
      const accounts = inferBankTransactionAccounts(description, direction)
      current = {
        date: currentDate,
        description,
        moneyIn: direction === "in" ? Number(amount.toFixed(2)) : 0,
        moneyOut: direction === "out" ? Number(amount.toFixed(2)) : 0,
        balance: Number(balance.toFixed(2)),
        debitAccountCode: accounts.debit.code,
        debitAccountName: accounts.debit.name,
        creditAccountCode: accounts.credit.code,
        creditAccountName: accounts.credit.name,
      }
      continue
    }

    if (current && !dateMatch && !amountMatches.length && hasTransactionContinuationIndent(line) && isLikelyBankTransactionContinuation(content)) {
      current.description = `${current.description} ${content}`.trim()
    }
  }
  pushCurrent()

  return transactions.length > 0 ? transactions : undefined
}

function normalizeAiFields(json: Record<string, unknown>): Partial<NormalizedDocumentFields> {
  const rawText = stringValue(json.rawText)
  const rawItems = Array.isArray(json.lineItems) ? json.lineItems : []
  const lineItems = rawItems.map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {}
    return {
      description: stringValue(record.description, "Document line"),
      quantity: numberValue(record.quantity, 1),
      unitPrice: numberValue(record.unitPrice),
      taxRate: numberValue(record.taxRate),
      taxAmount: numberValue(record.taxAmount),
      lineTotal: numberValue(record.lineTotal),
    }
  })
  let subtotal = numberValue(json.subtotal, lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))
  const otherCharges = numberValue(json.otherCharges, optionalNumberValue(json.serviceCharge) + optionalNumberValue(json.deliveryCharge) + optionalNumberValue(json.roundingAdjustment))
  const taxAmount = numberValue(json.taxAmount, lineItems.reduce((sum, item) => sum + item.taxAmount, 0))
  const totalAmount = numberValue(json.totalAmount, subtotal + otherCharges + taxAmount)
  const bankTransactions = normalizeBankTransactions(json.bankTransactions ?? json.transactions) ?? inferBankTransactionsFromText(rawText)
  const roundingDifference = Number((totalAmount - subtotal - otherCharges - taxAmount).toFixed(2))
  if (totalAmount > 0 && Math.abs(roundingDifference) > 0 && Math.abs(roundingDifference) <= 0.05) {
    subtotal = Number((totalAmount - otherCharges - taxAmount).toFixed(2))
    if (lineItems.length === 1) {
      lineItems[0] = {
        ...lineItems[0],
        unitPrice: subtotal,
        lineTotal: totalAmount,
      }
    }
  }

  return {
    documentDate: dateValue(json.documentDate, today()),
    dueDate: dateValue(json.dueDate),
    documentNumber: stringValue(json.documentNumber),
    currency: currencyValue(json.currency),
    vendorName: optionalStringValue(json.vendorName),
    clientName: optionalStringValue(json.clientName),
    taxId: optionalStringValue(json.taxId),
    subtotal: Number(subtotal.toFixed(2)),
    otherCharges: Number(otherCharges.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
    paymentMethod: paymentMethodValue(json.paymentMethod),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    bankTransactions,
    warnings: Array.isArray(json.warnings) ? json.warnings.map(String) : [],
  }
}

function normalizeBankTransactions(value: unknown): BankStatementTransaction[] | undefined {
  if (!Array.isArray(value)) return undefined
  const transactions = value.flatMap((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : null
    if (!record) return []
    const date = dateValue(record.date)
    const description = cleanBankTransactionDescription(optionalStringValue(record.description || record.transactionDetails || record.details))
    const moneyIn = numberValue(record.moneyIn ?? record.inflow ?? record.credit, 0)
    const moneyOut = numberValue(record.moneyOut ?? record.outflow ?? record.debit, 0)
    const balance = numberValue(record.balance, NaN)
    if (!date || !description || (moneyIn <= 0 && moneyOut <= 0)) return []
    const suggestedAccounts = inferBankTransactionAccounts(description, moneyIn > 0 ? "in" : "out")
    const debitAccountCode = optionalStringValue(record.debitAccountCode ?? record.debitAccount ?? record.debit_account_code) || suggestedAccounts.debit.code
    const creditAccountCode = optionalStringValue(record.creditAccountCode ?? record.creditAccount ?? record.credit_account_code) || suggestedAccounts.credit.code
    return [{
      date,
      description,
      reference: optionalStringValue(record.reference),
      moneyIn: Number(moneyIn.toFixed(2)),
      moneyOut: Number(moneyOut.toFixed(2)),
      balance: Number.isFinite(balance) ? Number(balance.toFixed(2)) : undefined,
      debitAccountCode,
      debitAccountName: optionalStringValue(record.debitAccountName ?? record.debit_account_name) || bankAccountSuggestion(debitAccountCode).name,
      creditAccountCode,
      creditAccountName: optionalStringValue(record.creditAccountName ?? record.credit_account_name) || bankAccountSuggestion(creditAccountCode).name,
    }]
  })
  return transactions.length > 0 ? transactions : undefined
}

async function extractWithGemmaEndpoint(input: { filePath: string; mimeType: string; originalFilename: string; pdfAnalysis?: Awaited<ReturnType<typeof analyzeLocalPdf>> }): Promise<OcrResult | null> {
  const env = getServerEnv()
  if (!env.aiBaseUrl) return null
  if (env.aiProvider !== "openai") {
    throw new Error(`Unsupported LLM_PROVIDER for OCR: ${env.aiProvider}.`)
  }

  const imageInputs = input.mimeType.startsWith("image/")
    ? [{ mimeType: input.mimeType, bytes: await fs.readFile(input.filePath) }]
    : input.mimeType === "application/pdf" && input.pdfAnalysis?.looksScanned
      ? await renderPdfPages({ filePath: input.filePath, maxPages: Math.min(input.pdfAnalysis.pageCount, 10) })
      : []
  if (imageInputs.length === 0) return null

  const endpoint = chatCompletionsUrl(env.aiBaseUrl)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (env.aiApiKey) headers.Authorization = `Bearer ${env.aiApiKey}`
  const likelyBankStatement = /bank|statement|cimb|maybank|public bank|rhb|hong leong|ambank|ocbc|uob/i.test(input.originalFilename)

  const prompt = [
    "You are an OCR and receipt/document extraction engine for an accounting system.",
    "Extract visible text and structured accounting fields from the supplied page image or images.",
    likelyBankStatement ? "This file is likely a bank statement. Prioritize extracting the transaction table rows." : "",
    "Return only one JSON object with these keys:",
    "rawText, documentDate, dueDate, documentNumber, currency, vendorName, clientName, taxId, subtotal, otherCharges, taxAmount, totalAmount, paymentMethod, lineItems, bankTransactions, warnings.",
    "For bank statements, keep rawText short and do not combine rows into one total.",
    "For bank statements, also return bankTransactions as an array of every table row with: date, description, reference, moneyIn, moneyOut, balance, debitAccountCode, debitAccountName, creditAccountCode, creditAccountName.",
    "For each bank statement row, choose debit and credit account codes from the chart pattern: 1010 Bank/Current Account, 1200 Accounts Receivable, 2000 Accounts Payable, 2150 Statutory Payables, 4000 Revenue, 5000 Rent Expense, 5100 Salary Expense, 5200 Utilities Expense, 5300 General Expenses, 5400 Marketing Expense, 5500 Software Subscriptions, 5600 Cost of Goods Sold, 5800 Meals and Entertainment, 5900 Travel Expense, 5950 Fuel and Transport Expense.",
    "For money-in rows, debit the bank account and credit receivables or revenue. For money-out rows, debit the specific expense/payable/statutory account and credit the bank account.",
    "For bank statements, use totalAmount 0 and lineItems [] unless the statement has one single transaction only.",
    likelyBankStatement ? "For this likely bank statement, return no prose and omit full-page raw text; focus on bankTransactions." : "",
    "For currency, return a 3-letter ISO code such as MYR, USD, SGD, CNY, EUR, GBP, JPY, AUD, THB, or IDR.",
    "For paymentMethod, choose one of: cash, bank_transfer, online_banking, credit_card, debit_card, e_wallet, cheque, other, or empty string when unpaid/unknown.",
    "Put service charge, delivery fee, rounding adjustment, and other non-tax charges in otherCharges.",
    "lineItems must contain description, quantity, unitPrice, taxRate, taxAmount, lineTotal.",
    "Use MYR when currency is unclear. Use YYYY-MM-DD dates. Use 0 for unknown numeric values.",
  ].filter(Boolean).join("\n")

  async function extractImages(images: typeof imageInputs, label: string) {
    const payload = await fetchAiJson(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: env.aiModel,
        temperature: 0,
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract accounting OCR data from ${label}.` },
              ...images.map((image) => ({
                type: "image_url",
                image_url: { url: `data:${image.mimeType};base64,${image.bytes.toString("base64")}`, detail: "high" },
              })),
            ],
          },
        ],
      }),
    }, likelyBankStatement ? env.aiBankOcrPageTimeoutMs : env.aiOcrTimeoutMs, { retries: 2 }) as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content ?? ""
    const json = extractJsonObject(content)
    if (!json) throw new Error("Gemma OCR endpoint did not return JSON.")
    return { rawText: stringValue(json.rawText, content), fields: normalizeAiFields(json) }
  }

  if (input.mimeType === "application/pdf" && imageInputs.length > 1) {
    const pageResults = []
    for (let index = 0; index < imageInputs.length; index += 1) {
      pageResults.push(await extractImages([imageInputs[index]], `${input.originalFilename} page ${index + 1}`))
    }
    const firstFields = pageResults[0]?.fields ?? {}
    const bankTransactions = pageResults.flatMap((result) => result.fields.bankTransactions ?? [])
    return {
      rawText: pageResults.map((result) => result.rawText).filter(Boolean).join("\n\n"),
      fields: {
        ...firstFields,
        bankTransactions: bankTransactions.length > 0 ? bankTransactions : firstFields.bankTransactions,
        lineItems: bankTransactions.length > 0 ? [] : firstFields.lineItems,
        totalAmount: bankTransactions.length > 0 ? 0 : firstFields.totalAmount,
      },
      confidence: 0.9,
      pageCount: imageInputs.length,
      engine: `gemma-endpoint:${env.aiModel}`,
    }
  }

  const result = await extractImages(imageInputs, input.originalFilename)
  return {
    rawText: result.rawText,
    fields: result.fields,
    confidence: 0.9,
    pageCount: input.mimeType === "application/pdf" ? imageInputs.length : undefined,
    engine: `gemma-endpoint:${env.aiModel}`,
  }
}

export class MockOcrAdapter implements OcrAdapter {
  async detectReceiptRegions(input: { filePath: string; mimeType: string; originalFilename: string }) {
    try {
      return await detectReceiptRegionsWithGemma(input)
    } catch (error) {
      // Detection must never prevent ordinary OCR when the vision endpoint is unavailable.
      console.error("Receipt split detection failed:", error)
      return []
    }
  }

  async extract(input: { filePath: string; mimeType: string; originalFilename: string }): Promise<OcrResult> {
    const env = getServerEnv()
    let aiWarning = !env.aiBaseUrl
      ? "AI OCR is not configured. Add URL, LLM_MODEL, LLM_PROVIDER, and BEARER_TOKEN to accounting system/.env.local, then restart the dev server."
      : undefined
    const pdfAnalysis = await analyzeLocalPdf(input)
    const fileText = await extractLocalText(input)
    if (input.mimeType === "application/pdf" && fileText.trim().length > 80) {
      return {
        rawText: fileText.trim(),
        confidence: 0.88,
        pageCount: pdfAnalysis?.pageCount ?? 1,
        engine: "local-pdf-text",
        fields: buildFallbackFields({ rawText: fileText.trim(), originalFilename: input.originalFilename }),
      }
    }

    const aiResult = await extractWithGemmaEndpoint({ ...input, pdfAnalysis }).catch((error) => {
      aiWarning = error instanceof Error ? `AI OCR failed: ${error.message}` : "AI OCR failed."
      console.error(error)
      return null
    })
    if (aiResult) return aiResult

    const baseName = path.basename(input.originalFilename, path.extname(input.originalFilename))
    if (input.mimeType === "application/pdf" && pdfAnalysis?.looksScanned && fileText.trim().length < 20) {
      const scannerNote = pdfAnalysis.hasCcittImages
        ? "This PDF is a scanned black-and-white image PDF. PDF page rendering was attempted; if OCR still failed, check that Poppler is installed in the running server container and the Gemma endpoint is reachable."
        : "This PDF appears to be scanned image pages. PDF page rendering was attempted; if OCR still failed, check that Poppler is installed in the running server container and the Gemma endpoint is reachable."
      aiWarning = [aiWarning, scannerNote].filter(Boolean).join(" ")
    }
    const rawText = [fileText.trim(), baseName.replace(/[-_]+/g, " ")].filter(Boolean).join("\n") || `Captured document ${input.originalFilename}`
    const fields = buildFallbackFields({ rawText: fileText.trim(), originalFilename: input.originalFilename, aiWarning })

    return {
      rawText,
      confidence: input.mimeType.startsWith("image/")
        ? 0.45
        : pdfAnalysis?.looksScanned && fileText.trim().length < 20
          ? 0.2
          : fileText.trim().length > 80
            ? 0.84
            : fileText.trim()
              ? 0.72
              : 0.4,
      pageCount: input.mimeType === "application/pdf" ? pdfAnalysis?.pageCount ?? 1 : undefined,
      engine: "mock-local-ocr",
      fields,
    }
  }
}

export const ocrAdapter = new MockOcrAdapter()
