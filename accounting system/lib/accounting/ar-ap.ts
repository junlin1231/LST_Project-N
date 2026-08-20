import { invoiceTotal } from "./utils"
import type { Contact, Invoice, VendorBill } from "./types"

export interface AgingBucket {
  label: string
  amount: number
}

export interface CustomerAging {
  customer: Contact
  current: number
  days1To30: number
  days31To60: number
  days61To90: number
  daysOver90: number
  total: number
  creditLimit?: number
  creditAvailable?: number
}

export interface VendorAging {
  vendor: Contact
  current: number
  days1To30: number
  days31To60: number
  days61To90: number
  daysOver90: number
  total: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function daysPastDue(dueDate: string, asOfDate: string) {
  const due = new Date(`${dueDate}T00:00:00.000Z`).getTime()
  const asOf = new Date(`${asOfDate}T00:00:00.000Z`).getTime()
  return Math.floor((asOf - due) / MS_PER_DAY)
}

export function calculateCustomerAging(
  contacts: Contact[],
  invoices: Invoice[],
  asOfDate = new Date().toISOString().slice(0, 10),
): CustomerAging[] {
  const customers = contacts.filter((contact) => contact.type === "client")

  return customers
    .map((customer) => {
      const openInvoices = invoices.filter((invoice) => invoice.clientId === customer.id && invoice.status !== "paid")
      const aging = {
        customer,
        current: 0,
        days1To30: 0,
        days31To60: 0,
        days61To90: 0,
        daysOver90: 0,
        total: 0,
        creditLimit: customer.creditLimit,
        creditAvailable: customer.creditLimit,
      } satisfies CustomerAging

      openInvoices.forEach((invoice) => {
        const amount = invoiceTotal(invoice)
        const overdueDays = daysPastDue(invoice.dueDate, asOfDate)
        aging.total += amount
        if (overdueDays <= 0) aging.current += amount
        else if (overdueDays <= 30) aging.days1To30 += amount
        else if (overdueDays <= 60) aging.days31To60 += amount
        else if (overdueDays <= 90) aging.days61To90 += amount
        else aging.daysOver90 += amount
      })

      if (typeof customer.creditLimit === "number") {
        aging.creditAvailable = customer.creditLimit - aging.total
      }

      return aging
    })
    .filter((aging) => aging.total > 0 || typeof aging.creditLimit === "number")
    .sort((a, b) => b.total - a.total)
}

export function summarizeAging(rows: Array<CustomerAging | VendorAging>): AgingBucket[] {
  return [
    { label: "Current", amount: rows.reduce((sum, row) => sum + row.current, 0) },
    { label: "1-30", amount: rows.reduce((sum, row) => sum + row.days1To30, 0) },
    { label: "31-60", amount: rows.reduce((sum, row) => sum + row.days31To60, 0) },
    { label: "61-90", amount: rows.reduce((sum, row) => sum + row.days61To90, 0) },
    { label: "90+", amount: rows.reduce((sum, row) => sum + row.daysOver90, 0) },
  ]
}

export function calculateVendorAging(
  contacts: Contact[],
  bills: VendorBill[],
  asOfDate = new Date().toISOString().slice(0, 10),
): VendorAging[] {
  const vendors = contacts.filter((contact) => contact.type === "vendor")

  return vendors
    .map((vendor) => {
      const openBills = bills.filter((bill) => bill.vendorId === vendor.id && bill.status !== "paid" && bill.status !== "void")
      const aging = {
        vendor,
        current: 0,
        days1To30: 0,
        days31To60: 0,
        days61To90: 0,
        daysOver90: 0,
        total: 0,
      } satisfies VendorAging

      openBills.forEach((bill) => {
        const amount = bill.totalAmount
        const overdueDays = daysPastDue(bill.dueDate, asOfDate)
        aging.total += amount
        if (overdueDays <= 0) aging.current += amount
        else if (overdueDays <= 30) aging.days1To30 += amount
        else if (overdueDays <= 60) aging.days31To60 += amount
        else if (overdueDays <= 90) aging.days61To90 += amount
        else aging.daysOver90 += amount
      })

      return aging
    })
    .filter((aging) => aging.total > 0)
    .sort((a, b) => b.total - a.total)
}
