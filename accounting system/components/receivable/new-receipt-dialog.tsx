"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAccounting } from "@/lib/accounting/store"
import { formatCurrency, invoiceTotal } from "@/lib/accounting/utils"

const today = new Date().toISOString().slice(0, 10)

export function NewReceiptDialog() {
  const { contacts, invoices, paymentAllocations, addReceipt } = useAccounting()
  const [open, setOpen] = useState(false)
  const [invoiceId, setInvoiceId] = useState("")
  const [receiptDate, setReceiptDate] = useState(today)
  const [amount, setAmount] = useState("")
  const [state, setState] = useState<"idle" | "saving">("idle")
  const [error, setError] = useState("")

  const openInvoices = useMemo(() => {
    return invoices
      .map((invoice) => {
        const allocated = paymentAllocations
          .filter((allocation) => allocation.targetType === "invoice" && allocation.targetId === invoice.id)
          .reduce((sum, allocation) => sum + allocation.amount, 0)
        return { invoice, openAmount: Math.max(invoiceTotal(invoice) - allocated, 0) }
      })
      .filter((row) => row.openAmount > 0 && invoiceTotal(row.invoice) > 0)
  }, [invoices, paymentAllocations])

  const selected = openInvoices.find((row) => row.invoice.id === invoiceId)
  const customerName = (id: string) => contacts.find((contact) => contact.id === id)?.name ?? id

  function reset() {
    setInvoiceId("")
    setReceiptDate(today)
    setAmount("")
    setState("idle")
    setError("")
  }

  async function submit() {
    const numericAmount = Number.parseFloat(amount)
    if (!invoiceId) return setError("Select an AR invoice.")
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setError("Receipt amount must be greater than zero.")
    if (selected && numericAmount > selected.openAmount) return setError("Receipt amount cannot exceed the invoice open amount.")

    setState("saving")
    setError("")
    try {
      await addReceipt({ invoiceId, receiptDate, amount: numericAmount })
      reset()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receipt failed.")
      setState("idle")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) reset() }}>
      <DialogTrigger render={<Button variant="outline"><Plus className="size-4" />New Receipt</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Receipt</DialogTitle>
          <DialogDescription>Record customer payment and allocate it to an open AR invoice.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>AR Invoice</Label>
            <Select value={invoiceId} onValueChange={(value) => { setInvoiceId(value ?? ""); const row = openInvoices.find((item) => item.invoice.id === value); setAmount(row ? String(row.openAmount) : "") }}>
              <SelectTrigger><SelectValue placeholder="Select open invoice" /></SelectTrigger>
              <SelectContent>
                {openInvoices.map(({ invoice, openAmount }) => (
                  <SelectItem key={invoice.id} value={invoice.id}>
                    {invoice.number} - {customerName(invoice.clientId)} - {formatCurrency(openAmount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="receipt-date">Receipt Date</Label>
              <Input id="receipt-date" type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="receipt-amount">Amount</Label>
              <Input id="receipt-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </div>
          </div>
          {selected ? <p className="text-xs text-muted-foreground">Open amount: {formatCurrency(selected.openAmount)}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={state !== "idle"}>Cancel</Button>
          <Button onClick={submit} disabled={state !== "idle"}>{state === "saving" ? "Saving..." : "Post Receipt"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
