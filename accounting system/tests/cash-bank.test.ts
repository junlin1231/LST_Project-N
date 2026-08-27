import assert from "node:assert/strict"
import test from "node:test"
import { buildCashBankSummary, buildCashBankTransactions, findCashBankAccounts } from "../lib/accounting/cash-bank"
import type { Account, JournalEntry } from "../lib/accounting/types"

const accounts: Account[] = [
  { id: "1000", code: "1000", name: "Cash on Hand", type: "asset" },
  { id: "1010", code: "1010", name: "Bank Account", type: "asset" },
  { id: "1200", code: "1200", name: "Trade Receivables", type: "asset" },
  { id: "4000", code: "4000", name: "Revenue", type: "revenue" },
  { id: "5000", code: "5000", name: "Expense", type: "expense" },
]

const entries: JournalEntry[] = [
  {
    id: "je-1",
    date: "2026-08-01",
    description: "Cash sale",
    reference: "SALE-1",
    status: "posted",
    lines: [
      { accountId: "1010", debit: 500, credit: 0 },
      { accountId: "4000", debit: 0, credit: 500 },
    ],
  },
  {
    id: "je-2",
    date: "2026-08-02",
    description: "Expense paid",
    reference: "EXP-1",
    status: "posted",
    lines: [
      { accountId: "5000", debit: 120, credit: 0 },
      { accountId: "1010", debit: 0, credit: 120 },
    ],
  },
  {
    id: "je-3",
    date: "2026-08-03",
    description: "Cash deposit",
    reference: "DEP-1",
    status: "posted",
    lines: [
      { accountId: "1010", debit: 200, credit: 0 },
      { accountId: "1000", debit: 0, credit: 200 },
    ],
  },
  {
    id: "je-draft",
    date: "2026-08-04",
    description: "Draft receipt",
    status: "draft",
    lines: [
      { accountId: "1010", debit: 300, credit: 0 },
      { accountId: "4000", debit: 0, credit: 300 },
    ],
  },
]

test("cash bank accounts are found from asset cash and bank records", () => {
  assert.deepEqual(findCashBankAccounts(accounts).map((account) => account.id), ["1000", "1010"])
})

test("cash bank transactions exclude draft entries and split inflow/outflow", () => {
  const transactions = buildCashBankTransactions(accounts, entries)

  assert.equal(transactions.length, 4)
  assert.equal(transactions.find((transaction) => transaction.reference === "SALE-1")?.inflow, 500)
  assert.equal(transactions.find((transaction) => transaction.reference === "EXP-1")?.outflow, 120)
})

test("cash bank summary reports balances and period movements", () => {
  const summary = buildCashBankSummary(accounts, entries, "2026-08-01", "2026-08-02")
  const bank = summary.accountRows.find((row) => row.account.id === "1010")
  const cash = summary.accountRows.find((row) => row.account.id === "1000")

  assert.equal(summary.periodInflow, 500)
  assert.equal(summary.periodOutflow, 120)
  assert.equal(summary.netMovement, 380)
  assert.equal(bank?.balance, 580)
  assert.equal(cash?.balance, -200)
  assert.equal(summary.totalBalance, 380)
})
