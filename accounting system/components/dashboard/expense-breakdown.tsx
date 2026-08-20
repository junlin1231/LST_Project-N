"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Amount } from "@/components/amount"
import { useAccounting } from "@/lib/accounting/store"

export function ExpenseBreakdown() {
  const { expenseBreakdown, totalExpenses } = useAccounting()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Expense Breakdown</CardTitle>
        <CardDescription>Share of total expenses by account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {expenseBreakdown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No expense records yet.</p>
        ) : (
          expenseBreakdown.map((item) => {
            const pct = totalExpenses > 0 ? (item.amount / totalExpenses) * 100 : 0
            return (
              <div key={item.account.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{item.account.name}</span>
                  <Amount value={item.amount} className="text-sm" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
