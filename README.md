# LST Accounting System

End-to-end accounting and access-management system for multi-company financial operations.

This repository contains three cooperating parts:

- `accounting system/` - Next.js accounting application with PostgreSQL persistence.
- `admin_panel/` - Django access-management panel for login, users, roles, invitations, approvals, and access audit logs.
- `ocr/` - local document intake area for scanned documents and receipt source files.

The accounting app is intentionally separate from the Django access panel. Django owns user access and issues the shared access cookie; the Next.js app verifies that cookie before serving accounting workflows.

## System Capabilities

- Double-entry accounting with chart of accounts, journals, ledger validation, and reporting.
- Cash and bank management.
- Accounts receivable, invoices, receipts, and customer balances.
- Accounts payable, vendor bills, payment vouchers, and vendor balances.
- Document upload, OCR processing, categorization, review, confirmation, rejection, draft generation, and posting.
- Receipt splitting for scanned images that contain multiple receipts.
- Stock and warehouse workflows.
- Multi-company support with company switching and tenant-scoped records.
- Settings and master data screens for company/document configuration.
- Audit and governance controls for high-impact financial actions.
- Standalone Django user access flow with access requests, invitations, roles, statuses, and audit logs.

## Repository Layout

```text
.
|-- accounting system/          # Next.js accounting app
|   |-- app/                    # App Router pages and API routes
|   |-- components/             # UI and accounting workflow components
|   |-- db/migrations/          # PostgreSQL schema migrations
|   |-- lib/accounting/         # Domain types, calculations, stores, reports
|   |-- lib/server/             # Server repositories, auth context, OCR adapters
|   |-- tests/                  # TypeScript/node test suite
|   `-- DOCKER.md               # Accounting app Docker notes
|-- admin_panel/                # Django access-management app
|   |-- access/                 # Access models, forms, views, commands
|   |-- config/                 # Django settings and routing
|   |-- templates/access/       # Django templates
|   `-- static/access/          # Admin panel styles
|-- docs/                       # Architecture and implementation plans
`-- ocr/                        # OCR intake documentation and local scan storage
```

## Main URLs

When running locally:

- Accounting app: `http://localhost:3000`
- Access panel: `http://localhost:8000`
- Django admin: `http://localhost:8000/django-admin/`

Access flow:

```text
Open http://localhost:3000/
No lst_access_token cookie -> redirect to http://localhost:8000/login/?next=http://localhost:3000/
Django login success -> set lst_access_token -> return to accounting app
```

Use `localhost` for both apps so the shared cookie works across ports.

## Quick Start With Docker

Requirements:

- Docker Desktop or Docker Engine with Compose

Start the access panel:

```bash
cd admin_panel
cp .env.example .env
docker compose up --build
```

In another terminal, start the accounting app:

```bash
cd "accounting system"
cp .env.example .env
docker compose up --build
```

For a connected local setup, make sure both `.env` files use the same `AUTH_SHARED_SECRET`.

Default admin panel Docker login:

```text
Email: admin@example.com
Password: admin12345
```

The accounting app automatically runs database migrations on container startup. Accounting records are stored in the `postgres_data` Docker volume, and uploaded source documents are stored in the `document_data` Docker volume.

## Local Development

### Accounting App

Requirements:

- Node.js 22+
- pnpm 10.17.1+
- PostgreSQL

Setup:

```bash
cd "accounting system"
pnpm install
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

Useful scripts:

```bash
pnpm dev          # Start Next.js development server
pnpm build        # Build production app
pnpm start        # Start production server
pnpm typecheck    # Type-check the app
pnpm test         # Run TypeScript build plus node tests
pnpm db:migrate   # Run SQL migrations from db/migrations
```

### Django Access Panel

Requirements:

- Python 3.12+

Setup:

```bash
cd admin_panel
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py bootstrap_admin --email admin@example.com --password admin12345 --name "Demo Admin"
python manage.py runserver 127.0.0.1:8000
```

## Environment Variables

The two apps must agree on:

```text
AUTH_SHARED_SECRET
ACCESS_COOKIE_NAME
```

Accounting app highlights:

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
DATABASE_URL
AUTH_SHARED_SECRET
ACCESS_COOKIE_NAME
DJANGO_LOGIN_URL
DOCUMENT_STORAGE_ROOT
URL
LLM_MODEL
LLM_PROVIDER
BEARER_TOKEN
AI_OCR_TIMEOUT_SECONDS
AI_BANK_OCR_PAGE_TIMEOUT_SECONDS
```

Django access panel highlights:

```text
DJANGO_SECRET_KEY
DJANGO_DEBUG
DJANGO_ALLOWED_HOSTS
AUTH_SHARED_SECRET
ACCOUNTING_APP_URL
ACCESS_COOKIE_NAME
ACCESS_COOKIE_MAX_AGE
DATABASE_URL
ADMIN_EMAIL
ADMIN_PASSWORD
ADMIN_NAME
```

Leave the optional OCR/AI endpoint variables blank to use local fallback behavior.

## Accounting Modules

The Next.js app exposes these main sections:

- Dashboard
- Journal
- Cash & Bank
- Receivable
- Payable
- Documents
- Stock
- Reports
- Settings

Core data is persisted in PostgreSQL through migrations in `accounting system/db/migrations/`. Server-side repositories live in `accounting system/lib/server/`, and accounting domain logic lives in `accounting system/lib/accounting/`.

## Access Panel Modules

The Django panel exposes:

- `/login/` - sign in
- `/logout/` - sign out
- `/request-access/` - public access request form
- `/pending-approval/` - pending account screen
- `/setup-password/<uid>/<token>/` - password setup
- `/accept-invitation/<id>/` - invitation acceptance
- `/admin-panel/` - access dashboard
- `/admin-panel/users/` - user management
- `/admin-panel/access-requests/` - approve or reject requests
- `/admin-panel/invitations/` - invite or revoke users
- `/admin-panel/audit-logs/` - access audit log
- `/django-admin/` - Django built-in admin

Roles:

- `super_admin` - full access management control
- `admin` - manage normal users and requests
- `user` - approved user without admin privileges

Statuses:

- `pending`
- `active`
- `disabled`
- `removed`

## OCR And Documents

Local development stores uploaded files and captured photos under `ocr/scanned_docs/` or the configured document storage root.

The accounting app records document metadata, OCR output, categorization results, editable accounting drafts, posting confirmations, and audit history in PostgreSQL. Original uploaded files should remain unchanged so posted accounting records can be traced back to source evidence.

For image uploads that contain multiple receipts, the app can preserve the original and create cropped child documents so each receipt can be scanned, categorized, reviewed, and posted independently.

## Governance Model

The system is designed around accounting safety:

- Posted records are treated as immutable.
- High-impact actions require confirmation metadata.
- Reversals and adjustments are preferred over editing posted financial history.
- Tenant context scopes accounting, OCR, document, report, settings, and audit queries by company.
- Audit records identify the acting user, company, action, entity, reason, impact summary, and timestamp.

## Tests And Quality Checks

Run the accounting app tests from `accounting system/`:

```bash
pnpm test
pnpm typecheck
```

Run Django checks from `admin_panel/`:

```bash
python manage.py check
python manage.py test
```

## Documentation

Useful deeper docs:

- `accounting system/DOCKER.md` - Docker deployment notes for the accounting app.
- `admin_panel/README.md` - Django access panel setup and behavior.
- `ocr/README.md` - OCR intake notes.
- `docs/accounting-system-detailed.md` - full system blueprint.
- `docs/accounting-system-implementation-checklist.md` - implementation checklist.
- `docs/accounting-system-governance-checklist.md` - governance checklist.
- `docs/multi-account-system-implementation-plan.md` - multi-company architecture.
- `docs/admin-access-panel-implementation-plan.md` - access panel architecture.
- `docs/reporting-module-implementation-plan.md` - reporting module plan.
- `docs/stock-module-implementation-plan.md` - stock module plan.
- `docs/receivable-payable-module-implementation-plan.md` - AR/AP module plan.

## Deployment Notes

- Replace all demo secrets and passwords before sharing or deploying.
- Use a long random `POSTGRES_PASSWORD`, `DJANGO_SECRET_KEY`, and `AUTH_SHARED_SECRET`.
- Put a TLS-enabled reverse proxy in front of public deployments.
- Do not run `docker compose down -v` unless you intentionally want to delete persisted databases and uploaded documents.
- Keep the accounting and admin panel cookie settings aligned when deploying behind a custom domain.
