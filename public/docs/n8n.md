# Mandate n8n setup

Keep the same OpenAI or Anthropic node. Change only the credential.

## Base URLs

| Provider  | Base URL |
|-----------|----------|
| OpenAI    | `https://trymandate.dev/openai/v1` (or `{your-origin}/openai/v1`) |
| Anthropic | `https://trymandate.dev/anthropic/v1` (or `{your-origin}/anthropic/v1`) |

Local default API port is `8788` (e.g. `http://localhost:8788/openai/v1`).

## API key

Paste the Mandate client key: `mdt_live_…`

Do **not** paste the agency's real OpenAI/Anthropic key into n8n.

## Optional header

`X-Mandate-Tag: intake-sync` (or any short slug) — shows up in Mandate tag breakdown.

## Verify

1. Execute one chat/completions (OpenAI) or messages (Anthropic) call with a tiny prompt.
2. Open Mandate → Clients; spend should move within a few seconds.
3. Open Ledger for request-level detail.

Streaming is supported. Mandate meters final token usage when possible.
