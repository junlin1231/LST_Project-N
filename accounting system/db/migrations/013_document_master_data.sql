CREATE TABLE IF NOT EXISTS document_master_data_options (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  option_type TEXT NOT NULL CHECK (option_type IN ('currency', 'payment_method')),
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, option_type, value)
);

CREATE INDEX IF NOT EXISTS idx_document_master_data_options_company_type
  ON document_master_data_options(company_id, option_type, is_active, sort_order);
