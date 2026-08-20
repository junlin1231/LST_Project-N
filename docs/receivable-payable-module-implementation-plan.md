# Receivable and Payable Module Implementation Plan

## Objective

Create dedicated Accounts Receivable and Accounts Payable modules with complete operational submodules, document workflows, aging controls, settlement tracking, and accounting integration.

The existing `AR / AP Parties` master data should remain under `Settings > Master Data`. The new AR and AP modules should focus on daily transaction processing, collection/payment control, reporting, and audit evidence.

## Proposed Navigation

### Accounts Receivable

Main module: `Receivable`

Submodules:

- `Customers`
- `Quotations`
- `Sales Orders`
- `Delivery Orders`
- `Invoices`
- `Receipts`
- `Credit Notes`
- `Allocations`
- `Aging`
- `Reports`

### Accounts Payable

Main module: `Payable`

Submodules:

- `Vendors`
- `Purchase Requisitions`
- `Purchase Orders`
- `Goods Received Notes`
- `Vendor Bills`
- `Payment Vouchers`
- `Debit Notes`
- `Allocations`
- `Aging`
- `Reports`

## Master Data Boundary

Customer and vendor records are master data and should be maintained in Settings:

- `Settings > Master Data > Customers`
- `Settings > Master Data > Vendors`

The AR and AP modules may show customer/vendor lookup views, but creation and maintenance should redirect or link back to master data.

## Accounts Receivable Scope

### Customers

Purpose:

- View AR customers and credit exposure.
- Link to customer master profile.
- Show outstanding invoices, receipts, credit notes, and aging summary.

Key fields:

- Customer name.
- Credit limit.
- Outstanding AR balance.
- Overdue amount.
- Available credit.
- Last receipt date.

### Quotations

Purpose:

- Create sales quotes before formal order confirmation.
- Convert approved quotations to sales orders.

Recommended statuses:

- `draft`
- `sent`
- `accepted`
- `rejected`
- `expired`
- `cancelled`

High-risk actions:

- Cancel accepted quotation.
- Change customer after quotation is accepted.

### Sales Orders

Purpose:

- Confirm customer sales commitment.
- Reserve stock where inventory applies.
- Convert to delivery order and/or AR invoice.

Recommended statuses:

- `draft`
- `confirmed`
- `partially_delivered`
- `delivered`
- `invoiced`
- `cancelled`

High-risk actions:

- Confirm sales order.
- Cancel confirmed order.
- Override customer credit limit.

### Delivery Orders

Purpose:

- Record delivery of goods/services to customer.
- Trigger stock-out movement for inventory items.
- Support partial delivery.

Recommended statuses:

- `draft`
- `posted`
- `partially_invoiced`
- `invoiced`
- `voided`

Accounting/stock impact:

- Stock items should reduce quantity on hand.
- COGS posting may happen at delivery or invoice depending on accounting policy.

High-risk actions:

- Post delivery order.
- Void posted delivery order.
- Deliver below available stock.

### Invoices

Purpose:

- Create AR invoices.
- Track invoice status, due date, taxes, settlement, and overdue state.

Recommended statuses:

- `draft`
- `sent`
- `partially_paid`
- `paid`
- `overdue`
- `voided`

Accounting impact:

- Debit Accounts Receivable.
- Credit Revenue.
- Credit Output Tax or Tax Payable where applicable.

High-risk actions:

- Post invoice.
- Void posted invoice.
- Change posted invoice values.
- Override credit limit.

### Receipts

Purpose:

- Record customer payments.
- Allocate receipts to one or more AR invoices.
- Track unapplied customer credit.

Recommended statuses:

- `draft`
- `posted`
- `voided`

Accounting impact:

- Debit Cash/Bank.
- Credit Accounts Receivable.

High-risk actions:

- Post receipt.
- Void posted receipt.
- Allocate receipt to closed or disputed invoice.

### Credit Notes

Purpose:

- Reduce AR invoice balance due to return, discount, billing correction, or goodwill credit.

Recommended statuses:

- `draft`
- `posted`
- `allocated`
- `voided`

Accounting impact:

- Debit Sales Return/Discount or Revenue.
- Debit Output Tax where applicable.
- Credit Accounts Receivable.

High-risk actions:

- Post credit note.
- Void posted credit note.
- Allocate credit note to invoice.

### Allocations

Purpose:

- Allocate receipts and credit notes against invoices.
- Support partial payments, overpayments, and unapplied balances.

Rules:

- Allocation cannot exceed document available balance.
- Paid invoices should become read-only except reversal/void workflows.
- Allocation events should be auditable.

### Aging

Purpose:

- Monitor overdue receivables.
- Group open invoices by aging buckets.

Suggested buckets:

- Current.
- 1-30 days.
- 31-60 days.
- 61-90 days.
- Over 90 days.

## Accounts Payable Scope

### Vendors

Purpose:

- View AP vendors and payable exposure.
- Link to vendor master profile.
- Show open bills, payments, debit notes, and aging summary.

Key fields:

- Vendor name.
- Payment terms.
- Outstanding AP balance.
- Due/overdue amount.
- Last payment date.

### Purchase Requisitions

Purpose:

- Internal request to purchase goods or services before issuing PO.

Recommended statuses:

- `draft`
- `submitted`
- `approved`
- `rejected`
- `converted`
- `cancelled`

High-risk actions:

- Approve requisition.
- Cancel approved requisition.

### Purchase Orders

Purpose:

- Formal purchase commitment to vendor.
- Convert from approved purchase requisition.
- Convert to GRN and/or vendor bill.

Recommended statuses:

- `draft`
- `issued`
- `partially_received`
- `received`
- `billed`
- `cancelled`

High-risk actions:

- Issue purchase order.
- Cancel issued purchase order.
- Change vendor after issue.

### Goods Received Notes

Purpose:

- Record receipt of goods from vendor.
- Trigger stock-in movement for inventory items.
- Support partial receipt.

Recommended statuses:

- `draft`
- `posted`
- `partially_billed`
- `billed`
- `voided`

Accounting/stock impact:

- Stock items should increase quantity on hand.
- Debit Inventory.
- Credit GRNI or clearing account until vendor bill is posted.

High-risk actions:

- Post GRN.
- Void posted GRN.
- Receive more than ordered.

### Vendor Bills

Purpose:

- Record AP invoices from vendors.
- Match against PO and GRN where applicable.
- Track due date, tax, settlement, and overdue state.

Recommended statuses:

- `draft`
- `open`
- `partially_paid`
- `paid`
- `overdue`
- `voided`

Accounting impact:

- Debit Expense or Inventory/GRNI clearing.
- Debit Input Tax where applicable.
- Credit Accounts Payable.

High-risk actions:

- Post vendor bill.
- Void posted vendor bill.
- Approve bill with price or quantity variance.

### Payment Vouchers

Purpose:

- Record payments made to vendors.
- Allocate payment against one or more vendor bills.
- Track unapplied vendor advances.

Recommended statuses:

- `draft`
- `approved`
- `posted`
- `voided`

Accounting impact:

- Debit Accounts Payable.
- Credit Cash/Bank.

High-risk actions:

- Approve payment voucher.
- Post payment voucher.
- Void posted payment voucher.
- Pay unapproved vendor bill.

### Debit Notes

Purpose:

- Reduce AP balance due to purchase return, vendor rebate, overbilling correction, or claim.

Recommended statuses:

- `draft`
- `posted`
- `allocated`
- `voided`

Accounting impact:

- Debit Accounts Payable.
- Credit Purchase Return/Expense/Inventory.
- Credit Input Tax where applicable.

High-risk actions:

- Post debit note.
- Allocate debit note to vendor bill.
- Void posted debit note.

### Allocations

Purpose:

- Allocate payment vouchers and debit notes against vendor bills.
- Support partial payments, vendor advances, and unapplied balances.

Rules:

- Allocation cannot exceed document available balance.
- Paid bills should become read-only except reversal/void workflows.
- Allocation events should be auditable.

### Aging

Purpose:

- Monitor due and overdue payables.
- Group open vendor bills by aging buckets.

Suggested buckets:

- Current.
- 1-30 days.
- 31-60 days.
- 61-90 days.
- Over 90 days.

## Shared Data Model

### ar_documents

Stores AR document headers.

Suggested fields:

- `id`
- `company_id`
- `document_type`
- `document_number`
- `customer_id`
- `document_date`
- `due_date`
- `status`
- `currency`
- `exchange_rate`
- `subtotal`
- `tax_amount`
- `total_amount`
- `open_amount`
- `source_document_id`
- `journal_entry_id`
- `created_by`
- `created_at`
- `updated_at`

Suggested document types:

- `quotation`
- `sales_order`
- `delivery_order`
- `invoice`
- `receipt`
- `credit_note`

### ar_document_lines

Suggested fields:

- `id`
- `document_id`
- `line_no`
- `item_id`
- `description`
- `quantity`
- `unit_price`
- `tax_code_id`
- `tax_rate`
- `tax_amount`
- `line_total`
- `warehouse_id`
- `created_at`

### ap_documents

Stores AP document headers.

Suggested fields:

- `id`
- `company_id`
- `document_type`
- `document_number`
- `vendor_id`
- `document_date`
- `due_date`
- `status`
- `currency`
- `exchange_rate`
- `subtotal`
- `tax_amount`
- `total_amount`
- `open_amount`
- `source_document_id`
- `journal_entry_id`
- `created_by`
- `created_at`
- `updated_at`

Suggested document types:

- `purchase_requisition`
- `purchase_order`
- `goods_received_note`
- `vendor_bill`
- `payment_voucher`
- `debit_note`

### ap_document_lines

Suggested fields:

- `id`
- `document_id`
- `line_no`
- `item_id`
- `description`
- `quantity`
- `unit_price`
- `tax_code_id`
- `tax_rate`
- `tax_amount`
- `line_total`
- `warehouse_id`
- `created_at`

### settlement_allocations

Stores settlement links for both AR and AP.

Suggested fields:

- `id`
- `company_id`
- `module`
- `source_document_id`
- `target_document_id`
- `allocation_date`
- `amount`
- `created_by`
- `created_at`

Suggested module values:

- `ar`
- `ap`

## Workflow Rules

### AR Flow

Recommended flow:

1. Quotation.
2. Sales Order.
3. Delivery Order.
4. AR Invoice.
5. Receipt.
6. Allocation.

Allowed shortcuts:

- Invoice can be created directly without quotation or sales order.
- Receipt can be created as unapplied customer credit and allocated later.

### AP Flow

Recommended flow:

1. Purchase Requisition.
2. Purchase Order.
3. Goods Received Note.
4. Vendor Bill.
5. Payment Voucher.
6. Allocation.

Allowed shortcuts:

- Vendor bill can be created directly for non-stock expenses.
- Payment voucher can be created as vendor advance and allocated later.

## Accounting Rules

### AR Invoice Posting

- Debit Accounts Receivable.
- Credit Revenue.
- Credit Output Tax or Tax Payable.

### AR Receipt Posting

- Debit Cash/Bank.
- Credit Accounts Receivable.

### AR Credit Note Posting

- Debit Sales Return/Discount or Revenue.
- Debit Output Tax where applicable.
- Credit Accounts Receivable.

### AP Vendor Bill Posting

- Debit Expense, Inventory, or GRNI clearing.
- Debit Input Tax where applicable.
- Credit Accounts Payable.

### AP Payment Voucher Posting

- Debit Accounts Payable.
- Credit Cash/Bank.

### AP Debit Note Posting

- Debit Accounts Payable.
- Credit Expense, Purchase Return, Inventory, or GRNI clearing.
- Credit Input Tax where applicable.

## Stock Integration

AR delivery orders should integrate with stock:

- Posted delivery order creates stock-out movement.
- Stock-out should reduce `stock_balances.quantity_on_hand`.
- Stock-out should block negative stock unless supervisor override is configured.

AP goods received notes should integrate with stock:

- Posted GRN creates stock-in movement.
- Stock-in should increase `stock_balances.quantity_on_hand`.
- Weighted average cost should update if that costing method is used.

## UI Expectations

### List Views

Each submodule should provide:

- Search by document number, customer/vendor, and reference.
- Status filter.
- Date filter.
- Amount columns.
- Open balance columns where relevant.
- Row click to open detail.

### Detail Views

Each document detail should provide:

- Header fields.
- Line item table.
- Totals.
- Status badge.
- Source and downstream document links.
- Posting/approval actions.
- Audit evidence panel.

### Dashboards

Receivable dashboard:

- Total outstanding AR.
- Overdue AR.
- Receipts this month.
- Top overdue customers.
- Aging summary.

Payable dashboard:

- Total outstanding AP.
- Due this week.
- Payments this month.
- Top vendors by payable balance.
- Aging summary.

## Governance And Controls

Use double-confirmation for:

- Posting invoices, bills, receipts, payments, credit notes, and debit notes.
- Voiding posted documents.
- Overriding credit limits.
- Posting stock-related delivery or GRN documents.
- Allocating settlement to closed/void/disputed documents.

Required audit metadata:

- User ID.
- Timestamp.
- IP address.
- Action.
- Before/after values.
- Confirmation phrase.
- Reason for high-risk changes.
- Source document and downstream document IDs.

Immutability:

- Draft documents can be edited.
- Posted documents cannot be edited directly.
- Posted document corrections require reversal, credit note, debit note, or adjustment document.

## Implementation Phases

### Phase 1: Navigation And Shared Document Foundation

- Add Receivable and Payable main navigation.
- Add dashboard shells for AR and AP.
- Add shared document types and status labels.
- Create reusable document list/detail components.
- Keep customer/vendor master data under Settings.

### Phase 2: AR Core

- Implement AR invoice list/detail/create.
- Implement receipt create/post.
- Implement receipt-to-invoice allocation.
- Implement AR aging report.
- Add double-confirmation for posting and voiding.

### Phase 3: AP Core

- Implement vendor bill list/detail/create.
- Implement payment voucher create/post.
- Implement payment-to-bill allocation.
- Implement AP aging report.
- Add double-confirmation for approving, posting, and voiding.

### Phase 4: O2C And P2P Documents

- Implement quotations and sales orders.
- Implement delivery orders with stock-out integration.
- Implement purchase requisitions and purchase orders.
- Implement GRN with stock-in integration.

### Phase 5: Credit/Debit Notes And Advanced Controls

- Implement AR credit notes.
- Implement AP debit notes.
- Add variance checks for AP bill vs PO/GRN.
- Add customer credit limit checks.
- Add vendor approval controls.

### Phase 6: Reporting And Audit

- Add AR reports.
- Add AP reports.
- Add settlement audit reports.
- Add overdue dashboards.
- Add export-ready report structures.

## Review Questions

- Should module names be `Receivable` and `Payable`, or `Accounts Receivable` and `Accounts Payable`?
- Should AR invoices remain in the current invoice table, or should they migrate into a unified `ar_documents` model?
- Should AP vendor bills use the existing `vendor_bills` table first, or migrate into `ap_documents` immediately?
- Should delivery order or invoice trigger COGS posting?
- Should GRN or vendor bill trigger inventory recognition?
- Should direct invoice/direct bill entry be allowed without sales order or purchase order?
- Should credit limit override require supervisor authorization?
- Should payment vouchers require approval before posting?
