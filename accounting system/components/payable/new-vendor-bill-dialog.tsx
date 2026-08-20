"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAccounting } from "@/lib/accounting/store"
import { formatCurrency } from "@/lib/accounting/utils"

const today = new Date().toISOString().slice(0, 10)

function plusDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function NewVendorBillDialog() {
  const { contacts, addVendorBill } = useAccounting()
  const vendors = contacts.filter((contact) => contact.type === "vendor")
  const [open, setOpen] = useState(false)
  const [vendorId, setVendorId] = useState("")
  const [billDate, setBillDate] = useState(today)
  const [dueDate, setDueDate] = useState(plusDays(30))
  const [subtotal, setSubtotal] = useState("")
  const [taxAmount, setTaxAmount] = useState("0")
  const [error, setError] = useState("")

  const total = useMemo(() => (Number.parseFloat(subtotal) || 0) + (Number.parseFloat(taxAmount) || 0), [subtotal, taxAmount])

  function reset() {
    setVendorId("")
    setBillDate(today)
    setDueDate(plusDays(30))
    setSubtotal("")
    setTaxAmount("0")
    setError("")
  }

  function submit() {
    const numericSubtotal = Number.parseFloat(subtotal)
    const numericTax = Number.parseFloat(taxAmount) || 0
    if (!vendorId) return setError("Select an AP vendor.")
    if (!Number.isFinite(numericSubtotal) || numericSubtotal <= 0) return setError("Subtotal must be greater than zero.")
    if (!Number.isFinite(numericTax) || numericTax < 0) return setError("Tax amount must be zero or greater.")

    addVendorBill({
      vendorId,
      billDate,
      dueDate,
      status: "draft",
      subtotal: numericSubtotal,
      taxAmount: numericTax,
      totalAmount: numericSubtotal + numericTax,
    })
    reset()
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) reset()
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            New Vendor Bill
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Vendor Bill</DialogTitle>
          <DialogDescription>Create a draft Accounts Payable bill for vendor review and posting.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>AP Vendor</Label>
            <Select value={vendorId} onValueChange={(value) => setVendorId(value ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select an AP vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="bill-date">Bill Date</Label>
              <Input id="bill-date" type="date" value={billDate} onChange={(event) => setBillDate(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bill-due">Due Date</Label>
              <Input id="bill-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="bill-subtotal">Subtotal</Label>
              <Input id="bill-subtotal" inputMode="decimal" value={subtotal} onChange={(event) => setSubtotal(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bill-tax">Tax Amount</Label>
              <Input id="bill-tax" inputMode="decimal" value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)} />
            </div>
          </div>
          <div className="rounded-lg border border-border p-3 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="float-right font-mono font-semibold">{formatCurrency(total)}</span>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Create Vendor Bill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
