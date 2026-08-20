# Reporting Module Implementation Plan

## Purpose

Implement a complete accounting reporting module based on `docs/reporting.md`, extending the existing Reports page and current accounting core. The module will generate standard financial statements, support fixed asset depreciation, and provide controlled period-end closing into retained earnings.

This plan is for review before implementation.

## Current Project Context

The app already includes:

- Chart of Accounts and General Ledger data structures.
- Double-entry journal validation.
- Posted vs draft journal entry behavior.
- Existing report builders in `accounting system/lib/accounting/reports.ts`:
  - Trial Balance
  - General Ledger
  - Basic Income Statement
  - Basic Balance Sheet
  - Basic Cash Flow boundary
- Existing Reports UI at `/reports`.
- Existing database tables for:
  - `fixed_assets`
  - `depreciation_schedules`
  - `retained_earnings_closing_runs`
  - `accounting_periods`

The implementation should build on these instead of replacing them.

## Scope

### In Scope

- Full reporting module UI under `/reports`.
- Period filters for reports.
- Statement of Profit or Loss.
- Statement of Financial Position.
- Statement of Cash Flows.
- Statement of Changes in Equity.
- Notes to Financial Statements.
- Fixed Asset register UI.
- Depreciation schedule generation.
- Depreciation journal posting.
- Period-end retained earnings closing.
- API actions and repository functions for fixed assets, depreciation, reports, and closing.
- Tests for report calculations, depreciation, and closing entries.

### Out of Scope For First Implementation

- Multi-company consolidation.
- Multi-currency translation.
- IFRS disclosure automation beyond structured notes generated from current ledger data.
- PDF export, unless added as a later enhancement.
- Complex indirect cash-flow adjustments for non-cash working capital unless enough source data exists.

## Proposed Navigation

Keep the existing sidebar item:

- `Reports`

Inside `/reports`, add tabs:

- `Overview`
- `Trial Balance`
- `General Ledger`
- `Profit or Loss`
- `Financial Position`
- `Cash Flows`
- `Changes in Equity`
- `Notes`
- `Fixed Assets`
- `Period Close`

## Data Model Changes

Existing tables can be extended with a new migration.

### `fixed_assets`

Add fields:

- `asset_account_id TEXT REFERENCES accounts(id)`
- `accumulated_depreciation_account_id TEXT REFERENCES accounts(id)`
- `depreciation_expense_account_id TEXT REFERENCES accounts(id)`
- `disposal_date DATE`
- `disposal_proceeds NUMERIC(14, 2)`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Purpose:

- Link each asset to its balance sheet asset account.
- Link accumulated depreciation and depreciation expense accounts.
- Support disposal/retirement later without redesign.

### `depreciation_schedules`

Add constraints/indexes:

- Unique `(company_id, asset_id, period_date)`.
- Index `(company_id, status, period_date)`.

Purpose:

- Prevent duplicate depreciation for the same asset and period.
- Allow posting draft depreciation schedules by month.

### `retained_earnings_closing_runs`

Add fields:

- `period_start DATE`
- `period_end DATE`
- `closed_at TIMESTAMPTZ`
- `created_by TEXT REFERENCES users(id)`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Purpose:

- Close by explicit date range even if an accounting period row is not selected.
- Track who posted the close and when.

### Optional `financial_report_snapshots`

Add table:

- `id TEXT PRIMARY KEY`
- `company_id TEXT NOT NULL`
- `report_type TEXT NOT NULL`
- `period_start DATE NOT NULL`
- `period_end DATE NOT NULL`
- `payload JSONB NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Purpose:

- Save generated reports for audit/review.
- Useful for year-end statements and notes.

## TypeScript Types

Add or extend types in `accounting system/lib/accounting/types.ts`.

### Fixed Asset

```ts
export interface FixedAsset {
  id: string
  assetNumber: string
  name: string
  purchaseDate: string
  purchasePrice: number
  usefulLifeMonths: number
  salvageValue: number
  status: "active" | "disposed" | "retired"
  assetAccountId?: string
  accumulatedDepreciationAccountId?: string
  depreciationExpenseAccountId?: string
  disposalDate?: string
  disposalProceeds?: number
}
```

### Depreciation Schedule

```ts
export interface DepreciationSchedule {
  id: string
  assetId: string
  periodDate: string
  depreciationAmount: number
  journalEntryId?: string
  status: "draft" | "posted"
}
```

### Financial Report Models

```ts
export interface ReportingPeriod {
  startDate: string
  endDate: string
}

export interface ProfitOrLossReport {
  period: ReportingPeriod
  revenue: ReportSection
  expenses: ReportSection
  depreciationExpense: number
  netProfitLoss: number
}

export interface FinancialPositionReport {
  asOfDate: string
  assets: ReportSection
  liabilities: ReportSection
  equity: ReportSection
  balanced: boolean
}

export interface CashFlowReport {
  period: ReportingPeriod
  operatingActivities: ReportSection
  investingActivities: ReportSection
  financingActivities: ReportSection
  netCashMovement: number
  openingCash: number
  closingCash: number
}

export interface EquityChangesReport {
  period: ReportingPeriod
  openingEquity: number
  capitalIntroduced: number
  withdrawals: number
  netProfitLoss: number
  closingEquity: number
}

export interface FinancialStatementNote {
  id: string
  title: string
  rows: Array<{ label: string; amount: number; note?: string }>
}
```

## Calculation Logic

### Trial Balance

Use posted journal entries only.

Rules:

- Debit-normal accounts: assets and expenses.
- Credit-normal accounts: liabilities, equity, revenue.
- Report debit and credit columns separately.
- Add a balanced flag:
  - `totalDebits === totalCredits`

### Profit Or Loss

Inputs:

- Posted journal entries within selected period.
- Revenue accounts.
- Expense accounts.

Rules:

- Revenue = credits minus debits for revenue accounts.
- Expenses = debits minus credits for expense accounts.
- Depreciation expense is included in expenses and separately highlighted.
- Net Profit/Loss = Revenue - Expenses.

### Statement Of Financial Position

Inputs:

- Posted journal entries up to report end date.
- Retained earnings closing entries.
- Current period profit/loss if not yet closed.

Rules:

- Assets = natural asset balances.
- Liabilities = natural liability balances.
- Equity = natural equity balances plus current profit/loss when not closed.
- Balance check:
  - Assets = Liabilities + Equity

### Cash Flows

Phase 1 classification:

- Cash accounts identified by account type `asset` and name/code patterns for cash/bank.
- Operating:
  - Customer receipts.
  - Vendor payments.
  - Payroll, tax, rent, and normal expense payments.
- Investing:
  - Fixed asset purchases and disposals.
- Financing:
  - Owner capital, loans, withdrawals, dividends.

Implementation approach:

- Add helper `classifyCashFlowLine(entry, cashLine, accounts)`.
- Use non-cash counterpart accounts to classify.
- Return unclassified rows separately in Notes or report warnings.

### Statement Of Changes In Equity

Inputs:

- Equity account balances.
- Profit/loss for the selected period.
- Capital contribution and withdrawal account movements.
- Retained earnings closing runs.

Rules:

- Opening equity = equity balance before period start.
- Add capital introduced.
- Less withdrawals/dividends.
- Add net profit or subtract net loss.
- Closing equity = equity balance at period end.

### Notes To Financial Statements

Generate structured notes from ledger and sub-ledgers:

- Significant accounting policies placeholder.
- Revenue breakdown by revenue account.
- Expense breakdown by expense account.
- Fixed assets:
  - Cost
  - Accumulated depreciation
  - Net book value
- Receivables aging summary.
- Payables aging summary.
- Inventory summary from stock balances.
- Cash and bank balances.

## Depreciation Logic

### Monthly Straight-Line Depreciation

Formula:

```ts
depreciableAmount = purchasePrice - salvageValue
monthlyDepreciation = depreciableAmount / usefulLifeMonths
```

Rules:

- Start depreciation from the purchase month unless configured otherwise.
- Stop when:
  - useful life is completed
  - asset is disposed
  - accumulated depreciation reaches depreciable amount
- Round monthly depreciation to two decimals.
- Final month adjusts rounding difference.

### Generate Schedule

Function:

```ts
generateDepreciationSchedule(asset, throughDate): DepreciationSchedule[]
```

Behavior:

- Calculate missing monthly schedule rows.
- Do not duplicate existing schedules.
- Create draft schedules by default.

### Post Depreciation

Journal entry:

- Debit: Depreciation Expense.
- Credit: Accumulated Depreciation.

Controls:

- Must pass double-entry validation.
- Must respect closed period governance.
- Mark schedule row as `posted`.
- Link schedule to `journal_entry_id`.

## Period-End Closing Logic

### Close Period To Retained Earnings

Inputs:

- `periodStart`
- `periodEnd`
- `retainedEarningsAccountId`
- confirmation metadata

Algorithm:

1. Calculate total revenue and expenses for the period.
2. Calculate net income.
3. Create closing journal entry:
   - Debit revenue accounts for their credit balances.
   - Credit expense accounts for their debit balances.
   - Balance to retained earnings.
4. Mark closing run as posted.
5. Link closing run to journal entry.

Controls:

- Prevent duplicate posted close for the same period.
- Require confirmation phrase.
- Block close if unposted depreciation schedules exist in the period.
- Block close if trial balance is not balanced.

## API Design

Use the existing `/api/accounting` action pattern.

### Reporting Actions

```ts
{ action: "getFinancialReports", periodStart, periodEnd }
{ action: "saveFinancialReportSnapshot", reportType, periodStart, periodEnd, payload }
```

### Fixed Asset Actions

```ts
{ action: "createFixedAsset", asset }
{ action: "updateFixedAsset", id, asset }
{ action: "generateDepreciationSchedules", throughDate }
{ action: "postDepreciationSchedule", id, confirmation }
```

### Period Close Actions

```ts
{ action: "previewPeriodClose", periodStart, periodEnd }
{ action: "postPeriodClose", periodStart, periodEnd, retainedEarningsAccountId, confirmation }
```

## Repository Functions

Add functions in `accounting system/lib/server/accounting-repository.ts`:

- `listFixedAssets()`
- `createFixedAsset(asset)`
- `updateFixedAsset(id, asset)`
- `listDepreciationSchedules()`
- `generateDepreciationSchedules(throughDate)`
- `postDepreciationSchedule(id, confirmation)`
- `previewPeriodClose(periodStart, periodEnd)`
- `postPeriodClose(periodStart, periodEnd, retainedEarningsAccountId, confirmation)`
- `getFinancialReports(periodStart, periodEnd)`
- `saveFinancialReportSnapshot(snapshot)`

## Frontend Implementation

### Reports Page Layout

Update `accounting system/components/reports/reports-view.tsx`.

Controls:

- Period start date.
- Period end date.
- As-of date for balance sheet.
- Refresh button.
- Save snapshot button.

Views:

- Overview cards.
- Trial Balance table.
- General Ledger table with account filter.
- Profit or Loss statement.
- Financial Position statement.
- Cash Flow statement.
- Changes in Equity statement.
- Notes table.
- Fixed Assets register.
- Period Close panel.

### Fixed Asset UI

Add:

- New asset dialog.
- Edit asset dialog.
- Asset register table.
- Depreciation schedule drawer/dialog.
- Generate schedules button.
- Post depreciation button with confirmation.

Fields:

- Asset number.
- Name.
- Purchase date.
- Purchase price.
- Useful life months.
- Salvage value.
- Asset account.
- Accumulated depreciation account.
- Depreciation expense account.
- Status.

### Period Close UI

Add:

- Period close preview.
- Revenue total.
- Expense total.
- Net profit/loss.
- Retained earnings account selector.
- Warnings:
  - Unbalanced trial balance.
  - Draft depreciation exists.
  - Period already closed.
- Confirmation dialog before posting close.

## Files Expected To Change

- `accounting system/db/migrations/010_reporting_module.sql`
- `accounting system/lib/accounting/types.ts`
- `accounting system/lib/accounting/reports.ts`
- `accounting system/lib/accounting/calculations.ts`
- `accounting system/lib/accounting/store.tsx`
- `accounting system/lib/server/accounting-repository.ts`
- `accounting system/app/api/accounting/route.ts`
- `accounting system/components/reports/reports-view.tsx`
- `accounting system/components/reports/fixed-assets-view.tsx`
- `accounting system/components/reports/period-close-view.tsx`
- `accounting system/tests/reports.test.ts`
- `accounting system/tests/depreciation.test.ts`
- `accounting system/tests/period-close.test.ts`

## Implementation Phases

### Phase 1: Reporting Calculations

- Add date-range helpers.
- Expand report builder models.
- Implement Profit or Loss sections.
- Implement Financial Position sections.
- Implement Cash Flow classification.
- Implement Changes in Equity.
- Implement Notes generation.
- Add calculation tests.

### Phase 2: Fixed Assets And Depreciation

- Add migration extensions.
- Add fixed asset and depreciation types.
- Add repository CRUD.
- Add schedule generation.
- Add depreciation posting journal entry.
- Add UI for fixed asset register and schedule posting.
- Add tests.

### Phase 3: Period-End Closing

- Add close preview.
- Add posted close action.
- Add retained earnings journal entry generation.
- Add duplicate-close prevention.
- Add close governance confirmation.
- Add UI close panel.
- Add tests.

### Phase 4: Reports UI Completion

- Replace basic report cards with full tabbed statements.
- Add period controls.
- Add report warnings and balanced status indicators.
- Add snapshot save action if approved.
- Smoke-test `/reports` on desktop and mobile.

## Acceptance Criteria

- User can select a period and view all major financial statements.
- Trial balance totals debits and credits and flags imbalance.
- Profit or Loss includes revenue, expenses, depreciation, and net profit/loss.
- Financial Position balances assets against liabilities plus equity.
- Cash Flow separates operating, investing, and financing movements where classifiable.
- Changes in Equity shows opening equity, capital movement, net profit/loss, and closing equity.
- Notes include ledger breakdowns and sub-ledger summaries.
- User can create and modify fixed assets.
- User can generate and post depreciation schedules.
- Depreciation posting creates balanced journal entries.
- User can preview and post period close to retained earnings.
- Duplicate period closes are blocked.
- Typecheck passes.
- Test suite passes.

## Review Questions

- Should depreciation start in the purchase month or the month after purchase?
- Which retained earnings account should be the default?
- Should report snapshots be implemented in Phase 1 or deferred?
- Should cash-flow classification be rule-based now, or start with account-pattern classification and add rules later?
