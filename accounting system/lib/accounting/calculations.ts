import { NORMAL_BALANCE, type Account, type AccountType, type JournalEntry } from "./types"
import { monthKey } from "./utils"

export interface AccountBalance {
  account: Account
  debit: number
  credit: number
  raw: number
  natural: number
}

export interface MonthlyPoint {
  month: string
  key: string
  revenue: number
  expenses: number
  net: number
}

export interface FinancialSummary {
  totalsByType: Record<AccountType, number>
  totalRevenue: number
  totalExpenses: number
  netIncome: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  cashBalance: number
  arBalance: number
}

export function journalEntryTotals(entry: Pick<JournalEntry, "lines">) {
  return entry.lines.reduce(
    (totals, line) => ({
      debit: totals.debit + line.debit,
      credit: totals.credit + line.credit,
    }),
    { debit: 0, credit: 0 },
  )
}

export function isJournalEntryBalanced(entry: Pick<JournalEntry, "lines">) {
  const totals = journalEntryTotals(entry)
  return totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.005
}

export function calculateBalances(accounts: Account[], journalEntries: JournalEntry[]): AccountBalance[] {
  const totals = new Map<string, { debit: number; credit: number }>()
  accounts.forEach((account) => totals.set(account.id, { debit: 0, credit: 0 }))

  journalEntries.filter((entry) => entry.status !== "draft").forEach((entry) => {
    entry.lines.forEach((line) => {
      const current = totals.get(line.accountId)
      if (!current) return
      current.debit += line.debit
      current.credit += line.credit
    })
  })

  return accounts.map((account) => {
    const total = totals.get(account.id)!
    const raw = total.debit - total.credit
    const natural = NORMAL_BALANCE[account.type] === "debit" ? raw : -raw
    return { account, debit: total.debit, credit: total.credit, raw, natural }
  })
}

export function calculateFinancialSummary(balances: AccountBalance[]): FinancialSummary {
  const totalsByType = { asset: 0, liability: 0, equity: 0, revenue: 0, expense: 0 } as Record<AccountType, number>
  balances.forEach((balance) => {
    totalsByType[balance.account.type] += balance.natural
  })

  const totalRevenue = totalsByType.revenue
  const totalExpenses = totalsByType.expense
  const netIncome = totalRevenue - totalExpenses
  const totalAssets = totalsByType.asset
  const totalLiabilities = totalsByType.liability
  const totalEquity = totalsByType.equity + netIncome
  const balanceOf = (accountId: string) => balances.find((balance) => balance.account.id === accountId)?.natural ?? 0

  return {
    totalsByType,
    totalRevenue,
    totalExpenses,
    netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    cashBalance: balanceOf("1000") + balanceOf("1010"),
    arBalance: balanceOf("1200"),
  }
}

export function calculateMonthlyPoints(accounts: Account[], journalEntries: JournalEntry[]): MonthlyPoint[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const map = new Map<string, { revenue: number; expenses: number }>()

  journalEntries.filter((entry) => entry.status !== "draft").forEach((entry) => {
    const key = monthKey(entry.date)
    if (!map.has(key)) map.set(key, { revenue: 0, expenses: 0 })
    const bucket = map.get(key)!
    entry.lines.forEach((line) => {
      const account = accountsById.get(line.accountId)
      if (!account) return
      if (account.type === "revenue") bucket.revenue += line.credit - line.debit
      if (account.type === "expense") bucket.expenses += line.debit - line.credit
    })
  })

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => {
      const [year, month] = key.split("-")
      return {
        key,
        month: new Date(Number(year), Number(month) - 1, 1).toLocaleString("en-US", { month: "short" }),
        revenue: value.revenue,
        expenses: value.expenses,
        net: value.revenue - value.expenses,
      }
    })
}

export function calculateExpenseBreakdown(balances: AccountBalance[]) {
  return balances
    .filter((balance) => balance.account.type === "expense" && balance.natural !== 0)
    .map((balance) => ({ account: balance.account, amount: balance.natural }))
    .sort((a, b) => b.amount - a.amount)
}
