import type { Account, JournalEntry, JournalLine } from "./types"

export interface CashBankAccountRow {
  account: Account
  balance: number
  transactionCount: number
  lastActivity?: string
}

export interface CashBankTransaction {
  id: string
  journalEntryId: string
  date: string
  reference?: string
  description: string
  account: Account
  counterparty: string
  inflow: number
  outflow: number
  netAmount: number
}

export interface CashBankSummary {
  totalBalance: number
  periodInflow: number
  periodOutflow: number
  netMovement: number
  accountRows: CashBankAccountRow[]
  transactions: CashBankTransaction[]
}

const CASH_BANK_NAME_PATTERN = /\b(cash|bank|checking|cheque|savings|wallet|petty cash)\b/i

export function isCashBankAccount(account: Account): boolean {
  return account.type === "asset" && (account.code.startsWith("10") || CASH_BANK_NAME_PATTERN.test(account.name))
}

function postedEntries(entries: JournalEntry[]): JournalEntry[] {
  return entries.filter((entry) => entry.status !== "draft")
}

function lineNetAmount(line: JournalLine): number {
  return line.debit - line.credit
}

export function findCashBankAccounts(accounts: Account[]): Account[] {
  return accounts.filter(isCashBankAccount).sort((a, b) => a.code.localeCompare(b.code))
}

export function buildCashBankTransactions(accounts: Account[], entries: JournalEntry[]): CashBankTransaction[] {
  const cashBankAccounts = new Map(findCashBankAccounts(accounts).map((account) => [account.id, account]))
  const accountById = new Map(accounts.map((account) => [account.id, account]))

  return postedEntries(entries)
    .flatMap((entry) =>
      entry.lines.flatMap((line, lineIndex) => {
        const account = cashBankAccounts.get(line.accountId)
        if (!account) return []

        const counterparties = entry.lines
          .filter((otherLine) => otherLine.accountId !== line.accountId)
          .map((otherLine) => accountById.get(otherLine.accountId)?.name ?? otherLine.accountId)

        const netAmount = lineNetAmount(line)
        return [{
          id: `${entry.id}-${line.accountId}-${lineIndex}`,
          journalEntryId: entry.id,
          date: entry.date,
          reference: entry.reference,
          description: entry.description,
          account,
          counterparty: counterparties.length > 0 ? counterparties.join(", ") : "Split entry",
          inflow: Math.max(netAmount, 0),
          outflow: Math.max(-netAmount, 0),
          netAmount,
        }]
      }),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.journalEntryId.localeCompare(a.journalEntryId))
}

export function buildCashBankSummary(
  accounts: Account[],
  entries: JournalEntry[],
  periodStart?: string,
  periodEnd?: string,
): CashBankSummary {
  const cashBankAccounts = findCashBankAccounts(accounts)
  const transactions = buildCashBankTransactions(accounts, entries)
  const periodTransactions = transactions.filter((transaction) => {
    if (periodStart && transaction.date < periodStart) return false
    if (periodEnd && transaction.date > periodEnd) return false
    return true
  })

  const accountRows = cashBankAccounts.map((account) => {
    const accountTransactions = transactions.filter((transaction) => transaction.account.id === account.id)
    return {
      account,
      balance: accountTransactions.reduce((sum, transaction) => sum + transaction.netAmount, 0),
      transactionCount: accountTransactions.length,
      lastActivity: accountTransactions[0]?.date,
    }
  })

  const periodInflow = periodTransactions.reduce((sum, transaction) => sum + transaction.inflow, 0)
  const periodOutflow = periodTransactions.reduce((sum, transaction) => sum + transaction.outflow, 0)

  return {
    totalBalance: accountRows.reduce((sum, row) => sum + row.balance, 0),
    periodInflow,
    periodOutflow,
    netMovement: periodInflow - periodOutflow,
    accountRows,
    transactions: periodTransactions,
  }
}
