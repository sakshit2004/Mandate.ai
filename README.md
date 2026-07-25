# Mandate

Spend control for agencies running AI agents on client work.

## Local

You need a Postgres database (same as production).

**Option A — Docker Desktop**
```bash
docker compose up -d postgres
```

**Option B — no Docker (Neon free)**  
Create a free DB at [neon.tech](https://neon.tech), copy the connection string into `.env` as `DATABASE_URL`.

Then:
```bash
npm install
npx prisma migrate deploy
npm run dev
```

Open **http://localhost:8788** → `/setup` → `/app`

| Provider  | Base URL |
|-----------|----------|
| OpenAI    | `http://localhost:8788/openai/v1` |
| Anthropic | `http://localhost:8788/anthropic/v1` |

## Deploy on Railway (easiest)

1. Push this repo to GitHub.
2. [railway.app/new](https://railway.app/new) → **Deploy from GitHub repo**.
3. Add **PostgreSQL** → click the web service → **Variables** → **Add reference** → `DATABASE_URL` from Postgres.
4. Set these on the **web service**:

| Variable | Value |
|----------|--------|
| `SESSION_SECRET` | long random string (32+ chars) — **required** |
| `STANDALONE` | `1` |
| `AGENCY_NAME` | your agency name |
| `ALERT_EMAIL_TO` | optional ops email |

5. Generate a public domain on the service.  
   `PUBLIC_BASE_URL` is auto-detected from `RAILWAY_PUBLIC_DOMAIN`.
6. Open `https://YOUR-APP.up.railway.app/setup`.

If deploy fails on **Network › Healthcheck**, open **Deploy Logs** and look for `FATAL:` — almost always missing `SESSION_SECRET` or unlinked `DATABASE_URL`.

**n8n OpenAI base URL:** `https://YOUR-APP.up.railway.app/openai/v1`

`Dockerfile` + `railway.toml` handle build, migrate-on-boot, and health at `/health`.

## Deploy on Render

1. New **Blueprint** → this repo (`render.yaml`).
2. Set `SESSION_SECRET`.
3. Use the Render URL the same way as Railway above.

## Production image locally

```bash
docker compose --profile app up --build
```

## Notes

- Dev emails log to the console (`EMAIL_CONSOLE=1`). Production uses SMTP unless you set `EMAIL_CONSOLE=1`.
- Optional LiteLLM stack: `docker compose -f docker-compose.litellm.yml up` (not needed for standalone).
