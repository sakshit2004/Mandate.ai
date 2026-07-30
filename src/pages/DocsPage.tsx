import { Link } from 'react-router-dom'
import { mandateBaseUrls } from '../setupPrompt'

export function DocsPage() {
  const urls = mandateBaseUrls()

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <Link className="logo" to="/">
            <span className="logo-mark" aria-hidden="true"><span /></span>
            mandate
          </Link>
        </div>
        <div className="app-header-meta">
          <Link to="/app">open app →</Link>
        </div>
      </header>
      <main className="app-main docs-main">
        <p className="eyebrow left">DOCS</p>
        <h1>Get a workflow metering in minutes</h1>
        <p className="auth-copy">
          Mandate is a drop-in proxy: keep your n8n OpenAI/Anthropic nodes, swap the base URL, use a capped{' '}
          <code>mdt_live_…</code> key.
        </p>

        <nav className="docs-toc" aria-label="Docs sections">
          <a href="#quickstart">Quickstart</a>
          <a href="#n8n">n8n setup</a>
          <a href="#errors">Errors</a>
          <a href="#promo">Free credits</a>
          <a href="/docs/quickstart.md">LLM: quickstart.md</a>
        </nav>

        <section id="quickstart" className="detail-card" style={{ marginTop: 28 }}>
          <h2>Quickstart</h2>
          <ol>
            <li>Sign up and create an agency workspace.</li>
            <li>
              Onboarding: <strong>Bring your own keys</strong> (OpenAI/Anthropic) or{' '}
              <strong>Try with Mandate credits</strong> ($5 for 7 days, one client).
            </li>
            <li>Create a client key. Copy the key immediately — it is shown once.</li>
            <li>In n8n, set the credential base URL to Mandate and paste the Mandate key.</li>
            <li>Run one small model call. Confirm spend on <Link to="/app">Clients</Link> and the Ledger.</li>
          </ol>
        </section>

        <section id="n8n" className="detail-card" style={{ marginTop: 20 }}>
          <h2>n8n setup</h2>
          <p className="auth-copy">Use the same OpenAI or Anthropic node. Only change credential fields:</p>
          <pre className="inline-pre">{`OpenAI base URL     ${urls.openai}
Anthropic base URL  ${urls.anthropic}
API key             mdt_live_…  (Mandate client key — not your provider key)`}</pre>
          <p className="auth-copy">
            Optional header: <code>X-Mandate-Tag</code> (e.g. <code>intake-sync</code>) for attribution.
          </p>
          <p className="auth-copy">
            Prefer an AI to wire this? On key reveal or the client page, click <strong>copy setup prompt</strong> and
            paste it into Cursor / ChatGPT / Claude / n8n AI.
          </p>
          <p className="auth-copy">
            Production host: <code>https://trymandate.dev/openai/v1</code> and{' '}
            <code>https://trymandate.dev/anthropic/v1</code>.
          </p>
        </section>

        <section id="errors" className="detail-card" style={{ marginTop: 20 }}>
          <h2>Errors</h2>
          <ul className="breakdown-list">
            <li>
              <span><code>429 CLIENT_BUDGET_EXCEEDED</code></span>
              <b>Cap hit — raise budget (BYOK) or wait for the next period</b>
            </li>
            <li>
              <span><code>403 CLIENT_KEY_KILLED</code></span>
              <b>Key paused — re-enable on the client page</b>
            </li>
            <li>
              <span><code>403 PROMO_TRIAL_ENDED</code></span>
              <b>Free credits ended — add BYOK in Settings, then re-enable</b>
            </li>
            <li>
              <span><code>401 INVALID_MANDATE_KEY</code></span>
              <b>Missing or wrong Mandate key</b>
            </li>
            <li>
              <span><code>400 BYOK_REQUIRED</code></span>
              <b>Promo used — add your own provider keys to create more clients</b>
            </li>
          </ul>
        </section>

        <section id="promo" className="detail-card" style={{ marginTop: 20 }}>
          <h2>Free credits</h2>
          <p className="auth-copy">
            Choosing Mandate credits on onboarding unlocks one promo client: <strong>$5 / weekly</strong> for{' '}
            <strong>7 days</strong>. Budget and period are locked. After the trial, the key hard-stops until you add
            your own OpenAI/Anthropic keys and re-enable the client.
          </p>
        </section>

        <p className="auth-footer" style={{ marginTop: 28 }}>
          <Link to="/">← home</Link> · <a href="/llms.txt">llms.txt</a> · <a href="/llm.txt">llm.txt</a>
        </p>
      </main>
    </div>
  )
}
