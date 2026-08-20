"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2, Scale } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ConfirmationDialog } from "@/components/governance/confirmation-dialog"
import { POST_CONFIRMATION_PHRASE } from "@/lib/accounting/governance"
import { cn } from "@/lib/utils"
import { useAccounting } from "@/lib/accounting/store"
import { formatCurrency } from "@/lib/accounting/utils"
import type { JournalEntry } from "@/lib/accounting/types"

interface DraftLine {
  key: string
  accountId: string
  debit: string
  credit: string
}

function emptyLine(): DraftLine {
  return { key: crypto.randomUUID(), accountId: "", debit: "", credit: "" }
}

const today = new Date().toISOString().slice(0, 10)

export function NewEntrySheet() {
  const { accounts, addDraftJournalEntry, addJournalEntry } = useAccounting()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState("")
  const [reference, setReference] = useState("")
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()])
  const [error, setError] = useState("")
  const [pendingEntry, setPendingEntry] = useState<Omit<JournalEntry, "id"> | null>(null)

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + (Number.parseFloat(l.debit) || 0), 0)
    const credit = lines.reduce((s, l) => s + (Number.parseFloat(l.credit) || 0), 0)
    return { debit, credit, diff: debit - credit }
  }, [lines])

  const balanced = Math.abs(totals.diff) < 0.005 && totals.debit > 0

  function reset() {
    setDate(today)
    setDescription("")
    setReference("")
    setLines([emptyLine(), emptyLine()])
    setError("")
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function buildEntry() {
    if (!description.trim()) return setError("Description is required.")
    const used = lines.filter((l) => l.accountId && (Number.parseFloat(l.debit) || Number.parseFloat(l.credit)))
    if (used.length < 2) return setError("A double-entry journal entry needs at least two lines.")
    if (!balanced) return setError("Total debits must equal total credits.")
    if (used.some((l) => Number.parseFloat(l.debit) > 0 && Number.parseFloat(l.credit) > 0)) {
      return setError("A line cannot contain both a debit and a credit amount.")
    }

    return {
      date,
      description: description.trim(),
      reference: reference.trim() || undefined,
      lines: used.map((l) => ({
        accountId: l.accountId,
        debit: Number.parseFloat(l.debit) || 0,
        credit: Number.parseFloat(l.credit) || 0,
      })),
    }
  }

  function saveDraft() {
    const entry = buildEntry()
    if (!entry) return
    addDraftJournalEntry(entry)
    reset()
    setOpen(false)
  }

  function submit() {
    const entry = buildEntry()
    if (!entry) return
    setPendingEntry(entry)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <SheetTrigger
        render={
          <Button>
          <Plus className="size-4" />
          New Entry
        </Button>
        }
      />
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border">
          <SheetTitle>New Journal Entry</SheetTitle>
          <SheetDescription>Record a balanced double-entry posting.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="je-date">Date</Label>
              <Input id="je-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="je-ref">Reference</Label>
              <Input id="je-ref" placeholder="Optional" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="je-desc">Description</Label>
            <Input
              id="je-desc"
              placeholder="Example: Paid September rent"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_88px_88px_32px] items-center gap-2 px-1 text-xs text-muted-foreground">
              <span>Account</span>
              <span className="text-right">Debit</span>
              <span className="text-right">Credit</span>
              <span />
            </div>
            {lines.map((line) => (
              <div key={line.key} className="grid grid-cols-[1fr_88px_88px_32px] items-center gap-2">
                <Select value={line.accountId} onValueChange={(v) => updateLine(line.key, { accountId: v ?? "" })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="font-mono text-xs text-muted-foreground">{a.code}</span> {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  className="text-right font-mono"
                  value={line.debit}
                  onChange={(e) => updateLine(line.key, { debit: e.target.value, credit: "" })}
                />
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  className="text-right font-mono"
                  value={line.credit}
                  onChange={(e) => updateLine(line.key, { credit: e.target.value, debit: "" })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  aria-label="Delete line"
                  onClick={() => setLines((prev) => (prev.length > 2 ? prev.filter((l) => l.key !== line.key) : prev))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="size-4" />
              Add Line
            </Button>
          </div>
        </div>

        <div className="border-t border-border p-4">
          <div
            className={cn(
              "mb-3 flex items-center justify-between rounded-md px-3 py-2.5 text-sm",
              balanced ? "bg-credit/10 text-credit" : "bg-secondary text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-2">
              <Scale className="size-4" />
              {balanced ? "Balanced" : `Difference ${formatCurrency(totals.diff)}`}
            </span>
            <span className="font-mono tabular-nums">
              Dr {formatCurrency(totals.debit)} / Cr {formatCurrency(totals.credit)}
            </span>
          </div>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={saveDraft} disabled={!balanced}>
              Save Draft
            </Button>
            <Button onClick={submit} disabled={!balanced}>
              Post Entry
            </Button>
          </div>
        </div>
      </SheetContent>
      <ConfirmationDialog
        open={!!pendingEntry}
        title="Post Journal Entry"
        description="Review this posting before it is written to the General Ledger."
        impactSummary={`This will post a balanced journal entry of ${formatCurrency(totals.debit)} to the General Ledger. Posted entries cannot be deleted directly and must be corrected with a reversal or adjustment.`}
        confirmationPhrase={POST_CONFIRMATION_PHRASE}
        confirmLabel="Confirm & Post"
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen) setPendingEntry(null)
        }}
        onConfirm={(confirmation) => {
          if (!pendingEntry) return
          addJournalEntry(pendingEntry, confirmation)
          setPendingEntry(null)
          reset()
          setOpen(false)
        }}
      />
    </Sheet>
  )
}
