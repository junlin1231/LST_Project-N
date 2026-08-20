"use client"

import { useState, type ReactNode } from "react"
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
import { useAccounting } from "@/lib/accounting/store"

export function NewWarehouseDialog({ triggerIcon }: { triggerIcon?: ReactNode }) {
  const { addWarehouse, warehouses } = useAccounting()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")

  function reset() {
    setCode("")
    setName("")
    setError("")
  }

  function submit() {
    const trimmedCode = code.trim().toUpperCase()
    const trimmedName = name.trim()
    if (!trimmedCode || !trimmedName) {
      setError("Warehouse code and name are required.")
      return
    }
    if (warehouses.some((warehouse) => warehouse.code.toUpperCase() === trimmedCode)) {
      setError("A warehouse with this code already exists.")
      return
    }
    addWarehouse({ code: trimmedCode, name: trimmedName, status: "active" })
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
          <Button variant="outline">
            {triggerIcon ?? <Plus className="size-4" />}
            New Warehouse
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Warehouse</DialogTitle>
          <DialogDescription>Create a stock location for inventory balances and movement lines.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="wh-code">Warehouse Code</Label>
            <Input id="wh-code" placeholder="Example: MAIN" value={code} onChange={(event) => setCode(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wh-name">Warehouse Name</Label>
            <Input id="wh-name" placeholder="Example: Main Warehouse" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Save Warehouse</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
