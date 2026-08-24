import "server-only"

import { randomUUID } from "node:crypto"
import {
  DEFAULT_ACCOUNTING_RULE_CONFIG,
  buildExpenseDocument,
  buildInvoicePostingFromInvoice,
  buildPaymentReceipt,
  buildTaxPlaceholder,
  type AccountingRuleConfig,
  type ExpenseDocumentInput,
  type PaymentReceiptInput,
  type RuleResult,
} from "@/lib/accounting/rules"
import type { Invoice, JournalEntry } from "@/lib/accounting/types"
import { ensureDatabaseReady, query, transaction, type DbExecutor } from "./db"
import { DEFAULT_COMPANY_ID, getInvoice, insertJournalEntry } from "./accounting-repository"

interface RuleMappingRow {
  ruleset_name: string
  version: number
  accounts_receivable_account_id: string
  cash_account_id: string
  revenue_account_id: string
  tax_payable_account_id: string
  expense_account_id: string
  accounts_payable_account_id: string
}

function mapRuleConfig(row: RuleMappingRow): AccountingRuleConfig {
  return {
    rulesetName: row.ruleset_name,
    version: row.version,
    accountsReceivableAccountId: row.accounts_receivable_account_id,
    cashAccountId: row.cash_account_id,
    revenueAccountId: row.revenue_account_id,
    taxPayableAccountId: row.tax_payable_account_id,
    expenseAccountId: row.expense_account_id,
    accountsPayableAccountId: row.accounts_payable_account_id,
  }
}

async function exec(db: DbExecutor, sql: string, values?: unknown[]) {
  return db.query(sql, values)
}

async function seedDefaultRuleAccounts(db: DbExecutor) {
  const accounts = [
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.accountsReceivableAccountId, code: "1200", name: "Accounts Receivable", type: "asset" },
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.cashAccountId, code: "1010", name: "Cash / Bank", type: "asset" },
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.revenueAccountId, code: "4000", name: "Sales Revenue", type: "revenue" },
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.taxPayableAccountId, code: "2100", name: "Tax Payable", type: "liability" },
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.expenseAccountId, code: "5300", name: "General Expenses", type: "expense" },
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.accountsPayableAccountId, code: "2000", name: "Accounts Payable", type: "liability" },
    { id: "5000", code: "5000", name: "Rent Expense", type: "expense" },
    { id: "5100", code: "5100", name: "Salary Expense", type: "expense" },
    { id: "5200", code: "5200", name: "Utilities Expense", type: "expense" },
    { id: "5400", code: "5400", name: "Marketing Expense", type: "expense" },
    { id: "5500", code: "5500", name: "Software Subscriptions", type: "expense" },
    { id: "5600", code: "5600", name: "Cost of Goods Sold", type: "expense" },
    { id: "5700", code: "5700", name: "Depreciation Expense", type: "expense" },
    { id: "5800", code: "5800", name: "Meals and Entertainment", type: "expense" },
    { id: "5900", code: "5900", name: "Travel Expense", type: "expense" },
    { id: "5950", code: "5950", name: "Fuel and Transport Expense", type: "expense" },
  ]

  await exec(db, "INSERT INTO companies (id, name, base_currency) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [
    DEFAULT_COMPANY_ID,
    "Demo Company",
    "MYR",
  ])

  for (const account of accounts) {
    await exec(
      db,
      `INSERT INTO accounts (id, company_id, code, name, type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [account.id, DEFAULT_COMPANY_ID, account.code, account.name, account.type],
    )
  }
}

export async function seedDefaultRuleMapping() {
  await ensureDatabaseReady()
  await transaction(async (client) => {
    await seedDefaultRuleAccounts(client)
    await exec(
      client,
      `INSERT INTO accounting_rule_mappings (
        id,
        company_id,
        ruleset_name,
        version,
        accounts_receivable_account_id,
        cash_account_id,
        revenue_account_id,
        tax_payable_account_id,
        expense_account_id,
        accounts_payable_account_id,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
      ON CONFLICT (company_id, ruleset_name, version) DO NOTHING`,
      [
        "rule-map-default-v1",
        DEFAULT_COMPANY_ID,
        DEFAULT_ACCOUNTING_RULE_CONFIG.rulesetName,
        DEFAULT_ACCOUNTING_RULE_CONFIG.version,
        DEFAULT_ACCOUNTING_RULE_CONFIG.accountsReceivableAccountId,
        DEFAULT_ACCOUNTING_RULE_CONFIG.cashAccountId,
        DEFAULT_ACCOUNTING_RULE_CONFIG.revenueAccountId,
        DEFAULT_ACCOUNTING_RULE_CONFIG.taxPayableAccountId,
        DEFAULT_ACCOUNTING_RULE_CONFIG.expenseAccountId,
        DEFAULT_ACCOUNTING_RULE_CONFIG.accountsPayableAccountId,
      ],
    )
  })
}

export async function getActiveRuleConfig() {
  await ensureDatabaseReady()
  await seedDefaultRuleMapping()
  const result = await query<RuleMappingRow>(
    `SELECT
      ruleset_name,
      version,
      accounts_receivable_account_id,
      cash_account_id,
      revenue_account_id,
      tax_payable_account_id,
      expense_account_id,
      accounts_payable_account_id
    FROM accounting_rule_mappings
    WHERE company_id = $1 AND is_active = TRUE
    ORDER BY version DESC
    LIMIT 1`,
    [DEFAULT_COMPANY_ID],
  )
  return result.rows[0] ? mapRuleConfig(result.rows[0]) : DEFAULT_ACCOUNTING_RULE_CONFIG
}

export async function saveRuleExecutionLog(
  db: DbExecutor,
  result: RuleResult,
  inputSnapshot: unknown,
  status: "drafted" | "posted" | "failed" | "overridden",
  journalEntryId?: string,
) {
  await exec(
    db,
    `INSERT INTO rule_execution_logs (
      id,
      company_id,
      ruleset_name,
      rule_name,
      rule_version,
      source_type,
      source_id,
      journal_entry_id,
      status,
      input_snapshot,
      output_snapshot,
      override_reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12)`,
    [
      `rule-log-${randomUUID()}`,
      DEFAULT_COMPANY_ID,
      result.rulesetName,
      result.ruleName,
      result.ruleVersion,
      result.sourceType,
      result.sourceId ?? null,
      journalEntryId ?? null,
      status,
      JSON.stringify(inputSnapshot),
      JSON.stringify(result),
      result.overrideReason ?? null,
    ],
  )
}

async function postRuleResult(result: RuleResult, inputSnapshot: unknown): Promise<JournalEntry> {
  const journalEntry: JournalEntry = { ...result.journalEntry, id: `je-${randomUUID()}` }
  await transaction(async (client) => {
    await insertJournalEntry(client, journalEntry)
    await saveRuleExecutionLog(
      client,
      result,
      inputSnapshot,
      result.overrideReason ? "overridden" : "posted",
      journalEntry.id,
    )
  })
  return journalEntry
}

export async function postInvoiceByRule(invoice: Invoice) {
  const config = await getActiveRuleConfig()
  const ruleResult = buildInvoicePostingFromInvoice(invoice, config)
  return postRuleResult(ruleResult, invoice)
}

export async function postInvoiceByRuleById(invoiceId: string) {
  const invoice = await getInvoice(invoiceId)
  if (!invoice) {
    throw new Error("Invoice was not found.")
  }
  return postInvoiceByRule(invoice)
}

export async function postPaymentReceiptByRule(input: PaymentReceiptInput) {
  const config = await getActiveRuleConfig()
  const ruleResult = buildPaymentReceipt(input, config)
  return postRuleResult(ruleResult, input)
}

export async function postExpenseDocumentByRule(input: ExpenseDocumentInput) {
  const config = await getActiveRuleConfig()
  const ruleResult = buildExpenseDocument(input, config)
  return postRuleResult(ruleResult, input)
}

export async function draftTaxPlaceholder(input: { sourceId: string; date: string; taxableAmount: number; taxRate: number; reference?: string }) {
  const config = await getActiveRuleConfig()
  const ruleResult = buildTaxPlaceholder(input, config)
  await transaction(async (client) => {
    await saveRuleExecutionLog(client, ruleResult, input, "drafted")
  })
  return ruleResult
}
