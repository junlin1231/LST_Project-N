"use client"

import { useState, type ReactNode } from "react"
import { Boxes, Plus } from "lucide-react"
import { Amount } from "@/components/amount"
import { Badge } from "@/components/ui/badge"
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

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function OpeningStockDialog({ triggerIcon }: { triggerIcon?: ReactNode }) {
  const { stockItems, warehouses, stockBalances, accountName, addOpeningStock } = useAccounting()
  const activeItems = stockItems.filter((item) => item.status === "active")
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.status === "active")
  const [open, setOpen] = useState(false)
  const [itemId, setItemId] = useState("")
  const [warehouseId, setWarehouseId] = useState("")
  const [movementDate, setMovementDate] = useState(today())
  const [quantity, setQuantity] = useState("")
  const [unitCost, setUnitCost] = useState("")
  const [memo, setMemo] = useState("")
  const [state, setState] = useState<"idle" | "saving">("idle")
  const [error, setError] = useState("")
  const selectedItem = stockItems.find((item) => item.id === itemId)
  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId)
  const currentBalance = stockBalances.find((balance) => balance.itemId === itemId && balance.warehouseId === warehouseId)
  const numericQuantity = Number(quantity)
  const numericUnitCost = Number(unitCost)
  const openingValue = Number.isFinite(numericQuantity) && Number.isFinite(numericUnitCost) ? numericQuantity * numericUnitCost : 0
  const projectedQuantity = (currentBalance?.quantityOnHand ?? 0) + (Number.isFinite(numericQuantity) ? numericQuantity : 0)
  const projectedValue = (currentBalance?.inventoryValue ?? 0) + openingValue

  function reset() {
    setItemId("")
    setWarehouseId("")
    setMovementDate(today())
    setQuantity("")
    setUnitCost("")
    setMemo("")
    setState("idle")
    setError("")
  }

  async function submit() {
    const numericQuantity = Number(quantity)
    const numericUnitCost = Number(unitCost)
    if (!itemId || !warehouseId) return setError("Item and warehouse are required.")
    if (!movementDate) return setError("Movement date is required.")
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) return setError("Quantity must be greater than zero.")
    if (!Number.isFinite(numericUnitCost) || numericUnitCost < 0) return setError("Unit cost must be zero or greater.")

    setState("saving")
    setError("")
    try {
      await addOpeningStock({
        itemId,
        warehouseId,
        movementDate,
        quantity: numericQuantity,
        unitCost: numericUnitCost,
        memo: memo.trim() || undefined,
      })
      reset()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opening stock failed.")
      setState("idle")
    }
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
            Opening Stock
          </Button>
        }
      />
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Opening Stock</DialogTitle>
          <DialogDescription>Add initial quantity and cost for an active item at an active warehouse.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Item</Label>
            <Select value={itemId} onValueChange={(value) => setItemId(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select stock item" />
              </SelectTrigger>
              <SelectContent className="min-w-96 max-w-[min(36rem,calc(100vw-2rem))]" alignItemWithTrigger={false}>
                {activeItems.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="flex min-w-0 flex-col items-start gap-0.5 whitespace-normal">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.sku} · {item.category || "Unassigned"} · {item.uom}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedItem ? (
            <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-3">
              <div className="md:col-span-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{selectedItem.name}</p>
                  <Badge variant={selectedItem.status === "active" ? "secondary" : "outline"}>{selectedItem.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{selectedItem.description || "No item description."}</p>
              </div>
              <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">SKU</dt>
                <dd className="font-mono">{selectedItem.sku}</dd>
                <dt className="text-muted-foreground">Category</dt>
                <dd>{selectedItem.category || "Unassigned"}</dd>
                <dt className="text-muted-foreground">UOM</dt>
                <dd>{selectedItem.uom}</dd>
                <dt className="text-muted-foreground">Costing</dt>
                <dd>{selectedItem.costingMethod === "weighted_average" ? "Weighted Avg" : "FIFO"}</dd>
              </dl>
              <dl className="grid gap-1 text-sm md:col-span-3">
                <div className="grid grid-cols-[9rem_1fr] gap-x-3">
                  <dt className="text-muted-foreground">Inventory Account</dt>
                  <dd>{selectedItem.defaultInventoryAccountId ? accountName(selectedItem.defaultInventoryAccountId) : "Unmapped"}</dd>
                </div>
                <div className="grid grid-cols-[9rem_1fr] gap-x-3">
                  <dt className="text-muted-foreground">Sales Account</dt>
                  <dd>{selectedItem.defaultSalesAccountId ? accountName(selectedItem.defaultSalesAccountId) : "Unmapped"}</dd>
                </div>
                <div className="grid grid-cols-[9rem_1fr] gap-x-3">
                  <dt className="text-muted-foreground">COGS Account</dt>
                  <dd>{selectedItem.defaultCogsAccountId ? accountName(selectedItem.defaultCogsAccountId) : "Unmapped"}</dd>
                </div>
              </dl>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label>Warehouse</Label>
            <Select value={warehouseId} onValueChange={(value) => setWarehouseId(value ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select warehouse" />
              </SelectTrigger>
              <SelectContent>
                {activeWarehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} - {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedWarehouse ? (
            <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Warehouse</p>
                <p className="font-semibold">{selectedWarehouse.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{selectedWarehouse.code}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge className="mt-1" variant={selectedWarehouse.status === "active" ? "secondary" : "outline"}>{selectedWarehouse.status}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current Item Balance</p>
                <p className="font-semibold">{(currentBalance?.quantityOnHand ?? 0).toLocaleString()} {selectedItem?.uom ?? ""}</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(currentBalance?.inventoryValue ?? 0)}</p>
              </div>
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="opening-date">Date</Label>
              <Input id="opening-date" type="date" value={movementDate} onChange={(event) => setMovementDate(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="opening-qty">Quantity</Label>
              <Input id="opening-qty" type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="opening-cost">Unit Cost</Label>
              <Input id="opening-cost" type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="opening-memo">Memo</Label>
            <Input id="opening-memo" value={memo} onChange={(event) => setMemo(event.target.value)} />
          </div>
          <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Opening Value</p>
              <Amount value={openingValue} className="mt-1 font-semibold" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Projected Quantity</p>
              <p className="mt-1 font-semibold">{projectedQuantity.toLocaleString()} {selectedItem?.uom ?? ""}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Projected Value</p>
              <Amount value={projectedValue} className="mt-1 font-semibold" />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={state !== "idle"}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={state !== "idle"}>
            <Boxes className="size-4" />
            {state === "saving" ? "Saving..." : "Post Opening Stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
