"use client"

import { useEffect, useMemo, useState } from "react"
import { Pencil, RotateCcw, Send } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmationDialog } from "@/components/governance/confirmation-dialog"
import { Amount } from "@/components/amount"
import { POST_CONFIRMATION_PHRASE, REVERSE_CONFIRMATION_PHRASE } from "@/lib/accounting/governance"
import { useAccounting } from "@/lib/accounting/store"
import { formatCurrency, formatDate } from "@/lib/accounting/utils"
import type { JournalEntry } from "@/lib/accounting/types"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface EditableLine {
  key: string
  accountId: string
  debit: string
  credit: string
}

function EditDraftDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: JournalEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { accounts, updateDraftJournalEntry } = useAccounting()
  const [date, setDate] = useState("")
  const [description, setDescription] = useState("")
  const [reference, setReference] = useState("")
  const [lines, setLines] = useState<EditableLine[]>([])
  const [error, setError] = useState("")

  useEffect(() => {
    if (!entry || !open) return
    setDate(entry.date)
    setDescription(entry.description)
    setReference(entry.reference ?? "")
    setLines(
      entry.lines.map((line, index) => ({
        key: `${entry.id}-${index}`,
        accountId: line.accountId,
        debit: line.debit ? String(line.debit) : "",
        credit: line.credit ? String(line.credit) : "",
      })),
    )
    setError("")
  }, [entry, open])

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + (Number.parseFloat(line.debit) || 0), 0)
    const credit = lines.reduce((sum, line) => sum + (Number.parseFloat(line.credit) || 0), 0)
    return { debit, credit, diff: debit - credit }
  }, [lines])

  const balanced = totals.debit > 0 && Math.abs(totals.diff) < 0.005

  function updateLine(key: string, patch: Partial<EditableLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function save() {
    if (!entry) return
    if (!description.trim()) return setError("Description is required.")
    if (!balanced) return setError("Total debits must equal total credits.")
    if (lines.some((line) => Number.parseFloat(line.debit) > 0 && Number.parseFloat(line.credit) > 0)) {
      return setError("A line cannot contain both debit and credit.")
    }

    updateDraftJournalEntry(entry.id, {
      date,
      description: description.trim(),
      reference: reference.trim() || undefined,
      lines: lines.map((line) => ({
        accountId: line.accountId,
        debit: Number.parseFloat(line.debit) || 0,
        credit: Number.parseFloat(line.credit) || 0,
      })),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Draft Entry</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="draft-date">Date</Label>
              <Input id="draft-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="draft-reference">Reference</Label>
              <Input id="draft-reference" value={reference} onChange={(event) => setReference(event.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="draft-description">Description</Label>
            <Input id="draft-description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="space-y-3">
            {lines.map((line) => (
              <div key={line.key} className="grid grid-cols-[1fr_96px_96px] items-center gap-2">
                <Select value={line.accountId} onValueChange={(value) => updateLine(line.key, { accountId: value ?? "" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        <span className="font-mono text-xs text-muted-foreground">{account.code}</span> {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  inputMode="decimal"
                  className="text-right font-mono"
                  value={line.debit}
                  onChange={(event) => updateLine(line.key, { debit: event.target.value, credit: "" })}
                />
                <Input
                  inputMode="decimal"
                  className="text-right font-mono"
                  value={line.credit}
                  onChange={(event) => updateLine(line.key, { credit: event.target.value, debit: "" })}
                />
              </div>
            ))}
          </div>
          <div className="text-sm text-muted-foreground">
            Dr {formatCurrency(totals.debit)} / Cr {formatCurrency(totals.credit)}
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!balanced}>
            Save Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function JournalList() {
  const { journalEntries, accountName, postDraftJournalEntry, reverseJournalEntry } = useAccounting()
  const [query, setQuery] = useState("")
  const [entryToReverse, setEntryToReverse] = useState<JournalEntry | null>(null)
  const [entryToPost, setEntryToPost] = useState<JournalEntry | null>(null)
  const [entryToEdit, setEntryToEdit] = useState<JournalEntry | null>(null)

  const entries = [...journalEntries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((e) => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        e.description.toLowerCase().includes(q) ||
        (e.reference?.toLowerCase().includes(q) ?? false) ||
        e.lines.some((l) => accountName(l.accountId).toLowerCase().includes(q))
      )
    })

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Search description, reference, or account..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-9 w-full max-w-sm rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      {entries.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">No matching journal entries.</Card>
      ) : (
        entries.map((entry) => {
          const total = entry.lines.reduce((s, l) => s + l.debit, 0)
          return (
            <Card key={entry.id} className="gap-0 overflow-hidden py-0">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/40 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">{formatDate(entry.date)}</span>
                  <span className="text-sm font-medium">{entry.description}</span>
                  <Badge variant={entry.status === "draft" ? "secondary" : "outline"}>
                    {entry.status === "draft" ? "Draft" : "Posted"}
                  </Badge>
                  {entry.reference ? (
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {entry.reference}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Amount value={total} className="text-sm font-semibold" />
                  {entry.status === "draft" ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        aria-label="Edit draft journal entry"
                        title="Edit draft"
                        onClick={() => setEntryToEdit(entry)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        aria-label="Post draft journal entry"
                        title="Post draft"
                        onClick={() => setEntryToPost(entry)}
                      >
                        <Send className="size-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      aria-label="Reverse journal entry"
                      title="Reverse journal entry"
                      onClick={() => setEntryToReverse(entry)}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-border">
                {entry.lines.map((line, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_120px_120px] items-center gap-2 px-4 py-2 text-sm"
                  >
                    <span className={line.credit > 0 ? "pl-6 text-muted-foreground" : ""}>
                      {accountName(line.accountId)}
                    </span>
                    <span className="text-right font-mono tabular-nums">
                      {line.debit > 0 ? <Amount value={line.debit} className="text-sm" /> : <span className="text-muted-foreground">-</span>}
                    </span>
                    <span className="text-right font-mono tabular-nums">
                      {line.credit > 0 ? <Amount value={line.credit} className="text-sm" /> : <span className="text-muted-foreground">-</span>}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )
        })
      )}
      <ConfirmationDialog
        open={!!entryToReverse}
        title="Reverse Posted Entry"
        description="Posted journal entries are immutable. A reversal creates a new opposite entry instead of deleting history."
        impactSummary={
          entryToReverse
            ? `This will create a reversing journal entry for "${entryToReverse.description}" dated ${formatDate(entryToReverse.date)}. The original entry remains in the ledger.`
            : ""
        }
        confirmationPhrase={REVERSE_CONFIRMATION_PHRASE}
        confirmLabel="Confirm & Reverse"
        requireReason
        reasonLabel="Reason for reversal"
        onOpenChange={(open) => {
          if (!open) setEntryToReverse(null)
        }}
        onConfirm={(confirmation) => {
          if (!entryToReverse) return
          reverseJournalEntry(entryToReverse.id, confirmation)
          setEntryToReverse(null)
        }}
      />
      <ConfirmationDialog
        open={!!entryToPost}
        title="Post Draft Entry"
        description="Review this draft before it becomes a posted General Ledger entry."
        impactSummary={
          entryToPost
            ? `This will post draft journal entry "${entryToPost.description}" to the General Ledger. Once posted, it cannot be edited or deleted directly.`
            : ""
        }
        confirmationPhrase={POST_CONFIRMATION_PHRASE}
        confirmLabel="Confirm & Post"
        onOpenChange={(open) => {
          if (!open) setEntryToPost(null)
        }}
        onConfirm={(confirmation) => {
          if (!entryToPost) return
          postDraftJournalEntry(entryToPost.id, confirmation)
          setEntryToPost(null)
        }}
      />
      <EditDraftDialog entry={entryToEdit} open={!!entryToEdit} onOpenChange={(open) => !open && setEntryToEdit(null)} />
    </div>
  )
}
