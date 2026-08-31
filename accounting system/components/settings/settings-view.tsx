"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowRight, BookOpenText, BrainCircuit, CreditCard, Database, LoaderCircle, Package, RotateCcw, Save, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuditView } from "@/components/audit/audit-view"
import { useAccounting } from "@/lib/accounting/store"

type ActionState = "idle" | "loading" | "resetting"
type Notice = { type: "error" | "success"; message: string } | null
type OcrOwnNamesSettings = {
  companyName: string
  legalName: string
  taxId: string
  ownNames: string[]
}

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
  const [ocrSettings, setOcrSettings] = useState<OcrOwnNamesSettings | null>(null)
  const [ocrOwnNamesText, setOcrOwnNamesText] = useState("")
  const [ocrLoading, setOcrLoading] = useState(true)
  const [ocrSaving, setOcrSaving] = useState(false)
  const [ocrNotice, setOcrNotice] = useState<Notice>(null)

  async function readJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error ?? `Request failed: ${response.status}`)
    }
    return response.json()
  }

  useEffect(() => {
    fetch("/api/settings/ocr", { cache: "no-store" })
      .then((response) => readJson<OcrOwnNamesSettings>(response))
      .then((settings) => {
        setOcrSettings(settings)
        setOcrOwnNamesText(settings.ownNames.join("\n"))
      })
      .catch((error) => setOcrNotice({ type: "error", message: error instanceof Error ? error.message : "OCR settings failed to load." }))
      .finally(() => setOcrLoading(false))
  }, [])

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

  async function saveOcrOwnNames() {
    setOcrSaving(true)
    setOcrNotice(null)
    try {
      const ownNames = ocrOwnNamesText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
      const settings = await readJson<OcrOwnNamesSettings>(await fetch("/api/settings/ocr", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownNames }),
      }))
      setOcrSettings(settings)
      setOcrOwnNamesText(settings.ownNames.join("\n"))
      setOcrNotice({ type: "success", message: "OCR own entity names saved." })
    } catch (error) {
      setOcrNotice({ type: "error", message: error instanceof Error ? error.message : "OCR settings failed to save." })
    } finally {
      setOcrSaving(false)
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
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <BrainCircuit className="size-4" />
            </div>
            <div className="min-w-0 space-y-3">
              <div>
                <h2 className="text-sm font-semibold">OCR Own Entity Names</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Names OCR uses to identify your company in bank slips and decide if transfers are money in or money out.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Company</p>
                  <p className="mt-1 truncate text-sm font-medium">{ocrSettings?.companyName ?? (ocrLoading ? "Loading..." : "-")}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Tax ID</p>
                  <p className="mt-1 truncate text-sm font-medium">{ocrSettings?.taxId || "-"}</p>
                </div>
              </div>
              <textarea
                className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                value={ocrOwnNamesText}
                onChange={(event) => setOcrOwnNamesText(event.target.value)}
                placeholder="One name per line"
                disabled={ocrLoading || ocrSaving}
              />
              {ocrNotice ? (
                <p className={ocrNotice.type === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                  {ocrNotice.message}
                </p>
              ) : null}
            </div>
          </div>
          <Button onClick={() => void saveOcrOwnNames()} disabled={ocrLoading || ocrSaving}>
            {ocrSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            {ocrSaving ? "Saving..." : "Save OCR Names"}
          </Button>
        </div>
      </Card>

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
