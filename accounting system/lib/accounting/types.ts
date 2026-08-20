export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense"

// Debit-normal: asset, expense. Credit-normal: liability, equity, revenue.
export const NORMAL_BALANCE: Record<AccountType, "debit" | "credit"> = {
  asset: "debit",
  expense: "debit",
  liability: "credit",
  equity: "credit",
  revenue: "credit",
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
}

export interface Account {
  id: string
  code: string
  name: string
  type: AccountType
}

export interface JournalLine {
  accountId: string
  debit: number
  credit: number
}

export type JournalEntryStatus = "draft" | "posted"

export interface JournalEntry {
  id: string
  date: string // ISO yyyy-mm-dd
  description: string
  reference?: string
  status?: JournalEntryStatus
  postedAt?: string
  reversedJournalEntryId?: string
  adjustedJournalEntryId?: string
  lines: JournalLine[]
}

export type ContactType = "client" | "vendor"

export interface Contact {
  id: string
  name: string
  type: ContactType
  email: string
  phone?: string
  taxId?: string
  creditLimit?: number
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue"

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
}

export interface InvoiceLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

export interface Invoice {
  id: string
  number: string
  clientId: string
  issueDate: string
  dueDate: string
  status: InvoiceStatus
  taxRate: number // percentage, e.g. 6 for 6%
  items: InvoiceLineItem[]
}

export type VendorBillStatus = "draft" | "open" | "paid" | "void" | "overdue" | "partially_paid"

export const VENDOR_BILL_STATUS_LABEL: Record<VendorBillStatus, string> = {
  draft: "Draft",
  open: "Open",
  partially_paid: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
}

export interface VendorBill {
  id: string
  vendorId: string
  billNumber: string
  billDate: string
  dueDate: string
  status: VendorBillStatus
  subtotal: number
  taxAmount: number
  totalAmount: number
}

export type ReceiptStatus = "draft" | "posted" | "void"
export type PaymentVoucherStatus = "draft" | "posted" | "void"
export type AllocationSourceType = "receipt" | "payment_voucher"
export type AllocationTargetType = "invoice" | "vendor_bill"

export interface Receipt {
  id: string
  invoiceId?: string
  journalEntryId?: string
  receiptNumber: string
  receiptDate: string
  amount: number
  status: ReceiptStatus
}

export interface PaymentVoucher {
  id: string
  vendorBillId?: string
  journalEntryId?: string
  voucherNumber: string
  paymentDate: string
  amount: number
  status: PaymentVoucherStatus
}

export interface PaymentAllocation {
  id: string
  sourceType: AllocationSourceType
  sourceId: string
  targetType: AllocationTargetType
  targetId: string
  amount: number
  allocatedAt: string
}

export type WorkflowDocumentType =
  | "quotation"
  | "sales_order"
  | "delivery_order"
  | "purchase_requisition"
  | "purchase_order"
  | "goods_received_note"

export interface WorkflowDocument {
  id: string
  documentType: WorkflowDocumentType
  documentNumber: string
  contactId?: string
  status: string
  documentDate: string
  totalAmount: number
  sourceDocumentId?: string
  lines: WorkflowDocumentLine[]
}

export interface WorkflowDocumentLine {
  id: string
  itemId?: string
  warehouseId?: string
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  taxAmount: number
  lineTotal: number
}

export type StockItemStatus = "active" | "inactive"
export type StockCostingMethod = "fifo" | "weighted_average"

export interface StockItem {
  id: string
  sku: string
  name: string
  description: string
  itemType: string
  uom: string
  category: string
  status: StockItemStatus
  costingMethod: StockCostingMethod
  defaultSalesAccountId?: string
  defaultInventoryAccountId?: string
  defaultCogsAccountId?: string
  reorderLevel: number
}

export interface Warehouse {
  id: string
  code: string
  name: string
  status: StockItemStatus
}

export type StockMovementType = "opening" | "purchase_receipt" | "sales_delivery" | "adjustment_in" | "adjustment_out" | "transfer"
export type StockMovementStatus = "draft" | "posted" | "voided"

export interface StockMovementLine {
  id: string
  itemId: string
  warehouseId: string
  quantityIn: number
  quantityOut: number
  unitCost: number
  totalCost: number
  memo?: string
}

export interface StockMovement {
  id: string
  movementNo: string
  movementType: StockMovementType
  movementDate: string
  sourceType?: string
  sourceId?: string
  status: StockMovementStatus
  postedAt?: string
  lines: StockMovementLine[]
}

export interface StockBalance {
  id: string
  itemId: string
  warehouseId: string
  quantityOnHand: number
  inventoryValue: number
  averageUnitCost: number
}

export interface OpeningStockInput {
  itemId: string
  warehouseId: string
  movementDate: string
  quantity: number
  unitCost: number
  memo?: string
}

export interface FixedAsset {
  id: string
  assetNumber: string
  name: string
  purchaseDate: string
  purchasePrice: number
  usefulLifeMonths: number
  salvageValue: number
  status: "active" | "disposed" | "retired"
  assetAccountId?: string
  accumulatedDepreciationAccountId?: string
  depreciationExpenseAccountId?: string
  disposalDate?: string
  disposalProceeds?: number
}

export interface DepreciationSchedule {
  id: string
  assetId: string
  periodDate: string
  depreciationAmount: number
  journalEntryId?: string
  status: "draft" | "posted"
}

export interface ReportingPeriod {
  startDate: string
  endDate: string
}

export interface ReportLine {
  accountId: string
  code: string
  name: string
  amount: number
}

export interface ReportSection {
  label: string
  lines: ReportLine[]
  total: number
}

export interface ProfitOrLossReport {
  period: ReportingPeriod
  revenue: ReportSection
  expenses: ReportSection
  depreciationExpense: number
  netProfitLoss: number
}

export interface FinancialPositionReport {
  asOfDate: string
  assets: ReportSection
  liabilities: ReportSection
  equity: ReportSection
  balanced: boolean
}

export interface CashFlowReport {
  period: ReportingPeriod
  operatingActivities: ReportSection
  investingActivities: ReportSection
  financingActivities: ReportSection
  unclassified: ReportLine[]
  netCashMovement: number
  openingCash: number
  closingCash: number
}

export interface EquityChangesReport {
  period: ReportingPeriod
  openingEquity: number
  capitalIntroduced: number
  withdrawals: number
  netProfitLoss: number
  closingEquity: number
}

export interface FinancialStatementNote {
  id: string
  title: string
  rows: Array<{ label: string; amount: number; note?: string }>
}

export interface PeriodClosePreview {
  period: ReportingPeriod
  revenueTotal: number
  expenseTotal: number
  netIncome: number
  trialBalanceBalanced: boolean
  draftDepreciationCount: number
  alreadyClosed: boolean
  lines: JournalLine[]
}

export interface AccountingSnapshot {
  accounts: Account[]
  contacts: Contact[]
  journalEntries: JournalEntry[]
  invoices: Invoice[]
  vendorBills: VendorBill[]
  receipts: Receipt[]
  paymentVouchers: PaymentVoucher[]
  paymentAllocations: PaymentAllocation[]
  workflowDocuments: WorkflowDocument[]
  stockItems: StockItem[]
  warehouses: Warehouse[]
  stockBalances: StockBalance[]
  stockMovements: StockMovement[]
  fixedAssets: FixedAsset[]
  depreciationSchedules: DepreciationSchedule[]
  auditLogs: AuditLog[]
}

export interface AuditLog {
  id: string
  action: string
  entityType: string
  entityId?: string
  impactSummary: string
  reason?: string
  confirmationPhrase?: string
  metadata: Record<string, unknown>
  createdAt: string
}
