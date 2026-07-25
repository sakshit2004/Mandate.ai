import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth } from '../services/auth.js'
import {
  aggregateStatement,
  buildStatementCsv,
  renderStatementPdf,
} from '../services/statements.js'
import { statementProviderRows } from '../services/usage.js'
import { mandateErrorBody } from '../utils/errors.js'
import { statementMonthBounds } from '../utils/periods.js'

export async function registerStatementRoutes(app: FastifyInstance) {
  app.get('/api/clients/:id/statement', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    const { id } = request.params as { id: string }
    const query = z
      .object({
        period: z.enum(['current', 'previous']).default('current'),
        format: z.enum(['pdf', 'csv', 'json']).default('pdf'),
      })
      .safeParse(request.query)

    if (!query.success) {
      return reply.code(400).send(mandateErrorBody('BAD_REQUEST', 'Invalid statement query.'))
    }

    const client = await prisma.client.findFirst({ where: { id, agencyId: agency.id } })
    if (!client) {
      return reply.code(404).send(mandateErrorBody('NOT_FOUND', 'Client not found.'))
    }

    const bounds = statementMonthBounds(query.data.period, agency.timezone)
    const rows = await statementProviderRows(client.id, bounds.start, bounds.end)
    const data = aggregateStatement(agency.name, client.name, bounds.label, rows)
    const base = `${client.slug}-${bounds.label.toLowerCase().replace(/\s+/g, '-')}`

    if (query.data.format === 'json') {
      return data
    }

    if (query.data.format === 'csv') {
      const csv = buildStatementCsv(data)
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${base}.csv"`)
      return reply.send(csv)
    }

    const pdf = await renderStatementPdf(data)
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `attachment; filename="${base}.pdf"`)
    return reply.send(pdf)
  })
}
