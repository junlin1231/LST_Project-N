"use client"

import { useState } from "react"
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
import type { ContactType } from "@/lib/accounting/types"

export function NewContactDialog({ defaultType = "client" }: { defaultType?: ContactType }) {
  const { addContact } = useAccounting()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState<ContactType>(defaultType)
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [taxId, setTaxId] = useState("")
  const [creditLimit, setCreditLimit] = useState("")
  const [error, setError] = useState("")

  function reset() {
    setName("")
    setType(defaultType)
    setEmail("")
    setPhone("")
    setTaxId("")
    setCreditLimit("")
    setError("")
  }

  function submit() {
    if (!name.trim()) return setError("Name is required.")
    addContact({
      name: name.trim(),
      type,
      email: email.trim(),
      phone: phone.trim() || undefined,
      taxId: taxId.trim() || undefined,
      creditLimit: type === "client" && creditLimit ? Number.parseFloat(creditLimit) || undefined : undefined,
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
          New AR / AP Party
        </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New AR / AP Party</DialogTitle>
          <DialogDescription>Add an Accounts Receivable customer or Accounts Payable vendor.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="ct-name">Name</Label>
            <Input
              id="ct-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Company or person name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ct-type">Type</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as ContactType)}>
              <SelectTrigger id="ct-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Accounts Receivable Customer</SelectItem>
                <SelectItem value="vendor">Accounts Payable Vendor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ct-email">Email</Label>
            <Input
              id="ct-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="ct-phone">Phone</Label>
              <Input id="ct-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ct-tax">Tax ID</Label>
              <Input id="ct-tax" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          {type === "client" ? (
            <div className="grid gap-2">
              <Label htmlFor="ct-credit-limit">AR Credit Limit</Label>
              <Input
                id="ct-credit-limit"
                inputMode="decimal"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder={formatCurrency(0)}
              />
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Save Party</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
