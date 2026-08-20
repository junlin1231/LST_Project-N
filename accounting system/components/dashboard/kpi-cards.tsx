"use client"

import { Wallet, TrendingUp, Landmark, FileClock } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Amount } from "@/components/amount"
import { useAccounting } from "@/lib/accounting/store"

export function KpiCards() {
  const { cashBalance, arBalance, totalRevenue, netIncome } = useAccounting()

  const items = [
    { label: "Cash & Bank", value: cashBalance, icon: Wallet, hint: "Cash on hand plus bank accounts" },
    { label: "Accounts Receivable", value: arBalance, icon: FileClock, hint: "Outstanding AR customer balances" },
    { label: "Revenue to Date", value: totalRevenue, icon: TrendingUp, hint: "Total revenue account activity" },
    { label: "Net Income", value: netIncome, icon: Landmark, hint: "Revenue less expenses", sign: true },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Card key={item.label} className="gap-0 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <span className="flex size-8 items-center justify-center rounded-md bg-secondary text-primary">
                <Icon className="size-4" />
              </span>
            </div>
            <Amount
              value={item.value}
              colorBySign={item.sign}
              className="mt-3 text-2xl font-semibold"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{item.hint}</p>
          </Card>
        )
      })}
    </div>
  )
}
