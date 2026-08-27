# Docker deployment

## Share or deploy the application

Requirements: Docker Desktop or Docker Engine with the Compose plugin.

1. Create the private deployment configuration:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and replace `POSTGRES_PASSWORD` with a long, unique password. Add the optional AI OCR credentials only if you want vision OCR and receipt splitting.

3. Start the application:

   ```bash
   docker compose up --build -d
   ```

Open `http://localhost:3000`. The app automatically creates and migrates its database on first start.

The database and uploaded source files are kept in the `postgres_data` and `document_data` Docker volumes. Do not run `docker compose down -v` unless you intentionally want to delete all accounting data and uploads.

To update a shared installation after pulling new code:

```bash
docker compose up --build -d
```

To view startup logs:

```bash
docker compose logs -f web
```

## Development with Docker

```bash
docker compose -f docker-compose.dev.yml up --build
```

The development container installs dependencies from `pnpm-lock.yaml` before starting, so newly added packages such as `sharp` are available. Its database and uploaded-file volume are persistent as well.

## Notes

- The production image uses Node 22 Alpine and Next.js standalone output.
- PostgreSQL is available only to the application container in production; it is not published to the host network.
- The runtime listens on port `3000`. For a public deployment, put a TLS-enabled reverse proxy in front of it.
