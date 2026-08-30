import "server-only"

import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type {
  DocumentAccountingDraft,
  DocumentCategory,
  DocumentCategoryResult,
  DocumentExtraction,
  DocumentProcessingStatus,
  DocumentSourceChannel,
  BankStatementTransaction,
  NormalizedDocumentFields,
  OcrDocument,
  OcrDocumentDetail,
  PostingConfirmation,
  PostingConfirmationStatus,
} from "@/lib/accounting/document-types"
import { DOCUMENT_CATEGORIES } from "@/lib/accounting/document-types"
import type { JournalEntry, JournalLine } from "@/lib/accounting/types"
import { isJournalEntryBalanced } from "@/lib/accounting/calculations"
import { DEFAULT_COMPANY_ID, DEFAULT_USER_ID, insertJournalEntry } from "./accounting-repository"
import { ensureDatabaseReady, query, transaction, type DbExecutor } from "./db"
import { categorizationAdapter } from "./categorization-adapter"
import { ocrAdapter, type OcrResult } from "./ocr-adapter"
import { getActiveRuleConfig } from "./accounting-rule-service"
import { countPdfPages, splitPdfIntoPageImages } from "./pdf-splitter"
import { splitImageIntoReceipts, splitImageIntoVerticalSections } from "./receipt-splitter"
import { documentStorageRoot, resolveStoredDocumentPath } from "./document-storage"

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
  parent_document_id: string | null
  receipt_index: number | null
  child_document_count: string
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
    parentDocumentId: row.parent_document_id ?? undefined,
    receiptIndex: row.receipt_index ?? undefined,
    childDocumentCount: Number(row.child_document_count ?? 0),
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
  parentDocumentId?: string
  receiptIndex?: number
}) {
  await ensureDemoCompany()
  assertSourceChannel(input.sourceChannel)
  assertUpload(input.filename, input.mimeType, input.bytes.byteLength)

  const hash = createHash("sha256").update(input.bytes).digest("hex")
  const duplicate = await query<DocumentRow>(
    `SELECT id, original_filename, storage_path, mime_type, file_size_bytes::text, sha256_hash, parent_document_id, receipt_index, '0'::text AS child_document_count, processing_status, review_status, source_channel, uploaded_at, updated_at
     FROM documents
     WHERE company_id = $1 AND sha256_hash = $2`,
    [DEFAULT_COMPANY_ID, hash],
  )
  if (duplicate.rows[0]) return getDocumentDetail(duplicate.rows[0].id)

  const id = `doc-${randomUUID()}`
  const companyDir = path.join(documentStorageRoot(), DEFAULT_COMPANY_ID)
  await fs.mkdir(companyDir, { recursive: true })
  const filename = `${id}-${safeFilename(input.filename)}`
  const storagePath = path.join(companyDir, filename)
  await fs.writeFile(storagePath, input.bytes)

  await query(
    `INSERT INTO documents (
      id, company_id, uploaded_by, original_filename, storage_path, mime_type, file_size_bytes, sha256_hash,
      processing_status, review_status, source_channel, parent_document_id, receipt_index
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'stored', 'pending', $9, $10, $11)`,
    [id, DEFAULT_COMPANY_ID, DEFAULT_USER_ID, input.filename, storagePath, input.mimeType, input.bytes.byteLength, hash, input.sourceChannel, input.parentDocumentId ?? null, input.receiptIndex ?? null],
  )

  return getDocumentDetail(id)
}

export async function listDocuments(): Promise<OcrDocument[]> {
  await ensureDemoCompany()
  const result = await query<DocumentRow>(
    `SELECT d.id, d.original_filename, d.storage_path, d.mime_type, d.file_size_bytes::text, d.sha256_hash, d.parent_document_id, d.receipt_index,
       (SELECT COUNT(*)::text FROM documents child WHERE child.company_id = d.company_id AND child.parent_document_id = d.id) AS child_document_count,
       d.processing_status, d.review_status, d.source_channel, d.uploaded_at, d.updated_at
     FROM documents d
     WHERE d.company_id = $1
       -- Keep split-source uploads for audit and rescans, but show only their split children in the working list.
       AND (d.parent_document_id IS NOT NULL OR NOT EXISTS (
         SELECT 1 FROM documents child
         WHERE child.company_id = d.company_id AND child.parent_document_id = d.id
       ))
     ORDER BY d.uploaded_at DESC`,
    [DEFAULT_COMPANY_ID],
  )
  return result.rows.map(mapDocument)
}

async function getDocumentRow(id: string) {
  const result = await query<DocumentRow>(
    `SELECT d.id, d.original_filename, d.storage_path, d.mime_type, d.file_size_bytes::text, d.sha256_hash, d.parent_document_id, d.receipt_index,
       (SELECT COUNT(*)::text FROM documents child WHERE child.company_id = d.company_id AND child.parent_document_id = d.id) AS child_document_count,
       d.processing_status, d.review_status, d.source_channel, d.uploaded_at, d.updated_at
     FROM documents d
     WHERE d.company_id = $1 AND d.id = $2`,
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
  const resolved = resolveStoredDocumentPath(row.storage_path)
  return {
    filename: row.original_filename,
    mimeType: row.mime_type,
    bytes: await fs.readFile(resolved),
  }
}

export async function deleteUnpostedDocument(id: string) {
  await ensureDemoCompany()
  const row = await getDocumentRow(id)
  if (!row) throw new Error("Document was not found.")
  if (row.processing_status === "ocr_processing" || row.processing_status === "posting") {
    throw new Error("Wait for the current document action to finish before deleting.")
  }
  if (row.processing_status === "posted" || row.review_status === "posted") {
    throw new Error("Posted documents cannot be deleted from OCR storage.")
  }

  const postedDraft = await query<{ id: string }>(
    `SELECT id
     FROM document_accounting_drafts
     WHERE company_id = $1 AND document_id = $2 AND (status = 'posted' OR journal_entry_id IS NOT NULL)
     LIMIT 1`,
    [DEFAULT_COMPANY_ID, id],
  )
  if (postedDraft.rows[0]) throw new Error("Documents with posted journal entries cannot be deleted.")

  const resolved = resolveStoredDocumentPath(row.storage_path)

  await transaction(async (client) => {
    await exec(client, "DELETE FROM documents WHERE id = $1 AND company_id = $2", [id, DEFAULT_COMPANY_ID])
  })
  await fs.unlink(resolved).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error
  })

  return { id, deleted: true }
}

function needsReview(ocrConfidence: number | undefined, categoryConfidence: number, category: DocumentCategory, fields: NormalizedDocumentFields, lines: JournalLine[]) {
  const warnings = [...(fields.warnings ?? [])]
  const otherCharges = Number(fields.otherCharges ?? 0)
  if ((ocrConfidence ?? 0) < 0.8) warnings.push("OCR confidence is below 80%.")
  if (categoryConfidence < HIGH_CONFIDENCE) warnings.push("Category confidence is below 85%.")
  if (category === "unknown") warnings.push("Category is unknown.")
  if (!fields.documentDate) warnings.push("Document date is required.")
  if (category !== "bank_document" && (!Number.isFinite(fields.totalAmount) || fields.totalAmount <= 0)) warnings.push("Total amount must be greater than zero.")
  if (Math.abs(Number((fields.subtotal + otherCharges + fields.taxAmount - fields.totalAmount).toFixed(2))) > 0.02) warnings.push("Subtotal plus charges plus tax does not match total.")
  const journalEntry: JournalEntry = { id: "validation", date: fields.documentDate || new Date().toISOString().slice(0, 10), description: "Validation", lines }
  if (lines.length > 0 && !isJournalEntryBalanced(journalEntry)) warnings.push("Suggested journal entry is not balanced.")
  return Array.from(new Set(warnings))
}

function looksLikeBankStatementOcr(ocr: OcrResult, originalFilename: string) {
  const text = `${originalFilename}\n${ocr.rawText}`.toLowerCase()
  return !!ocr.fields.bankTransactions?.length
    || text.includes("bank statement")
    || text.includes("account details and transaction history")
    || text.includes("cimb")
    || text.includes("cimbclicks")
    || text.includes("cimb clicks")
    || (text.includes("money in") && text.includes("money out") && text.includes("balance"))
}

function looksLikeBankStatementFilename(filename: string) {
  return /\b(bank|statement|cimb|maybank|rhb|ambank|ocbc|uob)\b/i.test(filename)
    || /public[-_\s]*bank/i.test(filename)
    || /hong[-_\s]*leong/i.test(filename)
}

async function storeOcrDraftForDocument(row: DocumentRow, ocr: OcrResult) {
  const category = await categorizationAdapter.categorize({ rawText: ocr.rawText, extractedFields: ocr.fields })
  const warnings = needsReview(ocr.confidence, category.confidence, category.category, category.normalizedFields, category.suggestedJournalLines)
  const normalizedFields = { ...category.normalizedFields, warnings }
  const draftId = `draft-${randomUUID()}`
  const confirmationId = `confirm-${randomUUID()}`

  await transaction(async (client) => {
    await updateDocumentStatus(client, row.id, "needs_review", "pending")
    await exec(
      client,
      `INSERT INTO document_extractions (id, company_id, document_id, raw_text, extracted_fields, ocr_engine, ocr_confidence, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'completed')`,
      [`ocr-${randomUUID()}`, DEFAULT_COMPANY_ID, row.id, ocr.rawText, JSON.stringify(ocr.fields), ocr.engine, ocr.confidence ?? null],
    )
    await exec(
      client,
      `INSERT INTO document_categories (id, company_id, document_id, category, confidence, reason, model_name, model_version, raw_output, requires_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, TRUE)`,
      [`cat-${randomUUID()}`, DEFAULT_COMPANY_ID, row.id, category.category, category.confidence, category.reason, category.modelName, category.modelVersion ?? null, JSON.stringify(category.rawOutput)],
    )
    await exec(
      client,
      `INSERT INTO document_accounting_drafts (id, company_id, document_id, draft_type, normalized_fields, suggested_journal_lines, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'draft')`,
      [draftId, DEFAULT_COMPANY_ID, row.id, category.category, JSON.stringify(normalizedFields), JSON.stringify(category.suggestedJournalLines)],
    )
    await exec(
      client,
      `INSERT INTO posting_confirmations (id, company_id, document_id, draft_id, status, preview_snapshot)
       VALUES ($1, $2, $3, $4, 'pending', $5::jsonb)`,
      [confirmationId, DEFAULT_COMPANY_ID, row.id, draftId, JSON.stringify({ normalizedFields, suggestedJournalLines: category.suggestedJournalLines })],
    )
  })
}

async function processOneDocument(id: string) {
  const row = await getDocumentRow(id)
  if (!row) throw new Error("Document was not found.")
  try {
    await query("UPDATE documents SET processing_status = 'ocr_processing', updated_at = NOW() WHERE id = $1 AND company_id = $2", [id, DEFAULT_COMPANY_ID])
    const ocr = await ocrAdapter.extract({ filePath: resolveStoredDocumentPath(row.storage_path), mimeType: row.mime_type, originalFilename: row.original_filename })
    await storeOcrDraftForDocument(row, ocr)
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

interface ChildDocumentRow {
  id: string
  storage_path: string
  processing_status: DocumentProcessingStatus
  review_status: PostingConfirmationStatus
}

async function childDocumentRows(parentDocumentId: string) {
  const result = await query<ChildDocumentRow>(
    `SELECT id, storage_path, processing_status, review_status
     FROM documents
     WHERE company_id = $1 AND parent_document_id = $2
     ORDER BY receipt_index ASC, uploaded_at ASC`,
    [DEFAULT_COMPANY_ID, parentDocumentId],
  )
  return result.rows
}

async function deleteUnpostedChildDocuments(parentDocumentId: string, children: ChildDocumentRow[]) {
  const posted = children.filter((child) => child.processing_status === "posted" || child.review_status === "posted")
  if (posted.length > 0) {
    throw new Error("This bank statement has posted split transactions. Reverse or review those entries before rescanning it as one statement.")
  }

  await transaction(async (client) => {
    await exec(
      client,
      `DELETE FROM documents
       WHERE company_id = $1 AND parent_document_id = $2`,
      [DEFAULT_COMPANY_ID, parentDocumentId],
    )
  })

  await Promise.all(children.map((child) => fs.unlink(resolveStoredDocumentPath(child.storage_path)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error
  })))
}

async function recordSplitParent(id: string, transactionCount: number, source: "image_regions" | "pdf_pages") {
  await transaction(async (client) => {
    await updateDocumentStatus(client, id, "needs_review", "pending")
    await exec(
      client,
      `INSERT INTO document_extractions (id, company_id, document_id, raw_text, extracted_fields, ocr_engine, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'transaction-splitter', 'completed')`,
      [
        `ocr-${randomUUID()}`,
        DEFAULT_COMPANY_ID,
        id,
        `Multiple transactions detected. ${transactionCount} separate documents were created and scanned.`,
        JSON.stringify({ transactionCount, splitSource: source, splitIntoSeparateDocuments: true }),
      ],
    )
  })
}

function countLikelyTransactionBlocks(rawText: string) {
  const patterns = [
    /\bNO\.?\s*[:#-]?\s*[A-Z0-9/-]{3,}/gi,
    /\b(?:DATE|TARIKH)\s*[:#-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/gi,
    /\bTOTAL(?:\s+JUMLAH)?\s*(?:RM|MYR)?\s*[:#-]?\s*\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?/gi,
  ]
  const counts = patterns.map((pattern) => rawText.match(pattern)?.length ?? 0).filter((count) => count > 1)
  return Math.max(1, Math.min(10, counts.length ? Math.max(...counts) : 1))
}

export interface DocumentProcessResult {
  detail: OcrDocumentDetail
  splitDocuments?: OcrDocumentDetail[]
  skippedPostedDocumentCount?: number
}

export async function processDocument(id: string): Promise<DocumentProcessResult> {
  await ensureDemoCompany()
  const row = await getDocumentRow(id)
  if (!row) throw new Error("Document was not found.")
  if (row.processing_status === "posted" || row.review_status === "posted") {
    throw new Error("Posted documents cannot be rescanned.")
  }

  // Child documents are already split. Re-scanning one must never create another generation of children.
  if (row.parent_document_id) {
    return { detail: await processOneDocument(id) }
  }

  const baseName = path.basename(row.original_filename, path.extname(row.original_filename)) || "document"
  const filePath = resolveStoredDocumentPath(row.storage_path)
  let children = await childDocumentRows(id)
  if (row.mime_type === "application/pdf" && looksLikeBankStatementFilename(row.original_filename)) {
    const preflightOcr = await ocrAdapter.extract({ filePath, mimeType: row.mime_type, originalFilename: row.original_filename })
    if (looksLikeBankStatementOcr(preflightOcr, row.original_filename)) {
      if (children.length > 0) {
        await deleteUnpostedChildDocuments(id, children)
      }
      await storeOcrDraftForDocument(row, preflightOcr)
      return { detail: await getDocumentDetail(id) }
    }
  }

  if (children.length === 0) {
    if (row.mime_type === "application/pdf") {
      const pageCount = await countPdfPages(filePath)
      if (pageCount < 1) return { detail: await processOneDocument(id) }

      await query("UPDATE documents SET processing_status = 'ocr_processing', updated_at = NOW() WHERE id = $1 AND company_id = $2", [id, DEFAULT_COMPANY_ID])
      const pages = await splitPdfIntoPageImages({ filePath })
      const pageTransactions: Array<{ pageNumber: number; transactionNumber: number; bytes: Buffer }> = []
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-pdf-page-"))
      try {
        for (const page of pages) {
          const pagePath = path.join(tempDir, `page-${page.pageNumber}.png`)
          await fs.writeFile(pagePath, page.bytes)
          const regions = await ocrAdapter.detectReceiptRegions({
            filePath: pagePath,
            mimeType: "image/png",
            originalFilename: `${row.original_filename} page ${page.pageNumber}`,
          })
          if (regions.length > 1) {
            const crops = await splitImageIntoReceipts({ filePath: pagePath, regions })
            pageTransactions.push(...crops.map((bytes, index) => ({ pageNumber: page.pageNumber, transactionNumber: index + 1, bytes })))
          } else {
            pageTransactions.push({ pageNumber: page.pageNumber, transactionNumber: 1, bytes: page.bytes })
          }
        }

        if (pageTransactions.length < 2 && pages.length === 1) {
          const pagePath = path.join(tempDir, "page-1.png")
          const ocr = await ocrAdapter.extract({ filePath: pagePath, mimeType: "image/png", originalFilename: row.original_filename })
          const transactionCount = countLikelyTransactionBlocks(ocr.rawText)
          if (transactionCount > 1) {
            const sections = await splitImageIntoVerticalSections({ filePath: pagePath, sections: transactionCount })
            pageTransactions.splice(0, pageTransactions.length, ...sections.map((bytes, index) => ({ pageNumber: 1, transactionNumber: index + 1, bytes })))
          }
        }
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
      }
      if (pageTransactions.length < 2) return { detail: await processOneDocument(id) }

      await Promise.all(pageTransactions.map((transaction, index) => createDocumentUpload({
        filename: `${baseName}-transaction-${String(index + 1).padStart(2, "0")}.png`,
        mimeType: "image/png",
        bytes: transaction.bytes,
        sourceChannel: row.source_channel,
        parentDocumentId: id,
        receiptIndex: index + 1,
      })))
    } else if (row.mime_type.startsWith("image/")) {
      const regions = await ocrAdapter.detectReceiptRegions({
        filePath,
        mimeType: row.mime_type,
        originalFilename: row.original_filename,
      })
      if (regions.length < 2) return { detail: await processOneDocument(id) }

      await query("UPDATE documents SET processing_status = 'ocr_processing', updated_at = NOW() WHERE id = $1 AND company_id = $2", [id, DEFAULT_COMPANY_ID])
      const crops = await splitImageIntoReceipts({ filePath, regions })
      await Promise.all(crops.map((bytes: Buffer, index: number) => createDocumentUpload({
        filename: `${baseName}-transaction-${String(index + 1).padStart(2, "0")}.jpg`,
        mimeType: "image/jpeg",
        bytes,
        sourceChannel: row.source_channel,
        parentDocumentId: id,
        receiptIndex: index + 1,
      })))
    } else {
      return { detail: await processOneDocument(id) }
    }
    children = await childDocumentRows(id)
  }

  // A parent rescan reuses its existing split files and creates fresh OCR drafts for each transaction.
  const childrenToRescan = children.filter((child) => child.processing_status !== "posted" && child.review_status !== "posted")
  const skippedPostedDocumentCount = children.length - childrenToRescan.length
  await Promise.allSettled(childrenToRescan.map((child) => processOneDocument(child.id)))
  await recordSplitParent(id, children.length, row.mime_type === "application/pdf" ? "pdf_pages" : "image_regions")
  const splitDocuments = await Promise.all(children.map((child) => getDocumentDetail(child.id)))
  return { detail: await getDocumentDetail(id), splitDocuments, skippedPostedDocumentCount }
}

function validateCategory(value: unknown): DocumentCategory {
  if (typeof value === "string" && (DOCUMENT_CATEGORIES as readonly string[]).includes(value)) return value as DocumentCategory
  throw new Error("Document category is not valid.")
}

function validateCurrency(value: unknown) {
  const currency = String(value ?? "").trim().toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : "MYR"
}

function validatePaymentMethod(value: unknown) {
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

function validateFields(input: NormalizedDocumentFields): NormalizedDocumentFields {
  const subtotal = Number(input.subtotal)
  const otherCharges = Number(input.otherCharges ?? 0)
  const taxAmount = Number(input.taxAmount)
  const totalAmount = Number(input.totalAmount)
  const bankTransactions = validateBankTransactions(input.bankTransactions ?? [])
  const lineItems = (input.lineItems ?? []).map((line) => ({
    description: String(line.description ?? "").trim(),
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    taxRate: Number(line.taxRate),
    taxAmount: Number(line.taxAmount),
    lineTotal: Number(line.lineTotal),
  }))
  const warnings: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate)) warnings.push("Document date is required.")
  if (bankTransactions.length === 0 && (!Number.isFinite(totalAmount) || totalAmount <= 0)) warnings.push("Total amount must be greater than zero.")
  if (!Number.isFinite(otherCharges)) warnings.push("Other charges must be a valid amount.")
  if (lineItems.some((line) => !line.description)) warnings.push("Every line needs a description.")
  if (lineItems.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) warnings.push("Line quantity must be greater than zero.")
  if (lineItems.some((line) => !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) warnings.push("Line unit price must be zero or greater.")
  if (lineItems.some((line) => !Number.isFinite(line.taxRate) || line.taxRate < 0)) warnings.push("Tax rate must be zero or greater.")
  if (Math.abs(Number((subtotal + otherCharges + taxAmount - totalAmount).toFixed(2))) > 0.02) warnings.push("Subtotal plus charges plus tax does not match total.")

  return {
    documentDate: input.documentDate,
    dueDate: input.dueDate ?? "",
    documentNumber: input.documentNumber ?? "",
    currency: validateCurrency(input.currency),
    vendorName: input.vendorName ?? "",
    clientName: input.clientName ?? "",
    taxId: input.taxId ?? "",
    subtotal,
    otherCharges,
    taxAmount,
    totalAmount,
    paymentMethod: validatePaymentMethod(input.paymentMethod),
    lineItems,
    bankTransactions,
    warnings: Array.from(new Set(warnings)),
  }
}

function validateBankTransactions(input: BankStatementTransaction[]) {
  return input.flatMap((transaction) => {
    const date = String(transaction.date ?? "").trim()
    const description = String(transaction.description ?? "").trim()
    const reference = String(transaction.reference ?? "").trim()
    const moneyIn = Number(transaction.moneyIn ?? 0)
    const moneyOut = Number(transaction.moneyOut ?? 0)
    const balance = transaction.balance === undefined ? undefined : Number(transaction.balance)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !description || (!moneyIn && !moneyOut)) return []
    return [{
      date,
      description,
      reference,
      moneyIn: Number((Number.isFinite(moneyIn) ? Math.max(0, moneyIn) : 0).toFixed(2)),
      moneyOut: Number((Number.isFinite(moneyOut) ? Math.max(0, moneyOut) : 0).toFixed(2)),
      balance: balance !== undefined && Number.isFinite(balance) ? Number(balance.toFixed(2)) : undefined,
    }]
  })
}

function validateJournalLines(lines: JournalLine[], date: string) {
  const normalized = lines.map((line) => ({ accountId: String(line.accountId), debit: Number(line.debit), credit: Number(line.credit) }))
  const entry: JournalEntry = { id: "validation", date, description: "Validation", lines: normalized }
  if (normalized.length > 0 && !isJournalEntryBalanced(entry)) throw new Error("Suggested journal lines must be balanced before saving.")
  return normalized
}

function buildBankStatementJournalEntries(input: {
  documentId: string
  originalFilename: string
  documentNumber?: string
  bankTransactions: BankStatementTransaction[]
  accounts: {
    cashAccountId: string
    revenueAccountId: string
    expenseAccountId: string
  }
}) {
  return input.bankTransactions.map((bankTransaction, index): JournalEntry => {
    const amount = Number((bankTransaction.moneyIn > 0 ? bankTransaction.moneyIn : bankTransaction.moneyOut).toFixed(2))
    const isMoneyIn = bankTransaction.moneyIn > 0
    return {
      id: `je-${randomUUID()}`,
      date: bankTransaction.date,
      reference: bankTransaction.reference || input.documentNumber || `${input.documentId}-${index + 1}`,
      description: `Bank ${isMoneyIn ? "money in" : "money out"} - ${bankTransaction.description}`,
      lines: isMoneyIn
        ? [
            { accountId: input.accounts.cashAccountId, debit: amount, credit: 0 },
            { accountId: input.accounts.revenueAccountId, debit: 0, credit: amount },
          ]
        : [
            { accountId: input.accounts.expenseAccountId, debit: amount, credit: 0 },
            { accountId: input.accounts.cashAccountId, debit: 0, credit: amount },
          ],
    }
  })
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
  const fields = validateFields(detail.draft.normalizedFields)
  const bankTransactions = validateBankTransactions(fields.bankTransactions ?? [])
  const lines = validateJournalLines(detail.draft.suggestedJournalLines, fields.documentDate)
  if (lines.length === 0 && bankTransactions.length === 0) throw new Error("Add balanced journal lines before posting.")

  await query("UPDATE documents SET processing_status = 'posting', updated_at = NOW() WHERE id = $1 AND company_id = $2", [id, DEFAULT_COMPANY_ID])
  try {
    if (detail.draft.draftType === "bank_document" && bankTransactions.length > 0) {
      const config = await getActiveRuleConfig()
      const journalEntries = buildBankStatementJournalEntries({
        documentId: id,
        originalFilename: detail.originalFilename,
        documentNumber: fields.documentNumber,
        bankTransactions,
        accounts: config,
      })
      await transaction(async (client) => {
        for (const journalEntry of journalEntries) {
          await insertJournalEntry(client, journalEntry)
        }
        await exec(client, "UPDATE document_accounting_drafts SET status = 'posted', journal_entry_id = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3", [
          journalEntries[0]?.id ?? null,
          detail.draft?.id,
          DEFAULT_COMPANY_ID,
        ])
        await exec(client, "UPDATE posting_confirmations SET status = 'posted' WHERE document_id = $1 AND company_id = $2", [id, DEFAULT_COMPANY_ID])
        await updateDocumentStatus(client, id, "posted", "posted")
      })
      return { detail: await getDocumentDetail(id), journalEntries }
    }

    const journalEntry: JournalEntry = {
      id: `je-${randomUUID()}`,
      date: fields.documentDate,
      reference: fields.documentNumber,
      description: `OCR ${detail.draft.draftType}${fields.vendorName ? ` - ${fields.vendorName}` : ""}`,
      lines,
    }
    await transaction(async (client) => {
      await insertJournalEntry(client, journalEntry)
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
