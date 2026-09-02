"use client"

import { useEffect, useState } from "react"
import { Download, Eye, MoreHorizontal } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConfirmationDialog } from "@/components/governance/confirmation-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Amount } from "@/components/amount"
import { StatusBadge } from "@/components/invoices/status-badge"
import { UPDATE_CONFIRMATION_PHRASE } from "@/lib/accounting/governance"
import { calculateCustomerAging, summarizeAging } from "@/lib/accounting/ar-ap"
import { useAccounting } from "@/lib/accounting/store"
import { exportInvoicePdf } from "@/lib/accounting/invoice-pdf"
import { DEFAULT_INVOICE_PDF_SETTINGS, type InvoicePdfSettings } from "@/lib/accounting/invoice-pdf-settings"
import { formatDate, invoiceSubtotal, invoiceTax, invoiceTotal } from "@/lib/accounting/utils"
import { INVOICE_STATUS_LABEL, type Contact, type Invoice, type InvoiceStatus, type PaymentAllocation, type Receipt } from "@/lib/accounting/types"

const STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "overdue"]

function SummaryTile({ label, value, count }: { label: string; value: number; count: number }) {
  return (
    <Card className="gap-1 p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Amount value={value} className="text-lg font-semibold" />
      <span className="text-xs text-muted-foreground">
        {count} AR invoice{count === 1 ? "" : "s"}
      </span>
    </Card>
  )
}

function DetailField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value || "-"}</p>
    </div>
  )
}

function InvoiceDetailDialog({
  invoice,
  contact,
  receipts,
  paymentAllocations,
  invoicePdfSettings,
  onOpenChange,
}: {
  invoice: Invoice | null
  contact?: Contact
  receipts: Receipt[]
  paymentAllocations: PaymentAllocation[]
  invoicePdfSettings: InvoicePdfSettings
  onOpenChange: (open: boolean) => void
}) {
  if (!invoice) return null

  const subtotal = invoiceSubtotal(invoice)
  const tax = invoiceTax(invoice)
  const total = invoiceTotal(invoice)
  const allocations = paymentAllocations.filter((allocation) => allocation.targetType === "invoice" && allocation.targetId === invoice.id)
  const paidAmount = allocations.reduce((sum, allocation) => sum + allocation.amount, 0)
  const openAmount = Math.max(total - paidAmount, 0)
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))

  return (
    <Dialog open={!!invoice} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Invoice {invoice.number}</DialogTitle>
          <DialogDescription>
            Full invoice details, customer information, line items, and settlement status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
            <div className="rounded-md border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground">Customer</p>
              <p className="mt-1 text-base font-semibold">{contact?.name ?? invoice.clientId}</p>
              {contact?.addressLines?.length ? (
                <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                  {contact.addressLines.slice(0, 4).map((line, index) => (
                    <p key={`${invoice.id}-detail-address-${index}`}>{line}</p>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                <span>{contact?.email || "-"}</span>
                <span>{contact?.phone || "-"}</span>
                <span>{contact?.taxId ? `Tax ID: ${contact.taxId}` : "Tax ID: -"}</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Issue Date" value={formatDate(invoice.issueDate)} />
              <DetailField label="Due Date" value={formatDate(invoice.dueDate)} />
              <DetailField label="Status" value={INVOICE_STATUS_LABEL[invoice.status]} />
              <DetailField label="Tax Rate" value={`${invoice.taxRate}%`} />
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24 text-right">Qty</TableHead>
                  <TableHead className="w-36 text-right">Unit Price</TableHead>
                  <TableHead className="w-36 text-right">Line Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right"><Amount value={item.unitPrice} /></TableCell>
                    <TableCell className="text-right"><Amount value={item.quantity * item.unitPrice} className="font-medium" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_18rem]">
            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-semibold">Payments</p>
              {allocations.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No receipts allocated to this invoice yet.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {allocations.map((allocation) => {
                    const receipt = receiptById.get(allocation.sourceId)
                    return (
                      <div key={allocation.id} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{receipt?.receiptNumber ?? allocation.sourceId}</p>
                          <p className="text-xs text-muted-foreground">{receipt ? formatDate(receipt.receiptDate) : formatDate(allocation.allocatedAt)}</p>
                        </div>
                        <Amount value={allocation.amount} className="font-medium" />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="rounded-md border border-border p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>Subtotal</span>
                  <Amount value={subtotal} />
                </div>
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>Tax</span>
                  <Amount value={tax} />
                </div>
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>Paid</span>
                  <Amount value={paidAmount} />
                </div>
                <div className="border-t border-border pt-2">
                  <div className="flex justify-between gap-3 font-semibold">
                    <span>Total</span>
                    <Amount value={total} />
                  </div>
                  <div className="mt-2 flex justify-between gap-3">
                    <span className="text-muted-foreground">Open Balance</span>
                    <Amount value={openAmount} className="font-semibold" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter showCloseButton>
          <Button variant="outline" onClick={() => exportInvoicePdf(invoice, contact, invoicePdfSettings)}>
            <Download className="size-4" />
            Export PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function InvoicesView() {
  const { invoices, contacts, receipts, paymentAllocations, setInvoiceStatus } = useAccounting()
  const [pendingStatusChange, setPendingStatusChange] = useState<{ invoice: Invoice; status: InvoiceStatus } | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [invoicePdfSettings, setInvoicePdfSettings] = useState<InvoicePdfSettings>(DEFAULT_INVOICE_PDF_SETTINGS)

  const customerName = (id: string) => contacts.find((c) => c.id === id)?.name ?? id

  useEffect(() => {
    fetch("/api/settings/invoice-pdf", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<InvoicePdfSettings> : DEFAULT_INVOICE_PDF_SETTINGS)
      .then(setInvoicePdfSettings)
      .catch(() => setInvoicePdfSettings(DEFAULT_INVOICE_PDF_SETTINGS))
  }, [])

  const sorted = [...invoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate))

  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + invoiceTotal(i), 0)
  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + invoiceTotal(i), 0)
  const overdue = invoices.filter((i) => i.status === "overdue").reduce((s, i) => s + invoiceTotal(i), 0)
  const agingRows = calculateCustomerAging(contacts, invoices)
  const agingSummary = summarizeAging(agingRows)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryTile
          label="AR Outstanding"
          value={outstanding}
          count={invoices.filter((i) => i.status === "sent" || i.status === "overdue").length}
        />
        <SummaryTile label="AR Collected" value={paid} count={invoices.filter((i) => i.status === "paid").length} />
        <SummaryTile label="AR Overdue" value={overdue} count={invoices.filter((i) => i.status === "overdue").length} />
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-36">AR Invoice No.</TableHead>
              <TableHead>AR Customer</TableHead>
              <TableHead>Issue / Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount incl. tax</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((inv) => (
              <TableRow key={inv.id} className="cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                <TableCell className="font-mono text-sm">{inv.number}</TableCell>
                <TableCell className="font-medium">
                  <div>{customerName(inv.clientId)}</div>
                  {contacts.find((contact) => contact.id === inv.clientId)?.addressLines?.[0] ? (
                    <div className="mt-0.5 truncate text-xs font-normal text-muted-foreground">
                      {contacts.find((contact) => contact.id === inv.clientId)?.addressLines?.[0]}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <div>{formatDate(inv.issueDate)}</div>
                  <div className="text-xs">Due {formatDate(inv.dueDate)}</div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={inv.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Amount value={invoiceTotal(inv)} className="text-sm font-medium" />
                </TableCell>
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon" className="size-8" aria-label="Change status">
                        <MoreHorizontal className="size-4" />
                      </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setSelectedInvoice(inv)}>
                        <Eye className="size-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => exportInvoicePdf(inv, contacts.find((contact) => contact.id === inv.clientId), invoicePdfSettings)}>
                        <Download className="size-4" />
                        Export PDF
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Update AR Status</div>
                      <DropdownMenuSeparator />
                      {STATUSES.map((s) => (
                        <DropdownMenuItem key={s} onClick={() => setPendingStatusChange({ invoice: inv, status: s })}>
                          {INVOICE_STATUS_LABEL[s]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <InvoiceDetailDialog
        invoice={selectedInvoice}
        contact={selectedInvoice ? contacts.find((contact) => contact.id === selectedInvoice.clientId) : undefined}
        receipts={receipts}
        paymentAllocations={paymentAllocations}
        invoicePdfSettings={invoicePdfSettings}
        onOpenChange={(open) => {
          if (!open) setSelectedInvoice(null)
        }}
      />
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">AR Aging</h2>
            <p className="text-xs text-muted-foreground">Open receivables by due-date bucket.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {agingSummary.map((bucket) => (
            <div key={bucket.label} className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">{bucket.label}</div>
              <Amount value={bucket.amount} className="mt-1 text-sm font-semibold" />
            </div>
          ))}
        </div>
      </Card>
      <ConfirmationDialog
        open={!!pendingStatusChange}
        title="Update AR Invoice Status"
        description="Review this Accounts Receivable state change before it is saved."
        impactSummary={
          pendingStatusChange
            ? `This will change AR invoice ${pendingStatusChange.invoice.number} from ${INVOICE_STATUS_LABEL[pendingStatusChange.invoice.status]} to ${INVOICE_STATUS_LABEL[pendingStatusChange.status]} for ${customerName(pendingStatusChange.invoice.clientId)}.`
            : ""
        }
        confirmationPhrase={UPDATE_CONFIRMATION_PHRASE}
        confirmLabel="Confirm & Update"
        onOpenChange={(open) => {
          if (!open) setPendingStatusChange(null)
        }}
        onConfirm={(confirmation) => {
          if (!pendingStatusChange) return
          setInvoiceStatus(pendingStatusChange.invoice.id, pendingStatusChange.status, confirmation)
          setPendingStatusChange(null)
        }}
      />
    </div>
  )
}
