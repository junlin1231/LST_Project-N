# Year-End Closing Data Plan

## Purpose

Define the data design and workflow for controlled year-end closing.

This document is for review before implementation.

## Requirement Summary

When the current financial year is closed, the system must:

- Generate closing figures automatically.
- Advance the company to the next financial year.
- Lock the closed historical year so users can view it but cannot edit it freely.
- Require management approval before any closed year can be unlocked for modification.
- Carry the closed year's closing balances into the next year's opening balances.

Example:

- Closing financial year `2025` creates opening balances for financial year `2026`.
- Financial year `2025` becomes locked after close.
- Financial year `2025` can only be edited again after an approved unlock request.

## Current Project Context

The accounting system already has foundations that should be reused:

- `accounting_periods`
  - Tracks period name, start date, end date, status, and close timestamp.
  - Currently supports `open` and `closed`.
- `retained_earnings_closing_runs`
  - Tracks period close totals, net income, linked closing journal entry, close dates, and creator.
- `supervisor_overrides`
  - Existing governance table for override actions.
- `audit_logs`
  - Immutable log table for controlled accounting actions.
- Existing period close UI and API actions:
  - `previewPeriodClose`
  - `postPeriodClose`

The new year-end workflow should extend these instead of replacing them.

## Proposed Concepts

### Financial Year

A financial year is a company-scoped accounting period with:

- Start date.
- End date.
- Status.
- Close metadata.
- Next-year link after carryover.

The initial implementation can use yearly rows in `accounting_periods`.

Recommended yearly status values:

- `open`
- `closing`
- `closed`
- `unlock_pending`
- `unlocked`
- `reclosed`

If the current `accounting_periods.status` field remains simple, use a separate `year_end_closing_runs` table to store the detailed workflow status.

### Closing Balance

Closing balance is the final account balance at the end of the financial year after all posted entries and the retained earnings close are applied.

Rules:

- Asset, liability, and equity account balances are carried forward.
- Revenue and expense accounts are closed to retained earnings.
- Revenue and expense opening balances in the new year must be zero.
- Retained earnings includes the closed year's net profit or loss.

### Opening Balance

Opening balance is a system-generated entry in the new financial year.

Rules:

- Opening balance date is the first day of the next financial year.
- Opening balance must be generated from the previous year's locked closing balance.
- Opening balance entries must be clearly marked as system generated.
- Opening balance entries cannot be manually edited directly.
- Corrections require adjustment entries or an approved historical unlock and reclose.

## Data Model Plan

### Extend `accounting_periods`

Add columns:

```sql
ALTER TABLE accounting_periods
  ADD COLUMN IF NOT EXISTS period_type TEXT NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS fiscal_year INTEGER,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lock_reason TEXT,
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlocked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unlock_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlock_reason TEXT,
  ADD COLUMN IF NOT EXISTS prior_period_id TEXT REFERENCES accounting_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_period_id TEXT REFERENCES accounting_periods(id) ON DELETE SET NULL;
```

Recommended constraints:

```sql
ALTER TABLE accounting_periods
  ADD CONSTRAINT accounting_periods_period_type_check
    CHECK (period_type IN ('month', 'quarter', 'year'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_periods_company_fiscal_year
  ON accounting_periods(company_id, fiscal_year)
  WHERE period_type = 'year';
```

Purpose:

- Identify yearly periods.
- Link previous and next years.
- Store lock and unlock state.
- Support auto-advancing from one year to the next.

### New `year_end_closing_runs`

Create a dedicated closing orchestration table:

```sql
CREATE TABLE IF NOT EXISTS year_end_closing_runs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  period_id TEXT NOT NULL REFERENCES accounting_periods(id) ON DELETE RESTRICT,
  next_period_id TEXT REFERENCES accounting_periods(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'previewed', 'posted', 'void', 'reclosed')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  next_period_start DATE NOT NULL,
  next_period_end DATE NOT NULL,
  revenue_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expense_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_income NUMERIC(14, 2) NOT NULL DEFAULT 0,
  closing_journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  opening_journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  trial_balance_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  closing_balance_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  opening_balance_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  posted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  UNIQUE (company_id, fiscal_year, status)
);
```

Important implementation note:

- A partial unique index is better than `UNIQUE (company_id, fiscal_year, status)` if multiple draft or void runs should be allowed.

Preferred index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_year_end_one_posted_close
  ON year_end_closing_runs(company_id, fiscal_year)
  WHERE status IN ('posted', 'reclosed');
```

Purpose:

- Store the full year-end close result.
- Link the closing journal entry and generated opening journal entry.
- Preserve snapshots for audit and later comparison.

### New `period_unlock_requests`

Create management approval workflow for locked years:

```sql
CREATE TABLE IF NOT EXISTS period_unlock_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_id TEXT NOT NULL REFERENCES accounting_periods(id) ON DELETE RESTRICT,
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'used', 'cancelled')),
  reason TEXT NOT NULL,
  impact_summary TEXT NOT NULL,
  allowed_until TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);
```

Purpose:

- Require management approval before historical edits.
- Keep a clear audit trail for why a closed year was reopened.
- Support temporary unlock windows instead of permanently reopening closed years.

### Journal Entry Metadata

Extend `journal_entries` with system close/open metadata:

```sql
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS system_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS generation_source TEXT,
  ADD COLUMN IF NOT EXISTS locked_by_period_id TEXT REFERENCES accounting_periods(id) ON DELETE SET NULL;
```

Recommended `generation_source` values:

- `year_end_closing`
- `opening_balance_carryover`
- `period_reclose_adjustment`

Purpose:

- Prevent direct manual edits to generated close/open entries.
- Make audit and report traces easier.

## Year-End Closing Workflow

### Step 1: Preview Close

Input:

- Company.
- Fiscal year or period date range.
- Retained earnings account.

System validates:

- Period exists and is open.
- No future-dated posted entries exist inside the closing year after the requested close boundary.
- Trial balance is balanced.
- Required depreciation, stock valuation, AR/AP, tax, and bank reconciliation checks are complete or explicitly acknowledged.
- No draft journal entries exist inside the year unless allowed by policy.
- The year has not already been closed.

System generates preview:

- Revenue total.
- Expense total.
- Net income or loss.
- Closing journal lines.
- Closing balances by balance sheet account.
- Proposed next-year opening journal lines.
- Warnings and blocking errors.

### Step 2: Post Closing Entry

System creates the retained earnings closing journal entry dated on the year-end date.

Posting logic:

- Debit revenue accounts for their credit balances.
- Credit expense accounts for their debit balances.
- Post the net profit or loss to retained earnings.
- Mark the closing journal entry as `system_generated = true`.
- Link it to the `year_end_closing_runs` row.

### Step 3: Lock Historical Year

After the closing entry posts:

- Mark the financial year period as `closed`.
- Set `locked_at`, `locked_by`, and `lock_reason`.
- Block normal create, update, delete, post, reverse, and import actions dated inside that year.
- Keep reports, documents, entries, invoices, stock records, and audit logs viewable.

### Step 4: Create Next Financial Year

System automatically creates the next year if it does not already exist.

Example:

- Closed period: `2025-01-01` to `2025-12-31`.
- Next period: `2026-01-01` to `2026-12-31`.

Rules:

- Link `prior_period_id` and `next_period_id`.
- Set the next year status to `open`.
- Use the same financial-year length and month/day pattern unless company settings define a different fiscal calendar.

### Step 5: Generate Opening Balance

System creates one opening balance journal entry dated on the first day of the next year.

Rules:

- Include asset, liability, and equity account balances only.
- Exclude revenue and expense accounts.
- Opening balance entry must balance debits and credits.
- Mark the entry as:
  - `status = 'posted'`
  - `system_generated = true`
  - `generation_source = 'opening_balance_carryover'`
  - `locked_by_period_id = next_period_id`
- Link the entry to the `year_end_closing_runs.opening_journal_entry_id`.

## Locked Historical Period Behavior

For a closed year, users can view:

- Reports.
- Posted journal entries.
- Source documents.
- Invoices, receipts, bills, payments, and stock movements.
- Audit log and closing snapshots.

For a closed year, normal users cannot:

- Create new dated transactions.
- Edit existing dated transactions.
- Delete transactions.
- Post drafts.
- Reverse or adjust entries.
- Import bank, stock, OCR, invoice, or bill data dated in the locked year.

Allowed without unlock:

- Export reports.
- View documents.
- Add comments or review notes if those notes do not change accounting balances.

## Unlock And Reclose Workflow

### Request Unlock

A user submits:

- Period/year.
- Reason.
- Impact summary.
- Expected records to correct.

System creates a `period_unlock_requests` row with `status = 'pending'`.

### Management Approval

A management user can:

- Approve with an allowed-until timestamp.
- Reject with reason.

On approval:

- Set request status to `approved`.
- Set accounting period status to `unlocked`.
- Set `unlocked_at`, `unlocked_by`, `unlock_expires_at`, and `unlock_reason`.
- Write audit log entry.

### Editing During Unlock

During an approved unlock window:

- Only authorized roles can post corrections.
- Every correction must reference the approved unlock request.
- The system should prefer adjustment or reversal entries over direct edits.
- If direct edits are allowed, before/after values must be recorded in `audit_logs`.

### Reclose

After corrections:

- Run year-end close again.
- Generate updated closing balance snapshot.
- Reverse and regenerate the next-year opening balance, or create a carryover adjustment entry.

Recommended default:

- Do not delete the original opening balance entry.
- Create a system-generated opening balance adjustment in the next year.
- Keep the original close, unlock request, correction entries, reclose run, and opening adjustment linked.

## Carryover Calculation Rules

### Balance Sheet Accounts

Carry forward:

- Assets.
- Liabilities.
- Equity, including retained earnings after closing.

Do not carry forward:

- Revenue.
- Expenses.

### Sub-Ledger Balances

The first version should carry forward the general ledger opening balances.

Future extensions should reconcile sub-ledgers:

- AR invoice outstanding balances.
- AP vendor bill outstanding balances.
- Stock quantity/value balances.
- Fixed asset cost and accumulated depreciation.
- Bank balances.

If sub-ledgers do not reconcile to the general ledger, the close preview should block or warn depending on company policy.

## API Plan

Extend the accounting API action pattern with:

```ts
{ action: "previewYearEndClose", fiscalYear, retainedEarningsAccountId }
{ action: "postYearEndClose", fiscalYear, retainedEarningsAccountId, confirmation }
{ action: "requestPeriodUnlock", periodId, reason, impactSummary }
{ action: "approvePeriodUnlock", requestId, allowedUntil, confirmation }
{ action: "rejectPeriodUnlock", requestId, rejectionReason, confirmation }
{ action: "recloseYear", periodId, retainedEarningsAccountId, confirmation }
```

## Repository Function Plan

Add repository functions:

- `previewYearEndClose(fiscalYear, retainedEarningsAccountId)`
- `postYearEndClose(fiscalYear, retainedEarningsAccountId, confirmation)`
- `createNextFinancialYear(closedPeriod)`
- `buildClosingBalanceSnapshot(periodEnd)`
- `buildOpeningBalanceEntry(nextPeriodStart, closingBalanceSnapshot)`
- `assertPeriodUnlockedForWrite(date, action, unlockRequestId)`
- `requestPeriodUnlock(periodId, reason, impactSummary)`
- `approvePeriodUnlock(requestId, allowedUntil, confirmation)`
- `rejectPeriodUnlock(requestId, rejectionReason, confirmation)`
- `recloseYear(periodId, retainedEarningsAccountId, confirmation)`

## UI Plan

Add a Year-End Closing area under Reports or Settings.

Suggested tabs or panels:

- Close Preview
- Closing Journal
- Opening Balance
- Locked Years
- Unlock Requests
- Audit Trail

Admin actions:

- Preview year-end close.
- Post year-end close.
- View generated closing and opening entries.
- Request unlock for a locked year.
- Approve or reject unlock requests.
- Reclose after corrections.

## Files Expected To Change

- `accounting system/db/migrations/018_year_end_closing.sql`
- `accounting system/lib/accounting/types.ts`
- `accounting system/lib/accounting/reports.ts`
- `accounting system/lib/server/accounting-repository.ts`
- `accounting system/app/api/accounting/route.ts`
- `accounting system/components/reports/reports-view.tsx`
- `accounting system/components/reports/year-end-close-view.tsx`
- `accounting system/components/governance/confirmation-dialog.tsx`
- `accounting system/tests/year-end-close.test.ts`
- `accounting system/tests/period-locking.test.ts`

## Acceptance Criteria

- User can preview year-end closing figures before posting.
- Posting a year-end close creates a retained earnings closing journal entry.
- Posting a year-end close locks the closed year.
- Posting a year-end close creates or opens the next financial year automatically.
- Posting a year-end close creates a next-year opening balance from the closed year's closing balance.
- Revenue and expense accounts start the new year at zero.
- Asset, liability, and equity balances carry forward correctly.
- Normal users cannot edit, post, delete, reverse, import, or adjust records dated inside a locked year.
- Locked historical data remains viewable.
- Unlocking a locked year requires management approval.
- Approved unlocks are time-bound and fully audited.
- Corrections made during unlock reference the approved unlock request.
- Reclosing after corrections preserves the original audit trail and updates next-year opening balances through an auditable adjustment.
- Tests cover close preview, close posting, carryover, locking, unlock approval, and reclose behavior.

## Review Questions

- Should the financial year always follow the calendar year, or should each company define its own fiscal year start month?
- Should reopening a closed year allow direct edits, or only reversal and adjustment entries?
- After reclose, should the system reverse and regenerate the original opening balance entry, or post an opening balance adjustment entry?
- Which roles count as management approvers for unlock requests?
- Should the close be blocked if AR/AP, stock, bank reconciliation, or depreciation checks are incomplete, or should management be allowed to acknowledge warnings?
