# Django Admin Access Panel Implementation Plan

## Purpose

The access system is managed by a standalone Django project in `admin_panel/`.

This admin panel owns:

- Login and logout.
- User accounts.
- Roles.
- Access requests.
- Invitations.
- Approval and rejection workflow.
- Access audit logs.

It does not include accounting, OCR, invoices, documents, ledgers, reports, or company accounting modules.

## Django Project

```text
admin_panel/
  manage.py
  requirements.txt
  config/
    settings.py
    urls.py
    asgi.py
    wsgi.py
  access/
    models.py
    forms.py
    views.py
    urls.py
    admin.py
    migrations/
    management/commands/bootstrap_admin.py
  templates/access/
  static/access/
```

## Pages

| URL | Purpose |
|---|---|
| `/login/` | Sign in with an approved Django account. |
| `/logout/` | Sign out. |
| `/request-access/` | Public access request form. |
| `/pending-approval/` | Waiting or blocked access screen. |
| `/setup-password/<uid>/<token>/` | User password setup. |
| `/accept-invitation/<id>/` | Invitation acceptance and password setup. |
| `/admin-panel/` | Access dashboard. |
| `/admin-panel/users/` | Manage users, roles, and statuses. |
| `/admin-panel/access-requests/` | Approve or reject access requests. |
| `/admin-panel/invitations/` | Create and revoke invitations. |
| `/admin-panel/audit-logs/` | Review access audit history. |
| `/django-admin/` | Native Django admin. |

## Roles

| Role | Purpose |
|---|---|
| `super_admin` | Full access management control. |
| `admin` | Can manage normal users and access requests. |
| `user` | Approved non-admin user. |

## Statuses

| Status | Meaning |
|---|---|
| `pending` | Waiting for approval. |
| `active` | Can sign in. |
| `disabled` | Blocked from access. |
| `removed` | Soft-removed and blocked. |

## Data Model

The Django app defines:

- `User`, extending Django `AbstractUser`.
- `AccessRequest`.
- `Invitation`.
- `AccessAuditLog`.

## Password Setup

- Admin approves an access request.
- Django creates or updates the user with no usable password.
- Admin copies the setup link from the success message or Users page.
- User opens the setup link, creates a password, and receives the shared accounting access cookie.
- Pending invitations show an accept link; accepting the invitation sends the user into the same setup-password flow.

## First Admin

Create the first super admin with:

```bash
cd admin_panel
python manage.py bootstrap_admin --email admin@example.com --password admin12345 --name "Demo Admin"
```

## Run Locally

```bash
cd admin_panel
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py bootstrap_admin --email admin@example.com --password admin12345 --name "Demo Admin"
python manage.py runserver 127.0.0.1:8000
```

Then open:

```text
http://127.0.0.1:8000/
```

## Removed From Next.js

The previous Next.js admin implementation is no longer used.

Removed:

- Next `/admin` pages.
- Next `/login`, `/request-access`, and `/pending-approval` pages.
- Next admin APIs under `/api/admin`.
- Next auth APIs under `/api/auth`.
- Next access request API.
- Next admin repository/session helpers.
- Next admin migration.
- Next route proxy for admin access.

## Acceptance Criteria

- A user can request access in Django.
- An admin can approve or reject requests.
- Admins can invite users.
- Admins can change roles and statuses.
- Disabled or removed users cannot sign in.
- The last active super admin cannot be removed accidentally.
- Access changes write audit logs.
- The Next.js app no longer owns admin access management.
