CREATE TABLE IF NOT EXISTS workflow_document_lines (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  workflow_document_id TEXT NOT NULL REFERENCES workflow_documents(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  item_id TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
  warehouse_id TEXT REFERENCES warehouses(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  tax_rate NUMERIC(7, 4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_document_lines_document
  ON workflow_document_lines(workflow_document_id, line_no);

CREATE INDEX IF NOT EXISTS idx_workflow_document_lines_item
  ON workflow_document_lines(item_id);
