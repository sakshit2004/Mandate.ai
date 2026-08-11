# Mandate

Spend-control proxy for agencies. Keep OpenAI/Anthropic keys encrypted server-side; issue capped `mdt_live_…` keys; point any compatible SDK, agent, backend, automation, or HTTP client at Mandate.

[Get started](#quickstart)
[Universal setup](#universal-setup)
[API reference](#api-auth)
[Errors](#errors)

## Quickstart

Get AI usage metering in minutes. Mandate is a drop-in proxy: keep your existing OpenAI/Anthropic client, swap the base URL, and use a capped `mdt_live_…` key.

1. Sign up and create an agency workspace at [/sign-up](/sign-up).
2. Choose a funding path during onboarding:
   - **Bring your own keys** — save OpenAI and/or Anthropic API keys (encrypted at rest)
   - **Try with Mandate credits** — create promo clients that draw from the shared $5 pool
3. Create a client key in [/app](/app). The modal shows both funding choices. Copy `mdt_live_…` immediately — it is shown once.
4. In your SDK, agent, backend, automation, or HTTP client, set the provider base URL to Mandate and paste the Mandate key (not your provider key).
5. Run one small model call. Confirm spend on [Clients](/app) and the [Ledger](/app/ledger).

### Base URLs for this environment

```
OpenAI      {origin}/openai/v1
Anthropic   {origin}/anthropic/v1
Production  https://trymandate.dev
```

On key reveal or the client page, click **copy setup prompt** and paste it into Cursor, Claude Code, ChatGPT, or another coding agent. The prompt tells it to detect and update your existing provider client.

## Universal setup

Mandate is not tied to n8n. It works with any software that lets you configure:

1. An OpenAI or Anthropic API key
2. A custom provider base URL

This includes official provider SDKs, LangChain, LlamaIndex, custom application backends, agent frameworks, n8n, Make, and raw HTTP clients. If a tool hardcodes the provider URL, use its generic HTTP request integration.

### Credentials

| Provider  | Base URL |
|-----------|----------|
| OpenAI    | `{origin}/openai/v1` |
| Anthropic | `{origin}/anthropic/v1` |

Production: `https://trymandate.dev/openai/v1` and `https://trymandate.dev/anthropic/v1`.  
Local default port is `8788` (e.g. `http://localhost:8788/openai/v1`).

```
API key    mdt_live_…   (Mandate client key — not your provider key)
```

Do **not** put the agency's real OpenAI/Anthropic key in the client application or automation.

### Common client patterns

Use your library's `baseURL`, `base_url`, `apiBase`, or equivalent option:

```text
OpenAI client:
  apiKey   = mdt_live_…
  baseURL  = {origin}/openai/v1

Anthropic client:
  apiKey   = mdt_live_…
  baseURL  = {origin}/anthropic/v1
```

For n8n or Make, edit the provider credential's Base URL and API key. If the provider node does not expose a Base URL, use an HTTP Request node.

### Optional header

```
X-Mandate-Tag: intake-sync
```

Use any short slug. It shows up in Mandate's tag breakdown.

### Verify

1. Execute one chat/completions (OpenAI) or messages (Anthropic) call with a tiny prompt.
2. Open Mandate → Clients; spend should move within a few seconds.
3. Open Ledger for request-level detail.

Streaming is supported. Mandate meters final token usage when possible.

## API & auth

### Proxy endpoints

- `POST/GET {origin}/openai/v1/*` → OpenAI API
- `POST/GET {origin}/anthropic/v1/*` → Anthropic API

### Authentication (client application / workflow)

```
Authorization: Bearer mdt_live_…
```

or

```
x-api-key: mdt_live_…
```

Optional attribution:

```
X-Mandate-Tag: agent-or-workflow-name
```

### Agency dashboard API

Authenticated Mandate dashboard calls use Clerk Bearer tokens against `/api/*` (clients, dashboard, usage, providers). AI model calls from any client use the `mdt_live_…` key instead.

### Funding modes

- **BYOK** — upstream calls use the agency's sealed OpenAI/Anthropic keys.
- **MANDATE_PROMO** — upstream calls use Mandate platform keys; all promo clients share $5 total; each key expires in 7 days.

## Errors

| HTTP | Code | Meaning | What to do |
|------|------|---------|------------|
| 401 | `INVALID_MANDATE_KEY` | Missing or wrong Mandate key | Paste the correct `mdt_live_…` key |
| 403 | `CLIENT_KEY_KILLED` | Key paused | Re-enable on the client page |
| 403 | `PROMO_TRIAL_ENDED` | Free credits ended | Add BYOK in Settings, then re-enable |
| 429 | `CLIENT_BUDGET_EXCEEDED` | Cap hit for the period | Raise budget (BYOK) or wait for the next period |
| 429 | `PROMO_POOL_EXHAUSTED` | Shared promo pool used | Add BYOK in Settings |
| 400 | `BYOK_REQUIRED` | Provider keys required | Save OpenAI/Anthropic in Settings |
| 400 | `PROMO_LOCKED` | Cannot edit promo budget/period | Switch to BYOK for custom caps |
| 400 | `INVALID_MANDATE_TAG` | Bad `X-Mandate-Tag` | Use a simple slug |
| 502 | `UPSTREAM_ERROR` | Provider key missing/misconfigured | BYOK: Settings. Promo: platform config |

```json
{
  "error": {
    "code": "CLIENT_BUDGET_EXCEEDED",
    "message": "…",
    "details": {}
  }
}
```

## Free credits

Each workspace can choose **Use Mandate promo** during onboarding or in the new-client modal. All promo clients across all agencies draw from the same pool:

- **Shared budget:** $5 total across all agencies
- **Duration:** each key lasts up to 7 days, or until the shared pool is used
- **Clients:** no fixed limit

Each promo client displays a $5 maximum, but every promo request counts toward the same shared balance. Budget and period cannot be edited while on promo (`PROMO_LOCKED`).

After the trial expires, the key hard-stops with `PROMO_TRIAL_ENDED`. If the shared pool is used first, requests stop with `PROMO_POOL_EXHAUSTED`. To continue:

1. Add your own OpenAI and/or Anthropic keys in **Settings**
2. Re-enable the client key

For custom budgets, use **Bring your own keys** (BYOK).

## Further reading

- [guide.md](/docs/guide.md) — this page as Markdown
- [quickstart.md](/docs/quickstart.md)
- [n8n.md](/docs/n8n.md) — n8n-specific example
- [api.md](/docs/api.md)
- [errors.md](/docs/errors.md)
- [promo.md](/docs/promo.md)
- [llms.txt](/llms.txt) — LLM index
