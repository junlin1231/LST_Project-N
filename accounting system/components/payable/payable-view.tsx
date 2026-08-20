"use client"

import Link from "next/link"
import { useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { Amount } from "@/components/amount"
import { ConfirmationDialog } from "@/components/governance/confirmation-dialog"
import { WorkflowDocumentPanel } from "@/components/shared/workflow-document-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { calculateVendorAging, summarizeAging } from "@/lib/accounting/ar-ap"
import { UPDATE_CONFIRMATION_PHRASE } from "@/lib/accounting/governance"
import { useAccounting } from "@/lib/accounting/store"
import { formatDate } from "@/lib/accounting/utils"
import { VENDOR_BILL_STATUS_LABEL, type VendorBill, type VendorBillStatus } from "@/lib/accounting/types"

const BILL_STATUSES: VendorBillStatus[] = ["draft", "open", "partially_paid", "paid", "overdue", "void"]

function EmptyPanel({ label }: { label: string }) {
  return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{label}</p>
}

function StatusBadge({ status }: { status: VendorBillStatus }) {
  const variant = status === "paid" ? "secondary" : status === "overdue" || status === "void" ? "destructive" : "outline"
  return <Badge variant={variant}>{VENDOR_BILL_STATUS_LABEL[status]}</Badge>
}

export function PayableView() {
  const { contacts, vendorBills, paymentVouchers, paymentAllocations, setVendorBillStatus } = useAccounting()
  const vendors = contacts.filter((contact) => contact.type === "vendor")
  const [pendingStatusChange, setPendingStatusChange] = useState<{ bill: VendorBill; status: VendorBillStatus } | null>(null)
  const vendorName = (id: string) => contacts.find((contact) => contact.id === id)?.name ?? id
  const openBills = vendorBills.filter((bill) => bill.status !== "paid" && bill.status !== "void")
  const outstanding = openBills.reduce((sum, bill) => sum + bill.totalAmount, 0)
  const overdue = vendorBills.filter((bill) => bill.status === "overdue").reduce((sum, bill) => sum + bill.totalAmount, 0)
  const agingRows = calculateVendorAging(contacts, vendorBills)
  const agingSummary = summarizeAging(agingRows)
  const billById = new Map(vendorBills.map((bill) => [bill.id, bill]))
  const voucherById = new Map(paymentVouchers.map((voucher) => [voucher.id, voucher]))
  const paymentTotal = paymentVouchers.filter((voucher) => voucher.status === "posted").reduce((sum, voucher) => sum + voucher.amount, 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Outstanding AP</p>
            <Amount value={outstanding} className="mt-1 text-xl font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Overdue AP</p>
            <Amount value={overdue} className="mt-1 text-xl font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Payments Posted</p>
            <Amount value={paymentTotal} className="mt-1 text-xl font-semibold" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="bills" className="gap-4">
        <TabsList>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="requisitions">Purchase Requisitions</TabsTrigger>
          <TabsTrigger value="orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="grn">GRN</TabsTrigger>
          <TabsTrigger value="bills">Vendor Bills</TabsTrigger>
          <TabsTrigger value="payments">Payment Vouchers</TabsTrigger>
          <TabsTrigger value="allocations">Allocations</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
        </TabsList>

        <TabsContent value="vendors">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((vendor) => {
                    const aging = agingRows.find((row) => row.vendor.id === vendor.id)
                    return (
                      <TableRow key={vendor.id}>
                        <TableCell className="font-medium">{vendor.name}</TableCell>
                        <TableCell>{vendor.email}</TableCell>
                        <TableCell>{vendor.phone ?? "-"}</TableCell>
                        <TableCell className="text-right"><Amount value={aging?.total ?? 0} /></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="mt-3 flex justify-end">
            <Button variant="outline" nativeButton={false} render={<Link href="/settings/master-data" />}>Open Vendor Master</Button>
          </div>
        </TabsContent>

        <TabsContent value="requisitions">
          <WorkflowDocumentPanel type="purchase_requisition" title="Purchase Requisition" />
        </TabsContent>
        <TabsContent value="orders">
          <WorkflowDocumentPanel type="purchase_order" title="Purchase Order" contactType="vendor" />
        </TabsContent>
        <TabsContent value="grn">
          <WorkflowDocumentPanel type="goods_received_note" title="Goods Received Note" contactType="vendor" />
        </TabsContent>

        <TabsContent value="bills">
          <Card>
            <CardContent className="p-0">
              {vendorBills.length === 0 ? (
                <EmptyPanel label="No vendor bills yet. Create a bill to begin AP tracking." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill No.</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Bill / Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendorBills.map((bill) => (
                      <TableRow key={bill.id}>
                        <TableCell className="font-mono text-sm">{bill.billNumber}</TableCell>
                        <TableCell className="font-medium">{vendorName(bill.vendorId)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div>{formatDate(bill.billDate)}</div>
                          <div className="text-xs">Due {formatDate(bill.dueDate)}</div>
                        </TableCell>
                        <TableCell><StatusBadge status={bill.status} /></TableCell>
                        <TableCell className="text-right"><Amount value={bill.totalAmount} className="text-sm font-medium" /></TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button variant="ghost" size="icon" className="size-8" aria-label="Change vendor bill status">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Update AP Status</div>
                              <DropdownMenuSeparator />
                              {BILL_STATUSES.map((status) => (
                                <DropdownMenuItem key={status} onClick={() => setPendingStatusChange({ bill, status })}>
                                  {VENDOR_BILL_STATUS_LABEL[status]}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardContent className="p-0">
              {paymentVouchers.length === 0 ? (
                <EmptyPanel label="No payment vouchers yet. Post a payment to start settlement tracking." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Voucher No.</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Bill</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentVouchers.map((voucher) => {
                      const bill = voucher.vendorBillId ? billById.get(voucher.vendorBillId) : undefined
                      return (
                        <TableRow key={voucher.id}>
                          <TableCell className="font-mono text-sm">{voucher.voucherNumber}</TableCell>
                          <TableCell className="font-medium">{bill ? vendorName(bill.vendorId) : "Vendor Advance"}</TableCell>
                          <TableCell>{bill?.billNumber ?? "-"}</TableCell>
                          <TableCell>{formatDate(voucher.paymentDate)}</TableCell>
                          <TableCell><Badge variant={voucher.status === "posted" ? "secondary" : "outline"}>{voucher.status}</Badge></TableCell>
                          <TableCell className="text-right"><Amount value={voucher.amount} /></TableCell>
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
              {paymentAllocations.filter((allocation) => allocation.targetType === "vendor_bill").length === 0 ? (
                <EmptyPanel label="No AP allocations yet. Payment allocations will be listed here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Target Bill</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentAllocations.filter((allocation) => allocation.targetType === "vendor_bill").map((allocation) => {
                      const voucher = voucherById.get(allocation.sourceId)
                      const bill = billById.get(allocation.targetId)
                      return (
                        <TableRow key={allocation.id}>
                          <TableCell>{voucher?.voucherNumber ?? allocation.sourceId}</TableCell>
                          <TableCell>{bill?.billNumber ?? allocation.targetId}</TableCell>
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
                    <TableHead>Vendor</TableHead>
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
                    <TableRow key={row.vendor.id}>
                      <TableCell className="font-medium">{row.vendor.name}</TableCell>
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
        </TabsContent>
      </Tabs>

      <ConfirmationDialog
        open={!!pendingStatusChange}
        title="Update Vendor Bill Status"
        description="Review this Accounts Payable state change before it is saved."
        impactSummary={
          pendingStatusChange
            ? `This will change AP bill ${pendingStatusChange.bill.billNumber} from ${VENDOR_BILL_STATUS_LABEL[pendingStatusChange.bill.status]} to ${VENDOR_BILL_STATUS_LABEL[pendingStatusChange.status]} for ${vendorName(pendingStatusChange.bill.vendorId)}.`
            : ""
        }
        confirmationPhrase={UPDATE_CONFIRMATION_PHRASE}
        confirmLabel="Confirm & Update"
        onOpenChange={(open) => {
          if (!open) setPendingStatusChange(null)
        }}
        onConfirm={(confirmation) => {
          if (!pendingStatusChange) return
          setVendorBillStatus(pendingStatusChange.bill.id, pendingStatusChange.status, confirmation)
          setPendingStatusChange(null)
        }}
      />
    </div>
  )
}
