import { PageHeader } from "@/components/page-header"
import { ReportsView } from "@/components/reports/reports-view"

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Reports" description="Trial balance, general ledger, financial statements, and cash-flow boundary." />
      <ReportsView />
    </div>
  )
}
