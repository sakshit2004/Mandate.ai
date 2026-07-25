import { FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Agency, mandateApi } from '../api'

export function SetupPage() {
  const navigate = useNavigate()
  const [agencyName, setAgencyName] = useState('Fieldnote Automation')
  const [adminEmail, setAdminEmail] = useState('')
  const [password, setPassword] = useState('')
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    mandateApi.bootstrap().then((b) => {
      if (!b.needsSetup) setBlocked(true)
      if (b.agencyNameDefault) setAgencyName(b.agencyNameDefault)
    }).catch(() => undefined)
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await mandateApi.setup({
        agencyName,
        adminEmail,
        password,
        timezone,
        openaiApiKey: openaiApiKey || undefined,
        anthropicApiKey: anthropicApiKey || undefined,
      })
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setBusy(false)
    }
  }

  if (blocked) return <Navigate to="/login" replace />

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="eyebrow left">FIRST RUN</p>
        <h1>Set up Mandate</h1>
        <p className="auth-copy">One agency admin, one OpenAI key, one Anthropic key — encrypted at rest by the metering gateway.</p>
        <label>
          Agency name
          <input value={agencyName} onChange={(e) => setAgencyName(e.target.value)} required />
        </label>
        <label>
          Admin email
          <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>
        <label>
          Timezone
          <input value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
        </label>
        <label>
          OpenAI API key
          <input value={openaiApiKey} onChange={(e) => setOpenaiApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
        </label>
        <label>
          Anthropic API key
          <input value={anthropicApiKey} onChange={(e) => setAnthropicApiKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'saving…' : 'create agency'}</button>
        <p className="auth-footer"><Link to="/">← back to site</Link></p>
      </form>
    </div>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    mandateApi.bootstrap().then((b) => setNeedsSetup(b.needsSetup)).catch(() => undefined)
    mandateApi.me().then(() => navigate('/app')).catch(() => undefined)
  }, [navigate])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await mandateApi.login({ email, password })
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="eyebrow left">AGENCY LOGIN</p>
        <h1>Sign in</h1>
        {needsSetup && (
          <p className="auth-copy">
            No agency yet. <Link to="/setup">Run first-time setup →</Link>
          </p>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'signing in…' : 'sign in'}</button>
      </form>
    </div>
  )
}

export function useAgency(): { agency: Agency | null; loading: boolean; refresh: () => void } {
  const [agency, setAgency] = useState<Agency | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = () => {
    setLoading(true)
    mandateApi
      .me()
      .then((r) => setAgency(r.agency))
      .catch(() => setAgency(null))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    refresh()
  }, [])
  return { agency, loading, refresh }
}
