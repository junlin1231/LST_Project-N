import type { Invoice } from "./types"

export function formatCurrency(amount: number, withSign = false): string {
  const sign = withSign && amount > 0 ? "+" : ""
  return (
    sign +
    new Intl.NumberFormat("en-MY", {
      style: "currency",
      currency: "MYR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  )
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return "-"
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d)
}

export function invoiceSubtotal(invoice: Invoice): number {
  return invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
}

export function invoiceTax(invoice: Invoice): number {
  return invoiceSubtotal(invoice) * (invoice.taxRate / 100)
}

export function invoiceTotal(invoice: Invoice): number {
  return invoiceSubtotal(invoice) + invoiceTax(invoice)
}

export function shortMonth(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(d)
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7) // yyyy-mm
}
