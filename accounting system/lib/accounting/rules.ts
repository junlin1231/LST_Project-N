import type { JournalEntry, JournalLine } from "./types"

export type AccountingRuleName = "invoice-posting" | "payment-receipt" | "expense-document" | "tax-placeholder"
export type AccountingRuleSourceType = "invoice" | "payment" | "expense-document" | "manual-override"

export interface AccountingRuleConfig {
  rulesetName: string
  version: number
  accountsReceivableAccountId: string
  cashAccountId: string
  revenueAccountId: string
  taxPayableAccountId: string
  expenseAccountId: string
  accountsPayableAccountId: string
}

export interface RuleOverride {
  lines?: JournalLine[]
  description?: string
  reference?: string
  reason: string
}

export interface RuleResult {
  ruleName: AccountingRuleName
  ruleVersion: number
  rulesetName: string
  sourceType: AccountingRuleSourceType
  sourceId?: string
  journalEntry: Omit<JournalEntry, "id">
  overrideReason?: string
}

export interface InvoicePostingInput {
  invoiceId: string
  invoiceNumber: string
  issueDate: string
  subtotal: number
  taxRate: number
  description?: string
  override?: RuleOverride
}

export interface PaymentReceiptInput {
  paymentId: string
  date: string
  amount: number
  reference?: string
  description?: string
  override?: RuleOverride
}

export interface ExpenseDocumentInput {
  documentId: string
  date: string
  amount: number
  taxRate?: number
  paidImmediately?: boolean
  vendorName?: string
  reference?: string
  description?: string
  override?: RuleOverride
}

export const DEFAULT_ACCOUNTING_RULE_CONFIG: AccountingRuleConfig = {
  rulesetName: "default-small-business",
  version: 1,
  accountsReceivableAccountId: "1200",
  cashAccountId: "1010",
  revenueAccountId: "4000",
  taxPayableAccountId: "2100",
  expenseAccountId: "5300",
  accountsPayableAccountId: "2000",
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function taxAmount(amount: number, taxRate = 0) {
  return roundMoney(amount * (taxRate / 100))
}

function applyOverride(entry: Omit<JournalEntry, "id">, override?: RuleOverride): Omit<JournalEntry, "id"> {
  if (!override) return entry
  return {
    ...entry,
    description: override.description ?? entry.description,
    reference: override.reference ?? entry.reference,
    lines: override.lines ?? entry.lines,
  }
}

function result(
  ruleName: AccountingRuleName,
  sourceType: AccountingRuleSourceType,
  sourceId: string,
  config: AccountingRuleConfig,
  journalEntry: Omit<JournalEntry, "id">,
  override?: RuleOverride,
): RuleResult {
  return {
    ruleName,
    ruleVersion: config.version,
    rulesetName: config.rulesetName,
    sourceType: override ? "manual-override" : sourceType,
    sourceId,
    journalEntry: applyOverride(journalEntry, override),
    overrideReason: override?.reason,
  }
}

export function buildInvoicePosting(input: InvoicePostingInput, config = DEFAULT_ACCOUNTING_RULE_CONFIG): RuleResult {
  const tax = taxAmount(input.subtotal, input.taxRate)
  const total = roundMoney(input.subtotal + tax)
  const lines: JournalLine[] = [
    { accountId: config.accountsReceivableAccountId, debit: total, credit: 0 },
    { accountId: config.revenueAccountId, debit: 0, credit: roundMoney(input.subtotal) },
  ]
  if (tax > 0) {
    lines.push({ accountId: config.taxPayableAccountId, debit: 0, credit: tax })
  }

  return result(
    "invoice-posting",
    "invoice",
    input.invoiceId,
    config,
    {
      date: input.issueDate,
      description: input.description ?? `Post invoice ${input.invoiceNumber}`,
      reference: input.invoiceNumber,
      lines,
    },
    input.override,
  )
}

export function buildInvoicePostingFromInvoice(
  invoice: { id: string; number: string; issueDate: string; taxRate: number; items: Array<{ quantity: number; unitPrice: number }> },
  config = DEFAULT_ACCOUNTING_RULE_CONFIG,
) {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  return buildInvoicePosting(
    {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      issueDate: invoice.issueDate,
      subtotal,
      taxRate: invoice.taxRate,
    },
    config,
  )
}

export function buildPaymentReceipt(input: PaymentReceiptInput, config = DEFAULT_ACCOUNTING_RULE_CONFIG): RuleResult {
  const amount = roundMoney(input.amount)
  return result(
    "payment-receipt",
    "payment",
    input.paymentId,
    config,
    {
      date: input.date,
      description: input.description ?? "Record customer payment",
      reference: input.reference,
      lines: [
        { accountId: config.cashAccountId, debit: amount, credit: 0 },
        { accountId: config.accountsReceivableAccountId, debit: 0, credit: amount },
      ],
    },
    input.override,
  )
}

export function buildExpenseDocument(input: ExpenseDocumentInput, config = DEFAULT_ACCOUNTING_RULE_CONFIG): RuleResult {
  const tax = taxAmount(input.amount, input.taxRate ?? 0)
  const gross = roundMoney(input.amount + tax)
  const clearingAccountId = input.paidImmediately ? config.cashAccountId : config.accountsPayableAccountId

  return result(
    "expense-document",
    "expense-document",
    input.documentId,
    config,
    {
      date: input.date,
      description: input.description ?? `Record expense${input.vendorName ? ` from ${input.vendorName}` : ""}`,
      reference: input.reference,
      lines: [
        { accountId: config.expenseAccountId, debit: roundMoney(input.amount), credit: 0 },
        { accountId: config.taxPayableAccountId, debit: tax, credit: 0 },
        { accountId: clearingAccountId, debit: 0, credit: gross },
      ].filter((line) => line.debit > 0 || line.credit > 0),
    },
    input.override,
  )
}

export function buildTaxPlaceholder(
  input: { sourceId: string; date: string; taxableAmount: number; taxRate: number; reference?: string; override?: RuleOverride },
  config = DEFAULT_ACCOUNTING_RULE_CONFIG,
): RuleResult {
  const tax = taxAmount(input.taxableAmount, input.taxRate)
  return result(
    "tax-placeholder",
    "expense-document",
    input.sourceId,
    config,
    {
      date: input.date,
      description: "Tax posting placeholder pending jurisdiction rules",
      reference: input.reference,
      lines: [
        { accountId: config.taxPayableAccountId, debit: 0, credit: tax },
        { accountId: config.accountsPayableAccountId, debit: tax, credit: 0 },
      ],
    },
    input.override,
  )
}
