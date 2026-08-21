import "server-only"

import type { DocumentCategory, NormalizedDocumentFields } from "@/lib/accounting/document-types"
import { DOCUMENT_CATEGORIES } from "@/lib/accounting/document-types"
import type { JournalLine } from "@/lib/accounting/types"
import { getActiveRuleConfig } from "./accounting-rule-service"
import { chatCompletionsUrl, fetchAiJson } from "./ai-endpoint"
import { getServerEnv } from "./env"

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

function normalizeFields(fields: Partial<NormalizedDocumentFields>): NormalizedDocumentFields {
  const lineItems = fields.lineItems?.length
    ? fields.lineItems
    : [{ description: "Document line", quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, lineTotal: 0 }]
  const subtotal = Number(fields.subtotal ?? lineItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0).toFixed(2))
  const taxAmount = Number(fields.taxAmount ?? lineItems.reduce((sum, line) => sum + line.taxAmount, 0).toFixed(2))
  const totalAmount = Number(fields.totalAmount ?? (subtotal + taxAmount).toFixed(2))

  return {
    documentDate: fields.documentDate || new Date().toISOString().slice(0, 10),
    dueDate: fields.dueDate || "",
    documentNumber: fields.documentNumber || "",
    currency: fields.currency || "MYR",
    vendorName: fields.vendorName || "",
    clientName: fields.clientName || "",
    taxId: fields.taxId || "",
    subtotal,
    taxAmount,
    totalAmount,
    paymentMethod: fields.paymentMethod || "",
    lineItems,
    warnings: fields.warnings ?? [],
  }
}

function inferCategory(text: string): CategoryDecision {
  const lower = text.toLowerCase()
  const decision = lower.includes("petrol") || lower.includes("fuel")
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
    rawOutput: { adapter: "mock", inferred: decision },
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
  const number = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(number) ? number : fallback
}

async function categorizeWithGemmaEndpoint(input: {
  rawText: string
  extractedFields: Partial<NormalizedDocumentFields>
}): Promise<CategoryDecision | null> {
  const env = getServerEnv()
  if (!env.aiBaseUrl) return null
  if (env.aiProvider !== "openai") {
    throw new Error(`Unsupported LLM_PROVIDER for categorization: ${env.aiProvider}.`)
  }
  const endpoint = chatCompletionsUrl(env.aiBaseUrl)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (env.aiApiKey) headers.Authorization = `Bearer ${env.aiApiKey}`

  const system = [
    "You categorize OCR accounting documents and receipts.",
    "Return only JSON with category, confidence, reason.",
    `category must be one of: ${DOCUMENT_CATEGORIES.join(", ")}.`,
    "Use petrol for fuel receipts and entertainment for meal/client entertainment receipts.",
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
    const inferred = await categorizeWithGemmaEndpoint(input).catch((error) => {
      console.error(error)
      return null
    }) ?? inferCategory(`${input.rawText}\n${fields.documentNumber ?? ""}\n${fields.lineItems.map((line) => line.description).join(" ")}`)
    const payableAccountId = fields.paymentMethod ? config.cashAccountId : config.accountsPayableAccountId
    const expenseDebit = Number(Math.max(0, fields.totalAmount - fields.taxAmount).toFixed(2))
    const suggestedJournalLines: JournalLine[] = [
      { accountId: config.expenseAccountId, debit: expenseDebit, credit: 0 },
      { accountId: config.taxPayableAccountId, debit: fields.taxAmount, credit: 0 },
      { accountId: payableAccountId, debit: 0, credit: fields.totalAmount },
    ].filter((line) => line.debit > 0 || line.credit > 0)

    return {
      ...inferred,
      normalizedFields: fields,
      suggestedJournalLines,
      rawOutput: inferred.rawOutput,
      modelName: inferred.modelName,
      modelVersion: inferred.modelVersion,
    }
  }
}

export const categorizationAdapter = new MockCategorizationAdapter()
