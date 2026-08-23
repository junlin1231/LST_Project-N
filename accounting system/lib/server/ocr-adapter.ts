import "server-only"

import fs from "node:fs/promises"
import path from "node:path"
import zlib from "node:zlib"
import type { NormalizedDocumentFields } from "@/lib/accounting/document-types"
import { chatCompletionsUrl, fetchAiJson } from "./ai-endpoint"
import { getServerEnv } from "./env"

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
    const buffer = await fs.readFile(input.filePath).catch(() => Buffer.alloc(0))
    return extractReadablePdfText(buffer)
  }
  if (input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const buffer = await fs.readFile(input.filePath).catch(() => Buffer.alloc(0))
    return buffer.toString("utf8").replace(/[^\x20-\x7E]+/g, " ").slice(0, 4000)
  }
  return ""
}

function buildFallbackFields(input: { rawText: string; originalFilename: string; aiWarning?: string }) {
  const baseName = path.basename(input.originalFilename, path.extname(input.originalFilename))
  const totalAmount = inferAmount(input.rawText)
  const subtotal = totalAmount > 0 ? Number((totalAmount / 1.06).toFixed(2)) : 0
  const taxAmount = totalAmount > 0 ? Number((totalAmount - subtotal).toFixed(2)) : 0
  const lower = input.rawText.toLowerCase()
  const description = lower.includes("petrol") ? "Petrol" : lower.includes("entertain") ? "Entertainment" : "Document line"
  const warnings = totalAmount > 0
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
    lineItems: totalAmount > 0
      ? [{ description, quantity: 1, unitPrice: subtotal, taxRate: 0.06, taxAmount, lineTotal: totalAmount }]
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

function numberValue(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(number) ? number : fallback
}

function optionalNumberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(number) ? number : 0
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function optionalStringValue(value: unknown, fallback = "") {
  const text = stringValue(value, fallback).trim()
  return text === "0" ? "" : text
}

function dateValue(value: unknown, fallback = "") {
  const text = optionalStringValue(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback
}

function normalizeAiFields(json: Record<string, unknown>): Partial<NormalizedDocumentFields> {
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
    currency: stringValue(json.currency, "MYR"),
    vendorName: optionalStringValue(json.vendorName),
    clientName: optionalStringValue(json.clientName),
    taxId: optionalStringValue(json.taxId),
    subtotal: Number(subtotal.toFixed(2)),
    otherCharges: Number(otherCharges.toFixed(2)),
    taxAmount: Number(taxAmount.toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
    paymentMethod: stringValue(json.paymentMethod),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    warnings: Array.isArray(json.warnings) ? json.warnings.map(String) : [],
  }
}

async function extractWithGemmaEndpoint(input: { filePath: string; mimeType: string; originalFilename: string }): Promise<OcrResult | null> {
  const env = getServerEnv()
  if (!env.aiBaseUrl || !input.mimeType.startsWith("image/")) return null
  if (env.aiProvider !== "openai") {
    throw new Error(`Unsupported LLM_PROVIDER for OCR: ${env.aiProvider}.`)
  }

  const bytes = await fs.readFile(input.filePath)
  const base64 = bytes.toString("base64")
  const endpoint = chatCompletionsUrl(env.aiBaseUrl)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (env.aiApiKey) headers.Authorization = `Bearer ${env.aiApiKey}`

  const prompt = [
    "You are an OCR and receipt/document extraction engine for an accounting system.",
    "Extract visible text and structured accounting fields from the image.",
    "Return only one JSON object with these keys:",
    "rawText, documentDate, dueDate, documentNumber, currency, vendorName, clientName, taxId, subtotal, otherCharges, taxAmount, totalAmount, paymentMethod, lineItems, warnings.",
    "Put service charge, delivery fee, rounding adjustment, and other non-tax charges in otherCharges.",
    "lineItems must contain description, quantity, unitPrice, taxRate, taxAmount, lineTotal.",
    "Use MYR when currency is unclear. Use YYYY-MM-DD dates. Use 0 for unknown numeric values.",
  ].join("\n")

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
            { type: "text", text: `Extract accounting OCR data from ${input.originalFilename}.` },
            { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${base64}`, detail: "high" } },
          ],
        },
      ],
    }),
  }, 120_000) as { choices?: Array<{ message?: { content?: string } }> }
  const content = payload.choices?.[0]?.message?.content ?? ""
  const json = extractJsonObject(content)
  if (!json) throw new Error("Gemma OCR endpoint did not return JSON.")

  const fields = normalizeAiFields(json)
  return {
    rawText: stringValue(json.rawText, content),
    fields,
    confidence: 0.9,
    engine: `gemma-endpoint:${env.aiModel}`,
  }
}

export class MockOcrAdapter implements OcrAdapter {
  async extract(input: { filePath: string; mimeType: string; originalFilename: string }): Promise<OcrResult> {
    const env = getServerEnv()
    let aiWarning = !env.aiBaseUrl
      ? "AI OCR is not configured. Add URL, LLM_MODEL, LLM_PROVIDER, and BEARER_TOKEN to accounting system/.env.local, then restart the dev server."
      : undefined
    const aiResult = await extractWithGemmaEndpoint(input).catch((error) => {
      aiWarning = error instanceof Error ? `AI OCR failed: ${error.message}` : "AI OCR failed."
      console.error(error)
      return null
    })
    if (aiResult) return aiResult

    const baseName = path.basename(input.originalFilename, path.extname(input.originalFilename))
    const fileText = await extractLocalText(input)
    const rawText = [fileText.trim(), baseName.replace(/[-_]+/g, " ")].filter(Boolean).join("\n") || `Captured document ${input.originalFilename}`
    const fields = buildFallbackFields({ rawText: fileText.trim(), originalFilename: input.originalFilename, aiWarning })

    return {
      rawText,
      confidence: input.mimeType.startsWith("image/") ? 0.45 : fileText.trim().length > 80 ? 0.84 : fileText.trim() ? 0.72 : 0.4,
      pageCount: input.mimeType === "application/pdf" ? 1 : undefined,
      engine: "mock-local-ocr",
      fields,
    }
  }
}

export const ocrAdapter = new MockOcrAdapter()
