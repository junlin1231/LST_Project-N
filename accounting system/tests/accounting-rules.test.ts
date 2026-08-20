import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_ACCOUNTING_RULE_CONFIG,
  buildExpenseDocument,
  buildInvoicePosting,
  buildPaymentReceipt,
  buildTaxPlaceholder,
  roundMoney,
  taxAmount,
} from "../lib/accounting/rules"
import { isJournalEntryBalanced } from "../lib/accounting/calculations"

test("invoice posting rule debits receivable and credits revenue plus tax payable", () => {
  const result = buildInvoicePosting({
    invoiceId: "inv-1",
    invoiceNumber: "INV-001",
    issueDate: "2026-08-16",
    subtotal: 100,
    taxRate: 6,
  })

  assert.equal(result.ruleName, "invoice-posting")
  assert.equal(result.ruleVersion, DEFAULT_ACCOUNTING_RULE_CONFIG.version)
  assert.equal(result.journalEntry.reference, "INV-001")
  assert.deepEqual(result.journalEntry.lines, [
    { accountId: "1200", debit: 106, credit: 0 },
    { accountId: "4000", debit: 0, credit: 100 },
    { accountId: "2100", debit: 0, credit: 6 },
  ])
  assert.equal(isJournalEntryBalanced(result.journalEntry), true)
})

test("payment receipt rule debits cash and credits receivables", () => {
  const result = buildPaymentReceipt({
    paymentId: "pay-1",
    date: "2026-08-16",
    amount: 106,
    reference: "RCPT-001",
  })

  assert.deepEqual(result.journalEntry.lines, [
    { accountId: "1010", debit: 106, credit: 0 },
    { accountId: "1200", debit: 0, credit: 106 },
  ])
  assert.equal(isJournalEntryBalanced(result.journalEntry), true)
})

test("expense document rule posts unpaid expenses to accounts payable", () => {
  const result = buildExpenseDocument({
    documentId: "doc-1",
    date: "2026-08-16",
    amount: 250,
    taxRate: 8,
    vendorName: "Office Supply Partner",
  })

  assert.deepEqual(result.journalEntry.lines, [
    { accountId: "5300", debit: 250, credit: 0 },
    { accountId: "2100", debit: 20, credit: 0 },
    { accountId: "2000", debit: 0, credit: 270 },
  ])
  assert.equal(isJournalEntryBalanced(result.journalEntry), true)
})

test("expense document rule posts paid expenses to cash", () => {
  const result = buildExpenseDocument({
    documentId: "doc-2",
    date: "2026-08-16",
    amount: 250,
    paidImmediately: true,
  })

  assert.deepEqual(result.journalEntry.lines, [
    { accountId: "5300", debit: 250, credit: 0 },
    { accountId: "1010", debit: 0, credit: 250 },
  ])
  assert.equal(isJournalEntryBalanced(result.journalEntry), true)
})

test("tax placeholder rule creates a balanced draft for later jurisdiction-specific rules", () => {
  const result = buildTaxPlaceholder({
    sourceId: "tax-1",
    date: "2026-08-16",
    taxableAmount: 333.33,
    taxRate: 6,
  })

  assert.equal(result.ruleName, "tax-placeholder")
  assert.deepEqual(result.journalEntry.lines, [
    { accountId: "2100", debit: 0, credit: 20 },
    { accountId: "2000", debit: 20, credit: 0 },
  ])
  assert.equal(isJournalEntryBalanced(result.journalEntry), true)
})

test("money and tax helpers round to two decimals", () => {
  assert.equal(roundMoney(10.005), 10.01)
  assert.equal(taxAmount(19.99, 6), 1.2)
})

test("manual overrides replace generated lines and preserve override reason", () => {
  const result = buildPaymentReceipt({
    paymentId: "pay-override",
    date: "2026-08-16",
    amount: 100,
    override: {
      reason: "Customer paid into cash-on-hand instead of bank account.",
      lines: [
        { accountId: "1000", debit: 100, credit: 0 },
        { accountId: "1200", debit: 0, credit: 100 },
      ],
    },
  })

  assert.equal(result.sourceType, "manual-override")
  assert.equal(result.overrideReason, "Customer paid into cash-on-hand instead of bank account.")
  assert.deepEqual(result.journalEntry.lines, [
    { accountId: "1000", debit: 100, credit: 0 },
    { accountId: "1200", debit: 0, credit: 100 },
  ])
  assert.equal(isJournalEntryBalanced(result.journalEntry), true)
})
