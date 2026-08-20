import assert from "node:assert/strict"
import test from "node:test"
import {
  buildBalanceSheet,
  buildCashFlowBoundary,
  buildCashFlowReport,
  buildChangesInEquity,
  buildDepreciationScheduleDrafts,
  buildIncomeStatement,
  buildPeriodClosePreview,
  buildProfitOrLoss,
  buildTrialBalance,
  calculateMonthlyDepreciation,
} from "../lib/accounting/reports"
import type { Account, DepreciationSchedule, FixedAsset, JournalEntry } from "../lib/accounting/types"

const accounts: Account[] = [
  { id: "1000", code: "1000", name: "Cash", type: "asset" },
  { id: "3000", code: "3000", name: "Capital", type: "equity" },
  { id: "3900", code: "3900", name: "Retained Earnings", type: "equity" },
  { id: "4000", code: "4000", name: "Revenue", type: "revenue" },
  { id: "5000", code: "5000", name: "Expense", type: "expense" },
  { id: "5700", code: "5700", name: "Depreciation Expense", type: "expense" },
]

const entries: JournalEntry[] = [
  {
    id: "je-1",
    date: "2026-08-01",
    description: "Capital",
    status: "posted",
    lines: [
      { accountId: "1000", debit: 1000, credit: 0 },
      { accountId: "3000", debit: 0, credit: 1000 },
    ],
  },
  {
    id: "je-2",
    date: "2026-08-03",
    description: "Earned revenue",
    status: "posted",
    lines: [
      { accountId: "1000", debit: 300, credit: 0 },
      { accountId: "4000", debit: 0, credit: 300 },
    ],
  },
  {
    id: "je-3",
    date: "2026-08-04",
    description: "Paid expense",
    status: "posted",
    lines: [
      { accountId: "5000", debit: 80, credit: 0 },
      { accountId: "1000", debit: 0, credit: 80 },
    ],
  },
  {
    id: "je-4",
    date: "2026-08-02",
    description: "Draft revenue",
    status: "draft",
    lines: [
      { accountId: "1000", debit: 300, credit: 0 },
      { accountId: "4000", debit: 0, credit: 300 },
    ],
  },
]

test("trial balance excludes draft entries", () => {
  const trialBalance = buildTrialBalance(accounts, entries)
  const cash = trialBalance.find((row) => row.accountId === "1000")
  assert.equal(cash?.debit, 1220)
})

test("income statement and balance sheet derive from posted ledger", () => {
  assert.deepEqual(buildIncomeStatement(accounts, entries), { revenue: 300, expenses: 80, netIncome: 220 })
  assert.equal(buildBalanceSheet(accounts, entries).balanced, true)
})

test("cash flow boundary reports cash movement", () => {
  const boundary = buildCashFlowBoundary(accounts, entries)
  assert.equal(boundary.operatingCashMovement, 220)
  assert.equal(boundary.financingCashMovement, 1000)
})

test("full financial statements compile for a selected period", () => {
  const profit = buildProfitOrLoss(accounts, entries, "2026-08-01", "2026-08-31")
  const cashFlow = buildCashFlowReport(accounts, entries, "2026-08-01", "2026-08-31")
  const equity = buildChangesInEquity(accounts, entries, "2026-08-01", "2026-08-31")

  assert.equal(profit.netProfitLoss, 220)
  assert.equal(cashFlow.closingCash, 1220)
  assert.equal(equity.closingEquity, 1220)
})

test("depreciation helper calculates monthly drafts without duplicates", () => {
  const asset: FixedAsset = {
    id: "asset-1",
    assetNumber: "FA-1",
    name: "Equipment",
    purchaseDate: "2026-01-10",
    purchasePrice: 1200,
    usefulLifeMonths: 12,
    salvageValue: 0,
    status: "active",
  }
  const existing: DepreciationSchedule[] = [{ id: "dep-1", assetId: "asset-1", periodDate: "2026-01-31", depreciationAmount: 100, status: "draft" }]

  assert.equal(calculateMonthlyDepreciation(asset), 100)
  const drafts = buildDepreciationScheduleDrafts(asset, existing, "2026-03-31")
  assert.deepEqual(drafts.map((draft) => draft.periodDate), ["2026-02-28", "2026-03-31"])
})

test("period close preview creates revenue, expense, and retained earnings lines", () => {
  const preview = buildPeriodClosePreview(accounts, entries, [], "2026-08-01", "2026-08-31")
  assert.equal(preview.netIncome, 220)
  assert.equal(preview.trialBalanceBalanced, true)
  assert.equal(preview.lines.some((line) => line.accountId === "3900" && line.credit === 220), true)
})
