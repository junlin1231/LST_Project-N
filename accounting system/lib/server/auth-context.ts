import "server-only"

import { randomUUID } from "node:crypto"
import type { NextRequest } from "next/server"
import { ensureDatabaseReady, query, transaction } from "./db"
import {
  DEMO_COMPANY_ID,
  DEMO_USER_ID,
  SESSION_COOKIE_NAME,
  runWithTenantContext,
  type CompanyRole,
  type TenantContext,
} from "./tenant-context"

export {
  currentCompanyId,
  currentUserId,
  DEMO_COMPANY_ID,
  DEMO_USER_ID,
  SESSION_COOKIE_NAME,
  getCurrentTenantContext,
  runWithTenantContext,
  type CompanyRole,
  type TenantContext,
} from "./tenant-context"

interface MembershipRow {
  company_id: string
  role: CompanyRole
}

function requestUserId(request: NextRequest) {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value.trim() || request.headers.get("x-user-id")?.trim()
}

async function ensureDemoPrincipal() {
  await ensureDatabaseReady()
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO companies (id, name, base_currency, ocr_own_names)
       VALUES ($1, $2, $3, ARRAY[$2]::TEXT[])
       ON CONFLICT (id) DO UPDATE
       SET ocr_own_names = CASE
         WHEN cardinality(companies.ocr_own_names) = 0 THEN ARRAY[EXCLUDED.name]::TEXT[]
         ELSE companies.ocr_own_names
       END`,
      [DEMO_COMPANY_ID, "Demo Company", "MYR"],
    )
    await client.query(
      "INSERT INTO users (id, company_id, name, email, role) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING",
      [DEMO_USER_ID, DEMO_COMPANY_ID, "Demo Admin", "admin@example.com", "admin"],
    )
    await client.query(
      `INSERT INTO company_memberships (id, company_id, user_id, role, status)
       VALUES ($1, $2, $3, 'owner', 'active')
       ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW()`,
      [`membership-${DEMO_USER_ID}-${DEMO_COMPANY_ID}`, DEMO_COMPANY_ID, DEMO_USER_ID],
    )
    await client.query(
      `INSERT INTO user_preferences (user_id, active_company_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [DEMO_USER_ID, DEMO_COMPANY_ID],
    )
  })
}

export async function resolveActiveMembership(userId: string, requestedCompanyId?: string | null): Promise<TenantContext | null> {
  await ensureDemoPrincipal()

  const companyId = requestedCompanyId?.trim()
  const result = companyId
    ? await query<MembershipRow>(
        `SELECT company_id, role
         FROM company_memberships
         WHERE user_id = $1 AND company_id = $2 AND status = 'active'
         LIMIT 1`,
        [userId, companyId],
      )
    : await query<MembershipRow>(
        `SELECT cm.company_id, cm.role
         FROM company_memberships cm
         LEFT JOIN user_preferences up
           ON up.user_id = cm.user_id AND up.active_company_id = cm.company_id
         WHERE cm.user_id = $1 AND cm.status = 'active'
         ORDER BY (up.active_company_id IS NOT NULL) DESC, cm.created_at ASC
         LIMIT 1`,
        [userId],
      )

  const membership = result.rows[0]
  return membership ? { userId, companyId: membership.company_id, role: membership.role } : null
}

export async function requireTenantContext(request: NextRequest): Promise<TenantContext> {
  const userId = requestUserId(request)
  if (!userId) throw new Error("Sign in is required.")
  const ctx = await resolveActiveMembership(userId, request.headers.get("x-company-id"))
  if (!ctx) throw new Error("Company access denied.")
  return ctx
}

export async function withTenantContext<T>(request: NextRequest, callback: (ctx: TenantContext) => Promise<T>) {
  const ctx = await requireTenantContext(request)
  return runWithTenantContext(ctx, () => callback(ctx))
}

export async function listUserCompanies(userId = DEMO_USER_ID) {
  await ensureDemoPrincipal()
  const result = await query<{
    id: string
    name: string
    base_currency: string
    role: CompanyRole
    is_active: boolean
  }>(
    `SELECT c.id, c.name, c.base_currency, cm.role, (up.active_company_id = c.id) AS is_active
     FROM company_memberships cm
     JOIN companies c ON c.id = cm.company_id
     LEFT JOIN user_preferences up ON up.user_id = cm.user_id
     WHERE cm.user_id = $1 AND cm.status = 'active' AND c.status = 'active'
     ORDER BY is_active DESC, c.name ASC`,
    [userId],
  )
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    baseCurrency: row.base_currency,
    role: row.role,
    isActive: row.is_active,
  }))
}

export async function switchActiveCompany(userId: string, companyId: string) {
  const ctx = await resolveActiveMembership(userId, companyId)
  if (!ctx) throw new Error("Company access denied.")
  await query(
    `INSERT INTO user_preferences (user_id, active_company_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id)
     DO UPDATE SET active_company_id = EXCLUDED.active_company_id, updated_at = NOW()`,
    [userId, companyId],
  )
  return ctx
}

export async function createCompanyForUser(userId: string, input: { name: string; baseCurrency?: string }) {
  await ensureDemoPrincipal()
  const name = input.name.trim()
  if (!name) throw new Error("Company name is required.")
  const companyId = `company-${randomUUID()}`
  const membershipId = `membership-${randomUUID()}`
  const baseCurrency = (input.baseCurrency?.trim().toUpperCase() || "MYR").slice(0, 3)

  await transaction(async (client) => {
    await client.query("INSERT INTO companies (id, name, base_currency, ocr_own_names) VALUES ($1, $2, $3, ARRAY[$2]::TEXT[])", [companyId, name, baseCurrency])
    await client.query(
      `INSERT INTO company_memberships (id, company_id, user_id, role, status)
       VALUES ($1, $2, $3, 'owner', 'active')`,
      [membershipId, companyId, userId],
    )
    await client.query(
      `INSERT INTO user_preferences (user_id, active_company_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id)
       DO UPDATE SET active_company_id = EXCLUDED.active_company_id, updated_at = NOW()`,
      [userId, companyId],
    )
  })

  return { id: companyId, name, baseCurrency, role: "owner" as const, isActive: true }
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Enter a valid email address.")
  return normalized
}

function displayNameFromEmail(email: string) {
  return email.split("@")[0]?.replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) || "User"
}

export async function loginByEmail(input: { email: string; name?: string }) {
  await ensureDemoPrincipal()
  const email = normalizeEmail(input.email)
  const existing = await query<{ id: string; name: string; email: string }>(
    "SELECT id, name, email FROM users WHERE email = $1 LIMIT 1",
    [email],
  )
  if (existing.rows[0]) {
    return existing.rows[0]
  }

  const userId = `user-${randomUUID()}`
  const companyId = `company-${randomUUID()}`
  const name = input.name?.trim() || displayNameFromEmail(email)
  const companyName = `${name}'s Company`

  await transaction(async (client) => {
    await client.query(
      "INSERT INTO companies (id, name, base_currency, ocr_own_names) VALUES ($1, $2, 'MYR', ARRAY[$2]::TEXT[])",
      [companyId, companyName],
    )
    await client.query(
      "INSERT INTO users (id, company_id, name, email, role) VALUES ($1, $2, $3, $4, 'admin')",
      [userId, companyId, name, email],
    )
    await client.query(
      `INSERT INTO company_memberships (id, company_id, user_id, role, status)
       VALUES ($1, $2, $3, 'owner', 'active')`,
      [`membership-${randomUUID()}`, companyId, userId],
    )
    await client.query(
      "INSERT INTO user_preferences (user_id, active_company_id) VALUES ($1, $2)",
      [userId, companyId],
    )
  })

  return { id: userId, name, email }
}
