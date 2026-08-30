import type { JournalLine } from "./types"

export type DocumentProcessingStatus =
  | "uploaded"
  | "stored"
  | "ocr_processing"
  | "ocr_failed"
  | "ocr_completed"
  | "categorizing"
  | "categorization_failed"
  | "needs_review"
  | "confirmed"
  | "rejected"
  | "posting"
  | "posted"
  | "posting_failed"

export type PostingConfirmationStatus = "pending" | "confirmed" | "edited" | "rejected" | "posted"
export type DocumentSourceChannel = "web_upload" | "camera_capture"

export const DOCUMENT_CATEGORIES = [
  "sales_invoice",
  "vendor_bill",
  "receipt_income",
  "receipt_expense",
  "petrol",
  "entertainment",
  "travel",
  "office_supplies",
  "utilities",
  "rent",
  "salary",
  "asset_purchase",
  "tax_document",
  "bank_document",
  "inventory_purchase",
  "delivery_document",
  "unknown",
] as const

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]

export interface OcrLineItem {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  taxAmount: number
  lineTotal: number
}

export interface BankStatementTransaction {
  date: string
  description: string
  reference?: string
  moneyIn: number
  moneyOut: number
  balance?: number
}

export interface NormalizedDocumentFields {
  documentDate: string
  dueDate?: string
  documentNumber?: string
  currency: string
  vendorName?: string
  clientName?: string
  taxId?: string
  subtotal: number
  otherCharges?: number
  taxAmount: number
  totalAmount: number
  paymentMethod?: string
  lineItems: OcrLineItem[]
  bankTransactions?: BankStatementTransaction[]
  warnings: string[]
}

export interface OcrDocument {
  id: string
  originalFilename: string
  mimeType: string
  fileSizeBytes: number
  parentDocumentId?: string
  receiptIndex?: number
  childDocumentCount?: number
  processingStatus: DocumentProcessingStatus
  reviewStatus: PostingConfirmationStatus
  sourceChannel: DocumentSourceChannel
  uploadedAt: string
  updatedAt: string
}

export interface DocumentExtraction {
  rawText: string
  extractedFields: Partial<NormalizedDocumentFields>
  ocrEngine: string
  ocrConfidence?: number
  status: "completed" | "failed"
  errorMessage?: string
  createdAt: string
}

export interface DocumentCategoryResult {
  category: DocumentCategory
  confidence: number
  reason: string
  modelName: string
  modelVersion?: string
  rawOutput: Record<string, unknown>
  requiresReview: boolean
  createdAt: string
}

export interface DocumentAccountingDraft {
  id: string
  draftType: DocumentCategory
  normalizedFields: NormalizedDocumentFields
  suggestedJournalLines: JournalLine[]
  status: "draft" | "confirmed" | "posted" | "rejected"
  journalEntryId?: string
  createdAt: string
  updatedAt: string
}

export interface PostingConfirmation {
  id: string
  status: PostingConfirmationStatus
  decisionReason?: string
  previewSnapshot: Record<string, unknown>
  decidedAt?: string
  createdAt: string
}

export interface OcrDocumentDetail extends OcrDocument {
  extraction?: DocumentExtraction
  categoryResult?: DocumentCategoryResult
  draft?: DocumentAccountingDraft
  confirmation?: PostingConfirmation
}
