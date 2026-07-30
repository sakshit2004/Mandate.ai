import { prisma } from '../db.js'
import { moneyUsd, percentUsed, sumUsd } from '../utils/money.js'
import { periodBounds, todayBounds } from '../utils/periods.js'

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

export async function listUsageLogs(opts: {
  clientIds?: string[]
  status?: string
  limit?: number
  offset?: number
}): Promise<{ logs: UsageLogRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
  const offset = Math.max(opts.offset ?? 0, 0)
  const where = {
    ...(opts.clientIds ? { clientId: { in: opts.clientIds } } : {}),
    ...(opts.status ? { status: opts.status } : {}),
  }

  const [total, events] = await Promise.all([
    prisma.usageEvent.count({ where }),
    prisma.usageEvent.findMany({
      where,
      include: { client: true },
      orderBy: { ts: 'desc' },
      take: limit,
      skip: offset,
    }),
  ])

  return {
    total,
    logs: events.map((r) => ({
      id: r.id,
      ts: r.ts.toISOString(),
      client_id: r.clientId,
      client_name: r.client.name,
      client_key: `${r.client.keyPrefix}… (${r.client.name})`,
      key_prefix: r.client.keyPrefix,
      provider: r.provider,
      model: r.model,
      tokens_in: r.tokensIn,
      tokens_out: r.tokensOut,
      cost_usd: moneyUsd(r.costUsd),
      status: r.status || 'success',
      tag: r.tag,
      request_id: r.requestId,
    })),
  }
}

export type ClientSpendSummary = {
  id: string
  name: string
  slug: string
  killed: boolean
  keyPrefix: string
  budgetPeriod: string
  fundingSource: 'BYOK' | 'MANDATE_PROMO'
  promoExpiresAt: string | null
  capUsd: number
  spendTodayUsd: number
  spendPeriodUsd: number
  percentUsed: number
}

async function sumSpend(clientId: string, start: Date, end: Date): Promise<number> {
  const agg = await prisma.usageEvent.aggregate({
    where: {
      clientId,
      ts: { gte: start, lt: end },
      status: { not: 'error' },
    },
    _sum: { costUsd: true },
  })
  return moneyUsd(agg._sum.costUsd ?? 0)
}

export async function clientSpendSummaries(
  agencyId: string,
  timeZone: string,
): Promise<ClientSpendSummary[]> {
  const clients = await prisma.client.findMany({
    where: { agencyId },
    orderBy: { name: 'asc' },
  })
  const today = todayBounds(timeZone)

  const out: ClientSpendSummary[] = []
  for (const c of clients) {
    const period = periodBounds(c.budgetPeriod, timeZone)
    const spendTodayUsd = await sumSpend(c.id, today.start, today.end)
    const spendPeriodUsd = await sumSpend(c.id, period.start, period.end)
    const capUsd = moneyUsd(c.maxBudgetUsd)
    out.push({
      id: c.id,
      name: c.name,
      slug: c.slug,
      killed: c.killed,
      keyPrefix: c.keyPrefix,
      budgetPeriod: c.budgetPeriod,
      fundingSource: c.fundingSource,
      promoExpiresAt: c.promoExpiresAt?.toISOString() ?? null,
      capUsd,
      spendTodayUsd,
      spendPeriodUsd,
      percentUsed: percentUsed(spendPeriodUsd, capUsd),
    })
  }
  return out
}

export type BreakdownRow = { name: string; requests: number; costUsd: number }

export async function clientBreakdown(
  clientId: string,
  start: Date,
  end: Date,
): Promise<{ providers: BreakdownRow[]; tags: BreakdownRow[] }> {
  const events = await prisma.usageEvent.findMany({
    where: {
      clientId,
      ts: { gte: start, lt: end },
    },
  })

  const byProvider = new Map<string, BreakdownRow>()
  const byTag = new Map<string, BreakdownRow>()

  for (const e of events) {
    const pName = e.provider || 'unknown'
    const p = byProvider.get(pName) || { name: pName, requests: 0, costUsd: 0 }
    p.requests += 1
    p.costUsd = moneyUsd(sumUsd([p.costUsd, e.costUsd]))
    byProvider.set(pName, p)

    const tName = e.tag || '(untagged)'
    const t = byTag.get(tName) || { name: tName, requests: 0, costUsd: 0 }
    t.requests += 1
    t.costUsd = moneyUsd(sumUsd([t.costUsd, e.costUsd]))
    byTag.set(tName, t)
  }

  const providers = [...byProvider.values()].sort((a, b) => b.costUsd - a.costUsd)
  const tags = [...byTag.values()].sort((a, b) => b.costUsd - a.costUsd)
  return { providers, tags }
}

export async function statementProviderRows(
  clientId: string,
  start: Date,
  end: Date,
): Promise<BreakdownRow[]> {
  const { providers } = await clientBreakdown(clientId, start, end)
  return providers
}

export function totalCost(rows: BreakdownRow[]): number {
  return moneyUsd(sumUsd(rows.map((r) => r.costUsd)))
}

export async function periodSpendForClient(
  clientId: string,
  start: Date,
  end: Date,
): Promise<number> {
  return sumSpend(clientId, start, end)
}

export async function reserveClientBudget(input: {
  reservationId: string
  clientId: string
  budgetWindowId: string
  start: Date
  end: Date
  capUsd: number
  amountUsd: number
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Client" WHERE "id" = ${input.clientId} FOR UPDATE`
    const now = new Date()
    await tx.budgetReservation.deleteMany({
      where: { clientId: input.clientId, expiresAt: { lte: now } },
    })
    const [usage, reservations] = await Promise.all([
      tx.usageEvent.aggregate({
        where: {
          clientId: input.clientId,
          ts: { gte: input.start, lt: input.end },
          status: { not: 'error' },
        },
        _sum: { costUsd: true },
      }),
      tx.budgetReservation.aggregate({
        where: {
          clientId: input.clientId,
          budgetWindowId: input.budgetWindowId,
          expiresAt: { gt: now },
        },
        _sum: { amountUsd: true },
      }),
    ])
    const spent = moneyUsd(usage._sum.costUsd ?? 0)
    const reserved = moneyUsd(reservations._sum.amountUsd ?? 0)
    const remaining = moneyUsd(input.capUsd - spent - reserved)
    const requested = Math.max(0.0001, moneyUsd(input.amountUsd))
    if (remaining < requested) return false

    await tx.budgetReservation.create({
      data: {
        id: input.reservationId,
        clientId: input.clientId,
        budgetWindowId: input.budgetWindowId,
        amountUsd: requested,
        expiresAt: new Date(now.getTime() + 5 * 60_000),
      },
    })
    return true
  })
}

export async function releaseBudgetReservation(reservationId: string): Promise<void> {
  await prisma.budgetReservation.deleteMany({ where: { id: reservationId } })
}

export async function recordUsageEvent(input: {
  requestId: string
  reservationId?: string
  clientId: string
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  status: string
  tag: string | null
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.usageEvent.upsert({
      where: { requestId: input.requestId },
      create: {
        requestId: input.requestId,
        clientId: input.clientId,
        provider: input.provider,
        model: input.model,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        costUsd: input.costUsd,
        status: input.status,
        tag: input.tag,
      },
      update: {
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        costUsd: input.costUsd,
        status: input.status,
        tag: input.tag,
      },
    })
    if (input.reservationId) {
      await tx.budgetReservation.deleteMany({ where: { id: input.reservationId } })
    }
  })
}
