# Stock Module Implementation Plan

## Objective

Create a stock module that manages inventory master data, stock movements, stock balances, and accounting impacts for sales, procurement, and inventory adjustments.

## Scope

The first implementation should cover:

- Stock item master data.
- Warehouse/location master data.
- Opening stock balances.
- Stock movement ledger.
- Stock in through GRN or manual adjustment.
- Stock out through delivery order or manual adjustment.
- Inventory valuation using a controlled costing method.
- Stock reports for quantity, value, aging, and movement history.
- Audit trail and double-confirmation governance for high-risk stock actions.

Out of scope for the first version:

- Manufacturing work orders.
- Serial number and batch tracking, unless required later.
- Barcode scanning.
- Automated supplier reorder integration.
- Advanced landed cost allocation.

## Proposed Navigation

Add a new main module:

- `Stock`

Suggested subviews:

- `Items`
- `Warehouses`
- `Balances`
- `Movements`
- `Adjustments`
- `Reports`

Stock-related master data can also be accessible from `Settings > Master Data`, but day-to-day stock operations should remain inside the `Stock` module.

## Data Model

### stock_items

Stores inventory item master data.

Required fields:

- `id`
- `company_id`
- `sku`
- `name`
- `description`
- `item_type`
- `uom`
- `category`
- `status`
- `costing_method`
- `default_sales_account_id`
- `default_inventory_account_id`
- `default_cogs_account_id`
- `reorder_level`
- `created_at`
- `updated_at`

Recommended checks:

- Unique `sku` per company.
- `status` limited to `active`, `inactive`.
- `costing_method` limited to `fifo`, `weighted_average`.

### warehouses

Stores physical or logical stock locations.

Required fields:

- `id`
- `company_id`
- `code`
- `name`
- `status`
- `created_at`
- `updated_at`

Recommended checks:

- Unique `code` per company.
- `status` limited to `active`, `inactive`.

### stock_movements

Immutable stock ledger header.

Required fields:

- `id`
- `company_id`
- `movement_no`
- `movement_type`
- `movement_date`
- `source_type`
- `source_id`
- `status`
- `posted_at`
- `created_by`
- `created_at`
- `updated_at`

Recommended movement types:

- `opening`
- `purchase_receipt`
- `sales_delivery`
- `adjustment_in`
- `adjustment_out`
- `transfer`

Recommended statuses:

- `draft`
- `posted`
- `voided`

### stock_movement_lines

Immutable stock ledger detail.

Required fields:

- `id`
- `stock_movement_id`
- `item_id`
- `warehouse_id`
- `quantity_in`
- `quantity_out`
- `unit_cost`
- `total_cost`
- `memo`
- `created_at`

Recommended checks:

- Quantity in and quantity out cannot both be positive.
- Unit cost cannot be negative.
- Posted movements cannot be edited directly.

### stock_balances

Current stock balance by item and warehouse.

Required fields:

- `id`
- `company_id`
- `item_id`
- `warehouse_id`
- `quantity_on_hand`
- `inventory_value`
- `average_unit_cost`
- `updated_at`

Recommended checks:

- Unique item and warehouse combination per company.
- Quantity should not go negative unless negative stock is explicitly enabled.

## Accounting Integration

Stock posting should create or reference accounting journal entries.

Purchase receipt or vendor bill flow:

- Debit Inventory.
- Credit GRNI, AP, or clearing account depending on document stage.

Sales delivery or invoice flow:

- Debit COGS.
- Credit Inventory.

Adjustment in:

- Debit Inventory.
- Credit Stock Adjustment Gain or configured offset account.

Adjustment out:

- Debit Stock Adjustment Loss or configured offset account.
- Credit Inventory.

All generated entries should preserve source links back to the stock movement.

## API Design

Suggested actions in the existing accounting API pattern:

- `listStockItems`
- `createStockItem`
- `updateStockItem`
- `listWarehouses`
- `createWarehouse`
- `updateWarehouse`
- `listStockBalances`
- `listStockMovements`
- `createStockMovementDraft`
- `postStockMovement`
- `voidStockMovement`
- `createStockAdjustment`
- `runStockReports`

High-risk mutations should require confirmation metadata:

- Posting stock movement.
- Voiding stock movement.
- Stock adjustment.
- Opening balance import.
- Any action that causes negative stock.

## UI Design

### Stock Dashboard

Show operational tiles:

- Total inventory value.
- Low stock items.
- Negative stock exceptions.
- Recent stock movements.
- Top inventory categories.

### Stock Items

Expected controls:

- Search by SKU or item name.
- Filter by status, category, and item type.
- Create/edit item form.
- Account mapping fields for inventory, sales, and COGS.

### Warehouses

Expected controls:

- Search by code or name.
- Create/edit warehouse form.
- Active/inactive status.

### Stock Balances

Expected controls:

- Filter by warehouse.
- Filter by item/category.
- Quantity on hand.
- Inventory value.
- Average cost.
- Drill down to movement history.

### Stock Movements

Expected controls:

- Movement list by date, type, status, and source.
- Draft creation where applicable.
- Post action with double confirmation.
- Void action with double confirmation and required reason.

### Adjustments

Expected controls:

- Adjustment type selector.
- Item and warehouse line entry.
- Quantity and unit cost.
- Required reason.
- Double-confirmation posting.

## Governance Rules

- Posted stock movements are immutable.
- Corrections must be reversals or adjustment documents.
- Every posted movement must have audit evidence.
- Stock movement totals must reconcile to generated journal lines.
- Negative stock should be blocked by default.
- User, timestamp, IP, confirmation phrase, before/after values, and source document metadata should be captured for high-risk actions.

## Reports

Initial reports:

- Stock balance report.
- Stock valuation report.
- Stock movement report.
- Low stock report.
- Stock aging report.
- Stock adjustment audit report.

## Implementation Phases

### Phase 1: Master Data

- Add migrations for `stock_items` and `warehouses`.
- Add TypeScript types.
- Add repository functions.
- Add UI under `Stock > Items` and `Stock > Warehouses`.

### Phase 2: Balances and Movements

- Add stock movement and balance tables.
- Implement draft and posted movement logic.
- Add balance recalculation helpers.
- Add movement list and balance views.

### Phase 3: Accounting Posting

- Connect posted movements to journal entries.
- Add rule-based account mapping.
- Add tests for stock-in, stock-out, and adjustments.

### Phase 4: Governance

- Add double-confirmation modals.
- Add audit log events.
- Add void/reversal workflow.
- Add negative stock controls.

### Phase 5: Reports

- Add stock valuation, movement, low-stock, aging, and adjustment reports.
- Add report tests.
- Add dashboard summary tiles.

## Review Questions

- Should the first version support FIFO, weighted average, or both?
- Should negative stock ever be allowed?
- Do warehouses need bins or only warehouse-level quantity?
- Should stock opening balances be imported by CSV?
- Should AP vendor bills update stock directly, or only GRN should update stock?
