ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'stock',
  ADD COLUMN IF NOT EXISTS uom TEXT NOT NULL DEFAULT 'unit',
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS default_sales_account_id TEXT REFERENCES accounts(id),
  ADD COLUMN IF NOT EXISTS default_inventory_account_id TEXT REFERENCES accounts(id),
  ADD COLUMN IF NOT EXISTS default_cogs_account_id TEXT REFERENCES accounts(id),
  ADD COLUMN IF NOT EXISTS reorder_level NUMERIC(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_status_check,
  ADD CONSTRAINT inventory_items_status_check CHECK (status IN ('active', 'inactive'));

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE warehouses
SET code = UPPER(LEFT(REGEXP_REPLACE(name, '[^A-Za-z0-9]+', '', 'g'), 8))
WHERE code IS NULL OR code = '';

UPDATE warehouses
SET code = id
WHERE code IS NULL OR code = '';

ALTER TABLE warehouses
  ALTER COLUMN code SET NOT NULL,
  DROP CONSTRAINT IF EXISTS warehouses_status_check,
  ADD CONSTRAINT warehouses_status_check CHECK (status IN ('active', 'inactive'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_company_code ON warehouses(company_id, code);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  movement_no TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('opening', 'purchase_receipt', 'sales_delivery', 'adjustment_in', 'adjustment_out', 'transfer')),
  movement_date DATE NOT NULL,
  source_type TEXT,
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'voided')),
  posted_at TIMESTAMPTZ,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, movement_no)
);

CREATE TABLE IF NOT EXISTS stock_movement_lines (
  id TEXT PRIMARY KEY,
  stock_movement_id TEXT NOT NULL REFERENCES stock_movements(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  quantity_in NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantity_in >= 0),
  quantity_out NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantity_out >= 0),
  unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (quantity_in > 0 AND quantity_out = 0)
    OR (quantity_out > 0 AND quantity_in = 0)
  )
);

CREATE TABLE IF NOT EXISTS stock_balances (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  quantity_on_hand NUMERIC(14, 3) NOT NULL DEFAULT 0,
  inventory_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  average_unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, item_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_company_status ON inventory_items(company_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_balances_company_item ON stock_balances(company_id, item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_date ON stock_movements(company_id, movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movement_lines_movement ON stock_movement_lines(stock_movement_id);
