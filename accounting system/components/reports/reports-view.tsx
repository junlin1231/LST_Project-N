"use client"

import { useMemo, useState } from "react"
import { Calculator, CalendarDays, Download, Landmark, Plus, Save } from "lucide-react"
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
import { formatDate } from "@/lib/accounting/utils"
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
import type { DepreciationSchedule, FixedAsset, ReportSection } from "@/lib/accounting/types"

const today = new Date().toISOString().slice(0, 10)
const yearStart = `${today.slice(0, 4)}-01-01`

function SectionTable({ section }: { section: ReportSection }) {
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
          <TableRow key={`${section.label}-${line.accountId}-${line.name}`}>
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
    journalEntries,
    invoices,
    vendorBills,
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

  const trialBalance = useMemo(() => buildTrialBalance(accounts, journalEntries.filter((entry) => entry.date <= periodEnd)), [accounts, journalEntries, periodEnd])
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
      ...trialBalance.map((row) => ({ AccountCode: row.code, AccountName: row.name, Type: row.type, Debit: row.debit, Credit: row.credit })),
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
                {trialBalance.map((row) => (
                  <TableRow key={row.accountId}><TableCell><span className="font-mono text-xs text-muted-foreground">{row.code}</span> {row.name}</TableCell><TableCell className="capitalize">{row.type}</TableCell><TableCell className="text-right"><Amount value={row.debit} /></TableCell><TableCell className="text-right"><Amount value={row.credit} /></TableCell></TableRow>
                ))}
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
              <TableBody>{generalLedger.map((line, index) => <TableRow key={`${line.accountId}-${line.date}-${index}`}><TableCell>{formatDate(line.date)}</TableCell><TableCell>{line.accountName}</TableCell><TableCell>{line.description}</TableCell><TableCell className="text-right"><Amount value={line.debit} /></TableCell><TableCell className="text-right"><Amount value={line.credit} /></TableCell><TableCell className="text-right"><Amount value={line.runningBalance} colorBySign /></TableCell></TableRow>)}</TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="profit" className="space-y-3">
          <div className="flex justify-end"><ExportButton label="Export Profit or Loss" onClick={exportProfitOrLoss} /></div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="overflow-hidden py-0"><SectionTable section={profit.revenue} /></Card>
            <Card className="overflow-hidden py-0"><SectionTable section={profit.expenses} /></Card>
            <Card className="lg:col-span-2"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><span className="font-semibold">Net Profit / Loss</span><Amount value={profit.netProfitLoss} colorBySign className="text-lg font-semibold" /></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="position" className="space-y-3">
          <div className="flex justify-end"><ExportButton label="Export Position" onClick={exportFinancialPosition} /></div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="overflow-hidden py-0"><SectionTable section={position.assets} /></Card>
            <Card className="overflow-hidden py-0"><SectionTable section={position.liabilities} /></Card>
            <Card className="overflow-hidden py-0"><SectionTable section={position.equity} /></Card>
          </div>
        </TabsContent>

        <TabsContent value="cash" className="space-y-3">
          <div className="flex justify-end"><ExportButton label="Export Cash Flows" onClick={exportCashFlow} /></div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="overflow-hidden py-0"><SectionTable section={cashFlow.operatingActivities} /></Card>
            <Card className="overflow-hidden py-0"><SectionTable section={cashFlow.investingActivities} /></Card>
            <Card className="overflow-hidden py-0"><SectionTable section={cashFlow.financingActivities} /></Card>
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
