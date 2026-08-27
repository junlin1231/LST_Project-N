import "server-only"

import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import {
  demoAccounts,
  demoContacts,
  demoDepreciationSchedules,
  demoFixedAssets,
  demoInvoices,
  demoJournalEntries,
  demoPaymentAllocations,
  demoPaymentVouchers,
  demoReceipts,
  demoStockItems,
  demoVendorBills,
  demoWarehouses,
  demoWorkflowDocuments,
} from "@/lib/accounting/data"
import { isJournalEntryBalanced } from "@/lib/accounting/calculations"
import {
  ADJUST_CONFIRMATION_PHRASE,
  POST_CONFIRMATION_PHRASE,
  REVERSE_CONFIRMATION_PHRASE,
  UPDATE_CONFIRMATION_PHRASE,
  buildAdjustingEntry,
  buildReversingEntry,
  validateSupervisorOverride,
  validateConfirmation,
  type ConfirmationMetadata,
} from "@/lib/accounting/governance"
import type {
  Account,
  AuditLog,
  Contact,
  DepreciationSchedule,
  FixedAsset,
  Invoice,
  JournalEntry,
  JournalLine,
  OpeningStockInput,
  PaymentAllocation,
  PaymentVoucher,
  Receipt,
  StockBalance,
  StockItem,
  StockMovement,
  StockMovementLine,
  VendorBill,
  Warehouse,
  WorkflowDocument,
  WorkflowDocumentLine,
} from "@/lib/accounting/types"
import { buildDepreciationScheduleDrafts, buildPeriodClosePreview, DEFAULT_RETAINED_EARNINGS_ACCOUNT_ID } from "@/lib/accounting/reports"
import { DEFAULT_ACCOUNTING_RULE_CONFIG, roundMoney } from "@/lib/accounting/rules"
import { ensureDatabaseReady, query, transaction, type DbExecutor } from "./db"

const DEFAULT_COMPANY_ID = "company-demo"
const DEFAULT_USER_ID = "user-demo-admin"

export { DEFAULT_COMPANY_ID, DEFAULT_USER_ID }

function ocrStorageRoot() {
  if (process.env.OCR_STORAGE_DIR?.trim()) return path.resolve(process.env.OCR_STORAGE_DIR.trim())
  return path.resolve(process.cwd(), "..", "ocr", "scanned_docs")
}

interface AccountRow {
  id: string
  code: string
  name: string
  type: Account["type"]
}

interface ContactRow {
  id: string
  name: string
  type: Contact["type"]
  email: string
  phone: string | null
  tax_id: string | null
  credit_limit: string | null
}

interface JournalEntryRow {
  id: string
  date: string
  description: string
  reference: string | null
  status: JournalEntry["status"]
  posted_at: string | null
  reversed_journal_entry_id: string | null
  adjusted_journal_entry_id: string | null
}

interface JournalLineRow {
  journal_entry_id: string
  account_id: string
  debit: string
  credit: string
}

interface InvoiceRow {
  id: string
  number: string
  client_id: string
  issue_date: string
  due_date: string
  status: Invoice["status"]
  tax_rate: string
}

interface InvoiceItemRow {
  invoice_id: string
  id: string
  description: string
  quantity: string
  unit_price: string
}

interface VendorBillRow {
  id: string
  vendor_id: string
  bill_number: string
  bill_date: string
  due_date: string
  status: VendorBill["status"]
  subtotal: string
  tax_amount: string
  total_amount: string
}

interface ReceiptRow {
  id: string
  invoice_id: string | null
  journal_entry_id: string | null
  receipt_number: string
  receipt_date: string
  amount: string
  status: Receipt["status"]
}

interface PaymentVoucherRow {
  id: string
  vendor_bill_id: string | null
  journal_entry_id: string | null
  voucher_number: string
  payment_date: string
  amount: string
  status: PaymentVoucher["status"]
}

interface PaymentAllocationRow {
  id: string
  source_type: PaymentAllocation["sourceType"]
  source_id: string
  target_type: PaymentAllocation["targetType"]
  target_id: string
  amount: string
  allocated_at: string
}

interface WorkflowDocumentRow {
  id: string
  document_type: WorkflowDocument["documentType"]
  document_number: string
  contact_id: string | null
  status: string
  document_date: string
  total_amount: string
  source_document_id: string | null
}

interface WorkflowDocumentLineRow {
  id: string
  workflow_document_id: string
  item_id: string | null
  warehouse_id: string | null
  description: string
  quantity: string
  unit_price: string
  tax_rate: string
  tax_amount: string
  line_total: string
}

interface StockItemRow {
  id: string
  sku: string
  name: string
  description: string
  item_type: string
  uom: string
  category: string
  status: StockItem["status"]
  valuation_method: StockItem["costingMethod"]
  default_sales_account_id: string | null
  default_inventory_account_id: string | null
  default_cogs_account_id: string | null
  reorder_level: string
}

interface WarehouseRow {
  id: string
  code: string
  name: string
  status: Warehouse["status"]
}

interface StockBalanceRow {
  id: string
  item_id: string
  warehouse_id: string
  quantity_on_hand: string
  inventory_value: string
  average_unit_cost: string
}

interface StockMovementRow {
  id: string
  movement_no: string
  movement_type: StockMovement["movementType"]
  movement_date: string
  source_type: string | null
  source_id: string | null
  status: StockMovement["status"]
  posted_at: string | null
}

interface StockMovementLineRow {
  id: string
  stock_movement_id: string
  item_id: string
  warehouse_id: string
  quantity_in: string
  quantity_out: string
  unit_cost: string
  total_cost: string
  memo: string | null
}

interface FixedAssetRow {
  id: string
  asset_number: string
  name: string
  purchase_date: string
  purchase_price: string
  useful_life_months: number
  salvage_value: string
  status: FixedAsset["status"]
  asset_account_id: string | null
  accumulated_depreciation_account_id: string | null
  depreciation_expense_account_id: string | null
  disposal_date: string | null
  disposal_proceeds: string | null
}

interface DepreciationScheduleRow {
  id: string
  asset_id: string
  period_date: string
  depreciation_amount: string
  journal_entry_id: string | null
  status: DepreciationSchedule["status"]
}

interface AuditLogRow {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  impact_summary: string
  reason: string | null
  confirmation_phrase: string | null
  metadata: Record<string, unknown>
  created_at: string
}

function toIsoDate(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function mapAccount(row: AccountRow): Account {
  return { id: row.id, code: row.code, name: row.name, type: row.type }
}

function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    email: row.email,
    phone: row.phone ?? undefined,
    taxId: row.tax_id ?? undefined,
    creditLimit: row.credit_limit === null ? undefined : Number(row.credit_limit),
  }
}

function mapJournalEntries(rows: JournalEntryRow[], lines: JournalLineRow[]): JournalEntry[] {
  const byEntryId = new Map<string, JournalLine[]>()
  lines.forEach((line) => {
    const bucket = byEntryId.get(line.journal_entry_id) ?? []
    bucket.push({
      accountId: line.account_id,
      debit: Number(line.debit),
      credit: Number(line.credit),
    })
    byEntryId.set(line.journal_entry_id, bucket)
  })

  return rows.map((row) => ({
    id: row.id,
    date: toIsoDate(row.date),
    description: row.description,
    reference: row.reference ?? undefined,
    status: row.status,
    postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : undefined,
    reversedJournalEntryId: row.reversed_journal_entry_id ?? undefined,
    adjustedJournalEntryId: row.adjusted_journal_entry_id ?? undefined,
    lines: byEntryId.get(row.id) ?? [],
  }))
}

function mapInvoices(rows: InvoiceRow[], items: InvoiceItemRow[]): Invoice[] {
  const byInvoiceId = new Map<string, Invoice["items"]>()
  items.forEach((item) => {
    const bucket = byInvoiceId.get(item.invoice_id) ?? []
    bucket.push({
      id: item.id,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
    })
    byInvoiceId.set(item.invoice_id, bucket)
  })

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    clientId: row.client_id,
    issueDate: toIsoDate(row.issue_date),
    dueDate: toIsoDate(row.due_date),
    status: row.status,
    taxRate: Number(row.tax_rate),
    items: byInvoiceId.get(row.id) ?? [],
  }))
}

function mapVendorBill(row: VendorBillRow): VendorBill {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    billNumber: row.bill_number,
    billDate: toIsoDate(row.bill_date),
    dueDate: toIsoDate(row.due_date),
    status: row.status,
    subtotal: Number(row.subtotal),
    taxAmount: Number(row.tax_amount),
    totalAmount: Number(row.total_amount),
  }
}

function mapReceipt(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    invoiceId: row.invoice_id ?? undefined,
    journalEntryId: row.journal_entry_id ?? undefined,
    receiptNumber: row.receipt_number,
    receiptDate: toIsoDate(row.receipt_date),
    amount: Number(row.amount),
    status: row.status,
  }
}

function mapPaymentVoucher(row: PaymentVoucherRow): PaymentVoucher {
  return {
    id: row.id,
    vendorBillId: row.vendor_bill_id ?? undefined,
    journalEntryId: row.journal_entry_id ?? undefined,
    voucherNumber: row.voucher_number,
    paymentDate: toIsoDate(row.payment_date),
    amount: Number(row.amount),
    status: row.status,
  }
}

function mapPaymentAllocation(row: PaymentAllocationRow): PaymentAllocation {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    targetType: row.target_type,
    targetId: row.target_id,
    amount: Number(row.amount),
    allocatedAt: new Date(row.allocated_at).toISOString(),
  }
}

function mapWorkflowDocuments(rows: WorkflowDocumentRow[], lines: WorkflowDocumentLineRow[]): WorkflowDocument[] {
  const byDocumentId = new Map<string, WorkflowDocumentLine[]>()
  lines.forEach((line) => {
    const bucket = byDocumentId.get(line.workflow_document_id) ?? []
    bucket.push({
      id: line.id,
      itemId: line.item_id ?? undefined,
      warehouseId: line.warehouse_id ?? undefined,
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unit_price),
      taxRate: Number(line.tax_rate),
      taxAmount: Number(line.tax_amount),
      lineTotal: Number(line.line_total),
    })
    byDocumentId.set(line.workflow_document_id, bucket)
  })

  return rows.map((row) => ({
    id: row.id,
    documentType: row.document_type,
    documentNumber: row.document_number,
    contactId: row.contact_id ?? undefined,
    status: row.status,
    documentDate: toIsoDate(row.document_date),
    totalAmount: Number(row.total_amount),
    sourceDocumentId: row.source_document_id ?? undefined,
    lines: byDocumentId.get(row.id) ?? [],
  }))
}

function mapStockItem(row: StockItemRow): StockItem {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    itemType: row.item_type,
    uom: row.uom,
    category: row.category,
    status: row.status,
    costingMethod: row.valuation_method,
    defaultSalesAccountId: row.default_sales_account_id ?? undefined,
    defaultInventoryAccountId: row.default_inventory_account_id ?? undefined,
    defaultCogsAccountId: row.default_cogs_account_id ?? undefined,
    reorderLevel: Number(row.reorder_level),
  }
}

function mapWarehouse(row: WarehouseRow): Warehouse {
  return { id: row.id, code: row.code, name: row.name, status: row.status }
}

function mapStockBalance(row: StockBalanceRow): StockBalance {
  return {
    id: row.id,
    itemId: row.item_id,
    warehouseId: row.warehouse_id,
    quantityOnHand: Number(row.quantity_on_hand),
    inventoryValue: Number(row.inventory_value),
    averageUnitCost: Number(row.average_unit_cost),
  }
}

function mapStockMovements(rows: StockMovementRow[], lines: StockMovementLineRow[]): StockMovement[] {
  const byMovementId = new Map<string, StockMovementLine[]>()
  lines.forEach((line) => {
    const bucket = byMovementId.get(line.stock_movement_id) ?? []
    bucket.push({
      id: line.id,
      itemId: line.item_id,
      warehouseId: line.warehouse_id,
      quantityIn: Number(line.quantity_in),
      quantityOut: Number(line.quantity_out),
      unitCost: Number(line.unit_cost),
      totalCost: Number(line.total_cost),
      memo: line.memo ?? undefined,
    })
    byMovementId.set(line.stock_movement_id, bucket)
  })

  return rows.map((row) => ({
    id: row.id,
    movementNo: row.movement_no,
    movementType: row.movement_type,
    movementDate: toIsoDate(row.movement_date),
    sourceType: row.source_type ?? undefined,
    sourceId: row.source_id ?? undefined,
    status: row.status,
    postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : undefined,
    lines: byMovementId.get(row.id) ?? [],
  }))
}

function mapFixedAsset(row: FixedAssetRow): FixedAsset {
  return {
    id: row.id,
    assetNumber: row.asset_number,
    name: row.name,
    purchaseDate: toIsoDate(row.purchase_date),
    purchasePrice: Number(row.purchase_price),
    usefulLifeMonths: row.useful_life_months,
    salvageValue: Number(row.salvage_value),
    status: row.status,
    assetAccountId: row.asset_account_id ?? undefined,
    accumulatedDepreciationAccountId: row.accumulated_depreciation_account_id ?? undefined,
    depreciationExpenseAccountId: row.depreciation_expense_account_id ?? undefined,
    disposalDate: row.disposal_date ? toIsoDate(row.disposal_date) : undefined,
    disposalProceeds: row.disposal_proceeds === null ? undefined : Number(row.disposal_proceeds),
  }
}

function mapDepreciationSchedule(row: DepreciationScheduleRow): DepreciationSchedule {
  return {
    id: row.id,
    assetId: row.asset_id,
    periodDate: toIsoDate(row.period_date),
    depreciationAmount: Number(row.depreciation_amount),
    journalEntryId: row.journal_entry_id ?? undefined,
    status: row.status,
  }
}

function mapAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id ?? undefined,
    impactSummary: row.impact_summary,
    reason: row.reason ?? undefined,
    confirmationPhrase: row.confirmation_phrase ?? undefined,
    metadata: row.metadata ?? {},
    createdAt: new Date(row.created_at).toISOString(),
  }
}

async function exec(db: DbExecutor, sql: string, values?: unknown[]) {
  return db.query(sql, values)
}

async function insertAuditLog(
  db: DbExecutor,
  action: string,
  entityType: string,
  entityId: string | null,
  confirmation: ConfirmationMetadata,
  metadata: Record<string, unknown> = {},
) {
  await exec(
    db,
    `INSERT INTO audit_logs (
      id,
      company_id,
      user_id,
      action,
      entity_type,
      entity_id,
      impact_summary,
      reason,
      confirmation_phrase,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      `audit-${randomUUID()}`,
      DEFAULT_COMPANY_ID,
      DEFAULT_USER_ID,
      action,
      entityType,
      entityId,
      confirmation.impactSummary,
      confirmation.reason?.trim() || null,
      confirmation.confirmationPhrase.trim().toUpperCase(),
      JSON.stringify({ ...metadata, confirmedAt: confirmation.confirmedAt }),
    ],
  )
}

async function insertSupervisorOverride(
  db: DbExecutor,
  action: string,
  entityType: string,
  entityId: string | null,
  confirmation: ConfirmationMetadata,
  metadata: Record<string, unknown> = {},
) {
  const authorization = confirmation.supervisorAuthorization
  if (!authorization) return

  await exec(
    db,
    `INSERT INTO supervisor_overrides (
      id,
      company_id,
      user_id,
      supervisor_id,
      action,
      entity_type,
      entity_id,
      reason,
      metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      `override-${randomUUID()}`,
      DEFAULT_COMPANY_ID,
      DEFAULT_USER_ID,
      authorization.supervisorId,
      action,
      entityType,
      entityId,
      confirmation.reason?.trim() || "Supervisor override",
      JSON.stringify(metadata),
    ],
  )
}

async function assertPeriodAllowsPosting(db: DbExecutor, date: string, confirmation: ConfirmationMetadata, action: string, entityId: string | null) {
  const result = await exec(
    db,
    `SELECT id, name, status
     FROM accounting_periods
     WHERE company_id = $1 AND $2::date BETWEEN start_date AND end_date
     ORDER BY start_date DESC
     LIMIT 1`,
    [DEFAULT_COMPANY_ID, date],
  )
  const period = result.rows[0] as { id: string; name: string; status: "open" | "closed" } | undefined
  if (period?.status !== "closed") return

  validateSupervisorOverride(confirmation)
  await insertSupervisorOverride(db, action, "journal_entry", entityId, confirmation, {
    periodId: period.id,
    periodName: period.name,
    postingDate: date,
  })
}

export async function seedDemoData() {
  await ensureDatabaseReady()
  await loadDemoData()
}

async function ensureDemoCompany() {
  await ensureDatabaseReady()
  await transaction(async (client) => {
    await exec(client, "INSERT INTO companies (id, name, base_currency) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING", [
      DEFAULT_COMPANY_ID,
      "Demo Company",
      "MYR",
    ])
    await exec(client, "INSERT INTO users (id, company_id, name, email, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING", [
      DEFAULT_USER_ID,
      DEFAULT_COMPANY_ID,
      "Demo Admin",
      "admin@example.com",
      "admin",
    ])
  })
}

export async function loadDemoData() {
  await ensureDatabaseReady()
  await ensureDemoCompany()

  await transaction(async (client) => {
    await exec(client, "DELETE FROM invoices WHERE company_id = $1 AND id = ANY($2)", [DEFAULT_COMPANY_ID, demoInvoices.map((invoice) => invoice.id)])
    await exec(client, "DELETE FROM vendor_bills WHERE company_id = $1 AND id = ANY($2)", [DEFAULT_COMPANY_ID, demoVendorBills.map((bill) => bill.id)])
    await exec(client, "DELETE FROM payment_allocations WHERE company_id = $1 AND id = ANY($2)", [DEFAULT_COMPANY_ID, demoPaymentAllocations.map((allocation) => allocation.id)])
    await exec(client, "DELETE FROM receipts WHERE company_id = $1 AND id = ANY($2)", [DEFAULT_COMPANY_ID, demoReceipts.map((receipt) => receipt.id)])
    await exec(client, "DELETE FROM payment_vouchers WHERE company_id = $1 AND id = ANY($2)", [DEFAULT_COMPANY_ID, demoPaymentVouchers.map((voucher) => voucher.id)])
    await exec(client, "DELETE FROM workflow_document_lines WHERE company_id = $1 AND workflow_document_id = ANY($2)", [DEFAULT_COMPANY_ID, demoWorkflowDocuments.map((document) => document.id)])
    await exec(client, "DELETE FROM workflow_documents WHERE company_id = $1 AND id = ANY($2)", [DEFAULT_COMPANY_ID, demoWorkflowDocuments.map((document) => document.id)])
    await exec(client, "DELETE FROM depreciation_schedules WHERE company_id = $1 AND asset_id = ANY($2)", [DEFAULT_COMPANY_ID, demoFixedAssets.map((asset) => asset.id)])
    await exec(client, "DELETE FROM fixed_assets WHERE company_id = $1 AND id = ANY($2)", [DEFAULT_COMPANY_ID, demoFixedAssets.map((asset) => asset.id)])
    await exec(client, "DELETE FROM journal_entries WHERE company_id = $1 AND id = ANY($2)", [
      DEFAULT_COMPANY_ID,
      demoJournalEntries.map((entry) => entry.id),
    ])

    for (const account of demoAccounts) {
      await exec(
        client,
        `INSERT INTO accounts (id, company_id, code, name, type)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, type = EXCLUDED.type, updated_at = NOW()`,
        [account.id, DEFAULT_COMPANY_ID, account.code, account.name, account.type],
      )
    }

    for (const contact of demoContacts) {
      await exec(
        client,
        `INSERT INTO contacts (id, company_id, name, type, email, phone, tax_id, credit_limit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          tax_id = EXCLUDED.tax_id,
          credit_limit = EXCLUDED.credit_limit,
          updated_at = NOW()`,
        [
          contact.id,
          DEFAULT_COMPANY_ID,
          contact.name,
          contact.type,
          contact.email,
          contact.phone ?? null,
          contact.taxId ?? null,
          contact.creditLimit ?? null,
        ],
      )
    }

    for (const item of demoStockItems) {
      await exec(
        client,
        `INSERT INTO inventory_items (
          id,
          company_id,
          sku,
          name,
          description,
          item_type,
          uom,
          category,
          status,
          valuation_method,
          default_sales_account_id,
          default_inventory_account_id,
          default_cogs_account_id,
          reorder_level
        )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET
          sku = EXCLUDED.sku,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          item_type = EXCLUDED.item_type,
          uom = EXCLUDED.uom,
          category = EXCLUDED.category,
          status = EXCLUDED.status,
          valuation_method = EXCLUDED.valuation_method,
          default_sales_account_id = EXCLUDED.default_sales_account_id,
          default_inventory_account_id = EXCLUDED.default_inventory_account_id,
          default_cogs_account_id = EXCLUDED.default_cogs_account_id,
          reorder_level = EXCLUDED.reorder_level,
          updated_at = NOW()`,
        [
          item.id,
          DEFAULT_COMPANY_ID,
          item.sku,
          item.name,
          item.description,
          item.itemType,
          item.uom,
          item.category,
          item.status,
          item.costingMethod,
          item.defaultSalesAccountId ?? null,
          item.defaultInventoryAccountId ?? null,
          item.defaultCogsAccountId ?? null,
          item.reorderLevel,
        ],
      )
    }

    for (const warehouse of demoWarehouses) {
      await exec(
        client,
        `INSERT INTO warehouses (id, company_id, code, name, status)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
          code = EXCLUDED.code,
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          updated_at = NOW()`,
        [warehouse.id, DEFAULT_COMPANY_ID, warehouse.code, warehouse.name, warehouse.status],
      )
    }

    for (const asset of demoFixedAssets) {
      await insertFixedAsset(client, asset)
    }

    for (const entry of demoJournalEntries) {
      await insertJournalEntry(client, entry)
    }

    for (const invoice of demoInvoices) {
      await insertInvoice(client, invoice)
    }

    for (const bill of demoVendorBills) {
      await insertVendorBill(client, bill)
    }

    for (const receipt of demoReceipts) {
      await insertReceipt(client, receipt)
    }

    for (const voucher of demoPaymentVouchers) {
      await insertPaymentVoucher(client, voucher)
    }

    for (const allocation of demoPaymentAllocations) {
      await insertPaymentAllocation(client, allocation)
    }

    for (const document of demoWorkflowDocuments) {
      await insertWorkflowDocument(client, document)
    }

    for (const schedule of demoDepreciationSchedules) {
      await insertDepreciationSchedule(client, schedule)
    }
  })
}

export async function resetSystemData() {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  const ocrStorageDir = path.join(ocrStorageRoot(), DEFAULT_COMPANY_ID)
  await transaction(async (client) => {
    await exec(client, "DELETE FROM posting_confirmations WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM document_accounting_drafts WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM document_categories WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM document_extractions WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM documents WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM stock_movement_lines WHERE stock_movement_id IN (SELECT id FROM stock_movements WHERE company_id = $1)", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM stock_movements WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM stock_balances WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM e_invoice_submissions WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM tax_return_runs WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM tax_codes WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM budget_allocations WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM payroll_runs WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM depreciation_schedules WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM fixed_assets WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM workflow_document_lines WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM workflow_documents WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM warehouse_bins WHERE warehouse_id IN (SELECT id FROM warehouses WHERE company_id = $1)", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM warehouses WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM inventory_items WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM bank_reconciliations WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM bank_statement_imports WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM bank_accounts WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM payment_allocations WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM payment_vouchers WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM receipts WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM vendor_bills WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM retained_earnings_closing_runs WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM supervisor_overrides WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM rule_execution_logs WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM accounting_rule_mappings WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM audit_logs WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM invoices WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM journal_entries WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM contacts WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM accounts WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    await exec(client, "DELETE FROM accounting_periods WHERE company_id = $1", [DEFAULT_COMPANY_ID])
  })
  await fs.rm(ocrStorageDir, { recursive: true, force: true })
  await fs.mkdir(ocrStorageDir, { recursive: true })
}

export async function insertJournalEntry(db: DbExecutor, entry: JournalEntry) {
  if (!isJournalEntryBalanced(entry)) {
    throw new Error("Journal entry is not balanced.")
  }

  await exec(
    db,
    `INSERT INTO journal_entries (
      id,
      company_id,
      date,
      description,
      reference,
      status,
      posted_at,
      reversed_journal_entry_id,
      adjusted_journal_entry_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.id,
      DEFAULT_COMPANY_ID,
      entry.date,
      entry.description,
      entry.reference ?? null,
      entry.status ?? "posted",
      entry.status === "draft" ? null : (entry.postedAt ?? new Date().toISOString()),
      entry.reversedJournalEntryId ?? null,
      entry.adjustedJournalEntryId ?? null,
    ],
  )

  for (const [index, line] of entry.lines.entries()) {
    await exec(
      db,
      "INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, $5)",
      [`${entry.id}-line-${index + 1}`, entry.id, line.accountId, line.debit, line.credit],
    )
  }
}

async function ensurePostingAccounts(db: DbExecutor) {
  const accounts = [
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.accountsReceivableAccountId, code: "1200", name: "Trade Receivables", type: "asset" },
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.cashAccountId, code: "1010", name: "Cash / Bank", type: "asset" },
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.revenueAccountId, code: "4000", name: "Sales Revenue", type: "revenue" },
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.taxPayableAccountId, code: "2100", name: "Tax Payable", type: "liability" },
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.expenseAccountId, code: "5300", name: "General Expenses", type: "expense" },
    { id: DEFAULT_ACCOUNTING_RULE_CONFIG.accountsPayableAccountId, code: "2000", name: "Accounts Payable", type: "liability" },
  ]

  for (const account of accounts) {
    await exec(
      db,
      `INSERT INTO accounts (id, company_id, code, name, type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
      [account.id, DEFAULT_COMPANY_ID, account.code, account.name, account.type],
    )
  }
}

function invoiceTotalAmount(invoice: Pick<Invoice, "items" | "taxRate">) {
  const subtotal = invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const tax = roundMoney(subtotal * (invoice.taxRate / 100))
  return { subtotal: roundMoney(subtotal), tax, total: roundMoney(subtotal + tax) }
}

function invoicePostingEntry(invoice: Invoice): JournalEntry {
  const amounts = invoiceTotalAmount(invoice)
  return {
    id: `je-inv-${randomUUID()}`,
    date: invoice.issueDate,
    description: `Post invoice ${invoice.number}`,
    reference: invoice.number,
    status: "posted",
    postedAt: new Date().toISOString(),
    lines: [
      { accountId: DEFAULT_ACCOUNTING_RULE_CONFIG.accountsReceivableAccountId, debit: amounts.total, credit: 0 },
      { accountId: DEFAULT_ACCOUNTING_RULE_CONFIG.revenueAccountId, debit: 0, credit: amounts.subtotal },
      { accountId: DEFAULT_ACCOUNTING_RULE_CONFIG.taxPayableAccountId, debit: 0, credit: amounts.tax },
    ].filter((line) => line.debit > 0 || line.credit > 0),
  }
}

function vendorBillPostingEntry(bill: VendorBill): JournalEntry {
  return {
    id: `je-bill-${randomUUID()}`,
    date: bill.billDate,
    description: `Post vendor bill ${bill.billNumber}`,
    reference: bill.billNumber,
    status: "posted",
    postedAt: new Date().toISOString(),
    lines: [
      { accountId: DEFAULT_ACCOUNTING_RULE_CONFIG.expenseAccountId, debit: roundMoney(bill.subtotal), credit: 0 },
      { accountId: DEFAULT_ACCOUNTING_RULE_CONFIG.taxPayableAccountId, debit: roundMoney(bill.taxAmount), credit: 0 },
      { accountId: DEFAULT_ACCOUNTING_RULE_CONFIG.accountsPayableAccountId, debit: 0, credit: roundMoney(bill.totalAmount) },
    ].filter((line) => line.debit > 0 || line.credit > 0),
  }
}

function receiptPostingEntry(receipt: Receipt): JournalEntry {
  const amount = roundMoney(receipt.amount)
  return {
    id: receipt.journalEntryId ?? `je-rcpt-${randomUUID()}`,
    date: receipt.receiptDate,
    description: `Post receipt ${receipt.receiptNumber}`,
    reference: receipt.receiptNumber,
    status: "posted",
    postedAt: new Date().toISOString(),
    lines: [
      { accountId: DEFAULT_ACCOUNTING_RULE_CONFIG.cashAccountId, debit: amount, credit: 0 },
      { accountId: DEFAULT_ACCOUNTING_RULE_CONFIG.accountsReceivableAccountId, debit: 0, credit: amount },
    ],
  }
}

function paymentVoucherPostingEntry(voucher: PaymentVoucher): JournalEntry {
  const amount = roundMoney(voucher.amount)
  return {
    id: voucher.journalEntryId ?? `je-pv-${randomUUID()}`,
    date: voucher.paymentDate,
    description: `Post payment voucher ${voucher.voucherNumber}`,
    reference: voucher.voucherNumber,
    status: "posted",
    postedAt: new Date().toISOString(),
    lines: [
      { accountId: DEFAULT_ACCOUNTING_RULE_CONFIG.accountsPayableAccountId, debit: amount, credit: 0 },
      { accountId: DEFAULT_ACCOUNTING_RULE_CONFIG.cashAccountId, debit: 0, credit: amount },
    ],
  }
}

async function insertInvoice(db: DbExecutor, invoice: Invoice) {
  await exec(
    db,
    "INSERT INTO invoices (id, company_id, number, client_id, issue_date, due_date, status, tax_rate) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [invoice.id, DEFAULT_COMPANY_ID, invoice.number, invoice.clientId, invoice.issueDate, invoice.dueDate, invoice.status, invoice.taxRate],
  )

  for (const item of invoice.items) {
    await exec(
      db,
      "INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price) VALUES ($1, $2, $3, $4, $5)",
      [item.id, invoice.id, item.description, item.quantity, item.unitPrice],
    )
  }
}

async function insertVendorBill(db: DbExecutor, bill: VendorBill) {
  await exec(
    db,
    `INSERT INTO vendor_bills (
      id,
      company_id,
      vendor_id,
      bill_number,
      bill_date,
      due_date,
      status,
      subtotal,
      tax_amount,
      total_amount
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      bill.id,
      DEFAULT_COMPANY_ID,
      bill.vendorId,
      bill.billNumber,
      bill.billDate,
      bill.dueDate,
      bill.status,
      bill.subtotal,
      bill.taxAmount,
      bill.totalAmount,
    ],
  )
}

async function insertReceipt(db: DbExecutor, receipt: Receipt) {
  await exec(
    db,
    `INSERT INTO receipts (id, company_id, invoice_id, journal_entry_id, receipt_number, receipt_date, amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
      invoice_id = EXCLUDED.invoice_id,
      journal_entry_id = EXCLUDED.journal_entry_id,
      receipt_number = EXCLUDED.receipt_number,
      receipt_date = EXCLUDED.receipt_date,
      amount = EXCLUDED.amount,
      status = EXCLUDED.status,
      updated_at = NOW()`,
    [
      receipt.id,
      DEFAULT_COMPANY_ID,
      receipt.invoiceId ?? null,
      receipt.journalEntryId ?? null,
      receipt.receiptNumber,
      receipt.receiptDate,
      receipt.amount,
      receipt.status,
    ],
  )
}

async function insertPaymentVoucher(db: DbExecutor, voucher: PaymentVoucher) {
  await exec(
    db,
    `INSERT INTO payment_vouchers (id, company_id, vendor_bill_id, journal_entry_id, voucher_number, payment_date, amount, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
      vendor_bill_id = EXCLUDED.vendor_bill_id,
      journal_entry_id = EXCLUDED.journal_entry_id,
      voucher_number = EXCLUDED.voucher_number,
      payment_date = EXCLUDED.payment_date,
      amount = EXCLUDED.amount,
      status = EXCLUDED.status,
      updated_at = NOW()`,
    [
      voucher.id,
      DEFAULT_COMPANY_ID,
      voucher.vendorBillId ?? null,
      voucher.journalEntryId ?? null,
      voucher.voucherNumber,
      voucher.paymentDate,
      voucher.amount,
      voucher.status,
    ],
  )
}

async function insertPaymentAllocation(db: DbExecutor, allocation: PaymentAllocation) {
  await exec(
    db,
    `INSERT INTO payment_allocations (id, company_id, source_type, source_id, target_type, target_id, amount, allocated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    [
      allocation.id,
      DEFAULT_COMPANY_ID,
      allocation.sourceType,
      allocation.sourceId,
      allocation.targetType,
      allocation.targetId,
      allocation.amount,
      allocation.allocatedAt,
    ],
  )
}

async function insertWorkflowDocument(db: DbExecutor, document: WorkflowDocument) {
  await exec(
    db,
    `INSERT INTO workflow_documents (
      id,
      company_id,
      document_type,
      document_number,
      contact_id,
      status,
      document_date,
      total_amount,
      source_document_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO UPDATE SET
      contact_id = EXCLUDED.contact_id,
      status = EXCLUDED.status,
      document_date = EXCLUDED.document_date,
      total_amount = EXCLUDED.total_amount,
      source_document_id = EXCLUDED.source_document_id`,
    [
      document.id,
      DEFAULT_COMPANY_ID,
      document.documentType,
      document.documentNumber,
      document.contactId ?? null,
      document.status,
      document.documentDate,
      document.totalAmount,
      document.sourceDocumentId ?? null,
    ],
  )
  await replaceWorkflowDocumentLines(db, document.id, document.lines)
}

async function replaceWorkflowDocumentLines(db: DbExecutor, documentId: string, lines: WorkflowDocumentLine[]) {
  await exec(db, "DELETE FROM workflow_document_lines WHERE company_id = $1 AND workflow_document_id = $2", [DEFAULT_COMPANY_ID, documentId])
  for (const [index, line] of lines.entries()) {
    const lineTotal = Number((line.quantity * line.unitPrice).toFixed(2))
    const taxAmount = Number((lineTotal * line.taxRate).toFixed(2))
    await exec(
      db,
      `INSERT INTO workflow_document_lines (
        id,
        company_id,
        workflow_document_id,
        line_no,
        item_id,
        warehouse_id,
        description,
        quantity,
        unit_price,
        tax_rate,
        tax_amount,
        line_total
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        line.id || `wf-line-${randomUUID()}`,
        DEFAULT_COMPANY_ID,
        documentId,
        index + 1,
        line.itemId ?? null,
        line.warehouseId ?? null,
        line.description.trim(),
        line.quantity,
        line.unitPrice,
        line.taxRate,
        taxAmount,
        Number((lineTotal + taxAmount).toFixed(2)),
      ],
    )
  }
}

async function insertFixedAsset(db: DbExecutor, asset: FixedAsset) {
  await exec(
    db,
    `INSERT INTO fixed_assets (
      id,
      company_id,
      asset_number,
      name,
      purchase_date,
      purchase_price,
      useful_life_months,
      salvage_value,
      status,
      asset_account_id,
      accumulated_depreciation_account_id,
      depreciation_expense_account_id,
      disposal_date,
      disposal_proceeds
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (id) DO UPDATE SET
      asset_number = EXCLUDED.asset_number,
      name = EXCLUDED.name,
      purchase_date = EXCLUDED.purchase_date,
      purchase_price = EXCLUDED.purchase_price,
      useful_life_months = EXCLUDED.useful_life_months,
      salvage_value = EXCLUDED.salvage_value,
      status = EXCLUDED.status,
      asset_account_id = EXCLUDED.asset_account_id,
      accumulated_depreciation_account_id = EXCLUDED.accumulated_depreciation_account_id,
      depreciation_expense_account_id = EXCLUDED.depreciation_expense_account_id,
      disposal_date = EXCLUDED.disposal_date,
      disposal_proceeds = EXCLUDED.disposal_proceeds,
      updated_at = NOW()`,
    [
      asset.id,
      DEFAULT_COMPANY_ID,
      asset.assetNumber,
      asset.name,
      asset.purchaseDate,
      asset.purchasePrice,
      asset.usefulLifeMonths,
      asset.salvageValue,
      asset.status,
      asset.assetAccountId ?? null,
      asset.accumulatedDepreciationAccountId ?? null,
      asset.depreciationExpenseAccountId ?? null,
      asset.disposalDate ?? null,
      asset.disposalProceeds ?? null,
    ],
  )
}

async function insertDepreciationSchedule(db: DbExecutor, schedule: DepreciationSchedule) {
  await exec(
    db,
    `INSERT INTO depreciation_schedules (id, company_id, asset_id, period_date, depreciation_amount, journal_entry_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
      period_date = EXCLUDED.period_date,
      depreciation_amount = EXCLUDED.depreciation_amount,
      journal_entry_id = EXCLUDED.journal_entry_id,
      status = EXCLUDED.status`,
    [
      schedule.id,
      DEFAULT_COMPANY_ID,
      schedule.assetId,
      schedule.periodDate,
      schedule.depreciationAmount,
      schedule.journalEntryId ?? null,
      schedule.status,
    ],
  )
}

export async function listAccountingData() {
  await ensureDatabaseReady()
  await ensureDemoCompany()

  const [accounts, contacts, journalEntries, journalLines, invoices, invoiceItems, vendorBills, receipts, paymentVouchers, paymentAllocations, workflowDocuments, workflowDocumentLines, stockItems, warehouses, stockBalances, stockMovements, stockMovementLines, fixedAssets, depreciationSchedules, auditLogs] = await Promise.all([
    query<AccountRow>("SELECT id, code, name, type FROM accounts WHERE company_id = $1 ORDER BY code", [DEFAULT_COMPANY_ID]),
    query<ContactRow>("SELECT id, name, type, email, phone, tax_id, credit_limit::text FROM contacts WHERE company_id = $1 ORDER BY name", [DEFAULT_COMPANY_ID]),
    query<JournalEntryRow>(
      "SELECT id, date::text, description, reference, status, posted_at::text, reversed_journal_entry_id, adjusted_journal_entry_id FROM journal_entries WHERE company_id = $1 ORDER BY date DESC, created_at DESC",
      [DEFAULT_COMPANY_ID],
    ),
    query<JournalLineRow>("SELECT journal_entry_id, account_id, debit::text, credit::text FROM journal_lines ORDER BY created_at, id"),
    query<InvoiceRow>("SELECT id, number, client_id, issue_date::text, due_date::text, status, tax_rate::text FROM invoices WHERE company_id = $1 ORDER BY issue_date DESC", [DEFAULT_COMPANY_ID]),
    query<InvoiceItemRow>("SELECT invoice_id, id, description, quantity::text, unit_price::text FROM invoice_items ORDER BY created_at, id"),
    query<VendorBillRow>(
      "SELECT id, vendor_id, bill_number, bill_date::text, due_date::text, status, subtotal::text, tax_amount::text, total_amount::text FROM vendor_bills WHERE company_id = $1 ORDER BY bill_date DESC, created_at DESC",
      [DEFAULT_COMPANY_ID],
    ),
    query<ReceiptRow>(
      "SELECT id, invoice_id, journal_entry_id, receipt_number, receipt_date::text, amount::text, status FROM receipts WHERE company_id = $1 ORDER BY receipt_date DESC, created_at DESC",
      [DEFAULT_COMPANY_ID],
    ),
    query<PaymentVoucherRow>(
      "SELECT id, vendor_bill_id, journal_entry_id, voucher_number, payment_date::text, amount::text, status FROM payment_vouchers WHERE company_id = $1 ORDER BY payment_date DESC, created_at DESC",
      [DEFAULT_COMPANY_ID],
    ),
    query<PaymentAllocationRow>(
      "SELECT id, source_type, source_id, target_type, target_id, amount::text, allocated_at::text FROM payment_allocations WHERE company_id = $1 ORDER BY allocated_at DESC",
      [DEFAULT_COMPANY_ID],
    ),
    query<WorkflowDocumentRow>(
      "SELECT id, document_type, document_number, contact_id, status, document_date::text, total_amount::text, source_document_id FROM workflow_documents WHERE company_id = $1 ORDER BY document_date DESC, created_at DESC",
      [DEFAULT_COMPANY_ID],
    ),
    query<WorkflowDocumentLineRow>(
      "SELECT id, workflow_document_id, item_id, warehouse_id, description, quantity::text, unit_price::text, tax_rate::text, tax_amount::text, line_total::text FROM workflow_document_lines WHERE company_id = $1 ORDER BY workflow_document_id, line_no, created_at",
      [DEFAULT_COMPANY_ID],
    ),
    query<StockItemRow>(
      `SELECT
        id,
        sku,
        name,
        description,
        item_type,
        uom,
        category,
        status,
        valuation_method,
        default_sales_account_id,
        default_inventory_account_id,
        default_cogs_account_id,
        reorder_level::text
       FROM inventory_items
       WHERE company_id = $1
       ORDER BY sku`,
      [DEFAULT_COMPANY_ID],
    ),
    query<WarehouseRow>("SELECT id, code, name, status FROM warehouses WHERE company_id = $1 ORDER BY code", [DEFAULT_COMPANY_ID]),
    query<StockBalanceRow>(
      "SELECT id, item_id, warehouse_id, quantity_on_hand::text, inventory_value::text, average_unit_cost::text FROM stock_balances WHERE company_id = $1 ORDER BY updated_at DESC",
      [DEFAULT_COMPANY_ID],
    ),
    query<StockMovementRow>(
      "SELECT id, movement_no, movement_type, movement_date::text, source_type, source_id, status, posted_at::text FROM stock_movements WHERE company_id = $1 ORDER BY movement_date DESC, created_at DESC",
      [DEFAULT_COMPANY_ID],
    ),
    query<StockMovementLineRow>(
      "SELECT id, stock_movement_id, item_id, warehouse_id, quantity_in::text, quantity_out::text, unit_cost::text, total_cost::text, memo FROM stock_movement_lines ORDER BY created_at, id",
    ),
    query<FixedAssetRow>(
      `SELECT
        id,
        asset_number,
        name,
        purchase_date::text,
        purchase_price::text,
        useful_life_months,
        salvage_value::text,
        status,
        asset_account_id,
        accumulated_depreciation_account_id,
        depreciation_expense_account_id,
        disposal_date::text,
        disposal_proceeds::text
       FROM fixed_assets
       WHERE company_id = $1
       ORDER BY asset_number`,
      [DEFAULT_COMPANY_ID],
    ),
    query<DepreciationScheduleRow>(
      "SELECT id, asset_id, period_date::text, depreciation_amount::text, journal_entry_id, status FROM depreciation_schedules WHERE company_id = $1 ORDER BY period_date DESC",
      [DEFAULT_COMPANY_ID],
    ),
    query<AuditLogRow>(
      "SELECT id, action, entity_type, entity_id, impact_summary, reason, confirmation_phrase, metadata, created_at::text FROM audit_logs WHERE company_id = $1 ORDER BY created_at DESC LIMIT 100",
      [DEFAULT_COMPANY_ID],
    ),
  ])

  return {
    accounts: accounts.rows.map(mapAccount),
    contacts: contacts.rows.map(mapContact),
    journalEntries: mapJournalEntries(journalEntries.rows, journalLines.rows),
    invoices: mapInvoices(invoices.rows, invoiceItems.rows),
    vendorBills: vendorBills.rows.map(mapVendorBill),
    receipts: receipts.rows.map(mapReceipt),
    paymentVouchers: paymentVouchers.rows.map(mapPaymentVoucher),
    paymentAllocations: paymentAllocations.rows.map(mapPaymentAllocation),
    workflowDocuments: mapWorkflowDocuments(workflowDocuments.rows, workflowDocumentLines.rows),
    stockItems: stockItems.rows.map(mapStockItem),
    warehouses: warehouses.rows.map(mapWarehouse),
    stockBalances: stockBalances.rows.map(mapStockBalance),
    stockMovements: mapStockMovements(stockMovements.rows, stockMovementLines.rows),
    fixedAssets: fixedAssets.rows.map(mapFixedAsset),
    depreciationSchedules: depreciationSchedules.rows.map(mapDepreciationSchedule),
    auditLogs: auditLogs.rows.map(mapAuditLog),
  }
}

export async function getInvoice(id: string) {
  await ensureDatabaseReady()
  await ensureDemoCompany()

  const invoices = await query<InvoiceRow>(
    "SELECT id, number, client_id, issue_date::text, due_date::text, status, tax_rate::text FROM invoices WHERE id = $1 AND company_id = $2",
    [id, DEFAULT_COMPANY_ID],
  )
  if (!invoices.rows[0]) return null

  const items = await query<InvoiceItemRow>(
    "SELECT invoice_id, id, description, quantity::text, unit_price::text FROM invoice_items WHERE invoice_id = $1 ORDER BY created_at, id",
    [id],
  )

  return mapInvoices(invoices.rows, items.rows)[0]
}

export async function getJournalEntry(id: string) {
  await ensureDatabaseReady()
  await ensureDemoCompany()

  const entries = await query<JournalEntryRow>(
    "SELECT id, date::text, description, reference, status, posted_at::text, reversed_journal_entry_id, adjusted_journal_entry_id FROM journal_entries WHERE id = $1 AND company_id = $2",
    [id, DEFAULT_COMPANY_ID],
  )
  if (!entries.rows[0]) return null

  const lines = await query<JournalLineRow>(
    "SELECT journal_entry_id, account_id, debit::text, credit::text FROM journal_lines WHERE journal_entry_id = $1 ORDER BY created_at, id",
    [id],
  )

  return mapJournalEntries(entries.rows, lines.rows)[0]
}

export async function createAccount(account: Omit<Account, "id">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  const id = account.code
  await query(
    "INSERT INTO accounts (id, company_id, code, name, type) VALUES ($1, $2, $3, $4, $5)",
    [id, DEFAULT_COMPANY_ID, account.code, account.name, account.type],
  )
  return { ...account, id }
}

export async function createContact(contact: Omit<Contact, "id">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  const id = `c-${randomUUID()}`
  await query(
    "INSERT INTO contacts (id, company_id, name, type, email, phone, tax_id, credit_limit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [
      id,
      DEFAULT_COMPANY_ID,
      contact.name,
      contact.type,
      contact.email,
      contact.phone ?? null,
      contact.taxId ?? null,
      contact.creditLimit ?? null,
    ],
  )
  return { ...contact, id }
}

export async function createStockItem(item: Omit<StockItem, "id">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  const id = `item-${randomUUID()}`
  await query(
    `INSERT INTO inventory_items (
      id,
      company_id,
      sku,
      name,
      description,
      item_type,
      uom,
      category,
      status,
      valuation_method,
      default_sales_account_id,
      default_inventory_account_id,
      default_cogs_account_id,
      reorder_level
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      DEFAULT_COMPANY_ID,
      item.sku,
      item.name,
      item.description,
      item.itemType,
      item.uom,
      item.category,
      item.status,
      item.costingMethod,
      item.defaultSalesAccountId ?? null,
      item.defaultInventoryAccountId ?? null,
      item.defaultCogsAccountId ?? null,
      item.reorderLevel,
    ],
  )
  return { ...item, id }
}

export async function createWarehouse(warehouse: Omit<Warehouse, "id">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  const id = `wh-${randomUUID()}`
  await query(
    "INSERT INTO warehouses (id, company_id, code, name, status) VALUES ($1, $2, $3, $4, $5)",
    [id, DEFAULT_COMPANY_ID, warehouse.code, warehouse.name, warehouse.status],
  )
  return { ...warehouse, id }
}

export async function updateStockItem(id: string, item: Omit<StockItem, "id">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  await query(
    `UPDATE inventory_items
     SET
      sku = $1,
      name = $2,
      description = $3,
      item_type = $4,
      uom = $5,
      category = $6,
      status = $7,
      valuation_method = $8,
      default_sales_account_id = $9,
      default_inventory_account_id = $10,
      default_cogs_account_id = $11,
      reorder_level = $12,
      updated_at = NOW()
     WHERE id = $13 AND company_id = $14`,
    [
      item.sku,
      item.name,
      item.description,
      item.itemType,
      item.uom,
      item.category,
      item.status,
      item.costingMethod,
      item.defaultSalesAccountId ?? null,
      item.defaultInventoryAccountId ?? null,
      item.defaultCogsAccountId ?? null,
      item.reorderLevel,
      id,
      DEFAULT_COMPANY_ID,
    ],
  )
  return { ...item, id }
}

export async function updateWarehouse(id: string, warehouse: Omit<Warehouse, "id">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  await query(
    "UPDATE warehouses SET code = $1, name = $2, status = $3, updated_at = NOW() WHERE id = $4 AND company_id = $5",
    [warehouse.code, warehouse.name, warehouse.status, id, DEFAULT_COMPANY_ID],
  )
  return { ...warehouse, id }
}

export async function createOpeningStock(input: OpeningStockInput) {
  await ensureDatabaseReady()
  await ensureDemoCompany()

  if (!input.itemId || !input.warehouseId) throw new Error("Item and warehouse are required.")
  if (!input.movementDate) throw new Error("Movement date is required.")
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Quantity must be greater than zero.")
  if (!Number.isFinite(input.unitCost) || input.unitCost < 0) throw new Error("Unit cost must be zero or greater.")

  const item = await query<{ id: string; status: StockItem["status"] }>(
    "SELECT id, status FROM inventory_items WHERE id = $1 AND company_id = $2",
    [input.itemId, DEFAULT_COMPANY_ID],
  )
  if (!item.rows[0]) throw new Error("Stock item was not found.")
  if (item.rows[0].status !== "active") throw new Error("Opening stock can only be added for active items.")

  const warehouse = await query<{ id: string; status: Warehouse["status"] }>(
    "SELECT id, status FROM warehouses WHERE id = $1 AND company_id = $2",
    [input.warehouseId, DEFAULT_COMPANY_ID],
  )
  if (!warehouse.rows[0]) throw new Error("Warehouse was not found.")
  if (warehouse.rows[0].status !== "active") throw new Error("Opening stock can only be added to active warehouses.")

  await transaction(async (client) => {
    const movementCount = await exec(client, "SELECT COUNT(*) AS count FROM stock_movements WHERE company_id = $1", [DEFAULT_COMPANY_ID])
    const movementNo = `STK-OPEN-${String(Number(movementCount.rows[0]?.count ?? 0) + 1).padStart(4, "0")}`
    const movementId = `stm-${randomUUID()}`
    const totalCost = Math.round(input.quantity * input.unitCost * 100) / 100
    const postedAt = new Date().toISOString()

    await exec(
      client,
      `INSERT INTO stock_movements (
        id,
        company_id,
        movement_no,
        movement_type,
        movement_date,
        source_type,
        status,
        posted_at,
        created_by
      ) VALUES ($1, $2, $3, 'opening', $4, 'manual_opening', 'posted', $5, $6)`,
      [movementId, DEFAULT_COMPANY_ID, movementNo, input.movementDate, postedAt, DEFAULT_USER_ID],
    )

    await exec(
      client,
      `INSERT INTO stock_movement_lines (
        id,
        stock_movement_id,
        item_id,
        warehouse_id,
        quantity_in,
        quantity_out,
        unit_cost,
        total_cost,
        memo
      ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)`,
      [`stml-${randomUUID()}`, movementId, input.itemId, input.warehouseId, input.quantity, input.unitCost, totalCost, input.memo?.trim() || null],
    )

    const existing = await exec(
      client,
      "SELECT id, quantity_on_hand::text, inventory_value::text FROM stock_balances WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3",
      [DEFAULT_COMPANY_ID, input.itemId, input.warehouseId],
    )
    const existingBalance = existing.rows[0] as { id: string; quantity_on_hand: string; inventory_value: string } | undefined
    const nextQuantity = (existingBalance ? Number(existingBalance.quantity_on_hand) : 0) + input.quantity
    const nextValue = (existingBalance ? Number(existingBalance.inventory_value) : 0) + totalCost
    const nextAverage = nextQuantity === 0 ? 0 : Math.round((nextValue / nextQuantity) * 100) / 100

    if (existingBalance) {
      await exec(
        client,
        `UPDATE stock_balances
         SET quantity_on_hand = $1, inventory_value = $2, average_unit_cost = $3, updated_at = NOW()
         WHERE id = $4`,
        [nextQuantity, nextValue, nextAverage, existingBalance.id],
      )
    } else {
      await exec(
        client,
        `INSERT INTO stock_balances (
          id,
          company_id,
          item_id,
          warehouse_id,
          quantity_on_hand,
          inventory_value,
          average_unit_cost
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`stb-${randomUUID()}`, DEFAULT_COMPANY_ID, input.itemId, input.warehouseId, nextQuantity, nextValue, nextAverage],
      )
    }
  })

  return listAccountingData()
}

export async function createJournalEntry(entry: Omit<JournalEntry, "id">, confirmation: ConfirmationMetadata) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  validateConfirmation(confirmation, POST_CONFIRMATION_PHRASE)
  const journalEntry: JournalEntry = { ...entry, id: `je-${randomUUID()}`, status: "posted", postedAt: new Date().toISOString() }
  await transaction(async (client) => {
    await assertPeriodAllowsPosting(client, journalEntry.date, confirmation, "journal_entry.post", journalEntry.id)
    await insertJournalEntry(client, journalEntry)
    await insertAuditLog(client, "journal_entry.post", "journal_entry", journalEntry.id, confirmation, {
      reference: journalEntry.reference ?? null,
      lineCount: journalEntry.lines.length,
    })
  })
  return journalEntry
}

export async function createDraftJournalEntry(entry: Omit<JournalEntry, "id" | "status" | "postedAt">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  const journalEntry: JournalEntry = { ...entry, id: `je-${randomUUID()}`, status: "draft" }
  await transaction(async (client) => {
    await insertJournalEntry(client, journalEntry)
  })
  return journalEntry
}

export async function updateDraftJournalEntry(id: string, entry: Omit<JournalEntry, "id" | "status" | "postedAt">) {
  await ensureDatabaseReady()
  const existing = await getJournalEntry(id)
  if (!existing) throw new Error("Journal entry was not found.")
  if (existing.status !== "draft") throw new Error("Posted journal entries cannot be edited.")
  if (!isJournalEntryBalanced(entry)) throw new Error("Journal entry is not balanced.")

  const updated: JournalEntry = { ...entry, id, status: "draft" }
  await transaction(async (client) => {
    await exec(
      client,
      "UPDATE journal_entries SET date = $1, description = $2, reference = $3, updated_at = NOW() WHERE id = $4 AND company_id = $5 AND status = 'draft'",
      [updated.date, updated.description, updated.reference ?? null, id, DEFAULT_COMPANY_ID],
    )
    await exec(client, "DELETE FROM journal_lines WHERE journal_entry_id = $1", [id])
    for (const [index, line] of updated.lines.entries()) {
      await exec(
        client,
        "INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, $4, $5)",
        [`${id}-line-${index + 1}`, id, line.accountId, line.debit, line.credit],
      )
    }
  })
  return updated
}

export async function postDraftJournalEntry(id: string, confirmation: ConfirmationMetadata) {
  await ensureDatabaseReady()
  validateConfirmation(confirmation, POST_CONFIRMATION_PHRASE)
  const existing = await getJournalEntry(id)
  if (!existing) throw new Error("Journal entry was not found.")
  if (existing.status !== "draft") throw new Error("Only draft journal entries can be posted through this action.")

  const postedAt = new Date().toISOString()
  const posted: JournalEntry = { ...existing, status: "posted", postedAt }
  await transaction(async (client) => {
    await assertPeriodAllowsPosting(client, existing.date, confirmation, "journal_entry.draft.post", id)
    await exec(client, "UPDATE journal_entries SET status = 'posted', posted_at = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3", [
      postedAt,
      id,
      DEFAULT_COMPANY_ID,
    ])
    await insertAuditLog(client, "journal_entry.draft.post", "journal_entry", id, confirmation, {
      reference: existing.reference ?? null,
      lineCount: existing.lines.length,
    })
  })
  return posted
}

export async function deleteJournalEntry(id: string) {
  await ensureDatabaseReady()
  throw new Error("Posted journal entries cannot be deleted. Create a reversing entry instead.")
}

export async function reverseJournalEntry(id: string, confirmation: ConfirmationMetadata) {
  await ensureDatabaseReady()
  validateConfirmation(confirmation, REVERSE_CONFIRMATION_PHRASE, { requireReason: true })

  const original = await getJournalEntry(id)
  if (!original) {
    throw new Error("Journal entry was not found.")
  }

  if (original.status !== "posted") {
    throw new Error("Only posted journal entries can be reversed.")
  }

  const journalEntry: JournalEntry = { ...buildReversingEntry(original), id: `je-${randomUUID()}`, postedAt: new Date().toISOString() }
  await transaction(async (client) => {
    await assertPeriodAllowsPosting(client, journalEntry.date, confirmation, "journal_entry.reverse", journalEntry.id)
    await insertJournalEntry(client, journalEntry)
    await insertAuditLog(client, "journal_entry.reverse", "journal_entry", journalEntry.id, confirmation, {
      originalJournalEntryId: original.id,
      originalReference: original.reference ?? null,
      reversalReference: journalEntry.reference ?? null,
    })
  })
  return journalEntry
}

export async function createAdjustmentJournalEntry(originalId: string, entry: Omit<JournalEntry, "id">, confirmation: ConfirmationMetadata) {
  await ensureDatabaseReady()
  validateConfirmation(confirmation, ADJUST_CONFIRMATION_PHRASE, { requireReason: true })
  const original = await getJournalEntry(originalId)
  if (!original) throw new Error("Original journal entry was not found.")
  if (original.status !== "posted") throw new Error("Only posted journal entries can be adjusted.")

  const adjusted: JournalEntry = {
    ...buildAdjustingEntry(entry, originalId),
    id: `je-${randomUUID()}`,
    postedAt: new Date().toISOString(),
  }
  await transaction(async (client) => {
    await assertPeriodAllowsPosting(client, adjusted.date, confirmation, "journal_entry.adjust", adjusted.id)
    await insertJournalEntry(client, adjusted)
    await insertAuditLog(client, "journal_entry.adjust", "journal_entry", adjusted.id, confirmation, {
      originalJournalEntryId: original.id,
      originalReference: original.reference ?? null,
      adjustmentReference: adjusted.reference ?? null,
    })
  })
  return adjusted
}

export async function createInvoice(invoice: Omit<Invoice, "id" | "number">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  const invoiceCount = await query<{ count: string }>("SELECT COUNT(*) AS count FROM invoices WHERE company_id = $1", [DEFAULT_COMPANY_ID])
  const number = `INV-2026-${String(Number(invoiceCount.rows[0]?.count ?? 0) + 1).padStart(3, "0")}`
  const created: Invoice = { ...invoice, id: `inv-${randomUUID()}`, number }
  await transaction(async (client) => {
    await insertInvoice(client, created)
    if (created.status !== "draft") {
      await ensurePostingAccounts(client)
      await insertJournalEntry(client, invoicePostingEntry(created))
    }
    if (created.status === "paid") {
      await createReceiptForInvoice(client, created, invoiceTotalAmount(created).total, created.issueDate)
    }
  })
  return created
}

export async function createVendorBill(bill: Omit<VendorBill, "id" | "billNumber">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  const vendor = await query<{ id: string }>("SELECT id FROM contacts WHERE id = $1 AND company_id = $2 AND type = 'vendor'", [
    bill.vendorId,
    DEFAULT_COMPANY_ID,
  ])
  if (!vendor.rows[0]) throw new Error("AP vendor was not found.")

  const billCount = await query<{ count: string }>("SELECT COUNT(*) AS count FROM vendor_bills WHERE company_id = $1", [DEFAULT_COMPANY_ID])
  const billNumber = `BILL-2026-${String(Number(billCount.rows[0]?.count ?? 0) + 1).padStart(3, "0")}`
  const created: VendorBill = { ...bill, id: `vb-${randomUUID()}`, billNumber }
  await transaction(async (client) => {
    await insertVendorBill(client, created)
    if (created.status !== "draft" && created.status !== "void") {
      await ensurePostingAccounts(client)
      await insertJournalEntry(client, vendorBillPostingEntry(created))
    }
    if (created.status === "paid") {
      await createPaymentVoucherForBill(client, created.id, created.totalAmount, created.billDate)
    }
  })
  return created
}

export async function createReceipt(receipt: Omit<Receipt, "id" | "receiptNumber" | "status">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  if (!receipt.receiptDate) throw new Error("Receipt date is required.")
  if (!Number.isFinite(receipt.amount) || receipt.amount <= 0) throw new Error("Receipt amount must be greater than zero.")

  const receiptCount = await query<{ count: string }>("SELECT COUNT(*) AS count FROM receipts WHERE company_id = $1", [DEFAULT_COMPANY_ID])
  const created: Receipt = {
    ...receipt,
    id: `rcpt-${randomUUID()}`,
    receiptNumber: `RCPT-2026-${String(Number(receiptCount.rows[0]?.count ?? 0) + 1).padStart(3, "0")}`,
    status: "posted",
  }

  await transaction(async (client) => {
    await ensurePostingAccounts(client)
    const journalEntry = receiptPostingEntry(created)
    created.journalEntryId = journalEntry.id
    await insertJournalEntry(client, journalEntry)
    await insertReceipt(client, created)
    if (created.invoiceId) {
      await insertPaymentAllocation(client, {
        id: `alloc-${randomUUID()}`,
        sourceType: "receipt",
        sourceId: created.id,
        targetType: "invoice",
        targetId: created.invoiceId,
        amount: created.amount,
        allocatedAt: `${created.receiptDate}T00:00:00.000Z`,
      })

      const invoice = await getInvoice(created.invoiceId)
      if (invoice) {
        const allocated = await exec(
          client,
          "SELECT COALESCE(SUM(amount), 0)::text AS amount FROM payment_allocations WHERE company_id = $1 AND target_type = 'invoice' AND target_id = $2",
          [DEFAULT_COMPANY_ID, created.invoiceId],
        )
        const allocatedAmount = Number((allocated.rows[0] as { amount: string } | undefined)?.amount ?? 0)
        const nextStatus = allocatedAmount >= invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * (1 + invoice.taxRate / 100) ? "paid" : "sent"
        await exec(client, "UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3", [nextStatus, created.invoiceId, DEFAULT_COMPANY_ID])
      }
    }
  })

  return listAccountingData()
}

export async function createPaymentVoucher(voucher: Omit<PaymentVoucher, "id" | "voucherNumber" | "status">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  if (!voucher.paymentDate) throw new Error("Payment date is required.")
  if (!Number.isFinite(voucher.amount) || voucher.amount <= 0) throw new Error("Payment amount must be greater than zero.")

  const voucherCount = await query<{ count: string }>("SELECT COUNT(*) AS count FROM payment_vouchers WHERE company_id = $1", [DEFAULT_COMPANY_ID])
  const created: PaymentVoucher = {
    ...voucher,
    id: `pv-${randomUUID()}`,
    voucherNumber: `PV-2026-${String(Number(voucherCount.rows[0]?.count ?? 0) + 1).padStart(3, "0")}`,
    status: "posted",
  }

  await transaction(async (client) => {
    await ensurePostingAccounts(client)
    const journalEntry = paymentVoucherPostingEntry(created)
    created.journalEntryId = journalEntry.id
    await insertJournalEntry(client, journalEntry)
    await insertPaymentVoucher(client, created)
    if (created.vendorBillId) {
      await insertPaymentAllocation(client, {
        id: `alloc-${randomUUID()}`,
        sourceType: "payment_voucher",
        sourceId: created.id,
        targetType: "vendor_bill",
        targetId: created.vendorBillId,
        amount: created.amount,
        allocatedAt: `${created.paymentDate}T00:00:00.000Z`,
      })

      const billResult = await exec(
        client,
        "SELECT total_amount::text FROM vendor_bills WHERE id = $1 AND company_id = $2",
        [created.vendorBillId, DEFAULT_COMPANY_ID],
      )
      const bill = billResult.rows[0] as { total_amount: string } | undefined
      if (bill) {
        const allocated = await exec(
          client,
          "SELECT COALESCE(SUM(amount), 0)::text AS amount FROM payment_allocations WHERE company_id = $1 AND target_type = 'vendor_bill' AND target_id = $2",
          [DEFAULT_COMPANY_ID, created.vendorBillId],
        )
        const allocatedAmount = Number((allocated.rows[0] as { amount: string } | undefined)?.amount ?? 0)
        const nextStatus = allocatedAmount >= Number(bill.total_amount) ? "paid" : "partially_paid"
        await exec(client, "UPDATE vendor_bills SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3", [nextStatus, created.vendorBillId, DEFAULT_COMPANY_ID])
      }
    }
  })

  return listAccountingData()
}

async function allocatedAmount(db: DbExecutor, targetType: PaymentAllocation["targetType"], targetId: string) {
  const result = await exec(
    db,
    "SELECT COALESCE(SUM(amount), 0)::text AS amount FROM payment_allocations WHERE company_id = $1 AND target_type = $2 AND target_id = $3",
    [DEFAULT_COMPANY_ID, targetType, targetId],
  )
  return Number((result.rows[0] as { amount: string } | undefined)?.amount ?? 0)
}

async function createReceiptForInvoice(db: DbExecutor, invoice: Invoice, amount: number, receiptDate: string) {
  const roundedAmount = roundMoney(amount)
  if (roundedAmount <= 0) return null

  await ensurePostingAccounts(db)
  const receiptCount = await exec(db, "SELECT COUNT(*) AS count FROM receipts WHERE company_id = $1", [DEFAULT_COMPANY_ID])
  const receipt: Receipt = {
    id: `rcpt-${randomUUID()}`,
    invoiceId: invoice.id,
    journalEntryId: `je-rcpt-${randomUUID()}`,
    receiptNumber: `RCPT-2026-${String(Number((receiptCount.rows[0] as { count: string } | undefined)?.count ?? 0) + 1).padStart(3, "0")}`,
    receiptDate,
    amount: roundedAmount,
    status: "posted",
  }

  await insertJournalEntry(db, receiptPostingEntry(receipt))
  await insertReceipt(db, receipt)
  await insertPaymentAllocation(db, {
    id: `alloc-${randomUUID()}`,
    sourceType: "receipt",
    sourceId: receipt.id,
    targetType: "invoice",
    targetId: invoice.id,
    amount: roundedAmount,
    allocatedAt: `${receiptDate}T00:00:00.000Z`,
  })
  return receipt
}

async function createPaymentVoucherForBill(db: DbExecutor, vendorBillId: string, amount: number, paymentDate: string) {
  const roundedAmount = roundMoney(amount)
  if (roundedAmount <= 0) return null

  await ensurePostingAccounts(db)
  const voucherCount = await exec(db, "SELECT COUNT(*) AS count FROM payment_vouchers WHERE company_id = $1", [DEFAULT_COMPANY_ID])
  const voucher: PaymentVoucher = {
    id: `pv-${randomUUID()}`,
    vendorBillId,
    journalEntryId: `je-pv-${randomUUID()}`,
    voucherNumber: `PV-2026-${String(Number((voucherCount.rows[0] as { count: string } | undefined)?.count ?? 0) + 1).padStart(3, "0")}`,
    paymentDate,
    amount: roundedAmount,
    status: "posted",
  }

  await insertJournalEntry(db, paymentVoucherPostingEntry(voucher))
  await insertPaymentVoucher(db, voucher)
  await insertPaymentAllocation(db, {
    id: `alloc-${randomUUID()}`,
    sourceType: "payment_voucher",
    sourceId: voucher.id,
    targetType: "vendor_bill",
    targetId: vendorBillId,
    amount: roundedAmount,
    allocatedAt: `${paymentDate}T00:00:00.000Z`,
  })
  return voucher
}

const WORKFLOW_PREFIX: Record<WorkflowDocument["documentType"], string> = {
  quotation: "QT",
  sales_order: "SO",
  delivery_order: "DO",
  purchase_requisition: "PR",
  purchase_order: "PO",
  goods_received_note: "GRN",
}

function normalizeWorkflowLines(lines: WorkflowDocumentLine[] | undefined): WorkflowDocumentLine[] {
  const normalized = (lines ?? []).map((line) => {
    const baseAmount = Number((line.quantity * line.unitPrice).toFixed(2))
    const taxAmount = Number((baseAmount * line.taxRate).toFixed(2))
    return {
      id: line.id || `wf-line-${randomUUID()}`,
      itemId: line.itemId || undefined,
      warehouseId: line.warehouseId || undefined,
      description: line.description.trim(),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      taxAmount,
      lineTotal: Number((baseAmount + taxAmount).toFixed(2)),
    }
  })

  if (normalized.length === 0) throw new Error("At least one document line is required.")
  for (const line of normalized) {
    if (!line.description) throw new Error("Line description is required.")
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error("Line quantity must be greater than zero.")
    if (!Number.isFinite(line.unitPrice) || line.unitPrice < 0) throw new Error("Line unit price must be zero or greater.")
    if (!Number.isFinite(line.taxRate) || line.taxRate < 0) throw new Error("Line tax rate must be zero or greater.")
  }
  return normalized
}

export async function createWorkflowDocument(document: Omit<WorkflowDocument, "id" | "documentNumber">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  if (!document.documentDate) throw new Error("Document date is required.")
  const lines = normalizeWorkflowLines(document.lines)
  const totalAmount = Number(lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2))
  const count = await query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM workflow_documents WHERE company_id = $1 AND document_type = $2",
    [DEFAULT_COMPANY_ID, document.documentType],
  )
  const prefix = WORKFLOW_PREFIX[document.documentType]
  const created: WorkflowDocument = {
    ...document,
    totalAmount,
    lines,
    id: `wf-${randomUUID()}`,
    documentNumber: `${prefix}-2026-${String(Number(count.rows[0]?.count ?? 0) + 1).padStart(3, "0")}`,
  }
  await transaction(async (client) => {
    await insertWorkflowDocument(client, created)
  })
  return created
}

export async function updateWorkflowDocument(id: string, document: Omit<WorkflowDocument, "id" | "documentNumber" | "documentType">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  if (!document.documentDate) throw new Error("Document date is required.")
  const lines = normalizeWorkflowLines(document.lines)
  const totalAmount = Number(lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2))

  const existing = await query<WorkflowDocumentRow>(
    "SELECT id, document_type, document_number, contact_id, status, document_date::text, total_amount::text, source_document_id FROM workflow_documents WHERE id = $1 AND company_id = $2",
    [id, DEFAULT_COMPANY_ID],
  )
  if (!existing.rows[0]) throw new Error("Workflow document was not found.")

  await transaction(async (client) => {
    await exec(
      client,
      `UPDATE workflow_documents
       SET contact_id = $1, status = $2, document_date = $3, total_amount = $4, source_document_id = $5
       WHERE id = $6 AND company_id = $7`,
      [
        document.contactId ?? null,
        document.status,
        document.documentDate,
        totalAmount,
        document.sourceDocumentId ?? null,
        id,
        DEFAULT_COMPANY_ID,
      ],
    )
    await replaceWorkflowDocumentLines(client, id, lines)
  })

  return {
    ...document,
    id,
    documentType: existing.rows[0].document_type,
    documentNumber: existing.rows[0].document_number,
    totalAmount,
    lines,
  }
}

export async function updateWorkflowDocumentStatus(id: string, status: string, confirmation: ConfirmationMetadata) {
  await ensureDatabaseReady()
  validateConfirmation(confirmation, UPDATE_CONFIRMATION_PHRASE)
  const existing = await query<WorkflowDocumentRow>(
    "SELECT id, document_type, document_number, contact_id, status, document_date::text, total_amount::text, source_document_id FROM workflow_documents WHERE id = $1 AND company_id = $2",
    [id, DEFAULT_COMPANY_ID],
  )
  const document = existing.rows[0]
  if (!document) throw new Error("Workflow document was not found.")

  await transaction(async (client) => {
    await exec(client, "UPDATE workflow_documents SET status = $1 WHERE id = $2 AND company_id = $3", [status.trim(), id, DEFAULT_COMPANY_ID])
    await insertAuditLog(client, "workflow_document.status.update", "workflow_document", id, confirmation, {
      fromStatus: document.status,
      toStatus: status,
      documentNumber: document.document_number,
      documentType: document.document_type,
    })
  })
}

function validateFixedAsset(asset: Omit<FixedAsset, "id"> | FixedAsset) {
  if (!asset.assetNumber.trim()) throw new Error("Asset number is required.")
  if (!asset.name.trim()) throw new Error("Asset name is required.")
  if (!asset.purchaseDate) throw new Error("Purchase date is required.")
  if (!Number.isFinite(asset.purchasePrice) || asset.purchasePrice <= 0) throw new Error("Purchase price must be greater than zero.")
  if (!Number.isInteger(asset.usefulLifeMonths) || asset.usefulLifeMonths <= 0) throw new Error("Useful life must be greater than zero months.")
  if (!Number.isFinite(asset.salvageValue) || asset.salvageValue < 0) throw new Error("Salvage value must be zero or greater.")
  if (asset.salvageValue >= asset.purchasePrice) throw new Error("Salvage value must be less than purchase price.")
}

export async function createFixedAsset(asset: Omit<FixedAsset, "id">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  validateFixedAsset(asset)
  const created: FixedAsset = { ...asset, id: `asset-${randomUUID()}` }
  await transaction(async (client) => {
    await insertFixedAsset(client, created)
  })
  return created
}

export async function updateFixedAsset(id: string, asset: Omit<FixedAsset, "id">) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  validateFixedAsset(asset)
  const existing = await query("SELECT id FROM fixed_assets WHERE id = $1 AND company_id = $2", [id, DEFAULT_COMPANY_ID])
  if (!existing.rows[0]) throw new Error("Fixed asset was not found.")
  const updated: FixedAsset = { ...asset, id }
  await transaction(async (client) => {
    await insertFixedAsset(client, updated)
  })
  return updated
}

async function getFixedAssetsAndSchedules() {
  const [assets, schedules] = await Promise.all([
    query<FixedAssetRow>(
      `SELECT id, asset_number, name, purchase_date::text, purchase_price::text, useful_life_months, salvage_value::text, status, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, disposal_date::text, disposal_proceeds::text
       FROM fixed_assets WHERE company_id = $1 ORDER BY asset_number`,
      [DEFAULT_COMPANY_ID],
    ),
    query<DepreciationScheduleRow>(
      "SELECT id, asset_id, period_date::text, depreciation_amount::text, journal_entry_id, status FROM depreciation_schedules WHERE company_id = $1 ORDER BY period_date DESC",
      [DEFAULT_COMPANY_ID],
    ),
  ])
  return { assets: assets.rows.map(mapFixedAsset), schedules: schedules.rows.map(mapDepreciationSchedule) }
}

export async function generateDepreciationSchedules(throughDate: string) {
  await ensureDatabaseReady()
  await ensureDemoCompany()
  if (!throughDate) throw new Error("Through date is required.")
  const { assets, schedules } = await getFixedAssetsAndSchedules()
  await transaction(async (client) => {
    for (const asset of assets) {
      const drafts = buildDepreciationScheduleDrafts(asset, schedules, throughDate)
      for (const draft of drafts) {
        await insertDepreciationSchedule(client, {
          id: `dep-${asset.id}-${draft.periodDate.slice(0, 7)}`,
          ...draft,
          status: "draft",
        })
      }
    }
  })
  return listAccountingData()
}

export async function postDepreciationSchedule(id: string, confirmation: ConfirmationMetadata) {
  await ensureDatabaseReady()
  validateConfirmation(confirmation, UPDATE_CONFIRMATION_PHRASE)
  const scheduleResult = await query<DepreciationScheduleRow>(
    "SELECT id, asset_id, period_date::text, depreciation_amount::text, journal_entry_id, status FROM depreciation_schedules WHERE id = $1 AND company_id = $2",
    [id, DEFAULT_COMPANY_ID],
  )
  const schedule = scheduleResult.rows[0] ? mapDepreciationSchedule(scheduleResult.rows[0]) : null
  if (!schedule) throw new Error("Depreciation schedule was not found.")
  if (schedule.status === "posted") throw new Error("Depreciation schedule is already posted.")
  const assetResult = await query<FixedAssetRow>(
    `SELECT id, asset_number, name, purchase_date::text, purchase_price::text, useful_life_months, salvage_value::text, status, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id, disposal_date::text, disposal_proceeds::text
     FROM fixed_assets WHERE id = $1 AND company_id = $2`,
    [schedule.assetId, DEFAULT_COMPANY_ID],
  )
  const asset = assetResult.rows[0] ? mapFixedAsset(assetResult.rows[0]) : null
  if (!asset) throw new Error("Fixed asset was not found.")
  const expenseAccountId = asset.depreciationExpenseAccountId ?? "5700"
  const accumulatedAccountId = asset.accumulatedDepreciationAccountId ?? "1590"
  const journalEntry: JournalEntry = {
    id: `je-dep-${randomUUID()}`,
    date: schedule.periodDate,
    description: `Depreciation - ${asset.name}`,
    reference: `DEP-${asset.assetNumber}-${schedule.periodDate.slice(0, 7)}`,
    status: "posted",
    lines: [
      { accountId: expenseAccountId, debit: schedule.depreciationAmount, credit: 0 },
      { accountId: accumulatedAccountId, debit: 0, credit: schedule.depreciationAmount },
    ],
  }
  await transaction(async (client) => {
    await assertPeriodAllowsPosting(client, schedule.periodDate, confirmation, "depreciation.post", journalEntry.id)
    await insertJournalEntry(client, journalEntry)
    await exec(client, "UPDATE depreciation_schedules SET status = 'posted', journal_entry_id = $1 WHERE id = $2 AND company_id = $3", [journalEntry.id, id, DEFAULT_COMPANY_ID])
    await insertAuditLog(client, "depreciation.post", "depreciation_schedule", id, confirmation, {
      assetId: asset.id,
      assetNumber: asset.assetNumber,
      depreciationAmount: schedule.depreciationAmount,
    })
  })
  return listAccountingData()
}

export async function previewPeriodClose(periodStart: string, periodEnd: string) {
  const snapshot = await listAccountingData()
  return buildPeriodClosePreview(snapshot.accounts, snapshot.journalEntries, snapshot.depreciationSchedules, periodStart, periodEnd)
}

export async function postPeriodClose(periodStart: string, periodEnd: string, retainedEarningsAccountId: string, confirmation: ConfirmationMetadata) {
  await ensureDatabaseReady()
  validateConfirmation(confirmation, UPDATE_CONFIRMATION_PHRASE)
  const preview = await previewPeriodClose(periodStart, periodEnd)
  if (!preview.trialBalanceBalanced) throw new Error("Trial balance is not balanced.")
  if (preview.draftDepreciationCount > 0) throw new Error("Post draft depreciation schedules before closing.")
  if (preview.alreadyClosed) throw new Error("This period is already closed.")
  const closingLines = preview.lines.map((line) => line.accountId === DEFAULT_RETAINED_EARNINGS_ACCOUNT_ID ? { ...line, accountId: retainedEarningsAccountId } : line)
  const journalEntry: JournalEntry = {
    id: `je-close-${randomUUID()}`,
    date: periodEnd,
    description: `Period close ${periodStart} to ${periodEnd}`,
    reference: `CLOSE-${periodStart}-${periodEnd}`,
    status: "posted",
    lines: closingLines,
  }
  await transaction(async (client) => {
    await assertPeriodAllowsPosting(client, periodEnd, confirmation, "period_close.post", journalEntry.id)
    await insertJournalEntry(client, journalEntry)
    await exec(
      client,
      `INSERT INTO retained_earnings_closing_runs (id, company_id, status, revenue_total, expense_total, net_income, journal_entry_id, period_start, period_end, closed_at, created_by)
       VALUES ($1, $2, 'posted', $3, $4, $5, $6, $7, $8, NOW(), $9)`,
      [`close-${randomUUID()}`, DEFAULT_COMPANY_ID, preview.revenueTotal, preview.expenseTotal, preview.netIncome, journalEntry.id, periodStart, periodEnd, DEFAULT_USER_ID],
    )
    await insertAuditLog(client, "period_close.post", "retained_earnings_closing_run", journalEntry.id, confirmation, {
      periodStart,
      periodEnd,
      netIncome: preview.netIncome,
    })
  })
  return listAccountingData()
}

export async function updateInvoiceStatus(id: string, status: Invoice["status"], confirmation: ConfirmationMetadata) {
  await ensureDatabaseReady()
  validateConfirmation(confirmation, UPDATE_CONFIRMATION_PHRASE)
  const existing = await getInvoice(id)
  if (!existing) {
    throw new Error("Invoice was not found.")
  }

  await transaction(async (client) => {
    if (existing.status === "draft" && status !== "draft") {
      await ensurePostingAccounts(client)
      await insertJournalEntry(client, invoicePostingEntry({ ...existing, status }))
    }
    if (status === "paid") {
      const amounts = invoiceTotalAmount(existing)
      const alreadyAllocated = await allocatedAmount(client, "invoice", id)
      const remaining = roundMoney(amounts.total - alreadyAllocated)
      await createReceiptForInvoice(client, existing, remaining, new Date().toISOString().slice(0, 10))
    }
    await exec(client, "UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3", [status, id, DEFAULT_COMPANY_ID])
    await insertAuditLog(client, "invoice.status.update", "invoice", id, confirmation, {
      fromStatus: existing.status,
      toStatus: status,
      invoiceNumber: existing.number,
    })
  })
}

export async function updateVendorBillStatus(id: string, status: VendorBill["status"], confirmation: ConfirmationMetadata) {
  await ensureDatabaseReady()
  validateConfirmation(confirmation, UPDATE_CONFIRMATION_PHRASE)
  const existing = await query<VendorBillRow>(
    "SELECT id, vendor_id, bill_number, bill_date::text, due_date::text, status, subtotal::text, tax_amount::text, total_amount::text FROM vendor_bills WHERE id = $1 AND company_id = $2",
    [id, DEFAULT_COMPANY_ID],
  )
  const bill = existing.rows[0]
  if (!bill) throw new Error("Vendor bill was not found.")

  await transaction(async (client) => {
    const mappedBill = mapVendorBill(bill)
    if (mappedBill.status === "draft" && status !== "draft" && status !== "void") {
      await ensurePostingAccounts(client)
      await insertJournalEntry(client, vendorBillPostingEntry({ ...mappedBill, status }))
    }
    if (status === "paid") {
      const alreadyAllocated = await allocatedAmount(client, "vendor_bill", id)
      const remaining = roundMoney(mappedBill.totalAmount - alreadyAllocated)
      await createPaymentVoucherForBill(client, id, remaining, new Date().toISOString().slice(0, 10))
    }
    await exec(client, "UPDATE vendor_bills SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3", [status, id, DEFAULT_COMPANY_ID])
    await insertAuditLog(client, "vendor_bill.status.update", "vendor_bill", id, confirmation, {
      fromStatus: bill.status,
      toStatus: status,
      billNumber: bill.bill_number,
    })
  })
}
