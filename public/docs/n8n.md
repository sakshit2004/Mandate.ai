# n8n setup

Keep the same OpenAI or Anthropic node. Change only the credential fields.

## Base URLs

| Provider  | Base URL |
|-----------|----------|
| OpenAI    | `{origin}/openai/v1` |
| Anthropic | `{origin}/anthropic/v1` |

Production:

| Provider  | Base URL |
|-----------|----------|
| OpenAI    | `https://trymandate.dev/openai/v1` |
| Anthropic | `https://trymandate.dev/anthropic/v1` |

Local default API port is `8788` (e.g. `http://localhost:8788/openai/v1`).

## API key

```
API key    mdt_live_…   (Mandate client key — not your provider key)
```

Do **not** paste the agency's real OpenAI/Anthropic key into n8n.

## Optional header

```
X-Mandate-Tag: intake-sync
```

Use any short slug. It shows up in Mandate's tag breakdown.

## Setup with AI

Prefer an AI to wire this? On key reveal or the client page, click **copy setup prompt** and paste it into Cursor / ChatGPT / Claude / n8n AI.

## Verify

1. Execute one chat/completions (OpenAI) or messages (Anthropic) call with a tiny prompt.
2. Open Mandate → Clients; spend should move within a few seconds.
3. Open Ledger for request-level detail.

Streaming is supported. Mandate meters final token usage when possible.
