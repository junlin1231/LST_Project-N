"use client"

import { useEffect, useMemo, useState } from "react"
import { CreditCard, Landmark, Plus, Save } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { DocumentMasterDataOption, DocumentMasterDataType } from "@/lib/accounting/document-master-data"

type Notice = { type: "error" | "success"; message: string } | null

const TYPE_LABEL: Record<DocumentMasterDataType, string> = {
  currency: "Currency",
  payment_method: "Payment Method",
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `Request failed: ${response.status}`)
  }
  return response.json()
}

export function DocumentMasterDataView() {
  const [options, setOptions] = useState<DocumentMasterDataOption[]>([])
  const [type, setType] = useState<DocumentMasterDataType>("currency")
  const [tab, setTab] = useState<DocumentMasterDataType>("currency")
  const [value, setValue] = useState("")
  const [label, setLabel] = useState("")
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState(false)

  const grouped = useMemo(() => ({
    currency: options.filter((option) => option.type === "currency").sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
    payment_method: options.filter((option) => option.type === "payment_method").sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
  }), [options])

  async function load() {
    setOptions(await readJson<DocumentMasterDataOption[]>(await fetch("/api/document-master-data", { cache: "no-store" })))
  }

  useEffect(() => {
    void load().catch((error) => setNotice({ type: "error", message: error.message }))
  }, [])

  async function createOption() {
    setBusy(true)
    setNotice(null)
    try {
      await readJson<DocumentMasterDataOption>(await fetch("/api/document-master-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", option: { type, value, label } }),
      }))
      setValue("")
      setLabel("")
      await load()
      setNotice({ type: "success", message: "Master data option saved." })
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not save master data option." })
    } finally {
      setBusy(false)
    }
  }

  async function updateOption(option: DocumentMasterDataOption, changes: Partial<DocumentMasterDataOption>) {
    setBusy(true)
    setNotice(null)
    try {
      const updated = await readJson<DocumentMasterDataOption>(await fetch("/api/document-master-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: option.id, option: changes }),
      }))
      setOptions((current) => current.map((item) => item.id === updated.id ? updated : item))
      setNotice({ type: "success", message: "Master data option updated." })
    } catch (error) {
      setNotice({ type: "error", message: error instanceof Error ? error.message : "Could not update master data option." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Document Options</h2>
          <p className="mt-1 text-sm text-muted-foreground">Currencies and payment methods used by OCR review.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{grouped.currency.filter((option) => option.isActive).length} active currencies</Badge>
          <Badge variant="secondary">{grouped.payment_method.filter((option) => option.isActive).length} active methods</Badge>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[12rem_12rem_minmax(14rem,1fr)_auto] lg:items-end">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Type</span>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as DocumentMasterDataType)}>
              <option value="currency">Currency</option>
              <option value="payment_method">Payment Method</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Value</span>
            <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={type === "currency" ? "MYR" : "bank_transfer"} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Label</span>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={type === "currency" ? "MYR" : "Bank Transfer"} />
          </label>
          <Button onClick={() => void createOption()} disabled={busy || !value.trim() || !label.trim()}>
            <Plus className="size-4" />
            Add
          </Button>
        </div>
        {notice ? <p className={notice.type === "error" ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-muted-foreground"}>{notice.message}</p> : null}
      </Card>

      <Tabs value={tab} onValueChange={(value) => setTab(value as DocumentMasterDataType)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="currency">
            <Landmark className="size-4" />
            Currency
          </TabsTrigger>
          <TabsTrigger value="payment_method">
            <CreditCard className="size-4" />
            Payment Method
          </TabsTrigger>
        </TabsList>

        {(["currency", "payment_method"] as const).map((groupType) => (
          <TabsContent key={groupType} value={groupType} className="mt-0">
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">{TYPE_LABEL[groupType]}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{groupType === "currency" ? "Shown in document review currency selection." : "Controls paid/unpaid posting behavior for OCR documents."}</p>
                </div>
                <Badge variant="secondary">{grouped[groupType].length} options</Badge>
              </div>
              <div className="hidden grid-cols-[11rem_minmax(14rem,1fr)_6rem_7rem_5rem] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
                <span>Value</span>
                <span>Label</span>
                <span>Order</span>
                <span>Status</span>
                <span className="text-right">Save</span>
              </div>
              <div className="divide-y divide-border">
                {grouped[groupType].map((option) => (
                  <div key={option.id} className="grid gap-3 p-4 md:grid-cols-[11rem_minmax(14rem,1fr)_6rem_7rem_5rem] md:items-center">
                    <label className="grid gap-1 md:block">
                      <span className="text-xs font-medium text-muted-foreground md:hidden">Value</span>
                      <Input value={option.value || "(blank)"} disabled className="font-mono" />
                    </label>
                    <label className="grid gap-1 md:block">
                      <span className="text-xs font-medium text-muted-foreground md:hidden">Label</span>
                      <Input value={option.label} onChange={(event) => setOptions((current) => current.map((item) => item.id === option.id ? { ...item, label: event.target.value } : item))} />
                    </label>
                    <label className="grid gap-1 md:block">
                      <span className="text-xs font-medium text-muted-foreground md:hidden">Order</span>
                      <Input inputMode="numeric" value={option.sortOrder} onChange={(event) => setOptions((current) => current.map((item) => item.id === option.id ? { ...item, sortOrder: Number(event.target.value) || 0 } : item))} />
                    </label>
                    <Button variant={option.isActive ? "secondary" : "outline"} size="sm" onClick={() => void updateOption(option, { isActive: !option.isActive })} disabled={busy}>
                      {option.isActive ? "Active" : "Inactive"}
                    </Button>
                    <Button size="icon" variant="outline" aria-label="Save option" onClick={() => void updateOption(option, { label: option.label, sortOrder: option.sortOrder })} disabled={busy} className="justify-self-end">
                      <Save className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}
