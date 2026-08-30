"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Camera, Check, FileUp, LoaderCircle, RefreshCw, Save, Send, Trash2, X } from "lucide-react"
import { Amount } from "@/components/amount"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAccounting } from "@/lib/accounting/store"
import type { DocumentMasterDataOption } from "@/lib/accounting/document-master-data"
import { DOCUMENT_CATEGORIES, type DocumentCategory, type NormalizedDocumentFields, type OcrDocument, type OcrDocumentDetail } from "@/lib/accounting/document-types"
import type { JournalLine } from "@/lib/accounting/types"
import { cn } from "@/lib/utils"

type Notice = { type: "error" | "success"; message: string } | null
type PostingTemplate = "expense_paid" | "vendor_bill" | "money_received" | "manual"
type SplitTransactionSummary = {
  id: string
  label: string
  category: DocumentCategory
  status: string
  party: string
  date: string
  amount: number
}
type DocumentActionResponse = OcrDocumentDetail | {
  detail: OcrDocumentDetail
  journalEntry?: { id: string }
  journalEntries?: Array<{ id: string }>
  splitDocuments?: OcrDocumentDetail[]
  skippedPostedDocumentCount?: number
}

const DEFAULT_TAX_RATE = 0.06
const CURRENCY_OPTIONS = ["MYR", "USD", "SGD", "CNY", "EUR", "GBP", "JPY", "AUD", "THB", "IDR"] as const
const PAYMENT_METHOD_OPTIONS = [
  { value: "", label: "Unpaid / Not Set" },
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "online_banking", label: "Online Banking" },
  { value: "credit_card", label: "Credit Card" },
  { value: "debit_card", label: "Debit Card" },
  { value: "e_wallet", label: "E-Wallet" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other Paid Method" },
] as const

const FALLBACK_MASTER_DATA_OPTIONS: DocumentMasterDataOption[] = [
  ...CURRENCY_OPTIONS.map((value, index) => ({ id: `fallback-currency-${value}`, type: "currency" as const, value, label: value, isActive: true, sortOrder: index + 1 })),
  ...PAYMENT_METHOD_OPTIONS.map((option, index) => ({ id: `fallback-payment-${option.value || "blank"}`, type: "payment_method" as const, value: option.value, label: option.label, isActive: true, sortOrder: index + 1 })),
]

const emptyFields: NormalizedDocumentFields = {
  documentDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  documentNumber: "",
  currency: "MYR",
  vendorName: "",
  clientName: "",
  taxId: "",
  subtotal: 0,
  otherCharges: 0,
  taxAmount: 0,
  totalAmount: 0,
  paymentMethod: "",
  lineItems: [{ description: "", quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, lineTotal: 0 }],
  bankTransactions: [],
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

function accountIdByCode(accounts: { id: string; code: string; type: string }[], code: string, fallbackType: string) {
  return accounts.find((account) => account.code === code)?.id ?? accounts.find((account) => account.type === fallbackType)?.id ?? accounts[0]?.id ?? ""
}

function firstTextMatch(text: string, groups: Array<{ code: string; keywords: string[] }>) {
  const lower = text.toLowerCase()
  return groups.find((group) => group.keywords.some((keyword) => lower.includes(keyword)))?.code
}

function splitTotalIncludingTax(total: number, taxRate = DEFAULT_TAX_RATE) {
  if (!Number.isFinite(total) || total <= 0 || taxRate <= 0) return { subtotal: Math.max(0, total), taxAmount: 0 }
  const subtotal = Number((total / (1 + taxRate)).toFixed(2))
  return { subtotal, taxAmount: Number((total - subtotal).toFixed(2)) }
}

function selectValueWithCurrent(options: readonly string[], value: string) {
  const normalized = value.trim()
  return normalized && !options.includes(normalized) ? [normalized, ...options] : options
}

function splitTransactionSummary(document: OcrDocumentDetail, index: number): SplitTransactionSummary {
  const fields = document.draft?.normalizedFields ?? document.extraction?.extractedFields
  const amount = Number(fields?.totalAmount ?? 0)
  return {
    id: document.id,
    label: `Transaction ${document.receiptIndex ?? index + 1}`,
    category: document.draft?.draftType ?? document.categoryResult?.category ?? "unknown",
    status: document.reviewStatus,
    party: fields?.vendorName || fields?.clientName || document.originalFilename,
    date: fields?.documentDate || new Date(document.uploadedAt).toISOString().slice(0, 10),
    amount: Number.isFinite(amount) ? amount : 0,
  }
}

function recalculateFields(fields: NormalizedDocumentFields): NormalizedDocumentFields {
  const otherCharges = Number(fields.otherCharges) || 0
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
  return { ...fields, lineItems, subtotal, otherCharges, taxAmount, totalAmount: Number((subtotal + otherCharges + taxAmount).toFixed(2)), warnings: [] }
}

export function DocumentsView() {
  const { accounts, accountName, refreshAccountingData } = useAccounting()
  const [documents, setDocuments] = useState<OcrDocument[]>([])
  const [selected, setSelected] = useState<OcrDocumentDetail | null>(null)
  const [category, setCategory] = useState<DocumentCategory>("unknown")
  const [fields, setFields] = useState<NormalizedDocumentFields>(emptyFields)
  const [lines, setLines] = useState<JournalLine[]>([])
  const [postingTemplate, setPostingTemplate] = useState<PostingTemplate>("expense_paid")
  const [busy, setBusy] = useState(false)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const [processingDocumentId, setProcessingDocumentId] = useState<string | null>(null)
  const [processingFilename, setProcessingFilename] = useState("")
  const [scanProgress, setScanProgress] = useState(0)
  const [notice, setNotice] = useState<Notice>(null)
  const [splitTransactions, setSplitTransactions] = useState<SplitTransactionSummary[]>([])
  const [masterDataOptions, setMasterDataOptions] = useState<DocumentMasterDataOption[]>(FALLBACK_MASTER_DATA_OPTIONS)
  const selectedIdRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const selectedId = selected?.id
  const canEdit = !!selected?.draft && selected.processingStatus !== "posted" && selected.processingStatus !== "rejected"
  const canConfirm = selected?.draft?.status === "draft" || selected?.draft?.status === "rejected"
  const canPost = selected?.draft?.status === "confirmed" && selected.processingStatus !== "posted"
  const canDelete = !!selected && selected.processingStatus !== "posted" && selected.reviewStatus !== "posted"
  const warnings = fields.warnings ?? []
  const currencyOptions = masterDataOptions.filter((option) => option.type === "currency" && option.isActive).map((option) => option.value)
  const paymentMethodOptions = masterDataOptions.filter((option) => option.type === "payment_method" && option.isActive)
  const bankTransactions = fields.bankTransactions ?? []
  const bankMoneyIn = Number(bankTransactions.reduce((sum, transaction) => sum + Number(transaction.moneyIn), 0).toFixed(2))
  const bankMoneyOut = Number(bankTransactions.reduce((sum, transaction) => sum + Number(transaction.moneyOut), 0).toFixed(2))
  const isScanning = activeAction === "process" && !!processingDocumentId
  const isSelectedScanning = isScanning && selected?.id === processingDocumentId
  const totalDebit = Number(lines.reduce((sum, line) => sum + Number(line.debit), 0).toFixed(2))
  const totalCredit = Number(lines.reduce((sum, line) => sum + Number(line.credit), 0).toFixed(2))
  const journalDifference = Number(Math.abs(totalDebit - totalCredit).toFixed(2))

  useEffect(() => {
    selectedIdRef.current = selectedId ?? null
  }, [selectedId])

  async function loadDocuments(nextSelectedId: string | null | undefined = selectedId) {
    const next = await readJson<OcrDocument[]>(await fetch("/api/documents", { cache: "no-store" }))
    setDocuments(next)
    if (nextSelectedId) {
      const refreshed = await readJson<OcrDocumentDetail>(await fetch(`/api/documents/${nextSelectedId}`, { cache: "no-store" }))
      setSelected(refreshed)
    }
  }

  useEffect(() => {
    const requestedDocumentId = new URLSearchParams(window.location.search).get("documentId")
    void loadDocuments(requestedDocumentId).catch((error) => setNotice({ type: "error", message: error.message }))
  }, [])

  useEffect(() => {
    fetch("/api/document-master-data", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Master data failed: ${response.status}`)))
      .then((options: DocumentMasterDataOption[]) => setMasterDataOptions(options.length > 0 ? options : FALLBACK_MASTER_DATA_OPTIONS))
      .catch(console.error)
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
    setPostingTemplate(templateForCategory(selected.draft.draftType))
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
    selectedIdRef.current = id
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
    setSplitTransactions([])
    try {
      const formData = new FormData()
      formData.set("file", file)
      formData.set("sourceChannel", sourceChannel)
      const created = await readJson<OcrDocumentDetail>(await fetch("/api/documents", { method: "POST", body: formData }))
      selectedIdRef.current = created.id
      setSelected(created)
      await loadDocuments(created.id)
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
    const targetId = selected.id
    const targetFilename = selected.originalFilename
    if (isOcrProcess && selected.extraction) {
      const rescanDescription = selected.childDocumentCount
        ? `This will re-scan its ${selected.childDocumentCount} separated transaction files.`
        : "This will create a fresh OCR draft from the same stored file."
      const confirmed = window.confirm(`Re-scan ${selected.originalFilename}? ${rescanDescription}`)
      if (!confirmed) return
    }
    setBusy(true)
    setActiveAction(path)
    if (isOcrProcess) {
      setProcessingDocumentId(targetId)
      setProcessingFilename(targetFilename)
      setScanProgress(6)
    }
    setNotice(null)
    try {
      const response = await fetch(`/api/documents/${targetId}?action=${encodeURIComponent(path)}`, options ?? { method: "POST" })
      const body = await readJson<DocumentActionResponse>(response)
      const detail = "detail" in body && body.detail ? body.detail : body as OcrDocumentDetail
      const splitDocuments = "splitDocuments" in body ? body.splitDocuments : undefined
      const skippedPostedDocumentCount = "skippedPostedDocumentCount" in body ? body.skippedPostedDocumentCount ?? 0 : 0
      const displayedDetail = splitDocuments?.[0] ?? detail
      if (isOcrProcess) {
        setSplitTransactions(splitDocuments?.map(splitTransactionSummary) ?? [])
      }
      if (isOcrProcess) setScanProgress(100)
      if (selectedIdRef.current === targetId) {
        selectedIdRef.current = displayedDetail.id
        setSelected(displayedDetail)
        await loadDocuments(displayedDetail.id)
      } else {
        await loadDocuments(selectedIdRef.current)
      }
      if (path === "post") {
        await refreshAccountingData()
      }
      const message = splitDocuments?.length
        ? `${splitDocuments.length} transactions detected, separated, and scanned individually.${skippedPostedDocumentCount ? ` ${skippedPostedDocumentCount} posted transaction${skippedPostedDocumentCount === 1 ? " was" : "s were"} left unchanged.` : ""} Showing transaction 1.`
        : path === "post"
          ? "journalEntries" in body && body.journalEntries?.length
            ? `Posted ${body.journalEntries.length} journal entries.`
            : `Posted journal entry ${"journalEntry" in body ? body.journalEntry?.id ?? "" : ""}`.trim()
          : "Document updated."
      setNotice({ type: "success", message })
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Action failed." })
    } finally {
      setBusy(false)
      if (isOcrProcess) {
        window.setTimeout(() => {
          setActiveAction((current) => (current === path ? null : current))
          setProcessingDocumentId(null)
          setProcessingFilename("")
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

  async function deleteSelectedDocument() {
    if (!selected) return
    const confirmed = window.confirm(`Delete ${selected.originalFilename} and its OCR draft?`)
    if (!confirmed) return

    setBusy(true)
    setActiveAction("delete")
    setNotice(null)
    try {
      await readJson<{ id: string; deleted: true }>(await fetch(`/api/documents/${selected.id}`, { method: "DELETE" }))
      selectedIdRef.current = null
      setSelected(null)
      setFields(emptyFields)
      setLines([])
      await loadDocuments(null)
      setNotice({ type: "success", message: "Document deleted." })
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Delete failed." })
    } finally {
      setBusy(false)
      setActiveAction(null)
    }
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

  function updateOtherCharges(value: number) {
    const nextFields = recalculateFields({ ...fields, otherCharges: value })
    setFields(nextFields)
    setLines(buildPostingLines(postingTemplate, nextFields))
  }

  function templateForCategory(nextCategory: DocumentCategory): PostingTemplate {
    if (nextCategory === "receipt_income" || nextCategory === "sales_invoice") return "money_received"
    if (nextCategory === "vendor_bill") return "vendor_bill"
    if (nextCategory === "bank_document" || nextCategory === "unknown") return "manual"
    return "expense_paid"
  }

  function expenseAccountIdFor(nextCategory: DocumentCategory, nextFields: NormalizedDocumentFields) {
    const categoryAccountCode: Partial<Record<DocumentCategory, string>> = {
      entertainment: "5800",
      travel: "5900",
      office_supplies: "5300",
      utilities: "5200",
      rent: "5000",
      salary: "5100",
      petrol: "5950",
      inventory_purchase: "5600",
      delivery_document: "5950",
    }
    const text = [
      nextCategory,
      nextFields.vendorName,
      nextFields.documentNumber,
      nextFields.paymentMethod,
      ...nextFields.lineItems.map((line) => line.description),
    ].filter(Boolean).join("\n")
    const matchedCode = categoryAccountCode[nextCategory] ?? firstTextMatch(text, [
      { code: "5200", keywords: ["electric", "electricity", "utility", "utilities", "water bill", "air selangor", "tnb", "telekom", "internet", "wifi"] },
      { code: "5950", keywords: ["petrol", "fuel", "diesel", "parking", "toll", "grab", "taxi", "transport", "delivery", "courier", "logistic"] },
      { code: "5800", keywords: ["restaurant", "dining", "dinner", "lunch", "meal", "cafe", "coffee", "food", "entertainment"] },
      { code: "5500", keywords: ["software", "subscription", "saas", "cloud", "hosting", "domain"] },
      { code: "5400", keywords: ["marketing", "advertising", "facebook ads", "google ads", "promotion"] },
      { code: "5000", keywords: ["rent", "rental", "lease"] },
      { code: "5100", keywords: ["salary", "wage", "payroll"] },
      { code: "5300", keywords: ["stationery", "office supply", "office supplies", "printer", "paper", "ink"] },
    ]) ?? "5300"
    return accountIdByCode(accounts, matchedCode, "expense")
  }

  function buildPostingLines(template: PostingTemplate, nextFields: NormalizedDocumentFields, nextCategory = category) {
    const total = Number(nextFields.totalAmount || nextFields.subtotal || 0)
    const tax = Number(nextFields.taxAmount || 0)
    const beforeTax = Number(Math.max(0, total - tax).toFixed(2))
    const cashAccountId = accountIdByCode(accounts, "1010", "asset")
    const revenueAccountId = accountIdByCode(accounts, "4000", "revenue")
    const taxPayableAccountId = accountIdByCode(accounts, "2100", "liability")
    const expenseAccountId = expenseAccountIdFor(nextCategory, nextFields)
    const payableAccountId = accountIdByCode(accounts, "2000", "liability")

    if (template === "money_received") {
      return [
        { accountId: cashAccountId, debit: total, credit: 0 },
        { accountId: revenueAccountId, debit: 0, credit: beforeTax },
        { accountId: taxPayableAccountId, debit: 0, credit: tax },
      ].filter((line) => line.debit > 0 || line.credit > 0)
    }
    if (template === "vendor_bill") {
      return [
        { accountId: expenseAccountId, debit: beforeTax, credit: 0 },
        { accountId: taxPayableAccountId, debit: tax, credit: 0 },
        { accountId: payableAccountId, debit: 0, credit: total },
      ].filter((line) => line.debit > 0 || line.credit > 0)
    }
    if (template === "manual") return []
    return [
      { accountId: expenseAccountId, debit: beforeTax, credit: 0 },
      { accountId: taxPayableAccountId, debit: tax, credit: 0 },
      { accountId: cashAccountId, debit: 0, credit: total },
    ].filter((line) => line.debit > 0 || line.credit > 0)
  }

  function simplifyToTotalOnly() {
    const total = Number(fields.totalAmount || fields.subtotal || fields.lineItems.reduce((sum, line) => sum + Number(line.lineTotal), 0) || 0)
    const description = fields.vendorName ? `${fields.vendorName} receipt` : titleCase(category)
    const taxSplit = splitTotalIncludingTax(total)
    const nextFields = recalculateFields({
      ...fields,
      subtotal: taxSplit.subtotal,
      otherCharges: 0,
      taxAmount: taxSplit.taxAmount,
      totalAmount: total,
      lineItems: [{ description, quantity: 1, unitPrice: taxSplit.subtotal, taxRate: DEFAULT_TAX_RATE, taxAmount: taxSplit.taxAmount, lineTotal: total }],
    })
    setFields(nextFields)
    setLines(buildPostingLines(postingTemplate, nextFields))
  }

  function applyDefaultTaxFromTotal() {
    const total = Number(fields.totalAmount || fields.subtotal || fields.lineItems.reduce((sum, line) => sum + Number(line.lineTotal), 0) || 0)
    const taxSplit = splitTotalIncludingTax(total)
    const description = fields.lineItems[0]?.description || (fields.vendorName ? `${fields.vendorName} receipt` : titleCase(category))
    const nextFields = recalculateFields({
      ...fields,
      subtotal: taxSplit.subtotal,
      otherCharges: 0,
      taxAmount: taxSplit.taxAmount,
      totalAmount: total,
      lineItems: [{ description, quantity: 1, unitPrice: taxSplit.subtotal, taxRate: DEFAULT_TAX_RATE, taxAmount: taxSplit.taxAmount, lineTotal: total }],
    })
    setFields(nextFields)
    setLines(buildPostingLines(postingTemplate, nextFields))
  }

  function applyPostingTemplate(template: PostingTemplate) {
    setPostingTemplate(template)
    if (template === "money_received") {
      setCategory("receipt_income")
      setLines(buildPostingLines(template, fields, "receipt_income"))
      return
    }
    if (template === "vendor_bill") {
      setCategory("vendor_bill")
      setLines(buildPostingLines(template, fields, "vendor_bill"))
      return
    }
    if (template === "manual") {
      setCategory("bank_document")
      setLines(buildPostingLines(template, fields, "bank_document"))
      return
    }
    setCategory("receipt_expense")
    setLines(buildPostingLines(template, fields, "receipt_expense"))
  }

  function changeCategory(nextCategory: DocumentCategory) {
    const nextTemplate = templateForCategory(nextCategory)
    setCategory(nextCategory)
    setPostingTemplate(nextTemplate)
    setLines(buildPostingLines(nextTemplate, fields, nextCategory))
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
          <p className="mt-1 text-xs text-muted-foreground">
            {document.receiptIndex ? `Transaction ${document.receiptIndex} from a split upload` : document.childDocumentCount ? `Original upload - split into ${document.childDocumentCount} transactions` : document.sourceChannel === "camera_capture" ? "Photo capture" : "File upload"}
          </p>
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
            {splitTransactions.length > 0 ? (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Split transactions</h3>
                  <Badge variant="secondary">{splitTransactions.length}</Badge>
                </div>
                <div className="space-y-2">
                  {splitTransactions.map((transaction) => (
                    <button
                      key={transaction.id}
                      type="button"
                      onClick={() => void selectDocument(transaction.id)}
                      className={cn(
                        "w-full rounded-md border border-border bg-background p-3 text-left transition-colors hover:bg-muted/60",
                        selected?.id === transaction.id && "border-primary bg-accent",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{transaction.label}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{transaction.party}</p>
                        </div>
                        <Amount value={transaction.amount} className="shrink-0 text-sm font-semibold" />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="outline">{titleCase(transaction.category)}</Badge>
                        <Badge variant={statusVariant(transaction.status)}>{titleCase(transaction.status)}</Badge>
                        <span className="text-xs text-muted-foreground">{transaction.date}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
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
                      {selected.receiptIndex ? <Badge variant="outline">Split transaction {selected.receiptIndex}</Badge> : null}
                      {selected.childDocumentCount ? <Badge variant="outline">{selected.childDocumentCount} split transactions</Badge> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void action("process")} disabled={busy || selected.processingStatus === "posted" || selected.reviewStatus === "posted"}>
                      {isSelectedScanning ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                      {isSelectedScanning ? "Scanning" : isScanning ? "Scan running" : selected.extraction ? "Re-scan" : "OCR"}
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
                    <Button variant="outline" onClick={() => void deleteSelectedDocument()} disabled={busy || !canDelete}>
                      {activeAction === "delete" ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      Delete
                    </Button>
                  </div>
                </div>

                {isScanning ? <ScanProgress progress={scanProgress} filename={processingFilename} /> : null}

                <Tabs defaultValue="fields" className="flex-1 p-4">
                  <TabsList className="grid h-auto w-full grid-cols-5">
                    <TabsTrigger value="file">File</TabsTrigger>
                    <TabsTrigger value="fields">Fields</TabsTrigger>
                    <TabsTrigger value="bank">Bank Rows</TabsTrigger>
                    <TabsTrigger value="category">Category</TabsTrigger>
                    <TabsTrigger value="journal">Journal</TabsTrigger>
                  </TabsList>

                  <TabsContent value="file" className="mt-4 space-y-3">
                    <div className="overflow-hidden rounded-md border border-border bg-muted/20">
                      {selected.mimeType.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/documents/${selected.id}?action=file`} alt={selected.originalFilename} className="max-h-[28rem] w-full object-contain" />
                      ) : selected.mimeType === "application/pdf" ? (
                        <iframe title={selected.originalFilename} src={`/api/documents/${selected.id}?action=file`} className="h-[28rem] w-full" />
                      ) : (
                        <div className="p-6 text-sm text-muted-foreground">Preview is not available for this file type. Download the original file to inspect it.</div>
                      )}
                    </div>
                    <Button variant="outline" onClick={() => window.open(`/api/documents/${selected.id}?action=file`, "_blank", "noreferrer")}>
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
                      <Field label="Currency">
                        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={fields.currency} onChange={(event) => setFields((current) => ({ ...current, currency: event.target.value }))}>
                          {selectValueWithCurrent(currencyOptions, fields.currency).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </Field>
                      <Field label="Payment Method">
                        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={fields.paymentMethod ?? ""} onChange={(event) => setFields((current) => ({ ...current, paymentMethod: event.target.value }))}>
                          {paymentMethodOptions.map((option) => <option key={option.id} value={option.value}>{option.label}</option>)}
                          {fields.paymentMethod && !paymentMethodOptions.some((option) => option.value === fields.paymentMethod) ? <option value={fields.paymentMethod}>{titleCase(fields.paymentMethod)}</option> : null}
                        </select>
                      </Field>
                      <Field label="Other Charges"><Input inputMode="decimal" value={fields.otherCharges ?? 0} className="text-right" onChange={(event) => updateOtherCharges(toNumber(event.target.value))} /></Field>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                      <Summary label="Subtotal" value={fields.subtotal} />
                      <Summary label="Charges" value={fields.otherCharges ?? 0} />
                      <Summary label="Tax" value={fields.taxAmount} />
                      <Summary label="Total" value={fields.totalAmount} />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Line Items</h3>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={applyDefaultTaxFromTotal}>Default Tax</Button>
                          <Button variant="outline" size="sm" onClick={simplifyToTotalOnly}>Total Only</Button>
                          <Button variant="outline" size="sm" onClick={() => setFields((current) => ({ ...current, lineItems: [...current.lineItems, { description: "", quantity: 1, unitPrice: 0, taxRate: 0, taxAmount: 0, lineTotal: 0 }] }))}>Add Line</Button>
                        </div>
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

                  <TabsContent value="bank" className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Metric label="Rows" value={String(bankTransactions.length)} />
                      <Summary label="Money In" value={bankMoneyIn} />
                      <Summary label="Money Out" value={bankMoneyOut} />
                    </div>
                    <div className="overflow-hidden rounded-md border border-border">
                      <div className="hidden grid-cols-[7rem_minmax(14rem,1fr)_9rem_8rem_8rem_8rem] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid">
                        <span>Date</span>
                        <span>Description</span>
                        <span>Reference</span>
                        <span className="text-right">Money In</span>
                        <span className="text-right">Money Out</span>
                        <span className="text-right">Balance</span>
                      </div>
                      {bankTransactions.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">No bank statement rows captured.</div>
                      ) : bankTransactions.map((transaction, index) => (
                        <div key={`${transaction.date}-${index}`} className="grid gap-2 border-b border-border p-3 text-sm last:border-b-0 lg:grid-cols-[7rem_minmax(14rem,1fr)_9rem_8rem_8rem_8rem] lg:items-center">
                          <span className="font-medium">{transaction.date}</span>
                          <span className="min-w-0 break-words">{transaction.description}</span>
                          <span className="min-w-0 break-words text-muted-foreground">{transaction.reference || "-"}</span>
                          <span className="text-right"><Amount value={transaction.moneyIn} /></span>
                          <span className="text-right"><Amount value={transaction.moneyOut} /></span>
                          <span className="text-right text-muted-foreground">{transaction.balance === undefined ? "-" : <Amount value={transaction.balance} />}</span>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="category" className="mt-4 space-y-4">
                    <Field label="Document Type">
                      <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={category} onChange={(event) => changeCategory(event.target.value as DocumentCategory)}>
                        {DOCUMENT_CATEGORIES.map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}
                      </select>
                    </Field>
                    <Field label="Posting Option">
                      <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={postingTemplate} onChange={(event) => applyPostingTemplate(event.target.value as PostingTemplate)}>
                        <option value="expense_paid">Paid expense / receipt</option>
                        <option value="vendor_bill">Vendor bill / payable</option>
                        <option value="money_received">Money received / bank credit</option>
                        <option value="manual">Manual journal / other bank statement</option>
                      </select>
                    </Field>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      <Button variant="outline" onClick={() => applyPostingTemplate("expense_paid")}>Paid Expense</Button>
                      <Button variant="outline" onClick={() => applyPostingTemplate("vendor_bill")}>Vendor Bill</Button>
                      <Button variant="outline" onClick={() => applyPostingTemplate("money_received")}>Money Received</Button>
                      <Button variant="outline" onClick={() => applyPostingTemplate("manual")}>Manual</Button>
                    </div>
                    <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                      {selected.categoryResult?.reason ?? "Run OCR to get a category suggestion."}
                    </div>
                  </TabsContent>

                  <TabsContent value="journal" className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Suggested Journal Entry</h3>
                      <Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, { accountId: accounts[0]?.id ?? "", debit: 0, credit: 0 }])}>Add Line</Button>
                    </div>
                    <div className="overflow-hidden rounded-md border border-border">
                      <div className="hidden grid-cols-[minmax(12rem,1fr)_8rem_8rem_3rem] gap-2 border-b border-border bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground md:grid">
                        <span>Account</span>
                        <span className="text-right">Debit</span>
                        <span className="text-right">Credit</span>
                        <span />
                      </div>
                      {lines.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground">Choose a posting option or add journal lines manually.</div>
                      ) : lines.map((line, index) => (
                        <div key={index} className="grid gap-3 border-b border-border p-3 last:border-b-0 md:grid-cols-[minmax(12rem,1fr)_8rem_8rem_3rem] md:items-end md:gap-2">
                          <JournalField label="Account">
                            <select className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm" value={line.accountId} onChange={(event) => updateLine(index, { accountId: event.target.value })}>
                              {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
                            </select>
                          </JournalField>
                          <JournalField label="Debit">
                            <Input inputMode="decimal" className="text-right font-mono text-debit" value={line.debit} onChange={(event) => updateLine(index, { debit: toNumber(event.target.value), credit: toNumber(event.target.value) > 0 ? 0 : line.credit })} />
                          </JournalField>
                          <JournalField label="Credit">
                            <Input inputMode="decimal" className="text-right font-mono text-credit" value={line.credit} onChange={(event) => updateLine(index, { credit: toNumber(event.target.value), debit: toNumber(event.target.value) > 0 ? 0 : line.debit })} />
                          </JournalField>
                          <Button variant="ghost" size="icon" aria-label="Remove journal line" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><X className="size-4" /></Button>
                        </div>
                      ))}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Summary label="Total Debit" value={totalDebit} />
                      <Summary label="Total Credit" value={totalCredit} />
                      <Summary label={journalDifference === 0 ? "Balanced" : "Difference"} value={journalDifference} />
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

function JournalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="md:sr-only">{label}</Label>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
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
