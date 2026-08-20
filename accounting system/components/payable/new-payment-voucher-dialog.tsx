"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAccounting } from "@/lib/accounting/store"
import { formatCurrency } from "@/lib/accounting/utils"

const today = new Date().toISOString().slice(0, 10)

export function NewPaymentVoucherDialog() {
  const { contacts, vendorBills, paymentAllocations, addPaymentVoucher } = useAccounting()
  const [open, setOpen] = useState(false)
  const [vendorBillId, setVendorBillId] = useState("")
  const [paymentDate, setPaymentDate] = useState(today)
  const [amount, setAmount] = useState("")
  const [state, setState] = useState<"idle" | "saving">("idle")
  const [error, setError] = useState("")

  const openBills = useMemo(() => {
    return vendorBills
      .map((bill) => {
        const allocated = paymentAllocations
          .filter((allocation) => allocation.targetType === "vendor_bill" && allocation.targetId === bill.id)
          .reduce((sum, allocation) => sum + allocation.amount, 0)
        return { bill, openAmount: Math.max(bill.totalAmount - allocated, 0) }
      })
      .filter((row) => row.openAmount > 0 && row.bill.status !== "void")
  }, [vendorBills, paymentAllocations])

  const selected = openBills.find((row) => row.bill.id === vendorBillId)
  const vendorName = (id: string) => contacts.find((contact) => contact.id === id)?.name ?? id

  function reset() {
    setVendorBillId("")
    setPaymentDate(today)
    setAmount("")
    setState("idle")
    setError("")
  }

  async function submit() {
    const numericAmount = Number.parseFloat(amount)
    if (!vendorBillId) return setError("Select an AP vendor bill.")
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Payment amount must be greater than zero.")
    if (selected && numericAmount > selected.openAmount) return setError("Payment amount cannot exceed the bill open amount.")

    setState("saving")
    setError("")
    try {
      await addPaymentVoucher({ vendorBillId, paymentDate, amount: numericAmount })
      reset()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment voucher failed.")
      setState("idle")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) reset() }}>
      <DialogTrigger render={<Button variant="outline"><Plus className="size-4" />New Payment</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Payment Voucher</DialogTitle>
          <DialogDescription>Record vendor payment and allocate it to an open AP bill.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Vendor Bill</Label>
            <Select value={vendorBillId} onValueChange={(value) => { setVendorBillId(value ?? ""); const row = openBills.find((item) => item.bill.id === value); setAmount(row ? String(row.openAmount) : "") }}>
              <SelectTrigger><SelectValue placeholder="Select open vendor bill" /></SelectTrigger>
              <SelectContent>
                {openBills.map(({ bill, openAmount }) => (
                  <SelectItem key={bill.id} value={bill.id}>
                    {bill.billNumber} - {vendorName(bill.vendorId)} - {formatCurrency(openAmount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="payment-date">Payment Date</Label>
              <Input id="payment-date" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payment-amount">Amount</Label>
              <Input id="payment-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
          </div>
          {selected ? <p className="text-xs text-muted-foreground">Open amount: {formatCurrency(selected.openAmount)}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={state !== "idle"}>Cancel</Button>
          <Button onClick={submit} disabled={state !== "idle"}>{state === "saving" ? "Saving..." : "Post Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
