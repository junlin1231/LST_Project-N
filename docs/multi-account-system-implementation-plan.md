# Multi-Account System Implementation Plan

## Purpose

This document describes how to convert the current accounting system from a single demo company/user model into a secure multi-account, multi-company system.

In the current codebase, most financial tables already include `company_id`, but server logic is still centered on:

- `DEFAULT_COMPANY_ID = "company-demo"`
- `DEFAULT_USER_ID = "user-demo-admin"`
- API routes that do not resolve the signed-in user or active company.
- Repository functions that read/write only the demo company.

The implementation goal is to make every request run inside an authenticated tenant context:

```ts
{
  userId: string
  companyId: string
  role: "owner" | "admin" | "accountant" | "approver" | "viewer"
}
```

No accounting, OCR, document, report, rule, audit, or workflow operation should run without this context.

## Terminology

- **User account**: A person who can sign in.
- **Company / entity**: A legal accounting entity with its own chart of accounts, contacts, documents, journals, reports, tax setup, and audit logs.
- **Membership**: A user's access to one company, including role and status.
- **Active company**: The company currently selected by the signed-in user.
- **Tenant context**: The server-side `{ userId, companyId, role }` object used to scope every query and permission check.

## Target Behavior

The system should support:

- One user belonging to multiple companies.
- One company having multiple users.
- Per-company roles and permissions.
- Switching active company from the UI.
- Complete data isolation between companies.
- Company-scoped document storage paths.
- Company-scoped OCR, AI categorization, accounting rules, reports, and audit records.
- User-scoped audit logs showing who performed an action inside which company.

## Recommended Architecture

Use a membership-based multi-tenant model.

```text
auth user
  -> user profile
    -> company_memberships
      -> company
        -> accounting data
        -> documents
        -> reports
        -> audit logs
```

Keep a shared PostgreSQL database, but enforce tenant isolation with:

- Application-level `company_id` filtering in every repository function.
- Database indexes and unique constraints using `company_id`.
- Optional PostgreSQL Row Level Security after the application context is stable.
- Tests that prove cross-company reads/writes are blocked.

Do not create separate databases per company at this stage. The current schema is already designed around `company_id`, so shared database tenancy is the simpler and lower-risk path.

## Database Changes

### 1. Keep `companies`

The existing `companies` table is a good foundation. Extend it only if needed.

```sql
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived'));
```

### 2. Refactor `users`

The current `users.company_id` makes each user belong directly to one company. Replace that with company memberships.

Target shape:

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Migration approach:

1. Create `company_memberships`.
2. Backfill memberships from existing `users.company_id`.
3. Drop `users.company_id` only after all code reads memberships.

### 3. Add `company_memberships`

```sql
CREATE TABLE IF NOT EXISTS company_memberships (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'accountant', 'approver', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'disabled')),
  invited_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_memberships_user
  ON company_memberships(user_id, status);

CREATE INDEX IF NOT EXISTS idx_company_memberships_company
  ON company_memberships(company_id, status);
```

### 4. Add User Preferences

Store each user's active company.

```sql
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The server must verify that `active_company_id` belongs to an active membership before using it.

### 5. Add Invitations

```sql
CREATE TABLE IF NOT EXISTS company_invitations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'accountant', 'approver', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE (company_id, email, status)
);
```

### 6. Confirm Company Scoping Across All Tables

Most existing accounting tables already include `company_id`. Audit the migrations and add `company_id` to any table that can expose company data, especially:

- `journal_lines` if direct line queries need tenant filtering without joining `journal_entries`.
- `invoice_items` if direct item queries need tenant filtering without joining `invoices`.
- Any future attachment, export, notification, or integration tables.

For child tables without `company_id`, either:

- Always query through the parent table with a `company_id` join, or
- Add `company_id` for easier isolation and indexing.

For accounting safety, prefer adding `company_id` to child tables that are commonly queried directly.

## Server Context

Add a server-only context resolver:

```ts
// lib/server/auth-context.ts
export interface TenantContext {
  userId: string
  companyId: string
  role: "owner" | "admin" | "accountant" | "approver" | "viewer"
}

export async function requireTenantContext(request: NextRequest): Promise<TenantContext> {
  const userId = await requireAuthenticatedUserId(request)
  const requestedCompanyId = request.headers.get("x-company-id")

  const membership = await resolveActiveMembership(userId, requestedCompanyId)
  if (!membership) throw new Error("Company access denied.")

  return {
    userId,
    companyId: membership.companyId,
    role: membership.role,
  }
}
```

Rules:

- API routes call `requireTenantContext(request)` before any repository call.
- Repository functions accept `ctx: TenantContext` as the first argument.
- Repository functions never import or use `DEFAULT_COMPANY_ID` for real app flows.
- Audit logs use `ctx.userId` and `ctx.companyId`.

Example:

```ts
export async function listAccountingData(ctx: TenantContext) {
  const accounts = await query(
    "SELECT id, code, name, type FROM accounts WHERE company_id = $1 ORDER BY code",
    [ctx.companyId],
  )
}
```

## API Changes

Current route:

```ts
GET /api/accounting
POST /api/accounting
```

Target route behavior:

- Resolve tenant context.
- Validate action payload.
- Check role permission.
- Call repository with `ctx`.

Example:

```ts
export async function GET(request: NextRequest) {
  const ctx = await requireTenantContext(request)
  return NextResponse.json(await listAccountingData(ctx))
}
```

For multi-company management, add:

```text
GET  /api/companies
POST /api/companies
POST /api/companies/switch
GET  /api/companies/[id]/members
POST /api/companies/[id]/members/invite
PATCH /api/companies/[id]/members/[membershipId]
```

## Permission Model

Use company-level roles first. Add fine-grained permissions later only if required.

| Action | owner | admin | accountant | approver | viewer |
|---|---:|---:|---:|---:|---:|
| View company data | Yes | Yes | Yes | Yes | Yes |
| Manage company profile | Yes | Yes | No | No | No |
| Invite users | Yes | Yes | No | No | No |
| Manage roles | Yes | Yes | No | No | No |
| Create drafts | Yes | Yes | Yes | Yes | No |
| Post journals/documents | Yes | Yes | Yes | Yes | No |
| Approve OCR/accounting drafts | Yes | Yes | Yes | Yes | No |
| Reverse/adjust posted entries | Yes | Yes | Yes | No | No |
| Reset company data | Yes | No | No | No | No |

Add a helper:

```ts
export function requireRole(ctx: TenantContext, allowed: TenantContext["role"][]) {
  if (!allowed.includes(ctx.role)) throw new Error("Permission denied.")
}
```

## Frontend Changes

### 1. Add Company Provider

Create a company context for:

- Signed-in user profile.
- List of accessible companies.
- Active company.
- Role in active company.
- Company switch action.

```ts
interface CompanyContextValue {
  companies: CompanySummary[]
  activeCompany: CompanySummary
  role: CompanyRole
  switchCompany: (companyId: string) => Promise<void>
}
```

### 2. Add Company Switcher

Place a company switcher in `components/app-shell.tsx`.

Expected behavior:

- Shows active company name.
- Lists companies the user can access.
- Calls `/api/companies/switch`.
- Refreshes accounting data after switching.

### 3. Pass Company Context To API Calls

Options:

- Store active company server-side in `user_preferences`, then API only needs auth.
- Also send `x-company-id` from the client for explicit switching and easier testing.

Recommended:

- Use `user_preferences.active_company_id` as the default.
- Allow `x-company-id` only when the user has membership.

### 4. Update Accounting Store

`lib/accounting/store.tsx` should refresh when active company changes.

```ts
useEffect(() => {
  void refresh()
}, [refresh, activeCompany.id])
```

## Repository Refactor

Convert from this:

```ts
export async function createAccount(account: Omit<Account, "id">) {
  await query(
    "INSERT INTO accounts (id, company_id, code, name, type) VALUES ($1, $2, $3, $4, $5)",
    [id, DEFAULT_COMPANY_ID, account.code, account.name, account.type],
  )
}
```

To this:

```ts
export async function createAccount(ctx: TenantContext, account: Omit<Account, "id">) {
  requireRole(ctx, ["owner", "admin", "accountant"])

  await query(
    "INSERT INTO accounts (id, company_id, code, name, type) VALUES ($1, $2, $3, $4, $5)",
    [id, ctx.companyId, account.code, account.name, account.type],
  )
}
```

Refactor order:

1. Add `TenantContext`.
2. Update route handlers to create context.
3. Update read functions.
4. Update simple write functions.
5. Update transactional posting functions.
6. Update document/OCR repositories.
7. Remove demo constants from production paths.

Keep demo helpers, but rename them clearly:

- `DEMO_COMPANY_ID`
- `DEMO_USER_ID`
- `ensureDemoCompany()`
- `loadDemoData(ctx?)`

Demo loading should only affect the active company unless explicitly run as a seed script.

## Document Storage Changes

Current document code stores files under a demo company directory.

Target:

```text
ocr/scanned_docs/{companyId}/{documentId}/original.pdf
```

Rules:

- Never accept `companyId` from a public file path.
- Always derive it from `TenantContext`.
- Check `documents.company_id = ctx.companyId` before reading, downloading, processing, confirming, rejecting, posting, or deleting.
- Include `ctx.userId` in `uploaded_by`, confirmations, and posting audit logs.

## Audit Changes

Audit logs must become user- and company-aware.

Every high-risk action should record:

- `company_id`
- `user_id`
- `action`
- `entity_type`
- `entity_id`
- `impact_summary`
- `reason`
- `confirmation_phrase`
- `metadata`
- `created_at`

Use `ctx.userId`, not `DEFAULT_USER_ID`.

## Migration Plan

### Phase 1: Tenant Foundation

- Add `company_memberships`, `user_preferences`, and `company_invitations`.
- Backfill existing `company-demo` membership for `user-demo-admin`.
- Add `TenantContext` and permission helpers.
- Add company listing and switching endpoints.
- Add tests for active company resolution.

### Phase 2: Accounting Repository Refactor

- Change `listAccountingData(ctx)`.
- Change account, contact, invoice, journal, workflow, AR/AP, stock, fixed asset, reporting, and audit functions to accept `ctx`.
- Replace `DEFAULT_COMPANY_ID` with `ctx.companyId`.
- Replace `DEFAULT_USER_ID` with `ctx.userId`.
- Add cross-company leakage tests.

### Phase 3: Document/OCR Refactor

- Change document repository functions to accept `ctx`.
- Store documents under company-scoped paths.
- Ensure OCR, categorization, drafts, confirmations, and posting all use `ctx.companyId`.
- Add tests that one company cannot fetch or post another company's document.

### Phase 4: Frontend Multi-Company UX

- Add company provider.
- Add company switcher to app shell.
- Reload accounting/document state on company switch.
- Add member management screens under settings.
- Hide restricted actions based on role.

### Phase 5: Hardening

- Add database constraints and indexes for tenant-scoped lookups.
- Add optional PostgreSQL Row Level Security.
- Add structured audit events for membership changes.
- Add CI checks for tenant leakage tests.

## Testing Strategy

Add tests for:

- A user can list only companies where membership is active.
- Switching to a company without membership fails.
- `listAccountingData(ctxA)` never returns company B records.
- Creating an account with the same code in two companies succeeds.
- Creating duplicate account codes inside one company fails.
- Posting a journal in company A cannot reference account IDs from company B.
- Invoice posting in company A cannot reference client IDs from company B.
- OCR document download requires matching `company_id`.
- Audit logs are written with the real `user_id` and `company_id`.
- Viewers cannot create, post, reverse, delete, reset, or approve.

## Security Checklist

- All server routes require authentication.
- All repository functions receive `TenantContext`.
- All queries filter by `ctx.companyId` or join through a company-scoped parent.
- All writes validate referenced records belong to `ctx.companyId`.
- All high-risk actions validate role and confirmation metadata.
- Company switching verifies active membership.
- Document paths are derived server-side.
- Audit logs use the authenticated user.
- Demo reset/load actions are owner-only or development-only.

## Acceptance Criteria

The multi-account implementation is complete when:

- A user can belong to more than one company.
- The user can switch active company in the UI.
- Company A and Company B can have separate charts of accounts, contacts, invoices, documents, journals, and reports.
- Same account code can exist in different companies.
- No API response leaks data from another company.
- Cross-company foreign key usage is rejected by service validation.
- Audit logs identify the acting user and company.
- Role permissions block unauthorized posting, reversal, reset, and member-management actions.
- Tests cover positive and negative multi-company paths.

## Suggested First Code Sprint

1. Create migration `014_multi_account_memberships.sql`.
2. Add `lib/server/auth-context.ts`.
3. Add `lib/server/permissions.ts`.
4. Update `/api/accounting` to resolve `TenantContext`.
5. Refactor `listAccountingData(ctx)` first.
6. Add two-company tests proving reads are isolated.
7. Refactor write/posting paths after the read path is stable.

