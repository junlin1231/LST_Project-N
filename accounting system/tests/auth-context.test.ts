import assert from "node:assert/strict"
import test from "node:test"
import {
  currentCompanyId,
  currentUserId,
  DEMO_COMPANY_ID,
  DEMO_USER_ID,
  runWithTenantContext,
} from "../lib/server/tenant-context"

test("tenant context defaults to the demo principal outside a scoped request", () => {
  assert.equal(currentCompanyId(), DEMO_COMPANY_ID)
  assert.equal(currentUserId(), DEMO_USER_ID)
})

test("tenant context scopes company and user within async request work", async () => {
  const result = await runWithTenantContext(
    { userId: "user-a", companyId: "company-a", role: "accountant" },
    async () => {
      await Promise.resolve()
      return { userId: currentUserId(), companyId: currentCompanyId() }
    },
  )

  assert.deepEqual(result, { userId: "user-a", companyId: "company-a" })
})
