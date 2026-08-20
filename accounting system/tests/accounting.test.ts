import assert from "node:assert/strict"
import test from "node:test"
import {
  calculateBalances,
  calculateFinancialSummary,
  isJournalEntryBalanced,
  journalEntryTotals,
} from "../lib/accounting/calculations"
import { invoiceSubtotal, invoiceTax, invoiceTotal } from "../lib/accounting/utils"
import type { Account, Invoice, JournalEntry } from "../lib/accounting/types"

const accounts: Account[] = [
  { id: "1000", code: "1000", name: "Cash", type: "asset" },
  { id: "1200", code: "1200", name: "Accounts Receivable", type: "asset" },
  { id: "2000", code: "2000", name: "Accounts Payable", type: "liability" },
  { id: "3000", code: "3000", name: "Capital", type: "equity" },
  { id: "4000", code: "4000", name: "Service Revenue", type: "revenue" },
  { id: "5000", code: "5000", name: "Rent Expense", type: "expense" },
]

test("invoice total helpers calculate subtotal, tax, and total", () => {
  const invoice: Invoice = {
    id: "inv-test",
    number: "INV-TEST",
    clientId: "c1",
    issueDate: "2026-08-01",
    dueDate: "2026-08-31",
    status: "draft",
    taxRate: 6,
    items: [
      { id: "line-1", description: "Consulting", quantity: 2, unitPrice: 100 },
      { id: "line-2", description: "Setup", quantity: 1, unitPrice: 50 },
    ],
  }

  assert.equal(invoiceSubtotal(invoice), 250)
  assert.equal(invoiceTax(invoice), 15)
  assert.equal(invoiceTotal(invoice), 265)
})

test("journal entry balance validation accepts balanced entries", () => {
  const entry: Pick<JournalEntry, "lines"> = {
    lines: [
      { accountId: "1000", debit: 250, credit: 0 },
      { accountId: "4000", debit: 0, credit: 250 },
    ],
  }

  assert.deepEqual(journalEntryTotals(entry), { debit: 250, credit: 250 })
  assert.equal(isJournalEntryBalanced(entry), true)
})

test("journal entry balance validation rejects unbalanced entries", () => {
  const entry: Pick<JournalEntry, "lines"> = {
    lines: [
      { accountId: "1000", debit: 250, credit: 0 },
      { accountId: "4000", debit: 0, credit: 200 },
    ],
  }

  assert.deepEqual(journalEntryTotals(entry), { debit: 250, credit: 200 })
  assert.equal(isJournalEntryBalanced(entry), false)
})

test("account balances respect debit and credit normal balances", () => {
  const entries: JournalEntry[] = [
    {
      id: "je-1",
      date: "2026-08-01",
      description: "Owner contribution",
      lines: [
        { accountId: "1000", debit: 1000, credit: 0 },
        { accountId: "3000", debit: 0, credit: 1000 },
      ],
    },
    {
      id: "je-2",
      date: "2026-08-02",
      description: "Pay rent",
      lines: [
        { accountId: "5000", debit: 200, credit: 0 },
        { accountId: "1000", debit: 0, credit: 200 },
      ],
    },
  ]

  const balances = calculateBalances(accounts, entries)
  const byId = new Map(balances.map((balance) => [balance.account.id, balance]))

  assert.equal(byId.get("1000")?.natural, 800)
  assert.equal(byId.get("3000")?.natural, 1000)
  assert.equal(byId.get("5000")?.natural, 200)
})

test("draft journal entries do not affect ledger balances", () => {
  const entries: JournalEntry[] = [
    {
      id: "je-posted",
      date: "2026-08-01",
      description: "Posted revenue",
      status: "posted",
      lines: [
        { accountId: "1200", debit: 500, credit: 0 },
        { accountId: "4000", debit: 0, credit: 500 },
      ],
    },
    {
      id: "je-draft",
      date: "2026-08-02",
      description: "Draft rent",
      status: "draft",
      lines: [
        { accountId: "5000", debit: 200, credit: 0 },
        { accountId: "1000", debit: 0, credit: 200 },
      ],
    },
  ]

  const balances = calculateBalances(accounts, entries)
  const byId = new Map(balances.map((balance) => [balance.account.id, balance]))

  assert.equal(byId.get("1200")?.natural, 500)
  assert.equal(byId.get("4000")?.natural, 500)
  assert.equal(byId.get("5000")?.natural, 0)
})

test("financial summary calculates profit and balance sheet totals", () => {
  const entries: JournalEntry[] = [
    {
      id: "je-1",
      date: "2026-08-01",
      description: "Owner contribution",
      lines: [
        { accountId: "1000", debit: 1000, credit: 0 },
        { accountId: "3000", debit: 0, credit: 1000 },
      ],
    },
    {
      id: "je-2",
      date: "2026-08-02",
      description: "Earn service revenue",
      lines: [
        { accountId: "1200", debit: 500, credit: 0 },
        { accountId: "4000", debit: 0, credit: 500 },
      ],
    },
    {
      id: "je-3",
      date: "2026-08-03",
      description: "Pay rent",
      lines: [
        { accountId: "5000", debit: 200, credit: 0 },
        { accountId: "1000", debit: 0, credit: 200 },
      ],
    },
  ]

  const summary = calculateFinancialSummary(calculateBalances(accounts, entries))

  assert.equal(summary.totalRevenue, 500)
  assert.equal(summary.totalExpenses, 200)
  assert.equal(summary.netIncome, 300)
  assert.equal(summary.totalAssets, 1300)
  assert.equal(summary.totalLiabilities, 0)
  assert.equal(summary.totalEquity, 1300)
})
