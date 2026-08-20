import { PageHeader } from "@/components/page-header"
import { SettingsView } from "@/components/settings/settings-view"

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Settings" description="Manage demo data, reset the system, and review audit evidence." />
      <SettingsView />
    </div>
  )
}
