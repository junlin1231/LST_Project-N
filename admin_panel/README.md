# Django Admin Access Panel

Standalone Django admin panel for managing system access. This project owns login, users, roles, access requests, invitations, and audit logs.

It is intentionally separate from the Next.js accounting/OCR app.

## Setup

```bash
cd admin_panel
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py bootstrap_admin --email admin@example.com --password admin12345 --name "Demo Admin"
python manage.py runserver 127.0.0.1:8000
```

Open:

```text
http://127.0.0.1:8000/
```

## Docker

```bash
cd admin_panel
docker compose up --build
```

Open:

```text
http://127.0.0.1:8000/
```

Default Docker login:

```text
Email: admin@example.com
Password: admin12345
```

## Accounting App Gate

The accounting app at `http://localhost:3000/` is protected by the Django login.

Flow:

```text
Open http://localhost:3000/
No lst_access_token cookie -> redirect to http://localhost:8000/login/?next=http://localhost:3000/
Django login success -> set lst_access_token -> return to accounting app
```

Both apps must use the same `AUTH_SHARED_SECRET`.

For local Docker, both compose files default to:

```text
AUTH_SHARED_SECRET=dev-only-change-me
ACCESS_COOKIE_NAME=lst_access_token
```

Use `localhost` for both apps. Cookies are shared by host, not port, so `localhost:8000` and `localhost:3000` work together.

## Pages

- `/login/` - sign in
- `/logout/` - sign out
- `/request-access/` - public access request form
- `/pending-approval/` - pending account screen
- `/setup-password/<uid>/<token>/` - user password setup
- `/accept-invitation/<id>/` - invitation acceptance and password setup
- `/admin-panel/` - access dashboard
- `/admin-panel/users/` - user management
- `/admin-panel/access-requests/` - approve/reject requests
- `/admin-panel/invitations/` - invite or revoke users
- `/admin-panel/audit-logs/` - access audit log
- `/django-admin/` - Django built-in admin

## Roles

- `super_admin` - full access
- `admin` - manage normal users and requests
- `user` - approved user, not an admin

## Statuses

- `pending`
- `active`
- `disabled`
- `removed`

## New User Passwords

Approved users and invited users set their own password from a setup link.

- Approved access requests show the password setup link in the success message.
- Users without a usable password show a setup link on `/admin-panel/users/`.
- Pending invitations show an accept link on `/admin-panel/invitations/`.

No email server is configured yet, so the admin copies the link and sends it manually.
