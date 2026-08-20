import { calculateBalances, calculateFinancialSummary } from "./calculations"
import {
  NORMAL_BALANCE,
  type Account,
  type CashFlowReport,
  type DepreciationSchedule,
  type EquityChangesReport,
  type FinancialPositionReport,
  type FinancialStatementNote,
  type FixedAsset,
  type Invoice,
  type JournalEntry,
  type JournalLine,
  type PeriodClosePreview,
  type ProfitOrLossReport,
  type ReportLine,
  type ReportSection,
  type StockBalance,
  type VendorBill,
} from "./types"

export interface TrialBalanceRow {
  accountId: string
  code: string
  name: string
  type: string
  debit: number
  credit: number
}

export interface GeneralLedgerLine {
  accountId: string
  accountName: string
  date: string
  description: string
  reference?: string
  debit: number
  credit: number
  runningBalance: number
}

export interface CashFlowBoundary {
  operatingCashMovement: number
  investingCashMovement: number
  financingCashMovement: number
  note: string
}

export const DEFAULT_RETAINED_EARNINGS_ACCOUNT_ID = "3900"

function posted(entries: JournalEntry[]) {
  return entries.filter((entry) => entry.status !== "draft")
}

function inRange(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate
}

function isoLocalDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function amountForAccount(account: Account, line: JournalLine) {
  return NORMAL_BALANCE[account.type] === "debit" ? line.debit - line.credit : line.credit - line.debit
}

function section(label: string, accounts: Account[], entries: JournalEntry[], types: Account["type"][]): ReportSection {
  const balances = calculateBalances(accounts, posted(entries))
  const lines = balances
    .filter((balance) => types.includes(balance.account.type) && Math.abs(balance.natural) >= 0.005)
    .map((balance) => ({
      accountId: balance.account.id,
      code: balance.account.code,
      name: balance.account.name,
      amount: Number(balance.natural.toFixed(2)),
    }))
    .sort((a, b) => a.code.localeCompare(b.code))
  return { label, lines, total: Number(lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2)) }
}

export function buildTrialBalance(accounts: Account[], entries: JournalEntry[]): TrialBalanceRow[] {
  return calculateBalances(accounts, posted(entries)).map((balance) => {
    const debitNormal = NORMAL_BALANCE[balance.account.type] === "debit"
    const amount = balance.natural
    return {
      accountId: balance.account.id,
      code: balance.account.code,
      name: balance.account.name,
      type: balance.account.type,
      debit: debitNormal ? Math.max(amount, 0) : Math.max(-amount, 0),
      credit: debitNormal ? Math.max(-amount, 0) : Math.max(amount, 0),
    }
  })
}

export function buildGeneralLedger(accounts: Account[], entries: JournalEntry[]): GeneralLedgerLine[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const running = new Map<string, number>()

  return posted(entries)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((entry) =>
      entry.lines.map((line) => {
        const account = accountsById.get(line.accountId)
        const normalSide = account ? NORMAL_BALANCE[account.type] : "debit"
        const movement = normalSide === "debit" ? line.debit - line.credit : line.credit - line.debit
        const nextBalance = (running.get(line.accountId) ?? 0) + movement
        running.set(line.accountId, nextBalance)
        return {
          accountId: line.accountId,
          accountName: account?.name ?? line.accountId,
          date: entry.date,
          description: entry.description,
          reference: entry.reference,
          debit: line.debit,
          credit: line.credit,
          runningBalance: Number(nextBalance.toFixed(2)),
        }
      }),
    )
}

export function buildIncomeStatement(accounts: Account[], entries: JournalEntry[]) {
  const balances = calculateBalances(accounts, posted(entries))
  const summary = calculateFinancialSummary(balances)
  return { revenue: summary.totalRevenue, expenses: summary.totalExpenses, netIncome: summary.netIncome }
}

export function buildProfitOrLoss(accounts: Account[], entries: JournalEntry[], startDate: string, endDate: string): ProfitOrLossReport {
  const periodEntries = posted(entries).filter((entry) => inRange(entry.date, startDate, endDate))
  const revenue = section("Revenue", accounts, periodEntries, ["revenue"])
  const expenses = section("Expenses", accounts, periodEntries, ["expense"])
  const depreciationExpense = expenses.lines.filter((line) => /depreciation/i.test(line.name)).reduce((sum, line) => sum + line.amount, 0)
  return {
    period: { startDate, endDate },
    revenue,
    expenses,
    depreciationExpense: Number(depreciationExpense.toFixed(2)),
    netProfitLoss: Number((revenue.total - expenses.total).toFixed(2)),
  }
}

export function buildBalanceSheet(accounts: Account[], entries: JournalEntry[]) {
  const balances = calculateBalances(accounts, posted(entries))
  const summary = calculateFinancialSummary(balances)
  return {
    assets: summary.totalAssets,
    liabilities: summary.totalLiabilities,
    equity: summary.totalEquity,
    balanced: Math.abs(summary.totalAssets - summary.totalLiabilities - summary.totalEquity) < 0.005,
  }
}

export function buildFinancialPosition(accounts: Account[], entries: JournalEntry[], asOfDate: string): FinancialPositionReport {
  const asOfEntries = posted(entries).filter((entry) => entry.date <= asOfDate)
  const profit = buildProfitOrLoss(accounts, asOfEntries, "0000-01-01", asOfDate).netProfitLoss
  const assets = section("Assets", accounts, asOfEntries, ["asset"])
  const liabilities = section("Liabilities", accounts, asOfEntries, ["liability"])
  const equityBase = section("Equity", accounts, asOfEntries, ["equity"])
  const equityLines = Math.abs(profit) >= 0.005
    ? [...equityBase.lines, { accountId: "current-profit", code: "", name: "Current Profit / Loss", amount: profit }]
    : equityBase.lines
  const equityTotal = Number(equityLines.reduce((sum, line) => sum + line.amount, 0).toFixed(2))
  return { asOfDate, assets, liabilities, equity: { ...equityBase, lines: equityLines, total: equityTotal }, balanced: Math.abs(assets.total - liabilities.total - equityTotal) < 0.005 }
}

function cashAccountIds(accounts: Account[]) {
  return new Set(accounts.filter((account) => account.type === "asset" && /cash|bank/i.test(`${account.code} ${account.name}`)).map((account) => account.id))
}

function classifyCashMovement(entry: JournalEntry, cashLine: JournalLine, accountsById: Map<string, Account>) {
  const counterpartLines = entry.lines.filter((line) => line !== cashLine)
  const counterpartTypes = counterpartLines.map((line) => accountsById.get(line.accountId)?.type)
  const counterpartNames = counterpartLines.map((line) => accountsById.get(line.accountId)?.name ?? "").join(" ")
  if (counterpartTypes.includes("equity") || /loan|capital|withdrawal|dividend/i.test(counterpartNames)) return "financing"
  if (/fixed asset|equipment|vehicle|disposal/i.test(counterpartNames)) return "investing"
  return "operating"
}

export function buildCashFlowReport(accounts: Account[], entries: JournalEntry[], startDate: string, endDate: string): CashFlowReport {
  const cashIds = cashAccountIds(accounts)
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const buckets = {
    operating: new Map<string, ReportLine>(),
    investing: new Map<string, ReportLine>(),
    financing: new Map<string, ReportLine>(),
  }

  function add(map: Map<string, ReportLine>, label: string, amount: number) {
    const existing = map.get(label)
    if (existing) existing.amount = Number((existing.amount + amount).toFixed(2))
    else map.set(label, { accountId: label, code: "", name: label, amount: Number(amount.toFixed(2)) })
  }

  posted(entries).filter((entry) => inRange(entry.date, startDate, endDate)).forEach((entry) => {
    entry.lines.filter((line) => cashIds.has(line.accountId)).forEach((cashLine) => {
      const movement = cashLine.debit - cashLine.credit
      const bucket = classifyCashMovement(entry, cashLine, accountsById)
      add(buckets[bucket], entry.description, movement)
    })
  })

  const toSection = (label: string, map: Map<string, ReportLine>): ReportSection => {
    const lines = Array.from(map.values()).filter((line) => Math.abs(line.amount) >= 0.005)
    return { label, lines, total: Number(lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2)) }
  }
  const operatingActivities = toSection("Operating Activities", buckets.operating)
  const investingActivities = toSection("Investing Activities", buckets.investing)
  const financingActivities = toSection("Financing Activities", buckets.financing)
  const cashAt = (predicate: (date: string) => boolean) =>
    posted(entries).filter((entry) => predicate(entry.date)).reduce((sum, entry) => {
      return sum + entry.lines.filter((line) => cashIds.has(line.accountId)).reduce((lineSum, line) => lineSum + line.debit - line.credit, 0)
    }, 0)
  const openingCash = Number(cashAt((date) => date < startDate).toFixed(2))
  const netCashMovement = Number((operatingActivities.total + investingActivities.total + financingActivities.total).toFixed(2))

  return {
    period: { startDate, endDate },
    operatingActivities,
    investingActivities,
    financingActivities,
    unclassified: [],
    netCashMovement,
    openingCash,
    closingCash: Number((openingCash + netCashMovement).toFixed(2)),
  }
}

export function buildCashFlowBoundary(accounts: Account[], entries: JournalEntry[]): CashFlowBoundary {
  const cashFlow = buildCashFlowReport(accounts, entries, "0000-01-01", "9999-12-31")
  return {
    operatingCashMovement: cashFlow.operatingActivities.total,
    investingCashMovement: cashFlow.investingActivities.total,
    financingCashMovement: cashFlow.financingActivities.total,
    note: "Cash-flow movements are classified from cash/bank lines and their journal-entry counterpart accounts.",
  }
}

export function buildChangesInEquity(accounts: Account[], entries: JournalEntry[], startDate: string, endDate: string): EquityChangesReport {
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const equityMovement = (filtered: JournalEntry[]) => posted(filtered).reduce((sum, entry) => {
    return sum + entry.lines.reduce((lineSum, line) => {
      const account = accountsById.get(line.accountId)
      return account?.type === "equity" ? lineSum + amountForAccount(account, line) : lineSum
    }, 0)
  }, 0)
  const periodEntries = posted(entries).filter((entry) => inRange(entry.date, startDate, endDate))
  const openingEquity = Number(equityMovement(entries.filter((entry) => entry.date < startDate)).toFixed(2))
  const capitalIntroduced = Number(periodEntries.reduce((sum, entry) => {
    return sum + entry.lines.reduce((lineSum, line) => {
      const account = accountsById.get(line.accountId)
      if (account?.type !== "equity" || !/capital/i.test(account.name)) return lineSum
      return lineSum + Math.max(amountForAccount(account, line), 0)
    }, 0)
  }, 0).toFixed(2))
  const withdrawals = Number(periodEntries.reduce((sum, entry) => {
    return sum + entry.lines.reduce((lineSum, line) => {
      const account = accountsById.get(line.accountId)
      if (account?.type !== "equity" || !/withdrawal|dividend/i.test(account.name)) return lineSum
      return lineSum + Math.abs(Math.min(amountForAccount(account, line), 0))
    }, 0)
  }, 0).toFixed(2))
  const netProfitLoss = buildProfitOrLoss(accounts, entries, startDate, endDate).netProfitLoss
  return { period: { startDate, endDate }, openingEquity, capitalIntroduced, withdrawals, netProfitLoss, closingEquity: Number((openingEquity + capitalIntroduced - withdrawals + netProfitLoss).toFixed(2)) }
}

export function buildFinancialStatementNotes({
  accounts,
  entries,
  invoices,
  vendorBills,
  fixedAssets,
  stockBalances,
  startDate,
  endDate,
}: {
  accounts: Account[]
  entries: JournalEntry[]
  invoices: Invoice[]
  vendorBills: VendorBill[]
  fixedAssets: FixedAsset[]
  stockBalances: StockBalance[]
  startDate: string
  endDate: string
}): FinancialStatementNote[] {
  const profit = buildProfitOrLoss(accounts, entries, startDate, endDate)
  const position = buildFinancialPosition(accounts, entries, endDate)
  const receivables = invoices.filter((invoice) => invoice.status !== "paid").reduce((sum, invoice) => sum + invoice.items.reduce((lineSum, line) => lineSum + line.quantity * line.unitPrice * (1 + invoice.taxRate / 100), 0), 0)
  const payables = vendorBills.filter((bill) => bill.status !== "paid" && bill.status !== "void").reduce((sum, bill) => sum + bill.totalAmount, 0)
  const assetCost = fixedAssets.reduce((sum, asset) => sum + asset.purchasePrice, 0)
  const inventoryValue = stockBalances.reduce((sum, balance) => sum + balance.inventoryValue, 0)
  return [
    { id: "policy", title: "Significant Accounting Policies", rows: [{ label: "Basis of preparation", amount: 0, note: "Statements are compiled from posted double-entry ledger transactions." }] },
    { id: "revenue", title: "Revenue Breakdown", rows: profit.revenue.lines.map((line) => ({ label: `${line.code} ${line.name}`, amount: line.amount })) },
    { id: "expenses", title: "Expense Breakdown", rows: profit.expenses.lines.map((line) => ({ label: `${line.code} ${line.name}`, amount: line.amount })) },
    { id: "assets", title: "Assets", rows: position.assets.lines.map((line) => ({ label: `${line.code} ${line.name}`, amount: line.amount })) },
    { id: "working-capital", title: "Working Capital", rows: [{ label: "Open receivables", amount: receivables }, { label: "Open payables", amount: payables }, { label: "Inventory value", amount: inventoryValue }] },
    { id: "fixed-assets", title: "Fixed Assets", rows: [{ label: "Cost", amount: assetCost }, { label: "Depreciation expense", amount: profit.depreciationExpense }] },
  ]
}

export function calculateMonthlyDepreciation(asset: FixedAsset) {
  const depreciableAmount = Math.max(asset.purchasePrice - asset.salvageValue, 0)
  return Number((depreciableAmount / asset.usefulLifeMonths).toFixed(2))
}

export function buildDepreciationScheduleDrafts(asset: FixedAsset, existingSchedules: DepreciationSchedule[], throughDate: string): Omit<DepreciationSchedule, "id" | "journalEntryId" | "status">[] {
  if (asset.status !== "active") return []
  const existingPeriods = new Set(existingSchedules.filter((schedule) => schedule.assetId === asset.id).map((schedule) => schedule.periodDate))
  const purchase = new Date(`${asset.purchaseDate}T00:00:00`)
  const through = new Date(`${throughDate}T00:00:00`)
  const drafts: Omit<DepreciationSchedule, "id" | "journalEntryId" | "status">[] = []
  const monthly = calculateMonthlyDepreciation(asset)
  let accumulated = existingSchedules.filter((schedule) => schedule.assetId === asset.id).reduce((sum, schedule) => sum + schedule.depreciationAmount, 0)
  const depreciableAmount = Math.max(asset.purchasePrice - asset.salvageValue, 0)

  for (let index = 0; index < asset.usefulLifeMonths; index += 1) {
    const period = new Date(purchase.getFullYear(), purchase.getMonth() + index + 1, 0)
    if (period > through) break
    const periodDate = isoLocalDate(period)
    if (existingPeriods.has(periodDate)) continue
    const remaining = Number((depreciableAmount - accumulated).toFixed(2))
    if (remaining <= 0) break
    const depreciationAmount = Math.min(monthly, remaining)
    drafts.push({ assetId: asset.id, periodDate, depreciationAmount })
    accumulated += depreciationAmount
  }
  return drafts
}

export function buildPeriodClosePreview(accounts: Account[], entries: JournalEntry[], depreciationSchedules: DepreciationSchedule[], startDate: string, endDate: string): PeriodClosePreview {
  const trialBalance = buildTrialBalance(accounts, posted(entries).filter((entry) => entry.date <= endDate))
  const totalDebits = trialBalance.reduce((sum, row) => sum + row.debit, 0)
  const totalCredits = trialBalance.reduce((sum, row) => sum + row.credit, 0)
  const profit = buildProfitOrLoss(accounts, entries, startDate, endDate)
  const lines: JournalLine[] = []
  profit.revenue.lines.forEach((line) => lines.push({ accountId: line.accountId, debit: line.amount, credit: 0 }))
  profit.expenses.lines.forEach((line) => lines.push({ accountId: line.accountId, debit: 0, credit: line.amount }))
  if (profit.netProfitLoss >= 0) lines.push({ accountId: DEFAULT_RETAINED_EARNINGS_ACCOUNT_ID, debit: 0, credit: profit.netProfitLoss })
  else lines.push({ accountId: DEFAULT_RETAINED_EARNINGS_ACCOUNT_ID, debit: Math.abs(profit.netProfitLoss), credit: 0 })
  return {
    period: { startDate, endDate },
    revenueTotal: profit.revenue.total,
    expenseTotal: profit.expenses.total,
    netIncome: profit.netProfitLoss,
    trialBalanceBalanced: Math.abs(totalDebits - totalCredits) < 0.005,
    draftDepreciationCount: depreciationSchedules.filter((schedule) => schedule.status === "draft" && inRange(schedule.periodDate, startDate, endDate)).length,
    alreadyClosed: posted(entries).some((entry) => entry.reference === `CLOSE-${startDate}-${endDate}`),
    lines,
  }
}
