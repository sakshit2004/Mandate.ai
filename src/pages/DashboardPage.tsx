import { FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Download, Power, Plus, RefreshCw } from 'lucide-react'
import { OrganizationSwitcher, UserButton } from '@clerk/clerk-react'
import { Agency, formatUsd, mandateApi, SpendRow, UsageLogRow } from '../api'
import { BrandLogo } from '../BrandLogo'
import { buildN8nSetupPrompt, mandateBaseUrls } from '../setupPrompt'
import { useAgency } from './AuthPages'

function AppNav({ agencyName, role }: { agencyName: string; role: 'ADMIN' | 'MEMBER' }) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <BrandLogo to="/app" />
        <nav className="app-nav" aria-label="App">
          <NavLink to="/app" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
            clients
          </NavLink>
          <NavLink to="/app/ledger" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            ledger
          </NavLink>
          {role === 'ADMIN' && (
            <>
              <NavLink to="/app/team" className={({ isActive }) => (isActive ? 'active' : undefined)}>
                team
              </NavLink>
              <NavLink to="/app/settings" className={({ isActive }) => (isActive ? 'active' : undefined)}>
                settings
              </NavLink>
            </>
          )}
          <NavLink to="/docs" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            docs
          </NavLink>
        </nav>
      </div>
      <div className="app-header-meta">
        <span>{agencyName}</span>
        <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/app" />
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  )
}

function formatLedgerTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function DashboardPage() {
  const { agency, loading, refresh } = useAgency()
  const navigate = useNavigate()
  const [rows, setRows] = useState<SpendRow[]>([])
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)

  async function load() {
    try {
      const data = await mandateApi.dashboard()
      setRows(data.clients)
      setGeneratedAt(data.generatedAt)
      setError('')
      setStale(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard')
      setStale(true)
    }
  }

  useEffect(() => {
    if (!agency) return
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [agency])

  if (loading) return <div className="auth-shell"><p className="auth-copy">Loading…</p></div>
  if (!agency) return <Navigate to="/onboarding" replace />

  return (
    <div className="app-shell">
      <AppNav agencyName={agency.name} role={agency.role} />

      <main className="app-main">
        <div className="app-title-row">
          <div>
            <p className="eyebrow left">LIVE SPEND</p>
            <h1>Clients</h1>
            <p className="auth-copy">
              {generatedAt
                ? stale
                  ? 'Showing last successful poll.'
                  : `Updated ${new Date(generatedAt).toLocaleTimeString()}`
                : 'Waiting for first poll…'}
            </p>
          </div>
          <div className="app-actions">
            <button type="button" className="button-ghost" onClick={load}>
              <RefreshCw size={14} /> refresh
            </button>
            <button type="button" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> new client key
            </button>
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {!agency.setupComplete && agency.role === 'ADMIN' && (
          <p className="form-error">
            Finish onboarding — choose Mandate credits or add your OpenAI/Anthropic keys.{' '}
            <Link to="/onboarding">Continue setup →</Link>
          </p>
        )}
        {agency.fundingMode === 'MANDATE_PROMO' && !agency.openaiConfigured && !agency.anthropicConfigured && (
          <p className="auth-copy">
            You are on Mandate free credits: one client, $5 for 7 days. Add your own keys in{' '}
            <Link to="/app/settings">Settings</Link> anytime to create more clients or continue after the trial.
          </p>
        )}
        {createdKey && (
          <KeyRevealPanel
            mandateKey={createdKey}
            onDismiss={() => setCreatedKey(null)}
          />
        )}

        {rows.length === 0 ? (
          <div className="empty-state">
            <p>No client keys yet. Create one, point n8n at Mandate, and watch spend move. See <Link to="/docs">docs</Link>.</p>
          </div>
        ) : (
          <div className="spend-table-wrap">
            <table className="spend-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Today</th>
                  <th>Period</th>
                  <th>Cap</th>
                  <th>% used</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => navigate(`/app/clients/${row.id}`)} className="clickable">
                    <td>
                      <strong>{row.name}</strong>
                      <span className="muted">{row.keyPrefix}… · {row.budgetPeriod}</span>
                    </td>
                    <td>${formatUsd(row.spendTodayUsd)}</td>
                    <td>${formatUsd(row.spendPeriodUsd)}</td>
                    <td>${formatUsd(row.capUsd)}</td>
                    <td>
                      <div className="pct-cell">
                        <div className="pct-bar"><i style={{ width: `${Math.min(row.percentUsed, 100)}%` }} /></div>
                        {row.percentUsed.toFixed(1)}%
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${row.killed ? 'danger' : row.percentUsed >= 100 ? 'danger' : row.percentUsed >= 80 ? 'warn' : 'ok'}`}>
                        {row.killed ? 'killed' : row.percentUsed >= 100 ? 'over cap' : row.percentUsed >= 80 ? 'near limit' : 'live'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showCreate && (
          <CreateClientModal
            agency={agency}
            onClose={() => setShowCreate(false)}
            onCreated={(key) => {
              setCreatedKey(key)
              setShowCreate(false)
              load()
            }}
            onProvidersSaved={() => {
              refresh()
            }}
          />
        )}
      </main>
    </div>
  )
}

function KeyRevealPanel({ mandateKey, onDismiss, clientName }: { mandateKey: string; onDismiss: () => void; clientName?: string }) {
  const urls = mandateBaseUrls()
  const prompt = buildN8nSetupPrompt({ mandateKey, clientName })
  return (
    <div className="key-reveal" role="status">
      <strong>Copy this Mandate key now — it won’t be shown again.</strong>
      <code>{mandateKey}</code>
      <div className="modal-actions" style={{ marginTop: 8 }}>
        <button type="button" className="button-ghost" onClick={() => navigator.clipboard.writeText(mandateKey)}>
          copy key
        </button>
        <button type="button" className="button-ghost" onClick={() => navigator.clipboard.writeText(prompt)}>
          copy setup prompt
        </button>
        <button type="button" className="button-ghost" onClick={onDismiss}>
          dismiss
        </button>
      </div>
      <p className="auth-copy" style={{ marginTop: 12 }}>
        In n8n, set the credential base URL and paste this key:
      </p>
      <pre className="inline-pre">{`OpenAI     ${urls.openai}
Anthropic  ${urls.anthropic}
API key    ${mandateKey}`}</pre>
      <p className="auth-copy">
        <Link to="/docs">Full docs →</Link>
      </p>
    </div>
  )
}

export function LedgerPage() {
  const { agency, loading } = useAgency()
  const [searchParams, setSearchParams] = useSearchParams()
  const clientId = searchParams.get('clientId') || ''
  const status = (searchParams.get('status') || '') as '' | 'success' | 'error'
  const [logs, setLogs] = useState<UsageLogRow[]>([])
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [total, setTotal] = useState(0)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const pageSize = 100
  const [offset, setOffset] = useState(0)

  async function load(nextOffset = offset) {
    try {
      const data = await mandateApi.usage({
        clientId: clientId || undefined,
        status: status || undefined,
        limit: pageSize,
        offset: nextOffset,
      })
      setLogs(data.logs)
      setClients(data.clients)
      setTotal(data.total)
      setGeneratedAt(data.generatedAt)
      setOffset(nextOffset)
      setError('')
      setStale(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ledger')
      setStale(true)
    }
  }

  useEffect(() => {
    if (!agency) return
    setOffset(0)
    load(0)
    const id = setInterval(() => load(0), 4000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agency, clientId, status])

  if (loading) return <div className="auth-shell"><p className="auth-copy">Loading…</p></div>
  if (!agency) return <Navigate to="/onboarding" replace />

  const pageEnd = Math.min(offset + logs.length, total)
  const totalCost = logs.reduce((sum, row) => sum + (row.status === 'error' ? 0 : row.cost_usd), 0)

  return (
    <div className="app-shell">
      <AppNav agencyName={agency.name} role={agency.role} />
      <main className="app-main ledger-main">
        <div className="app-title-row">
          <div>
            <p className="eyebrow left">CALL LEDGER</p>
            <h1>Ledger</h1>
            <p className="auth-copy">
              {generatedAt
                ? stale
                  ? 'Showing last successful poll.'
                  : `${total.toLocaleString()} calls · page updated ${new Date(generatedAt).toLocaleTimeString()}`
                : 'Waiting for first poll…'}
            </p>
          </div>
          <div className="app-actions">
            <button type="button" className="button-ghost" onClick={() => load(offset)}>
              <RefreshCw size={14} /> refresh
            </button>
          </div>
        </div>

        <div className="ledger-toolbar">
          <label>
            Client
            <select
              value={clientId}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams)
                if (e.target.value) next.set('clientId', e.target.value)
                else next.delete('clientId')
                setSearchParams(next)
              }}
            >
              <option value="">all clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                const next = new URLSearchParams(searchParams)
                if (e.target.value) next.set('status', e.target.value)
                else next.delete('status')
                setSearchParams(next)
              }}
            >
              <option value="">all</option>
              <option value="success">success</option>
              <option value="error">error</option>
            </select>
          </label>
          <div className="ledger-summary">
            <span>this page</span>
            <strong>${formatUsd(totalCost, 4)}</strong>
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        {logs.length === 0 ? (
          <div className="empty-state">
            <p>No calls yet. Route a workflow through Mandate and every request lands here.</p>
          </div>
        ) : (
          <div className="spend-table-wrap ledger-wrap">
            <table className="spend-table ledger-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Client</th>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Cost</th>
                  <th>Tag</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => [
                  <tr
                    key={row.id}
                    className="clickable"
                    onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  >
                    <td className="mono">{formatLedgerTime(row.ts)}</td>
                    <td>
                      <strong>{row.client_name}</strong>
                      <span className="muted">{row.key_prefix}…</span>
                    </td>
                    <td className="mono">{row.provider || '—'}</td>
                    <td className="mono model-cell">{row.model}</td>
                    <td className="mono num">{row.tokens_in.toLocaleString()}</td>
                    <td className="mono num">{row.tokens_out.toLocaleString()}</td>
                    <td className="mono num">${formatUsd(row.cost_usd, 4)}</td>
                    <td className="mono">{row.tag || '—'}</td>
                    <td>
                      <span className={`pill ${row.status === 'error' ? 'danger' : 'ok'}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>,
                  expanded === row.id ? (
                    <tr key={`${row.id}-detail`} className="ledger-detail-row">
                      <td colSpan={9}>
                        <div className="ledger-detail">
                          <div>
                            <span>Request ID</span>
                            <code>{row.request_id}</code>
                          </div>
                          <div>
                            <span>Event ID</span>
                            <code>{row.id}</code>
                          </div>
                          <div>
                            <span>Timestamp</span>
                            <code>{row.ts}</code>
                          </div>
                          <div>
                            <span>Tokens</span>
                            <code>
                              {row.tokens_in} in · {row.tokens_out} out ·{' '}
                              {row.tokens_in + row.tokens_out} total
                            </code>
                          </div>
                          <Link to={`/app/clients/${row.client_id}`}>open client →</Link>
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ])}
              </tbody>
            </table>
          </div>
        )}

        {total > pageSize && (
          <div className="ledger-pager">
            <button
              type="button"
              className="button-ghost"
              disabled={offset <= 0}
              onClick={() => load(Math.max(0, offset - pageSize))}
            >
              ← newer
            </button>
            <span className="mono">
              {offset + 1}–{pageEnd} of {total.toLocaleString()}
            </span>
            <button
              type="button"
              className="button-ghost"
              disabled={offset + pageSize >= total}
              onClick={() => load(offset + pageSize)}
            >
              older →
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

function CreateClientModal({
  agency,
  onClose,
  onCreated,
  onProvidersSaved,
}: {
  agency: Agency
  onClose: () => void
  onCreated: (key: string) => void
  onProvidersSaved: () => void
}) {
  const hasByok = agency.openaiConfigured || agency.anthropicConfigured
  const promoEligible =
    !hasByok && agency.fundingMode === 'MANDATE_PROMO' && !agency.promoClientClaimed
  const needsInlineByok = !hasByok && !promoEligible

  const [name, setName] = useState('')
  const [maxBudgetUsd, setMaxBudgetUsd] = useState(promoEligible ? 5 : 50)
  const [budgetPeriod, setBudgetPeriod] = useState<'daily' | 'weekly' | 'monthly'>(
    promoEligible ? 'weekly' : 'monthly',
  )
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [byokReady, setByokReady] = useState(hasByok)

  useEffect(() => {
    setByokReady(hasByok)
    if (hasByok && promoEligible) {
      // agency upgraded mid-modal
      setMaxBudgetUsd((v) => (v === 5 ? 50 : v))
    }
  }, [hasByok, promoEligible])

  async function saveByok() {
    if (!openaiApiKey && !anthropicApiKey) {
      setError('Add at least one OpenAI or Anthropic API key to create more clients.')
      return false
    }
    await mandateApi.updateProviders({
      openaiApiKey: openaiApiKey || undefined,
      anthropicApiKey: anthropicApiKey || undefined,
    })
    setByokReady(true)
    setMaxBudgetUsd(50)
    setBudgetPeriod('monthly')
    onProvidersSaved()
    return true
  }

  function onBudgetChange(value: number) {
    if (promoEligible && !byokReady) {
      setError(
        'Custom budgets are only available with your own provider keys. Mandate free credits are $5 for one week.',
      )
      return
    }
    setError('')
    setMaxBudgetUsd(value)
  }

  function onPeriodChange(value: 'daily' | 'weekly' | 'monthly') {
    if (promoEligible && !byokReady) {
      setError(
        'Custom periods are only available with your own provider keys. Mandate free credits are $5 for one week.',
      )
      return
    }
    setError('')
    setBudgetPeriod(value)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (needsInlineByok && !byokReady) {
        const ok = await saveByok()
        if (!ok) return
      }
      const res = await mandateApi.createClient({
        name,
        maxBudgetUsd: promoEligible && !byokReady ? 5 : maxBudgetUsd,
        budgetPeriod: promoEligible && !byokReady ? 'weekly' : budgetPeriod,
      })
      onCreated(res.mandateKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create key')
    } finally {
      setBusy(false)
    }
  }

  const lockedPromo = promoEligible && !byokReady

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="auth-card modal-card" onSubmit={onSubmit}>
        <p className="eyebrow left">NEW CLIENT KEY</p>
        <h2>Cap a client</h2>
        {lockedPromo && (
          <p className="auth-copy">
            Mandate free credits: budget locked at <strong>$5 / week</strong> for 7 days. One promo client only.
          </p>
        )}
        {needsInlineByok && (
          <p className="auth-copy">
            Your promo client is used. Add your own OpenAI or Anthropic key to create another capped client.
          </p>
        )}
        <label>
          Client name
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Harbor Dental" />
        </label>
        {needsInlineByok && !byokReady && agency.role === 'ADMIN' && (
          <>
            <label>
              OpenAI API key
              <input value={openaiApiKey} onChange={(e) => setOpenaiApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
            </label>
            <label>
              Anthropic API key
              <input value={anthropicApiKey} onChange={(e) => setAnthropicApiKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" />
            </label>
          </>
        )}
        <label>
          Dollar budget
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={lockedPromo ? 5 : maxBudgetUsd}
            onChange={(e) => onBudgetChange(Number(e.target.value))}
            readOnly={lockedPromo}
            required
          />
        </label>
        <label>
          Period
          <select
            value={lockedPromo ? 'weekly' : budgetPeriod}
            onChange={(e) => onPeriodChange(e.target.value as typeof budgetPeriod)}
            disabled={lockedPromo}
          >
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button-ghost" onClick={onClose}>cancel</button>
          <button type="submit" disabled={busy}>{busy ? 'creating…' : 'create key'}</button>
        </div>
      </form>
    </div>
  )
}

export function ClientDetailPage() {
  const { id } = useParams()
  const { agency, loading } = useAgency()
  const [row, setRow] = useState<SpendRow | null>(null)
  const [providers, setProviders] = useState<{ name: string; requests: number; costUsd: number }[]>([])
  const [tags, setTags] = useState<{ name: string; requests: number; costUsd: number }[]>([])
  const [recent, setRecent] = useState<UsageLogRow[]>([])
  const [error, setError] = useState('')
  const [busyKill, setBusyKill] = useState(false)
  const [period, setPeriod] = useState<'current' | 'previous'>('current')
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  async function load() {
    if (!id) return
    try {
      const [dash, breakdown, usage] = await Promise.all([
        mandateApi.dashboard(),
        mandateApi.breakdown(id),
        mandateApi.usage({ clientId: id, limit: 25 }),
      ])
      setRow(dash.clients.find((c) => c.id === id) || null)
      setProviders(breakdown.providers)
      setTags(breakdown.tags)
      setRecent(usage.logs)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client')
    }
  }

  useEffect(() => {
    if (!agency || !id) return
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [agency, id])

  if (loading) return <div className="auth-shell"><p className="auth-copy">Loading…</p></div>
  if (!agency) return <Navigate to="/onboarding" replace />

  const urls = mandateBaseUrls()
  const promoEnded =
    row?.fundingSource === 'MANDATE_PROMO' &&
    row.promoExpiresAt != null &&
    new Date(row.promoExpiresAt).getTime() < Date.now()
  const setupPrompt = buildN8nSetupPrompt({
    mandateKey: `${row?.keyPrefix || 'mdt_live_'}…`,
    clientName: row?.name,
  })

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <BrandLogo to="/app" />
          <nav className="app-nav" aria-label="App">
            <NavLink to="/app" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
              clients
            </NavLink>
            <NavLink to="/app/ledger" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              ledger
            </NavLink>
            {agency.role === 'ADMIN' && (
              <>
                <NavLink to="/app/team" className={({ isActive }) => (isActive ? 'active' : undefined)}>
                  team
                </NavLink>
                <NavLink to="/app/settings" className={({ isActive }) => (isActive ? 'active' : undefined)}>
                  settings
                </NavLink>
              </>
            )}
            <NavLink to="/docs" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              docs
            </NavLink>
          </nav>
        </div>
        <div className="app-header-meta">
          <Link to="/app">← all clients</Link>
        </div>
      </header>
      <main className="app-main">
        {error && <p className="form-error">{error}</p>}
        {!row ? (
          <p className="auth-copy">Client not found or still loading…</p>
        ) : (
          <>
            <div className="app-title-row">
              <div>
                <p className="eyebrow left">
                  {row.fundingSource === 'MANDATE_PROMO' ? 'MANDATE PROMO · ' : ''}
                  {row.budgetPeriod.toUpperCase()} CAP
                </p>
                <h1>{row.name}</h1>
                <p className="auth-copy">
                  ${formatUsd(row.spendPeriodUsd)} of ${formatUsd(row.capUsd)} · {row.percentUsed.toFixed(1)}% used
                  {row.killed ? ' · KEY STOPPED' : ''}
                  {row.fundingSource === 'MANDATE_PROMO' && row.promoExpiresAt
                    ? ` · trial ends ${new Date(row.promoExpiresAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
              <div className="app-actions">
                <Link className="button-ghost" to={`/app/ledger?clientId=${row.id}`}>
                  full ledger
                </Link>
                <button
                  type="button"
                  className={row.killed ? '' : 'danger'}
                  disabled={busyKill}
                  onClick={async () => {
                    if (!id) return
                    setBusyKill(true)
                    try {
                      if (row.killed) await mandateApi.unkill(id)
                      else await mandateApi.kill(id)
                      await load()
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Kill switch failed')
                    } finally {
                      setBusyKill(false)
                    }
                  }}
                >
                  <Power size={14} /> {row.killed ? 're-enable key' : 'kill client'}
                </button>
              </div>
            </div>

            {promoEnded && (
              <p className="form-error" role="alert">
                Mandate free credits ended for this client. Add your OpenAI/Anthropic keys in{' '}
                <Link to="/app/settings">Settings</Link>, then re-enable the key to resume on your own account.
              </p>
            )}

            <div className="detail-grid">
              <section className="detail-card">
                <h3>By provider</h3>
                {providers.length === 0 ? (
                  <p className="muted">No spend this period.</p>
                ) : (
                  <ul className="breakdown-list">
                    {providers.map((p) => (
                      <li key={p.name}>
                        <span>{p.name}</span>
                        <b>{p.requests.toLocaleString()} · ${formatUsd(p.costUsd)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="detail-card">
                <h3>By tag</h3>
                {tags.length === 0 ? (
                  <p className="muted">No tagged requests. Pass <code>X-Mandate-Tag</code>.</p>
                ) : (
                  <ul className="breakdown-list">
                    {tags.map((t) => (
                      <li key={t.name}>
                        <span>{t.name}</span>
                        <b>{t.requests.toLocaleString()} · ${formatUsd(t.costUsd)}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="detail-card">
                <h3>Statement</h3>
                <label>
                  Period
                  <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)}>
                    <option value="current">current month</option>
                    <option value="previous">previous month</option>
                  </select>
                </label>
                <div className="modal-actions" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!id || !row) return
                      try {
                        await mandateApi.downloadStatement(
                          id,
                          period,
                          'pdf',
                          `${row.slug}-${period}.pdf`,
                        )
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'PDF download failed')
                      }
                    }}
                  >
                    <Download size={13} /> PDF
                  </button>
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={async () => {
                      if (!id || !row) return
                      try {
                        await mandateApi.downloadStatement(
                          id,
                          period,
                          'csv',
                          `${row.slug}-${period}.csv`,
                        )
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'CSV download failed')
                      }
                    }}
                  >
                    <Download size={13} /> CSV
                  </button>
                </div>
              </section>
            </div>

            <section className="detail-card" style={{ marginTop: 20 }}>
              <div className="ledger-section-head">
                <h3>Recent calls</h3>
                <Link to={`/app/ledger?clientId=${row.id}`}>view full ledger →</Link>
              </div>
              {recent.length === 0 ? (
                <p className="muted">No calls recorded for this client yet.</p>
              ) : (
                <div className="spend-table-wrap ledger-wrap" style={{ border: 0 }}>
                  <table className="spend-table ledger-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Model</th>
                        <th>In</th>
                        <th>Out</th>
                        <th>Cost</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((r) => (
                        <tr key={r.id}>
                          <td className="mono">{formatLedgerTime(r.ts)}</td>
                          <td className="mono model-cell">{r.model}</td>
                          <td className="mono num">{r.tokens_in.toLocaleString()}</td>
                          <td className="mono num">{r.tokens_out.toLocaleString()}</td>
                          <td className="mono num">${formatUsd(r.cost_usd, 4)}</td>
                          <td>
                            <span className={`pill ${r.status === 'error' ? 'danger' : 'ok'}`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="detail-card" style={{ marginTop: 20 }}>
              <h3>Connect n8n</h3>
              <p className="auth-copy">
                Paste these base URLs into your OpenAI/Anthropic credential. Use the Mandate key you copied at creation
                (prefix <code>{row.keyPrefix}…</code>).
              </p>
              <pre className="inline-pre">{`OpenAI     ${urls.openai}
Anthropic  ${urls.anthropic}
API key    ${row.keyPrefix}…  (paste full mdt_live_… key)`}</pre>
              <div className="modal-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(urls.openai)
                  }}
                >
                  copy OpenAI URL
                </button>
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(urls.anthropic)
                  }}
                >
                  copy Anthropic URL
                </button>
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(setupPrompt)
                    setCopiedPrompt(true)
                    setTimeout(() => setCopiedPrompt(false), 2000)
                  }}
                >
                  {copiedPrompt ? 'copied!' : 'copy setup prompt'}
                </button>
                <Link className="button-ghost" to="/docs">
                  docs
                </Link>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
