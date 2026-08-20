ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS asset_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accumulated_depreciation_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS depreciation_expense_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disposal_date DATE,
  ADD COLUMN IF NOT EXISTS disposal_proceeds NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_depreciation_schedules_asset_period
  ON depreciation_schedules(company_id, asset_id, period_date);

CREATE INDEX IF NOT EXISTS idx_depreciation_schedules_status_period
  ON depreciation_schedules(company_id, status, period_date);

ALTER TABLE retained_earnings_closing_runs
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS financial_report_snapshots (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_report_snapshots_company_period
  ON financial_report_snapshots(company_id, period_start, period_end, created_at DESC);
