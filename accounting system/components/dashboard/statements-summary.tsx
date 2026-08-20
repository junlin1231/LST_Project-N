"use client"

import { CheckCircle2, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Amount } from "@/components/amount"
import { useAccounting } from "@/lib/accounting/store"

function Row({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? "font-medium" : ""}`}>
      <span className={strong ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      <Amount value={value} className="text-sm" />
    </div>
  )
}

export function StatementsSummary() {
  const {
    totalRevenue,
    totalExpenses,
    netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
  } = useAccounting()

  const balanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profit & Loss Summary</CardTitle>
          <CardDescription>Operating performance for the current period.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <Row label="Operating Revenue" value={totalRevenue} />
          <Row label="Operating Expenses" value={totalExpenses} />
          <Row label="Net Income" value={netIncome} strong />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Balance Sheet Summary</CardTitle>
          <CardDescription>Financial position at period end.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            <Row label="Total Assets" value={totalAssets} strong />
            <Row label="Total Liabilities" value={totalLiabilities} />
            <Row label="Total Equity" value={totalEquity} />
          </div>
          <div
            className={`mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
              balanced ? "bg-credit/10 text-credit" : "bg-debit/10 text-debit"
            }`}
          >
            {balanced ? (
              <>
                <CheckCircle2 className="size-3.5" />
                Accounting equation is balanced: Assets = Liabilities + Equity
              </>
            ) : (
              <>
                <AlertTriangle className="size-3.5" />
                Accounting equation is out of balance. Review journal entries.
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
