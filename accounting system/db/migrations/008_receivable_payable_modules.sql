ALTER TABLE vendor_bills
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE vendor_bills
  DROP CONSTRAINT IF EXISTS vendor_bills_status_check,
  ADD CONSTRAINT vendor_bills_status_check CHECK (status IN ('draft', 'open', 'partially_paid', 'paid', 'overdue', 'void'));

ALTER TABLE receipts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE payment_vouchers
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_vendor_bills_company_due_date ON vendor_bills(company_id, due_date);
CREATE INDEX IF NOT EXISTS idx_receipts_company_receipt_date ON receipts(company_id, receipt_date DESC);
CREATE INDEX IF NOT EXISTS idx_payment_vouchers_company_payment_date ON payment_vouchers(company_id, payment_date DESC);
