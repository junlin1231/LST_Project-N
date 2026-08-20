"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Amount } from "@/components/amount"
import { useAccounting } from "@/lib/accounting/store"
import { formatDate } from "@/lib/accounting/utils"

export function RecentEntries() {
  const { journalEntries } = useAccounting()
  const recent = [...journalEntries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Recent Entries</CardTitle>
          <CardDescription>Latest journal entries recorded in the ledger.</CardDescription>
        </div>
        <Link
          href="/journal"
          className="flex items-center gap-1 text-sm text-primary hover:underline"
        >
          View All <ArrowUpRight className="size-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {recent.map((entry) => {
          const amount = entry.lines.reduce((sum, l) => sum + l.debit, 0)
          return (
            <div key={entry.id} className="flex items-center justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{entry.description}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(entry.date)}
                  {entry.reference ? ` - ${entry.reference}` : ""}
                </p>
              </div>
              <Amount value={amount} className="text-sm" />
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
