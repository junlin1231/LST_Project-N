"use client"

import { useEffect, useMemo, useState } from "react"
import { FileText, GitBranch, MoreHorizontal, Plus, Save, Trash2 } from "lucide-react"
import { Amount } from "@/components/amount"
import { ConfirmationDialog } from "@/components/governance/confirmation-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UPDATE_CONFIRMATION_PHRASE } from "@/lib/accounting/governance"
import { useAccounting } from "@/lib/accounting/store"
import { formatDate } from "@/lib/accounting/utils"
import type { ContactType, StockItem, Warehouse, WorkflowDocument, WorkflowDocumentLine, WorkflowDocumentType } from "@/lib/accounting/types"

const DEFAULT_STATUSES: Record<WorkflowDocumentType, string[]> = {
  quotation: ["draft", "sent", "accepted", "rejected", "expired", "cancelled"],
  sales_order: ["draft", "confirmed", "partially_delivered", "delivered", "invoiced", "cancelled"],
  delivery_order: ["draft", "posted", "partially_invoiced", "invoiced", "voided"],
  purchase_requisition: ["draft", "submitted", "approved", "rejected", "converted", "cancelled"],
  purchase_order: ["draft", "issued", "partially_received", "received", "billed", "cancelled"],
  goods_received_note: ["draft", "posted", "partially_billed", "billed", "voided"],
}

const WAREHOUSE_DOCUMENTS = new Set<WorkflowDocumentType>(["delivery_order", "goods_received_note"])
const today = new Date().toISOString().slice(0, 10)
const noneValue = "__none__"

type DraftLine = {
  key: string
  id?: string
  itemId: string
  warehouseId: string
  description: string
  quantity: string
  unitPrice: string
  taxRate: string
}

function titleCase(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

function emptyDraftLine(): DraftLine {
  return { key: crypto.randomUUID(), itemId: "", warehouseId: "", description: "", quantity: "1", unitPrice: "0", taxRate: "0" }
}

function draftLineFromLine(line: WorkflowDocumentLine): DraftLine {
  return {
    key: crypto.randomUUID(),
    id: line.id,
    itemId: line.itemId ?? "",
    warehouseId: line.warehouseId ?? "",
    description: line.description,
    quantity: String(line.quantity),
    unitPrice: String(line.unitPrice),
    taxRate: String(line.taxRate * 100),
  }
}

function amountForLine(line: DraftLine) {
  const quantity = Number.parseFloat(line.quantity) || 0
  const unitPrice = Number.parseFloat(line.unitPrice) || 0
  const taxRate = (Number.parseFloat(line.taxRate) || 0) / 100
  const baseAmount = Number((quantity * unitPrice).toFixed(2))
  const taxAmount = Number((baseAmount * taxRate).toFixed(2))
  return Number((baseAmount + taxAmount).toFixed(2))
}

function normalizeLines(lines: DraftLine[]) {
  const result = lines
    .map((line) => {
      const quantity = Number.parseFloat(line.quantity) || 0
      const unitPrice = Number.parseFloat(line.unitPrice) || 0
      const taxRate = (Number.parseFloat(line.taxRate) || 0) / 100
      const baseAmount = Number((quantity * unitPrice).toFixed(2))
      const taxAmount = Number((baseAmount * taxRate).toFixed(2))
      return {
        id: line.id ?? `wf-line-${crypto.randomUUID()}`,
        itemId: line.itemId || undefined,
        warehouseId: line.warehouseId || undefined,
        description: line.description.trim(),
        quantity,
        unitPrice,
        taxRate,
        taxAmount,
        lineTotal: Number((baseAmount + taxAmount).toFixed(2)),
      }
    })
    .filter((line) => line.description || line.itemId || line.quantity > 0 || line.unitPrice > 0)

  if (result.length === 0) return { error: "Add at least one line.", lines: [] as WorkflowDocumentLine[] }
  if (result.some((line) => !line.description)) return { error: "Every line needs a description.", lines: [] as WorkflowDocumentLine[] }
  if (result.some((line) => line.quantity <= 0)) return { error: "Quantity must be greater than zero.", lines: [] as WorkflowDocumentLine[] }
  if (result.some((line) => line.unitPrice < 0)) return { error: "Unit price must be zero or greater.", lines: [] as WorkflowDocumentLine[] }
  if (result.some((line) => line.taxRate < 0)) return { error: "Tax rate must be zero or greater.", lines: [] as WorkflowDocumentLine[] }
  return { error: "", lines: result }
}

function LineEditor({
  idPrefix,
  lines,
  setLines,
  stockItems,
  warehouses,
  showWarehouse,
}: {
  idPrefix: string
  lines: DraftLine[]
  setLines: (updater: (current: DraftLine[]) => DraftLine[]) => void
  stockItems: StockItem[]
  warehouses: Warehouse[]
  showWarehouse: boolean
}) {
  function updateLine(key: string, changes: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...changes } : line)))
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">Description</TableHead>
              <TableHead className="min-w-40">Item</TableHead>
              {showWarehouse ? <TableHead className="min-w-36">Warehouse</TableHead> : null}
              <TableHead className="w-24 text-right">Qty</TableHead>
              <TableHead className="w-32 text-right">Unit Price</TableHead>
              <TableHead className="w-24 text-right">Tax %</TableHead>
              <TableHead className="w-32 text-right">Line Total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => (
              <TableRow key={line.key}>
                <TableCell>
                  <Input
                    id={`${idPrefix}-description-${index}`}
                    value={line.description}
                    onChange={(event) => updateLine(line.key, { description: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={line.itemId || noneValue}
                    onValueChange={(value) => {
                      if (!value) return
                      const itemId = value === noneValue ? "" : value
                      const item = stockItems.find((stockItem) => stockItem.id === itemId)
                      updateLine(line.key, { itemId, description: line.description || item?.name || "" })
                    }}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent className="min-w-96 max-w-[min(36rem,calc(100vw-2rem))]" alignItemWithTrigger={false}>
                      <SelectItem value={noneValue}>No item</SelectItem>
                      {stockItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          <span className="flex min-w-0 flex-col items-start gap-0.5 whitespace-normal">
                            <span className="font-medium">{item.name}</span>
                            <span className="text-xs text-muted-foreground">{item.sku} · {item.category || "Unassigned"} · {item.uom}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                {showWarehouse ? (
                  <TableCell>
                    <Select value={line.warehouseId || noneValue} onValueChange={(value) => { if (value) updateLine(line.key, { warehouseId: value === noneValue ? "" : value }) }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={noneValue}>No warehouse</SelectItem>
                        {warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.code} - {warehouse.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                ) : null}
                <TableCell><Input className="text-right" inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} /></TableCell>
                <TableCell><Input className="text-right" inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} /></TableCell>
                <TableCell><Input className="text-right" inputMode="decimal" value={line.taxRate} onChange={(event) => updateLine(line.key, { taxRate: event.target.value })} /></TableCell>
                <TableCell className="text-right"><Amount value={amountForLine(line)} /></TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="size-8" aria-label="Remove line" onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}>
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, emptyDraftLine()])}>
        <Plus className="size-4" />
        Add Line
      </Button>
    </div>
  )
}

export function WorkflowDocumentPanel({
  type,
  title,
  contactType,
}: {
  type: WorkflowDocumentType
  title: string
  contactType?: ContactType
}) {
  const { contacts, workflowDocuments, stockItems, warehouses, addWorkflowDocument, updateWorkflowDocument, setWorkflowDocumentStatus } = useAccounting()
  const documents = workflowDocuments.filter((document) => document.documentType === type)
  const contactOptions = contactType ? contacts.filter((contact) => contact.type === contactType) : []
  const activeStockItems = stockItems.filter((item) => item.status === "active")
  const activeWarehouses = warehouses.filter((warehouse) => warehouse.status === "active")
  const showWarehouse = WAREHOUSE_DOCUMENTS.has(type)
  const [open, setOpen] = useState(false)
  const [contactId, setContactId] = useState("")
  const [documentDate, setDocumentDate] = useState(today)
  const [sourceDocumentId, setSourceDocumentId] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([emptyDraftLine()])
  const [error, setError] = useState("")
  const [pendingStatus, setPendingStatus] = useState<{ document: WorkflowDocument; status: string } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editContactId, setEditContactId] = useState("")
  const [editDocumentDate, setEditDocumentDate] = useState(today)
  const [editStatus, setEditStatus] = useState("")
  const [editSourceDocumentId, setEditSourceDocumentId] = useState("")
  const [editLines, setEditLines] = useState<DraftLine[]>([emptyDraftLine()])
  const [editError, setEditError] = useState("")

  const contactName = (id?: string) => contacts.find((contact) => contact.id === id)?.name ?? "-"
  const sourceOptions = workflowDocuments.filter((document) => document.documentType !== type)
  const selectedDocument = selectedId ? workflowDocuments.find((document) => document.id === selectedId) ?? null : null
  const sourceDocument = selectedDocument?.sourceDocumentId
    ? workflowDocuments.find((document) => document.id === selectedDocument.sourceDocumentId)
    : undefined
  const downstreamDocuments = selectedDocument
    ? workflowDocuments.filter((document) => document.sourceDocumentId === selectedDocument.id)
    : []
  const totalAmount = useMemo(() => Number(lines.reduce((sum, line) => sum + amountForLine(line), 0).toFixed(2)), [lines])
  const editTotalAmount = useMemo(() => Number(editLines.reduce((sum, line) => sum + amountForLine(line), 0).toFixed(2)), [editLines])

  function reset() {
    setContactId("")
    setDocumentDate(today)
    setSourceDocumentId("")
    setLines([emptyDraftLine()])
    setError("")
  }

  useEffect(() => {
    const source = workflowDocuments.find((document) => document.id === sourceDocumentId)
    if (!source || source.lines.length === 0) return
    setLines(source.lines.map((line) => ({ ...draftLineFromLine(line), id: undefined, warehouseId: showWarehouse ? line.warehouseId ?? "" : "" })))
  }, [sourceDocumentId, showWarehouse, workflowDocuments])

  useEffect(() => {
    if (!selectedDocument) return
    setEditContactId(selectedDocument.contactId ?? "")
    setEditDocumentDate(selectedDocument.documentDate)
    setEditStatus(selectedDocument.status)
    setEditSourceDocumentId(selectedDocument.sourceDocumentId ?? "")
    setEditLines(selectedDocument.lines.length > 0 ? selectedDocument.lines.map(draftLineFromLine) : [emptyDraftLine()])
    setEditError("")
  }, [selectedDocument])

  function submit() {
    const normalized = normalizeLines(lines)
    if (contactType && !contactId) return setError(`Select a ${contactType === "client" ? "customer" : "vendor"}.`)
    if (!documentDate) return setError("Document date is required.")
    if (normalized.error) return setError(normalized.error)
    addWorkflowDocument({
      documentType: type,
      contactId: contactId || undefined,
      documentDate,
      totalAmount,
      status: DEFAULT_STATUSES[type][0],
      sourceDocumentId: sourceDocumentId || undefined,
      lines: normalized.lines,
    })
    reset()
    setOpen(false)
  }

  function saveSelectedDocument() {
    if (!selectedDocument) return
    const normalized = normalizeLines(editLines)
    if (contactType && !editContactId) return setEditError(`Select a ${contactType === "client" ? "customer" : "vendor"}.`)
    if (!editDocumentDate) return setEditError("Document date is required.")
    if (normalized.error) return setEditError(normalized.error)
    updateWorkflowDocument(selectedDocument.id, {
      contactId: editContactId || undefined,
      documentDate: editDocumentDate,
      totalAmount: editTotalAmount,
      status: editStatus || selectedDocument.status,
      sourceDocumentId: editSourceDocumentId || undefined,
      lines: normalized.lines,
    })
    setEditError("")
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) reset() }}>
          <DialogTrigger render={<Button variant="outline"><Plus className="size-4" />New {title}</Button>} />
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>New {title}</DialogTitle>
              <DialogDescription>Create a draft workflow document with item and quantity detail.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              {contactType ? (
                <div className="grid gap-2">
                  <Label>{contactType === "client" ? "Customer" : "Vendor"}</Label>
                  <Select value={contactId} onValueChange={(value) => setContactId(value ?? "")}>
                    <SelectTrigger><SelectValue placeholder={`Select ${contactType === "client" ? "customer" : "vendor"}`} /></SelectTrigger>
                    <SelectContent>
                      {contactOptions.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>{contact.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`${type}-date`}>Date</Label>
                  <Input id={`${type}-date`} type="date" value={documentDate} onChange={(event) => setDocumentDate(event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Total</Label>
                  <div className="flex h-10 items-center justify-end rounded-md border border-input px-3 text-sm font-semibold">
                    <Amount value={totalAmount} />
                  </div>
                </div>
              </div>
              {sourceOptions.length > 0 ? (
                <div className="grid gap-2">
                  <Label>Source Document</Label>
                  <Select value={sourceDocumentId || noneValue} onValueChange={(value) => setSourceDocumentId(!value || value === noneValue ? "" : value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={noneValue}>No source document</SelectItem>
                      {sourceOptions.map((document) => (
                        <SelectItem key={document.id} value={document.id}>{document.documentNumber} - {titleCase(document.documentType)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <LineEditor idPrefix={`new-${type}`} lines={lines} setLines={setLines} stockItems={activeStockItems} warehouses={activeWarehouses} showWarehouse={showWarehouse} />
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No {title.toLowerCase()} documents yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No.</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow
                    key={document.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(document.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        setSelectedId(document.id)
                      }
                    }}
                  >
                    <TableCell className="font-mono text-sm">{document.documentNumber}</TableCell>
                    <TableCell className="font-medium">{contactName(document.contactId)}</TableCell>
                    <TableCell>{formatDate(document.documentDate)}</TableCell>
                    <TableCell><Badge variant={document.status === "posted" || document.status === "accepted" || document.status === "approved" || document.status === "issued" || document.status === "confirmed" ? "secondary" : "outline"}>{titleCase(document.status)}</Badge></TableCell>
                    <TableCell className="text-right">{document.lines.length}</TableCell>
                    <TableCell className="text-right"><Amount value={document.totalAmount} /></TableCell>
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" aria-label="Change status"><MoreHorizontal className="size-4" /></Button>} />
                        <DropdownMenuContent align="end">
                          <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">Update Status</div>
                          <DropdownMenuSeparator />
                          {DEFAULT_STATUSES[type].map((status) => (
                            <DropdownMenuItem
                              key={status}
                              onClick={(event) => {
                                event.stopPropagation()
                                setPendingStatus({ document, status })
                              }}
                            >
                              {titleCase(status)}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={!!pendingStatus}
        title="Update Workflow Status"
        description="Review this document status change before it is saved."
        impactSummary={pendingStatus ? `This will change ${pendingStatus.document.documentNumber} from ${titleCase(pendingStatus.document.status)} to ${titleCase(pendingStatus.status)}.` : ""}
        confirmationPhrase={UPDATE_CONFIRMATION_PHRASE}
        confirmLabel="Confirm & Update"
        onOpenChange={(nextOpen) => { if (!nextOpen) setPendingStatus(null) }}
        onConfirm={(confirmation) => {
          if (!pendingStatus) return
          setWorkflowDocumentStatus(pendingStatus.document.id, pendingStatus.status, confirmation)
          setPendingStatus(null)
        }}
      />

      <Dialog open={selectedDocument !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setSelectedId(null) }}>
        {selectedDocument ? (
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{selectedDocument.documentNumber}</DialogTitle>
              <DialogDescription>{title} detail and workflow context.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-1">
                  <Badge variant={selectedDocument.status === "posted" || selectedDocument.status === "accepted" || selectedDocument.status === "approved" || selectedDocument.status === "issued" || selectedDocument.status === "confirmed" ? "secondary" : "outline"}>
                    {titleCase(selectedDocument.status)}
                  </Badge>
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Document Date</p>
                <p className="mt-1 font-medium">{formatDate(selectedDocument.documentDate)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Total Amount</p>
                <Amount value={editTotalAmount} className="mt-1 font-semibold" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Modify Header</h3>
                <div className="grid gap-3">
                  {contactType ? (
                    <div className="grid gap-2">
                      <Label>{contactType === "client" ? "Customer" : "Vendor"}</Label>
                      <Select value={editContactId} onValueChange={(value) => setEditContactId(value ?? "")}>
                        <SelectTrigger><SelectValue placeholder={`Select ${contactType === "client" ? "customer" : "vendor"}`} /></SelectTrigger>
                        <SelectContent>
                          {contactOptions.map((contact) => (
                            <SelectItem key={contact.id} value={contact.id}>{contact.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`edit-${type}-date`}>Date</Label>
                      <Input id={`edit-${type}-date`} type="date" value={editDocumentDate} onChange={(event) => setEditDocumentDate(event.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Status</Label>
                      <Select value={editStatus} onValueChange={(value) => setEditStatus(value ?? "")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DEFAULT_STATUSES[type].map((status) => (
                            <SelectItem key={status} value={status}>{titleCase(status)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Source Document</Label>
                    <Select value={editSourceDocumentId || noneValue} onValueChange={(value) => setEditSourceDocumentId(!value || value === noneValue ? "" : value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={noneValue}>No source document</SelectItem>
                        {sourceOptions.filter((document) => document.id !== selectedDocument.id).map((document) => (
                          <SelectItem key={document.id} value={document.id}>{document.documentNumber} - {titleCase(document.documentType)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Type</dt>
                    <dd>{title}</dd>
                    <dt className="text-muted-foreground">Reference</dt>
                    <dd className="font-mono">{selectedDocument.id}</dd>
                  </dl>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Workflow</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2 rounded-lg border border-border p-3">
                    <GitBranch className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Source Document</p>
                      <p className="text-muted-foreground">{sourceDocument ? `${sourceDocument.documentNumber} (${titleCase(sourceDocument.documentType)})` : "No source linked"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg border border-border p-3">
                    <FileText className="mt-0.5 size-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Downstream Documents</p>
                      <p className="text-muted-foreground">
                        {downstreamDocuments.length > 0
                          ? downstreamDocuments.map((document) => `${document.documentNumber} (${titleCase(document.documentType)})`).join(", ")
                          : "No downstream documents linked"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Modify Lines</h3>
              <LineEditor idPrefix={`edit-${type}`} lines={editLines} setLines={setEditLines} stockItems={stockItems} warehouses={warehouses} showWarehouse={showWarehouse} />
            </section>

            {editError ? <p className="text-sm text-destructive">{editError}</p> : null}
            <div className="flex flex-wrap justify-between gap-2">
              <Button onClick={saveSelectedDocument}>
                <Save className="size-4" />
                Save Changes
              </Button>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_STATUSES[type].map((status) => (
                  <Button
                    key={status}
                    variant={status === selectedDocument.status ? "secondary" : "outline"}
                    onClick={() => setPendingStatus({ document: selectedDocument, status })}
                  >
                    {titleCase(status)}
                  </Button>
                ))}
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  )
}
