import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { requireAuth } from '../services/auth.js'
import { enforcePromoExpiryForAgency } from '../services/promo.js'
import {
  clientBreakdown,
  clientSpendSummaries,
  listUsageLogs,
} from '../services/usage.js'
import { mandateErrorBody } from '../utils/errors.js'
import { periodBounds } from '../utils/periods.js'

export async function registerDashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    await enforcePromoExpiryForAgency(agency.id)
    const clients = await clientSpendSummaries(agency.id, agency.timezone)
    return {
      generatedAt: new Date().toISOString(),
      timezone: agency.timezone,
      clients,
    }
  })

  app.get('/api/clients/:id/breakdown', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    const { id } = request.params as { id: string }
    const client = await prisma.client.findFirst({ where: { id, agencyId: agency.id } })
    if (!client) {
      return reply.code(404).send(mandateErrorBody('NOT_FOUND', 'Client not found.'))
    }
    const period = periodBounds(client.budgetPeriod, agency.timezone)
    const breakdown = await clientBreakdown(client.id, period.start, period.end)
    return {
      client: {
        id: client.id,
        name: client.name,
        slug: client.slug,
        budgetPeriod: client.budgetPeriod,
        killed: client.killed,
      },
      period: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
        windowId: period.windowId,
      },
      ...breakdown,
    }
  })

  app.get('/api/usage', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    const q = request.query as {
      clientId?: string
      status?: string
      limit?: string
      offset?: string
    }

    const agencyClients = await prisma.client.findMany({
      where: { agencyId: agency.id },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    const allowedIds = new Set(agencyClients.map((c) => c.id))

    let clientIds = [...allowedIds]
    if (q.clientId) {
      if (!allowedIds.has(q.clientId)) {
        return reply.code(404).send(mandateErrorBody('NOT_FOUND', 'Client not found.'))
      }
      clientIds = [q.clientId]
    }

    const status =
      q.status === 'success' || q.status === 'error' ? q.status : undefined
    const limit = q.limit ? Number(q.limit) : 200
    const offset = q.offset ? Number(q.offset) : 0

    const { logs, total } = await listUsageLogs({
      clientIds,
      status,
      limit: Number.isFinite(limit) ? limit : 200,
      offset: Number.isFinite(offset) ? offset : 0,
    })

    return {
      generatedAt: new Date().toISOString(),
      total,
      limit,
      offset,
      clients: agencyClients,
      logs,
    }
  })
}
