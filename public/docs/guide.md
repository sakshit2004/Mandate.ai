# Mandate

Spend-control proxy for agencies. Keep OpenAI/Anthropic keys encrypted server-side; issue capped `mdt_live_…` keys; point n8n (or any OpenAI-compatible client) at Mandate.

[Get started](#quickstart)
[n8n setup](#n8n-setup)
[API reference](#api-auth)
[Errors](#errors)

## Quickstart

Get a workflow metering in minutes. Mandate is a drop-in proxy: keep your n8n OpenAI/Anthropic nodes, swap the base URL, use a capped `mdt_live_…` key.

1. Sign up and create an agency workspace at [/sign-up](/sign-up).
2. Onboarding choice:
   - **Bring your own keys** — save OpenAI and/or Anthropic API keys (encrypted at rest)
   - **Try with Mandate credits** — one promo client, $5 for 7 days
3. Create a client key in [/app](/app). Copy `mdt_live_…` immediately — it is shown once.
4. In n8n, set the credential base URL to Mandate and paste the Mandate key (not your provider key).
5. Run one small model call. Confirm spend on [Clients](/app) and the [Ledger](/app/ledger).

### Base URLs for this environment

```
OpenAI      {origin}/openai/v1
Anthropic   {origin}/anthropic/v1
Production  https://trymandate.dev
```

On key reveal or the client page, click **copy setup prompt** and paste it into Cursor / ChatGPT / Claude / n8n AI to wire credentials automatically.

## n8n setup

Keep the same OpenAI or Anthropic node. Change only the credential fields.

### Base URLs

| Provider  | Base URL |
|-----------|----------|
| OpenAI    | `{origin}/openai/v1` |
| Anthropic | `{origin}/anthropic/v1` |

Production: `https://trymandate.dev/openai/v1` and `https://trymandate.dev/anthropic/v1`.  
Local default port is `8788` (e.g. `http://localhost:8788/openai/v1`).

### API key

```
API key    mdt_live_…   (Mandate client key — not your provider key)
```

Do **not** paste the agency's real OpenAI/Anthropic key into n8n.

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

### Authentication (client / workflow)

```
Authorization: Bearer mdt_live_…
```

or

```
x-api-key: mdt_live_…
```

Optional attribution:

```
X-Mandate-Tag: workflow-name
```

### Agency dashboard API

Authenticated browser/app calls use Clerk Bearer tokens against `/api/*` (clients, dashboard, usage, providers). Not for n8n model calls.

### Funding modes

- **BYOK** — upstream calls use the agency's sealed OpenAI/Anthropic keys.
- **MANDATE_PROMO** — upstream calls use Mandate platform keys; one client; $5/week; expires in 7 days then hard-stops (`PROMO_TRIAL_ENDED`).

## Errors

| HTTP | Code | Meaning | What to do |
|------|------|---------|------------|
| 401 | `INVALID_MANDATE_KEY` | Missing or wrong Mandate key | Paste the correct `mdt_live_…` key |
| 403 | `CLIENT_KEY_KILLED` | Key paused | Re-enable on the client page |
| 403 | `PROMO_TRIAL_ENDED` | Free credits ended | Add BYOK in Settings, then re-enable |
| 429 | `CLIENT_BUDGET_EXCEEDED` | Cap hit for the period | Raise budget (BYOK) or wait for the next period |
| 400 | `BYOK_REQUIRED` | Promo used; need provider keys | Save OpenAI/Anthropic in Settings to create more clients |
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

Choosing **Mandate credits** on onboarding unlocks one promo client:

- **Budget:** $5 / weekly (locked)
- **Duration:** 7 days
- **Clients:** one promo client only

Budget and period cannot be edited while on promo (`PROMO_LOCKED`).

After the trial ends, the key hard-stops with `PROMO_TRIAL_ENDED` until you:

1. Add your own OpenAI and/or Anthropic keys in **Settings**
2. Re-enable the client key

To create additional clients or custom budgets, use **Bring your own keys** (BYOK).

## Further reading

- [guide.md](/docs/guide.md) — this page as Markdown
- [quickstart.md](/docs/quickstart.md)
- [n8n.md](/docs/n8n.md)
- [api.md](/docs/api.md)
- [errors.md](/docs/errors.md)
- [promo.md](/docs/promo.md)
- [llms.txt](/llms.txt) — LLM index
