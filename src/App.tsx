import { useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Menu,
  Play,
  Power,
  SquareTerminal,
  X,
} from 'lucide-react'
import { BrandLogo } from './BrandLogo'

const clients = [
  { slug: 'millbrook-legal', label: 'Millbrook Legal', today: 12.44, spent: 187.02, cap: 200, calls: 18420 },
  { slug: 'harbor-dental', label: 'Harbor Dental', today: 5.31, spent: 84.12, cap: 150, calls: 11932 },
  { slug: 'atlas-freight', label: 'Atlas Freight', today: 0, spent: 250, cap: 250, calls: 27604 },
  { slug: 'beacon-realty', label: 'Beacon Realty', today: 3.82, spent: 62.31, cap: 120, calls: 9081 },
  { slug: 'juniper-wellness', label: 'Juniper Wellness', today: 2.19, spent: 41.66, cap: 75, calls: 6228 },
  { slug: 'copperline-hvac', label: 'Copperline HVAC', today: 1.07, spent: 23.55, cap: 100, calls: 3450 },
]

const features = [
  {
    number: '01',
    title: 'Cap every client key.',
    body: 'Create one Mandate key per client and set a dollar ceiling. At the limit, the next call gets a clear 429.',
  },
  {
    number: '02',
    title: 'Change one base URL.',
    body: 'Route OpenAI and Anthropic calls through a drop-in proxy. Your real provider keys stay encrypted and out of workflows.',
  },
  {
    number: '03',
    title: 'Watch spend move live.',
    body: 'See today, month, cap, and percent used for every client, then open the provider and model breakdown.',
  },
  {
    number: '04',
    title: 'Stop one client instantly.',
    body: 'Disable a client key mid-task. Its next call gets a 403 while every other client keeps running.',
  },
  {
    number: '05',
    title: 'Get warned at 80%.',
    body: 'Mandate emails your team before the hard stop, with the client name, current spend, and cap.',
  },
  {
    number: '06',
    title: 'Export invoice proof.',
    body: 'Download a provider-grouped PDF statement and its CSV byproduct for every client and billing period.',
  },
]

const faqs = [
  {
    question: 'Do I have to move my API accounts to Mandate?',
    answer:
      'No. Keep the providers and workflows you already use. Mandate sits between them as a metering and spend-control layer.',
  },
  {
    question: 'What happens when a client hits their cap?',
    answer:
      'The next request is rejected with HTTP 429 and CLIENT_CAP_REACHED. Your other client keys and workflows continue normally.',
  },
  {
    question: 'Which providers and tools work today?',
    answer:
      'The MVP supports OpenAI and Anthropic through drop-in proxy endpoints, with n8n setup documentation and MCP as an alternate transport.',
  },
  {
    question: 'How does Mandate help with invoicing?',
    answer:
      'Export a fixed PDF statement plus CSV with agency, client, period, provider-grouped usage, and total metered cost.',
  },
  {
    question: 'Can a workflow see my real provider keys?',
    answer:
      'No. Provider credentials are encrypted server-side. Workflows receive only the client-specific Mandate key you can cap or disable.',
  },
]

function Logo() {
  return <BrandLogo href="#top" />
}

function InviteForm({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`invite-form ${compact ? 'compact' : ''}`}>
      <a className="button" href="/sign-up">
        create your free account
        <ArrowRight size={14} />
      </a>
    </div>
  )
}

function DashboardPreview() {
  const [selectedSlug, setSelectedSlug] = useState('harbor-dental')
  const client = clients.find(({ slug }) => slug === selectedSlug) ?? clients[1]
  const fill = Math.round((client.spent / client.cap) * 100)
  const status = fill >= 100 ? 'cap reached' : fill >= 80 ? 'near limit' : 'within budget'
  const openAiCost = client.spent * 0.49
  const miniCost = client.spent * 0.22
  const anthropicCost = client.spent - openAiCost - miniCost
  const providerRows = [
    { name: 'openai · gpt-4o', calls: Math.round(client.calls * 0.12), cost: openAiCost },
    { name: 'openai · gpt-4o-mini', calls: Math.round(client.calls * 0.83), cost: miniCost },
    { name: 'anthropic · claude-sonnet-4', calls: Math.round(client.calls * 0.05), cost: anthropicCost },
  ]

  return (
    <div className="dashboard" aria-label="Mandate client usage dashboard preview">
      <div className="dashboard-bar">
        <div className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span>trymandate.dev · fieldnote automation</span>
        <b>
          <i /> metering live · $412.86 this week
        </b>
      </div>
      <div className="dashboard-grid">
        <div className="client-spotlight">
          <div className="client-picker">
            <label htmlFor="client-select">CLIENT SPOTLIGHT</label>
            <div className="select-wrap">
              <select
                id="client-select"
                value={selectedSlug}
                onChange={(event) => setSelectedSlug(event.target.value)}
              >
                {clients.map((option) => (
                  <option value={option.slug} key={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </div>
          <div className="spotlight-body" key={client.slug}>
            <div
              className={`spend-orbit ${fill >= 100 ? 'stopped' : fill >= 80 ? 'warning' : ''}`}
              style={{
                background: `conic-gradient(currentColor ${fill * 3.6}deg, #e7e3d9 0deg)`,
              }}
            >
              <div>
                <strong>{fill}%</strong>
                <span>of cap</span>
              </div>
            </div>
            <div className="spotlight-summary">
              <span className={`budget-status ${fill >= 100 ? 'stopped' : fill >= 80 ? 'warning' : ''}`}>
                <i /> {status}
              </span>
              <h3>{client.label}</h3>
              <p>{client.slug}</p>
              <div className="spotlight-spend">
                <strong>${client.spent.toFixed(2)}</strong>
                <span>of ${client.cap.toFixed(2)} this month</span>
              </div>
            </div>
          </div>
          <div className="spotlight-stats">
            <span>
              <b>{client.calls.toLocaleString()}</b>
              calls attested
            </span>
            <span>
              <b>${(client.spent / client.calls).toFixed(4)}</b>
              avg. per call
            </span>
            <span>
              <b>${Math.max(client.cap - client.spent, 0).toFixed(2)}</b>
              budget left
            </span>
          </div>
        </div>
        <div className="statement" key={`${client.slug}-statement`}>
          <div className="statement-heading">
            <h3>Usage statement</h3>
            <span>JULY 2026 · {client.label.toUpperCase()}</span>
          </div>
          {providerRows.map((provider) => (
            <div className="statement-row" key={provider.name}>
              <span>{provider.name}</span>
              <b>
                {provider.calls.toLocaleString()} · ${provider.cost.toFixed(2)}
              </b>
            </div>
          ))}
          <div className="statement-total">
            <strong>total metered cost</strong>
            <strong>${client.spent.toFixed(2)}</strong>
          </div>
          <div className="statement-note">
            <span>monthly cap</span>
            <b>${client.cap.toFixed(0)} · {status}</b>
          </div>
          <p>PREPARED BY FIELDNOTE AUTOMATION · ✓ {client.calls.toLocaleString()} CALLS ATTESTED</p>
        </div>
      </div>
    </div>
  )
}

function StatementPreview() {
  const downloadCsv = () => {
    const csv = [
      'provider,model,calls,cost_usd',
      'OpenAI,gpt-4o,2210,91.64',
      'OpenAI,gpt-4o-mini,15289,41.14',
      'Anthropic,claude-sonnet-4,921,54.24',
      'TOTAL,,,187.02',
    ].join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    link.download = 'millbrook-legal-july-2026.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  return (
    <div className="statement-showcase">
      <div className="statement export-statement">
        <div className="statement-heading">
          <div>
            <span>FIELDNOTE AUTOMATION</span>
            <h3>Client usage statement</h3>
          </div>
          <span>JULY 2026 · MILLBROOK LEGAL</span>
        </div>
        <div className="statement-row">
          <span>OpenAI · 17,499 calls</span>
          <b>$132.78</b>
        </div>
        <div className="statement-row">
          <span>Anthropic · 921 calls</span>
          <b>$54.24</b>
        </div>
        <div className="statement-total">
          <strong>total metered cost</strong>
          <strong>$187.02</strong>
        </div>
        <p>GENERATED BY MANDATE · 18,420 CALLS ATTESTED</p>
      </div>
      <div className="export-actions">
        <button type="button" onClick={() => window.print()}>
          <Download size={13} /> save PDF
        </button>
        <button type="button" onClick={downloadCsv}>
          <Download size={13} /> export CSV
        </button>
      </div>
    </div>
  )
}

function ClientGuardDemo() {
  const [limit, setLimit] = useState(150)
  const [savedLimit, setSavedLimit] = useState(150)
  const [killed, setKilled] = useState(false)

  return (
    <div className="guard-console">
      <div className="mini-window-bar">
        <span>client guard / harbor-dental</span>
        <span className={killed ? 'guard-offline' : ''}>{killed ? 'key disabled' : 'metering live'}</span>
      </div>
      <div className="guard-grid">
        <div className="guard-controls">
          <div className="guard-section-label">
            <span>MONTHLY SPEND LIMIT</span>
            <small>HARD STOP</small>
          </div>
          <div className="guard-limit">
            <strong>${limit}.00</strong>
            <span>${Math.max(limit - 84.12, 0).toFixed(2)} remaining</span>
          </div>
          <input
            aria-label="Monthly spend limit"
            type="range"
            min="50"
            max="300"
            step="10"
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
          <div className="cap-scale">
            <span>$50</span>
            <span>current spend · $84.12</span>
            <span>$300</span>
          </div>
          <button
            className={savedLimit === limit ? 'saved' : ''}
            type="button"
            onClick={() => setSavedLimit(limit)}
          >
            {savedLimit === limit ? <Check size={12} /> : null}
            {savedLimit === limit ? `cap saved at $${savedLimit}` : 'save new spend cap'}
          </button>
        </div>
        <div className="guard-events">
          <div className="guard-section-label">
            <span>LIVE CONTROL STREAM</span>
            <small>JUST NOW</small>
          </div>
          <code aria-live="polite">
            <span>02:13:06</span> POST /openai/v1/responses <b>200</b>
            <br />
            <span>02:13:07</span> metered $0.0412 · total $84.12
            <br />
            <span>02:13:08</span> spend cap · <em>${savedLimit}.00</em>
            <br />
            <span>02:13:09</span> agency action ·{' '}
            <em>{killed ? 'KEY_DISABLED' : 'KEY_ENABLED'}</em>
            <br />
            <span>02:13:09</span> next request{' '}
            <b className={killed ? 'blocked' : ''}>{killed ? '403 BLOCKED' : '200 METERED'}</b>
          </code>
          <div className="guard-status">
            <span>
              <i className={killed ? 'off' : ''} /> {killed ? 'client stopped' : 'client running'}
            </span>
            <button type="button" onClick={() => setKilled((current) => !current)}>
              <Power size={11} /> {killed ? 're-enable key' : 'kill client'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div id="top">
      <header className="site-header">
        <nav className="nav shell" aria-label="Main navigation">
          <Logo />
          <button
            className="menu-button"
            type="button"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className={`nav-links ${menuOpen ? 'open' : ''}`}>
            <a href="#product" onClick={() => setMenuOpen(false)}>
              product
            </a>
            <a href="#agencies" onClick={() => setMenuOpen(false)}>
              who it's for
            </a>
            <a href="#docs" onClick={() => setMenuOpen(false)}>
              docs
            </a>
          </div>
          <div className="nav-actions">
            <a className="text-link" href="/sign-in">
              sign in
            </a>
            <a className="button button-small" href="/sign-up">
              start free
            </a>
          </div>
        </nav>
      </header>

      <main>
        <section className="hero shell" id="invite">
          <p className="eyebrow">FOR AGENCIES RUNNING AI AGENTS ON CLIENT WORK</p>
          <h1>
            Bill your clients with proof,
            <br /> not guesswork.
          </h1>
          <p className="hero-copy">
            You pay OpenAI and Anthropic from one account, then re-bill from a spreadsheet.
            Give every client a capped Mandate key, change one base URL, and meter every call
            without exposing your real provider credentials.
          </p>
          <InviteForm />
          <p className="form-note">Open signup · no card required · invite your team</p>
          <DashboardPreview />
          <div className="integrations">
            <span>LOCKED MVP CONNECTIONS</span>
            <b>openai</b>
            <b>anthropic</b>
            <b>n8n</b>
            <b>MCP</b>
          </div>
        </section>

        <section className="section shell" id="product">
          <p className="eyebrow left">WHAT IT DOES</p>
          <h2>
            One spend-control layer between
            <br /> your agents and their APIs.
          </h2>
          <div className="feature-grid">
            {features.map((feature) => (
              <article key={feature.number}>
                <span>{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>

          <div className="guard-feature">
            <div className="guard-copy">
              <div>
                <p className="eyebrow left">SET IT ONCE · STOP IT ANYTIME</p>
                <h2>One guardrail. Two ways to stay in control.</h2>
              </div>
              <div>
              <p>
                  Set the amount you're prepared to absorb, or disable a client key mid-task.
                  Both controls act before the next request reaches the provider.
              </p>
              <ul>
                <li>
                  <Check size={14} /> HTTP 429 with CLIENT_CAP_REACHED
                </li>
                <li>
                    <Check size={14} /> Instant 403 when you stop a key
                </li>
              </ul>
              </div>
            </div>
            <ClientGuardDemo />
          </div>
        </section>

        <section className="section shell" id="agencies">
          <p className="eyebrow left">BUILT FOR THE WORK</p>
          <h2>Built for the shops doing the work.</h2>
          <p className="section-intro">
            For agencies and operators shipping automations, agents, and AI-powered services on
            behalf of clients.
          </p>
          <div className="audience-grid">
            <article>
              <span>AI AGENCY</span>
              <h3>Meter every workflow, per client.</h3>
              <p>One agency account, any number of clients, and a statement for every invoice.</p>
            </article>
            <article>
              <span>OPS CONSULTANCY</span>
              <h3>Re-bill usage without a spreadsheet.</h3>
              <p>Keep automation margins visible while Mandate keeps the underlying proof.</p>
            </article>
          </div>

          <div className="workflow">
            <p className="eyebrow left">HOW IT WORKS</p>
            <h2>How every workflow, per client.</h2>
            <div className="workflow-steps">
              <article>
                <span>01</span>
                <h3>Route</h3>
                <p>Swap the provider base URL for its drop-in Mandate endpoint.</p>
              </article>
              <article>
                <span>02</span>
                <h3>Key</h3>
                <p>Use the capped Mandate key assigned to that client workflow.</p>
              </article>
              <article>
                <span>03</span>
                <h3>Prove</h3>
                <p>Export the exact usage behind each line on your monthly invoice.</p>
              </article>
            </div>
            <pre>
              <code>
                {`# n8n OpenAI credential\nBase URL  https://trymandate.dev/openai/v1\nAPI key   mdt_live_harbor_••••\n\n# Anthropic: /anthropic/v1 · no workflow rewrite`}
              </code>
            </pre>
          </div>

          <div className="split-feature statement-feature">
            <div className="split-copy">
              <p className="eyebrow left">READY FOR THE INVOICE</p>
              <h2>Proof your client can read.</h2>
              <p>
                Export one fixed, presentable PDF with agency, client, period, provider totals,
                and an auditable cost total. The same data downloads as CSV.
              </p>
              <ul>
                <li>
                  <Check size={14} /> Month-to-date or last month
                </li>
                <li>
                  <Check size={14} /> Generated by Mandate
                </li>
              </ul>
            </div>
            <StatementPreview />
          </div>
        </section>

        <section className="launch-section" id="setup">
          <div className="shell launch-grid">
            <div className="split-copy">
              <p className="eyebrow left">N8N IN 30 SECONDS</p>
              <h2>Change the URL. Keep the workflow.</h2>
              <p>
                The setup guide covers both provider routes, client credentials, streaming usage,
                429 and 403 responses, and a one-call verification.
              </p>
              <a className="button guide-button" href="/docs#n8n-setup">
                open n8n setup guide <ArrowRight size={14} />
              </a>
            </div>
            <div className="demo-player" aria-label="30-second n8n setup demo">
              <div className="mini-window-bar">
                <span><Play size={10} /> 30-second setup demo</span>
                <span>loops automatically</span>
              </div>
              <img
                className="demo-gif"
                src="/mandate-n8n-demo.gif"
                alt="Four-step n8n setup: open the credential, change the base URL, add a client key, and verify metered spend."
              />
            </div>
          </div>
        </section>

        <section className="faq-section shell" id="docs">
          <p className="eyebrow left">FAQ</p>
          <h2>The questions agencies actually ask.</h2>
          <a className="text-link docs-link" href="/docs">
            Read the docs <ArrowRight size={14} />
          </a>
          <div className="faq-list">
            {faqs.map((faq, index) => (
              <article className={openFaq === index ? 'open' : ''} key={faq.question}>
                <button
                  type="button"
                  aria-expanded={openFaq === index}
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                >
                  {faq.question}
                  <ChevronDown size={17} />
                </button>
                <div className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="final-cta">
          <div className="shell">
            <SquareTerminal size={22} />
            <h2>Stop finding out when the invoice hits.</h2>
            <p>Create an agency workspace and invite your team in minutes.</p>
            <InviteForm compact />
          </div>
        </section>
      </main>

      <footer className="site-footer shell">
        <div>
          <Logo />
          <p>Spend control for agencies running AI on client work.</p>
        </div>
        <div>
          <span>PRODUCT</span>
          <a href="#product">Overview</a>
          <a href="/docs">docs</a>
          <a href="/sign-up">Create account</a>
        </div>
        <div>
          <span>COMPANY</span>
          <a href="mailto:hello@trymandate.dev">Contact</a>
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
        </div>
        <div>
          <span>STATUS</span>
          <p className="status">
            <i /> Open signup
          </p>
          <p>© 2026 Mandate</p>
        </div>
      </footer>
    </div>
  )
}

export default App
