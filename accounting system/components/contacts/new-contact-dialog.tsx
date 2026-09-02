"use client"

import { useEffect, useState, type ReactElement } from "react"
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
import type { Contact, ContactType } from "@/lib/accounting/types"

export function NewContactDialog({
  defaultType = "client",
  contact,
  trigger,
}: {
  defaultType?: ContactType
  contact?: Contact
  trigger?: ReactElement
}) {
  const { addContact, updateContact } = useAccounting()
  const isEditing = !!contact
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState<ContactType>(defaultType)
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [taxId, setTaxId] = useState("")
  const [addressLines, setAddressLines] = useState(["", "", "", ""])
  const [creditLimit, setCreditLimit] = useState("")
  const [error, setError] = useState("")

  function loadForm() {
    setName(contact?.name ?? "")
    setType(contact?.type ?? defaultType)
    setEmail(contact?.email ?? "")
    setPhone(contact?.phone ?? "")
    setTaxId(contact?.taxId ?? "")
    setAddressLines(Array.from({ length: 4 }, (_, index) => contact?.addressLines?.[index] ?? ""))
    setCreditLimit(typeof contact?.creditLimit === "number" ? String(contact.creditLimit) : "")
    setError("")
  }

  useEffect(() => {
    if (open) loadForm()
  }, [open, contact?.id])

  function updateAddressLine(index: number, value: string) {
    setAddressLines((current) => current.map((line, lineIndex) => lineIndex === index ? value : line))
  }

  function submit() {
    if (!name.trim()) return setError("Name is required.")
    const payload = {
      name: name.trim(),
      type,
      email: email.trim(),
      phone: phone.trim() || undefined,
      taxId: taxId.trim() || undefined,
      addressLines: addressLines.map((line) => line.trim()).filter(Boolean).slice(0, 4),
      creditLimit: type === "client" && creditLimit ? Number.parseFloat(creditLimit) || undefined : undefined,
    }
    if (contact) {
      updateContact(contact.id, payload)
    } else {
      addContact(payload)
    }
    loadForm()
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) loadForm()
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button>
              <Plus className="size-4" />
              New AR / AP Party
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit AR / AP Party" : "New AR / AP Party"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update customer or vendor master data used by invoices, bills, and reports." : "Add an Accounts Receivable customer or Accounts Payable vendor."}
          </DialogDescription>
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
          <div className="grid gap-2">
            <Label>Address</Label>
            <div className="grid gap-2">
              {addressLines.map((line, index) => (
                <Input
                  key={index}
                  value={line}
                  onChange={(event) => updateAddressLine(index, event.target.value)}
                  placeholder={`Address line ${index + 1}`}
                />
              ))}
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
          <Button onClick={submit}>{isEditing ? "Update Party" : "Save Party"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
