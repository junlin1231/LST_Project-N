"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Camera, Check, FileUp, LoaderCircle, RefreshCw, Save, Send, X } from "lucide-react"
import { Amount } from "@/components/amount"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAccounting } from "@/lib/accounting/store"
import { DOCUMENT_CATEGORIES, type DocumentCategory, type NormalizedDocumentFields, type OcrDocument, type OcrDocumentDetail } from "@/lib/accounting/document-types"
import type { JournalLine } from "@/lib/accounting/types"
import { cn } from "@/lib/utils"

type Notice = { type: "error" | "success"; message: string } | null

const emptyFields: NormalizedDocumentFields = {
  documentDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  documentNumber: "",
  currency: "MYR",
  vendorName: "",
  clientName: "",
  taxId: "",
  subtotal: 0,
  taxAmount: 0,
  totalAmount: 0,
  paymentMethod: "",
  lineItems: [{ description: "", quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, lineTotal: 0 }],
  warnings: [],
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed: ${response.status}`)
  }
  return response.json()
}

function titleCase(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

function statusVariant(status: string) {
  if (status === "posted" || status === "confirmed") return "secondary"
  if (status.includes("failed") || status === "rejected") return "destructive"
  return "outline"
}

function toNumber(value: string) {
  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number : 0
}

function recalculateFields(fields: NormalizedDocumentFields): NormalizedDocumentFields {
  const lineItems = fields.lineItems.map((line) => {
    const quantity = Number(line.quantity) || 0
    const unitPrice = Number(line.unitPrice) || 0
    const taxRate = Number(line.taxRate) || 0
    const baseAmount = Number((quantity * unitPrice).toFixed(2))
    const taxAmount = Number((baseAmount * taxRate).toFixed(2))
    return {
      ...line,
      quantity,
      unitPrice,
      taxRate,
      taxAmount,
      lineTotal: Number((baseAmount + taxAmount).toFixed(2)),
    }
  })
  const subtotal = Number(lineItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0).toFixed(2))
  const taxAmount = Number(lineItems.reduce((sum, line) => sum + line.taxAmount, 0).toFixed(2))
  return { ...fields, lineItems, subtotal, taxAmount, totalAmount: Number((subtotal + taxAmount).toFixed(2)), warnings: [] }
}

export function DocumentsView() {
  const { accounts, accountName } = useAccounting()
  const [documents, setDocuments] = useState<OcrDocument[]>([])
  const [selected, setSelected] = useState<OcrDocumentDetail | null>(null)
  const [category, setCategory] = useState<DocumentCategory>("unknown")
  const [fields, setFields] = useState<NormalizedDocumentFields>(emptyFields)
  const [lines, setLines] = useState<JournalLine[]>([])
  const [busy, setBusy] = useState(false)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [scanProgress, setScanProgress] = useState(0)
  const [notice, setNotice] = useState<Notice>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const selectedId = selected?.id
  const canEdit = !!selected?.draft && selected.processingStatus !== "posted" && selected.processingStatus !== "rejected"
  const canConfirm = selected?.draft?.status === "draft" || selected?.draft?.status === "rejected"
  const canPost = selected?.draft?.status === "confirmed" && selected.processingStatus !== "posted"
  const warnings = fields.warnings ?? []
  const isScanning = activeAction === "process"

  async function loadDocuments() {
    const next = await readJson<OcrDocument[]>(await fetch("/api/documents", { cache: "no-store" }))
    setDocuments(next)
    if (selectedId) {
      const refreshed = await readJson<OcrDocumentDetail>(await fetch(`/api/documents/${selectedId}`, { cache: "no-store" }))
      setSelected(refreshed)
    }
  }

  useEffect(() => {
    void loadDocuments().catch((error) => setNotice({ type: "error", message: error.message }))
  }, [])

  useEffect(() => {
    if (!selected?.draft) {
      setCategory(selected?.categoryResult?.category ?? "unknown")
      setFields(emptyFields)
      setLines([])
      return
    }
    setCategory(selected.draft.draftType)
    setFields(selected.draft.normalizedFields)
    setLines(selected.draft.suggestedJournalLines)
  }, [selected])

  useEffect(() => {
    if (!isScanning) return
    const interval = window.setInterval(() => {
      setScanProgress((current) => {
        if (current < 35) return current + 7
        if (current < 70) return current + 4
        if (current < 92) return current + 1
        return current
      })
    }, 800)
    return () => window.clearInterval(interval)
  }, [isScanning])

  async function selectDocument(id: string) {
    setBusy(true)
    setNotice(null)
    try {
      setSelected(await readJson<OcrDocumentDetail>(await fetch(`/api/documents/${id}`, { cache: "no-store" })))
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Failed to load document." })
    } finally {
      setBusy(false)
    }
  }

  async function upload(file: File | undefined, sourceChannel: "web_upload" | "camera_capture") {
    if (!file) return
    setBusy(true)
    setNotice(null)
    try {
      const formData = new FormData()
      formData.set("file", file)
      formData.set("sourceChannel", sourceChannel)
      const created = await readJson<OcrDocumentDetail>(await fetch("/api/documents", { method: "POST", body: formData }))
      setSelected(created)
      await loadDocuments()
      setNotice({ type: "success", message: "Document stored. Run OCR to capture data." })
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Upload failed." })
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
      if (cameraInputRef.current) cameraInputRef.current.value = ""
    }
  }

  async function action(path: string, options?: RequestInit) {
    if (!selected) return
    const isOcrProcess = path === "process"
    setBusy(true)
    setActiveAction(path)
    if (isOcrProcess) setScanProgress(6)
    setNotice(null)
    try {
      const response = await fetch(`/api/documents/${selected.id}/${path}`, options ?? { method: "POST" })
      const body = await readJson<{ detail?: OcrDocumentDetail; journalEntry?: { id: string } } | OcrDocumentDetail>(response)
      const detail = "detail" in body && body.detail ? body.detail : body as OcrDocumentDetail
      if (isOcrProcess) setScanProgress(100)
      setSelected(detail)
      await loadDocuments()
      setNotice({ type: "success", message: path === "post" ? `Posted journal entry ${"journalEntry" in body ? body.journalEntry?.id ?? "" : ""}`.trim() : "Document updated." })
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Action failed." })
    } finally {
      setBusy(false)
      if (isOcrProcess) {
        window.setTimeout(() => {
          setActiveAction((current) => (current === path ? null : current))
          setScanProgress(0)
        }, 700)
      } else {
        setActiveAction(null)
      }
    }
  }

  async function saveDraft() {
    if (!selected) return
    const normalized = recalculateFields(fields)
    await action("draft", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, normalizedFields: normalized, suggestedJournalLines: lines }),
    })
  }

  function updateLine(index: number, changes: Partial<JournalLine>) {
    setLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line)))
  }

  function updateItem(index: number, changes: Partial<NormalizedDocumentFields["lineItems"][number]>) {
    setFields((current) => recalculateFields({
      ...current,
      lineItems: current.lineItems.map((line, lineIndex) => (lineIndex === index ? { ...line, ...changes } : line)),
    }))
  }

  const documentCards = useMemo(() => documents.map((document) => (
    <button
      key={document.id}
      type="button"
      onClick={() => void selectDocument(document.id)}
      className={cn(
        "w-full rounded-md border border-border bg-card p-3 text-left transition-colors hover:bg-muted/60",
        selected?.id === document.id && "border-primary bg-accent",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{document.originalFilename}</p>
          <p className="mt-1 text-xs text-muted-foreground">{document.sourceChannel === "camera_capture" ? "Photo capture" : "File upload"}</p>
        </div>
        <Badge variant={statusVariant(document.processingStatus)}>{titleCase(document.processingStatus)}</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{new Date(document.uploadedAt).toLocaleString()}</p>
    </button>
  )), [documents, selected?.id])

  return (
    <main className="p-4 sm:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <PageHeader
          title="Documents"
          description="Capture OCR data, edit it, confirm it, then post it to accounting."
          actions={
            <div className="flex flex-wrap gap-2">
              <input ref={fileInputRef} className="hidden" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png" onChange={(event) => void upload(event.target.files?.[0], "web_upload")} />
              <input ref={cameraInputRef} className="hidden" type="file" accept="image/*" capture="environment" onChange={(event) => void upload(event.target.files?.[0], "camera_capture")} />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                <FileUp className="size-4" />
                Upload File
              </Button>
              <Button variant="outline" onClick={() => cameraInputRef.current?.click()} disabled={busy}>
                <Camera className="size-4" />
                Take Photo
              </Button>
            </div>
          }
        />

        {notice ? (
          <div className={cn("rounded-md border p-3 text-sm", notice.type === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-credit/30 bg-credit/10 text-credit")}>
            {notice.message}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <section className="space-y-2">
            {documents.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No documents yet.</div>
            ) : documentCards}
          </section>

          <section className="min-w-0 rounded-md border border-border bg-card">
            {!selected ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Select a document to review captured data.</div>
            ) : (
              <div className="flex min-h-[34rem] flex-col">
                <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{selected.originalFilename}</h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={statusVariant(selected.processingStatus)}>{titleCase(selected.processingStatus)}</Badge>
                      <Badge variant="outline">{selected.categoryResult ? titleCase(selected.categoryResult.category) : "Not categorized"}</Badge>
                      {selected.categoryResult ? <Badge variant="outline">{Math.round(selected.categoryResult.confidence * 100)}% confidence</Badge> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void action("process")} disabled={busy}>
                      {isScanning ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                      {isScanning ? "Scanning" : "OCR"}
                    </Button>
                    <Button variant="outline" onClick={saveDraft} disabled={busy || !canEdit}>
                      <Save className="size-4" />
                      Save Edits
                    </Button>
                    <Button onClick={() => void action("confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Confirmed after preview." }) })} disabled={busy || !canConfirm}>
                      <Check className="size-4" />
                      Confirm
                    </Button>
                    <Button onClick={() => void action("post")} disabled={busy || !canPost}>
                      <Send className="size-4" />
                      Post
                    </Button>
                    <Button variant="outline" onClick={() => void action("reject", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Rejected before posting." }) })} disabled={busy || selected.processingStatus === "posted"}>
                      <X className="size-4" />
                      Reject
                    </Button>
                  </div>
                </div>

                {isScanning ? <ScanProgress progress={scanProgress} filename={selected.originalFilename} /> : null}

                <Tabs defaultValue="fields" className="flex-1 p-4">
                  <TabsList className="grid h-auto w-full grid-cols-4">
                    <TabsTrigger value="file">File</TabsTrigger>
                    <TabsTrigger value="fields">Fields</TabsTrigger>
                    <TabsTrigger value="category">Category</TabsTrigger>
                    <TabsTrigger value="journal">Journal</TabsTrigger>
                  </TabsList>

                  <TabsContent value="file" className="mt-4 space-y-3">
                    <div className="overflow-hidden rounded-md border border-border bg-muted/20">
                      {selected.mimeType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/documents/${selected.id}/file`} alt={selected.originalFilename} className="max-h-[28rem] w-full object-contain" />
                      ) : selected.mimeType === "application/pdf" ? (
                        <iframe title={selected.originalFilename} src={`/api/documents/${selected.id}/file`} className="h-[28rem] w-full" />
                      ) : (
                        <div className="p-6 text-sm text-muted-foreground">Preview is not available for this file type. Download the original file to inspect it.</div>
                      )}
                    </div>
                    <Button variant="outline" onClick={() => window.open(`/api/documents/${selected.id}/file`, "_blank", "noreferrer")}>
                      Open Original
                    </Button>
                    {selected.extraction?.rawText ? (
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs">{selected.extraction.rawText}</pre>
                    ) : null}
                  </TabsContent>

                  <TabsContent value="fields" className="mt-4 space-y-4">
                    {warnings.length > 0 ? (
                      <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                        {warnings.map((warning) => <p key={warning}>{warning}</p>)}
                      </div>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <Field label="Document Date"><Input type="date" value={fields.documentDate} onChange={(event) => setFields((current) => ({ ...current, documentDate: event.target.value }))} /></Field>
                      <Field label="Due Date"><Input type="date" value={fields.dueDate ?? ""} onChange={(event) => setFields((current) => ({ ...current, dueDate: event.target.value }))} /></Field>
                      <Field label="Document No."><Input value={fields.documentNumber ?? ""} onChange={(event) => setFields((current) => ({ ...current, documentNumber: event.target.value }))} /></Field>
                      <Field label="Vendor"><Input value={fields.vendorName ?? ""} onChange={(event) => setFields((current) => ({ ...current, vendorName: event.target.value }))} /></Field>
                      <Field label="Currency"><Input value={fields.currency} onChange={(event) => setFields((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} /></Field>
                      <Field label="Payment Method"><Input value={fields.paymentMethod ?? ""} onChange={(event) => setFields((current) => ({ ...current, paymentMethod: event.target.value }))} /></Field>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <Summary label="Subtotal" value={fields.subtotal} />
                      <Summary label="Tax" value={fields.taxAmount} />
                      <Summary label="Total" value={fields.totalAmount} />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Line Items</h3>
                        <Button variant="outline" size="sm" onClick={() => setFields((current) => ({ ...current, lineItems: [...current.lineItems, { description: "", quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, lineTotal: 0 }] }))}>Add Line</Button>
                      </div>
                      <div className="space-y-2">
                        {fields.lineItems.map((line, index) => (
                          <div key={index} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[minmax(10rem,1fr)_5rem_7rem_6rem_7rem_auto]">
                            <Input value={line.description} placeholder="Description" onChange={(event) => updateItem(index, { description: event.target.value })} />
                            <Input inputMode="decimal" value={line.quantity} className="text-right" onChange={(event) => updateItem(index, { quantity: toNumber(event.target.value) })} />
                            <Input inputMode="decimal" value={line.unitPrice} className="text-right" onChange={(event) => updateItem(index, { unitPrice: toNumber(event.target.value) })} />
                            <Input inputMode="decimal" value={line.taxRate} className="text-right" onChange={(event) => updateItem(index, { taxRate: toNumber(event.target.value) })} />
                            <div className="flex h-10 items-center justify-end rounded-md border border-input px-3 text-sm"><Amount value={line.lineTotal} /></div>
                            <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setFields((current) => recalculateFields({ ...current, lineItems: current.lineItems.filter((_, lineIndex) => lineIndex !== index) }))}><X className="size-4" /></Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="category" className="mt-4 space-y-4">
                    <Field label="Category">
                      <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value as DocumentCategory)}>
                        {DOCUMENT_CATEGORIES.map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}
                      </select>
                    </Field>
                    <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                      {selected.categoryResult?.reason ?? "Run OCR to get a category suggestion."}
                    </div>
                  </TabsContent>

                  <TabsContent value="journal" className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Suggested Journal Entry</h3>
                      <Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, { accountId: accounts[0]?.id ?? "", debit: 0, credit: 0 }])}>Add Line</Button>
                    </div>
                    {lines.map((line, index) => (
                      <div key={index} className="grid gap-2 rounded-md border border-border p-3 md:grid-cols-[minmax(12rem,1fr)_8rem_8rem_auto]">
                        <select className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm" value={line.accountId} onChange={(event) => updateLine(index, { accountId: event.target.value })}>
                          {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
                        </select>
                        <Input inputMode="decimal" className="text-right" value={line.debit} onChange={(event) => updateLine(index, { debit: toNumber(event.target.value) })} />
                        <Input inputMode="decimal" className="text-right" value={line.credit} onChange={(event) => updateLine(index, { credit: toNumber(event.target.value) })} />
                        <Button variant="ghost" size="icon" aria-label="Remove journal line" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><X className="size-4" /></Button>
                      </div>
                    ))}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Summary label="Debit" value={lines.reduce((sum, line) => sum + Number(line.debit), 0)} />
                      <Summary label="Credit" value={lines.reduce((sum, line) => sum + Number(line.credit), 0)} />
                      <Summary label="Difference" value={Math.abs(lines.reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0))} />
                    </div>
                    <p className="text-xs text-muted-foreground">Account names use current chart of accounts. Example: {lines[0] ? accountName(lines[0].accountId) : "No account selected"}.</p>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Amount value={value} className="mt-1 font-semibold" />
    </div>
  )
}

function ScanProgress({ progress, filename }: { progress: number; filename: string }) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)))

  return (
    <div className="border-b border-border bg-muted/30 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">Scanning {filename}</p>
          <p className="text-xs text-muted-foreground">Reading document, extracting fields, and preparing the posting preview.</p>
        </div>
        <p className="shrink-0 text-sm tabular-nums text-muted-foreground">{safeProgress}%</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
          style={{ width: `${safeProgress}%` }}
          role="progressbar"
          aria-label="OCR scanning progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={safeProgress}
        />
      </div>
    </div>
  )
}
