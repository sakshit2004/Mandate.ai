import {
  CreateOrganization,
  OrganizationProfile,
  OrganizationSwitcher,
  SignIn,
  SignUp,
  useAuth,
  useOrganization,
} from '@clerk/clerk-react'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Agency, mandateApi } from '../api'

export function SignInPage() {
  return (
    <div className="auth-shell">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/app"
        fallback={<p className="auth-copy">Loading secure sign in…</p>}
      />
    </div>
  )
}

export function SignUpPage() {
  return (
    <div className="auth-shell">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/onboarding"
        fallback={<p className="auth-copy">Loading secure sign up…</p>}
      />
    </div>
  )
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const { isLoaded, isSignedIn, orgId } = useAuth()
  const { membership } = useOrganization()
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Denver')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [provisioned, setProvisioned] = useState(false)

  useEffect(() => {
    if (!isSignedIn || !orgId || !membership) return
    let cancelled = false
    async function provision() {
      setBusy(true)
      setError('')
      try {
        try {
          const current = await mandateApi.me()
          if (current.agency.setupComplete || current.agency.role === 'MEMBER') {
            navigate('/app', { replace: true })
            return
          }
        } catch {
          // The webhook may not have created the local agency projection yet.
        }
        if (membership?.role !== 'org:admin') throw new Error('Agency setup is waiting for an admin.')
        await mandateApi.completeOnboarding(timezone)
        if (!cancelled) setProvisioned(true)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not provision agency')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }
    provision()
    return () => {
      cancelled = true
    }
  }, [isSignedIn, membership, navigate, orgId])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!openaiApiKey && !anthropicApiKey) {
      setError('Add at least one provider key, or continue without one.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await mandateApi.completeOnboarding(timezone)
      await mandateApi.updateProviders({
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

  if (!isLoaded) return <div className="auth-shell"><p className="auth-copy">Loading…</p></div>
  if (!isSignedIn) return <Navigate to="/sign-in" replace />
  if (!orgId) {
    return (
      <div className="auth-shell">
        <div>
          <p className="eyebrow">CREATE YOUR WORKSPACE</p>
          <CreateOrganization afterCreateOrganizationUrl="/onboarding" />
        </div>
      </div>
    )
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="eyebrow left">AGENCY ONBOARDING</p>
        <h1>Connect a provider</h1>
        <p className="auth-copy">Your workspace is ready. Provider keys are encrypted before they are stored.</p>
        <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/onboarding" />
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
        <button type="submit" disabled={busy || !provisioned}>{busy ? 'saving…' : 'save and open dashboard'}</button>
        {provisioned && (
          <button type="button" className="button-ghost" onClick={() => navigate('/app')}>
            continue without a provider
          </button>
        )}
        <p className="auth-footer"><Link to="/">← back to site</Link></p>
      </form>
    </div>
  )
}

export function useAgency(): { agency: Agency | null; loading: boolean; refresh: () => void } {
  const { isLoaded, isSignedIn, orgId } = useAuth()
  const [agency, setAgency] = useState<Agency | null>(null)
  const [loading, setLoading] = useState(true)
  const refresh = useCallback(() => {
    if (!isLoaded) return
    if (!isSignedIn || !orgId) {
      setAgency(null)
      setLoading(false)
      return
    }
    setLoading(true)
    mandateApi
      .me()
      .then((r) => setAgency(r.agency))
      .catch(() => setAgency(null))
      .finally(() => setLoading(false))
  }, [isLoaded, isSignedIn, orgId])
  useEffect(() => {
    refresh()
  }, [refresh])
  return { agency, loading, refresh }
}

export function TeamPage() {
  return (
    <div className="auth-shell">
      <OrganizationProfile routing="path" path="/app/team" />
    </div>
  )
}

export function ProviderSettingsPage() {
  const { agency, loading, refresh } = useAgency()
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (loading) return <div className="auth-shell"><p className="auth-copy">Loading…</p></div>
  if (!agency) return <Navigate to="/onboarding" replace />
  if (agency.role !== 'ADMIN') return <Navigate to="/app" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!openaiApiKey && !anthropicApiKey) {
      setMessage('Enter at least one replacement provider key.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await mandateApi.updateProviders({
        openaiApiKey: openaiApiKey || undefined,
        anthropicApiKey: anthropicApiKey || undefined,
      })
      setOpenaiApiKey('')
      setAnthropicApiKey('')
      setMessage('Provider credentials updated.')
      refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update provider credentials')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="eyebrow left">AGENCY SETTINGS</p>
        <h1>Provider credentials</h1>
        <p className="auth-copy">
          OpenAI: {agency.openaiConfigured ? 'configured' : 'not configured'} · Anthropic:{' '}
          {agency.anthropicConfigured ? 'configured' : 'not configured'}
        </p>
        <label>
          New OpenAI API key
          <input value={openaiApiKey} onChange={(event) => setOpenaiApiKey(event.target.value)} autoComplete="off" />
        </label>
        <label>
          New Anthropic API key
          <input value={anthropicApiKey} onChange={(event) => setAnthropicApiKey(event.target.value)} autoComplete="off" />
        </label>
        {message && <p className="auth-copy" role="status">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? 'saving…' : 'update credentials'}</button>
        <p className="auth-footer"><Link to="/app">← back to dashboard</Link></p>
      </form>
    </div>
  )
}
