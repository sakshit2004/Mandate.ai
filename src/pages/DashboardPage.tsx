import { FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Download, Power, Plus, RefreshCw } from 'lucide-react'
import { OrganizationSwitcher, UserButton } from '@clerk/clerk-react'
import { formatUsd, mandateApi, SpendRow, UsageLogRow } from '../api'
import { useAgency } from './AuthPages'

function Logo() {
  return (
    <Link className="logo" to="/app">
      <span className="logo-mark" aria-hidden="true"><span /></span>
      mandate
    </Link>
  )
}

function AppNav({ agencyName, role }: { agencyName: string; role: 'ADMIN' | 'MEMBER' }) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <Logo />
        <nav className="app-nav" aria-label="App">
          <NavLink to="/app" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
            clients
          </NavLink>
          <NavLink to="/app/ledger" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            ledger
          </NavLink>
          <NavLink to="/app/team" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            team
          </NavLink>
          {role === 'ADMIN' && (
            <NavLink to="/app/settings" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              settings
            </NavLink>
          )}
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
  const { agency, loading } = useAgency()
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
            {agency.role === 'ADMIN' && (
              <button type="button" onClick={() => setShowCreate(true)}>
                <Plus size={14} /> new client key
              </button>
            )}
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {!agency.setupComplete && agency.role === 'ADMIN' && (
          <p className="form-error">
            Connect an OpenAI or Anthropic key before sending gateway traffic.{' '}
            <Link to="/onboarding">Finish onboarding →</Link>
          </p>
        )}
        {createdKey && (
          <div className="key-reveal" role="status">
            <strong>Copy this Mandate key now — it won’t be shown again.</strong>
            <code>{createdKey}</code>
            <button type="button" className="button-ghost" onClick={() => navigator.clipboard.writeText(createdKey)}>
              copy
            </button>
            <button type="button" className="button-ghost" onClick={() => setCreatedKey(null)}>
              dismiss
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="empty-state">
            <p>No client keys yet. Create one, point n8n at Mandate, and watch spend move.</p>
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
            onClose={() => setShowCreate(false)}
            onCreated={(key) => {
              setCreatedKey(key)
              setShowCreate(false)
              load()
            }}
          />
        )}
      </main>
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
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (key: string) => void
}) {
  const [name, setName] = useState('')
  const [maxBudgetUsd, setMaxBudgetUsd] = useState(50)
  const [budgetPeriod, setBudgetPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await mandateApi.createClient({ name, maxBudgetUsd, budgetPeriod })
      onCreated(res.mandateKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create key')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <form className="auth-card modal-card" onSubmit={onSubmit}>
        <p className="eyebrow left">NEW CLIENT KEY</p>
        <h2>Cap a client</h2>
        <label>
          Client name
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Harbor Dental" />
        </label>
        <label>
          Dollar budget
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={maxBudgetUsd}
            onChange={(e) => setMaxBudgetUsd(Number(e.target.value))}
            required
          />
        </label>
        <label>
          Period
          <select value={budgetPeriod} onChange={(e) => setBudgetPeriod(e.target.value as typeof budgetPeriod)}>
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <Logo />
          <nav className="app-nav" aria-label="App">
            <NavLink to="/app" end className={({ isActive }) => (isActive ? 'active' : undefined)}>
              clients
            </NavLink>
            <NavLink to="/app/ledger" className={({ isActive }) => (isActive ? 'active' : undefined)}>
              ledger
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
                <p className="eyebrow left">{row.budgetPeriod.toUpperCase()} CAP</p>
                <h1>{row.name}</h1>
                <p className="auth-copy">
                  ${formatUsd(row.spendPeriodUsd)} of ${formatUsd(row.capUsd)} · {row.percentUsed.toFixed(1)}% used
                  {row.killed ? ' · KEY KILLED' : ''}
                </p>
              </div>
              <div className="app-actions">
                <Link className="button-ghost" to={`/app/ledger?clientId=${row.id}`}>
                  full ledger
                </Link>
                {agency.role === 'ADMIN' && (
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
                )}
              </div>
            </div>

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
              <h3>n8n base URLs</h3>
              <pre className="inline-pre">{`OpenAI     ${window.location.origin}/openai/v1
Anthropic  ${window.location.origin}/anthropic/v1
API key    ${row.keyPrefix}…`}</pre>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
