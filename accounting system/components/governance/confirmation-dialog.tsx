"use client"

import { useEffect, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ConfirmationMetadata } from "@/lib/accounting/governance"

interface ConfirmationDialogProps {
  open: boolean
  title: string
  description: string
  impactSummary: string
  confirmationPhrase: string
  confirmLabel: string
  requireReason?: boolean
  reasonLabel?: string
  onOpenChange: (open: boolean) => void
  onConfirm: (metadata: ConfirmationMetadata) => void
}

export function ConfirmationDialog({
  open,
  title,
  description,
  impactSummary,
  confirmationPhrase,
  confirmLabel,
  requireReason = false,
  reasonLabel = "Audit reason",
  onOpenChange,
  onConfirm,
}: ConfirmationDialogProps) {
  const [typedPhrase, setTypedPhrase] = useState("")
  const [reason, setReason] = useState("")

  useEffect(() => {
    if (!open) {
      setTypedPhrase("")
      setReason("")
    }
  }, [open])

  const phraseMatches = typedPhrase.trim().toUpperCase() === confirmationPhrase
  const reasonReady = !requireReason || reason.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
            <div className="mb-1 font-medium">Impact Summary</div>
            <p className="text-muted-foreground">{impactSummary}</p>
          </div>

          {requireReason ? (
            <div className="grid gap-2">
              <Label htmlFor="confirmation-reason">{reasonLabel}</Label>
              <Input
                id="confirmation-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Enter the audit remark"
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="confirmation-phrase">Type {confirmationPhrase} to continue</Label>
            <Input
              id="confirmation-phrase"
              value={typedPhrase}
              onChange={(event) => setTypedPhrase(event.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!phraseMatches || !reasonReady}
            onClick={() => {
              onConfirm({
                impactSummary,
                reason: reason.trim() || undefined,
                confirmationPhrase,
                confirmedAt: new Date().toISOString(),
                requiresReason: requireReason,
              })
              onOpenChange(false)
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
