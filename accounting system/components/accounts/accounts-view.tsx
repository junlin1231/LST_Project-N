"use client"

import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Amount } from "@/components/amount"
import { useAccounting } from "@/lib/accounting/store"
import { ACCOUNT_TYPE_LABEL, NORMAL_BALANCE, type AccountType } from "@/lib/accounting/types"

const TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"]

export function AccountsView() {
  const { balances, totalsByType } = useAccounting()

  return (
    <div className="space-y-6">
      {TYPE_ORDER.map((type) => {
        const rows = balances.filter((b) => b.account.type === type)
        if (rows.length === 0) return null
        return (
          <Card key={type} className="overflow-hidden py-0">
            <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{ACCOUNT_TYPE_LABEL[type]}</h2>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {NORMAL_BALANCE[type] === "debit" ? "Debit normal" : "Credit normal"}
                </Badge>
              </div>
              <Amount value={totalsByType[type]} className="text-sm font-semibold" />
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Account Name</TableHead>
                  <TableHead className="text-right">Debit Activity</TableHead>
                  <TableHead className="text-right">Credit Activity</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.account.id}>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {row.account.code}
                    </TableCell>
                    <TableCell className="font-medium">{row.account.name}</TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.debit} muted className="text-sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.credit} muted className="text-sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Amount value={row.natural} className="text-sm font-medium" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )
      })}
    </div>
  )
}
