import { PackagePlus, Warehouse } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StockView } from "@/components/stock/stock-view"
import { NewStockItemDialog } from "@/components/stock/new-stock-item-dialog"
import { NewWarehouseDialog } from "@/components/stock/new-warehouse-dialog"
import { OpeningStockDialog } from "@/components/stock/opening-stock-dialog"

export default function StockPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Stock"
        description="Manage stock items, warehouses, balances, and inventory movement evidence."
        actions={
          <>
            <OpeningStockDialog />
            <NewWarehouseDialog triggerIcon={<Warehouse className="size-4" />} />
            <NewStockItemDialog triggerIcon={<PackagePlus className="size-4" />} />
          </>
        }
      />
      <StockView />
    </div>
  )
}
