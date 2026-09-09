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
import { currentCompanyId, getInvoice, insertJournalEntry } from "./accounting-repository"
import { DEMO_COMPANY_ID } from "./tenant-context"

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

interface AccountIdRow {
  id: string
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

export function defaultAccountIdForCompany(code: string, companyId = currentCompanyId()) {
  return companyId === DEMO_COMPANY_ID ? code : `${companyId}-${code}`
}

export async function accountIdForCode(code: string, fallback = defaultAccountIdForCompany(code)) {
  const result = await query<AccountIdRow>(
    "SELECT id FROM accounts WHERE company_id = $1 AND code = $2 LIMIT 1",
    [currentCompanyId(), code],
  )
  return result.rows[0]?.id ?? fallback
}

function defaultRuleMappingId(companyId = currentCompanyId()) {
  return companyId === DEMO_COMPANY_ID ? "rule-map-default-v1" : `rule-map-${companyId}-default-v1`
}

async function upsertDefaultAccount(db: DbExecutor, account: { id: string; code: string; name: string; type: string }) {
  const result = await db.query<AccountIdRow>(
    `INSERT INTO accounts (id, company_id, code, name, type)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (company_id, code) DO UPDATE
     SET name = EXCLUDED.name, type = EXCLUDED.type, updated_at = NOW()
     RETURNING id`,
    [account.id, currentCompanyId(), account.code, account.name, account.type],
  )
  return result.rows[0]?.id ?? account.id
}

async function seedDefaultRuleAccounts(db: DbExecutor) {
  const accounts = [
    { code: "1200", name: "Trade Receivables", type: "asset" },
    { code: "1010", name: "Cash / Bank", type: "asset" },
    { code: "4000", name: "Sales Revenue", type: "revenue" },
    { code: "2100", name: "Tax Payable", type: "liability" },
    { code: "2150", name: "Statutory Payables", type: "liability" },
    { code: "5300", name: "General Expenses", type: "expense" },
    { code: "2000", name: "Accounts Payable", type: "liability" },
    { code: "5000", name: "Rent Expense", type: "expense" },
    { code: "5100", name: "Salary Expense", type: "expense" },
    { code: "5200", name: "Utilities Expense", type: "expense" },
    { code: "5400", name: "Marketing Expense", type: "expense" },
    { code: "5500", name: "Software Subscriptions", type: "expense" },
    { code: "5600", name: "Cost of Goods Sold", type: "expense" },
    { code: "5700", name: "Depreciation Expense", type: "expense" },
    { code: "5800", name: "Meals and Entertainment", type: "expense" },
    { code: "5900", name: "Travel Expense", type: "expense" },
    { code: "5950", name: "Fuel and Transport Expense", type: "expense" },
  ]

  await exec(
    db,
    `INSERT INTO companies (id, name, base_currency, ocr_own_names)
     VALUES ($1, $2, $3, ARRAY[$2]::TEXT[])
     ON CONFLICT (id) DO UPDATE
     SET ocr_own_names = CASE
       WHEN cardinality(companies.ocr_own_names) = 0 THEN ARRAY[EXCLUDED.name]::TEXT[]
       ELSE companies.ocr_own_names
     END`,
    [currentCompanyId(), "Demo Company", "MYR"],
  )

  const idsByCode: Record<string, string> = {}
  for (const account of accounts) {
    idsByCode[account.code] = await upsertDefaultAccount(db, {
      id: defaultAccountIdForCompany(account.code),
      ...account,
    })
  }

  return {
    ...DEFAULT_ACCOUNTING_RULE_CONFIG,
    accountsReceivableAccountId: idsByCode["1200"] ?? DEFAULT_ACCOUNTING_RULE_CONFIG.accountsReceivableAccountId,
    cashAccountId: idsByCode["1010"] ?? DEFAULT_ACCOUNTING_RULE_CONFIG.cashAccountId,
    revenueAccountId: idsByCode["4000"] ?? DEFAULT_ACCOUNTING_RULE_CONFIG.revenueAccountId,
    taxPayableAccountId: idsByCode["2100"] ?? DEFAULT_ACCOUNTING_RULE_CONFIG.taxPayableAccountId,
    expenseAccountId: idsByCode["5300"] ?? DEFAULT_ACCOUNTING_RULE_CONFIG.expenseAccountId,
    accountsPayableAccountId: idsByCode["2000"] ?? DEFAULT_ACCOUNTING_RULE_CONFIG.accountsPayableAccountId,
  }
}

export async function seedDefaultRuleMapping() {
  await ensureDatabaseReady()
  await transaction(async (client) => {
    const config = await seedDefaultRuleAccounts(client)
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
      ON CONFLICT (company_id, ruleset_name, version) DO UPDATE
      SET accounts_receivable_account_id = EXCLUDED.accounts_receivable_account_id,
          cash_account_id = EXCLUDED.cash_account_id,
          revenue_account_id = EXCLUDED.revenue_account_id,
          tax_payable_account_id = EXCLUDED.tax_payable_account_id,
          expense_account_id = EXCLUDED.expense_account_id,
          accounts_payable_account_id = EXCLUDED.accounts_payable_account_id,
          is_active = TRUE`,
      [
        defaultRuleMappingId(),
        currentCompanyId(),
        config.rulesetName,
        config.version,
        config.accountsReceivableAccountId,
        config.cashAccountId,
        config.revenueAccountId,
        config.taxPayableAccountId,
        config.expenseAccountId,
        config.accountsPayableAccountId,
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
    [currentCompanyId()],
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
      currentCompanyId(),
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
