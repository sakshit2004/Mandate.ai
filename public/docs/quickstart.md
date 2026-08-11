# Quickstart

Get AI usage metering in minutes. Mandate is a drop-in proxy: keep your existing OpenAI/Anthropic SDK, agent, backend, automation, or HTTP client; swap the base URL; use a capped `mdt_live_…` key.

## Steps

1. Sign up and create an agency workspace at `/sign-up`.
2. Choose a funding path during onboarding:
   - **Bring your own keys** — save OpenAI and/or Anthropic API keys (encrypted at rest)
   - **Try with Mandate credits** — create promo clients that draw from the shared $5 pool
3. Create a client key in `/app`. The modal shows both funding choices. Copy `mdt_live_…` immediately — it is shown once.
4. In your AI tool or backend, set the credential base URL to Mandate and paste the Mandate key (not your provider key).
5. Run one small model call. Confirm spend on [Clients](/app) and the [Ledger](/app/ledger).

## Base URLs for this environment

| Provider  | Base URL |
|-----------|----------|
| OpenAI    | `{origin}/openai/v1` |
| Anthropic | `{origin}/anthropic/v1` |

Production origin: `https://trymandate.dev`

## Setup prompt

On key reveal or the client page, click **copy setup prompt** and paste it into Cursor, Claude Code, ChatGPT, or another coding agent to wire your existing provider client automatically.

Mandate works with any client that exposes a custom OpenAI or Anthropic base URL. n8n is one supported example, not a requirement.
