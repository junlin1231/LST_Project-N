"use client"

import Link from "next/link"
import { Amount } from "@/components/amount"
import { InvoicesView } from "@/components/invoices/invoices-view"
import { WorkflowDocumentPanel } from "@/components/shared/workflow-document-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calculateCustomerAging, summarizeAging } from "@/lib/accounting/ar-ap"
import { useAccounting } from "@/lib/accounting/store"
import { formatDate, invoiceTotal } from "@/lib/accounting/utils"

function EmptyPanel({ label }: { label: string }) {
  return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{label}</p>
}

export function ReceivableView() {
  const { contacts, invoices, receipts, paymentAllocations } = useAccounting()
  const customers = contacts.filter((contact) => contact.type === "client")
  const agingRows = calculateCustomerAging(contacts, invoices)
  const agingSummary = summarizeAging(agingRows)
  const openInvoices = invoices.filter((invoice) => invoice.status !== "paid")
  const outstanding = openInvoices.reduce((sum, invoice) => sum + invoiceTotal(invoice), 0)
  const overdue = invoices.filter((invoice) => invoice.status === "overdue").reduce((sum, invoice) => sum + invoiceTotal(invoice), 0)
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]))
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]))
  const receiptTotal = receipts.filter((receipt) => receipt.status === "posted").reduce((sum, receipt) => sum + receipt.amount, 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Outstanding AR</p>
            <Amount value={outstanding} className="mt-1 text-xl font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Overdue AR</p>
            <Amount value={overdue} className="mt-1 text-xl font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Receipts Posted</p>
            <Amount value={receiptTotal} className="mt-1 text-xl font-semibold" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="invoices" className="gap-4">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="quotations">Quotations</TabsTrigger>
          <TabsTrigger value="orders">Sales Orders</TabsTrigger>
          <TabsTrigger value="delivery">Delivery Orders</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="receipts">Receipts</TabsTrigger>
          <TabsTrigger value="allocations">Allocations</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
        </TabsList>

        <TabsContent value="customers">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Credit Limit</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => {
                    const aging = agingRows.find((row) => row.customer.id === customer.id)
                    return (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell>{customer.email}</TableCell>
                        <TableCell className="text-right">{typeof customer.creditLimit === "number" ? <Amount value={customer.creditLimit} /> : "Unset"}</TableCell>
                        <TableCell className="text-right"><Amount value={aging?.total ?? 0} /></TableCell>
                        <TableCell className="text-right">{typeof aging?.creditAvailable === "number" ? <Amount value={aging.creditAvailable} /> : "Unset"}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" nativeButton={false} render={<Link href="/settings/master-data" />}>Open Customer Master</Button>
          </div>
        </TabsContent>

        <TabsContent value="quotations">
          <WorkflowDocumentPanel type="quotation" title="Quotation" contactType="client" />
        </TabsContent>
        <TabsContent value="orders">
          <WorkflowDocumentPanel type="sales_order" title="Sales Order" contactType="client" />
        </TabsContent>
        <TabsContent value="delivery">
          <WorkflowDocumentPanel type="delivery_order" title="Delivery Order" contactType="client" />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesView />
        </TabsContent>
        <TabsContent value="receipts">
          <Card>
            <CardContent className="p-0">
              {receipts.length === 0 ? (
                <EmptyPanel label="No receipts yet. Post a receipt to start settlement tracking." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt No.</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.map((receipt) => {
                      const invoice = receipt.invoiceId ? invoiceById.get(receipt.invoiceId) : undefined
                      return (
                        <TableRow key={receipt.id}>
                          <TableCell className="font-mono text-sm">{receipt.receiptNumber}</TableCell>
                          <TableCell className="font-medium">{invoice ? customers.find((customer) => customer.id === invoice.clientId)?.name : "Unapplied"}</TableCell>
                          <TableCell>{invoice?.number ?? "-"}</TableCell>
                          <TableCell>{formatDate(receipt.receiptDate)}</TableCell>
                          <TableCell><Badge variant={receipt.status === "posted" ? "secondary" : "outline"}>{receipt.status}</Badge></TableCell>
                          <TableCell className="text-right"><Amount value={receipt.amount} /></TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="allocations">
          <Card>
            <CardContent className="p-0">
              {paymentAllocations.filter((allocation) => allocation.targetType === "invoice").length === 0 ? (
                <EmptyPanel label="No AR allocations yet. Receipt allocations will be listed here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Target Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentAllocations.filter((allocation) => allocation.targetType === "invoice").map((allocation) => {
                      const receipt = receiptById.get(allocation.sourceId)
                      const invoice = invoiceById.get(allocation.targetId)
                      return (
                        <TableRow key={allocation.id}>
                          <TableCell>{receipt?.receiptNumber ?? allocation.sourceId}</TableCell>
                          <TableCell>{invoice?.number ?? allocation.targetId}</TableCell>
                          <TableCell>{formatDate(allocation.allocatedAt)}</TableCell>
                          <TableCell className="text-right"><Amount value={allocation.amount} /></TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="aging">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {agingSummary.map((bucket) => (
              <Card key={bucket.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{bucket.label}</p>
                  <Amount value={bucket.amount} className="mt-1 font-semibold" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="mt-4">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">1-30</TableHead>
                    <TableHead className="text-right">31-60</TableHead>
                    <TableHead className="text-right">61-90</TableHead>
                    <TableHead className="text-right">90+</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agingRows.map((row) => (
                    <TableRow key={row.customer.id}>
                      <TableCell className="font-medium">{row.customer.name}</TableCell>
                      <TableCell className="text-right"><Amount value={row.current} /></TableCell>
                      <TableCell className="text-right"><Amount value={row.days1To30} /></TableCell>
                      <TableCell className="text-right"><Amount value={row.days31To60} /></TableCell>
                      <TableCell className="text-right"><Amount value={row.days61To90} /></TableCell>
                      <TableCell className="text-right"><Amount value={row.daysOver90} /></TableCell>
                      <TableCell className="text-right font-medium"><Amount value={row.total} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <p className="mt-3 text-xs text-muted-foreground">As of {formatDate(new Date().toISOString().slice(0, 10))}. <Badge variant="outline">Open invoices only</Badge></p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
