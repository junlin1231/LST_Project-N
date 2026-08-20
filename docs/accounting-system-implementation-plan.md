# Accounting System Implementation Plan

## Review Basis

This plan is based on `docs/Lst project.docx`, `docs/tech.md`, and the current `accounting system` Next.js application. The Word document is treated as reference requirements only; it does not override the user request.

`docs/tech.md` is currently empty. The active requirement source is `docs/Lst project.docx`.

## Requirement Summary

The target system is an integrated accounting workflow with these major capabilities:

- OCR scanning for PDFs, Word documents, JPEGs, receipts, invoices, and other document types.
- Storage of scanned source documents so users can review the original file later.
- AI extraction and categorization of document data, including categories such as entertainment and petrol.
- Human approval workflow for uncertain AI results, extraction errors, or uncategorized documents.
- PostgreSQL-backed accounting data storage.
- Accounting UI that calls a core business system instead of accessing storage directly.
- Separated accounting rules or ruling scripts for debit/credit decisions, tax handling, depreciation, and foreign currency.
- Accounting report generation.
- Future integration points for tax and audit systems.
- Technical direction: React/Next.js frontend, PostgreSQL backend, and Gemma 4 for AI.

## Current System Summary

The current app is a frontend-only accounting demo. It includes:

- Next.js 16 and React 19 app structure.
- Dashboard, chart of accounts, journal, invoices, and contacts pages.
- Demo chart of accounts, contacts, journal entries, and invoices in `lib/accounting/data.ts`.
- In-memory state management in `lib/accounting/store.tsx`.
- Double-entry balance calculations, revenue/expense summaries, basic financial statement summaries, invoice status updates, and manual journal entry creation.
- Docker files for building/running the frontend app.

The current system does not yet include:

- PostgreSQL persistence.
- Server-side API/core system layer.
- OCR upload, source-document storage, document viewer, or AI extraction.
- Approval queue for low-confidence extraction/categorization.
- External data fetching from APIs/databases.
- Tax module.
- Audit module.
- Report export workflow.
- Configurable accounting-rules engine.
- Authentication, roles, audit trail, or multi-company support.

## Key Gaps And Risks

### 1. Build And Type Safety Must Be Restored First

The local environment has no `node_modules`, so `corepack pnpm lint` and `corepack pnpm build` could not run. Both failed because `eslint` and `next` were unavailable.

There are also visible code-level contract mismatches that should be corrected before adding backend features:

- `components/contacts/contacts-view.tsx` uses `customer`, but `ContactType` is defined as `client | vendor`.
- `components/contacts/contacts-view.tsx` uses `invoice.contactId` and `invoice.lines`, but `Invoice` is defined with `clientId` and `items`.
- `next.config.mjs` sets `typescript.ignoreBuildErrors = true`, which can hide production-breaking type errors.

### 2. Current State Is Browser-Only

`lib/accounting/store.tsx` stores accounts, entries, invoices, and contacts with React `useState`. This is useful for a prototype, but it does not satisfy the PostgreSQL requirement and data resets on refresh.

### 3. Accounting Rules Are Not Separated

The app supports manual journal entries and basic account balances, but invoice creation does not generate journal entries, tax postings, receivables, or revenue lines through a rule engine. Accounting rules should move into a dedicated module/service before persistence and OCR automate transactions.

### 4. OCR And Approval Are Completely Missing

The requirement document puts OCR ingestion and AI categorization at the start of the flow. No upload pipeline, document table, file storage path, OCR status, confidence score, or approval status exists yet.

### 5. Tax And Audit Are Future Integration Modules

The Word document describes tax and audit as downstream branches after accounting processing. They should be designed as integration boundaries first, then implemented after accounting persistence and reporting are stable.

## Proposed Target Architecture

Use a layered design:

- UI: Next.js pages/components for upload, approval, accounting, reports, tax, and audit.
- API/core system: Next.js route handlers or a separate backend service that validates requests and coordinates business workflows.
- Accounting rules: dedicated rule modules for transaction templates, debit/credit decisions, tax treatment, depreciation, and foreign currency.
- Database: PostgreSQL with migrations and typed data access.
- File storage: local volume first, then object storage if needed; database stores metadata and file path/object key.
- AI/OCR service: extraction and categorization worker using Gemma 4 or an adapter interface that can support Gemma 4.
- Approval workflow: review queue for low-confidence or failed AI classifications before posting to accounting.
- Reporting: financial reports generated from posted journal entries.
- Integration modules: tax and audit services consume accounting outputs through stable interfaces.

## Data Model Plan

Create PostgreSQL tables in phases:

- `companies`: company/legal entity scope.
- `users`: users and role assignments.
- `accounts`: chart of accounts.
- `contacts`: clients and vendors.
- `journal_entries`: accounting entry headers.
- `journal_lines`: debit/credit lines.
- `invoices`: invoice headers.
- `invoice_items`: invoice line items.
- `documents`: uploaded/scanned source files, paths, MIME type, OCR status, and review status.
- `document_extractions`: OCR/AI extracted fields, confidence scores, raw output, and normalized output.
- `document_categories`: category taxonomy and AI/manual category result.
- `approvals`: review tasks for uncertain or failed extraction/categorization.
- `accounting_rules`: versioned rule definitions or rule metadata.
- `rule_execution_logs`: trace from document/invoice/payment to generated journal entry.
- `report_runs`: generated report metadata and parameters.
- `audit_logs`: immutable user/system actions.

## Implementation Phases

### Phase 0: Stabilize The Existing App

Goal: make the current accounting demo compile and behave consistently.

Tasks:

- Install dependencies from `pnpm-lock.yaml`.
- Run `corepack pnpm lint` and `corepack pnpm build`.
- Fix `ContactType` usage in contacts view from `customer` to `client`.
- Fix invoice field references from `contactId/lines` to `clientId/items`.
- Remove `typescript.ignoreBuildErrors = true` from `next.config.mjs`.
- Add focused unit tests for invoice totals, journal balance validation, account balances, and financial statement summaries.
- Keep demo data available through a seed/demo mode, but prepare it to be replaced by API calls.

### Phase 1: Add PostgreSQL Persistence

Goal: replace browser-only accounting state with durable storage.

Tasks:

- Choose ORM/query layer, preferably Prisma or Drizzle.
- Add database schema and migrations for accounts, contacts, invoices, invoice items, journal entries, and journal lines.
- Add seed script based on current `lib/accounting/data.ts`.
- Add API routes/services for CRUD operations.
- Update UI to read/write through API calls.
- Validate all server inputs with schemas.
- Add transaction handling so multi-line journal entries are atomic.
- Enforce double-entry balance at the database/service layer.

### Phase 2: Extract Accounting Rules

Goal: create a rule layer that can post accounting entries consistently.

Tasks:

- Create an accounting rules module for transaction templates.
- Implement invoice posting rules: debit accounts receivable, credit revenue, credit output tax if configured.
- Implement payment receipt rules: debit cash/bank, credit accounts receivable.
- Add rule versioning and execution logs.
- Add manual override and approval support for rule exceptions.
- Add tests for each rule, including tax and rounding behavior.

### Phase 3: OCR Document Intake

Goal: let users upload and review source documents.

Tasks:

- Build document upload UI for PDF, DOC/DOCX, JPG/JPEG, PNG, and other supported types.
- Store original files in a configured storage folder or object store.
- Save file path/object key and metadata in PostgreSQL.
- Add document list and detail viewer.
- Add OCR processing status: uploaded, processing, extracted, needs review, approved, posted, failed.
- Extract raw text and structured fields through an OCR adapter.
- Keep raw OCR output for auditability.

### Phase 4: AI Categorization And Approval Queue

Goal: convert OCR output into accounting-ready data with human review where needed.

Tasks:

- Add a Gemma 4 adapter interface for categorization and field normalization.
- Define category taxonomy for expenses, revenue, assets, liabilities, tax, and unknown.
- Store confidence scores and model output.
- Route low-confidence, missing-field, or conflicting results into an approval queue.
- Build reviewer UI to compare original document, extracted fields, suggested category, and suggested journal entry.
- Allow approve, edit-and-approve, reject, and request-more-info actions.
- Only post approved AI-generated entries to accounting.

### Phase 5: Reporting

Goal: generate accounting reports from posted journal entries.

Tasks:

- Implement date-filtered trial balance.
- Implement profit and loss report.
- Implement balance sheet.
- Implement general ledger report by account.
- Add export to CSV and PDF where required.
- Save report run metadata for traceability.

### Phase 6: Tax System Boundary

Goal: create a tax module that consumes accounting data without coupling to UI state.

Tasks:

- Define tax configuration tables and jurisdiction settings.
- Track input/output tax postings.
- Add tax report endpoints.
- Add manual tax setup UI.
- Support tax adjustments and approval.
- Prepare export structure for compliance reporting.

### Phase 7: Audit System Boundary

Goal: create audit-ready evidence and report interfaces.

Tasks:

- Add immutable audit logs for user actions, AI decisions, approvals, and postings.
- Link journal entries back to source documents and rule execution logs.
- Add audit report generation from accounting reports and evidence links.
- Build audit review screens for sampled documents and entries.
- Define integration API for a future external audit system.

### Phase 8: Production Readiness

Goal: make the system operationally safe.

Tasks:

- Add authentication and role-based access control.
- Add company/entity scoping.
- Add environment variable validation.
- Add backups and restore procedure for PostgreSQL and document storage.
- Add structured logging and error monitoring.
- Add CI for lint, typecheck, tests, and build.
- Add deployment configuration for app, database, worker, and storage.
- Add security review for file upload, document access, and AI data handling.

## Suggested Immediate Next Sprint

1. Install dependencies and make the current frontend pass lint/build.
2. Fix contacts/invoice type mismatches.
3. Remove ignored TypeScript build errors.
4. Add tests around accounting calculations.
5. Add PostgreSQL schema and seed migration for the current demo entities.
6. Replace `useState` store writes with API-backed persistence for accounts, contacts, invoices, journal entries, and journal lines.

## Acceptance Criteria

- The app builds without ignored TypeScript errors.
- All accounting write paths validate balanced journal entries server-side.
- Data persists after browser refresh and app restart.
- Every posted accounting entry can be traced to its source: manual user action, invoice rule, OCR document, or approval decision.
- OCR-generated entries cannot post without either high-confidence rule approval or human approval.
- Financial reports are generated from the same posted journal entries used by the ledger.
- Tax and audit modules consume stable accounting outputs instead of duplicating accounting calculations.
