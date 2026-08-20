# Accounting System Implementation Checklist

## Source Review

- [x] Reviewed `docs/Lst project.docx`.
- [x] Checked `docs/tech.md`; file is empty.
- [x] Reviewed current `accounting system` source structure.
- [x] Confirmed current app is a frontend demo using in-memory React state.
- [x] Confirmed PostgreSQL, OCR, AI categorization, approval workflow, tax system, and audit system are not implemented yet.
- [x] Tried `corepack pnpm lint`; blocked because dependencies are not installed.
- [x] Tried `corepack pnpm build`; blocked because dependencies are not installed.

## Phase 0: Stabilize Current App

- [x] Run `corepack pnpm install --frozen-lockfile`.
- [x] Run `corepack pnpm lint`.
- [x] Run `corepack pnpm build`.
- [x] Fix all syntax, JSX, and encoding issues reported by lint/build.
- [x] Replace `customer` with `client` where code uses `ContactType`.
- [x] Replace `invoice.contactId` with `invoice.clientId`.
- [x] Replace `invoice.lines` with `invoice.items`.
- [x] Remove `typescript.ignoreBuildErrors = true` from `next.config.mjs`.
- [x] Add `typecheck` script.
- [x] Add tests for `invoiceSubtotal`, `invoiceTax`, and `invoiceTotal`.
- [x] Add tests for balanced and unbalanced journal entries.
- [x] Add tests for account balances by normal debit/credit side.
- [x] Add tests for profit/loss and balance sheet summary calculations.

## Phase 1: PostgreSQL Persistence

- [x] Choose Prisma, Drizzle, or another typed database layer.
- [x] Add PostgreSQL service to Docker Compose.
- [x] Add database connection environment variables.
- [x] Add environment variable validation.
- [x] Create migrations for `companies`.
- [x] Create migrations for `users`.
- [x] Create migrations for `accounts`.
- [x] Create migrations for `contacts`.
- [x] Create migrations for `journal_entries`.
- [x] Create migrations for `journal_lines`.
- [x] Create migrations for `invoices`.
- [x] Create migrations for `invoice_items`.
- [x] Create seed data from current demo data.
- [x] Add API/service functions for accounts.
- [x] Add API/service functions for contacts.
- [x] Add API/service functions for journal entries.
- [x] Add API/service functions for invoices.
- [x] Enforce balanced journal entries server-side.
- [x] Wrap journal header and line writes in one database transaction.
- [x] Update UI reads to use API/database data.
- [x] Update UI writes to use API/database mutations.
- [x] Confirm data survives page refresh.
- [x] Confirm data survives app restart.

## Phase 2: Accounting Rules

- [x] Create accounting rule module/service.
- [x] Define rule input and output types.
- [x] Add rule execution log table.
- [ ] Implement invoice posting rule.
- [ ] Implement payment receipt posting rule.
- [ ] Implement expense document posting rule.
- [ ] Implement tax posting rule placeholder.
- [x] Add configurable account mappings.
- [ ] Add rule versioning.
- [ ] Add manual override path.
- [ ] Add tests for debit/credit output of each rule.
- [ ] Add rounding tests.
- [ ] Add tax calculation tests.

## Phase 3: OCR Document Intake

- [ ] Add supported upload types: PDF, DOC, DOCX, JPG, JPEG, PNG.
- [ ] Add secure upload endpoint.
- [ ] Add file size limits.
- [ ] Add MIME/type validation.
- [ ] Add document storage folder or object storage bucket.
- [ ] Create `documents` table.
- [ ] Store original filename, storage path/key, MIME type, hash, upload user, and timestamps.
- [ ] Add document processing status.
- [ ] Add document list UI.
- [ ] Add document detail/review UI.
- [ ] Add original document viewer/download action.
- [ ] Add OCR adapter interface.
- [ ] Store raw OCR text.
- [ ] Store extracted structured fields.
- [ ] Add OCR failure handling.

## Phase 4: AI Categorization And Approval

- [ ] Add Gemma 4 adapter interface.
- [ ] Define document category taxonomy.
- [ ] Store AI category result.
- [ ] Store AI confidence score.
- [ ] Store raw model output.
- [ ] Add normalization from extracted fields to accounting draft transaction.
- [ ] Create `approvals` table.
- [ ] Add approval statuses: pending, approved, edited, rejected, posted.
- [ ] Add rules for when AI output requires human approval.
- [ ] Build approval queue UI.
- [ ] Show original document beside extracted fields.
- [ ] Allow reviewer to edit extracted fields.
- [ ] Allow reviewer to edit category.
- [ ] Allow reviewer to edit suggested journal entry.
- [ ] Require approval before posting low-confidence AI entries.
- [ ] Log approval actions.

## Phase 5: Reporting

- [ ] Implement trial balance.
- [ ] Implement general ledger by account.
- [ ] Implement profit and loss report.
- [ ] Implement balance sheet.
- [ ] Add date filters.
- [ ] Add company/entity filters if multi-company is added.
- [ ] Add CSV export.
- [ ] Add PDF export if required.
- [ ] Save report run metadata.
- [ ] Confirm reports derive from posted journal entries only.

## Phase 6: Tax System

- [ ] Create tax configuration model.
- [ ] Add manual tax setup UI.
- [ ] Track tax codes on invoice/document lines.
- [ ] Track output tax.
- [ ] Track input tax.
- [ ] Add tax adjustment entries.
- [ ] Add tax report endpoint.
- [ ] Add tax report UI.
- [ ] Add tax export format placeholder.
- [ ] Add tests for tax calculations and postings.

## Phase 7: Audit System

- [ ] Create immutable audit log model.
- [ ] Log login/auth events when auth exists.
- [ ] Log document upload and OCR events.
- [ ] Log AI categorization decisions.
- [ ] Log approval actions.
- [ ] Log accounting postings.
- [ ] Link journal entries to source documents.
- [ ] Link journal entries to rule execution logs.
- [ ] Add audit evidence viewer.
- [ ] Add audit report generation placeholder.
- [ ] Define API boundary for future audit system integration.

## Phase 8: Production Readiness

- [ ] Add authentication.
- [ ] Add role-based access control.
- [ ] Add company/entity scoping.
- [ ] Add upload security review.
- [ ] Add document access controls.
- [ ] Add database backup plan.
- [ ] Add document storage backup plan.
- [ ] Add structured logging.
- [ ] Add error monitoring.
- [ ] Add CI lint/typecheck/test/build workflow.
- [ ] Add deployment documentation.
- [ ] Add staging environment configuration.
- [ ] Add production environment configuration.

## Definition Of Done

- [x] App passes lint.
- [x] App passes typecheck.
- [x] App passes build without ignored TypeScript errors.
- [x] Unit tests pass.
- [x] Critical accounting paths have server-side validation.
- [x] Database migrations can run from empty database.
- [x] Seed data can load successfully.
- [ ] Manual accounting workflow works end to end.
- [ ] OCR document workflow works end to end.
- [ ] AI categorization workflow routes uncertain cases to approval.
- [ ] Approved OCR/AI transactions post to the ledger.
- [ ] Financial reports reconcile to ledger balances.
- [ ] Tax and audit modules have stable integration boundaries.
