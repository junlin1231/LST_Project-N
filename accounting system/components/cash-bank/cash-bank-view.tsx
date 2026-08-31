"use client"

import { useMemo, useState } from "react"
import { ArrowDownToLine, ArrowUpFromLine, FileText, Landmark, Search, WalletCards, type LucideIcon } from "lucide-react"
import { Amount } from "@/components/amount"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { buildCashBankSummary, type CashBankAccountRow, type CashBankTransaction } from "@/lib/accounting/cash-bank"
import { useAccounting } from "@/lib/accounting/store"
import { formatDate, invoiceTotal } from "@/lib/accounting/utils"
import type { WorkflowDocumentType } from "@/lib/accounting/types"

interface RelatedDocument {
  id: string
  number: string
  type: string
  party?: string
  date: string
  status: string
  amount: number
}

function titleCase(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

function documentTypeLabel(type: WorkflowDocumentType) {
  return titleCase(type)
}

function EmptyState({ label }: { label: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{label}</p>
}

function isCashAccountName(name: string) {
  return /\b(cash|petty cash|wallet)\b/i.test(name)
}

function isBankAccountName(name: string) {
  return /\b(bank|checking|cheque|savings)\b/i.test(name)
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  secondary,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone?: "default" | "receive" | "pay"
  secondary?: number
}) {
  const toneClass = tone === "receive" ? "bg-emerald-500/10 text-emerald-700" : tone === "pay" ? "bg-rose-500/10 text-rose-700" : "bg-muted text-muted-foreground"

  return (
    <Card className="rounded-md py-0">
      <CardContent className="flex min-h-24 items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Amount value={value} className="text-xl font-semibold" />
            {typeof secondary === "number" ? <Amount value={secondary} className="text-sm font-medium text-muted-foreground" /> : null}
          </div>
        </div>
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function FlowMetricCard({ receivedTotal, paidTotal }: { receivedTotal: number; paidTotal: number }) {
  return (
    <Card className="rounded-md py-0">
      <CardContent className="min-h-24 p-4">
        <p className="text-xs font-medium text-muted-foreground">Receive / Pay</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-emerald-700">
              <ArrowDownToLine className="size-3.5" />
              <span>Receive</span>
            </div>
            <Amount value={receivedTotal} className="text-base font-semibold" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-rose-700">
              <ArrowUpFromLine className="size-3.5" />
              <span>Pay</span>
            </div>
            <Amount value={paidTotal} className="text-base font-semibold" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function PanelHeader({
  title,
  description,
  count,
}: {
  title: string
  description: string
  count?: number
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {typeof count === "number" ? <Badge variant="outline">{count.toLocaleString()} rows</Badge> : null}
    </div>
  )
}

function AccountTable({
  rows,
  emptyLabel,
  title,
  description,
}: {
  rows: CashBankAccountRow[]
  emptyLabel: string
  title: string
  description: string
}) {
  return (
    <Card className="rounded-md py-0">
      <PanelHeader title={title} description={description} count={rows.length} />
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState label={emptyLabel} />
        ) : (
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="h-10">Code</TableHead>
                <TableHead className="h-10">Account</TableHead>
                <TableHead className="h-10">Last Activity</TableHead>
                <TableHead className="h-10 text-right">Txn</TableHead>
                <TableHead className="h-10 text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.account.id}>
                  <TableCell className="py-2 font-mono text-xs">{row.account.code}</TableCell>
                  <TableCell className="py-2 font-medium">{row.account.name}</TableCell>
                  <TableCell className="py-2 text-muted-foreground">{row.lastActivity ? formatDate(row.lastActivity) : "-"}</TableCell>
                  <TableCell className="py-2 text-right">{row.transactionCount}</TableCell>
                  <TableCell className="py-2 text-right"><Amount value={row.balance} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function TransactionTable({
  transactions,
  emptyLabel,
  title,
  description,
  onOpen,
}: {
  transactions: CashBankTransaction[]
  emptyLabel: string
  title: string
  description: string
  onOpen: (transaction: CashBankTransaction) => void
}) {
  return (
    <Card className="rounded-md py-0">
      <PanelHeader title={title} description={description} count={transactions.length} />
      <CardContent className="p-0">
        {transactions.length === 0 ? (
          <EmptyState label={emptyLabel} />
        ) : (
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="h-10">Date</TableHead>
                <TableHead className="h-10">Reference</TableHead>
                <TableHead className="h-10">Account</TableHead>
                <TableHead className="h-10">Counterparty</TableHead>
                <TableHead className="h-10">Description</TableHead>
                <TableHead className="h-10 text-right">Inflow</TableHead>
                <TableHead className="h-10 text-right">Outflow</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow
                  key={transaction.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => onOpen(transaction)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onOpen(transaction)
                    }
                  }}
                >
                  <TableCell className="py-2.5 text-muted-foreground">{formatDate(transaction.date)}</TableCell>
                  <TableCell className="py-2.5 font-mono text-xs">{transaction.reference ?? "-"}</TableCell>
                  <TableCell className="py-2.5">{transaction.account.name}</TableCell>
                  <TableCell className="max-w-52 truncate py-2.5">{transaction.counterparty}</TableCell>
                  <TableCell className="max-w-sm truncate py-2.5 text-muted-foreground">{transaction.description}</TableCell>
                  <TableCell className="py-2.5 text-right"><Amount value={transaction.inflow} muted={transaction.inflow === 0} /></TableCell>
                  <TableCell className="py-2.5 text-right"><Amount value={transaction.outflow} muted={transaction.outflow === 0} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export function CashBankView() {
  const {
    accounts,
    contacts,
    invoices,
    vendorBills,
    receipts,
    paymentVouchers,
    workflowDocuments,
    journalEntries,
  } = useAccounting()
  const [search, setSearch] = useState("")
  const [selectedTransaction, setSelectedTransaction] = useState<CashBankTransaction | null>(null)
  const summary = useMemo(() => buildCashBankSummary(accounts, journalEntries), [accounts, journalEntries])
  const selectedEntry = selectedTransaction
    ? journalEntries.find((entry) => entry.id === selectedTransaction.journalEntryId) ?? null
    : null
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])
  const contactName = (id?: string) => contacts.find((contact) => contact.id === id)?.name ?? "-"
  const transfers = summary.transactions.filter((transaction) =>
    summary.accountRows.some((row) => row.account.name === transaction.counterparty),
  )
  const transferIds = useMemo(() => new Set(transfers.map((transaction) => transaction.id)), [transfers])
  const relatedDocuments = useMemo<RelatedDocument[]>(() => {
    if (!selectedTransaction) return []
    const reference = selectedTransaction.reference?.trim()
    const related: RelatedDocument[] = []

    for (const receipt of receipts) {
      if (receipt.journalEntryId !== selectedTransaction.journalEntryId && receipt.receiptNumber !== reference) continue
      const invoice = receipt.invoiceId ? invoices.find((record) => record.id === receipt.invoiceId) : undefined
      related.push({
        id: receipt.id,
        number: receipt.receiptNumber,
        type: "Receipt",
        party: invoice ? contactName(invoice.clientId) : "Unapplied",
        date: receipt.receiptDate,
        status: receipt.status,
        amount: receipt.amount,
      })
      if (invoice) {
        related.push({
          id: invoice.id,
          number: invoice.number,
          type: "Invoice",
          party: contactName(invoice.clientId),
          date: invoice.issueDate,
          status: invoice.status,
          amount: invoiceTotal(invoice),
        })
      }
    }

    for (const voucher of paymentVouchers) {
      if (voucher.journalEntryId !== selectedTransaction.journalEntryId && voucher.voucherNumber !== reference) continue
      const bill = voucher.vendorBillId ? vendorBills.find((record) => record.id === voucher.vendorBillId) : undefined
      related.push({
        id: voucher.id,
        number: voucher.voucherNumber,
        type: "Payment Voucher",
        party: bill ? contactName(bill.vendorId) : "Vendor Advance",
        date: voucher.paymentDate,
        status: voucher.status,
        amount: voucher.amount,
      })
      if (bill) {
        related.push({
          id: bill.id,
          number: bill.billNumber,
          type: "Vendor Bill",
          party: contactName(bill.vendorId),
          date: bill.billDate,
          status: bill.status,
          amount: bill.totalAmount,
        })
      }
    }

    for (const invoice of invoices) {
      if (invoice.number !== reference || related.some((document) => document.id === invoice.id)) continue
      related.push({
        id: invoice.id,
        number: invoice.number,
        type: "Invoice",
        party: contactName(invoice.clientId),
        date: invoice.issueDate,
        status: invoice.status,
        amount: invoiceTotal(invoice),
      })
    }

    for (const bill of vendorBills) {
      if (bill.billNumber !== reference || related.some((document) => document.id === bill.id)) continue
      related.push({
        id: bill.id,
        number: bill.billNumber,
        type: "Vendor Bill",
        party: contactName(bill.vendorId),
        date: bill.billDate,
        status: bill.status,
        amount: bill.totalAmount,
      })
    }

    for (const document of workflowDocuments) {
      if (document.documentNumber !== reference) continue
      related.push({
        id: document.id,
        number: document.documentNumber,
        type: documentTypeLabel(document.documentType),
        party: contactName(document.contactId),
        date: document.documentDate,
        status: document.status,
        amount: document.totalAmount,
      })
    }

    return related
  }, [contactName, invoices, paymentVouchers, receipts, selectedTransaction, vendorBills, workflowDocuments])
  const filteredTransactions = summary.transactions.filter((transaction) => {
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    return [
      transaction.description,
      transaction.reference ?? "",
      transaction.account.name,
      transaction.account.code,
      transaction.counterparty,
    ].some((value) => value.toLowerCase().includes(needle))
  })
  const cashRows = summary.accountRows.filter((row) => isCashAccountName(row.account.name))
  const bankRows = summary.accountRows.filter((row) => isBankAccountName(row.account.name) || !isCashAccountName(row.account.name))
  const cashTransactions = filteredTransactions.filter((transaction) => isCashAccountName(transaction.account.name))
  const bankTransactions = filteredTransactions.filter((transaction) => isBankAccountName(transaction.account.name) || !isCashAccountName(transaction.account.name))
  const receiveTransactions = filteredTransactions.filter((transaction) => transaction.inflow > 0 && !transferIds.has(transaction.id))
  const payTransactions = filteredTransactions.filter((transaction) => transaction.outflow > 0 && !transferIds.has(transaction.id))
  const filteredTransfers = transfers.filter((transaction) => filteredTransactions.some((candidate) => candidate.id === transaction.id))
  const cashBalance = cashRows.reduce((sum, row) => sum + row.balance, 0)
  const bankBalance = bankRows.reduce((sum, row) => sum + row.balance, 0)
  const receivedTotal = receiveTransactions.reduce((sum, transaction) => sum + transaction.inflow, 0)
  const paidTotal = payTransactions.reduce((sum, transaction) => sum + transaction.outflow, 0)
  const openTransaction = (transaction: CashBankTransaction) => setSelectedTransaction(transaction)

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Cash & Bank Balance" value={summary.totalBalance} icon={WalletCards} />
        <MetricCard label="Cash Balance" value={cashBalance} icon={WalletCards} />
        <MetricCard label="Bank Balance" value={bankBalance} icon={Landmark} />
        <FlowMetricCard receivedTotal={receivedTotal} paidTotal={paidTotal} />
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 text-sm"
            placeholder="Search reference, account, counterparty"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{filteredTransactions.length} transactions</Badge>
          <span className="h-3 w-px bg-border" />
          <Badge variant="outline">{filteredTransfers.length} transfers</Badge>
        </div>
      </div>

      <Tabs defaultValue="cash" className="gap-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-md p-1">
          <TabsTrigger className="h-9 flex-none px-4" value="cash">Cash</TabsTrigger>
          <TabsTrigger className="h-9 flex-none px-4" value="bank">Bank</TabsTrigger>
          <TabsTrigger className="h-9 flex-none px-4" value="receive">Receive</TabsTrigger>
          <TabsTrigger className="h-9 flex-none px-4" value="pay">Pay</TabsTrigger>
          <TabsTrigger className="h-9 flex-none px-4" value="transfers">Transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="cash">
          <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
            <AccountTable
              rows={cashRows}
              title="Cash Accounts"
              description="Physical cash and petty cash balances from posted ledger lines."
              emptyLabel="No cash accounts found in the chart of accounts."
            />
            <TransactionTable
              transactions={cashTransactions}
              title="Cash Register"
              description="Cash receipts, payments, and transfers touching cash accounts."
              emptyLabel="No cash transactions match this view."
              onOpen={openTransaction}
            />
          </div>
        </TabsContent>

        <TabsContent value="bank">
          <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
            <AccountTable
              rows={bankRows}
              title="Bank Accounts"
              description="Bank, checking, and savings balances from posted ledger lines."
              emptyLabel="No bank accounts found in the chart of accounts."
            />
            <TransactionTable
              transactions={bankTransactions}
              title="Bank Register"
              description="Bank receipts, payments, and transfers touching bank accounts."
              emptyLabel="No bank transactions match this view."
              onOpen={openTransaction}
            />
          </div>
        </TabsContent>

        <TabsContent value="receive">
          <TransactionTable
            transactions={receiveTransactions}
            title="Money Received"
            description="External inflows only. Internal cash and bank transfers are excluded."
            emptyLabel="No received money matches this view."
            onOpen={openTransaction}
          />
        </TabsContent>

        <TabsContent value="pay">
          <TransactionTable
            transactions={payTransactions}
            title="Money Paid"
            description="External outflows only. Internal cash and bank transfers are excluded."
            emptyLabel="No paid money matches this view."
            onOpen={openTransaction}
          />
        </TabsContent>

        <TabsContent value="transfers">
          <Card className="rounded-md py-0">
            <PanelHeader
              title="Internal Transfers"
              description="Cash-to-bank and bank-to-bank movements detected from both sides of the ledger."
              count={filteredTransfers.length}
            />
            <CardContent className="p-0">
              {filteredTransfers.length === 0 ? (
                <EmptyState label="No cash-to-bank or bank-to-bank transfers detected yet." />
              ) : (
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="h-10">Date</TableHead>
                      <TableHead className="h-10">Reference</TableHead>
                      <TableHead className="h-10">From / To</TableHead>
                      <TableHead className="h-10">Status</TableHead>
                      <TableHead className="h-10 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransfers.map((transfer) => (
                      <TableRow
                        key={transfer.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer"
                        onClick={() => openTransaction(transfer)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            openTransaction(transfer)
                          }
                        }}
                      >
                        <TableCell className="py-2.5 text-muted-foreground">{formatDate(transfer.date)}</TableCell>
                        <TableCell className="py-2.5 font-mono text-xs">{transfer.reference ?? "-"}</TableCell>
                        <TableCell className="py-2.5">
                          <span className="font-medium">{transfer.netAmount < 0 ? transfer.account.name : transfer.counterparty}</span>
                          <span className="text-muted-foreground"> to </span>
                          <span className="font-medium">{transfer.netAmount < 0 ? transfer.counterparty : transfer.account.name}</span>
                        </TableCell>
                        <TableCell className="py-2.5"><Badge variant="secondary">Posted</Badge></TableCell>
                        <TableCell className="py-2.5 text-right"><Amount value={Math.max(transfer.inflow, transfer.outflow)} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={selectedTransaction !== null} onOpenChange={(open) => { if (!open) setSelectedTransaction(null) }}>
        {selectedTransaction ? (
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{selectedTransaction.reference ?? selectedTransaction.journalEntryId}</DialogTitle>
              <DialogDescription>Cash and bank movement detail with ledger lines and matched accounting documents.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-border p-2.5">
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="mt-1 font-medium">{formatDate(selectedTransaction.date)}</p>
              </div>
              <div className="rounded-md border border-border p-2.5">
                <p className="text-xs text-muted-foreground">Account</p>
                <p className="mt-1 font-medium">{selectedTransaction.account.name}</p>
              </div>
              <div className="rounded-md border border-border p-2.5">
                <p className="text-xs text-muted-foreground">Inflow</p>
                <Amount value={selectedTransaction.inflow} muted={selectedTransaction.inflow === 0} className="mt-1 font-semibold" />
              </div>
              <div className="rounded-md border border-border p-2.5">
                <p className="text-xs text-muted-foreground">Outflow</p>
                <Amount value={selectedTransaction.outflow} muted={selectedTransaction.outflow === 0} className="mt-1 font-semibold" />
              </div>
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Journal Entry</h3>
              <Card size="sm" className="rounded-md py-0">
                <CardContent className="p-0">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8">Account</TableHead>
                        <TableHead className="h-8">Description</TableHead>
                        <TableHead className="h-8 text-right">Debit</TableHead>
                        <TableHead className="h-8 text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedEntry?.lines ?? []).map((line, index) => {
                        const account = accountById.get(line.accountId)
                        return (
                          <TableRow key={`${line.accountId}-${index}`}>
                            <TableCell className="py-1.5">
                              <span className="font-mono text-xs text-muted-foreground">{account?.code ?? line.accountId}</span>
                              <span className="ml-2 font-medium">{account?.name ?? line.accountId}</span>
                            </TableCell>
                            <TableCell className="py-1.5">{selectedEntry?.description ?? selectedTransaction.description}</TableCell>
                            <TableCell className="py-1.5 text-right"><Amount value={line.debit} muted={line.debit === 0} /></TableCell>
                            <TableCell className="py-1.5 text-right"><Amount value={line.credit} muted={line.credit === 0} /></TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <dl className="grid gap-1.5 text-xs sm:grid-cols-[7rem_1fr]">
                <dt className="text-muted-foreground">Journal ID</dt>
                <dd className="font-mono">{selectedTransaction.journalEntryId}</dd>
                <dt className="text-muted-foreground">Counterparty</dt>
                <dd>{selectedTransaction.counterparty}</dd>
                <dt className="text-muted-foreground">Description</dt>
                <dd>{selectedTransaction.description}</dd>
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Related Documents</h3>
              <Card size="sm" className="rounded-md py-0">
                <CardContent className="p-0">
                  {relatedDocuments.length === 0 ? (
                    <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                      <FileText className="size-4" />
                      No invoice, bill, receipt, payment voucher, or workflow document matched this reference.
                    </div>
                  ) : (
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8">Type</TableHead>
                          <TableHead className="h-8">No.</TableHead>
                          <TableHead className="h-8">Party</TableHead>
                          <TableHead className="h-8">Date</TableHead>
                          <TableHead className="h-8">Status</TableHead>
                          <TableHead className="h-8 text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {relatedDocuments.map((document) => (
                          <TableRow key={`${document.type}-${document.id}`}>
                            <TableCell className="py-1.5">{document.type}</TableCell>
                            <TableCell className="py-1.5 font-mono">{document.number}</TableCell>
                            <TableCell className="py-1.5 font-medium">{document.party ?? "-"}</TableCell>
                            <TableCell className="py-1.5">{formatDate(document.date)}</TableCell>
                            <TableCell className="py-1.5"><Badge variant={document.status === "posted" || document.status === "paid" ? "secondary" : "outline"}>{titleCase(document.status)}</Badge></TableCell>
                            <TableCell className="py-1.5 text-right"><Amount value={document.amount} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </section>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}
