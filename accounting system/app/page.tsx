import { PageHeader } from "@/components/page-header"
import { KpiCards } from "@/components/dashboard/kpi-cards"
import { PnlChart } from "@/components/dashboard/pnl-chart"
import { ExpenseBreakdown } from "@/components/dashboard/expense-breakdown"
import { StatementsSummary } from "@/components/dashboard/statements-summary"
import { RecentEntries } from "@/components/dashboard/recent-entries"

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Overview"
        description="Operating and financial position through August 2026."
      />
      <KpiCards />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PnlChart />
        <ExpenseBreakdown />
      </div>
      <StatementsSummary />
      <RecentEntries />
    </div>
  )
}
