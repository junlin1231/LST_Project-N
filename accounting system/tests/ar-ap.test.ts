import assert from "node:assert/strict"
import test from "node:test"
import { calculateCustomerAging, calculateVendorAging, summarizeAging } from "../lib/accounting/ar-ap"
import type { Contact, Invoice, VendorBill } from "../lib/accounting/types"

const contacts: Contact[] = [
  { id: "c1", name: "Customer One", type: "client", email: "one@example.com", creditLimit: 1000 },
  { id: "v1", name: "Vendor One", type: "vendor", email: "vendor@example.com" },
]

const invoices: Invoice[] = [
  {
    id: "inv-current",
    number: "INV-CURRENT",
    clientId: "c1",
    issueDate: "2026-08-01",
    dueDate: "2026-08-31",
    status: "sent",
    taxRate: 0,
    items: [{ id: "line-1", description: "Current", quantity: 1, unitPrice: 100 }],
  },
  {
    id: "inv-overdue",
    number: "INV-OVERDUE",
    clientId: "c1",
    issueDate: "2026-06-01",
    dueDate: "2026-06-30",
    status: "overdue",
    taxRate: 0,
    items: [{ id: "line-2", description: "Overdue", quantity: 1, unitPrice: 300 }],
  },
  {
    id: "inv-paid",
    number: "INV-PAID",
    clientId: "c1",
    issueDate: "2026-05-01",
    dueDate: "2026-05-31",
    status: "paid",
    taxRate: 0,
    items: [{ id: "line-3", description: "Paid", quantity: 1, unitPrice: 500 }],
  },
]

const vendorBills: VendorBill[] = [
  {
    id: "bill-current",
    vendorId: "v1",
    billNumber: "BILL-CURRENT",
    billDate: "2026-08-01",
    dueDate: "2026-08-31",
    status: "open",
    subtotal: 200,
    taxAmount: 0,
    totalAmount: 200,
  },
  {
    id: "bill-overdue",
    vendorId: "v1",
    billNumber: "BILL-OVERDUE",
    billDate: "2026-06-01",
    dueDate: "2026-06-30",
    status: "overdue",
    subtotal: 400,
    taxAmount: 0,
    totalAmount: 400,
  },
  {
    id: "bill-paid",
    vendorId: "v1",
    billNumber: "BILL-PAID",
    billDate: "2026-05-01",
    dueDate: "2026-05-31",
    status: "paid",
    subtotal: 600,
    taxAmount: 0,
    totalAmount: 600,
  },
]

test("customer aging excludes paid invoices and vendors", () => {
  const aging = calculateCustomerAging(contacts, invoices, "2026-08-17")

  assert.equal(aging.length, 1)
  assert.equal(aging[0].current, 100)
  assert.equal(aging[0].days31To60, 300)
  assert.equal(aging[0].total, 400)
  assert.equal(aging[0].creditAvailable, 600)
})

test("aging summary totals each bucket", () => {
  const summary = summarizeAging(calculateCustomerAging(contacts, invoices, "2026-08-17"))
  const byLabel = new Map(summary.map((bucket) => [bucket.label, bucket.amount]))

  assert.equal(byLabel.get("Current"), 100)
  assert.equal(byLabel.get("31-60"), 300)
  assert.equal(byLabel.get("90+"), 0)
})

test("vendor aging excludes paid bills and customers", () => {
  const aging = calculateVendorAging(contacts, vendorBills, "2026-08-17")

  assert.equal(aging.length, 1)
  assert.equal(aging[0].current, 200)
  assert.equal(aging[0].days31To60, 400)
  assert.equal(aging[0].total, 600)
})
