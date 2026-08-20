CREATE TABLE IF NOT EXISTS vendor_bills (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id TEXT NOT NULL REFERENCES contacts(id),
  bill_number TEXT NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'paid', 'void')),
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, bill_number)
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('receipt', 'payment_voucher')),
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('invoice', 'vendor_bill')),
  target_id TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  receipt_number TEXT NOT NULL,
  receipt_date DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, receipt_number)
);

CREATE TABLE IF NOT EXISTS payment_vouchers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_bill_id TEXT REFERENCES vendor_bills(id) ON DELETE SET NULL,
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  voucher_number TEXT NOT NULL,
  payment_date DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, voucher_number)
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MYR',
  opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_statement_imports (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_id TEXT REFERENCES bank_accounts(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  file_hash TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'parsed', 'failed')),
  raw_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  statement_import_id TEXT REFERENCES bank_statement_imports(id) ON DELETE SET NULL,
  statement_date DATE NOT NULL,
  statement_balance NUMERIC(14, 2) NOT NULL,
  ledger_balance NUMERIC(14, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reconciled', 'exception')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('quotation', 'sales_order', 'delivery_order', 'purchase_requisition', 'purchase_order', 'goods_received_note')),
  document_number TEXT NOT NULL,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  document_date DATE NOT NULL,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  source_document_id TEXT REFERENCES workflow_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, document_type, document_number)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  valuation_method TEXT NOT NULL DEFAULT 'weighted_average' CHECK (valuation_method IN ('fifo', 'weighted_average')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, sku)
);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_bins (
  id TEXT PRIMARY KEY,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_number TEXT NOT NULL,
  name TEXT NOT NULL,
  purchase_date DATE NOT NULL,
  purchase_price NUMERIC(14, 2) NOT NULL,
  useful_life_months INTEGER NOT NULL CHECK (useful_life_months > 0),
  salvage_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disposed', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, asset_number)
);

CREATE TABLE IF NOT EXISTS depreciation_schedules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  depreciation_amount NUMERIC(14, 2) NOT NULL,
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_pay NUMERIC(14, 2) NOT NULL DEFAULT 0,
  deductions NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(14, 2) NOT NULL DEFAULT 0,
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_allocations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  department TEXT,
  project TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tax_codes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rate NUMERIC(6, 3) NOT NULL DEFAULT 0,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('input', 'output')),
  account_id TEXT REFERENCES accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS tax_return_runs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  input_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  output_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_tax_payable NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'filed', 'void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS e_invoice_submissions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'LHDN MyInvois',
  provider_document_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'validated', 'cancelled', 'rejected')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
