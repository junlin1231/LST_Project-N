"use client"

import { useMemo, useState } from "react"
import { ArrowDownToLine, FileText, Landmark, Search, WalletCards } from "lucide-react"
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
  return <p className="py-12 text-center text-sm text-muted-foreground">{label}</p>
}

function isCashAccountName(name: string) {
  return /\b(cash|petty cash|wallet)\b/i.test(name)
}

function isBankAccountName(name: string) {
  return /\b(bank|checking|cheque|savings)\b/i.test(name)
}

function AccountTable({ rows, emptyLabel }: { rows: CashBankAccountRow[]; emptyLabel: string }) {
  return (
    <Card>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <EmptyState label={emptyLabel} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="text-right">Transactions</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.account.id}>
                  <TableCell className="font-mono text-sm">{row.account.code}</TableCell>
                  <TableCell className="font-medium">{row.account.name}</TableCell>
                  <TableCell>{row.lastActivity ? formatDate(row.lastActivity) : "-"}</TableCell>
                  <TableCell className="text-right">{row.transactionCount}</TableCell>
                  <TableCell className="text-right"><Amount value={row.balance} /></TableCell>
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
  onOpen,
}: {
  transactions: CashBankTransaction[]
  emptyLabel: string
  onOpen: (transaction: CashBankTransaction) => void
}) {
  return (
    <Card>
      <CardContent className="p-0">
        {transactions.length === 0 ? (
          <EmptyState label={emptyLabel} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Inflow</TableHead>
                <TableHead className="text-right">Outflow</TableHead>
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
                  <TableCell>{formatDate(transaction.date)}</TableCell>
                  <TableCell className="font-mono text-sm">{transaction.reference ?? "-"}</TableCell>
                  <TableCell>{transaction.account.name}</TableCell>
                  <TableCell>{transaction.counterparty}</TableCell>
                  <TableCell className="max-w-sm truncate">{transaction.description}</TableCell>
                  <TableCell className="text-right"><Amount value={transaction.inflow} muted={transaction.inflow === 0} /></TableCell>
                  <TableCell className="text-right"><Amount value={transaction.outflow} muted={transaction.outflow === 0} /></TableCell>
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
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Cash & Bank Balance</p>
              <Amount value={summary.totalBalance} className="mt-1 text-xl font-semibold" />
            </div>
            <WalletCards className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Cash Balance</p>
              <Amount value={cashBalance} className="mt-1 text-xl font-semibold" />
            </div>
            <WalletCards className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Bank Balance</p>
              <Amount value={bankBalance} className="mt-1 text-xl font-semibold" />
            </div>
            <Landmark className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Receive / Pay</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                <Amount value={receivedTotal} className="font-semibold" />
                <Amount value={paidTotal} className="font-semibold" />
              </div>
            </div>
            <ArrowDownToLine className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <Search className="size-4 text-muted-foreground" />
        <Input
          className="sm:max-w-sm"
          placeholder="Search reference, account, counterparty"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Tabs defaultValue="cash" className="gap-4">
        <TabsList>
          <TabsTrigger value="cash">Cash</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
          <TabsTrigger value="receive">Receive</TabsTrigger>
          <TabsTrigger value="pay">Pay</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="cash">
          <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
            <AccountTable rows={cashRows} emptyLabel="No cash accounts found in the chart of accounts." />
            <TransactionTable transactions={cashTransactions} emptyLabel="No cash transactions match this view." onOpen={openTransaction} />
          </div>
        </TabsContent>

        <TabsContent value="bank">
          <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
            <AccountTable rows={bankRows} emptyLabel="No bank accounts found in the chart of accounts." />
            <TransactionTable transactions={bankTransactions} emptyLabel="No bank transactions match this view." onOpen={openTransaction} />
          </div>
        </TabsContent>

        <TabsContent value="receive">
          <TransactionTable transactions={receiveTransactions} emptyLabel="No received money matches this view." onOpen={openTransaction} />
        </TabsContent>

        <TabsContent value="pay">
          <TransactionTable transactions={payTransactions} emptyLabel="No paid money matches this view." onOpen={openTransaction} />
        </TabsContent>

        <TabsContent value="transfers">
          <Card>
            <CardContent className="p-0">
              {filteredTransfers.length === 0 ? (
                <EmptyState label="No cash-to-bank or bank-to-bank transfers detected yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>From / To</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
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
                        <TableCell>{formatDate(transfer.date)}</TableCell>
                        <TableCell className="font-mono text-sm">{transfer.reference ?? "-"}</TableCell>
                        <TableCell>
                          <span className="font-medium">{transfer.netAmount < 0 ? transfer.account.name : transfer.counterparty}</span>
                          <span className="text-muted-foreground"> to </span>
                          <span className="font-medium">{transfer.netAmount < 0 ? transfer.counterparty : transfer.account.name}</span>
                        </TableCell>
                        <TableCell><Badge variant="secondary">Ledger Posted</Badge></TableCell>
                        <TableCell className="text-right"><Amount value={Math.max(transfer.inflow, transfer.outflow)} /></TableCell>
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

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="mt-1 font-medium">{formatDate(selectedTransaction.date)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Account</p>
                <p className="mt-1 font-medium">{selectedTransaction.account.name}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Inflow</p>
                <Amount value={selectedTransaction.inflow} muted={selectedTransaction.inflow === 0} className="mt-1 font-semibold" />
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Outflow</p>
                <Amount value={selectedTransaction.outflow} muted={selectedTransaction.outflow === 0} className="mt-1 font-semibold" />
              </div>
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Journal Entry</h3>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedEntry?.lines ?? []).map((line, index) => {
                        const account = accountById.get(line.accountId)
                        return (
                          <TableRow key={`${line.accountId}-${index}`}>
                            <TableCell>
                              <span className="font-mono text-xs text-muted-foreground">{account?.code ?? line.accountId}</span>
                              <span className="ml-2 font-medium">{account?.name ?? line.accountId}</span>
                            </TableCell>
                            <TableCell>{selectedEntry?.description ?? selectedTransaction.description}</TableCell>
                            <TableCell className="text-right"><Amount value={line.debit} muted={line.debit === 0} /></TableCell>
                            <TableCell className="text-right"><Amount value={line.credit} muted={line.credit === 0} /></TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
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
              <Card>
                <CardContent className="p-0">
                  {relatedDocuments.length === 0 ? (
                    <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                      <FileText className="size-4" />
                      No invoice, bill, receipt, payment voucher, or workflow document matched this reference.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>No.</TableHead>
                          <TableHead>Party</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {relatedDocuments.map((document) => (
                          <TableRow key={`${document.type}-${document.id}`}>
                            <TableCell>{document.type}</TableCell>
                            <TableCell className="font-mono text-sm">{document.number}</TableCell>
                            <TableCell className="font-medium">{document.party ?? "-"}</TableCell>
                            <TableCell>{formatDate(document.date)}</TableCell>
                            <TableCell><Badge variant={document.status === "posted" || document.status === "paid" ? "secondary" : "outline"}>{titleCase(document.status)}</Badge></TableCell>
                            <TableCell className="text-right"><Amount value={document.amount} /></TableCell>
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
