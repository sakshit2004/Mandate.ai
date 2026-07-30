# Mandate quickstart

Mandate is a spend-control API proxy for agencies.

## Happy path (n8n)

1. Create a Mandate account and agency workspace at https://trymandate.dev/sign-up
2. Onboarding choice:
   - **BYOK**: save OpenAI and/or Anthropic API keys (encrypted at rest)
   - **Mandate promo**: one free client, $5 weekly budget, expires after 7 days
3. Create a client key in /app. Copy `mdt_live_…` immediately (shown once).
4. In n8n OpenAI/Anthropic credentials:
   - Base URL: `{origin}/openai/v1` or `{origin}/anthropic/v1`
   - API key: the Mandate client key (not the real provider key)
5. Run one small completion. Confirm spend on /app and /app/ledger.

Production origin: `https://trymandate.dev`

## Setup prompt

On key reveal or client detail, use **Copy setup prompt** and paste into an AI coding agent to wire n8n automatically.
