# Quickstart

Get a workflow metering in minutes. Mandate is a drop-in proxy: keep your n8n OpenAI/Anthropic nodes, swap the base URL, use a capped `mdt_live_…` key.

## Steps

1. Sign up and create an agency workspace at `/sign-up`.
2. Onboarding choice:
   - **Bring your own keys** — save OpenAI and/or Anthropic API keys (encrypted at rest)
   - **Try with Mandate credits** — one promo client, $5 for 7 days
3. Create a client key in `/app`. Copy `mdt_live_…` immediately — it is shown once.
4. In n8n, set the credential base URL to Mandate and paste the Mandate key (not your provider key).
5. Run one small model call. Confirm spend on [Clients](/app) and the [Ledger](/app/ledger).

## Base URLs for this environment

| Provider  | Base URL |
|-----------|----------|
| OpenAI    | `{origin}/openai/v1` |
| Anthropic | `{origin}/anthropic/v1` |

Production origin: `https://trymandate.dev`

## Setup prompt

On key reveal or the client page, click **copy setup prompt** and paste it into Cursor / ChatGPT / Claude / n8n AI to wire credentials automatically.
