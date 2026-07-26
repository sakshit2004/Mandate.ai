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

Create a Clerk application, enable Organizations, and copy `.env.example` to `.env`. Add the
Clerk publishable/secret keys and create a webhook for
`http://localhost:8788/api/webhooks/clerk` with user, organization, and organization-membership
events. Open **http://localhost:8788** → `/sign-up` → `/onboarding` → `/app`.

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
| `ENCRYPTION_KEY` | long random string (32+ chars) — **required** |
| `CLERK_SECRET_KEY` | production Clerk secret key |
| `CLERK_PUBLISHABLE_KEY` | production Clerk publishable key |
| `VITE_CLERK_PUBLISHABLE_KEY` | same public key, available during the Docker build |
| `CLERK_WEBHOOK_SIGNING_SECRET` | signing secret for `/api/webhooks/clerk` |
| `APP_ORIGINS` | exact public app origin |
| `STANDALONE` | `1` |
| `AGENCY_NAME` | your agency name |
| `ALERT_EMAIL_TO` | optional ops email |

5. Generate a public domain on the service.  
   `PUBLIC_BASE_URL` is auto-detected from `RAILWAY_PUBLIC_DOMAIN`.
6. In Clerk, add the Railway domain as an allowed origin/redirect and create the production
   webhook at `https://YOUR-APP.up.railway.app/api/webhooks/clerk`.
7. Open `https://YOUR-APP.up.railway.app/sign-up`.

If deploy fails on **Network › Healthcheck**, open **Deploy Logs** and look for `FATAL:` — usually
a missing Clerk/encryption variable or unlinked `DATABASE_URL`.

**n8n OpenAI base URL:** `https://YOUR-APP.up.railway.app/openai/v1`

`Dockerfile` + `railway.toml` handle build, migrate-on-boot, and health at `/health`.

## Deploy on Render

1. New **Blueprint** → this repo (`render.yaml`).
2. Set the Clerk variables, `ENCRYPTION_KEY`, `APP_ORIGINS`, and
   `VITE_CLERK_PUBLISHABLE_KEY` from `.env.example`.
3. Use the Render URL the same way as Railway above.

## Production image locally

```bash
docker compose --profile app up --build
```

## Notes

- Dev emails log to the console (`EMAIL_CONSOLE=1`). Production uses SMTP unless you set `EMAIL_CONSOLE=1`.
- Optional LiteLLM stack: `docker compose -f docker-compose.litellm.yml up` (not needed for standalone).
- Use separate Clerk development and production instances. Enable email verification and MFA in
  the production instance before open signup.
- To map existing data, set `CLERK_LEGACY_AGENCY_ID` to the existing `Agency.id` for the first
  organization provisioning. If old sealed keys exist, set `LEGACY_ENCRYPTION_KEY` to the former
  session secret and run `npm run db:reencrypt-secrets`.
