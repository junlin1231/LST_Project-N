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
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/accounting/types"

export function NewAccountDialog() {
  const { addAccount, accounts } = useAccounting()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [type, setType] = useState<AccountType>("asset")
  const [error, setError] = useState("")

  function reset() {
    setCode("")
    setName("")
    setType("asset")
    setError("")
  }

  function submit() {
    const trimmedCode = code.trim()
    const trimmedName = name.trim()
    if (!trimmedCode || !trimmedName) {
      setError("Account code and account name are required.")
      return
    }
    if (accounts.some((a) => a.code === trimmedCode)) {
      setError("An account with this code already exists.")
      return
    }
    addAccount({ code: trimmedCode, name: trimmedName, type })
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
          New Account
        </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Account</DialogTitle>
          <DialogDescription>Add a new account to the chart of accounts.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="acc-code">Account Code</Label>
            <Input
              id="acc-code"
              inputMode="numeric"
              placeholder="Example: 1600"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="acc-name">Account Name</Label>
            <Input
              id="acc-name"
              placeholder="Example: Intangible Assets"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="acc-type">Account Type</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as AccountType)}>
              <SelectTrigger id="acc-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {ACCOUNT_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Save Account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
