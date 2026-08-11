import {
  CreateOrganization,
  OrganizationSwitcher,
  SignIn,
  SignUp,
  useAuth,
  useOrganization,
  useOrganizationList,
} from '@clerk/clerk-react'
import { FormEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Agency, MandateApiError, mandateApi } from '../api'
import { BrandLogo } from '../BrandLogo'

const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const timezoneOptions = (() => {
  try {
    return Array.from(
      new Set(['UTC', detectedTimezone, ...Intl.supportedValuesOf('timeZone')]),
    ).sort((a, b) => a.localeCompare(b))
  } catch {
    return ['UTC', detectedTimezone, 'America/Denver']
  }
})()

function AuthChrome({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <BrandLogo to="/" />
      </div>
      {children}
    </div>
  )
}

export function SignInPage() {
  return (
    <AuthChrome>
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/app"
        fallback={<p className="auth-copy">Loading secure sign in…</p>}
      />
    </AuthChrome>
  )
}

export function SignUpPage() {
  return (
    <AuthChrome>
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/onboarding"
        fallback={<p className="auth-copy">Loading secure sign up…</p>}
      />
    </AuthChrome>
  )
}

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams()
  const organizationId = searchParams.get('organization_id')
  const completeUrl = organizationId
    ? `/accept-invitation/complete?organization_id=${encodeURIComponent(organizationId)}`
    : '/onboarding'

  return (
    <AuthChrome>
      <SignIn
        routing="path"
        path="/accept-invitation"
        signUpUrl="/sign-up"
        forceRedirectUrl={completeUrl}
        signUpForceRedirectUrl={completeUrl}
        fallback={<p className="auth-copy">Accepting your invitation…</p>}
      />
    </AuthChrome>
  )
}

export function InvitationCompletePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const organizationId = searchParams.get('organization_id')
  const activationStarted = useRef(false)
  const [error, setError] = useState('')
  const { isLoaded, setActive } = useOrganizationList()

  useEffect(() => {
    if (!isLoaded || !setActive || !organizationId || activationStarted.current) return
    activationStarted.current = true
    setActive({ organization: organizationId })
      .then(() => navigate('/app', { replace: true }))
      .catch((err) => {
        activationStarted.current = false
        setError(err instanceof Error ? err.message : 'Could not open the invited workspace')
      })
  }, [isLoaded, navigate, organizationId, setActive])

  if (!organizationId) return <Navigate to="/onboarding" replace />
  return (
    <AuthChrome>
      <div className="auth-card">
        <p className="eyebrow left">TEAM INVITATION</p>
        <h1>Opening your workspace</h1>
        <p className="auth-copy">Your invitation was accepted. Mandate is activating the invited organization.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </AuthChrome>
  )
}

function WorkspacePicker() {
  const navigate = useNavigate()
  const activationStarted = useRef(false)
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState('')
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true },
  })
  const memberships = userMemberships?.data || []

  useEffect(() => {
    if (
      !isLoaded ||
      !setActive ||
      userMemberships?.isLoading ||
      memberships.length !== 1 ||
      activationStarted.current
    ) {
      return
    }
    activationStarted.current = true
    setActivating(true)
    setError('')
    setActive({ organization: memberships[0].organization.id })
      .then(() => navigate('/onboarding', { replace: true }))
      .catch((err) => {
        activationStarted.current = false
        setError(err instanceof Error ? err.message : 'Could not activate your workspace')
      })
      .finally(() => setActivating(false))
  }, [isLoaded, memberships, navigate, setActive, userMemberships?.isLoading])

  if (!isLoaded || userMemberships?.isLoading || activating) {
    return <AuthChrome><p className="auth-copy">Opening your workspace…</p></AuthChrome>
  }

  return (
    <AuthChrome>
      <div>
        <p className="eyebrow">{memberships.length ? 'SELECT YOUR WORKSPACE' : 'CREATE YOUR WORKSPACE'}</p>
        {memberships.length > 0 && (
          <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/onboarding" />
        )}
        {memberships.length === 0 && (
          <CreateOrganization afterCreateOrganizationUrl="/onboarding" />
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </AuthChrome>
  )
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const { isLoaded, isSignedIn, orgId } = useAuth()
  const { membership } = useOrganization()
  const [timezone, setTimezone] = useState(detectedTimezone)
  const [step, setStep] = useState<'choose' | 'byok'>('choose')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [provisioned, setProvisioned] = useState(false)

  useEffect(() => {
    if (!isSignedIn || !orgId || !membership) return
    const membershipRole = membership.role
    let cancelled = false
    async function provision() {
      setBusy(true)
      setError('')
      setProvisioned(false)
      try {
        const isAdmin = membershipRole === 'org:admin'
        const isMember = membershipRole === 'org:member'
        if (!isAdmin && !isMember) throw new Error('This organization role is not supported.')

        let current: Awaited<ReturnType<typeof mandateApi.me>> | null = null
        const attempts = isMember ? 5 : 1
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          try {
            current = await mandateApi.me()
            break
          } catch (err) {
            const waitingForProjection =
              err instanceof MandateApiError && err.code === 'SETUP_REQUIRED'
            if (!waitingForProjection) throw err
            if (isMember && attempt + 1 < attempts) {
              await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt))
              if (cancelled) return
              continue
            }
          }
        }

        if (current?.agency.setupComplete || current?.agency.role === 'MEMBER') {
          navigate('/app', { replace: true })
          return
        }
        if (isMember) {
          throw new Error('Your workspace is still syncing. Please try again in a moment.')
        }
        if (current?.agency.fundingMode === 'BYOK' && !current.agency.setupComplete) {
          if (!cancelled) {
            setStep('byok')
            setProvisioned(true)
          }
          return
        }
        // Provision agency shell (no funding mode yet) so /api/me works.
        await mandateApi.completeOnboarding({ timezone })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- provision once per org; timezone submitted on choose
  }, [isSignedIn, membership, navigate, orgId])

  async function choosePromo() {
    setBusy(true)
    setError('')
    try {
      await mandateApi.completeOnboarding({ timezone, fundingMode: 'MANDATE_PROMO' })
      navigate('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start promo trial')
    } finally {
      setBusy(false)
    }
  }

  async function chooseByok() {
    setBusy(true)
    setError('')
    try {
      await mandateApi.completeOnboarding({ timezone, fundingMode: 'BYOK' })
      setStep('byok')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not continue')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmitByok(e: FormEvent) {
    e.preventDefault()
    if (!openaiApiKey && !anthropicApiKey) {
      setError('Add at least one OpenAI or Anthropic API key.')
      return
    }
    setError('')
    setBusy(true)
    try {
      await mandateApi.completeOnboarding({ timezone, fundingMode: 'BYOK' })
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

  if (!isLoaded) return <AuthChrome><p className="auth-copy">Loading…</p></AuthChrome>
  if (!isSignedIn) return <Navigate to="/sign-in" replace />
  if (!orgId) return <WorkspacePicker />

  if (step === 'byok') {
    return (
      <AuthChrome>
        <form className="auth-card" onSubmit={onSubmitByok}>
          <p className="eyebrow left">BRING YOUR OWN KEYS</p>
          <h1>Connect a provider</h1>
          <p className="auth-copy">
            Paste your OpenAI and/or Anthropic key. Mandate encrypts them before storage. Workflows only ever see capped{' '}
            <code>mdt_live_…</code> keys.
          </p>
          <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/onboarding" />
          <label>
            Timezone
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} required>
              {timezoneOptions.map((option) => (
                <option key={option} value={option}>
                  {option.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
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
          <button type="submit" disabled={busy}>{busy ? 'saving…' : 'save and open dashboard'}</button>
          <button type="button" className="button-ghost" onClick={() => setStep('choose')} disabled={busy}>
            ← back
          </button>
          <p className="auth-footer"><Link to="/">← back to site</Link></p>
        </form>
      </AuthChrome>
    )
  }

  return (
    <AuthChrome>
      <div className="auth-card">
        <p className="eyebrow left">AGENCY ONBOARDING</p>
        <h1>How will you fund AI spend?</h1>
        <p className="auth-copy">
          Choose once. You can always add your own provider keys later in Settings.
        </p>
        <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/onboarding" />
        <label>
          Timezone
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} required>
            {timezoneOptions.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" disabled={busy || !provisioned} onClick={chooseByok}>
          Bring your own keys
        </button>
        <button type="button" className="button-ghost" disabled={busy || !provisioned} onClick={choosePromo}>
          Try with Mandate credits (shared $5 pool)
        </button>
        <p className="auth-copy" style={{ marginTop: 12 }}>
          All promo clients across all agencies share $5 of usage overall. Each promo key lasts up to 7 days or until the shared pool is used.
        </p>
        <p className="auth-footer"><Link to="/">← back to site</Link> · <Link to="/docs">docs</Link></p>
      </div>
    </AuthChrome>
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
  const { agency, loading } = useAgency()
  const {
    isLoaded: organizationLoaded,
    memberships,
  } = useOrganization({ memberships: { infinite: true } })
  const [emailAddress, setEmailAddress] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (loading || !organizationLoaded) return <AuthChrome><p className="auth-copy">Loading…</p></AuthChrome>
  if (!agency) return <Navigate to="/onboarding" replace />
  if (agency.role !== 'ADMIN') return <Navigate to="/app" replace />

  async function onInvite(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      await mandateApi.inviteMember({ emailAddress, role })
      setEmailAddress('')
      setMessage('Invitation sent. The email link will return the user directly to Mandate.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send invitation')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthChrome>
      <div className="auth-card">
        <p className="eyebrow left">AGENCY TEAM</p>
        <h1>Invite a teammate</h1>
        <p className="auth-copy">Invitation links open Mandate and activate this workspace after acceptance.</p>
        <form onSubmit={onInvite}>
          <label>
            Email address
            <input
              type="email"
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
              <option value="MEMBER">member</option>
              <option value="ADMIN">admin</option>
            </select>
          </label>
          {message && <p className="auth-copy" role="status">{message}</p>}
          <button type="submit" disabled={busy}>{busy ? 'sending…' : 'send invitation'}</button>
        </form>

        <h2>Members</h2>
        <ul className="breakdown-list">
          {memberships?.data?.map((member) => (
            <li key={member.id}>
              <span>
                {member.publicUserData?.firstName ||
                  member.publicUserData?.identifier ||
                  'Team member'}
              </span>
              <b>{member.role === 'org:admin' ? 'admin' : 'member'}</b>
            </li>
          ))}
        </ul>
        <p className="auth-footer"><Link to="/app">← back to dashboard</Link></p>
      </div>
    </AuthChrome>
  )
}

export function ProviderSettingsPage() {
  const { agency, loading, refresh } = useAgency()
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  if (loading) return <AuthChrome><p className="auth-copy">Loading…</p></AuthChrome>
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
    <AuthChrome>
      <form className="auth-card" onSubmit={onSubmit}>
        <p className="eyebrow left">AGENCY SETTINGS</p>
        <h1>Provider credentials</h1>
        <p className="auth-copy">
          OpenAI: {agency.openaiConfigured ? 'configured' : 'not configured'} · Anthropic:{' '}
          {agency.anthropicConfigured ? 'configured' : 'not configured'}
          {agency.fundingMode === 'MANDATE_PROMO' && !agency.openaiConfigured && !agency.anthropicConfigured
            ? ' · Add keys here to leave free credits and create more clients.'
            : ''}
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
    </AuthChrome>
  )
}
