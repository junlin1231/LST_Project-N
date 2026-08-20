"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
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
import { Separator } from "@/components/ui/separator"
import { useAccounting } from "@/lib/accounting/store"
import { formatCurrency } from "@/lib/accounting/utils"

interface DraftItem {
  key: string
  description: string
  quantity: string
  unitPrice: string
}

function emptyItem(): DraftItem {
  return { key: crypto.randomUUID(), description: "", quantity: "1", unitPrice: "" }
}

const today = new Date().toISOString().slice(0, 10)

function plusDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function NewInvoiceDialog() {
  const { contacts, addInvoice } = useAccounting()
  const clients = contacts.filter((c) => c.type === "client")

  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState("")
  const [issueDate, setIssueDate] = useState(today)
  const [dueDate, setDueDate] = useState(plusDays(30))
  const [taxRate, setTaxRate] = useState("6")
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])
  const [error, setError] = useState("")

  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (s, i) => s + (Number.parseFloat(i.quantity) || 0) * (Number.parseFloat(i.unitPrice) || 0),
      0,
    )
    const tax = subtotal * ((Number.parseFloat(taxRate) || 0) / 100)
    return { subtotal, tax, total: subtotal + tax }
  }, [items, taxRate])

  function reset() {
    setClientId("")
    setIssueDate(today)
    setDueDate(plusDays(30))
    setTaxRate("6")
    setItems([emptyItem()])
    setError("")
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  }

  function submit() {
    if (!clientId) return setError("Select an AR customer.")
    const valid = items.filter((i) => i.description.trim() && Number.parseFloat(i.unitPrice) > 0)
    if (valid.length === 0) return setError("Add at least one valid AR invoice item.")

    addInvoice({
      clientId,
      issueDate,
      dueDate,
      status: "draft",
      taxRate: Number.parseFloat(taxRate) || 0,
      items: valid.map((i) => ({
        id: i.key,
        description: i.description.trim(),
        quantity: Number.parseFloat(i.quantity) || 1,
        unitPrice: Number.parseFloat(i.unitPrice) || 0,
      })),
    })
    reset()
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger
        render={
          <Button>
          <Plus className="size-4" />
          New AR Invoice
        </Button>
        }
      />
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New AR Invoice</DialogTitle>
          <DialogDescription>Create a draft Accounts Receivable invoice and update its status later.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>AR Customer</Label>
            <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select an AR customer" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="inv-issue">Issue Date</Label>
              <Input id="inv-issue" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-due">Due Date</Label>
              <Input id="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inv-tax">Tax Rate %</Label>
              <Input
                id="inv-tax"
                inputMode="decimal"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_64px_96px_32px] items-center gap-2 px-1 text-xs text-muted-foreground">
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit Price</span>
              <span />
            </div>
            {items.map((item) => (
              <div key={item.key} className="grid grid-cols-[1fr_64px_96px_32px] items-center gap-2">
                <Input
                  placeholder="Service or product"
                  value={item.description}
                  onChange={(e) => updateItem(item.key, { description: e.target.value })}
                />
                <Input
                  inputMode="decimal"
                  className="text-right font-mono"
                  value={item.quantity}
                  onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                />
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  className="text-right font-mono"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(item.key, { unitPrice: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  aria-label="Delete item"
                  onClick={() => setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.key !== item.key) : prev))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={() => setItems((prev) => [...prev, emptyItem()])}
            >
              <Plus className="size-4" />
              Add Item
            </Button>
          </div>

          <div className="ml-auto w-full max-w-56 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span className="font-mono tabular-nums">{formatCurrency(totals.tax)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span className="font-mono tabular-nums">{formatCurrency(totals.total)}</span>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Create AR Invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
