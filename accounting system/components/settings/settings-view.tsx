"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, BookOpenText, CreditCard, Database, Package, RotateCcw, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuditView } from "@/components/audit/audit-view"
import { useAccounting } from "@/lib/accounting/store"

type ActionState = "idle" | "loading" | "resetting"

const masterDataLinks = [
  {
    title: "System Master Data",
    description: "Chart of accounts and ledger master records.",
    href: "/settings/system-master-data",
    action: "Open COA",
    icon: BookOpenText,
  },
  {
    title: "AR / AP Parties",
    description: "Customers, vendors, and document contacts.",
    href: "/settings/master-data",
    action: "Open Parties",
    icon: Users,
  },
  {
    title: "Document Options",
    description: "OCR currency and payment method options.",
    href: "/settings/master-data",
    action: "Open Options",
    icon: CreditCard,
  },
  {
    title: "Stock Master Data",
    description: "Stock items, warehouses, and inventory records.",
    href: "/stock",
    action: "Open Stock",
    icon: Package,
  },
]

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
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Master Data</h2>
            <p className="mt-1 text-sm text-muted-foreground">Reusable records used by accounting documents and ledgers.</p>
          </div>
          <Button variant="outline" nativeButton={false} render={<Link href="/settings/master-data" />}>
            <Users className="size-4" />
            Open Master Data
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {masterDataLinks.map((item) => {
            const Icon = item.icon
            return (
              <Card key={item.title} size="sm" className="min-h-40">
                <CardHeader>
                  <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </div>
                  <CardAction>
                    <Button size="icon-sm" variant="ghost" nativeButton={false} render={<Link href={item.href} aria-label={item.action} />}>
                      <ArrowRight className="size-4" />
                    </Button>
                  </CardAction>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button className="w-full" variant="outline" nativeButton={false} render={<Link href={item.href} />}>
                    {item.action}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <Card className="p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <Database className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Demo Data</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Load sample accounting records, or clear demo records from the company.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
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
