# Docker deployment

## Share or deploy the application

Requirements: Docker Desktop or Docker Engine with the Compose plugin.

1. Create the private deployment configuration:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env.local` for local Docker OCR settings, or create `.env` for shared deployment defaults. Replace `POSTGRES_PASSWORD` with a long, unique password. Add the optional AI OCR credentials only if you want vision OCR and receipt splitting.
   Also replace `DJANGO_SECRET_KEY`, `AUTH_SHARED_SECRET`, and `ADMIN_PASSWORD`.

3. Start the application:

   ```bash
   docker compose up --build -d
   ```

Open:

```text
Admin management: http://localhost:8000
Accounting app:   http://localhost:3000
```

The accounting app automatically creates and migrates its database on first start. The admin panel uses the same PostgreSQL database and owns company registration, company membership, login approval, and roles.

Default admin login comes from `.env`:

```text
ADMIN_EMAIL
ADMIN_PASSWORD
```

Create companies from `/admin-panel/companies/`, then assign approved users to one or more companies. Users without an active company membership cannot enter the accounting app.

The database and uploaded source files are kept in the `postgres_data` and `document_data` Docker volumes. Do not run `docker compose down -v` unless you intentionally want to delete all accounting data and uploads.

The `web` container reads `accounting system/.env.local` through Compose. If OCR says it is not configured in Docker, confirm `URL`, `LLM_MODEL`, `LLM_PROVIDER`, and `BEARER_TOKEN` are present in `.env.local`, then recreate the web container.

To update a shared installation after pulling new code:

```bash
docker compose up --build -d
```

To view startup logs:

```bash
docker compose logs -f web
docker compose logs -f admin_web
```

## Development with Docker

```bash
docker compose -f docker-compose.dev.yml up --build
```

The development container installs dependencies from `pnpm-lock.yaml` before starting, so newly added packages such as `sharp` are available. Its database and uploaded-file volume are persistent as well. The dev compose also starts the admin panel on `http://localhost:8000`.

## Notes

- The production image uses Node 22 Alpine and Next.js standalone output.
- PostgreSQL is available only to the application containers in production; it is not published to the host network.
- The runtime listens on port `3000`. For a public deployment, put a TLS-enabled reverse proxy in front of it.
- The admin runtime listens on port `8000`; put it behind the same trusted deployment boundary as the accounting app.
