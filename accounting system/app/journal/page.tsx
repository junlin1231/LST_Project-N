import { PageHeader } from "@/components/page-header"
import { JournalList } from "@/components/journal/journal-list"
import { NewEntrySheet } from "@/components/journal/new-entry-sheet"

export default function JournalPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Journal Entries"
        description="All debit and credit postings, each following double-entry accounting."
        actions={<NewEntrySheet />}
      />
      <JournalList />
    </div>
  )
}
