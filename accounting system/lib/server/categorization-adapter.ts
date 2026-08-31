import "server-only"

import type { DocumentCategory, NormalizedDocumentFields } from "@/lib/accounting/document-types"
import { DOCUMENT_CATEGORIES } from "@/lib/accounting/document-types"
import type { JournalLine } from "@/lib/accounting/types"
import { getActiveRuleConfig } from "./accounting-rule-service"
import { chatCompletionsUrl, fetchAiJson } from "./ai-endpoint"
import { getServerEnv } from "./env"
import { query } from "./db"
import { currentCompanyId } from "./tenant-context"

export interface CategorizationResult {
  category: DocumentCategory
  confidence: number
  reason: string
  normalizedFields: NormalizedDocumentFields
  suggestedJournalLines: JournalLine[]
  rawOutput: Record<string, unknown>
  modelName: string
  modelVersion?: string
}

export interface CategorizationAdapter {
  categorize(input: {
    rawText: string
    extractedFields: Partial<NormalizedDocumentFields>
  }): Promise<CategorizationResult>
}

type CategoryDecision = Pick<CategorizationResult, "category" | "confidence" | "reason" | "rawOutput" | "modelName" | "modelVersion">
type TransferDirection = "incoming" | "outgoing" | null

function normalizeFields(fields: Partial<NormalizedDocumentFields>): NormalizedDocumentFields {
  const lineItems = fields.lineItems?.length
    ? fields.lineItems
    : [{ description: "Document line", quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, lineTotal: 0 }]
  const subtotal = Number(fields.subtotal ?? lineItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0).toFixed(2))
  const otherCharges = Number(fields.otherCharges ?? 0)
  const taxAmount = Number(fields.taxAmount ?? lineItems.reduce((sum, line) => sum + line.taxAmount, 0).toFixed(2))
  const totalAmount = Number(fields.totalAmount ?? (subtotal + otherCharges + taxAmount).toFixed(2))
  const bankTransactions = fields.bankTransactions ?? []

  return {
    documentDate: fields.documentDate || new Date().toISOString().slice(0, 10),
    dueDate: fields.dueDate || "",
    documentNumber: fields.documentNumber || "",
    currency: normalizeCurrency(fields.currency),
    vendorName: fields.vendorName || "",
    clientName: fields.clientName || "",
    taxId: fields.taxId || "",
    subtotal,
    otherCharges,
    taxAmount,
    totalAmount,
    paymentMethod: normalizePaymentMethod(fields.paymentMethod),
    lineItems,
    bankTransactions,
    warnings: fields.warnings ?? [],
  }
}

function normalizeCurrency(value: unknown) {
  const currency = String(value ?? "").trim().toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : "MYR"
}

function normalizePaymentMethod(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ")
  if (!text) return ""
  if (text.includes("cash")) return "cash"
  if (text.includes("online")) return "online_banking"
  if (text.includes("bank") || text.includes("transfer") || text.includes("duitnow") || text.includes("fpx")) return "bank_transfer"
  if (text.includes("credit")) return "credit_card"
  if (text.includes("debit")) return "debit_card"
  if (text.includes("wallet") || text.includes("touch") || text.includes("tng") || text.includes("grabpay") || text.includes("boost")) return "e_wallet"
  if (text.includes("cheque") || text.includes("check")) return "cheque"
  if (text.includes("card")) return "credit_card"
  if (text === "other") return "other"
  return "other"
}

function normalizeName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim()
}

function matchesOwnAlias(value: string, aliases: string[]) {
  const normalizedValue = normalizeName(value)
  return aliases.some((alias) => {
    const normalizedAlias = normalizeName(alias)
    return normalizedAlias.length >= 3 && normalizedValue.includes(normalizedAlias)
  })
}

function partyText(rawText: string, labels: string[]) {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const matches: string[] = []
  for (const line of lines) {
    const normalizedLine = normalizeName(line)
    for (const label of labels) {
      const normalizedLabel = normalizeName(label)
      if (normalizedLine.startsWith(normalizedLabel) || normalizedLine.includes(` ${normalizedLabel} `)) {
        matches.push(line)
      }
    }
  }
  return matches.join("\n")
}

function detectTransferDirection(rawText: string, ownAliases: string[]): TransferDirection {
  if (ownAliases.length === 0) return null
  const senderText = partyText(rawText, ["sender", "from", "payer", "paid by", "transfer from", "debited from", "account holder"])
  const receiverText = partyText(rawText, ["receiver", "recipient", "payee", "to", "transfer to", "credited to", "received by"])
  const senderIsOwn = matchesOwnAlias(senderText, ownAliases)
  const receiverIsOwn = matchesOwnAlias(receiverText, ownAliases)

  if (receiverIsOwn && !senderIsOwn) return "incoming"
  if (senderIsOwn && !receiverIsOwn) return "outgoing"
  return null
}

async function getCompanyOwnEntityNames() {
  const result = await query<{ name: string; legal_name: string | null; tax_id: string | null; ocr_own_names: string[] }>(
    `SELECT name, legal_name, tax_id, ocr_own_names
     FROM companies
     WHERE id = $1
     LIMIT 1`,
    [currentCompanyId()],
  )
  const company = result.rows[0]
  if (!company) return []
  return Array.from(new Set([
    company.name,
    company.legal_name ?? "",
    company.tax_id ?? "",
    ...(company.ocr_own_names ?? []),
  ].map((value) => value.trim()).filter(Boolean)))
}

function inferCategory(text: string, ownEntityNames: string[]): CategoryDecision {
  const lower = text.toLowerCase()
  const direction = detectTransferDirection(text, ownEntityNames)
  const looksLikeStatement = lower.includes("bank statement")
    || lower.includes("account details and transaction history")
    || lower.includes("cimb")
    || (lower.includes("money in") && lower.includes("money out") && lower.includes("balance"))
  const isSingleOutgoingTransfer = direction === "outgoing" || lower.includes("duitnow") || lower.includes("fund transfer") || lower.includes("transfer to") || lower.includes("transferred")
  const isIncomingTransfer = direction === "incoming" || lower.includes("received") || lower.includes("payment received") || lower.includes("credit advice") || lower.includes("receipt voucher")
  const decision = looksLikeStatement
    ? { category: "bank_document" as const, confidence: 0.82, reason: "Detected bank statement terms." }
    : isIncomingTransfer
      ? { category: "receipt_income" as const, confidence: 0.86, reason: "Detected money received terms." }
      : isSingleOutgoingTransfer
        ? { category: "receipt_expense" as const, confidence: 0.84, reason: "Detected a single outgoing bank or e-wallet transfer." }
        : lower.includes("petrol") || lower.includes("fuel")
          ? { category: "petrol" as const, confidence: 0.91, reason: "Detected petrol/fuel terms." }
          : lower.includes("entertain")
            ? { category: "entertainment" as const, confidence: 0.88, reason: "Detected entertainment terms." }
            : lower.includes("invoice")
              ? { category: "vendor_bill" as const, confidence: 0.78, reason: "Detected invoice terms; user should verify AP/AR direction." }
              : lower.includes("receipt")
                ? { category: "receipt_expense" as const, confidence: 0.82, reason: "Detected receipt terms." }
                : { category: "unknown" as const, confidence: 0.45, reason: "No confident category terms were detected." }
  return {
    ...decision,
    rawOutput: { adapter: "mock", inferred: decision, transferDirection: direction },
    modelName: "mock-gemma-4-adapter",
    modelVersion: "local-dev",
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

function categoryValue(value: unknown): DocumentCategory | null {
  return typeof value === "string" && (DOCUMENT_CATEGORIES as readonly string[]).includes(value) ? value as DocumentCategory : null
}

function numberValue(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? "").replace(/,/g, "").replace(/^RM\s*/i, ""))
  return Number.isFinite(number) ? number : fallback
}

function refineBankTransferCategory(decision: CategoryDecision, rawText: string, ownEntityNames: string[]): CategoryDecision {
  if (decision.category !== "bank_document" && decision.category !== "unknown") return decision
  const direction = detectTransferDirection(rawText, ownEntityNames)
  const lower = rawText.toLowerCase()
  const looksLikeStatement = lower.includes("bank statement")
    || lower.includes("opening balance")
    || lower.includes("closing balance")
    || lower.includes("account details and transaction history")
    || lower.includes("cimb")
    || (lower.includes("money in") && lower.includes("money out") && lower.includes("balance"))
  const incoming = direction === "incoming" || lower.includes("received") || lower.includes("payment received") || lower.includes("credit advice")
  const outgoing = direction === "outgoing" || lower.includes("duitnow") || lower.includes("fund transfer") || lower.includes("transfer to") || lower.includes("transferred")

  if (looksLikeStatement) {
    return {
      ...decision,
      category: "bank_document",
      confidence: Math.max(decision.confidence, 0.82),
      reason: `${decision.reason} Detected bank statement or transaction history terms.`,
      rawOutput: { ...decision.rawOutput, localBankStatementSignal: true },
    }
  }
  if (incoming) {
    return {
      ...decision,
      category: "receipt_income",
      confidence: Math.max(decision.confidence, 0.86),
      reason: `${decision.reason} Treated as incoming because receiver/payee matches your alias or receipt terms indicate money received.`,
      rawOutput: { ...decision.rawOutput, transferDirection: direction ?? "incoming-keyword" },
    }
  }
  if (outgoing) {
    return {
      ...decision,
      category: "receipt_expense",
      confidence: Math.max(decision.confidence, 0.84),
      reason: `${decision.reason} Treated as outgoing because sender/payer matches your alias or transfer terms indicate money paid.`,
      rawOutput: { ...decision.rawOutput, transferDirection: direction ?? "outgoing-keyword" },
    }
  }
  return decision
}

function firstKeywordMatch(text: string, groups: Array<{ accountId: string; keywords: string[] }>) {
  const lower = text.toLowerCase()
  return groups.find((group) => group.keywords.some((keyword) => lower.includes(keyword)))?.accountId
}

function expenseAccountFor(category: DocumentCategory, fields: NormalizedDocumentFields, rawText: string, fallbackAccountId: string) {
  const text = [
    rawText,
    fields.vendorName,
    fields.documentNumber,
    fields.paymentMethod,
    ...fields.lineItems.map((line) => line.description),
  ].filter(Boolean).join("\n")

  const categoryAccount: Partial<Record<DocumentCategory, string>> = {
    entertainment: "5800",
    travel: "5900",
    office_supplies: "5300",
    utilities: "5200",
    rent: "5000",
    salary: "5100",
    petrol: "5950",
    inventory_purchase: "5600",
    delivery_document: "5950",
  }
  const byCategory = categoryAccount[category]
  if (byCategory) return byCategory

  return firstKeywordMatch(text, [
    { accountId: "5200", keywords: ["electric", "electricity", "utility", "utilities", "water bill", "air selangor", "tnb", "telekom", "internet", "wifi"] },
    { accountId: "5800", keywords: ["restaurant", "dining", "dinner", "lunch", "meal", "cafe", "coffee", "food", "entertainment"] },
    { accountId: "5950", keywords: ["petrol", "fuel", "diesel", "parking", "toll", "grab", "taxi", "transport", "delivery", "courier", "logistic"] },
    { accountId: "5500", keywords: ["software", "subscription", "saas", "cloud", "hosting", "domain"] },
    { accountId: "5400", keywords: ["marketing", "advertising", "facebook ads", "google ads", "promotion"] },
    { accountId: "5000", keywords: ["rent", "rental", "lease"] },
    { accountId: "5100", keywords: ["salary", "wage", "payroll"] },
    { accountId: "5300", keywords: ["stationery", "office supply", "office supplies", "printer", "paper", "ink"] },
  ]) ?? fallbackAccountId
}

async function categorizeWithGemmaEndpoint(input: {
  rawText: string
  extractedFields: Partial<NormalizedDocumentFields>
}, ownEntityNames: string[]): Promise<CategoryDecision | null> {
  const env = getServerEnv()
  if (!env.aiBaseUrl) return null
  if (env.aiProvider !== "openai") {
    throw new Error(`Unsupported LLM_PROVIDER for categorization: ${env.aiProvider}.`)
  }
  const endpoint = chatCompletionsUrl(env.aiBaseUrl)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (env.aiApiKey) headers.Authorization = `Bearer ${env.aiApiKey}`

  const aliasHint = ownEntityNames.length > 0
    ? `Own company/person aliases for direction detection: ${ownEntityNames.join(", ")}. If receiver/payee matches these aliases, classify as receipt_income. If sender/payer/from matches these aliases, classify as receipt_expense.`
    : "If sender/receiver direction is unclear, prefer bank_document for bank records."
  const system = [
    "You categorize OCR accounting documents and receipts.",
    "Return only JSON with category, confidence, reason.",
    `category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}.`,
    aliasHint,
    "Use receipt_income when money is received, including customer payment receipts and bank credits.",
    "Use receipt_expense for a single outgoing bank transfer, DuitNow payment, e-wallet transfer, or paid expense record.",
    "Use bank_document only for multi-transaction bank statements or unclear bank documents that need user choice.",
    "Use petrol for fuel receipts and entertainment for meal/client entertainment receipts.",
    "Use receipt_expense for simple paid expense receipts such as restaurants, parking, office supplies, or delivery fees.",
    "Use unknown if the document is unclear.",
  ].join("\n")

  const payload = await fetchAiJson(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: env.aiModel,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: JSON.stringify({
            rawText: input.rawText,
            extractedFields: input.extractedFields,
          }),
        },
      ],
    }),
  }) as { choices?: Array<{ message?: { content?: string } }> }
  const content = payload.choices?.[0]?.message?.content ?? ""
  const json = extractJsonObject(content)
  if (!json) throw new Error("Gemma categorization endpoint did not return JSON.")
  const category = categoryValue(json.category) ?? "unknown"
  return {
    category,
    confidence: Math.max(0, Math.min(1, numberValue(json.confidence, category === "unknown" ? 0.45 : 0.8))),
    reason: typeof json.reason === "string" ? json.reason : "Gemma categorization result.",
    rawOutput: json,
    modelName: `gemma-endpoint:${env.aiModel}`,
    modelVersion: env.aiModel,
  }
}

export class MockCategorizationAdapter implements CategorizationAdapter {
  async categorize(input: { rawText: string; extractedFields: Partial<NormalizedDocumentFields> }): Promise<CategorizationResult> {
    const fields = normalizeFields(input.extractedFields)
    const config = await getActiveRuleConfig()
    const ownEntityNames = await getCompanyOwnEntityNames()
    const inferred = refineBankTransferCategory(await categorizeWithGemmaEndpoint(input, ownEntityNames).catch((error) => {
      console.error(error)
      return null
    }) ?? inferCategory(`${input.rawText}\n${fields.documentNumber ?? ""}\n${fields.lineItems.map((line) => line.description).join(" ")}`, ownEntityNames), input.rawText, ownEntityNames)
    const category = fields.bankTransactions?.length ? "bank_document" : inferred.category
    const expenseDebit = Number(Math.max(0, fields.totalAmount - fields.taxAmount).toFixed(2))
    const suggestedJournalLines: JournalLine[] = buildSuggestedJournalLines(category, fields, config, expenseDebit, input.rawText)

    return {
      ...inferred,
      category,
      confidence: fields.bankTransactions?.length ? Math.max(inferred.confidence, 0.9) : inferred.confidence,
      normalizedFields: fields,
      suggestedJournalLines,
      rawOutput: inferred.rawOutput,
      modelName: inferred.modelName,
      modelVersion: inferred.modelVersion,
    }
  }
}

export const categorizationAdapter = new MockCategorizationAdapter()

function buildSuggestedJournalLines(category: DocumentCategory, fields: NormalizedDocumentFields, config: Awaited<ReturnType<typeof getActiveRuleConfig>>, expenseDebit: number, rawText: string) {
  if (category === "receipt_income" || category === "sales_invoice") {
    return [
      { accountId: config.cashAccountId, debit: fields.totalAmount, credit: 0 },
      { accountId: config.revenueAccountId, debit: 0, credit: expenseDebit },
      { accountId: config.taxPayableAccountId, debit: 0, credit: fields.taxAmount },
    ].filter((line) => line.debit > 0 || line.credit > 0)
  }

  if (category === "bank_document" || category === "unknown" || category === "tax_document") {
    return []
  }

  const payableAccountId = fields.paymentMethod ? config.cashAccountId : config.accountsPayableAccountId
  const expenseAccountId = expenseAccountFor(category, fields, rawText, config.expenseAccountId)
  return [
    { accountId: expenseAccountId, debit: expenseDebit, credit: 0 },
    { accountId: config.taxPayableAccountId, debit: fields.taxAmount, credit: 0 },
    { accountId: payableAccountId, debit: 0, credit: fields.totalAmount },
  ].filter((line) => line.debit > 0 || line.credit > 0)
}
