import type { JournalEntry } from "./types"

export interface ConfirmationMetadata {
  impactSummary: string
  reason?: string
  confirmationPhrase: string
  confirmedAt: string
  requiresReason?: boolean
  supervisorAuthorization?: SupervisorAuthorization
}

export interface SupervisorAuthorization {
  supervisorId: string
  authorizationCode: string
}

export const POST_CONFIRMATION_PHRASE = "POST"
export const REVERSE_CONFIRMATION_PHRASE = "REVERSE"
export const UPDATE_CONFIRMATION_PHRASE = "CONFIRM"
export const ADJUST_CONFIRMATION_PHRASE = "ADJUST"
export const SUPERVISOR_OVERRIDE_CODE = "OVERRIDE"

export function buildReversingEntry(entry: JournalEntry, date = new Date().toISOString().slice(0, 10)): Omit<JournalEntry, "id"> {
  return {
    date,
    description: `Reversal of ${entry.description}`,
    reference: entry.reference ? `REV-${entry.reference}` : `REV-${entry.id}`,
    status: "posted",
    reversedJournalEntryId: entry.id,
    lines: entry.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,
      credit: line.debit,
    })),
  }
}

export function buildAdjustingEntry(
  entry: Omit<JournalEntry, "id">,
  originalEntryId: string,
): Omit<JournalEntry, "id"> {
  return {
    ...entry,
    status: "posted",
    adjustedJournalEntryId: originalEntryId,
  }
}

export function validateConfirmation(
  metadata: ConfirmationMetadata | undefined,
  expectedPhrase: string,
  options: { requireReason?: boolean } = {},
) {
  if (!metadata) {
    throw new Error("Confirmation metadata is required for this action.")
  }
  if (!metadata.impactSummary.trim()) {
    throw new Error("Confirmation impact summary is required.")
  }
  if (metadata.confirmationPhrase.trim().toUpperCase() !== expectedPhrase) {
    throw new Error(`Type ${expectedPhrase} to confirm this action.`)
  }
  if (options.requireReason && !metadata.reason?.trim()) {
    throw new Error("An audit reason is required for this action.")
  }
  if (Number.isNaN(Date.parse(metadata.confirmedAt))) {
    throw new Error("A valid confirmation timestamp is required.")
  }
}

export function validateSupervisorOverride(metadata: ConfirmationMetadata | undefined) {
  const authorization = metadata?.supervisorAuthorization
  if (!authorization?.supervisorId.trim()) {
    throw new Error("Supervisor authorization is required for this action.")
  }
  if (authorization.authorizationCode.trim().toUpperCase() !== SUPERVISOR_OVERRIDE_CODE) {
    throw new Error(`Type ${SUPERVISOR_OVERRIDE_CODE} as the supervisor authorization code.`)
  }
}
