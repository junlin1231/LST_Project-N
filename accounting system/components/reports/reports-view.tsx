"use client"

import { useMemo, useState } from "react"
import { Calculator, CalendarDays, Download, ExternalLink, FileText, Landmark, Plus, Save } from "lucide-react"
import { Amount } from "@/components/amount"
import { ConfirmationDialog } from "@/components/governance/confirmation-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UPDATE_CONFIRMATION_PHRASE } from "@/lib/accounting/governance"
import { useAccounting } from "@/lib/accounting/store"
import { formatDate, invoiceTotal } from "@/lib/accounting/utils"
import {
  buildCashFlowReport,
  buildChangesInEquity,
  buildFinancialPosition,
  buildFinancialStatementNotes,
  buildGeneralLedger,
  buildPeriodClosePreview,
  buildProfitOrLoss,
  buildTrialBalance,
  calculateMonthlyDepreciation,
  DEFAULT_RETAINED_EARNINGS_ACCOUNT_ID,
} from "@/lib/accounting/reports"
import type { OcrDocumentDetail } from "@/lib/accounting/document-types"
import { ACCOUNT_TYPE_LABEL, type Account, type DepreciationSchedule, type FixedAsset, type Invoice, type JournalEntry, type PaymentVoucher, type Receipt, type ReportLine, type ReportSection, type VendorBill, type WorkflowDocument, type WorkflowDocumentType } from "@/lib/accounting/types"

const today = new Date().toISOString().slice(0, 10)
const yearStart = `${today.slice(0, 4)}-01-01`
const trialBalanceTypeOrder: Account["type"][] = ["asset", "liability", "equity", "revenue", "expense"]

type DrillMode = "account-period" | "account-as-of" | "cash-flow-line" | "ledger-entry"

interface DrillTarget {
  title: string
  subtitle: string
  mode: DrillMode
  accountId?: string
  journalEntryId?: string
  cashFlowLabel?: string
}

interface RelatedDocument {
  id: string
  number: string
  type: string
  party?: string
  date: string
  status: string
  amount: number
}

type RelatedDocumentDetail =
  | { type: "Invoice"; record: Invoice }
  | { type: "Vendor Bill"; record: VendorBill }
  | { type: "Receipt"; record: Receipt }
  | { type: "Payment Voucher"; record: PaymentVoucher }
  | { type: "Workflow Document"; record: WorkflowDocument }

function titleCase(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

function documentTypeLabel(type: WorkflowDocumentType) {
  return titleCase(type)
}

function isPosted(entry: JournalEntry) {
  return entry.status !== "draft"
}

function isCashBankAccount(account?: Account) {
  return account?.type === "asset" && /cash|bank/i.test(`${account.code} ${account.name}`)
}

function entryAffectsAccount(entry: JournalEntry, accountId: string) {
  return entry.lines.some((line) => line.accountId === accountId)
}

function SectionTable({ section, onLineClick }: { section: ReportSection; onLineClick?: (line: ReportLine) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {section.lines.map((line) => (
          <TableRow
            key={`${section.label}-${line.accountId}-${line.name}`}
            role={onLineClick ? "button" : undefined}
            tabIndex={onLineClick ? 0 : undefined}
            className={onLineClick ? "cursor-pointer" : undefined}
            onClick={() => onLineClick?.(line)}
            onKeyDown={(event) => {
              if (!onLineClick) return
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onLineClick(line)
              }
            }}
          >
            <TableCell><span className="font-mono text-xs text-muted-foreground">{line.code}</span> {line.name}</TableCell>
            <TableCell className="text-right"><Amount value={line.amount} colorBySign /></TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell className="font-semibold">{section.label} Total</TableCell>
          <TableCell className="text-right font-semibold"><Amount value={section.total} colorBySign /></TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}

function emptyAsset(): Omit<FixedAsset, "id"> {
  return {
    assetNumber: "",
    name: "",
    purchaseDate: today,
    purchasePrice: 0,
    usefulLifeMonths: 36,
    salvageValue: 0,
    status: "active",
    assetAccountId: "1500",
    accumulatedDepreciationAccountId: "1590",
    depreciationExpenseAccountId: "5700",
  }
}

type CsvRow = Record<string, string | number | boolean | undefined>

function csvValue(value: string | number | boolean | undefined) {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text
}

function downloadCsv(filename: string, rows: CsvRow[]) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(",")),
  ].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function ExportButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick}>
      <Download className="size-4" />
      {label}
    </Button>
  )
}

export function ReportsView() {
  const {
    accounts,
    contacts,
    journalEntries,
    invoices,
    vendorBills,
    receipts,
    paymentVouchers,
    workflowDocuments,
    stockBalances,
    fixedAssets,
    depreciationSchedules,
    addFixedAsset,
    updateFixedAsset,
    generateDepreciationSchedules,
    postDepreciationSchedule,
    previewPeriodClose,
    postPeriodClose,
    accountName,
  } = useAccounting()
  const [periodStart, setPeriodStart] = useState(yearStart)
  const [periodEnd, setPeriodEnd] = useState(today)
  const [accountFilter, setAccountFilter] = useState("all")
  const [assetOpen, setAssetOpen] = useState(false)
  const [assetForm, setAssetForm] = useState<Omit<FixedAsset, "id">>(emptyAsset())
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [assetError, setAssetError] = useState("")
  const [throughDate, setThroughDate] = useState(today)
  const [pendingDepreciation, setPendingDepreciation] = useState<DepreciationSchedule | null>(null)
  const [closeMessage, setCloseMessage] = useState("")
  const [pendingClose, setPendingClose] = useState(false)
  const [retainedEarningsAccountId, setRetainedEarningsAccountId] = useState(DEFAULT_RETAINED_EARNINGS_ACCOUNT_ID)
  const [drillTarget, setDrillTarget] = useState<DrillTarget | null>(null)
  const [selectedEntryDetail, setSelectedEntryDetail] = useState<JournalEntry | null>(null)
  const [selectedDocumentDetail, setSelectedDocumentDetail] = useState<RelatedDocumentDetail | null>(null)
  const [reviewDocument, setReviewDocument] = useState<OcrDocumentDetail | null>(null)
  const [reviewDocumentState, setReviewDocumentState] = useState<"idle" | "loading" | "missing" | "error">("idle")

  const trialBalance = useMemo(() => buildTrialBalance(accounts, journalEntries.filter((entry) => entry.date <= periodEnd)), [accounts, journalEntries, periodEnd])
  const trialBalanceSections = useMemo(() => trialBalanceTypeOrder
    .map((type) => {
      const rows = trialBalance.filter((row) => row.type === type)
      return {
        type,
        label: ACCOUNT_TYPE_LABEL[type],
        rows,
        debit: Number(rows.reduce((sum, row) => sum + row.debit, 0).toFixed(2)),
        credit: Number(rows.reduce((sum, row) => sum + row.credit, 0).toFixed(2)),
      }
    })
    .filter((section) => section.rows.length > 0), [trialBalance])
  const generalLedger = useMemo(() => {
    const ledger = buildGeneralLedger(accounts, journalEntries).filter((line) => line.date >= periodStart && line.date <= periodEnd)
    return accountFilter === "all" ? ledger : ledger.filter((line) => line.accountId === accountFilter)
  }, [accountFilter, accounts, journalEntries, periodEnd, periodStart])
  const profit = useMemo(() => buildProfitOrLoss(accounts, journalEntries, periodStart, periodEnd), [accounts, journalEntries, periodEnd, periodStart])
  const position = useMemo(() => buildFinancialPosition(accounts, journalEntries, periodEnd), [accounts, journalEntries, periodEnd])
  const cashFlow = useMemo(() => buildCashFlowReport(accounts, journalEntries, periodStart, periodEnd), [accounts, journalEntries, periodEnd, periodStart])
  const equity = useMemo(() => buildChangesInEquity(accounts, journalEntries, periodStart, periodEnd), [accounts, journalEntries, periodEnd, periodStart])
  const notes = useMemo(() => buildFinancialStatementNotes({ accounts, entries: journalEntries, invoices, vendorBills, fixedAssets, stockBalances, startDate: periodStart, endDate: periodEnd }), [accounts, fixedAssets, invoices, journalEntries, periodEnd, periodStart, stockBalances, vendorBills])
  const closePreview = useMemo(() => buildPeriodClosePreview(accounts, journalEntries, depreciationSchedules, periodStart, periodEnd), [accounts, depreciationSchedules, journalEntries, periodEnd, periodStart])
  const totalDebits = trialBalance.reduce((sum, row) => sum + row.debit, 0)
  const totalCredits = trialBalance.reduce((sum, row) => sum + row.credit, 0)
  const assetAccounts = accounts.filter((account) => account.type === "asset")
  const expenseAccounts = accounts.filter((account) => account.type === "expense")
  const equityAccounts = accounts.filter((account) => account.type === "equity")
  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])
  const contactName = (id?: string) => contacts.find((contact) => contact.id === id)?.name ?? "-"

  const drillEntries = useMemo(() => {
    if (!drillTarget) return []
    const postedEntries = journalEntries.filter(isPosted)
    if (drillTarget.mode === "ledger-entry") {
      return postedEntries.filter((entry) => entry.id === drillTarget.journalEntryId)
    }
    if (drillTarget.mode === "account-as-of" && drillTarget.accountId) {
      return postedEntries.filter((entry) => entry.date <= periodEnd && entryAffectsAccount(entry, drillTarget.accountId!))
    }
    if (drillTarget.mode === "account-period" && drillTarget.accountId) {
      return postedEntries.filter((entry) => entry.date >= periodStart && entry.date <= periodEnd && entryAffectsAccount(entry, drillTarget.accountId!))
    }
    if (drillTarget.mode === "cash-flow-line" && drillTarget.cashFlowLabel) {
      return postedEntries.filter((entry) => {
        if (entry.date < periodStart || entry.date > periodEnd || entry.description !== drillTarget.cashFlowLabel) return false
        return entry.lines.some((line) => isCashBankAccount(accountById.get(line.accountId)))
      })
    }
    return []
  }, [accountById, drillTarget, journalEntries, periodEnd, periodStart])

  const relatedDocuments = useMemo<RelatedDocument[]>(() => {
    if (!drillTarget) return []
    const references = new Set(drillEntries.map((entry) => entry.reference?.trim()).filter(Boolean))
    const entryIds = new Set(drillEntries.map((entry) => entry.id))
    const related: RelatedDocument[] = []

    for (const receipt of receipts) {
      if (!entryIds.has(receipt.journalEntryId ?? "") && !references.has(receipt.receiptNumber)) continue
      const invoice = receipt.invoiceId ? invoices.find((record) => record.id === receipt.invoiceId) : undefined
      related.push({
        id: receipt.id,
        number: receipt.receiptNumber,
        type: "Receipt",
        party: invoice ? contactName(invoice.clientId) : "Unapplied",
        date: receipt.receiptDate,
        status: receipt.status,
        amount: receipt.amount,
      })
      if (invoice && !related.some((document) => document.id === invoice.id)) {
        related.push({
          id: invoice.id,
          number: invoice.number,
          type: "Invoice",
          party: contactName(invoice.clientId),
          date: invoice.issueDate,
          status: invoice.status,
          amount: invoiceTotal(invoice),
        })
      }
    }

    for (const voucher of paymentVouchers) {
      if (!entryIds.has(voucher.journalEntryId ?? "") && !references.has(voucher.voucherNumber)) continue
      const bill = voucher.vendorBillId ? vendorBills.find((record) => record.id === voucher.vendorBillId) : undefined
      related.push({
        id: voucher.id,
        number: voucher.voucherNumber,
        type: "Payment Voucher",
        party: bill ? contactName(bill.vendorId) : "Vendor Advance",
        date: voucher.paymentDate,
        status: voucher.status,
        amount: voucher.amount,
      })
      if (bill && !related.some((document) => document.id === bill.id)) {
        related.push({
          id: bill.id,
          number: bill.billNumber,
          type: "Vendor Bill",
          party: contactName(bill.vendorId),
          date: bill.billDate,
          status: bill.status,
          amount: bill.totalAmount,
        })
      }
    }

    for (const invoice of invoices) {
      if (!references.has(invoice.number) || related.some((document) => document.id === invoice.id)) continue
      related.push({
        id: invoice.id,
        number: invoice.number,
        type: "Invoice",
        party: contactName(invoice.clientId),
        date: invoice.issueDate,
        status: invoice.status,
        amount: invoiceTotal(invoice),
      })
    }

    for (const bill of vendorBills) {
      if (!references.has(bill.billNumber) || related.some((document) => document.id === bill.id)) continue
      related.push({
        id: bill.id,
        number: bill.billNumber,
        type: "Vendor Bill",
        party: contactName(bill.vendorId),
        date: bill.billDate,
        status: bill.status,
        amount: bill.totalAmount,
      })
    }

    for (const document of workflowDocuments) {
      if (!references.has(document.documentNumber)) continue
      related.push({
        id: document.id,
        number: document.documentNumber,
        type: documentTypeLabel(document.documentType),
        party: contactName(document.contactId),
        date: document.documentDate,
        status: document.status,
        amount: document.totalAmount,
      })
    }

    return related
  }, [contactName, drillEntries, drillTarget, invoices, paymentVouchers, receipts, vendorBills, workflowDocuments])

  function openDocumentDetail(document: RelatedDocument) {
    if (document.type === "Invoice") {
      const record = invoices.find((invoice) => invoice.id === document.id)
      if (record) setSelectedDocumentDetail({ type: "Invoice", record })
      return
    }
    if (document.type === "Vendor Bill") {
      const record = vendorBills.find((bill) => bill.id === document.id)
      if (record) setSelectedDocumentDetail({ type: "Vendor Bill", record })
      return
    }
    if (document.type === "Receipt") {
      const record = receipts.find((receipt) => receipt.id === document.id)
      if (record) setSelectedDocumentDetail({ type: "Receipt", record })
      return
    }
    if (document.type === "Payment Voucher") {
      const record = paymentVouchers.find((voucher) => voucher.id === document.id)
      if (record) setSelectedDocumentDetail({ type: "Payment Voucher", record })
      return
    }
    const record = workflowDocuments.find((workflowDocument) => workflowDocument.id === document.id)
    if (record) setSelectedDocumentDetail({ type: "Workflow Document", record })
  }

  async function openEntryDetail(entry: JournalEntry) {
    setSelectedEntryDetail(entry)
    setReviewDocument(null)
    setReviewDocumentState("loading")
    try {
      const response = await fetch(`/api/documents?journalEntryId=${encodeURIComponent(entry.id)}`, { cache: "no-store" })
      if (!response.ok) throw new Error(`Document lookup failed: ${response.status}`)
      const document = await response.json() as OcrDocumentDetail | null
      setReviewDocument(document)
      setReviewDocumentState(document ? "idle" : "missing")
    } catch (error) {
      console.error(error)
      setReviewDocumentState("error")
    }
  }

  function openAccountPeriod(line: ReportLine, sectionLabel: string) {
    setDrillTarget({
      title: `${line.code} ${line.name}`.trim(),
      subtitle: `${sectionLabel} from ${formatDate(periodStart)} to ${formatDate(periodEnd)}`,
      mode: "account-period",
      accountId: line.accountId,
    })
  }

  function openAccountAsOf(accountId: string, code: string, name: string, label: string) {
    setDrillTarget({
      title: `${code} ${name}`.trim(),
      subtitle: `${label} as of ${formatDate(periodEnd)}`,
      mode: "account-as-of",
      accountId,
    })
  }

  function openCashFlowLine(line: ReportLine, sectionLabel: string) {
    setDrillTarget({
      title: line.name,
      subtitle: `${sectionLabel} from ${formatDate(periodStart)} to ${formatDate(periodEnd)}`,
      mode: "cash-flow-line",
      cashFlowLabel: line.name,
    })
  }

  function openNewAsset() {
    setEditingAssetId(null)
    setAssetForm(emptyAsset())
    setAssetError("")
    setAssetOpen(true)
  }

  function openEditAsset(asset: FixedAsset) {
    setEditingAssetId(asset.id)
    setAssetForm({ ...asset })
    setAssetError("")
    setAssetOpen(true)
  }

  async function saveAsset() {
    setAssetError("")
    try {
      const payload = {
        ...assetForm,
        purchasePrice: Number(assetForm.purchasePrice),
        usefulLifeMonths: Number(assetForm.usefulLifeMonths),
        salvageValue: Number(assetForm.salvageValue),
        disposalProceeds: assetForm.disposalProceeds === undefined ? undefined : Number(assetForm.disposalProceeds),
      }
      if (editingAssetId) await updateFixedAsset(editingAssetId, payload)
      else await addFixedAsset(payload)
      setAssetOpen(false)
    } catch (error) {
      setAssetError(error instanceof Error ? error.message : "Asset save failed.")
    }
  }

  async function runClosePreview() {
    setCloseMessage("")
    try {
      const preview = await previewPeriodClose(periodStart, periodEnd)
      setCloseMessage(`Preview ready. Net income: ${preview.netIncome.toFixed(2)}.`)
    } catch (error) {
      setCloseMessage(error instanceof Error ? error.message : "Close preview failed.")
    }
  }

  function fileName(name: string) {
    return `${name}-${periodStart}-to-${periodEnd}.csv`
  }

  function exportTrialBalance() {
    downloadCsv(fileName("trial-balance"), [
      ...trialBalanceSections.flatMap((section) => [
        { AccountCode: "", AccountName: `${section.label} Total`, Type: section.type, Debit: section.debit, Credit: section.credit },
        ...section.rows.map((row) => ({ AccountCode: row.code, AccountName: row.name, Type: row.type, Debit: row.debit, Credit: row.credit })),
      ]),
      { AccountCode: "", AccountName: "Total", Type: "", Debit: totalDebits, Credit: totalCredits },
    ])
  }

  function exportGeneralLedger() {
    downloadCsv(fileName("general-ledger"), generalLedger.map((line) => ({
      Date: line.date,
      Account: line.accountName,
      Description: line.description,
      Reference: line.reference,
      Debit: line.debit,
      Credit: line.credit,
      RunningBalance: line.runningBalance,
    })))
  }

  function exportProfitOrLoss() {
    downloadCsv(fileName("profit-or-loss"), [
      ...profit.revenue.lines.map((line) => ({ Section: "Revenue", AccountCode: line.code, AccountName: line.name, Amount: line.amount })),
      { Section: "Revenue", AccountCode: "", AccountName: "Revenue Total", Amount: profit.revenue.total },
      ...profit.expenses.lines.map((line) => ({ Section: "Expenses", AccountCode: line.code, AccountName: line.name, Amount: line.amount })),
      { Section: "Expenses", AccountCode: "", AccountName: "Expense Total", Amount: profit.expenses.total },
      { Section: "Result", AccountCode: "", AccountName: "Net Profit / Loss", Amount: profit.netProfitLoss },
    ])
  }

  function exportFinancialPosition() {
    downloadCsv(`financial-position-as-of-${periodEnd}.csv`, [
      ...position.assets.lines.map((line) => ({ Section: "Assets", AccountCode: line.code, AccountName: line.name, Amount: line.amount })),
      { Section: "Assets", AccountCode: "", AccountName: "Assets Total", Amount: position.assets.total },
      ...position.liabilities.lines.map((line) => ({ Section: "Liabilities", AccountCode: line.code, AccountName: line.name, Amount: line.amount })),
      { Section: "Liabilities", AccountCode: "", AccountName: "Liabilities Total", Amount: position.liabilities.total },
      ...position.equity.lines.map((line) => ({ Section: "Equity", AccountCode: line.code, AccountName: line.name, Amount: line.amount })),
      { Section: "Equity", AccountCode: "", AccountName: "Equity Total", Amount: position.equity.total },
      { Section: "Check", AccountCode: "", AccountName: "Balanced", Amount: position.balanced },
    ])
  }

  function exportCashFlow() {
    downloadCsv(fileName("cash-flows"), [
      ...cashFlow.operatingActivities.lines.map((line) => ({ Section: "Operating", Activity: line.name, Amount: line.amount })),
      { Section: "Operating", Activity: "Operating Total", Amount: cashFlow.operatingActivities.total },
      ...cashFlow.investingActivities.lines.map((line) => ({ Section: "Investing", Activity: line.name, Amount: line.amount })),
      { Section: "Investing", Activity: "Investing Total", Amount: cashFlow.investingActivities.total },
      ...cashFlow.financingActivities.lines.map((line) => ({ Section: "Financing", Activity: line.name, Amount: line.amount })),
      { Section: "Financing", Activity: "Financing Total", Amount: cashFlow.financingActivities.total },
      { Section: "Summary", Activity: "Opening Cash", Amount: cashFlow.openingCash },
      { Section: "Summary", Activity: "Net Cash Movement", Amount: cashFlow.netCashMovement },
      { Section: "Summary", Activity: "Closing Cash", Amount: cashFlow.closingCash },
    ])
  }

  function exportEquity() {
    downloadCsv(fileName("changes-in-equity"), [
      { Line: "Opening Equity", Amount: equity.openingEquity },
      { Line: "Capital Introduced", Amount: equity.capitalIntroduced },
      { Line: "Withdrawals", Amount: equity.withdrawals },
      { Line: "Net Profit / Loss", Amount: equity.netProfitLoss },
      { Line: "Closing Equity", Amount: equity.closingEquity },
    ])
  }

  function exportNotes() {
    downloadCsv(fileName("financial-statement-notes"), notes.flatMap((note) => note.rows.map((row) => ({
      Note: note.title,
      Label: row.label,
      Amount: row.amount,
      Detail: row.note,
    }))))
  }

  function exportFixedAssets() {
    downloadCsv(fileName("fixed-assets"), [
      ...fixedAssets.map((asset) => ({
        AssetNumber: asset.assetNumber,
        Name: asset.name,
        PurchaseDate: asset.purchaseDate,
        Cost: asset.purchasePrice,
        UsefulLifeMonths: asset.usefulLifeMonths,
        SalvageValue: asset.salvageValue,
        MonthlyDepreciation: calculateMonthlyDepreciation(asset),
        Status: asset.status,
      })),
      ...depreciationSchedules.map((schedule) => ({
        AssetNumber: fixedAssets.find((asset) => asset.id === schedule.assetId)?.assetNumber ?? schedule.assetId,
        Name: "Depreciation Schedule",
        PurchaseDate: schedule.periodDate,
        Cost: schedule.depreciationAmount,
        UsefulLifeMonths: "",
        SalvageValue: "",
        MonthlyDepreciation: "",
        Status: schedule.status,
      })),
    ])
  }

  function exportClosePreview() {
    downloadCsv(fileName("period-close-preview"), closePreview.lines.map((line) => ({
      Account: accountName(line.accountId),
      Debit: line.debit,
      Credit: line.credit,
    })))
  }

  function exportAllReports() {
    const rows: CsvRow[] = [
      { Statement: "Profit or Loss", Section: "Revenue", Line: "Total Revenue", Amount: profit.revenue.total },
      { Statement: "Profit or Loss", Section: "Expenses", Line: "Total Expenses", Amount: profit.expenses.total },
      { Statement: "Profit or Loss", Section: "Result", Line: "Net Profit / Loss", Amount: profit.netProfitLoss },
      { Statement: "Financial Position", Section: "Assets", Line: "Total Assets", Amount: position.assets.total },
      { Statement: "Financial Position", Section: "Liabilities", Line: "Total Liabilities", Amount: position.liabilities.total },
      { Statement: "Financial Position", Section: "Equity", Line: "Total Equity", Amount: position.equity.total },
      { Statement: "Cash Flows", Section: "Summary", Line: "Opening Cash", Amount: cashFlow.openingCash },
      { Statement: "Cash Flows", Section: "Summary", Line: "Net Cash Movement", Amount: cashFlow.netCashMovement },
      { Statement: "Cash Flows", Section: "Summary", Line: "Closing Cash", Amount: cashFlow.closingCash },
      { Statement: "Changes in Equity", Section: "Summary", Line: "Closing Equity", Amount: equity.closingEquity },
    ]
    downloadCsv(fileName("financial-statements-pack"), rows)
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">Financial statements, depreciation, and period-end controls.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[10rem_10rem_auto_auto]">
          <div className="grid gap-1">
            <Label htmlFor="report-start">Start</Label>
            <Input id="report-start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="report-end">End</Label>
            <Input id="report-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </div>
          <Button className="self-end" variant="outline" onClick={runClosePreview}>
            <Calculator className="size-4" />
            Preview Close
          </Button>
          <div className="self-end">
            <ExportButton label="Export All" onClick={exportAllReports} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Revenue</p><Amount value={profit.revenue.total} className="mt-2 text-lg font-semibold" /></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Expenses</p><Amount value={profit.expenses.total} className="mt-2 text-lg font-semibold" /></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Net Profit / Loss</p><Amount value={profit.netProfitLoss} colorBySign className="mt-2 text-lg font-semibold" /></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Balance Check</p><Badge className="mt-2" variant={position.balanced ? "secondary" : "destructive"}>{position.balanced ? "Balanced" : "Out of balance"}</Badge></CardContent></Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          {["overview", "trial", "ledger", "profit", "position", "cash", "equity", "notes", "assets", "close"].map((tab) => (
            <TabsTrigger key={tab} value={tab}>{tab === "trial" ? "Trial Balance" : tab === "profit" ? "Profit or Loss" : tab === "position" ? "Financial Position" : tab === "cash" ? "Cash Flows" : tab === "assets" ? "Fixed Assets" : tab === "close" ? "Period Close" : tab.charAt(0).toUpperCase() + tab.slice(1)}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card><CardContent className="p-4"><p className="text-sm font-semibold">Profit or Loss</p><div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span>Revenue</span><Amount value={profit.revenue.total} /></div><div className="flex justify-between"><span>Expenses</span><Amount value={profit.expenses.total} /></div><div className="flex justify-between font-semibold"><span>Net</span><Amount value={profit.netProfitLoss} colorBySign /></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm font-semibold">Financial Position</p><div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span>Assets</span><Amount value={position.assets.total} /></div><div className="flex justify-between"><span>Liabilities</span><Amount value={position.liabilities.total} /></div><div className="flex justify-between"><span>Equity</span><Amount value={position.equity.total} /></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-sm font-semibold">Cash Flows</p><div className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><span>Opening</span><Amount value={cashFlow.openingCash} /></div><div className="flex justify-between"><span>Movement</span><Amount value={cashFlow.netCashMovement} colorBySign /></div><div className="flex justify-between font-semibold"><span>Closing</span><Amount value={cashFlow.closingCash} /></div></div></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="trial" className="space-y-3">
          <div className="flex justify-end"><ExportButton label="Export Trial Balance" onClick={exportTrialBalance} /></div>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
              <TableBody>
                {trialBalanceSections.flatMap((section) => [
                  <TableRow key={`${section.type}-section`} className="bg-muted/50">
                    <TableCell className="font-semibold">{section.label}</TableCell>
                    <TableCell className="capitalize">{section.type}</TableCell>
                    <TableCell className="text-right font-semibold"><Amount value={section.debit} /></TableCell>
                    <TableCell className="text-right font-semibold"><Amount value={section.credit} /></TableCell>
                  </TableRow>,
                  ...section.rows.map((row) => (
                    <TableRow
                      key={row.accountId}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer"
                      onClick={() => openAccountAsOf(row.accountId, row.code, row.name, "Trial balance")}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          openAccountAsOf(row.accountId, row.code, row.name, "Trial balance")
                        }
                      }}
                    >
                      <TableCell className="pl-6"><span className="font-mono text-xs text-muted-foreground">{row.code}</span> {row.name}</TableCell>
                      <TableCell className="capitalize">{row.type}</TableCell>
                      <TableCell className="text-right"><Amount value={row.debit} /></TableCell>
                      <TableCell className="text-right"><Amount value={row.credit} /></TableCell>
                    </TableRow>
                  )),
                ])}
                <TableRow><TableCell className="font-semibold">Total</TableCell><TableCell /><TableCell className="text-right font-semibold"><Amount value={totalDebits} /></TableCell><TableCell className="text-right font-semibold"><Amount value={totalCredits} /></TableCell></TableRow>
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="ledger" className="space-y-3">
          <div className="flex flex-wrap justify-between gap-2">
            <Select value={accountFilter} onValueChange={(value) => setAccountFilter(value ?? "all")}>
              <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} - {account.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <ExportButton label="Export Ledger" onClick={exportGeneralLedger} />
          </div>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Account</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Running</TableHead></TableRow></TableHeader>
              <TableBody>{generalLedger.map((line, index) => (
                <TableRow
                  key={`${line.accountId}-${line.journalEntryId}-${index}`}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer"
                  onClick={() => setDrillTarget({
                    title: line.reference ?? line.description,
                    subtitle: `General ledger entry on ${formatDate(line.date)}`,
                    mode: "ledger-entry",
                    journalEntryId: line.journalEntryId,
                  })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setDrillTarget({
                        title: line.reference ?? line.description,
                        subtitle: `General ledger entry on ${formatDate(line.date)}`,
                        mode: "ledger-entry",
                        journalEntryId: line.journalEntryId,
                      })
                    }
                  }}
                >
                  <TableCell>{formatDate(line.date)}</TableCell>
                  <TableCell>{line.accountName}</TableCell>
                  <TableCell>{line.description}</TableCell>
                  <TableCell className="text-right"><Amount value={line.debit} /></TableCell>
                  <TableCell className="text-right"><Amount value={line.credit} /></TableCell>
                  <TableCell className="text-right"><Amount value={line.runningBalance} colorBySign /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="profit" className="space-y-3">
          <div className="flex justify-end"><ExportButton label="Export Profit or Loss" onClick={exportProfitOrLoss} /></div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="overflow-hidden py-0"><SectionTable section={profit.revenue} onLineClick={(line) => openAccountPeriod(line, profit.revenue.label)} /></Card>
            <Card className="overflow-hidden py-0"><SectionTable section={profit.expenses} onLineClick={(line) => openAccountPeriod(line, profit.expenses.label)} /></Card>
            <Card className="lg:col-span-2"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><span className="font-semibold">Net Profit / Loss</span><Amount value={profit.netProfitLoss} colorBySign className="text-lg font-semibold" /></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="position" className="space-y-3">
          <div className="flex justify-end"><ExportButton label="Export Position" onClick={exportFinancialPosition} /></div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="overflow-hidden py-0"><SectionTable section={position.assets} onLineClick={(line) => line.accountId !== "current-profit" && openAccountAsOf(line.accountId, line.code, line.name, position.assets.label)} /></Card>
            <Card className="overflow-hidden py-0"><SectionTable section={position.liabilities} onLineClick={(line) => openAccountAsOf(line.accountId, line.code, line.name, position.liabilities.label)} /></Card>
            <Card className="overflow-hidden py-0"><SectionTable section={position.equity} onLineClick={(line) => line.accountId !== "current-profit" && openAccountAsOf(line.accountId, line.code, line.name, position.equity.label)} /></Card>
          </div>
        </TabsContent>

        <TabsContent value="cash" className="space-y-3">
          <div className="flex justify-end"><ExportButton label="Export Cash Flows" onClick={exportCashFlow} /></div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="overflow-hidden py-0"><SectionTable section={cashFlow.operatingActivities} onLineClick={(line) => openCashFlowLine(line, cashFlow.operatingActivities.label)} /></Card>
            <Card className="overflow-hidden py-0"><SectionTable section={cashFlow.investingActivities} onLineClick={(line) => openCashFlowLine(line, cashFlow.investingActivities.label)} /></Card>
            <Card className="overflow-hidden py-0"><SectionTable section={cashFlow.financingActivities} onLineClick={(line) => openCashFlowLine(line, cashFlow.financingActivities.label)} /></Card>
            <Card className="lg:col-span-3"><CardContent className="grid gap-3 p-4 md:grid-cols-3"><div><p className="text-xs text-muted-foreground">Opening Cash</p><Amount value={cashFlow.openingCash} className="font-semibold" /></div><div><p className="text-xs text-muted-foreground">Net Movement</p><Amount value={cashFlow.netCashMovement} colorBySign className="font-semibold" /></div><div><p className="text-xs text-muted-foreground">Closing Cash</p><Amount value={cashFlow.closingCash} className="font-semibold" /></div></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="equity" className="space-y-3">
          <div className="flex justify-end"><ExportButton label="Export Equity" onClick={exportEquity} /></div>
          <Card><CardContent className="grid gap-3 p-4 md:grid-cols-5"><div><p className="text-xs text-muted-foreground">Opening Equity</p><Amount value={equity.openingEquity} /></div><div><p className="text-xs text-muted-foreground">Capital</p><Amount value={equity.capitalIntroduced} /></div><div><p className="text-xs text-muted-foreground">Withdrawals</p><Amount value={equity.withdrawals} /></div><div><p className="text-xs text-muted-foreground">Net Profit / Loss</p><Amount value={equity.netProfitLoss} colorBySign /></div><div><p className="text-xs text-muted-foreground">Closing Equity</p><Amount value={equity.closingEquity} /></div></CardContent></Card>
        </TabsContent>

        <TabsContent value="notes" className="space-y-3">
          <div className="flex justify-end"><ExportButton label="Export Notes" onClick={exportNotes} /></div>
          <div className="grid gap-3 lg:grid-cols-2">
            {notes.map((note) => (
              <Card key={note.id} className="overflow-hidden py-0">
                <div className="border-b border-border px-4 py-3 font-semibold">{note.title}</div>
                <Table><TableBody>{note.rows.map((row) => <TableRow key={`${note.id}-${row.label}`}><TableCell>{row.label}<p className="text-xs text-muted-foreground">{row.note}</p></TableCell><TableCell className="text-right"><Amount value={row.amount} /></TableCell></TableRow>)}</TableBody></Table>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="assets" className="space-y-3">
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void generateDepreciationSchedules(throughDate)}><CalendarDays className="size-4" />Generate Depreciation</Button>
              <ExportButton label="Export Assets" onClick={exportFixedAssets} />
            </div>
            <div className="flex gap-2"><Input type="date" value={throughDate} onChange={(event) => setThroughDate(event.target.value)} /><Button onClick={openNewAsset}><Plus className="size-4" />New Asset</Button></div>
          </div>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Purchase</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Monthly Dep.</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{fixedAssets.map((asset) => <TableRow key={asset.id} className="cursor-pointer" onClick={() => openEditAsset(asset)}><TableCell><span className="font-mono text-xs text-muted-foreground">{asset.assetNumber}</span> {asset.name}</TableCell><TableCell>{formatDate(asset.purchaseDate)}</TableCell><TableCell className="text-right"><Amount value={asset.purchasePrice} /></TableCell><TableCell className="text-right"><Amount value={calculateMonthlyDepreciation(asset)} /></TableCell><TableCell><Badge variant={asset.status === "active" ? "secondary" : "outline"}>{asset.status}</Badge></TableCell></TableRow>)}</TableBody>
            </Table>
          </Card>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Asset</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-32" /></TableRow></TableHeader>
              <TableBody>{depreciationSchedules.map((schedule) => <TableRow key={schedule.id}><TableCell>{formatDate(schedule.periodDate)}</TableCell><TableCell>{fixedAssets.find((asset) => asset.id === schedule.assetId)?.name ?? schedule.assetId}</TableCell><TableCell><Badge variant={schedule.status === "posted" ? "secondary" : "outline"}>{schedule.status}</Badge></TableCell><TableCell className="text-right"><Amount value={schedule.depreciationAmount} /></TableCell><TableCell>{schedule.status === "draft" ? <Button size="sm" variant="outline" onClick={() => setPendingDepreciation(schedule)}>Post</Button> : <span className="text-xs text-muted-foreground">{schedule.journalEntryId}</span>}</TableCell></TableRow>)}</TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="close" className="space-y-3">
          <Card><CardContent className="grid gap-3 p-4 md:grid-cols-5"><div><p className="text-xs text-muted-foreground">Revenue</p><Amount value={closePreview.revenueTotal} /></div><div><p className="text-xs text-muted-foreground">Expenses</p><Amount value={closePreview.expenseTotal} /></div><div><p className="text-xs text-muted-foreground">Net Income</p><Amount value={closePreview.netIncome} colorBySign /></div><div><p className="text-xs text-muted-foreground">Warnings</p><p className="text-sm">{closePreview.alreadyClosed ? "Already closed" : closePreview.draftDepreciationCount > 0 ? `${closePreview.draftDepreciationCount} draft depreciation` : closePreview.trialBalanceBalanced ? "Ready" : "Trial balance issue"}</p></div><div className="grid gap-1"><Label>Retained Earnings</Label><Select value={retainedEarningsAccountId} onValueChange={(value) => setRetainedEarningsAccountId(value ?? DEFAULT_RETAINED_EARNINGS_ACCOUNT_ID)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{equityAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} - {account.name}</SelectItem>)}</SelectContent></Select></div></CardContent></Card>
          <Card className="overflow-hidden py-0"><Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader><TableBody>{closePreview.lines.map((line, index) => <TableRow key={`${line.accountId}-${index}`}><TableCell>{accountName(line.accountId)}</TableCell><TableCell className="text-right"><Amount value={line.debit} /></TableCell><TableCell className="text-right"><Amount value={line.credit} /></TableCell></TableRow>)}</TableBody></Table></Card>
          {closeMessage ? <p className="text-sm text-muted-foreground">{closeMessage}</p> : null}
          <div className="flex flex-wrap gap-2">
            <ExportButton label="Export Close Preview" onClick={exportClosePreview} />
            <Button onClick={() => setPendingClose(true)} disabled={closePreview.alreadyClosed || closePreview.draftDepreciationCount > 0 || !closePreview.trialBalanceBalanced}><Landmark className="size-4" />Post Period Close</Button>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={drillTarget !== null} onOpenChange={(open) => {
        if (!open) {
          setDrillTarget(null)
          setSelectedEntryDetail(null)
          setSelectedDocumentDetail(null)
          setReviewDocument(null)
          setReviewDocumentState("idle")
        }
      }}>
        {drillTarget ? (
          <DialogContent className="sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>{drillTarget.title}</DialogTitle>
              <DialogDescription>{drillTarget.subtitle}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Journal Entries</p>
                <p className="mt-1 text-xl font-semibold">{drillEntries.length}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Debits</p>
                <Amount
                  value={drillEntries.reduce((sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + line.debit, 0), 0)}
                  className="mt-1 font-semibold"
                />
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Credits</p>
                <Amount
                  value={drillEntries.reduce((sum, entry) => sum + entry.lines.reduce((lineSum, line) => lineSum + line.credit, 0), 0)}
                  className="mt-1 font-semibold"
                />
              </div>
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Contributing Journal Entries</h3>
              <Card>
                <CardContent className="p-0">
                  {drillEntries.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">No posted journal entries matched this report line.</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Lines</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Credit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drillEntries.map((entry) => (
                          <TableRow
                            key={entry.id}
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer"
                            onClick={() => void openEntryDetail(entry)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault()
                                void openEntryDetail(entry)
                              }
                            }}
                          >
                            <TableCell>{formatDate(entry.date)}</TableCell>
                            <TableCell className="font-mono text-sm">{entry.reference ?? "-"}</TableCell>
                            <TableCell className="font-medium">{entry.description}</TableCell>
                            <TableCell>
                              <div className="max-w-md space-y-1">
                                {entry.lines.map((line, index) => {
                                  const account = accountById.get(line.accountId)
                                  return (
                                    <p key={`${entry.id}-${line.accountId}-${index}`} className="truncate text-xs text-muted-foreground">
                                      <span className="font-mono">{account?.code ?? line.accountId}</span>
                                      {" "}
                                      {account?.name ?? line.accountId}
                                      {" "}
                                      Dr <Amount value={line.debit} muted={line.debit === 0} />
                                      {" / "}
                                      Cr <Amount value={line.credit} muted={line.credit === 0} />
                                    </p>
                                  )
                                })}
                              </div>
                            </TableCell>
                            <TableCell className="text-right"><Amount value={entry.lines.reduce((sum, line) => sum + line.debit, 0)} /></TableCell>
                            <TableCell className="text-right"><Amount value={entry.lines.reduce((sum, line) => sum + line.credit, 0)} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Related Documents</h3>
              <Card>
                <CardContent className="p-0">
                  {relatedDocuments.length === 0 ? (
                    <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                      <FileText className="size-4" />
                      No invoice, bill, receipt, payment voucher, or workflow document matched these entries.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>No.</TableHead>
                          <TableHead>Party</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {relatedDocuments.map((document) => (
                          <TableRow
                            key={`${document.type}-${document.id}`}
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer"
                            onClick={() => openDocumentDetail(document)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault()
                                openDocumentDetail(document)
                              }
                            }}
                          >
                            <TableCell>{document.type}</TableCell>
                            <TableCell className="font-mono text-sm">{document.number}</TableCell>
                            <TableCell className="font-medium">{document.party ?? "-"}</TableCell>
                            <TableCell>{formatDate(document.date)}</TableCell>
                            <TableCell><Badge variant={document.status === "posted" || document.status === "paid" ? "secondary" : "outline"}>{titleCase(document.status)}</Badge></TableCell>
                            <TableCell className="text-right"><Amount value={document.amount} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </section>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={selectedEntryDetail !== null} onOpenChange={(open) => {
        if (!open) {
          setSelectedEntryDetail(null)
          setReviewDocument(null)
          setReviewDocumentState("idle")
        }
      }}>
        {selectedEntryDetail ? (
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>{selectedEntryDetail.reference ?? selectedEntryDetail.id}</DialogTitle>
              <DialogDescription>{selectedEntryDetail.description}</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="mt-1 font-medium">{formatDate(selectedEntryDetail.date)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="mt-1"><Badge variant={selectedEntryDetail.status === "draft" ? "outline" : "secondary"}>{titleCase(selectedEntryDetail.status ?? "posted")}</Badge></div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Debit Total</p>
                <Amount value={selectedEntryDetail.lines.reduce((sum, line) => sum + line.debit, 0)} className="mt-1 font-semibold" />
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Credit Total</p>
                <Amount value={selectedEntryDetail.lines.reduce((sum, line) => sum + line.credit, 0)} className="mt-1 font-semibold" />
              </div>
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Journal Lines</h3>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedEntryDetail.lines.map((line, index) => {
                        const account = accountById.get(line.accountId)
                        return (
                          <TableRow key={`${selectedEntryDetail.id}-${line.accountId}-${index}`}>
                            <TableCell>
                              <span className="font-mono text-xs text-muted-foreground">{account?.code ?? line.accountId}</span>
                              <span className="ml-2 font-medium">{account?.name ?? line.accountId}</span>
                            </TableCell>
                            <TableCell>{account ? ACCOUNT_TYPE_LABEL[account.type] : "-"}</TableCell>
                            <TableCell className="text-right"><Amount value={line.debit} muted={line.debit === 0} /></TableCell>
                            <TableCell className="text-right"><Amount value={line.credit} muted={line.credit === 0} /></TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">Journal ID</dt>
                <dd className="break-all font-mono">{selectedEntryDetail.id}</dd>
                <dt className="text-muted-foreground">Reference</dt>
                <dd className="font-mono">{selectedEntryDetail.reference ?? "-"}</dd>
                <dt className="text-muted-foreground">Posted At</dt>
                <dd>{selectedEntryDetail.postedAt ? formatDate(selectedEntryDetail.postedAt.slice(0, 10)) : "-"}</dd>
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (reviewDocument) window.location.href = `/documents?documentId=${encodeURIComponent(reviewDocument.id)}`
                  }}
                  disabled={!reviewDocument}
                >
                  <ExternalLink className="size-4" />
                  Review Document
                </Button>
                {reviewDocumentState === "loading" ? <span className="text-xs text-muted-foreground">Looking for linked OCR document...</span> : null}
                {reviewDocumentState === "missing" ? <span className="text-xs text-muted-foreground">No OCR review document is linked to this journal entry.</span> : null}
                {reviewDocumentState === "error" ? <span className="text-xs text-destructive">Could not check for a linked OCR document.</span> : null}
              </div>
            </section>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={selectedDocumentDetail !== null} onOpenChange={(open) => { if (!open) setSelectedDocumentDetail(null) }}>
        {selectedDocumentDetail ? (
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>
                {selectedDocumentDetail.type === "Invoice" ? selectedDocumentDetail.record.number
                  : selectedDocumentDetail.type === "Vendor Bill" ? selectedDocumentDetail.record.billNumber
                    : selectedDocumentDetail.type === "Receipt" ? selectedDocumentDetail.record.receiptNumber
                      : selectedDocumentDetail.type === "Payment Voucher" ? selectedDocumentDetail.record.voucherNumber
                        : selectedDocumentDetail.record.documentNumber}
              </DialogTitle>
              <DialogDescription>{selectedDocumentDetail.type} detail from the selected report line.</DialogDescription>
            </DialogHeader>

            {selectedDocumentDetail.type === "Invoice" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Customer</p><p className="mt-1 font-medium">{contactName(selectedDocumentDetail.record.clientId)}</p></div>
                  <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Issue Date</p><p className="mt-1 font-medium">{formatDate(selectedDocumentDetail.record.issueDate)}</p></div>
                  <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Due Date</p><p className="mt-1 font-medium">{formatDate(selectedDocumentDetail.record.dueDate)}</p></div>
                  <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Total</p><Amount value={invoiceTotal(selectedDocumentDetail.record)} className="mt-1 font-semibold" /></div>
                </div>
                <Card className="overflow-hidden py-0">
                  <Table>
                    <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit Price</TableHead><TableHead className="text-right">Line Total</TableHead></TableRow></TableHeader>
                    <TableBody>{selectedDocumentDetail.record.items.map((item) => <TableRow key={item.id}><TableCell>{item.description}</TableCell><TableCell className="text-right">{item.quantity}</TableCell><TableCell className="text-right"><Amount value={item.unitPrice} /></TableCell><TableCell className="text-right"><Amount value={item.quantity * item.unitPrice} /></TableCell></TableRow>)}</TableBody>
                  </Table>
                </Card>
              </>
            ) : null}

            {selectedDocumentDetail.type === "Vendor Bill" ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Vendor</p><p className="mt-1 font-medium">{contactName(selectedDocumentDetail.record.vendorId)}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Bill Date</p><p className="mt-1 font-medium">{formatDate(selectedDocumentDetail.record.billDate)}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Due Date</p><p className="mt-1 font-medium">{formatDate(selectedDocumentDetail.record.dueDate)}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Total</p><Amount value={selectedDocumentDetail.record.totalAmount} className="mt-1 font-semibold" /></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Subtotal</p><Amount value={selectedDocumentDetail.record.subtotal} className="mt-1 font-semibold" /></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Tax</p><Amount value={selectedDocumentDetail.record.taxAmount} className="mt-1 font-semibold" /></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Status</p><div className="mt-1"><Badge variant={selectedDocumentDetail.record.status === "paid" ? "secondary" : "outline"}>{titleCase(selectedDocumentDetail.record.status)}</Badge></div></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Bill ID</p><p className="mt-1 break-all font-mono text-xs">{selectedDocumentDetail.record.id}</p></div>
              </div>
            ) : null}

            {selectedDocumentDetail.type === "Receipt" ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Receipt Date</p><p className="mt-1 font-medium">{formatDate(selectedDocumentDetail.record.receiptDate)}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Amount</p><Amount value={selectedDocumentDetail.record.amount} className="mt-1 font-semibold" /></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Status</p><div className="mt-1"><Badge variant={selectedDocumentDetail.record.status === "posted" ? "secondary" : "outline"}>{titleCase(selectedDocumentDetail.record.status)}</Badge></div></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Invoice</p><p className="mt-1 font-mono text-xs">{invoices.find((invoice) => invoice.id === selectedDocumentDetail.record.invoiceId)?.number ?? selectedDocumentDetail.record.invoiceId ?? "-"}</p></div>
                <div className="rounded-lg border border-border p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Journal Entry</p><p className="mt-1 break-all font-mono text-xs">{selectedDocumentDetail.record.journalEntryId ?? "-"}</p></div>
                <div className="rounded-lg border border-border p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Receipt ID</p><p className="mt-1 break-all font-mono text-xs">{selectedDocumentDetail.record.id}</p></div>
              </div>
            ) : null}

            {selectedDocumentDetail.type === "Payment Voucher" ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Payment Date</p><p className="mt-1 font-medium">{formatDate(selectedDocumentDetail.record.paymentDate)}</p></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Amount</p><Amount value={selectedDocumentDetail.record.amount} className="mt-1 font-semibold" /></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Status</p><div className="mt-1"><Badge variant={selectedDocumentDetail.record.status === "posted" ? "secondary" : "outline"}>{titleCase(selectedDocumentDetail.record.status)}</Badge></div></div>
                <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Vendor Bill</p><p className="mt-1 font-mono text-xs">{vendorBills.find((bill) => bill.id === selectedDocumentDetail.record.vendorBillId)?.billNumber ?? selectedDocumentDetail.record.vendorBillId ?? "-"}</p></div>
                <div className="rounded-lg border border-border p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Journal Entry</p><p className="mt-1 break-all font-mono text-xs">{selectedDocumentDetail.record.journalEntryId ?? "-"}</p></div>
                <div className="rounded-lg border border-border p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Voucher ID</p><p className="mt-1 break-all font-mono text-xs">{selectedDocumentDetail.record.id}</p></div>
              </div>
            ) : null}

            {selectedDocumentDetail.type === "Workflow Document" ? (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Type</p><p className="mt-1 font-medium">{documentTypeLabel(selectedDocumentDetail.record.documentType)}</p></div>
                  <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Party</p><p className="mt-1 font-medium">{contactName(selectedDocumentDetail.record.contactId)}</p></div>
                  <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Date</p><p className="mt-1 font-medium">{formatDate(selectedDocumentDetail.record.documentDate)}</p></div>
                  <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Total</p><Amount value={selectedDocumentDetail.record.totalAmount} className="mt-1 font-semibold" /></div>
                </div>
                <Card className="overflow-hidden py-0">
                  <Table>
                    <TableHeader><TableRow><TableHead>Description</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Unit Price</TableHead><TableHead className="text-right">Tax</TableHead><TableHead className="text-right">Line Total</TableHead></TableRow></TableHeader>
                    <TableBody>{selectedDocumentDetail.record.lines.map((line) => <TableRow key={line.id}><TableCell>{line.description}</TableCell><TableCell className="text-right">{line.quantity}</TableCell><TableCell className="text-right"><Amount value={line.unitPrice} /></TableCell><TableCell className="text-right"><Amount value={line.taxAmount} /></TableCell><TableCell className="text-right"><Amount value={line.lineTotal} /></TableCell></TableRow>)}</TableBody>
                  </Table>
                </Card>
              </>
            ) : null}
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={assetOpen} onOpenChange={setAssetOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editingAssetId ? "Modify Fixed Asset" : "New Fixed Asset"}</DialogTitle><DialogDescription>Maintain asset cost, life, and depreciation posting accounts.</DialogDescription></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label>Asset Number</Label><Input value={assetForm.assetNumber} onChange={(event) => setAssetForm((current) => ({ ...current, assetNumber: event.target.value }))} /></div><div className="grid gap-2"><Label>Name</Label><Input value={assetForm.name} onChange={(event) => setAssetForm((current) => ({ ...current, name: event.target.value }))} /></div></div>
            <div className="grid gap-3 sm:grid-cols-3"><div className="grid gap-2"><Label>Purchase Date</Label><Input type="date" value={assetForm.purchaseDate} onChange={(event) => setAssetForm((current) => ({ ...current, purchaseDate: event.target.value }))} /></div><div className="grid gap-2"><Label>Purchase Price</Label><Input inputMode="decimal" value={assetForm.purchasePrice} onChange={(event) => setAssetForm((current) => ({ ...current, purchasePrice: Number(event.target.value) }))} /></div><div className="grid gap-2"><Label>Life Months</Label><Input inputMode="numeric" value={assetForm.usefulLifeMonths} onChange={(event) => setAssetForm((current) => ({ ...current, usefulLifeMonths: Number(event.target.value) }))} /></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label>Salvage Value</Label><Input inputMode="decimal" value={assetForm.salvageValue} onChange={(event) => setAssetForm((current) => ({ ...current, salvageValue: Number(event.target.value) }))} /></div><div className="grid gap-2"><Label>Status</Label><Select value={assetForm.status} onValueChange={(value) => setAssetForm((current) => ({ ...current, status: (value ?? "active") as FixedAsset["status"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="disposed">Disposed</SelectItem><SelectItem value="retired">Retired</SelectItem></SelectContent></Select></div></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-2"><Label>Asset Account</Label><Select value={assetForm.assetAccountId} onValueChange={(value) => setAssetForm((current) => ({ ...current, assetAccountId: value ?? undefined }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{assetAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} - {account.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label>Accum. Dep.</Label><Select value={assetForm.accumulatedDepreciationAccountId} onValueChange={(value) => setAssetForm((current) => ({ ...current, accumulatedDepreciationAccountId: value ?? undefined }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{assetAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} - {account.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label>Expense Account</Label><Select value={assetForm.depreciationExpenseAccountId} onValueChange={(value) => setAssetForm((current) => ({ ...current, depreciationExpenseAccountId: value ?? undefined }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{expenseAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} - {account.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {assetError ? <p className="text-sm text-destructive">{assetError}</p> : null}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAssetOpen(false)}>Cancel</Button><Button onClick={() => void saveAsset()}><Save className="size-4" />Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={!!pendingDepreciation}
        title="Post Depreciation"
        description="This creates a posted journal entry for the selected depreciation schedule."
        impactSummary={pendingDepreciation ? `Post depreciation of ${pendingDepreciation.depreciationAmount.toFixed(2)} for ${formatDate(pendingDepreciation.periodDate)}.` : ""}
        confirmationPhrase={UPDATE_CONFIRMATION_PHRASE}
        confirmLabel="Post Depreciation"
        onOpenChange={(open) => { if (!open) setPendingDepreciation(null) }}
        onConfirm={(confirmation) => {
          if (!pendingDepreciation) return
          void postDepreciationSchedule(pendingDepreciation.id, confirmation).then(() => setPendingDepreciation(null))
        }}
      />

      <ConfirmationDialog
        open={pendingClose}
        title="Post Period Close"
        description="This creates a retained earnings closing journal entry for the selected period."
        impactSummary={`Close ${periodStart} to ${periodEnd} with net income ${closePreview.netIncome.toFixed(2)}.`}
        confirmationPhrase={UPDATE_CONFIRMATION_PHRASE}
        confirmLabel="Post Close"
        onOpenChange={setPendingClose}
        onConfirm={(confirmation) => {
          void postPeriodClose(periodStart, periodEnd, retainedEarningsAccountId, confirmation).then(() => {
            setPendingClose(false)
            setCloseMessage("Period close posted.")
          }).catch((error) => setCloseMessage(error instanceof Error ? error.message : "Period close failed."))
        }}
      />
    </div>
  )
}
