import { cn } from "@/lib/utils"
import { INVOICE_STATUS_LABEL, type InvoiceStatus } from "@/lib/accounting/types"

const STYLES: Record<InvoiceStatus, string> = {
  draft: "bg-secondary text-muted-foreground",
  sent: "bg-chart-4/15 text-chart-4",
  paid: "bg-credit/12 text-credit",
  overdue: "bg-destructive/12 text-destructive",
}

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STYLES[status],
      )}
    >
      {INVOICE_STATUS_LABEL[status]}
    </span>
  )
}
