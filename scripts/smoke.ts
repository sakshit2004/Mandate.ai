/**
 * End-to-end smoke against a running Mandate API + LiteLLM.
 *
 * Usage:
 *   npx tsx scripts/smoke.ts
 *
 * Requires: API on :3001, LiteLLM healthy, agency already set up OR will create via /api/setup.
 */
import 'dotenv/config'

const BASE = process.env.PUBLIC_BASE_URL || 'http://localhost:3001'

async function json(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
      cookie: (init.headers as Record<string, string>)?.cookie || '',
    },
  })
  const setCookie = res.headers.getSetCookie?.() || []
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  return { status: res.status, body, setCookie, res }
}

async function main() {
  const health = await fetch(`${BASE}/api/health`)
  console.log('health', health.status, await health.json())

  const boot = await json('/api/bootstrap')
  console.log('bootstrap', boot.body)

  let cookie = ''
  if (boot.body?.needsSetup) {
    const setup = await json('/api/setup', {
      method: 'POST',
      body: JSON.stringify({
        agencyName: 'Smoke Agency',
        adminEmail: 'smoke@mandate.local',
        password: 'smoketest1',
        timezone: 'UTC',
        openaiApiKey: process.env.OPENAI_API_KEY || 'sk-test-openai',
        anthropicApiKey: process.env.ANTHROPIC_API_KEY || 'sk-test-anthropic',
      }),
    })
    cookie = setup.setCookie.map((c) => c.split(';')[0]).join('; ')
    console.log('setup', setup.status, setup.body?.agency?.name)
  } else {
    const login = await json('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        email: process.env.SMOKE_EMAIL || 'smoke@mandate.local',
        password: process.env.SMOKE_PASSWORD || 'smoketest1',
      }),
    })
    cookie = login.setCookie.map((c) => c.split(';')[0]).join('; ')
    console.log('login', login.status)
  }

  const created = await json('/api/clients', {
    method: 'POST',
    headers: { cookie },
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

  const dash = await json('/api/dashboard', { headers: { cookie } })
  console.log('dashboard clients', dash.body?.clients?.length)

  const kill = await json(`/api/clients/${created.body.client.id}/kill`, {
    method: 'POST',
    headers: { cookie },
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
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
