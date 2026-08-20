CREATE TABLE IF NOT EXISTS accounting_rule_mappings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ruleset_name TEXT NOT NULL,
  version INTEGER NOT NULL,
  accounts_receivable_account_id TEXT NOT NULL REFERENCES accounts(id),
  cash_account_id TEXT NOT NULL REFERENCES accounts(id),
  revenue_account_id TEXT NOT NULL REFERENCES accounts(id),
  tax_payable_account_id TEXT NOT NULL REFERENCES accounts(id),
  expense_account_id TEXT NOT NULL REFERENCES accounts(id),
  accounts_payable_account_id TEXT NOT NULL REFERENCES accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, ruleset_name, version)
);

CREATE TABLE IF NOT EXISTS rule_execution_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ruleset_name TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('drafted', 'posted', 'failed', 'overridden')),
  input_snapshot JSONB NOT NULL,
  output_snapshot JSONB,
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rule_execution_logs_company_created_at
  ON rule_execution_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rule_execution_logs_source
  ON rule_execution_logs(source_type, source_id);
