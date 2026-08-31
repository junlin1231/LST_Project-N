import { AsyncLocalStorage } from "node:async_hooks"

export const DEMO_COMPANY_ID = "company-demo"
export const DEMO_USER_ID = "user-demo-admin"
export const SESSION_COOKIE_NAME = "lst_user_id"

export type CompanyRole = "owner" | "admin" | "accountant" | "approver" | "viewer"

export interface TenantContext {
  userId: string
  companyId: string
  role: CompanyRole
}

const tenantContextStorage = new AsyncLocalStorage<TenantContext>()

export function getCurrentTenantContext() {
  return tenantContextStorage.getStore()
}

export function runWithTenantContext<T>(ctx: TenantContext, callback: () => T) {
  return tenantContextStorage.run(ctx, callback)
}

export function currentCompanyId() {
  return getCurrentTenantContext()?.companyId ?? DEMO_COMPANY_ID
}

export function currentUserId() {
  return getCurrentTenantContext()?.userId ?? DEMO_USER_ID
}
