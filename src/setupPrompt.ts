/** Shared tool-agnostic copy for “setup with AI”. */

export function mandateBaseUrls(origin = typeof window !== 'undefined' ? window.location.origin : 'https://trymandate.dev') {
  return {
    openai: `${origin}/openai/v1`,
    anthropic: `${origin}/anthropic/v1`,
  }
}

export function buildSetupPrompt(opts: {
  mandateKey: string
  clientName?: string
  origin?: string
}): string {
  const urls = mandateBaseUrls(opts.origin)
  const keyLine = opts.mandateKey.startsWith('mdt_live_')
    ? opts.mandateKey
    : `${opts.mandateKey} (paste the full mdt_live_… key you copied from Mandate)`

  return `Configure this AI application, agent, backend, SDK, or automation to send its OpenAI/Anthropic traffic through Mandate (a spend-control proxy).

Client: ${opts.clientName || 'Mandate client'}

Steps:
1. Identify where this project or tool configures its OpenAI or Anthropic client. It must support a custom base URL. If it does not, use its generic HTTP request integration.
2. Set the API key to this Mandate client key (NOT the real OpenAI/Anthropic key):
   ${keyLine}
3. Set the base URL to the matching Mandate endpoint:
   - OpenAI: ${urls.openai}
   - Anthropic: ${urls.anthropic}
4. Optional: add header X-Mandate-Tag (e.g. intake-sync) for attribution in Mandate.
5. Run one small chat/completions (or messages) request to verify.
6. Confirm spend appears under this client in Mandate (/app) within a few seconds.

Docs: ${opts.origin || (typeof window !== 'undefined' ? window.location.origin : '')}/docs
Errors to expect:
- 429 CLIENT_BUDGET_EXCEEDED — raise cap or wait for next period
- 403 CLIENT_KEY_KILLED / PROMO_TRIAL_ENDED — re-enable in Mandate after fixing billing path
Preserve the existing model, request payload, retry behavior, and application logic. Only replace the provider base URL and API key. Explain the exact files or credential fields you changed.`
}
