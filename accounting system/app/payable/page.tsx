import { PageHeader } from "@/components/page-header"
import { NewPaymentVoucherDialog } from "@/components/payable/new-payment-voucher-dialog"
import { NewVendorBillDialog } from "@/components/payable/new-vendor-bill-dialog"
import { PayableView } from "@/components/payable/payable-view"

export default function PayablePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Payable"
        description="Manage vendor bills, payment vouchers, allocations, aging, and payment controls."
        actions={
          <>
            <NewPaymentVoucherDialog />
            <NewVendorBillDialog />
          </>
        }
      />
      <PayableView />
    </div>
  )
}
