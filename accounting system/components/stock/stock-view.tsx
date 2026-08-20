"use client"

import { useEffect, useState } from "react"
import { Activity, Boxes, PackageSearch, Save, Warehouse } from "lucide-react"
import { Amount } from "@/components/amount"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAccounting } from "@/lib/accounting/store"
import type { StockCostingMethod, StockItem, StockItemStatus, Warehouse as WarehouseRecord } from "@/lib/accounting/types"
import { formatCurrency } from "@/lib/accounting/utils"

const MOVEMENT_LABEL: Record<string, string> = {
  opening: "Opening",
  purchase_receipt: "Purchase Receipt",
  sales_delivery: "Sales Delivery",
  adjustment_in: "Adjustment In",
  adjustment_out: "Adjustment Out",
  transfer: "Transfer",
}

function EmptyState({ label }: { label: string }) {
  return <p className="py-12 text-center text-sm text-muted-foreground">{label}</p>
}

export function StockView() {
  const { accounts, stockItems, warehouses, stockBalances, stockMovements, accountName, updateStockItem, updateWarehouse } = useAccounting()
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseRecord | null>(null)
  const [itemSearch, setItemSearch] = useState("")
  const [itemStatusFilter, setItemStatusFilter] = useState<"all" | StockItemStatus>("all")
  const [warehouseStatusFilter, setWarehouseStatusFilter] = useState<"all" | StockItemStatus>("all")
  const [editSku, setEditSku] = useState("")
  const [editName, setEditName] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editCategory, setEditCategory] = useState("")
  const [editUom, setEditUom] = useState("")
  const [editStatus, setEditStatus] = useState<StockItemStatus>("active")
  const [editCostingMethod, setEditCostingMethod] = useState<StockCostingMethod>("weighted_average")
  const [editReorderLevel, setEditReorderLevel] = useState("0")
  const [editInventoryAccountId, setEditInventoryAccountId] = useState("")
  const [editSalesAccountId, setEditSalesAccountId] = useState("")
  const [editCogsAccountId, setEditCogsAccountId] = useState("")
  const [editWarehouseCode, setEditWarehouseCode] = useState("")
  const [editWarehouseName, setEditWarehouseName] = useState("")
  const [editWarehouseStatus, setEditWarehouseStatus] = useState<StockItemStatus>("active")
  const [formError, setFormError] = useState("")
  const selectedItem = selectedItemId ? stockItems.find((item) => item.id === selectedItemId) ?? null : null
  const assetAccounts = accounts.filter((account) => account.type === "asset")
  const revenueAccounts = accounts.filter((account) => account.type === "revenue")
  const expenseAccounts = accounts.filter((account) => account.type === "expense")
  const totalInventoryValue = stockBalances.reduce((sum, balance) => sum + balance.inventoryValue, 0)
  const lowStockCount = stockItems.filter((item) => {
    const quantity = stockBalances.filter((balance) => balance.itemId === item.id).reduce((sum, balance) => sum + balance.quantityOnHand, 0)
    return item.reorderLevel > 0 && quantity <= item.reorderLevel
  }).length

  const itemName = (id: string) => stockItems.find((item) => item.id === id)?.name ?? id
  const itemLabel = (id: string) => {
    const item = stockItems.find((stockItem) => stockItem.id === id)
    return item ? `${item.sku} - ${item.name}` : id
  }
  const warehouseName = (id: string) => warehouses.find((warehouse) => warehouse.id === id)?.code ?? id
  const warehouseLabel = (id: string) => {
    const warehouse = warehouses.find((record) => record.id === id)
    return warehouse ? `${warehouse.code} - ${warehouse.name}` : id
  }
  const selectedBalances = selectedItem ? stockBalances.filter((balance) => balance.itemId === selectedItem.id) : []
  const selectedQuantity = selectedBalances.reduce((sum, balance) => sum + balance.quantityOnHand, 0)
  const selectedValue = selectedBalances.reduce((sum, balance) => sum + balance.inventoryValue, 0)
  const filteredStockItems = stockItems.filter((item) => {
    const matchesStatus = itemStatusFilter === "all" || item.status === itemStatusFilter
    const needle = itemSearch.trim().toLowerCase()
    const matchesSearch = !needle || [item.sku, item.name, item.category, item.description].some((value) => value.toLowerCase().includes(needle))
    return matchesStatus && matchesSearch
  })
  const filteredWarehouses = warehouses.filter((warehouse) => warehouseStatusFilter === "all" || warehouse.status === warehouseStatusFilter)

  useEffect(() => {
    if (!selectedItem) return
    setEditSku(selectedItem.sku)
    setEditName(selectedItem.name)
    setEditDescription(selectedItem.description)
    setEditCategory(selectedItem.category)
    setEditUom(selectedItem.uom)
    setEditStatus(selectedItem.status)
    setEditCostingMethod(selectedItem.costingMethod)
    setEditReorderLevel(String(selectedItem.reorderLevel))
    setEditInventoryAccountId(selectedItem.defaultInventoryAccountId ?? "")
    setEditSalesAccountId(selectedItem.defaultSalesAccountId ?? "")
    setEditCogsAccountId(selectedItem.defaultCogsAccountId ?? "")
    setFormError("")
  }, [selectedItem])

  useEffect(() => {
    if (!selectedWarehouse) return
    setEditWarehouseCode(selectedWarehouse.code)
    setEditWarehouseName(selectedWarehouse.name)
    setEditWarehouseStatus(selectedWarehouse.status)
    setFormError("")
  }, [selectedWarehouse])

  function saveSelectedItem() {
    if (!selectedItem) return
    const reorderLevel = Number(editReorderLevel)
    const sku = editSku.trim().toUpperCase()
    const name = editName.trim()
    if (!sku || !name) return setFormError("SKU and item name are required.")
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) return setFormError("Reorder level must be zero or greater.")
    if (stockItems.some((item) => item.id !== selectedItem.id && item.sku.toUpperCase() === sku)) return setFormError("A stock item with this SKU already exists.")

    updateStockItem(selectedItem.id, {
      sku,
      name,
      description: editDescription.trim(),
      itemType: selectedItem.itemType,
      uom: editUom.trim() || "unit",
      category: editCategory.trim(),
      status: editStatus,
      costingMethod: editCostingMethod,
      defaultSalesAccountId: editSalesAccountId || undefined,
      defaultInventoryAccountId: editInventoryAccountId || undefined,
      defaultCogsAccountId: editCogsAccountId || undefined,
      reorderLevel,
    })
    setFormError("")
  }

  function saveSelectedWarehouse() {
    if (!selectedWarehouse) return
    const code = editWarehouseCode.trim().toUpperCase()
    const name = editWarehouseName.trim()
    if (!code || !name) return setFormError("Warehouse code and name are required.")
    if (warehouses.some((warehouse) => warehouse.id !== selectedWarehouse.id && warehouse.code.toUpperCase() === code)) return setFormError("A warehouse with this code already exists.")

    updateWarehouse(selectedWarehouse.id, { code, name, status: editWarehouseStatus })
    setFormError("")
    setSelectedWarehouse(null)
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Inventory Value</p>
              <Amount value={totalInventoryValue} className="mt-1 text-xl font-semibold" />
            </div>
            <Boxes className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Stock Items</p>
              <p className="mt-1 text-xl font-semibold">{stockItems.length}</p>
            </div>
            <PackageSearch className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Warehouses</p>
              <p className="mt-1 text-xl font-semibold">{warehouses.length}</p>
            </div>
            <Warehouse className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Low Stock</p>
              <p className="mt-1 text-xl font-semibold">{lowStockCount}</p>
            </div>
            <Activity className="size-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="items" className="gap-4">
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Input className="sm:max-w-xs" placeholder="Search SKU, item, category" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} />
            <Select value={itemStatusFilter} onValueChange={(value) => setItemStatusFilter(value as "all" | StockItemStatus)}>
              <SelectTrigger className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              {filteredStockItems.length === 0 ? (
                <EmptyState label="No stock items yet. Create stock item master data to begin." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>UOM</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Costing</TableHead>
                      <TableHead>Inventory Account</TableHead>
                      <TableHead className="text-right">Reorder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStockItems.map((item) => (
                      <TableRow
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer"
                        onClick={() => setSelectedItemId(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            setSelectedItemId(item.id)
                          }
                        }}
                      >
                        <TableCell className="font-medium">{item.sku}</TableCell>
                        <TableCell>
                          <div className="max-w-72">
                            <p className="truncate font-medium">{item.name}</p>
                            {item.description ? <p className="truncate text-xs text-muted-foreground">{item.description}</p> : null}
                          </div>
                        </TableCell>
                        <TableCell>{item.category || "Unassigned"}</TableCell>
                        <TableCell>{item.uom}</TableCell>
                        <TableCell>
                          <Badge variant={item.status === "active" ? "secondary" : "outline"}>{item.status}</Badge>
                        </TableCell>
                        <TableCell>{item.costingMethod === "weighted_average" ? "Weighted Avg" : "FIFO"}</TableCell>
                        <TableCell>{item.defaultInventoryAccountId ? accountName(item.defaultInventoryAccountId) : "Unmapped"}</TableCell>
                        <TableCell className="text-right">{item.reorderLevel.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warehouses">
          <div className="mb-3 flex justify-end">
            <Select value={warehouseStatusFilter} onValueChange={(value) => setWarehouseStatusFilter(value as "all" | StockItemStatus)}>
              <SelectTrigger className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-0">
              {filteredWarehouses.length === 0 ? (
                <EmptyState label="No warehouses yet. Create a warehouse to hold stock balances." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWarehouses.map((warehouse) => (
                      <TableRow key={warehouse.id} role="button" tabIndex={0} className="cursor-pointer" onClick={() => setSelectedWarehouse(warehouse)}>
                        <TableCell className="font-medium">{warehouse.code}</TableCell>
                        <TableCell>{warehouse.name}</TableCell>
                        <TableCell>
                          <Badge variant={warehouse.status === "active" ? "secondary" : "outline"}>{warehouse.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances">
          <Card>
            <CardContent className="p-0">
              {stockBalances.length === 0 ? (
                <EmptyState label="No stock balances yet. Balances will appear after opening stock or posted stock movements." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Average Cost</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockBalances.map((balance) => (
                      <TableRow key={balance.id}>
                        <TableCell>{itemLabel(balance.itemId)}</TableCell>
                        <TableCell>{warehouseLabel(balance.warehouseId)}</TableCell>
                        <TableCell className="text-right">{balance.quantityOnHand.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatCurrency(balance.averageUnitCost)}</TableCell>
                        <TableCell className="text-right">
                          <Amount value={balance.inventoryValue} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          <Card>
            <CardContent className="p-0">
              {stockMovements.length === 0 ? (
                <EmptyState label="No stock movements yet. Opening, receipt, delivery, and adjustment ledgers will appear here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No.</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Lines</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stockMovements.map((movement) => (
                      <TableRow key={movement.id}>
                        <TableCell className="font-medium">{movement.movementNo}</TableCell>
                        <TableCell>{movement.movementDate}</TableCell>
                        <TableCell>{MOVEMENT_LABEL[movement.movementType] ?? movement.movementType}</TableCell>
                        <TableCell>
                          <div className="max-w-xl space-y-1">
                            {movement.lines.map((line) => (
                              <p key={line.id} className="truncate text-sm">
                                <span className="font-medium">{itemName(line.itemId)}</span>
                                <span className="text-muted-foreground">
                                  {" "}at {warehouseName(line.warehouseId)} · In {line.quantityIn.toLocaleString()} · Out {line.quantityOut.toLocaleString()} · Cost {formatCurrency(line.unitCost)}
                                </span>
                              </p>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={movement.status === "posted" ? "secondary" : "outline"}>{movement.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{movement.lines.length}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={selectedItem !== null} onOpenChange={(open) => !open && setSelectedItemId(null)}>
        {selectedItem ? (
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{selectedItem.name}</DialogTitle>
              <DialogDescription>{selectedItem.sku}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Quantity On Hand</p>
                <p className="mt-1 text-xl font-semibold">{selectedQuantity.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Inventory Value</p>
                <Amount value={selectedValue} className="mt-1 text-xl font-semibold" />
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Reorder Level</p>
                <p className="mt-1 text-xl font-semibold">{selectedItem.reorderLevel.toLocaleString()}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Item Master</h3>
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-stock-sku">SKU</Label>
                    <Input id="edit-stock-sku" value={editSku} onChange={(event) => setEditSku(event.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-stock-name">Name</Label>
                    <Input id="edit-stock-name" value={editName} onChange={(event) => setEditName(event.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-stock-category">Category</Label>
                      <Input id="edit-stock-category" value={editCategory} onChange={(event) => setEditCategory(event.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-stock-uom">UOM</Label>
                      <Input id="edit-stock-uom" value={editUom} onChange={(event) => setEditUom(event.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Status</Label>
                      <Select value={editStatus} onValueChange={(value) => setEditStatus(value as StockItemStatus)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Costing</Label>
                      <Select value={editCostingMethod} onValueChange={(value) => setEditCostingMethod(value as StockCostingMethod)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weighted_average">Weighted Average</SelectItem>
                          <SelectItem value="fifo">FIFO</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-stock-reorder">Reorder Level</Label>
                    <Input id="edit-stock-reorder" type="number" min="0" step="0.001" value={editReorderLevel} onChange={(event) => setEditReorderLevel(event.target.value)} />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Account Mapping</h3>
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label>Inventory</Label>
                    <Select value={editInventoryAccountId} onValueChange={(value) => setEditInventoryAccountId(value ?? "")}>
                      <SelectTrigger><SelectValue placeholder="Unmapped" /></SelectTrigger>
                      <SelectContent>
                        {assetAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} - {account.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Sales</Label>
                    <Select value={editSalesAccountId} onValueChange={(value) => setEditSalesAccountId(value ?? "")}>
                      <SelectTrigger><SelectValue placeholder="Unmapped" /></SelectTrigger>
                      <SelectContent>
                        {revenueAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} - {account.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>COGS</Label>
                    <Select value={editCogsAccountId} onValueChange={(value) => setEditCogsAccountId(value ?? "")}>
                      <SelectTrigger><SelectValue placeholder="Unmapped" /></SelectTrigger>
                      <SelectContent>
                        {expenseAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} - {account.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-stock-description">Description</Label>
                    <Input id="edit-stock-description" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
                  </div>
                  {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
                  <Button onClick={saveSelectedItem}>
                    <Save className="size-4" />
                    Save Changes
                  </Button>
                </div>
              </section>
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Warehouse Balances</h3>
              {selectedBalances.length === 0 ? (
                <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">No quantity recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Warehouse</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Average Cost</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedBalances.map((balance) => (
                      <TableRow key={balance.id}>
                        <TableCell>{warehouseName(balance.warehouseId)}</TableCell>
                        <TableCell className="text-right">{balance.quantityOnHand.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatCurrency(balance.averageUnitCost)}</TableCell>
                        <TableCell className="text-right">
                          <Amount value={balance.inventoryValue} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={selectedWarehouse !== null} onOpenChange={(open) => !open && setSelectedWarehouse(null)}>
        {selectedWarehouse ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Warehouse</DialogTitle>
              <DialogDescription>{selectedWarehouse.code}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-wh-code">Warehouse Code</Label>
                <Input id="edit-wh-code" value={editWarehouseCode} onChange={(event) => setEditWarehouseCode(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-wh-name">Warehouse Name</Label>
                <Input id="edit-wh-name" value={editWarehouseName} onChange={(event) => setEditWarehouseName(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={editWarehouseStatus} onValueChange={(value) => setEditWarehouseStatus(value as StockItemStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
              <Button onClick={saveSelectedWarehouse}>
                <Save className="size-4" />
                Save Warehouse
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}
