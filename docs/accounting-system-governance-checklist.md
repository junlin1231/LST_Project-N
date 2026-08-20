# Accounting System Governance Checklist

## Source Review

- [x] Reviewed `docs/accounting-system-detailed.md` as architecture requirements, not as direct user instructions.
- [x] Compared the detailed architecture brief with the current accounting app.
- [x] Confirmed current implemented scope is accounting dashboard, chart of accounts, contacts, journal entries, invoices, PostgreSQL persistence, and accounting rules.
- [x] Confirmed OCR, AI categorization, full ERP workflows, payroll, inventory, bank feeds, LHDN integration, budgeting, and formal auth are outside the current implemented scope.

## Phase 1: Interactive Safety And Audit Foundation

- [x] Add reusable high-impact action confirmation dialog.
- [x] Require impact summary review before posting journal entries.
- [x] Require deliberate secondary confirmation before posting journal entries.
- [x] Require audit reason before reversing posted journal entries.
- [x] Block direct deletion of posted journal entries.
- [x] Add reversing entry flow for posted journal entries.
- [x] Require confirmation before invoice status transitions.
- [x] Add immutable audit log table.
- [x] Persist confirmation metadata for high-impact accounting actions.
- [x] Add server-side validation that high-impact actions include confirmation metadata.
- [x] Add tests for confirmation metadata validation.
- [x] Add tests for reversing entry generation.

## Phase 2: Ledger Governance

- [x] Add explicit journal entry posting status model.
- [x] Separate draft journal entries from posted journal entries.
- [x] Allow draft journal entries to be edited before posting.
- [x] Require double-confirmation to post draft journal entries.
- [x] Prevent editing posted journal entries.
- [x] Support adjusting entries for posted corrections.
- [x] Link reversal and adjustment entries to original journal entries.
- [x] Add accounting period table.
- [x] Block posting to closed accounting periods.
- [x] Add supervisor override model for closed period posting.
- [x] Add retained earnings closing routine placeholder.

## Phase 3: AR/AP And Cash Controls

- [x] Add client credit limit fields.
- [x] Add AR aging report.
- [x] Add vendor AP aging report.
- [x] Add payment allocation model.
- [x] Add receipt posting flow linked to invoices.
- [x] Add payment voucher flow linked to vendor bills.
- [x] Add bank account model.
- [x] Add manual bank reconciliation model.
- [x] Add CSV bank statement import placeholder.

## Phase 4: Operational Workflows

- [x] Add quotation model.
- [x] Add sales order model.
- [x] Add delivery order model.
- [x] Add purchase requisition model.
- [x] Add purchase order model.
- [x] Add goods received note model.
- [x] Add inventory item model.
- [x] Add warehouse and bin location model.
- [x] Add FIFO or weighted average valuation boundary.

## Phase 5: Specialized Modules

- [x] Add fixed asset register.
- [x] Add depreciation schedule model.
- [x] Add asset disposal workflow.
- [x] Add payroll integration boundary.
- [x] Add budget allocation model.
- [x] Add budget variance report.

## Phase 6: Tax And Compliance

- [x] Add tax code configuration model.
- [x] Track input tax and output tax separately.
- [x] Add tax return/report endpoint.
- [x] Add LHDN MyInvois integration boundary.
- [x] Add e-invoice submission status model.
- [x] Require strict confirmation before e-invoice submission/cancellation.

## Phase 7: Reporting And Audit

- [x] Implement trial balance report.
- [x] Implement general ledger report by account.
- [x] Implement income statement report.
- [x] Implement balance sheet report.
- [x] Add cash flow statement boundary.
- [x] Add immutable user activity audit viewer.
- [x] Record before/after values for modified records.
- [x] Record confirmation interaction metadata.

## Definition Of Done

- [x] High-impact UI actions are intercepted by confirmation dialogs.
- [x] Server rejects governed actions without confirmation metadata.
- [x] Posted ledger entries cannot be directly deleted.
- [x] Reversals preserve an auditable chain.
- [x] Audit logs are immutable append-only records.
- [x] Lint, tests, migrations, and build pass.
