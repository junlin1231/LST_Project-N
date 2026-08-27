ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS parent_document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS receipt_index INTEGER CHECK (receipt_index IS NULL OR receipt_index > 0);

CREATE INDEX IF NOT EXISTS idx_documents_parent_receipt
  ON documents(company_id, parent_document_id, receipt_index);
