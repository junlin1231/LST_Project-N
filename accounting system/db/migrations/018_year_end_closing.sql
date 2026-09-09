ALTER TABLE accounting_periods
  ADD COLUMN IF NOT EXISTS period_type TEXT NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS fiscal_year INTEGER,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lock_reason TEXT,
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlocked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unlock_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlock_reason TEXT,
  ADD COLUMN IF NOT EXISTS prior_period_id TEXT REFERENCES accounting_periods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_period_id TEXT REFERENCES accounting_periods(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounting_periods_period_type_check'
  ) THEN
    ALTER TABLE accounting_periods
      ADD CONSTRAINT accounting_periods_period_type_check
      CHECK (period_type IN ('month', 'quarter', 'year'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_periods_company_fiscal_year
  ON accounting_periods(company_id, fiscal_year)
  WHERE period_type = 'year';

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS system_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS generation_source TEXT,
  ADD COLUMN IF NOT EXISTS locked_by_period_id TEXT REFERENCES accounting_periods(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS year_end_closing_runs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  period_id TEXT NOT NULL REFERENCES accounting_periods(id) ON DELETE RESTRICT,
  next_period_id TEXT REFERENCES accounting_periods(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'previewed', 'posted', 'void', 'reclosed')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  next_period_start DATE NOT NULL,
  next_period_end DATE NOT NULL,
  revenue_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expense_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_income NUMERIC(14, 2) NOT NULL DEFAULT 0,
  closing_journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  opening_journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  trial_balance_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  closing_balance_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  opening_balance_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  posted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_year_end_one_posted_close
  ON year_end_closing_runs(company_id, fiscal_year)
  WHERE status IN ('posted', 'reclosed');

CREATE INDEX IF NOT EXISTS idx_year_end_closing_runs_company_year
  ON year_end_closing_runs(company_id, fiscal_year, created_at DESC);

CREATE TABLE IF NOT EXISTS period_unlock_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_id TEXT NOT NULL REFERENCES accounting_periods(id) ON DELETE RESTRICT,
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'used', 'cancelled')),
  reason TEXT NOT NULL,
  impact_summary TEXT NOT NULL,
  allowed_until TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_period_unlock_requests_company_period
  ON period_unlock_requests(company_id, period_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_period_unlock_requests_pending
  ON period_unlock_requests(company_id, status, created_at DESC);
