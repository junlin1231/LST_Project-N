"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { ConfirmationMetadata } from "./governance"
import type {
  Account,
  AccountingSnapshot,
  AccountType,
  AuditLog,
  Contact,
  DepreciationSchedule,
  FixedAsset,
  Invoice,
  JournalEntry,
  OpeningStockInput,
  PaymentAllocation,
  PaymentVoucher,
  PeriodClosePreview,
  Receipt,
  StockBalance,
  StockItem,
  StockMovement,
  VendorBill,
  Warehouse,
  WorkflowDocument,
} from "./types"
import {
  calculateBalances,
  calculateExpenseBreakdown,
  calculateFinancialSummary,
  calculateMonthlyPoints,
  type AccountBalance,
  type MonthlyPoint,
} from "./calculations"

interface Store {
  accounts: Account[]
  journalEntries: JournalEntry[]
  invoices: Invoice[]
  vendorBills: VendorBill[]
  receipts: Receipt[]
  paymentVouchers: PaymentVoucher[]
  paymentAllocations: PaymentAllocation[]
  workflowDocuments: WorkflowDocument[]
  contacts: Contact[]
  stockItems: StockItem[]
  warehouses: Warehouse[]
  stockBalances: StockBalance[]
  stockMovements: StockMovement[]
  fixedAssets: FixedAsset[]
  depreciationSchedules: DepreciationSchedule[]
  auditLogs: AuditLog[]
  addJournalEntry: (entry: Omit<JournalEntry, "id">, confirmation: ConfirmationMetadata) => void
  addDraftJournalEntry: (entry: Omit<JournalEntry, "id" | "status" | "postedAt">) => void
  updateDraftJournalEntry: (id: string, entry: Omit<JournalEntry, "id" | "status" | "postedAt">) => void
  postDraftJournalEntry: (id: string, confirmation: ConfirmationMetadata) => void
  deleteJournalEntry: (id: string) => void
  reverseJournalEntry: (id: string, confirmation: ConfirmationMetadata) => void
  addAdjustmentJournalEntry: (originalId: string, entry: Omit<JournalEntry, "id">, confirmation: ConfirmationMetadata) => void
  addAccount: (account: Omit<Account, "id">) => void
  addContact: (contact: Omit<Contact, "id">) => void
  addStockItem: (item: Omit<StockItem, "id">) => void
  addWarehouse: (warehouse: Omit<Warehouse, "id">) => void
  addFixedAsset: (asset: Omit<FixedAsset, "id">) => Promise<void>
  updateFixedAsset: (id: string, asset: Omit<FixedAsset, "id">) => Promise<void>
  generateDepreciationSchedules: (throughDate: string) => Promise<void>
  postDepreciationSchedule: (id: string, confirmation: ConfirmationMetadata) => Promise<void>
  previewPeriodClose: (periodStart: string, periodEnd: string) => Promise<PeriodClosePreview>
  postPeriodClose: (periodStart: string, periodEnd: string, retainedEarningsAccountId: string, confirmation: ConfirmationMetadata) => Promise<void>
  updateStockItem: (id: string, item: Omit<StockItem, "id">) => void
  updateWarehouse: (id: string, warehouse: Omit<Warehouse, "id">) => void
  addOpeningStock: (openingStock: OpeningStockInput) => Promise<void>
  addInvoice: (invoice: Omit<Invoice, "id" | "number">) => void
  addVendorBill: (bill: Omit<VendorBill, "id" | "billNumber">) => void
  addReceipt: (receipt: Omit<Receipt, "id" | "receiptNumber" | "status">) => Promise<void>
  addPaymentVoucher: (voucher: Omit<PaymentVoucher, "id" | "voucherNumber" | "status">) => Promise<void>
  addWorkflowDocument: (document: Omit<WorkflowDocument, "id" | "documentNumber">) => void
  updateWorkflowDocument: (id: string, document: Omit<WorkflowDocument, "id" | "documentNumber" | "documentType">) => void
  setWorkflowDocumentStatus: (id: string, status: string, confirmation: ConfirmationMetadata) => void
  setInvoiceStatus: (id: string, status: Invoice["status"], confirmation: ConfirmationMetadata) => void
  setVendorBillStatus: (id: string, status: VendorBill["status"], confirmation: ConfirmationMetadata) => void
  refreshAccountingData: () => Promise<void>
  loadDemoData: () => Promise<void>
  resetSystemData: () => Promise<void>
  // derived
  accountName: (id: string) => string
  balances: AccountBalance[]
  balanceOf: (accountId: string) => number
  totalsByType: Record<AccountType, number>
  totalRevenue: number
  totalExpenses: number
  netIncome: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  cashBalance: number
  arBalance: number
  monthly: MonthlyPoint[]
  expenseBreakdown: { account: Account; amount: number }[]
}

const AccountingContext = createContext<Store | null>(null)

async function fetchAccountingSnapshot(): Promise<AccountingSnapshot> {
  const response = await fetch("/api/accounting", { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Failed to load accounting data: ${response.status}`)
  }
  return response.json()
}

async function postAccountingAction<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/accounting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `Accounting action failed: ${response.status}`)
  }
  return response.json()
}

export function AccountingProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [vendorBills, setVendorBills] = useState<VendorBill[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [paymentVouchers, setPaymentVouchers] = useState<PaymentVoucher[]>([])
  const [paymentAllocations, setPaymentAllocations] = useState<PaymentAllocation[]>([])
  const [workflowDocuments, setWorkflowDocuments] = useState<WorkflowDocument[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [stockBalances, setStockBalances] = useState<StockBalance[]>([])
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([])
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([])
  const [depreciationSchedules, setDepreciationSchedules] = useState<DepreciationSchedule[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])

  const refresh = useCallback(async () => {
    try {
      const snapshot = await fetchAccountingSnapshot()
      setAccounts(snapshot.accounts)
      setJournalEntries(snapshot.journalEntries)
      setInvoices(snapshot.invoices)
      setVendorBills(snapshot.vendorBills)
      setReceipts(snapshot.receipts)
      setPaymentVouchers(snapshot.paymentVouchers)
      setPaymentAllocations(snapshot.paymentAllocations)
      setWorkflowDocuments(snapshot.workflowDocuments)
      setContacts(snapshot.contacts)
      setStockItems(snapshot.stockItems)
      setWarehouses(snapshot.warehouses)
      setStockBalances(snapshot.stockBalances)
      setStockMovements(snapshot.stockMovements)
      setFixedAssets(snapshot.fixedAssets)
      setDepreciationSchedules(snapshot.depreciationSchedules)
      setAuditLogs(snapshot.auditLogs)
    } catch (error) {
      console.error(error)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addJournalEntry = useCallback((entry: Omit<JournalEntry, "id">, confirmation: ConfirmationMetadata) => {
    void postAccountingAction<JournalEntry>({ action: "createJournalEntry", entry, confirmation })
      .then((created) => setJournalEntries((prev) => [created, ...prev]))
      .catch(console.error)
  }, [])

  const addDraftJournalEntry = useCallback((entry: Omit<JournalEntry, "id" | "status" | "postedAt">) => {
    void postAccountingAction<JournalEntry>({ action: "createDraftJournalEntry", entry })
      .then((created) => setJournalEntries((prev) => [created, ...prev]))
      .catch(console.error)
  }, [])

  const updateDraftJournalEntry = useCallback((id: string, entry: Omit<JournalEntry, "id" | "status" | "postedAt">) => {
    void postAccountingAction<JournalEntry>({ action: "updateDraftJournalEntry", id, entry })
      .then((updated) => setJournalEntries((prev) => prev.map((existing) => (existing.id === id ? updated : existing))))
      .catch(console.error)
  }, [])

  const postDraftJournalEntry = useCallback((id: string, confirmation: ConfirmationMetadata) => {
    void postAccountingAction<JournalEntry>({ action: "postDraftJournalEntry", id, confirmation })
      .then((posted) => setJournalEntries((prev) => prev.map((existing) => (existing.id === id ? posted : existing))))
      .catch(console.error)
  }, [])

  const deleteJournalEntry = useCallback((id: string) => {
    void postAccountingAction<{ ok: true }>({ action: "deleteJournalEntry", id })
      .then(() => setJournalEntries((prev) => prev.filter((e) => e.id !== id)))
      .catch(console.error)
  }, [])

  const reverseJournalEntry = useCallback((id: string, confirmation: ConfirmationMetadata) => {
    void postAccountingAction<JournalEntry>({ action: "reverseJournalEntry", id, confirmation })
      .then((created) => setJournalEntries((prev) => [created, ...prev]))
      .catch(console.error)
  }, [])

  const addAdjustmentJournalEntry = useCallback((originalId: string, entry: Omit<JournalEntry, "id">, confirmation: ConfirmationMetadata) => {
    void postAccountingAction<JournalEntry>({ action: "createAdjustmentJournalEntry", originalId, entry, confirmation })
      .then((created) => setJournalEntries((prev) => [created, ...prev]))
      .catch(console.error)
  }, [])

  const addAccount = useCallback((account: Omit<Account, "id">) => {
    void postAccountingAction<Account>({ action: "createAccount", account })
      .then((created) => setAccounts((prev) => [...prev, created]))
      .catch(console.error)
  }, [])

  const addContact = useCallback((contact: Omit<Contact, "id">) => {
    void postAccountingAction<Contact>({ action: "createContact", contact })
      .then((created) => setContacts((prev) => [...prev, created]))
      .catch(console.error)
  }, [])

  const addStockItem = useCallback((item: Omit<StockItem, "id">) => {
    void postAccountingAction<StockItem>({ action: "createStockItem", item })
      .then((created) => setStockItems((prev) => [...prev, created].sort((a, b) => a.sku.localeCompare(b.sku))))
      .catch(console.error)
  }, [])

  const addWarehouse = useCallback((warehouse: Omit<Warehouse, "id">) => {
    void postAccountingAction<Warehouse>({ action: "createWarehouse", warehouse })
      .then((created) => setWarehouses((prev) => [...prev, created].sort((a, b) => a.code.localeCompare(b.code))))
      .catch(console.error)
  }, [])

  const addFixedAssetAction = useCallback(async (asset: Omit<FixedAsset, "id">) => {
    const created = await postAccountingAction<FixedAsset>({ action: "createFixedAsset", asset })
    setFixedAssets((prev) => [...prev, created].sort((a, b) => a.assetNumber.localeCompare(b.assetNumber)))
  }, [])

  const updateFixedAssetAction = useCallback(async (id: string, asset: Omit<FixedAsset, "id">) => {
    const updated = await postAccountingAction<FixedAsset>({ action: "updateFixedAsset", id, asset })
    setFixedAssets((prev) => prev.map((existing) => (existing.id === id ? updated : existing)).sort((a, b) => a.assetNumber.localeCompare(b.assetNumber)))
  }, [])

  const updateStockItemAction = useCallback((id: string, item: Omit<StockItem, "id">) => {
    void postAccountingAction<StockItem>({ action: "updateStockItem", id, item })
      .then((updated) => setStockItems((prev) => prev.map((existing) => (existing.id === id ? updated : existing)).sort((a, b) => a.sku.localeCompare(b.sku))))
      .catch(console.error)
  }, [])

  const updateWarehouseAction = useCallback((id: string, warehouse: Omit<Warehouse, "id">) => {
    void postAccountingAction<Warehouse>({ action: "updateWarehouse", id, warehouse })
      .then((updated) => setWarehouses((prev) => prev.map((existing) => (existing.id === id ? updated : existing)).sort((a, b) => a.code.localeCompare(b.code))))
      .catch(console.error)
  }, [])

  const applySnapshot = useCallback((snapshot: AccountingSnapshot) => {
    setAccounts(snapshot.accounts)
    setJournalEntries(snapshot.journalEntries)
    setInvoices(snapshot.invoices)
    setVendorBills(snapshot.vendorBills)
    setReceipts(snapshot.receipts)
    setPaymentVouchers(snapshot.paymentVouchers)
    setPaymentAllocations(snapshot.paymentAllocations)
    setWorkflowDocuments(snapshot.workflowDocuments)
    setContacts(snapshot.contacts)
    setStockItems(snapshot.stockItems)
    setWarehouses(snapshot.warehouses)
    setStockBalances(snapshot.stockBalances)
    setStockMovements(snapshot.stockMovements)
    setFixedAssets(snapshot.fixedAssets)
    setDepreciationSchedules(snapshot.depreciationSchedules)
    setAuditLogs(snapshot.auditLogs)
  }, [])

  const addInvoice = useCallback((invoice: Omit<Invoice, "id" | "number">) => {
    void postAccountingAction<AccountingSnapshot>({ action: "createInvoice", invoice })
      .then(applySnapshot)
      .catch(console.error)
  }, [applySnapshot])

  const addVendorBill = useCallback((bill: Omit<VendorBill, "id" | "billNumber">) => {
    void postAccountingAction<AccountingSnapshot>({ action: "createVendorBill", bill })
      .then(applySnapshot)
      .catch(console.error)
  }, [applySnapshot])

  const setInvoiceStatus = useCallback((id: string, status: Invoice["status"], confirmation: ConfirmationMetadata) => {
    void postAccountingAction<AccountingSnapshot>({ action: "updateInvoiceStatus", id, status, confirmation })
      .then(applySnapshot)
      .catch(console.error)
  }, [applySnapshot])

  const setVendorBillStatus = useCallback((id: string, status: VendorBill["status"], confirmation: ConfirmationMetadata) => {
    void postAccountingAction<AccountingSnapshot>({ action: "updateVendorBillStatus", id, status, confirmation })
      .then(applySnapshot)
      .catch(console.error)
  }, [applySnapshot])

  const addWorkflowDocument = useCallback((document: Omit<WorkflowDocument, "id" | "documentNumber">) => {
    void postAccountingAction<AccountingSnapshot>({ action: "createWorkflowDocument", document })
      .then(applySnapshot)
      .catch(console.error)
  }, [applySnapshot])

  const setWorkflowDocumentStatus = useCallback((id: string, status: string, confirmation: ConfirmationMetadata) => {
    void postAccountingAction<AccountingSnapshot>({ action: "updateWorkflowDocumentStatus", id, status, confirmation })
      .then(applySnapshot)
      .catch(console.error)
  }, [applySnapshot])

  const updateWorkflowDocument = useCallback((id: string, document: Omit<WorkflowDocument, "id" | "documentNumber" | "documentType">) => {
    void postAccountingAction<AccountingSnapshot>({ action: "updateWorkflowDocument", id, document })
      .then(applySnapshot)
      .catch(console.error)
  }, [applySnapshot])

  const addOpeningStockAction = useCallback(async (openingStock: OpeningStockInput) => {
    const snapshot = await postAccountingAction<AccountingSnapshot>({ action: "createOpeningStock", openingStock })
    applySnapshot(snapshot)
  }, [applySnapshot])

  const addReceiptAction = useCallback(async (receipt: Omit<Receipt, "id" | "receiptNumber" | "status">) => {
    const snapshot = await postAccountingAction<AccountingSnapshot>({ action: "createReceipt", receipt })
    applySnapshot(snapshot)
  }, [applySnapshot])

  const addPaymentVoucherAction = useCallback(async (voucher: Omit<PaymentVoucher, "id" | "voucherNumber" | "status">) => {
    const snapshot = await postAccountingAction<AccountingSnapshot>({ action: "createPaymentVoucher", voucher })
    applySnapshot(snapshot)
  }, [applySnapshot])

  const generateDepreciationSchedulesAction = useCallback(async (throughDate: string) => {
    const snapshot = await postAccountingAction<AccountingSnapshot>({ action: "generateDepreciationSchedules", throughDate })
    applySnapshot(snapshot)
  }, [applySnapshot])

  const postDepreciationScheduleAction = useCallback(async (id: string, confirmation: ConfirmationMetadata) => {
    const snapshot = await postAccountingAction<AccountingSnapshot>({ action: "postDepreciationSchedule", id, confirmation })
    applySnapshot(snapshot)
  }, [applySnapshot])

  const previewPeriodCloseAction = useCallback((periodStart: string, periodEnd: string) => {
    return postAccountingAction<PeriodClosePreview>({ action: "previewPeriodClose", periodStart, periodEnd })
  }, [])

  const postPeriodCloseAction = useCallback(async (periodStart: string, periodEnd: string, retainedEarningsAccountId: string, confirmation: ConfirmationMetadata) => {
    const snapshot = await postAccountingAction<AccountingSnapshot>({ action: "postPeriodClose", periodStart, periodEnd, retainedEarningsAccountId, confirmation })
    applySnapshot(snapshot)
  }, [applySnapshot])

  const loadDemoDataAction = useCallback(async () => {
    const snapshot = await postAccountingAction<AccountingSnapshot>({ action: "loadDemoData" })
    applySnapshot(snapshot)
  }, [applySnapshot])

  const resetSystemDataAction = useCallback(async () => {
    const snapshot = await postAccountingAction<AccountingSnapshot>({ action: "resetSystemData" })
    applySnapshot(snapshot)
  }, [applySnapshot])

  const accountsById = useMemo(() => {
    const map = new Map<string, Account>()
    accounts.forEach((a) => map.set(a.id, a))
    return map
  }, [accounts])

  const accountName = useCallback((id: string) => accountsById.get(id)?.name ?? id, [accountsById])

  const balances = useMemo<AccountBalance[]>(() => calculateBalances(accounts, journalEntries), [accounts, journalEntries])

  const balanceMap = useMemo(() => {
    const map = new Map<string, number>()
    balances.forEach((b) => map.set(b.account.id, b.natural))
    return map
  }, [balances])

  const balanceOf = useCallback((accountId: string) => balanceMap.get(accountId) ?? 0, [balanceMap])

  const summary = useMemo(() => calculateFinancialSummary(balances), [balances])
  const { totalsByType, totalRevenue, totalExpenses, netIncome, totalAssets, totalLiabilities, totalEquity, cashBalance, arBalance } = summary

  const monthly = useMemo<MonthlyPoint[]>(() => calculateMonthlyPoints(accounts, journalEntries), [accounts, journalEntries])

  const expenseBreakdown = useMemo(() => calculateExpenseBreakdown(balances), [balances])

  const value: Store = {
    accounts,
    journalEntries,
    invoices,
    vendorBills,
    receipts,
    paymentVouchers,
    paymentAllocations,
    workflowDocuments,
    contacts,
    stockItems,
    warehouses,
    stockBalances,
    stockMovements,
    fixedAssets,
    depreciationSchedules,
    auditLogs,
    addJournalEntry,
    addDraftJournalEntry,
    updateDraftJournalEntry,
    postDraftJournalEntry,
    deleteJournalEntry,
    reverseJournalEntry,
    addAdjustmentJournalEntry,
    addAccount,
    addContact,
    addStockItem,
    addWarehouse,
    addFixedAsset: addFixedAssetAction,
    updateFixedAsset: updateFixedAssetAction,
    generateDepreciationSchedules: generateDepreciationSchedulesAction,
    postDepreciationSchedule: postDepreciationScheduleAction,
    previewPeriodClose: previewPeriodCloseAction,
    postPeriodClose: postPeriodCloseAction,
    updateStockItem: updateStockItemAction,
    updateWarehouse: updateWarehouseAction,
    addOpeningStock: addOpeningStockAction,
    addInvoice,
    addVendorBill,
    addReceipt: addReceiptAction,
    addPaymentVoucher: addPaymentVoucherAction,
    addWorkflowDocument,
    updateWorkflowDocument,
    setWorkflowDocumentStatus,
    setInvoiceStatus,
    setVendorBillStatus,
    refreshAccountingData: refresh,
    loadDemoData: loadDemoDataAction,
    resetSystemData: resetSystemDataAction,
    accountName,
    balances,
    balanceOf,
    totalsByType,
    totalRevenue,
    totalExpenses,
    netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    cashBalance,
    arBalance,
    monthly,
    expenseBreakdown,
  }

  return <AccountingContext.Provider value={value}>{children}</AccountingContext.Provider>
}

export function useAccounting() {
  const ctx = useContext(AccountingContext)
  if (!ctx) throw new Error("useAccounting must be used within AccountingProvider")
  return ctx
}
