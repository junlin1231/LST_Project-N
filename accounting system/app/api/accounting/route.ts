import { NextRequest, NextResponse } from "next/server"
import {
  createAccount,
  createAdjustmentJournalEntry,
  createContact,
  createDraftJournalEntry,
  createFixedAsset,
  createInvoice,
  createJournalEntry,
  createOpeningStock,
  createPaymentVoucher,
  createReceipt,
  createStockItem,
  createVendorBill,
  createWarehouse,
  createWorkflowDocument,
  deleteJournalEntry,
  listAccountingData,
  loadDemoData,
  postDraftJournalEntry,
  postDepreciationSchedule,
  postPeriodClose,
  previewPeriodClose,
  generateDepreciationSchedules,
  reverseJournalEntry,
  resetSystemData,
  updateDraftJournalEntry,
  updateFixedAsset,
  updateInvoiceStatus,
  updateStockItem,
  updateVendorBillStatus,
  updateWarehouse,
  updateWorkflowDocument,
  updateWorkflowDocumentStatus,
} from "@/lib/server/accounting-repository"
import {
  draftTaxPlaceholder,
  postExpenseDocumentByRule,
  postInvoiceByRuleById,
  postPaymentReceiptByRule,
} from "@/lib/server/accounting-rule-service"
import type {
  Account,
  Contact,
  FixedAsset,
  Invoice,
  JournalEntry,
  OpeningStockInput,
  PaymentVoucher,
  Receipt,
  StockItem,
  VendorBill,
  Warehouse,
  WorkflowDocument,
} from "@/lib/accounting/types"
import type { ConfirmationMetadata } from "@/lib/accounting/governance"

export const runtime = "nodejs"

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected accounting API error."
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET() {
  try {
    return NextResponse.json(await listAccountingData())
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    switch (body.action) {
      case "createAccount":
        return NextResponse.json(await createAccount(body.account as Omit<Account, "id">))
      case "createContact":
        return NextResponse.json(await createContact(body.contact as Omit<Contact, "id">))
      case "createStockItem":
        return NextResponse.json(await createStockItem(body.item as Omit<StockItem, "id">))
      case "createWarehouse":
        return NextResponse.json(await createWarehouse(body.warehouse as Omit<Warehouse, "id">))
      case "createFixedAsset":
        return NextResponse.json(await createFixedAsset(body.asset as Omit<FixedAsset, "id">))
      case "updateFixedAsset":
        return NextResponse.json(await updateFixedAsset(String(body.id), body.asset as Omit<FixedAsset, "id">))
      case "generateDepreciationSchedules":
        return NextResponse.json(await generateDepreciationSchedules(String(body.throughDate)))
      case "postDepreciationSchedule":
        return NextResponse.json(await postDepreciationSchedule(String(body.id), body.confirmation as ConfirmationMetadata))
      case "previewPeriodClose":
        return NextResponse.json(await previewPeriodClose(String(body.periodStart), String(body.periodEnd)))
      case "postPeriodClose":
        return NextResponse.json(await postPeriodClose(String(body.periodStart), String(body.periodEnd), String(body.retainedEarningsAccountId), body.confirmation as ConfirmationMetadata))
      case "updateStockItem":
        return NextResponse.json(await updateStockItem(String(body.id), body.item as Omit<StockItem, "id">))
      case "updateWarehouse":
        return NextResponse.json(await updateWarehouse(String(body.id), body.warehouse as Omit<Warehouse, "id">))
      case "createOpeningStock":
        return NextResponse.json(await createOpeningStock(body.openingStock as OpeningStockInput))
      case "createJournalEntry":
        return NextResponse.json(
          await createJournalEntry(body.entry as Omit<JournalEntry, "id">, body.confirmation as ConfirmationMetadata),
        )
      case "createDraftJournalEntry":
        return NextResponse.json(await createDraftJournalEntry(body.entry as Omit<JournalEntry, "id" | "status" | "postedAt">))
      case "updateDraftJournalEntry":
        return NextResponse.json(
          await updateDraftJournalEntry(String(body.id), body.entry as Omit<JournalEntry, "id" | "status" | "postedAt">),
        )
      case "postDraftJournalEntry":
        return NextResponse.json(await postDraftJournalEntry(String(body.id), body.confirmation as ConfirmationMetadata))
      case "deleteJournalEntry":
        await deleteJournalEntry(String(body.id))
        return NextResponse.json({ ok: true })
      case "reverseJournalEntry":
        return NextResponse.json(await reverseJournalEntry(String(body.id), body.confirmation as ConfirmationMetadata))
      case "createAdjustmentJournalEntry":
        return NextResponse.json(
          await createAdjustmentJournalEntry(
            String(body.originalId),
            body.entry as Omit<JournalEntry, "id">,
            body.confirmation as ConfirmationMetadata,
          ),
        )
      case "createInvoice":
        return NextResponse.json(await createInvoice(body.invoice as Omit<Invoice, "id" | "number">))
      case "createVendorBill":
        return NextResponse.json(await createVendorBill(body.bill as Omit<VendorBill, "id" | "billNumber">))
      case "createReceipt":
        return NextResponse.json(await createReceipt(body.receipt as Omit<Receipt, "id" | "receiptNumber" | "status">))
      case "createPaymentVoucher":
        return NextResponse.json(await createPaymentVoucher(body.voucher as Omit<PaymentVoucher, "id" | "voucherNumber" | "status">))
      case "createWorkflowDocument":
        return NextResponse.json(await createWorkflowDocument(body.document as Omit<WorkflowDocument, "id" | "documentNumber">))
      case "updateWorkflowDocument":
        return NextResponse.json(await updateWorkflowDocument(String(body.id), body.document as Omit<WorkflowDocument, "id" | "documentNumber" | "documentType">))
      case "updateInvoiceStatus":
        await updateInvoiceStatus(String(body.id), body.status as Invoice["status"], body.confirmation as ConfirmationMetadata)
        return NextResponse.json({ ok: true })
      case "updateVendorBillStatus":
        await updateVendorBillStatus(String(body.id), body.status as VendorBill["status"], body.confirmation as ConfirmationMetadata)
        return NextResponse.json({ ok: true })
      case "updateWorkflowDocumentStatus":
        await updateWorkflowDocumentStatus(String(body.id), String(body.status), body.confirmation as ConfirmationMetadata)
        return NextResponse.json({ ok: true })
      case "postInvoiceByRule":
        return NextResponse.json(await postInvoiceByRuleById(String(body.invoiceId)))
      case "postPaymentReceiptByRule":
        return NextResponse.json(await postPaymentReceiptByRule(body.payment))
      case "postExpenseDocumentByRule":
        return NextResponse.json(await postExpenseDocumentByRule(body.expenseDocument))
      case "draftTaxPlaceholder":
        return NextResponse.json(await draftTaxPlaceholder(body.tax))
      case "loadDemoData":
        await loadDemoData()
        return NextResponse.json(await listAccountingData())
      case "resetSystemData":
        await resetSystemData()
        return NextResponse.json(await listAccountingData())
      default:
        return NextResponse.json({ error: "Unknown accounting action." }, { status: 400 })
    }
  } catch (error) {
    return errorResponse(error)
  }
}
