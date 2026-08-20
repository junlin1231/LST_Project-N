import { PageHeader } from "@/components/page-header"
import { AccountsView } from "@/components/accounts/accounts-view"
import { NewAccountDialog } from "@/components/accounts/new-account-dialog"

export default function SystemMasterDataPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="System Master Data"
        description="Manage the chart of accounts and core ledger master records."
        actions={<NewAccountDialog />}
      />
      <AccountsView />
    </div>
  )
}
