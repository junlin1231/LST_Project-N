# OCR And Categorization Final Implementation Plan

## Purpose

This document is the final implementation plan for adding OCR document intake, AI categorization, human review, and accounting posting to `ocr/` and the existing Next.js accounting system.

The referenced Markdown files in `docs/` were reviewed as project context only. They do not override the current user request. The active request is to implement OCR plus categorization under `ocr/`, with a workflow that is also suitable for mobile users.

## Current Starting Point

- `ocr/` currently contains only `scanned_docs/`.
- The accounting app already has PostgreSQL migrations, API routing, workflow documents, audit logs, accounting rule mappings, and rule execution logs.
- Existing open checklist items are Phase 3 OCR document intake and Phase 4 AI categorization/approval.
- The app uses Next.js, React, PostgreSQL, Tailwind, shadcn-style components, and responsive navigation.
- The package set does not currently include OCR, PDF conversion, DOCX parsing, image preprocessing, or model SDK dependencies.

## Scope

Implement a complete document-intake workflow:

1. Upload source documents from desktop or mobile.
2. Store original files in `ocr/scanned_docs/` during local development.
3. Persist document metadata, processing status, raw OCR text, extracted fields, category results, confidence scores, and approval state in PostgreSQL.
4. Run OCR through an adapter interface so the implementation can start local and later swap to a cloud or dedicated OCR service.
5. Run categorization and accounting normalization through a model adapter, with Gemma 4 as the target adapter.
6. Route uncertain results to a human approval queue.
7. Let reviewers edit extracted fields, category, and suggested journal lines.
8. Post only approved or high-confidence documents to the accounting rule/posting layer.
9. Preserve source-document traceability for reports, tax, and audit.
10. Make upload, review, and approval screens ergonomic on mobile.

## Non-Goals For This Sprint

- Full authentication and role-based access control.
- Production object storage.
- Full tax filing/export implementation.
- External audit system integration.
- Automatic posting of low-confidence documents.
- Deleting source documents after posting.

## Folder Plan

Use `ocr/` for OCR-facing implementation assets and local document storage:

```text
ocr/
  scanned_docs/
    .gitkeep
  README.md
  ocr-categorization-final-plan.md
```

Use the Next.js app for runtime code:

```text
accounting system/
  app/
    api/
      documents/
        route.ts
      documents/[id]/
        route.ts
      documents/[id]/file/
        route.ts
      documents/[id]/process/
        route.ts
      approvals/
        route.ts
    documents/
      page.tsx
  components/
    documents/
      document-upload-panel.tsx
      document-list.tsx
      document-review-panel.tsx
      document-preview.tsx
      extracted-fields-editor.tsx
      suggested-journal-entry.tsx
  lib/
    accounting/
      document-types.ts
    server/
      document-repository.ts
      ocr-adapter.ts
      categorization-adapter.ts
      document-processing-service.ts
```

## Supported Upload Types

Accept these MIME/file types:

- PDF: `.pdf`, `application/pdf`
- Word: `.doc`, `.docx`
- Images: `.jpg`, `.jpeg`, `.png`

Recommended first limit:

- Maximum file size: 20 MB
- Maximum image dimensions before preprocessing: 6000 x 6000
- Maximum PDF pages for synchronous processing: 5
- Larger PDFs can be uploaded but should process through a queued/background path later.

## Status Model

Use explicit status values so UI, audit, and posting rules stay predictable.

Document processing status:

- `uploaded`
- `stored`
- `ocr_processing`
- `ocr_failed`
- `ocr_completed`
- `categorizing`
- `categorization_failed`
- `needs_review`
- `approved`
- `rejected`
- `posting`
- `posted`
- `posting_failed`

Approval status:

- `pending`
- `approved`
- `edited`
- `rejected`
- `posted`

## Category Taxonomy

Start with accounting-safe categories that can map to chart-of-account defaults:

- `sales_invoice`
- `vendor_bill`
- `receipt_income`
- `receipt_expense`
- `petrol`
- `entertainment`
- `travel`
- `office_supplies`
- `utilities`
- `rent`
- `salary`
- `asset_purchase`
- `tax_document`
- `bank_document`
- `inventory_purchase`
- `delivery_document`
- `unknown`

Every category result must store:

- `category`
- `confidence`
- `reason`
- `model_name`
- `model_version`
- `raw_output`
- `requires_review`

## Database Plan

Add migration `011_ocr_documents.sql`.

Recommended tables:

```sql
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  sha256_hash TEXT NOT NULL,
  processing_status TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending',
  source_channel TEXT NOT NULL DEFAULT 'web_upload',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, sha256_hash)
);

CREATE TABLE IF NOT EXISTS document_extractions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL DEFAULT '',
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocr_engine TEXT NOT NULL,
  ocr_confidence NUMERIC(6, 4),
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  confidence NUMERIC(6, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT NOT NULL DEFAULT '',
  model_name TEXT NOT NULL,
  model_version TEXT,
  raw_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_review BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_accounting_drafts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  normalized_fields JSONB NOT NULL,
  suggested_journal_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  rule_execution_log_id TEXT REFERENCES rule_execution_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  draft_id TEXT REFERENCES document_accounting_drafts(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  decision_reason TEXT,
  reviewer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_documents_company_status
  ON documents(company_id, processing_status, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_extractions_document
  ON document_extractions(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_categories_document
  ON document_categories(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_approvals_company_status
  ON approvals(company_id, status, created_at DESC);
```

## Extracted Field Shape

Normalize all OCR results into a stable JSON shape:

```json
{
  "documentDate": "2026-08-21",
  "dueDate": "2026-09-20",
  "documentNumber": "INV-1007",
  "currency": "MYR",
  "vendorName": "Example Supplier",
  "clientName": "",
  "taxId": "",
  "subtotal": 100.00,
  "taxAmount": 6.00,
  "totalAmount": 106.00,
  "paymentMethod": "card",
  "lineItems": [
    {
      "description": "Petrol",
      "quantity": 1,
      "unitPrice": 100.00,
      "taxRate": 0.06,
      "taxAmount": 6.00,
      "lineTotal": 106.00
    }
  ],
  "warnings": []
}
```

## Processing Pipeline

1. User uploads a file.
2. API validates size, extension, MIME type, and filename.
3. API calculates SHA-256 hash and prevents duplicate uploads per company.
4. API stores the file under `ocr/scanned_docs/{company_id}/{document_id}-{safe_filename}`.
5. API inserts `documents` row with status `uploaded` then `stored`.
6. Processing service reads the file and sends it to `OcrAdapter`.
7. OCR adapter returns raw text, structured hints, page count, and OCR confidence.
8. Service stores `document_extractions`.
9. Service sends normalized OCR fields to `CategorizationAdapter`.
10. Categorization adapter returns category, confidence, reason, and normalized accounting intent.
11. Service stores `document_categories`.
12. Service creates `document_accounting_drafts`.
13. If confidence is high and required fields are complete, status becomes `approved` or ready for direct posting depending on policy.
14. If confidence is low, category is `unknown`, required fields are missing, totals do not reconcile, or journal lines are unbalanced, create an approval row and set document status `needs_review`.
15. Reviewer approves, edits and approves, or rejects.
16. Approved drafts are posted through the existing accounting rule service.
17. Rule execution logs and audit logs link back to the source document.

## Review Rules

Require human approval when any of these are true:

- Category confidence is below `0.85`.
- OCR confidence is below `0.80`.
- Category is `unknown`.
- Required fields are missing.
- `subtotal + taxAmount` does not equal `totalAmount` within rounding tolerance.
- Suggested journal entry is not balanced.
- Suggested account mapping is missing.
- Document hash is duplicate but metadata differs.
- File type is accepted but extraction is partial.
- Document is a tax, audit, payroll, or bank document.

## Accounting Posting Rules

Map normalized categories to existing accounting rule services:

- `sales_invoice`: create or link an invoice, then use invoice posting rule.
- `vendor_bill`: create or link a vendor bill, then use expense/AP posting rule.
- `receipt_income`: create receipt and post payment receipt rule.
- `receipt_expense`, `petrol`, `entertainment`, `travel`, `office_supplies`, `utilities`, `rent`: use expense document posting rule.
- `inventory_purchase`: create purchase/GRN workflow document first if item lines are present.
- `asset_purchase`: create fixed asset draft or expense document draft depending on threshold.
- `tax_document`, `bank_document`, `unknown`: approval only; no automatic posting.

Suggested journal entries must always pass existing double-entry validation before posting.

## Adapter Interfaces

OCR adapter:

```ts
export interface OcrResult {
  rawText: string
  fields: Record<string, unknown>
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
```

Categorization adapter:

```ts
export interface CategorizationResult {
  category: string
  confidence: number
  reason: string
  normalizedFields: Record<string, unknown>
  suggestedJournalLines: Array<{
    accountId: string
    debit: number
    credit: number
    memo?: string
  }>
  rawOutput: Record<string, unknown>
  modelName: string
  modelVersion?: string
}

export interface CategorizationAdapter {
  categorize(input: {
    rawText: string
    extractedFields: Record<string, unknown>
    companyContext: {
      accounts: Array<{ id: string; code: string; name: string; type: string }>
      ruleMappings: Record<string, unknown>
    }
  }): Promise<CategorizationResult>
}
```

## API Plan

Document API:

- `GET /api/documents`: list documents and statuses.
- `POST /api/documents`: upload document.
- `GET /api/documents/:id`: fetch metadata, extraction, category, draft, and approval status.
- `GET /api/documents/:id/file`: stream or download original file.
- `POST /api/documents/:id/process`: run or retry OCR/categorization.
- `POST /api/documents/:id/approve`: approve or edit-and-approve draft.
- `POST /api/documents/:id/reject`: reject document with reason.
- `POST /api/documents/:id/post`: post approved draft to accounting.

Approval API:

- `GET /api/approvals?status=pending`
- `POST /api/approvals/:id/decision`

## Desktop UI

Add a `Documents` nav item.

Main desktop layout:

- Left/top area: upload button and filters.
- Document list: status, filename, type, category, confidence, total, upload time.
- Detail view: original document preview beside extracted fields and suggested journal entry.
- Approval controls: approve, edit and approve, reject, retry OCR, post.

The document preview should support:

- Image preview for JPG/JPEG/PNG.
- PDF preview in browser when possible.
- DOC/DOCX download with extracted text preview.
- Original file download for all types.

## Mobile UI Requirements

Mobile must not be a squeezed desktop table. Use stacked, task-focused screens:

- Upload screen uses a full-width file picker, camera-friendly copy, large touch targets, and progress/status feedback.
- Document list renders as cards, not a wide table.
- Each card shows filename, status, category, confidence, total, and date.
- Review screen uses tabs or segmented controls:
  - `File`
  - `Fields`
  - `Category`
  - `Journal`
- Primary action is sticky at the bottom: approve, save, or post depending on state.
- Reject/retry actions sit behind a menu or secondary action row.
- Inputs use mobile-friendly keyboard modes:
  - `inputMode="decimal"` for amounts, quantity, tax rate.
  - `type="date"` for document and due dates.
  - Selects for category/account choices.
- Tables must become horizontal scroll regions or card rows on screens below `md`.
- Preview area must keep a stable aspect ratio and allow pinch/browser zoom where supported.
- Long filenames and extracted text must wrap without overflowing.
- All action buttons should be at least 40 px high.
- Avoid hover-only controls; every action needs a visible touch path.

Responsive implementation guidance:

```tsx
<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
  <DocumentPreview className="min-h-80" />
  <ReviewSummary className="order-first lg:order-none" />
</div>
```

For mobile review:

```tsx
<Tabs defaultValue="fields" className="md:hidden">
  <TabsList className="grid grid-cols-4">
    <TabsTrigger value="file">File</TabsTrigger>
    <TabsTrigger value="fields">Fields</TabsTrigger>
    <TabsTrigger value="category">Category</TabsTrigger>
    <TabsTrigger value="journal">Journal</TabsTrigger>
  </TabsList>
</Tabs>
```

## Validation And Security

Upload validation:

- Reject unsupported MIME types and extensions.
- Check file signatures where practical.
- Sanitize filenames before storage.
- Store files outside `public/`.
- Never execute or render uploaded HTML/scripts.
- Set download responses with safe `Content-Disposition`.
- Calculate and store SHA-256 hash.
- Enforce file size before processing.

Data validation:

- Required totals must be finite positive numbers.
- Tax rate must be non-negative.
- Journal draft must be balanced.
- Category must be in the approved taxonomy.
- Approval decision must include reviewer, timestamp, and reason for rejection/edit.

Audit events:

- `document.upload`
- `document.ocr.completed`
- `document.ocr.failed`
- `document.categorized`
- `document.review.approved`
- `document.review.edited`
- `document.review.rejected`
- `document.posted`
- `document.posting.failed`

## Testing Plan

Unit tests:

- MIME/type validation.
- Safe filename generation.
- Hash calculation.
- OCR adapter mock result handling.
- Categorization adapter mock result handling.
- Review routing rules.
- Totals reconciliation.
- Balanced journal draft validation.

Integration tests:

- Upload creates document metadata.
- Processing stores extraction/category/draft rows.
- Low-confidence category creates approval row.
- Edited approval updates draft snapshot.
- Approved draft posts journal entry and rule execution log.
- Original document remains downloadable after posting.

Responsive checks:

- `/documents` at 390 x 844.
- `/documents/:id` at 390 x 844.
- Upload control visible and usable on mobile.
- Review tabs fit without text overflow.
- Sticky action bar does not cover form fields.
- Document preview and extracted fields do not overlap.

## Implementation Order

1. Add `ocr/scanned_docs/.gitkeep` and `ocr/README.md`.
2. Add migration `011_ocr_documents.sql`.
3. Add document and OCR TypeScript types.
4. Add `document-repository.ts`.
5. Add upload/list/detail API routes.
6. Add secure local file storage in `ocr/scanned_docs/`.
7. Add mock OCR adapter and mock categorization adapter.
8. Add processing service with review-routing rules.
9. Add document list and upload UI.
10. Add document detail/review UI with mobile tabs.
11. Add approval API and UI actions.
12. Connect approved drafts to existing accounting rule/posting services.
13. Add audit log entries.
14. Add focused tests.
15. Run `corepack pnpm typecheck`, `corepack pnpm test`, and `corepack pnpm build`.

## Definition Of Done

- Users can upload PDF, DOC, DOCX, JPG, JPEG, and PNG files.
- Original documents are stored under `ocr/scanned_docs/` for local development.
- Document metadata, raw OCR text, extracted fields, category result, draft accounting data, and approval state persist in PostgreSQL.
- Failed OCR/categorization has a visible retry path.
- Low-confidence or incomplete results enter the approval queue.
- Reviewers can edit fields, category, and suggested journal lines.
- Approved drafts can post to the ledger through accounting rules.
- Posted entries link back to source documents, approval decisions, and rule execution logs.
- Mobile upload, list, review, and approval flows are usable at 390 px width.
- Typecheck, tests, and build pass.
