# API & auth

## Proxy endpoints

- `POST/GET {origin}/openai/v1/*` → OpenAI API
- `POST/GET {origin}/anthropic/v1/*` → Anthropic API

Production: `https://trymandate.dev/openai/v1` and `https://trymandate.dev/anthropic/v1`.

## Authentication (AI client / workflow)

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
X-Mandate-Tag: agent-or-workflow-name
```

## Agency dashboard API (Clerk session)

Authenticated Mandate dashboard calls use Clerk Bearer tokens against `/api/*` (clients, dashboard, usage, providers). Model calls from any SDK, agent, backend, automation, or HTTP client use the `mdt_live_…` key instead.

## Funding modes

- **BYOK** — upstream calls use the agency's sealed OpenAI/Anthropic keys.
- **MANDATE_PROMO** — upstream calls use Mandate platform keys; all promo clients share $5 total; each key expires in 7 days or stops when the shared pool is used.
