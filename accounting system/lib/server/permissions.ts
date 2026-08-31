import "server-only"

import type { CompanyRole, TenantContext } from "./auth-context"

export function requireRole(ctx: TenantContext, allowed: CompanyRole[]) {
  if (!allowed.includes(ctx.role)) {
    throw new Error("Permission denied.")
  }
}

export function canWriteAccounting(role: CompanyRole) {
  return role === "owner" || role === "admin" || role === "accountant" || role === "approver"
}
