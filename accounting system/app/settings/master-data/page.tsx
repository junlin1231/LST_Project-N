import { PageHeader } from "@/components/page-header"
import { ContactsView } from "@/components/contacts/contacts-view"
import { DocumentMasterDataView } from "@/components/settings/document-master-data-view"

export default function MasterDataPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Master Data"
        description="Manage reusable accounting records, document options, AR customers, and AP vendors."
      />
      <ContactsView />
      <DocumentMasterDataView />
    </div>
  )
}
