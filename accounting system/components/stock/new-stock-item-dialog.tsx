"use client"

import { useState, type ReactNode } from "react"
import { PackagePlus, Plus } from "lucide-react"
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
import type { Account, StockCostingMethod } from "@/lib/accounting/types"

function AccountSelect({
  id,
  accounts,
  value,
  onChange,
  placeholder,
}: {
  id: string
  accounts: Account[]
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <Select value={value} onValueChange={(nextValue) => nextValue && onChange(nextValue)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.code} - {account.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function NewStockItemDialog({ triggerIcon }: { triggerIcon?: ReactNode }) {
  const { accounts, addStockItem, stockItems } = useAccounting()
  const assetAccounts = accounts.filter((account) => account.type === "asset")
  const revenueAccounts = accounts.filter((account) => account.type === "revenue")
  const expenseAccounts = accounts.filter((account) => account.type === "expense")
  const [open, setOpen] = useState(false)
  const [sku, setSku] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [uom, setUom] = useState("unit")
  const [reorderLevel, setReorderLevel] = useState("0")
  const [costingMethod, setCostingMethod] = useState<StockCostingMethod>("weighted_average")
  const [inventoryAccountId, setInventoryAccountId] = useState("1300")
  const [salesAccountId, setSalesAccountId] = useState("4100")
  const [cogsAccountId, setCogsAccountId] = useState("5600")
  const [error, setError] = useState("")

  function reset() {
    setSku("")
    setName("")
    setDescription("")
    setCategory("")
    setUom("unit")
    setReorderLevel("0")
    setCostingMethod("weighted_average")
    setInventoryAccountId("1300")
    setSalesAccountId("4100")
    setCogsAccountId("5600")
    setError("")
  }

  function submit() {
    const trimmedSku = sku.trim().toUpperCase()
    const trimmedName = name.trim()
    const numericReorderLevel = Number(reorderLevel)
    if (!trimmedSku || !trimmedName) {
      setError("SKU and item name are required.")
      return
    }
    if (stockItems.some((item) => item.sku.toUpperCase() === trimmedSku)) {
      setError("A stock item with this SKU already exists.")
      return
    }
    if (!Number.isFinite(numericReorderLevel) || numericReorderLevel < 0) {
      setError("Reorder level must be zero or greater.")
      return
    }

    addStockItem({
      sku: trimmedSku,
      name: trimmedName,
      description: description.trim(),
      itemType: "stock",
      uom: uom.trim() || "unit",
      category: category.trim(),
      status: "active",
      costingMethod,
      defaultSalesAccountId: salesAccountId || undefined,
      defaultInventoryAccountId: inventoryAccountId || undefined,
      defaultCogsAccountId: cogsAccountId || undefined,
      reorderLevel: numericReorderLevel,
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
            {triggerIcon ?? <Plus className="size-4" />}
            New Stock Item
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Stock Item</DialogTitle>
          <DialogDescription>Create inventory master data with costing and default account mappings.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="stock-sku">SKU</Label>
            <Input id="stock-sku" placeholder="Example: LST-ROUTER" value={sku} onChange={(event) => setSku(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-name">Item Name</Label>
            <Input id="stock-name" placeholder="Example: Logistics Edge Router" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="stock-description">Description</Label>
            <Input id="stock-description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-category">Category</Label>
            <Input id="stock-category" placeholder="Example: Hardware" value={category} onChange={(event) => setCategory(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-uom">UOM</Label>
            <Input id="stock-uom" value={uom} onChange={(event) => setUom(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-costing">Costing Method</Label>
            <Select value={costingMethod} onValueChange={(nextValue) => nextValue && setCostingMethod(nextValue as StockCostingMethod)}>
              <SelectTrigger id="stock-costing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weighted_average">Weighted Average</SelectItem>
                <SelectItem value="fifo">FIFO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-reorder">Reorder Level</Label>
            <Input id="stock-reorder" type="number" min="0" step="0.001" value={reorderLevel} onChange={(event) => setReorderLevel(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-inventory-account">Inventory Account</Label>
            <AccountSelect id="stock-inventory-account" accounts={assetAccounts} value={inventoryAccountId} onChange={setInventoryAccountId} placeholder="Select inventory account" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-sales-account">Sales Account</Label>
            <AccountSelect id="stock-sales-account" accounts={revenueAccounts} value={salesAccountId} onChange={setSalesAccountId} placeholder="Select sales account" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-cogs-account">COGS Account</Label>
            <AccountSelect id="stock-cogs-account" accounts={expenseAccounts} value={cogsAccountId} onChange={setCogsAccountId} placeholder="Select COGS account" />
          </div>
          {error ? <p className="text-sm text-destructive md:col-span-2">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <PackagePlus className="size-4" />
            Save Stock Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
