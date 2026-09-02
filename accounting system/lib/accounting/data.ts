import type {
  Account,
  Contact,
  Invoice,
  JournalEntry,
  DepreciationSchedule,
  FixedAsset,
  PaymentAllocation,
  PaymentVoucher,
  Receipt,
  StockItem,
  VendorBill,
  Warehouse,
  WorkflowDocument,
} from "./types"

export const demoAccounts: Account[] = [
  { id: "1000", code: "1000", name: "Cash on Hand", type: "asset" },
  { id: "1010", code: "1010", name: "Bank Account", type: "asset" },
  { id: "1200", code: "1200", name: "Trade Receivables", type: "asset" },
  { id: "1300", code: "1300", name: "Inventory", type: "asset" },
  { id: "1500", code: "1500", name: "Fixed Assets - Equipment", type: "asset" },
  { id: "1590", code: "1590", name: "Accumulated Depreciation", type: "asset" },
  { id: "2000", code: "2000", name: "Accounts Payable", type: "liability" },
  { id: "2100", code: "2100", name: "Tax Payable", type: "liability" },
  { id: "2200", code: "2200", name: "Credit Card Payable", type: "liability" },
  { id: "3000", code: "3000", name: "Paid-in Capital", type: "equity" },
  { id: "3900", code: "3900", name: "Retained Earnings", type: "equity" },
  { id: "4000", code: "4000", name: "Service Revenue", type: "revenue" },
  { id: "4100", code: "4100", name: "Product Sales Revenue", type: "revenue" },
  { id: "5000", code: "5000", name: "Rent Expense", type: "expense" },
  { id: "5100", code: "5100", name: "Salary Expense", type: "expense" },
  { id: "5200", code: "5200", name: "Utilities Expense", type: "expense" },
  { id: "5300", code: "5300", name: "Office Supplies", type: "expense" },
  { id: "5400", code: "5400", name: "Marketing Expense", type: "expense" },
  { id: "5500", code: "5500", name: "Software Subscriptions", type: "expense" },
  { id: "5600", code: "5600", name: "Cost of Goods Sold", type: "expense" },
  { id: "5700", code: "5700", name: "Depreciation Expense", type: "expense" },
  { id: "5800", code: "5800", name: "Meals and Entertainment", type: "expense" },
  { id: "5900", code: "5900", name: "Travel Expense", type: "expense" },
  { id: "5950", code: "5950", name: "Fuel and Transport Expense", type: "expense" },
]

export const demoFixedAssets: FixedAsset[] = [
  {
    id: "asset-001",
    assetNumber: "FA-2026-001",
    name: "Warehouse Packing Equipment",
    purchaseDate: "2026-03-04",
    purchasePrice: 24000,
    usefulLifeMonths: 48,
    salvageValue: 0,
    status: "active",
    assetAccountId: "1500",
    accumulatedDepreciationAccountId: "1590",
    depreciationExpenseAccountId: "5700",
  },
]

export const demoDepreciationSchedules: DepreciationSchedule[] = [
  { id: "dep-asset-001-2026-04", assetId: "asset-001", periodDate: "2026-04-30", depreciationAmount: 500, status: "draft" },
  { id: "dep-asset-001-2026-05", assetId: "asset-001", periodDate: "2026-05-31", depreciationAmount: 500, status: "draft" },
]

export const demoContacts: Contact[] = [
  { id: "c1", name: "Stellar Technology Ltd.", type: "client", email: "billing@stellar.example", phone: "021-5588-1234", taxId: "91310000MA1K2X3Y4Z", addressLines: ["Level 18, Innovation Tower", "88 Century Avenue", "Pudong New Area", "Shanghai 200120"], creditLimit: 120000 },
  { id: "c2", name: "Blue Ocean Design Studio", type: "client", email: "hello@blueocean.example", phone: "010-6688-9900", addressLines: ["Suite 602, Creative Park", "19 Guanghua Road", "Chaoyang District", "Beijing 100020"], creditLimit: 90000 },
  { id: "c3", name: "Horizon Media Group", type: "client", email: "finance@horizon.example", phone: "020-3344-5566", taxId: "91440000MA5A6B7C8D", addressLines: ["Unit 12A, Pearl Media Plaza", "268 Tianhe Road", "Tianhe District", "Guangzhou 510620"], creditLimit: 100000 },
  { id: "c4", name: "Huitong Logistics", type: "client", email: "ap@huitong.example", phone: "0755-2233-4455", addressLines: ["Warehouse Block B", "36 Yantian Port Road", "Yantian District", "Shenzhen 518083"], creditLimit: 95000 },
  { id: "v1", name: "Central Property Leasing", type: "vendor", email: "rent@property.example", phone: "021-8888-0001", addressLines: ["Property Management Office", "388 Huaihai Middle Road", "Huangpu District", "Shanghai 200021"] },
  { id: "v2", name: "Cloud Services Vendor", type: "vendor", email: "invoice@cloudvendor.example", addressLines: ["Billing Department", "12 Cloud Avenue", "Cyberjaya", "Selangor 63000"] },
  { id: "v3", name: "Office Supply Partner", type: "vendor", email: "sales@officesupply.example", phone: "021-7777-2222", addressLines: ["Lot 5, Supply Hub", "66 Minhang Road", "Minhang District", "Shanghai 201100"] },
]

export const demoStockItems: StockItem[] = [
  {
    id: "item-001",
    sku: "LST-ROUTER",
    name: "Logistics Edge Router",
    description: "Network routing device used in warehouse deployment packages.",
    itemType: "stock",
    uom: "unit",
    category: "Hardware",
    status: "active",
    costingMethod: "weighted_average",
    defaultSalesAccountId: "4100",
    defaultInventoryAccountId: "1300",
    defaultCogsAccountId: "5600",
    reorderLevel: 10,
  },
  {
    id: "item-002",
    sku: "LST-SCANNER",
    name: "Warehouse Barcode Scanner",
    description: "Handheld scanner for inventory and delivery workflows.",
    itemType: "stock",
    uom: "unit",
    category: "Hardware",
    status: "active",
    costingMethod: "weighted_average",
    defaultSalesAccountId: "4100",
    defaultInventoryAccountId: "1300",
    defaultCogsAccountId: "5600",
    reorderLevel: 15,
  },
]

export const demoWarehouses: Warehouse[] = [
  { id: "wh-main", code: "MAIN", name: "Main Warehouse", status: "active" },
  { id: "wh-service", code: "SERVICE", name: "Service Stock", status: "active" },
]

export const demoJournalEntries: JournalEntry[] = [
  { id: "je-001", date: "2026-03-01", description: "Owner capital contribution", reference: "OPEN-01", lines: [
    { accountId: "1010", debit: 200000, credit: 0 },
    { accountId: "3000", debit: 0, credit: 200000 },
  ] },
  { id: "je-002", date: "2026-03-04", description: "Purchased office equipment", reference: "PO-1001", lines: [
    { accountId: "1500", debit: 48000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 48000 },
  ] },
  { id: "je-003", date: "2026-03-05", description: "Paid March rent", reference: "RENT-03", lines: [
    { accountId: "5000", debit: 12000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 12000 },
  ] },
  { id: "je-004", date: "2026-03-18", description: "Consulting services for Stellar Technology", reference: "INV-2026-001", lines: [
    { accountId: "1200", debit: 42000, credit: 0 },
    { accountId: "4000", debit: 0, credit: 42000 },
  ] },
  { id: "je-005", date: "2026-03-28", description: "Received payment from Stellar Technology", reference: "RCPT-031", lines: [
    { accountId: "1010", debit: 42000, credit: 0 },
    { accountId: "1200", debit: 0, credit: 42000 },
  ] },
  { id: "je-006", date: "2026-03-31", description: "March payroll", reference: "PAY-03", lines: [
    { accountId: "5100", debit: 36000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 36000 },
  ] },
  { id: "je-007", date: "2026-04-05", description: "Paid April rent", reference: "RENT-04", lines: [
    { accountId: "5000", debit: 12000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 12000 },
  ] },
  { id: "je-008", date: "2026-04-10", description: "Cloud service subscription", reference: "SW-041", lines: [
    { accountId: "5500", debit: 3800, credit: 0 },
    { accountId: "2200", debit: 0, credit: 3800 },
  ] },
  { id: "je-009", date: "2026-04-15", description: "Brand project for Blue Ocean Design", reference: "INV-2026-002", lines: [
    { accountId: "1200", debit: 58000, credit: 0 },
    { accountId: "4000", debit: 0, credit: 58000 },
  ] },
  { id: "je-010", date: "2026-04-22", description: "Product sale", reference: "SALE-041", lines: [
    { accountId: "1010", debit: 26000, credit: 0 },
    { accountId: "4100", debit: 0, credit: 26000 },
  ] },
  { id: "je-011", date: "2026-04-30", description: "April payroll", reference: "PAY-04", lines: [
    { accountId: "5100", debit: 38000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 38000 },
  ] },
  { id: "je-012", date: "2026-04-30", description: "Utilities payment", reference: "UTIL-04", lines: [
    { accountId: "5200", debit: 2400, credit: 0 },
    { accountId: "1010", debit: 0, credit: 2400 },
  ] },
  { id: "je-013", date: "2026-05-05", description: "Paid May rent", reference: "RENT-05", lines: [
    { accountId: "5000", debit: 12000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 12000 },
  ] },
  { id: "je-014", date: "2026-05-12", description: "Marketing services for Horizon Media", reference: "INV-2026-003", lines: [
    { accountId: "1200", debit: 76000, credit: 0 },
    { accountId: "4000", debit: 0, credit: 76000 },
  ] },
  { id: "je-015", date: "2026-05-20", description: "Marketing campaign spend", reference: "MKT-051", lines: [
    { accountId: "5400", debit: 15000, credit: 0 },
    { accountId: "2200", debit: 0, credit: 15000 },
  ] },
  { id: "je-016", date: "2026-05-31", description: "May payroll", reference: "PAY-05", lines: [
    { accountId: "5100", debit: 40000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 40000 },
  ] },
  { id: "je-017", date: "2026-06-05", description: "Paid June rent", reference: "RENT-06", lines: [
    { accountId: "5000", debit: 12000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 12000 },
  ] },
  { id: "je-018", date: "2026-06-14", description: "Product sale", reference: "SALE-061", lines: [
    { accountId: "1010", debit: 34000, credit: 0 },
    { accountId: "4100", debit: 0, credit: 34000 },
  ] },
  { id: "je-019", date: "2026-06-18", description: "Purchased office supplies", reference: "PO-1002", lines: [
    { accountId: "5300", debit: 4600, credit: 0 },
    { accountId: "2000", debit: 0, credit: 4600 },
  ] },
  { id: "je-020", date: "2026-06-30", description: "June payroll", reference: "PAY-06", lines: [
    { accountId: "5100", debit: 42000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 42000 },
  ] },
  { id: "je-021", date: "2026-07-05", description: "Paid July rent", reference: "RENT-07", lines: [
    { accountId: "5000", debit: 12000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 12000 },
  ] },
  { id: "je-022", date: "2026-07-16", description: "Logistics system implementation", reference: "INV-2026-004", lines: [
    { accountId: "1200", debit: 88000, credit: 0 },
    { accountId: "4000", debit: 0, credit: 88000 },
  ] },
  { id: "je-023", date: "2026-07-25", description: "Software subscription renewal", reference: "SW-071", lines: [
    { accountId: "5500", debit: 3800, credit: 0 },
    { accountId: "1010", debit: 0, credit: 3800 },
  ] },
  { id: "je-024", date: "2026-07-31", description: "July payroll", reference: "PAY-07", lines: [
    { accountId: "5100", debit: 44000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 44000 },
  ] },
  { id: "je-025", date: "2026-08-05", description: "Paid August rent", reference: "RENT-08", lines: [
    { accountId: "5000", debit: 12000, credit: 0 },
    { accountId: "1010", debit: 0, credit: 12000 },
  ] },
  { id: "je-026", date: "2026-08-08", description: "Product sale", reference: "SALE-081", lines: [
    { accountId: "1010", debit: 41000, credit: 0 },
    { accountId: "4100", debit: 0, credit: 41000 },
  ] },
  { id: "je-027", date: "2026-08-12", description: "Utilities payment", reference: "UTIL-08", lines: [
    { accountId: "5200", debit: 2600, credit: 0 },
    { accountId: "1010", debit: 0, credit: 2600 },
  ] },
]

export const demoInvoices: Invoice[] = [
  {
    id: "inv-1",
    number: "INV-2026-001",
    clientId: "c1",
    issueDate: "2026-03-18",
    dueDate: "2026-04-17",
    status: "paid",
    taxRate: 6,
    items: [{ id: "li-1", description: "Strategic consulting services, 40 hours", quantity: 40, unitPrice: 1000 }],
  },
  {
    id: "inv-2",
    number: "INV-2026-002",
    clientId: "c2",
    issueDate: "2026-04-15",
    dueDate: "2026-05-15",
    status: "paid",
    taxRate: 6,
    items: [
      { id: "li-2", description: "Brand identity design", quantity: 1, unitPrice: 42000 },
      { id: "li-3", description: "Packaging design", quantity: 1, unitPrice: 16000 },
    ],
  },
  {
    id: "inv-3",
    number: "INV-2026-003",
    clientId: "c3",
    issueDate: "2026-05-12",
    dueDate: "2026-06-11",
    status: "sent",
    taxRate: 6,
    items: [{ id: "li-4", description: "Full-channel marketing services", quantity: 1, unitPrice: 76000 }],
  },
  {
    id: "inv-4",
    number: "INV-2026-004",
    clientId: "c4",
    issueDate: "2026-07-16",
    dueDate: "2026-08-15",
    status: "sent",
    taxRate: 6,
    items: [
      { id: "li-5", description: "Logistics management system development", quantity: 1, unitPrice: 72000 },
      { id: "li-6", description: "Deployment and training", quantity: 1, unitPrice: 16000 },
    ],
  },
  {
    id: "inv-5",
    number: "INV-2026-005",
    clientId: "c1",
    issueDate: "2026-06-20",
    dueDate: "2026-07-20",
    status: "overdue",
    taxRate: 6,
    items: [{ id: "li-7", description: "Quarterly technology advisory", quantity: 1, unitPrice: 30000 }],
  },
  {
    id: "inv-6",
    number: "INV-2026-006",
    clientId: "c2",
    issueDate: "2026-08-10",
    dueDate: "2026-09-09",
    status: "draft",
    taxRate: 6,
    items: [{ id: "li-8", description: "Website redesign", quantity: 1, unitPrice: 48000 }],
  },
]

export const demoVendorBills: VendorBill[] = [
  {
    id: "vb-1",
    vendorId: "v1",
    billNumber: "BILL-2026-001",
    billDate: "2026-07-01",
    dueDate: "2026-07-31",
    status: "open",
    subtotal: 12000,
    taxAmount: 0,
    totalAmount: 12000,
  },
  {
    id: "vb-2",
    vendorId: "v2",
    billNumber: "BILL-2026-002",
    billDate: "2026-08-01",
    dueDate: "2026-08-31",
    status: "open",
    subtotal: 3800,
    taxAmount: 228,
    totalAmount: 4028,
  },
  {
    id: "vb-3",
    vendorId: "v3",
    billNumber: "BILL-2026-003",
    billDate: "2026-06-18",
    dueDate: "2026-07-18",
    status: "overdue",
    subtotal: 4600,
    taxAmount: 276,
    totalAmount: 4876,
  },
]

export const demoReceipts: Receipt[] = [
  { id: "rcpt-1", invoiceId: "inv-1", receiptNumber: "RCPT-2026-001", receiptDate: "2026-03-28", amount: 44520, status: "posted" },
  { id: "rcpt-2", invoiceId: "inv-2", receiptNumber: "RCPT-2026-002", receiptDate: "2026-05-10", amount: 61480, status: "posted" },
]

export const demoPaymentVouchers: PaymentVoucher[] = [
  { id: "pv-1", vendorBillId: "vb-1", voucherNumber: "PV-2026-001", paymentDate: "2026-08-05", amount: 12000, status: "posted" },
]

export const demoPaymentAllocations: PaymentAllocation[] = [
  { id: "alloc-ar-1", sourceType: "receipt", sourceId: "rcpt-1", targetType: "invoice", targetId: "inv-1", amount: 44520, allocatedAt: "2026-03-28T00:00:00.000Z" },
  { id: "alloc-ar-2", sourceType: "receipt", sourceId: "rcpt-2", targetType: "invoice", targetId: "inv-2", amount: 61480, allocatedAt: "2026-05-10T00:00:00.000Z" },
  { id: "alloc-ap-1", sourceType: "payment_voucher", sourceId: "pv-1", targetType: "vendor_bill", targetId: "vb-1", amount: 12000, allocatedAt: "2026-08-05T00:00:00.000Z" },
]

export const demoWorkflowDocuments: WorkflowDocument[] = [
  {
    id: "wf-quote-1",
    documentType: "quotation",
    documentNumber: "QT-2026-001",
    contactId: "c1",
    status: "accepted",
    documentDate: "2026-08-01",
    totalAmount: 30000,
    lines: [{ id: "wf-line-quote-1", itemId: "item-001", description: "Logistics Edge Router", quantity: 10, unitPrice: 3000, taxRate: 0, taxAmount: 0, lineTotal: 30000 }],
  },
  {
    id: "wf-so-1",
    documentType: "sales_order",
    documentNumber: "SO-2026-001",
    contactId: "c1",
    status: "confirmed",
    documentDate: "2026-08-03",
    totalAmount: 30000,
    sourceDocumentId: "wf-quote-1",
    lines: [{ id: "wf-line-so-1", itemId: "item-001", description: "Logistics Edge Router", quantity: 10, unitPrice: 3000, taxRate: 0, taxAmount: 0, lineTotal: 30000 }],
  },
  {
    id: "wf-do-1",
    documentType: "delivery_order",
    documentNumber: "DO-2026-001",
    contactId: "c1",
    status: "posted",
    documentDate: "2026-08-05",
    totalAmount: 30000,
    sourceDocumentId: "wf-so-1",
    lines: [{ id: "wf-line-do-1", itemId: "item-001", warehouseId: "wh-main", description: "Logistics Edge Router", quantity: 10, unitPrice: 3000, taxRate: 0, taxAmount: 0, lineTotal: 30000 }],
  },
  {
    id: "wf-pr-1",
    documentType: "purchase_requisition",
    documentNumber: "PR-2026-001",
    status: "approved",
    documentDate: "2026-08-02",
    totalAmount: 18000,
    lines: [{ id: "wf-line-pr-1", itemId: "item-002", description: "Warehouse Barcode Scanner", quantity: 20, unitPrice: 900, taxRate: 0, taxAmount: 0, lineTotal: 18000 }],
  },
  {
    id: "wf-po-1",
    documentType: "purchase_order",
    documentNumber: "PO-2026-001",
    contactId: "v3",
    status: "issued",
    documentDate: "2026-08-04",
    totalAmount: 18000,
    sourceDocumentId: "wf-pr-1",
    lines: [{ id: "wf-line-po-1", itemId: "item-002", description: "Warehouse Barcode Scanner", quantity: 20, unitPrice: 900, taxRate: 0, taxAmount: 0, lineTotal: 18000 }],
  },
  {
    id: "wf-grn-1",
    documentType: "goods_received_note",
    documentNumber: "GRN-2026-001",
    contactId: "v3",
    status: "posted",
    documentDate: "2026-08-08",
    totalAmount: 18000,
    sourceDocumentId: "wf-po-1",
    lines: [{ id: "wf-line-grn-1", itemId: "item-002", warehouseId: "wh-main", description: "Warehouse Barcode Scanner", quantity: 20, unitPrice: 900, taxRate: 0, taxAmount: 0, lineTotal: 18000 }],
  },
]
