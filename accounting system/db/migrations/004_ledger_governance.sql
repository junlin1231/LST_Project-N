ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'posted'
    CHECK (status IN ('draft', 'posted')),
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS adjusted_journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL;

UPDATE journal_entries
SET status = 'posted',
    posted_at = COALESCE(posted_at, created_at)
WHERE status = 'posted';

CREATE TABLE IF NOT EXISTS accounting_periods (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, start_date, end_date),
  CHECK (start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS supervisor_overrides (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  supervisor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retained_earnings_closing_runs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_id TEXT REFERENCES accounting_periods(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'void')),
  revenue_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expense_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_income NUMERIC(14, 2) NOT NULL DEFAULT 0,
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_status
  ON journal_entries(company_id, status, date DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_reversal
  ON journal_entries(reversed_journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_adjustment
  ON journal_entries(adjusted_journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_company_dates
  ON accounting_periods(company_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_supervisor_overrides_company_created_at
  ON supervisor_overrides(company_id, created_at DESC);
