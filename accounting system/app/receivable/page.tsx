import { PageHeader } from "@/components/page-header"
import { NewInvoiceDialog } from "@/components/invoices/new-invoice-dialog"
import { NewReceiptDialog } from "@/components/receivable/new-receipt-dialog"
import { ReceivableView } from "@/components/receivable/receivable-view"

export default function ReceivablePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Receivable"
        description="Manage customer invoices, receipts, allocations, aging, and collection controls."
        actions={
          <>
            <NewReceiptDialog />
            <NewInvoiceDialog />
          </>
        }
      />
      <ReceivableView />
    </div>
  )
}
