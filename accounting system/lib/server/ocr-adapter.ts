import "server-only"

import fs from "node:fs/promises"
import path from "node:path"
import type { NormalizedDocumentFields } from "@/lib/accounting/document-types"
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
  const snippets = Array.from(latin.matchAll(/\(([^()\x00-\x08\x0E-\x1F]{3,120})\)\s*Tj/g))
    .map((match) => match[1])
    .concat(Array.from(latin.matchAll(/\(([^()\x00-\x08\x0E-\x1F]{3,120})\)\s*TJ/g)).map((match) => match[1]))
    .map((value) => value.replace(/\\([()\\])/g, "$1").replace(/\\n/g, " ").trim())
    .filter(Boolean)
  return Array.from(new Set(snippets)).join("\n")
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

function buildFallbackFields(input: { rawText: string; originalFilename: string }) {
  const baseName = path.basename(input.originalFilename, path.extname(input.originalFilename))
  const totalAmount = inferAmount(input.rawText)
  const subtotal = totalAmount > 0 ? Number((totalAmount / 1.06).toFixed(2)) : 0
  const taxAmount = totalAmount > 0 ? Number((totalAmount - subtotal).toFixed(2)) : 0
  const lower = input.rawText.toLowerCase()
  const description = lower.includes("petrol") ? "Petrol" : lower.includes("entertain") ? "Entertainment" : "Document line"
  const warnings = totalAmount > 0
    ? []
    : ["Amount was not detected locally. Configure the Gemma endpoint or enter totals before posting."]

  return {
    documentDate: today(),
    documentNumber: baseName || input.originalFilename,
    currency: "MYR",
    vendorName: "",
    subtotal,
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

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
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
  const subtotal = numberValue(json.subtotal, lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))
  const taxAmount = numberValue(json.taxAmount, lineItems.reduce((sum, item) => sum + item.taxAmount, 0))
  const totalAmount = numberValue(json.totalAmount, subtotal + taxAmount)

  return {
    documentDate: stringValue(json.documentDate, today()),
    dueDate: stringValue(json.dueDate),
    documentNumber: stringValue(json.documentNumber),
    currency: stringValue(json.currency, "MYR"),
    vendorName: stringValue(json.vendorName),
    clientName: stringValue(json.clientName),
    taxId: stringValue(json.taxId),
    subtotal: Number(subtotal.toFixed(2)),
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
  const endpoint = new URL(env.aiBaseUrl.replace(/\/$/, "") + "/chat/completions")
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (env.aiApiKey) headers.Authorization = `Bearer ${env.aiApiKey}`

  const prompt = [
    "You are an OCR and receipt/document extraction engine for an accounting system.",
    "Extract visible text and structured accounting fields from the image.",
    "Return only one JSON object with these keys:",
    "rawText, documentDate, dueDate, documentNumber, currency, vendorName, clientName, taxId, subtotal, taxAmount, totalAmount, paymentMethod, lineItems, warnings.",
    "lineItems must contain description, quantity, unitPrice, taxRate, taxAmount, lineTotal.",
    "Use MYR when currency is unclear. Use YYYY-MM-DD dates. Use 0 for unknown numeric values.",
  ].join("\n")

  const response = await fetch(endpoint, {
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
  })

  if (!response.ok) {
    throw new Error(`Gemma OCR endpoint failed with HTTP ${response.status}.`)
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
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
    const aiResult = await extractWithGemmaEndpoint(input).catch((error) => {
      console.error(error)
      return null
    })
    if (aiResult) return aiResult

    const baseName = path.basename(input.originalFilename, path.extname(input.originalFilename))
    const fileText = await extractLocalText(input)
    const rawText = [fileText.trim(), baseName.replace(/[-_]+/g, " ")].filter(Boolean).join("\n") || `Captured document ${input.originalFilename}`
    const fields = buildFallbackFields({ rawText: fileText.trim(), originalFilename: input.originalFilename })

    return {
      rawText,
      confidence: input.mimeType.startsWith("image/") ? 0.45 : fileText.trim() ? 0.72 : 0.4,
      pageCount: input.mimeType === "application/pdf" ? 1 : undefined,
      engine: "mock-local-ocr",
      fields,
    }
  }
}

export const ocrAdapter = new MockOcrAdapter()
