# API & auth

## Proxy endpoints

- `POST/GET {origin}/openai/v1/*` → OpenAI API
- `POST/GET {origin}/anthropic/v1/*` → Anthropic API

Production: `https://trymandate.dev/openai/v1` and `https://trymandate.dev/anthropic/v1`.

## Authentication (client / workflow)

Send the Mandate virtual key:

```
Authorization: Bearer mdt_live_…
```

or

```
x-api-key: mdt_live_…
```

Optional attribution header:

```
X-Mandate-Tag: workflow-name
```

## Agency dashboard API (Clerk session)

Authenticated browser/app calls use Clerk Bearer tokens against `/api/*` (clients, dashboard, usage, providers). Not for n8n model calls.

## Funding modes

- **BYOK** — upstream calls use the agency's sealed OpenAI/Anthropic keys.
- **MANDATE_PROMO** — upstream calls use Mandate platform keys; one client; $5/week; expires in 7 days then hard-stops (`PROMO_TRIAL_ENDED`).
