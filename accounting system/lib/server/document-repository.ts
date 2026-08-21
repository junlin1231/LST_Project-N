import "server-only"

import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type {
  DocumentAccountingDraft,
  DocumentCategory,
  DocumentCategoryResult,
  DocumentExtraction,
  DocumentProcessingStatus,
  DocumentSourceChannel,
  NormalizedDocumentFields,
  OcrDocument,
  OcrDocumentDetail,
  PostingConfirmation,
  PostingConfirmationStatus,
} from "@/lib/accounting/document-types"
import { DOCUMENT_CATEGORIES } from "@/lib/accounting/document-types"
import type { JournalEntry, JournalLine } from "@/lib/accounting/types"
import { isJournalEntryBalanced } from "@/lib/accounting/calculations"
import { postExpenseDocumentByRule } from "./accounting-rule-service"
import { DEFAULT_COMPANY_ID, DEFAULT_USER_ID } from "./accounting-repository"
import { ensureDatabaseReady, query, transaction, type DbExecutor } from "./db"
import { categorizationAdapter } from "./categorization-adapter"
import { ocrAdapter } from "./ocr-adapter"

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
])
const ALLOWED_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"])
const HIGH_CONFIDENCE = 0.85

interface DocumentRow {
  id: string
  original_filename: string
  storage_path: string
  mime_type: string
  file_size_bytes: string
  sha256_hash: string
  processing_status: DocumentProcessingStatus
  review_status: PostingConfirmationStatus
  source_channel: DocumentSourceChannel
  uploaded_at: string
  updated_at: string
}

interface ExtractionRow {
  raw_text: string
  extracted_fields: Partial<NormalizedDocumentFields>
  ocr_engine: string
  ocr_confidence: string | null
  status: "completed" | "failed"
  error_message: string | null
  created_at: string
}

interface CategoryRow {
  category: DocumentCategory
  confidence: string
  reason: string
  model_name: string
  model_version: string | null
  raw_output: Record<string, unknown>
  requires_review: boolean
  created_at: string
}

interface DraftRow {
  id: string
  draft_type: DocumentCategory
  normalized_fields: NormalizedDocumentFields
  suggested_journal_lines: JournalLine[]
  status: DocumentAccountingDraft["status"]
  journal_entry_id: string | null
  created_at: string
  updated_at: string
}

interface ConfirmationRow {
  id: string
  status: PostingConfirmationStatus
  decision_reason: string | null
  preview_snapshot: Record<string, unknown>
  decided_at: string | null
  created_at: string
}

function storageRoot() {
  return path.resolve(process.cwd(), "..", "ocr", "scanned_docs")
}

function safeFilename(filename: string) {
  const ext = path.extname(filename).toLowerCase()
  const base = path.basename(filename, ext).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return `${base || "document"}${ext}`
}

function assertSourceChannel(value: unknown): DocumentSourceChannel {
  if (value === "web_upload" || value === "camera_capture") return value
  throw new Error("source_channel must be web_upload or camera_capture.")
}

function assertUpload(filename: string, mimeType: string, size: number) {
  const ext = path.extname(filename).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error("Unsupported document extension.")
  if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error("Unsupported document MIME type.")
  if (!Number.isFinite(size) || size <= 0) throw new Error("Document file is empty.")
  if (size > MAX_FILE_SIZE_BYTES) throw new Error("Document file exceeds the 20 MB limit.")
}

function mapDocument(row: DocumentRow): OcrDocument {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    processingStatus: row.processing_status,
    reviewStatus: row.review_status,
    sourceChannel: row.source_channel,
    uploadedAt: new Date(row.uploaded_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function mapExtraction(row?: ExtractionRow): DocumentExtraction | undefined {
  if (!row) return undefined
  return {
    rawText: row.raw_text,
    extractedFields: row.extracted_fields ?? {},
    ocrEngine: row.ocr_engine,
    ocrConfidence: row.ocr_confidence === null ? undefined : Number(row.ocr_confidence),
    status: row.status,
    errorMessage: row.error_message ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

function mapCategory(row?: CategoryRow): DocumentCategoryResult | undefined {
  if (!row) return undefined
  return {
    category: row.category,
    confidence: Number(row.confidence),
    reason: row.reason,
    modelName: row.model_name,
    modelVersion: row.model_version ?? undefined,
    rawOutput: row.raw_output ?? {},
    requiresReview: row.requires_review,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

function mapDraft(row?: DraftRow): DocumentAccountingDraft | undefined {
  if (!row) return undefined
  return {
    id: row.id,
    draftType: row.draft_type,
    normalizedFields: row.normalized_fields,
    suggestedJournalLines: row.suggested_journal_lines ?? [],
    status: row.status,
    journalEntryId: row.journal_entry_id ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

function mapConfirmation(row?: ConfirmationRow): PostingConfirmation | undefined {
  if (!row) return undefined
  return {
    id: row.id,
    status: row.status,
    decisionReason: row.decision_reason ?? undefined,
    previewSnapshot: row.preview_snapshot ?? {},
    decidedAt: row.decided_at ? new Date(row.decided_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

async function exec(db: DbExecutor, sql: string, values?: unknown[]) {
  return db.query(sql, values)
}

async function ensureDemoCompany() {
  await ensureDatabaseReady()
  await transaction(async (client) => {
    await exec(client, "INSERT INTO companies (id, name, base_currency) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [
      DEFAULT_COMPANY_ID,
      "Demo Company",
      "MYR",
    ])
    await exec(client, "INSERT INTO users (id, company_id, name, email, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING", [
      DEFAULT_USER_ID,
      DEFAULT_COMPANY_ID,
      "Demo Admin",
      "admin@example.com",
      "admin",
    ])
  })
}

async function updateDocumentStatus(db: DbExecutor, id: string, processingStatus: DocumentProcessingStatus, reviewStatus?: PostingConfirmationStatus) {
  await exec(
    db,
    `UPDATE documents
     SET processing_status = $1, review_status = COALESCE($2, review_status), updated_at = NOW()
     WHERE id = $3 AND company_id = $4`,
    [processingStatus, reviewStatus ?? null, id, DEFAULT_COMPANY_ID],
  )
}

export async function createDocumentUpload(input: {
  filename: string
  mimeType: string
  bytes: Buffer
  sourceChannel: DocumentSourceChannel
}) {
  await ensureDemoCompany()
  assertSourceChannel(input.sourceChannel)
  assertUpload(input.filename, input.mimeType, input.bytes.byteLength)

  const hash = createHash("sha256").update(input.bytes).digest("hex")
  const duplicate = await query<DocumentRow>(
    `SELECT id, original_filename, storage_path, mime_type, file_size_bytes::text, sha256_hash, processing_status, review_status, source_channel, uploaded_at, updated_at
     FROM documents
     WHERE company_id = $1 AND sha256_hash = $2`,
    [DEFAULT_COMPANY_ID, hash],
  )
  if (duplicate.rows[0]) return getDocumentDetail(duplicate.rows[0].id)

  const id = `doc-${randomUUID()}`
  const companyDir = path.join(storageRoot(), DEFAULT_COMPANY_ID)
  await fs.mkdir(companyDir, { recursive: true })
  const filename = `${id}-${safeFilename(input.filename)}`
  const storagePath = path.join(companyDir, filename)
  await fs.writeFile(storagePath, input.bytes)

  await query(
    `INSERT INTO documents (
      id, company_id, uploaded_by, original_filename, storage_path, mime_type, file_size_bytes, sha256_hash,
      processing_status, review_status, source_channel
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'stored', 'pending', $9)`,
    [id, DEFAULT_COMPANY_ID, DEFAULT_USER_ID, input.filename, storagePath, input.mimeType, input.bytes.byteLength, hash, input.sourceChannel],
  )

  return getDocumentDetail(id)
}

export async function listDocuments(): Promise<OcrDocument[]> {
  await ensureDemoCompany()
  const result = await query<DocumentRow>(
    `SELECT id, original_filename, storage_path, mime_type, file_size_bytes::text, sha256_hash, processing_status, review_status, source_channel, uploaded_at, updated_at
     FROM documents
     WHERE company_id = $1
     ORDER BY uploaded_at DESC`,
    [DEFAULT_COMPANY_ID],
  )
  return result.rows.map(mapDocument)
}

async function getDocumentRow(id: string) {
  const result = await query<DocumentRow>(
    `SELECT id, original_filename, storage_path, mime_type, file_size_bytes::text, sha256_hash, processing_status, review_status, source_channel, uploaded_at, updated_at
     FROM documents
     WHERE company_id = $1 AND id = $2`,
    [DEFAULT_COMPANY_ID, id],
  )
  return result.rows[0]
}

export async function getDocumentDetail(id: string): Promise<OcrDocumentDetail> {
  await ensureDemoCompany()
  const row = await getDocumentRow(id)
  if (!row) throw new Error("Document was not found.")
  const [extraction, category, draft, confirmation] = await Promise.all([
    query<ExtractionRow>(
      `SELECT raw_text, extracted_fields, ocr_engine, ocr_confidence::text, status, error_message, created_at
       FROM document_extractions WHERE company_id = $1 AND document_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [DEFAULT_COMPANY_ID, id],
    ),
    query<CategoryRow>(
      `SELECT category, confidence::text, reason, model_name, model_version, raw_output, requires_review, created_at
       FROM document_categories WHERE company_id = $1 AND document_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [DEFAULT_COMPANY_ID, id],
    ),
    query<DraftRow>(
      `SELECT id, draft_type, normalized_fields, suggested_journal_lines, status, journal_entry_id, created_at, updated_at
       FROM document_accounting_drafts WHERE company_id = $1 AND document_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [DEFAULT_COMPANY_ID, id],
    ),
    query<ConfirmationRow>(
      `SELECT id, status, decision_reason, preview_snapshot, decided_at, created_at
       FROM posting_confirmations WHERE company_id = $1 AND document_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [DEFAULT_COMPANY_ID, id],
    ),
  ])

  return {
    ...mapDocument(row),
    extraction: mapExtraction(extraction.rows[0]),
    categoryResult: mapCategory(category.rows[0]),
    draft: mapDraft(draft.rows[0]),
    confirmation: mapConfirmation(confirmation.rows[0]),
  }
}

export async function getDocumentFile(id: string) {
  await ensureDemoCompany()
  const row = await getDocumentRow(id)
  if (!row) throw new Error("Document was not found.")
  const root = storageRoot()
  const resolved = path.resolve(row.storage_path)
  if (!resolved.startsWith(root)) throw new Error("Document storage path is invalid.")
  return {
    filename: row.original_filename,
    mimeType: row.mime_type,
    bytes: await fs.readFile(resolved),
  }
}

function needsReview(ocrConfidence: number | undefined, categoryConfidence: number, category: DocumentCategory, fields: NormalizedDocumentFields, lines: JournalLine[]) {
  const warnings = [...(fields.warnings ?? [])]
  if ((ocrConfidence ?? 0) < 0.8) warnings.push("OCR confidence is below 80%.")
  if (categoryConfidence < HIGH_CONFIDENCE) warnings.push("Category confidence is below 85%.")
  if (category === "unknown") warnings.push("Category is unknown.")
  if (!fields.documentDate) warnings.push("Document date is required.")
  if (!Number.isFinite(fields.totalAmount) || fields.totalAmount <= 0) warnings.push("Total amount must be greater than zero.")
  if (Math.abs(Number((fields.subtotal + fields.taxAmount - fields.totalAmount).toFixed(2))) > 0.02) warnings.push("Subtotal plus tax does not match total.")
  const journalEntry: JournalEntry = { id: "validation", date: fields.documentDate || new Date().toISOString().slice(0, 10), description: "Validation", lines }
  if (lines.length > 0 && !isJournalEntryBalanced(journalEntry)) warnings.push("Suggested journal entry is not balanced.")
  return Array.from(new Set(warnings))
}

export async function processDocument(id: string) {
  await ensureDemoCompany()
  const row = await getDocumentRow(id)
  if (!row) throw new Error("Document was not found.")

  try {
    await query("UPDATE documents SET processing_status = 'ocr_processing', updated_at = NOW() WHERE id = $1 AND company_id = $2", [id, DEFAULT_COMPANY_ID])
    const ocr = await ocrAdapter.extract({ filePath: row.storage_path, mimeType: row.mime_type, originalFilename: row.original_filename })
    const category = await categorizationAdapter.categorize({ rawText: ocr.rawText, extractedFields: ocr.fields })
    const warnings = needsReview(ocr.confidence, category.confidence, category.category, category.normalizedFields, category.suggestedJournalLines)
    const normalizedFields = { ...category.normalizedFields, warnings }
    const draftId = `draft-${randomUUID()}`
    const confirmationId = `confirm-${randomUUID()}`

    await transaction(async (client) => {
      await updateDocumentStatus(client, id, "needs_review", "pending")
      await exec(
        client,
        `INSERT INTO document_extractions (id, company_id, document_id, raw_text, extracted_fields, ocr_engine, ocr_confidence, status)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'completed')`,
        [`ocr-${randomUUID()}`, DEFAULT_COMPANY_ID, id, ocr.rawText, JSON.stringify(ocr.fields), ocr.engine, ocr.confidence ?? null],
      )
      await exec(
        client,
        `INSERT INTO document_categories (id, company_id, document_id, category, confidence, reason, model_name, model_version, raw_output, requires_review)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, TRUE)`,
        [`cat-${randomUUID()}`, DEFAULT_COMPANY_ID, id, category.category, category.confidence, category.reason, category.modelName, category.modelVersion ?? null, JSON.stringify(category.rawOutput)],
      )
      await exec(
        client,
        `INSERT INTO document_accounting_drafts (id, company_id, document_id, draft_type, normalized_fields, suggested_journal_lines, status)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'draft')`,
        [draftId, DEFAULT_COMPANY_ID, id, category.category, JSON.stringify(normalizedFields), JSON.stringify(category.suggestedJournalLines)],
      )
      await exec(
        client,
        `INSERT INTO posting_confirmations (id, company_id, document_id, draft_id, status, preview_snapshot)
         VALUES ($1, $2, $3, $4, 'pending', $5::jsonb)`,
        [confirmationId, DEFAULT_COMPANY_ID, id, draftId, JSON.stringify({ normalizedFields, suggestedJournalLines: category.suggestedJournalLines })],
      )
    })
  } catch (error) {
    await transaction(async (client) => {
      await updateDocumentStatus(client, id, "ocr_failed", "pending")
      await exec(
        client,
        `INSERT INTO document_extractions (id, company_id, document_id, raw_text, extracted_fields, ocr_engine, status, error_message)
         VALUES ($1, $2, $3, '', '{}'::jsonb, 'mock-local-ocr', 'failed', $4)`,
        [`ocr-${randomUUID()}`, DEFAULT_COMPANY_ID, id, error instanceof Error ? error.message : "OCR failed."],
      )
    })
    throw error
  }

  return getDocumentDetail(id)
}

function validateCategory(value: unknown): DocumentCategory {
  if (typeof value === "string" && (DOCUMENT_CATEGORIES as readonly string[]).includes(value)) return value as DocumentCategory
  throw new Error("Document category is not valid.")
}

function validateFields(input: NormalizedDocumentFields): NormalizedDocumentFields {
  const subtotal = Number(input.subtotal)
  const taxAmount = Number(input.taxAmount)
  const totalAmount = Number(input.totalAmount)
  const lineItems = (input.lineItems ?? []).map((line) => ({
    description: String(line.description ?? "").trim(),
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    taxRate: Number(line.taxRate),
    taxAmount: Number(line.taxAmount),
    lineTotal: Number(line.lineTotal),
  }))
  const warnings: string[] = []
  if (!input.documentDate) warnings.push("Document date is required.")
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) warnings.push("Total amount must be greater than zero.")
  if (lineItems.some((line) => !line.description)) warnings.push("Every line needs a description.")
  if (lineItems.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) warnings.push("Line quantity must be greater than zero.")
  if (lineItems.some((line) => !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) warnings.push("Line unit price must be zero or greater.")
  if (lineItems.some((line) => !Number.isFinite(line.taxRate) || line.taxRate < 0)) warnings.push("Tax rate must be zero or greater.")
  if (Math.abs(Number((subtotal + taxAmount - totalAmount).toFixed(2))) > 0.02) warnings.push("Subtotal plus tax does not match total.")

  return {
    documentDate: input.documentDate,
    dueDate: input.dueDate ?? "",
    documentNumber: input.documentNumber ?? "",
    currency: input.currency || "MYR",
    vendorName: input.vendorName ?? "",
    clientName: input.clientName ?? "",
    taxId: input.taxId ?? "",
    subtotal,
    taxAmount,
    totalAmount,
    paymentMethod: input.paymentMethod ?? "",
    lineItems,
    warnings: Array.from(new Set(warnings)),
  }
}

function validateJournalLines(lines: JournalLine[], date: string) {
  const normalized = lines.map((line) => ({ accountId: String(line.accountId), debit: Number(line.debit), credit: Number(line.credit) }))
  const entry: JournalEntry = { id: "validation", date, description: "Validation", lines: normalized }
  if (normalized.length > 0 && !isJournalEntryBalanced(entry)) throw new Error("Suggested journal lines must be balanced before saving.")
  return normalized
}

export async function updateDocumentDraft(id: string, input: { category: unknown; normalizedFields: NormalizedDocumentFields; suggestedJournalLines: JournalLine[] }) {
  await ensureDemoCompany()
  const category = validateCategory(input.category)
  const fields = validateFields(input.normalizedFields)
  const lines = validateJournalLines(input.suggestedJournalLines, fields.documentDate)
  const detail = await getDocumentDetail(id)
  if (!detail.draft) throw new Error("Document draft was not found.")

  await transaction(async (client) => {
    await exec(
      client,
      `UPDATE document_accounting_drafts
       SET draft_type = $1, normalized_fields = $2::jsonb, suggested_journal_lines = $3::jsonb, status = 'draft', updated_at = NOW()
       WHERE id = $4 AND company_id = $5`,
      [category, JSON.stringify(fields), JSON.stringify(lines), detail.draft?.id, DEFAULT_COMPANY_ID],
    )
    await exec(
      client,
      `UPDATE posting_confirmations
       SET status = 'edited', preview_snapshot = $1::jsonb
       WHERE document_id = $2 AND company_id = $3 AND status IN ('pending', 'edited')`,
      [JSON.stringify({ normalizedFields: fields, suggestedJournalLines: lines }), id, DEFAULT_COMPANY_ID],
    )
    await updateDocumentStatus(client, id, "needs_review", "edited")
  })
  return getDocumentDetail(id)
}

export async function confirmDocumentDraft(id: string, reason?: string) {
  await ensureDemoCompany()
  const detail = await getDocumentDetail(id)
  if (!detail.draft) throw new Error("Document draft was not found.")
  const fields = validateFields(detail.draft.normalizedFields)
  validateJournalLines(detail.draft.suggestedJournalLines, fields.documentDate)
  if (fields.warnings.length > 0) throw new Error(`Resolve warnings before confirming: ${fields.warnings.join(" ")}`)

  await transaction(async (client) => {
    await exec(client, "UPDATE document_accounting_drafts SET status = 'confirmed', updated_at = NOW() WHERE id = $1 AND company_id = $2", [detail.draft?.id, DEFAULT_COMPANY_ID])
    await exec(
      client,
      `UPDATE posting_confirmations
       SET status = 'confirmed', confirmed_by = $1, decision_reason = $2, preview_snapshot = $3::jsonb, decided_at = NOW()
       WHERE document_id = $4 AND company_id = $5 AND status IN ('pending', 'edited', 'confirmed')`,
      [DEFAULT_USER_ID, reason?.trim() || null, JSON.stringify({ normalizedFields: fields, suggestedJournalLines: detail.draft?.suggestedJournalLines ?? [] }), id, DEFAULT_COMPANY_ID],
    )
    await updateDocumentStatus(client, id, "confirmed", "confirmed")
  })
  return getDocumentDetail(id)
}

export async function rejectDocument(id: string, reason: string) {
  await ensureDemoCompany()
  const detail = await getDocumentDetail(id)
  if (!detail.draft) throw new Error("Document draft was not found.")
  await transaction(async (client) => {
    await exec(client, "UPDATE document_accounting_drafts SET status = 'rejected', updated_at = NOW() WHERE id = $1 AND company_id = $2", [detail.draft?.id, DEFAULT_COMPANY_ID])
    await exec(
      client,
      `UPDATE posting_confirmations SET status = 'rejected', confirmed_by = $1, decision_reason = $2, decided_at = NOW()
       WHERE document_id = $3 AND company_id = $4`,
      [DEFAULT_USER_ID, reason.trim() || "Rejected before posting", id, DEFAULT_COMPANY_ID],
    )
    await updateDocumentStatus(client, id, "rejected", "rejected")
  })
  return getDocumentDetail(id)
}

export async function postConfirmedDocument(id: string) {
  await ensureDemoCompany()
  const detail = await getDocumentDetail(id)
  if (!detail.draft || detail.draft.status !== "confirmed") throw new Error("Confirm the document before posting.")
  const fields = detail.draft.normalizedFields
  if (detail.draft.draftType === "tax_document" || detail.draft.draftType === "bank_document" || detail.draft.draftType === "unknown") {
    throw new Error("This category requires manual accounting outside the OCR shortcut.")
  }

  await query("UPDATE documents SET processing_status = 'posting', updated_at = NOW() WHERE id = $1 AND company_id = $2", [id, DEFAULT_COMPANY_ID])
  try {
    const journalEntry = await postExpenseDocumentByRule({
      documentId: id,
      date: fields.documentDate,
      amount: fields.subtotal,
      taxRate: fields.subtotal > 0 ? Number(((fields.taxAmount / fields.subtotal) * 100).toFixed(4)) : 0,
      paidImmediately: !!fields.paymentMethod,
      vendorName: fields.vendorName,
      reference: fields.documentNumber,
      description: `OCR ${detail.draft.draftType}${fields.vendorName ? ` - ${fields.vendorName}` : ""}`,
      override: detail.draft.suggestedJournalLines.length > 0
        ? {
            lines: detail.draft.suggestedJournalLines,
            reason: "Posted from confirmed OCR draft.",
          }
        : undefined,
    })
    await transaction(async (client) => {
      await exec(client, "UPDATE document_accounting_drafts SET status = 'posted', journal_entry_id = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3", [
        journalEntry.id,
        detail.draft?.id,
        DEFAULT_COMPANY_ID,
      ])
      await exec(client, "UPDATE posting_confirmations SET status = 'posted' WHERE document_id = $1 AND company_id = $2", [id, DEFAULT_COMPANY_ID])
      await updateDocumentStatus(client, id, "posted", "posted")
    })
    return { detail: await getDocumentDetail(id), journalEntry }
  } catch (error) {
    await query("UPDATE documents SET processing_status = 'posting_failed', updated_at = NOW() WHERE id = $1 AND company_id = $2", [id, DEFAULT_COMPANY_ID])
    throw error
  }
}
