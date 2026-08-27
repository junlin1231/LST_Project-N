import { PageHeader } from "@/components/page-header"
import { CashBankView } from "@/components/cash-bank/cash-bank-view"

export default function CashBankPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Cash & Bank"
        description="Monitor bank accounts, cash balances, ledger movements, and internal transfers."
      />
      <CashBankView />
    </div>
  )
}
