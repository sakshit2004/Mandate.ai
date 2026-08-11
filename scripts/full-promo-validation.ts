import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import type { AuthAgency } from '../server/src/services/auth.js'

const TEST_PORT = 8790
const TEST_ORIGIN = `http://127.0.0.1:${TEST_PORT}`
const PROMO_SEED_USD = 4.99999

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function schemaUrl(base: string, schema: string): string {
  const url = new URL(base)
  assert(url.protocol === 'postgresql:' || url.protocol === 'postgres:', 'E2E requires PostgreSQL')
  url.searchParams.set('schema', schema)
  return url.toString()
}

function runMigrations(databaseUrl: string): void {
  const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js')
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  })
}

async function errorCode(response: Response): Promise<string | null> {
  const body = (await response.json()) as { error?: { code?: string } }
  return body.error?.code ?? null
}

async function main() {
  const baseDatabaseUrl = process.env.DATABASE_URL
  assert(baseDatabaseUrl, 'DATABASE_URL is required')
  assert(process.env.PLATFORM_OPENAI_API_KEY, 'PLATFORM_OPENAI_API_KEY is required')
  assert(process.env.PLATFORM_ANTHROPIC_API_KEY, 'PLATFORM_ANTHROPIC_API_KEY is required')

  const schema = `mandate_e2e_${Date.now()}`
  assert(/^mandate_e2e_\d+$/.test(schema), 'Unsafe temporary schema name')
  const testDatabaseUrl = schemaUrl(baseDatabaseUrl, schema)
  const root = new PrismaClient({ datasourceUrl: baseDatabaseUrl })
  let testDb: PrismaClient | null = null
  let appDb: PrismaClient | null = null
  let app: FastifyInstance | null = null
  let adminApp: FastifyInstance | null = null
  let realProviderSpendUsd = 0

  try {
    await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`)
    console.log(`[e2e] created isolated schema ${schema}`)
    runMigrations(testDatabaseUrl)

    process.env.DATABASE_URL = testDatabaseUrl
    process.env.NODE_ENV = 'test'
    process.env.PORT = String(TEST_PORT)
    process.env.PUBLIC_BASE_URL = TEST_ORIGIN
    process.env.APP_ORIGINS = TEST_ORIGIN
    process.env.STANDALONE = '1'

    const [
      { buildApp },
      { prisma },
      { hashToken, newMandateKey },
      { sealSecret },
      { registerClientRoutes },
    ] = await Promise.all([
      import('../server/src/app.js'),
      import('../server/src/db.js'),
      import('../server/src/services/litellm.js'),
      import('../server/src/utils/seal.js'),
      import('../server/src/routes/clients.js'),
    ])
    appDb = prisma
    testDb = new PrismaClient({ datasourceUrl: testDatabaseUrl })

    const runId = randomUUID().replaceAll('-', '')
    const clients: Array<{ id: string; agencyId: string; key: string }> = []
    for (let i = 0; i < 5; i += 1) {
      const agencyId = `e2e-agency-${runId}-${i}`
      await testDb.agency.create({
        data: {
          id: agencyId,
          clerkOrganizationId: `e2e-org-${runId}-${i}`,
          name: `E2E Agency ${i + 1}`,
          timezone: 'UTC',
          status: 'ACTIVE',
          setupComplete: true,
          fundingMode: 'MANDATE_PROMO',
        },
      })
      const key = newMandateKey()
      const client = await testDb.client.create({
        data: {
          agencyId,
          name: `E2E Client ${i + 1}`,
          slug: `e2e-client-${i + 1}`,
          tokenHash: hashToken(key),
          keyAlias: `mandate:e2e:${runId}:${i}`,
          keyPrefix: key.slice(0, 12),
          sealedKey: sealSecret(key),
          maxBudgetUsd: 5,
          budgetPeriod: 'weekly',
          fundingSource: 'MANDATE_PROMO',
          promoExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      })
      clients.push({ id: client.id, agencyId, key })
    }
    console.log('[e2e] seeded five agencies and promo clients')

    app = await buildApp({ withStatic: false })
    await app.listen({ port: TEST_PORT, host: '127.0.0.1' })
    const health = await fetch(`${TEST_ORIGIN}/health`)
    assert(health.status === 200, `Health check failed: ${health.status}`)

    const openAiModels = (key: string) =>
      fetch(`${TEST_ORIGIN}/openai/v1/models`, {
        headers: { Authorization: `Bearer ${key}` },
      })

    const concurrent = await Promise.all(
      Array.from({ length: 25 }, (_, index) =>
        openAiModels(clients[index % clients.length].key),
      ),
    )
    assert(
      concurrent.every((response) => response.status === 200),
      `Concurrent requests failed: ${concurrent.map((response) => response.status).join(',')}`,
    )
    await Promise.all(concurrent.map((response) => response.arrayBuffer()))
    const concurrentEvents = await testDb.usageEvent.findMany()
    assert(concurrentEvents.length === 25, `Expected 25 usage events, got ${concurrentEvents.length}`)
    for (const client of clients) {
      assert(
        concurrentEvents.filter((event) => event.clientId === client.id).length === 5,
        `Client ${client.id} did not receive five metered requests`,
      )
    }
    assert(await testDb.budgetReservation.count() === 0, 'Concurrent reservations leaked')
    console.log('[e2e] 25 concurrent requests across five agencies passed')

    const openAiStream = await fetch(`${TEST_ORIGIN}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clients[0].key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Reply only OK' }],
        max_tokens: 5,
        stream: true,
        stream_options: { include_usage: true },
      }),
    })
    const openAiStreamText = await openAiStream.text()
    assert(openAiStream.status === 200, `OpenAI stream failed: ${openAiStream.status}`)
    assert(
      openAiStream.headers.get('content-type')?.includes('text/event-stream'),
      'OpenAI stream content type missing',
    )
    assert(openAiStreamText.includes('data:') && openAiStreamText.includes('[DONE]'), 'OpenAI SSE incomplete')

    const anthropicModelsResponse = await fetch(`${TEST_ORIGIN}/anthropic/v1/models`, {
      headers: {
        'x-api-key': clients[1].key,
        'anthropic-version': '2023-06-01',
      },
    })
    assert(anthropicModelsResponse.status === 200, 'Anthropic model discovery failed')
    const anthropicModels = (await anthropicModelsResponse.json()) as {
      data: Array<{ id: string }>
    }
    const anthropicModel =
      anthropicModels.data.find((model) => model.id.includes('haiku'))?.id ??
      anthropicModels.data[0]?.id
    assert(anthropicModel, 'No Anthropic model available')

    const anthropicStream = await fetch(`${TEST_ORIGIN}/anthropic/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': clients[1].key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: anthropicModel,
        messages: [{ role: 'user', content: 'Reply only OK' }],
        max_tokens: 5,
        stream: true,
      }),
    })
    const anthropicStreamText = await anthropicStream.text()
    assert(anthropicStream.status === 200, `Anthropic stream failed: ${anthropicStream.status}`)
    assert(
      anthropicStream.headers.get('content-type')?.includes('text/event-stream'),
      'Anthropic stream content type missing',
    )
    assert(
      anthropicStreamText.includes('message_start') &&
        anthropicStreamText.includes('message_stop'),
      'Anthropic SSE incomplete',
    )
    const streamedEvents = await testDb.usageEvent.findMany({
      where: { provider: { in: ['openai', 'anthropic'] }, status: 'success' },
    })
    assert(
      streamedEvents.some((event) => event.provider === 'openai' && event.tokensOut > 0),
      'OpenAI stream usage was not metered',
    )
    assert(
      streamedEvents.some((event) => event.provider === 'anthropic' && event.tokensOut > 0),
      'Anthropic stream usage was not metered',
    )
    console.log('[e2e] OpenAI and Anthropic streaming passed')

    const agencyRow = await testDb.agency.findUniqueOrThrow({
      where: { id: clients[0].agencyId },
    })
    const authAgency: AuthAgency = {
      id: agencyRow.id,
      clerkOrganizationId: agencyRow.clerkOrganizationId!,
      name: agencyRow.name,
      timezone: agencyRow.timezone,
      status: agencyRow.status,
      setupComplete: agencyRow.setupComplete,
      fundingMode: agencyRow.fundingMode,
      promoClientClaimed: agencyRow.promoClientClaimed,
      openaiConfigured: agencyRow.openaiConfigured,
      anthropicConfigured: agencyRow.anthropicConfigured,
      actorClerkUserId: `e2e-user-${runId}`,
      role: 'ADMIN',
      permissions: [],
    }
    adminApp = Fastify()
    await registerClientRoutes(adminApp, async () => authAgency)
    await adminApp.ready()
    const killed = await adminApp.inject({
      method: 'POST',
      url: `/api/clients/${clients[0].id}/kill`,
    })
    assert(killed.statusCode === 200, `Kill route failed: ${killed.statusCode}`)
    const killedGateway = await openAiModels(clients[0].key)
    assert(killedGateway.status === 403, `Killed key returned ${killedGateway.status}`)
    assert(
      (await errorCode(killedGateway)) === 'CLIENT_KEY_KILLED',
      'Killed key returned wrong error',
    )
    const reenabled = await adminApp.inject({
      method: 'POST',
      url: `/api/clients/${clients[0].id}/unkill`,
    })
    assert(reenabled.statusCode === 200, `Re-enable route failed: ${reenabled.statusCode}`)
    const liveAgain = await openAiModels(clients[0].key)
    assert(liveAgain.status === 200, `Re-enabled key returned ${liveAgain.status}`)
    await liveAgain.arrayBuffer()
    console.log('[e2e] kill and re-enable flow passed')

    const realBeforeCap = await testDb.usageEvent.aggregate({
      _sum: { costUsd: true },
    })
    realProviderSpendUsd += realBeforeCap._sum.costUsd ?? 0
    await testDb.budgetReservation.deleteMany()
    await testDb.usageEvent.deleteMany()
    await testDb.usageEvent.create({
      data: {
        requestId: `synthetic-cap-seed-${runId}`,
        clientId: clients[0].id,
        fundingSource: 'MANDATE_PROMO',
        provider: 'synthetic',
        model: 'synthetic-cap-seed',
        tokensIn: 0,
        tokensOut: 0,
        costUsd: PROMO_SEED_USD,
        status: 'success',
      },
    })

    const crossingResponse = await fetch(`${TEST_ORIGIN}/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clients[0].key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Reply only OK' }],
        max_tokens: 5,
      }),
    })
    assert(
      crossingResponse.status === 200,
      `Near-cap request should fit but returned ${crossingResponse.status}`,
    )
    await crossingResponse.arrayBuffer()

    const cappedSpend = await testDb.usageEvent.aggregate({ _sum: { costUsd: true } })
    const cappedSpendUsd = cappedSpend._sum.costUsd ?? 0
    assert(cappedSpendUsd > PROMO_SEED_USD, 'Real request did not add metered spend')
    assert(cappedSpendUsd <= 5, `Shared spend exceeded $5: ${cappedSpendUsd}`)
    realProviderSpendUsd += cappedSpendUsd - PROMO_SEED_USD

    for (const client of clients) {
      const blocked = await openAiModels(client.key)
      assert(blocked.status === 429, `Exhausted pool returned ${blocked.status}`)
      assert(
        (await errorCode(blocked)) === 'PROMO_POOL_EXHAUSTED',
        'Exhausted pool returned wrong error',
      )
    }
    assert(await testDb.budgetReservation.count() === 0, 'Cap test reservations leaked')
    console.log(`[e2e] shared cap passed at $${cappedSpendUsd.toFixed(6)} recorded spend`)
    console.log(`[e2e] estimated real provider spend: $${realProviderSpendUsd.toFixed(6)}`)
  } finally {
    if (adminApp) await adminApp.close().catch(() => undefined)
    if (app) await app.close().catch(() => undefined)
    if (appDb) await appDb.$disconnect().catch(() => undefined)
    if (testDb) await testDb.$disconnect().catch(() => undefined)
    await root
      .$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      .then(() => console.log(`[e2e] dropped isolated schema ${schema}`))
      .catch((error) => console.error(`[e2e] failed to drop ${schema}`, error))
    await root.$disconnect()
  }
}

main().catch((error) => {
  console.error('[e2e] validation failed')
  console.error(error)
  process.exitCode = 1
})
