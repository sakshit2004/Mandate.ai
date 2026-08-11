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
`http://localhost:8788/api/webhooks/clerk`. Subscribe to `user.*`, `organization.*`, and
`organizationMembership.*` events. Open **http://localhost:8788** → `/sign-up` → `/onboarding`
→ `/app`.

### Clerk organizations, invitations, and roles

In the Clerk Dashboard:

1. Keep the two organization roles `org:admin` and `org:member`. Organization admins must be
   allowed to manage members and invitations; members should not have those permissions.
2. Configure the application sign-in and sign-up URLs as `/sign-in` and `/sign-up`.
3. Add each app origin to Clerk's allowed origins and redirect URLs. For local development, allow
   `http://localhost:8788`; for production, use the exact Railway or Render HTTPS origin.
4. Keep the webhook endpoint above subscribed to user, organization, and organization-membership
   create/update/delete events. Invitation events are not required because membership events are
   the source of the local user/agency projection.

Admins invite teammates from **App → Team**. Mandate creates the Clerk invitation server-side so
the email contains an `/accept-invitation` redirect for the current app origin. The embedded Clerk
sign-in flow accepts the ticket, then Mandate explicitly activates the invited organization before
opening `/app`. Set `PUBLIC_BASE_URL` to the exact public HTTPS origin so production invitation
emails do not point at localhost or Clerk's Account Portal.

- `ADMIN`: manage team membership, provider credentials, and clients.
- `MEMBER`: view usage and manage clients, but cannot access team or provider settings.

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
| `PUBLIC_BASE_URL` | `https://trymandate.dev` |
| `APP_ORIGINS` | `https://trymandate.dev` |
| `STANDALONE` | `1` |
| `AGENCY_NAME` | your agency name |
| `ALERT_EMAIL_TO` | optional ops email |

5. Under **Public Networking**, add `trymandate.dev` and `www.trymandate.dev` as custom domains.
   Add each CNAME/ALIAS and TXT verification record Railway provides to the domain's DNS.
6. In Clerk, allow `https://trymandate.dev` as an origin/redirect. Keep the existing production
   webhook active during the cutover; a new endpoint can use
   `https://trymandate.dev/api/webhooks/clerk`.
7. Open `https://trymandate.dev/sign-up`.

If deploy fails on **Network › Healthcheck**, open **Deploy Logs** and look for `FATAL:` — usually
a missing Clerk/encryption variable or unlinked `DATABASE_URL`.

**Any OpenAI-compatible client:** set its base URL to `https://trymandate.dev/openai/v1`

**Any Anthropic-compatible client:** set its base URL to `https://trymandate.dev/anthropic/v1`

n8n is one supported example; any SDK, agent, backend, automation, or HTTP client that allows a custom provider base URL can use Mandate.

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
