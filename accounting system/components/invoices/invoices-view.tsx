"use client"

import { useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConfirmationDialog } from "@/components/governance/confirmation-dialog"
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
import { formatDate, invoiceTotal } from "@/lib/accounting/utils"
import { INVOICE_STATUS_LABEL, type Invoice, type InvoiceStatus } from "@/lib/accounting/types"

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

export function InvoicesView() {
  const { invoices, contacts, setInvoiceStatus } = useAccounting()
  const [pendingStatusChange, setPendingStatusChange] = useState<{ invoice: Invoice; status: InvoiceStatus } | null>(null)

  const customerName = (id: string) => contacts.find((c) => c.id === id)?.name ?? id

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
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-sm">{inv.number}</TableCell>
                <TableCell className="font-medium">{customerName(inv.clientId)}</TableCell>
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
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon" className="size-8" aria-label="Change status">
                        <MoreHorizontal className="size-4" />
                      </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
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
