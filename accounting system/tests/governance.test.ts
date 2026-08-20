import assert from "node:assert/strict"
import test from "node:test"
import {
  POST_CONFIRMATION_PHRASE,
  buildReversingEntry,
  validateConfirmation,
  type ConfirmationMetadata,
} from "../lib/accounting/governance"

const validConfirmation: ConfirmationMetadata = {
  impactSummary: "This will post a journal entry to the General Ledger.",
  confirmationPhrase: POST_CONFIRMATION_PHRASE,
  confirmedAt: "2026-08-16T10:00:00.000Z",
}

test("confirmation metadata accepts valid deliberate confirmation", () => {
  assert.doesNotThrow(() => validateConfirmation(validConfirmation, POST_CONFIRMATION_PHRASE))
})

test("confirmation metadata rejects missing impact summary", () => {
  assert.throws(
    () => validateConfirmation({ ...validConfirmation, impactSummary: "" }, POST_CONFIRMATION_PHRASE),
    /impact summary/,
  )
})

test("confirmation metadata rejects incorrect confirmation phrase", () => {
  assert.throws(
    () => validateConfirmation({ ...validConfirmation, confirmationPhrase: "YES" }, POST_CONFIRMATION_PHRASE),
    /Type POST/,
  )
})

test("confirmation metadata requires reason when requested", () => {
  assert.throws(() => validateConfirmation(validConfirmation, POST_CONFIRMATION_PHRASE, { requireReason: true }), /audit reason/)
  assert.doesNotThrow(() =>
    validateConfirmation({ ...validConfirmation, reason: "Correction required." }, POST_CONFIRMATION_PHRASE, {
      requireReason: true,
    }),
  )
})

test("reversing entry swaps debit and credit lines", () => {
  const reversal = buildReversingEntry(
    {
      id: "je-1",
      date: "2026-08-16",
      description: "Accrue service revenue",
      reference: "INV-001",
      lines: [
        { accountId: "1200", debit: 106, credit: 0 },
        { accountId: "4000", debit: 0, credit: 100 },
        { accountId: "2100", debit: 0, credit: 6 },
      ],
    },
    "2026-08-17",
  )

  assert.equal(reversal.date, "2026-08-17")
  assert.equal(reversal.reference, "REV-INV-001")
  assert.deepEqual(reversal.lines, [
    { accountId: "1200", debit: 0, credit: 106 },
    { accountId: "4000", debit: 100, credit: 0 },
    { accountId: "2100", debit: 6, credit: 0 },
  ])
})
