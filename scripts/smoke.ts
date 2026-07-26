/**
 * End-to-end smoke against a running Clerk-enabled Mandate API.
 *
 * Usage:
 *   npx tsx scripts/smoke.ts
 *
 * Requires an active Clerk organization and an admin session token:
 *   SMOKE_CLERK_TOKEN_ADMIN=...
 * Optional:
 *   SMOKE_CLERK_TOKEN_MEMBER=...
 *   SMOKE_CLERK_TOKEN_OTHER_ORG=...
 */
import 'dotenv/config'

const BASE = process.env.PUBLIC_BASE_URL || 'http://localhost:3001'

async function json(path: string, token?: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  return { status: res.status, body, res }
}

async function main() {
  const adminToken = process.env.SMOKE_CLERK_TOKEN_ADMIN
  if (!adminToken) throw new Error('SMOKE_CLERK_TOKEN_ADMIN is required')

  const health = await fetch(`${BASE}/api/health`)
  console.log('health', health.status, await health.json())

  const onboarding = await json('/api/onboarding/complete', adminToken, {
    method: 'POST',
    body: JSON.stringify({ timezone: 'UTC' }),
  })
  if (onboarding.status !== 200) throw new Error(`Onboarding failed: ${onboarding.status}`)
  console.log('onboarding', onboarding.body?.agency?.name)

  const created = await json('/api/clients', adminToken, {
    method: 'POST',
    body: JSON.stringify({
      name: `Smoke ${Date.now()}`,
      maxBudgetUsd: 1,
      budgetPeriod: 'daily',
    }),
  })
  console.log('client', created.status, created.body?.client?.name)
  const key = created.body?.mandateKey as string
  if (!key) throw new Error('No mandate key returned')

  const proxy = await fetch(`${BASE}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Mandate-Tag': 'smoke',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say hi' }],
      max_tokens: 5,
    }),
  })
  console.log('proxy', proxy.status, (await proxy.text()).slice(0, 200))

  const dash = await json('/api/dashboard', adminToken)
  console.log('dashboard clients', dash.body?.clients?.length)

  const kill = await json(`/api/clients/${created.body.client.id}/kill`, adminToken, {
    method: 'POST',
    body: '{}',
  })
  console.log('kill', kill.status, kill.body)

  const blocked = await fetch(`${BASE}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say hi' }],
      max_tokens: 5,
    }),
  })
  console.log('after kill', blocked.status, await blocked.text())

  if (process.env.SMOKE_CLERK_TOKEN_MEMBER) {
    const memberDashboard = await json('/api/dashboard', process.env.SMOKE_CLERK_TOKEN_MEMBER)
    const memberMutation = await json('/api/clients', process.env.SMOKE_CLERK_TOKEN_MEMBER, {
      method: 'POST',
      body: JSON.stringify({ name: 'Forbidden', maxBudgetUsd: 1, budgetPeriod: 'daily' }),
    })
    if (memberDashboard.status !== 200 || memberMutation.status !== 403) {
      throw new Error('Member authorization smoke failed')
    }
  }

  if (process.env.SMOKE_CLERK_TOKEN_OTHER_ORG) {
    const otherDashboard = await json('/api/dashboard', process.env.SMOKE_CLERK_TOKEN_OTHER_ORG)
    const leaked = otherDashboard.body?.clients?.some(
      (client: { id: string }) => client.id === created.body.client.id,
    )
    if (otherDashboard.status !== 200 || leaked) throw new Error('Cross-tenant isolation smoke failed')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
