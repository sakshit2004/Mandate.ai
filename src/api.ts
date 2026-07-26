const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || ''

let authTokenProvider: (() => Promise<string | null>) | null = null

export function configureAuthTokenProvider(provider: () => Promise<string | null>) {
  authTokenProvider = provider
}

export class MandateApiError extends Error {
  readonly code?: string
  readonly status: number
  readonly details?: unknown

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message)
    this.name = 'MandateApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export type Agency = {
  id: string
  name: string
  clerkOrganizationId: string
  timezone: string
  setupComplete: boolean
  openaiConfigured: boolean
  anthropicConfigured: boolean
  role: 'ADMIN' | 'MEMBER'
  permissions: string[]
}

export type ClientRow = {
  id: string
  name: string
  slug: string
  keyPrefix: string
  maxBudgetUsd: number
  budgetPeriod: string
  killed: boolean
  createdAt: string
}

export type SpendRow = {
  id: string
  name: string
  slug: string
  killed: boolean
  keyPrefix: string
  budgetPeriod: string
  capUsd: number
  spendTodayUsd: number
  spendPeriodUsd: number
  percentUsed: number
}

export type UsageLogRow = {
  id: string
  ts: string
  client_id: string
  client_name: string
  client_key: string
  key_prefix: string
  provider: string | null
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  status: string
  tag: string | null
  request_id: string
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await authTokenProvider?.()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    const err = json as { error?: { message?: string; code?: string; details?: unknown } }
    throw new MandateApiError(
      err.error?.message || `Request failed (${res.status})`,
      res.status,
      err.error?.code,
      err.error?.details,
    )
  }
  return json as T
}

export const mandateApi = {
  bootstrap: () =>
    api<{ authProvider: 'clerk'; agencyNameDefault: string; standalone: boolean }>('/api/bootstrap'),
  me: async () => {
    const result = await api<{
      agency: Omit<Agency, 'role' | 'permissions'>
      user: { id: string; role: Agency['role']; permissions: string[] }
    }>('/api/me')
    return {
      agency: {
        ...result.agency,
        role: result.user.role,
        permissions: result.user.permissions,
      },
      user: result.user,
    }
  },
  completeOnboarding: (timezone: string) =>
    api<{ agency: Omit<Agency, 'role' | 'permissions'> }>('/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({ timezone }),
    }),
  updateProviders: (body: { openaiApiKey?: string; anthropicApiKey?: string }) =>
    api<{ agency: Omit<Agency, 'role' | 'permissions'> }>('/api/providers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  inviteMember: (body: { emailAddress: string; role: Agency['role'] }) =>
    api<{
      invitation: { id: string; emailAddress: string; role: string; status: string }
    }>('/api/team/invitations', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  dashboard: () =>
    api<{ generatedAt: string; timezone: string; clients: SpendRow[] }>('/api/dashboard'),
  clients: () => api<{ clients: ClientRow[] }>('/api/clients'),
  createClient: (body: {
    name: string
    maxBudgetUsd: number
    budgetPeriod: 'daily' | 'weekly' | 'monthly'
  }) =>
    api<{ client: ClientRow; mandateKey: string }>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  kill: (id: string) =>
    api<{ client: { id: string; killed: boolean; name: string } }>(`/api/clients/${id}/kill`, {
      method: 'POST',
      body: '{}',
    }),
  unkill: (id: string) =>
    api<{ client: { id: string; killed: boolean; name: string } }>(`/api/clients/${id}/unkill`, {
      method: 'POST',
      body: '{}',
    }),
  breakdown: (id: string) =>
    api<{
      client: { id: string; name: string; slug: string; budgetPeriod: string; killed: boolean }
      providers: { name: string; requests: number; costUsd: number }[]
      tags: { name: string; requests: number; costUsd: number }[]
    }>(`/api/clients/${id}/breakdown`),
  usage: (params?: {
    clientId?: string
    status?: 'success' | 'error' | ''
    limit?: number
    offset?: number
  }) => {
    const q = new URLSearchParams()
    if (params?.clientId) q.set('clientId', params.clientId)
    if (params?.status) q.set('status', params.status)
    if (params?.limit != null) q.set('limit', String(params.limit))
    if (params?.offset != null) q.set('offset', String(params.offset))
    const qs = q.toString()
    return api<{
      generatedAt: string
      total: number
      limit: number
      offset: number
      clients: { id: string; name: string }[]
      logs: UsageLogRow[]
    }>(`/api/usage${qs ? `?${qs}` : ''}`)
  },
  statementUrl: (id: string, period: 'current' | 'previous', format: 'pdf' | 'csv') =>
    `${API_BASE}/api/clients/${id}/statement?period=${period}&format=${format}`,

  async downloadStatement(
    id: string,
    period: 'current' | 'previous',
    format: 'pdf' | 'csv',
    filename: string,
  ) {
    const token = await authTokenProvider?.()
    const res = await fetch(this.statementUrl(id, period, format), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Download failed (${res.status})`)
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },
}

export function formatUsd(n: number, places = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  })
}
