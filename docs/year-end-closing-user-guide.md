# Year-End Closing User Guide

## Purpose

Year-End Closing is used to close one financial year, lock its historical data, and carry the closing balances forward as the next year's opening balances.

Example:

- Close `2025`.
- System creates the opening balance for `2026`.
- `2025` becomes locked and view-only.

## Where To Use It

Open the accounting app:

```text
http://localhost:3000
```

Go to:

```text
Reports > Year-End
```

## Main Workflow

### 1. Select Fiscal Year

Choose the year you want to close.

Example:

```text
2025
```

The system treats this as:

```text
2025-01-01 to 2025-12-31
```

The next year will be:

```text
2026-01-01 to 2026-12-31
```

## 2. Review The Preview

Before closing, the system shows:

- Revenue total.
- Expense total.
- Net income or loss.
- Closing balance by account.
- New year's opening balance lines.
- Warnings or blocking issues.

Check these before posting.

Important:

- Revenue and expense accounts should be closed to retained earnings.
- Asset, liability, and equity accounts should carry forward.
- The opening balance must balance debit and credit.

## 3. Fix Warnings Before Closing

The system can block closing if:

- Trial balance is not balanced.
- Draft depreciation schedules still exist.
- The year is already closed.
- Opening balance cannot be generated correctly.

Fix the issue first, then preview again.

## 4. Post Year-End Close

Click:

```text
Post Year-End Close
```

The system will ask for confirmation.

You must:

- Enter an audit reason.
- Type the confirmation phrase.

After confirmation, the system automatically:

- Creates the year-end closing journal entry.
- Posts net profit or loss to retained earnings.
- Creates the next financial year if it does not exist.
- Creates the next year's opening balance journal entry.
- Locks the closed year.
- Stores audit records and close snapshots.

## What Happens After Closing

If you close `2025`, the system will:

- Create closing entry: `YEC-2025`.
- Create opening entry: `OPEN-2026`.
- Lock financial year `2025`.
- Keep financial year `2026` open.

## Locked Year Rules

After a year is closed, users can still view:

- Reports.
- Journal entries.
- Invoices.
- Receipts.
- Bills.
- Payments.
- Stock movements.
- Source documents.
- Audit logs.

Users cannot normally:

- Create new transactions dated inside the closed year.
- Edit transactions dated inside the closed year.
- Delete closed-year records.
- Post draft entries into the closed year.
- Reverse or adjust closed-year journal entries without approval.
- Import documents, bank data, stock data, invoices, or bills into the closed year.

## Opening Balance Rules

The previous year's closing balance becomes the new year's opening balance.

Carried forward:

- Assets.
- Liabilities.
- Equity.
- Retained earnings.

Not carried forward:

- Revenue.
- Expenses.

Revenue and expenses start from zero in the new year.

## Unlocking A Closed Year

If a closed year needs correction, users should not freely edit it.

Instead:

### 1. Request Unlock

In:

```text
Reports > Year-End
```

Choose the locked year and enter:

- Reason.
- Impact summary.

Then submit the unlock request.

### 2. Management Approval

An authorized management user reviews the request.

If approved, the system sets an unlock time limit.

Example:

```text
Allowed until 2026-09-09 23:59
```

During this window, approved corrections can be made.

### 3. Audit Trail

Unlock approvals are recorded in the audit log.

The system records:

- Who requested the unlock.
- Who approved it.
- Why it was approved.
- How long it is allowed.
- What period was unlocked.

## Recommended Correction Practice

For closed-year corrections, use adjustment or reversal entries where possible.

Avoid direct editing unless management policy allows it.

This keeps the accounting history easier to audit.

## Simple Example

### Before Close

Financial year:

```text
2025
```

Balances:

```text
Cash: 10,000 debit
Capital: 7,000 credit
Revenue: 5,000 credit
Expense: 2,000 debit
```

Net income:

```text
5,000 - 2,000 = 3,000
```

### During Close

System creates closing entry:

```text
Debit Revenue: 5,000
Credit Expense: 2,000
Credit Retained Earnings: 3,000
```

### After Close

Closing balance:

```text
Cash: 10,000 debit
Capital: 7,000 credit
Retained Earnings: 3,000 credit
Revenue: 0
Expense: 0
```

### New Year Opening Balance

System creates opening balance for `2026`:

```text
Debit Cash: 10,000
Credit Capital: 7,000
Credit Retained Earnings: 3,000
```

## Current Implementation Notes

Implemented now:

- Year-end preview.
- Year-end close posting.
- Automatic next-year period creation.
- Automatic opening balance posting.
- Closed year locking.
- Unlock request.
- Unlock approval.
- Audit records.

Not implemented yet:

- Full reclose workflow after corrections.
- Automatic AR/AP, stock, bank, and fixed asset sub-ledger reconciliation blocking.
- Custom fiscal year start month.

## Checklist Before Closing

- [ ] All normal entries are posted.
- [ ] Trial balance is balanced.
- [ ] Depreciation schedules are posted.
- [ ] Bank reconciliation is reviewed.
- [ ] AR and AP balances are reviewed.
- [ ] Stock balance is reviewed.
- [ ] Retained earnings account is correct.
- [ ] Opening balance preview is balanced.
- [ ] Management is ready to lock the year.
