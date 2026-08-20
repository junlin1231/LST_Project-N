# Docker

Build production image:

```bash
docker build -t accounting-system:latest .
```

Run production container:

```bash
docker run -p 3000:3000 --env NODE_ENV=production accounting-system:latest
```

Run production with Compose:

```bash
docker compose up --build
```

Run development with Compose:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Notes:
- The image uses Node 22 Alpine and Next.js standalone output.
- Build context must include `package.json`, `pnpm-lock.yaml`, `next.config.mjs`, `app/`, `components/`, `lib/`, and `public/`.
- Runtime listens on port `3000`.
