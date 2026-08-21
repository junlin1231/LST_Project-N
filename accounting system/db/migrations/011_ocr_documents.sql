CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0),
  sha256_hash TEXT NOT NULL,
  processing_status TEXT NOT NULL CHECK (
    processing_status IN (
      'uploaded',
      'stored',
      'ocr_processing',
      'ocr_failed',
      'ocr_completed',
      'categorizing',
      'categorization_failed',
      'needs_review',
      'confirmed',
      'rejected',
      'posting',
      'posted',
      'posting_failed'
    )
  ),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'confirmed', 'edited', 'rejected', 'posted')),
  source_channel TEXT NOT NULL DEFAULT 'web_upload' CHECK (source_channel IN ('web_upload', 'camera_capture')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, sha256_hash)
);

CREATE TABLE IF NOT EXISTS document_extractions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL DEFAULT '',
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocr_engine TEXT NOT NULL,
  ocr_confidence NUMERIC(6, 4),
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  confidence NUMERIC(6, 4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT NOT NULL DEFAULT '',
  model_name TEXT NOT NULL,
  model_version TEXT,
  raw_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_review BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_accounting_drafts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  normalized_fields JSONB NOT NULL,
  suggested_journal_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'posted', 'rejected')),
  journal_entry_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  rule_execution_log_id TEXT REFERENCES rule_execution_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posting_confirmations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  draft_id TEXT REFERENCES document_accounting_drafts(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'edited', 'rejected', 'posted')),
  confirmed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decision_reason TEXT,
  preview_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_company_status
  ON documents(company_id, processing_status, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_extractions_document
  ON document_extractions(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_categories_document
  ON document_categories(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_accounting_drafts_document
  ON document_accounting_drafts(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posting_confirmations_company_status
  ON posting_confirmations(company_id, status, created_at DESC);
