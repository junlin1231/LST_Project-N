"use client"

import Link from "next/link"
import { useState } from "react"
import { BookOpenText, Database, Package, RotateCcw, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AuditView } from "@/components/audit/audit-view"
import { useAccounting } from "@/lib/accounting/store"

type ActionState = "idle" | "loading" | "resetting"

export function SettingsView() {
  const { loadDemoData, resetSystemData } = useAccounting()
  const [state, setState] = useState<ActionState>("idle")
  const [message, setMessage] = useState("")

  async function run(action: "load" | "reset") {
    setMessage("")
    setState(action === "load" ? "loading" : "resetting")
    try {
      if (action === "load") {
        await loadDemoData()
        setMessage("Demo data loaded.")
      } else {
        await resetSystemData()
        setMessage("System reset. Demo records were removed.")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Settings action failed.")
    } finally {
      setState("idle")
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Master Data</h2>
          <p className="mt-1 text-sm text-muted-foreground">Maintain reusable records used by accounting documents and ledgers.</p>
        </div>
        <Card className="p-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <BookOpenText className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">System Master Data</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Manage chart of accounts and ledger master records.</p>
                </div>
              </div>
              <Button variant="outline" nativeButton={false} render={<Link href="/settings/system-master-data" />}>
                Open COA
              </Button>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Users className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">AR / AP Parties</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Manage AR customers and AP vendors.</p>
                </div>
              </div>
              <Button variant="outline" nativeButton={false} render={<Link href="/settings/master-data" />}>
                Open Parties
              </Button>
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Package className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Stock Master Data</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Manage stock items and warehouses.</p>
                </div>
              </div>
              <Button variant="outline" nativeButton={false} render={<Link href="/stock" />}>
                Open Stock
              </Button>
            </div>
          </div>
        </Card>
      </section>

      <Card className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Demo Data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Load the sample accounting records, or reset the system back to an empty company.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void run("load")} disabled={state !== "idle"}>
              <Database className="size-4" />
              {state === "loading" ? "Loading..." : "Load Demo Data"}
            </Button>
            <Button variant="destructive" onClick={() => void run("reset")} disabled={state !== "idle"}>
              <RotateCcw className="size-4" />
              {state === "resetting" ? "Resetting..." : "Reset System"}
            </Button>
          </div>
        </div>
        {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Audit Trail</h2>
          <p className="mt-1 text-sm text-muted-foreground">Immutable confirmation, posting, reversal, and status-change evidence.</p>
        </div>
        <AuditView />
      </section>
    </div>
  )
}
