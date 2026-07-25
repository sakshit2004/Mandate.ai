import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { requireAuth } from '../services/auth.js'
import {
  blockKey,
  generateVirtualKey,
  unblockKey,
  updateVirtualKey,
} from '../services/litellm.js'
import { mandateErrorBody } from '../utils/errors.js'
import { budgetDurationForLiteLLM } from '../utils/periods.js'
import { moneyUsd } from '../utils/money.js'
import { sealSecret, unsealSecret } from '../utils/seal.js'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

const createSchema = z.object({
  name: z.string().min(2).max(120),
  maxBudgetUsd: z.number().positive().max(1_000_000),
  budgetPeriod: z.enum(['daily', 'weekly', 'monthly']).default('monthly'),
})

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  maxBudgetUsd: z.number().positive().max(1_000_000).optional(),
  budgetPeriod: z.enum(['daily', 'weekly', 'monthly']).optional(),
})

export async function registerClientRoutes(app: FastifyInstance) {
  app.get('/api/clients', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    const clients = await prisma.client.findMany({
      where: { agencyId: agency.id },
      orderBy: { name: 'asc' },
    })
    return {
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        keyPrefix: c.keyPrefix,
        maxBudgetUsd: moneyUsd(c.maxBudgetUsd),
        budgetPeriod: c.budgetPeriod,
        killed: c.killed,
        createdAt: c.createdAt.toISOString(),
      })),
    }
  })

  app.post('/api/clients', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(mandateErrorBody('BAD_REQUEST', 'Invalid client payload.'))
    }

    let slug = slugify(parsed.data.name)
    if (!slug) slug = `client-${Date.now()}`
    const collision = await prisma.client.findUnique({
      where: { agencyId_slug: { agencyId: agency.id, slug } },
    })
    if (collision) slug = `${slug}-${Date.now().toString(36)}`

    const alias = `mandate:${agency.id}:${slug}`
    const generated = await generateVirtualKey({
      keyAlias: alias,
      maxBudget: parsed.data.maxBudgetUsd,
      budgetDuration: budgetDurationForLiteLLM(parsed.data.budgetPeriod),
      metadata: { client_name: parsed.data.name, agency_id: agency.id },
    })

    const client = await prisma.client.create({
      data: {
        agencyId: agency.id,
        name: parsed.data.name,
        slug,
        tokenHash: generated.tokenHash,
        keyAlias: alias,
        keyPrefix: generated.key.slice(0, 12),
        sealedKey: sealSecret(generated.key),
        maxBudgetUsd: parsed.data.maxBudgetUsd,
        budgetPeriod: parsed.data.budgetPeriod,
      },
    })

    return {
      client: {
        id: client.id,
        name: client.name,
        slug: client.slug,
        keyPrefix: client.keyPrefix,
        maxBudgetUsd: moneyUsd(client.maxBudgetUsd),
        budgetPeriod: client.budgetPeriod,
        killed: client.killed,
        createdAt: client.createdAt.toISOString(),
      },
      mandateKey: generated.key,
    }
  })

  app.patch('/api/clients/:id', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    const { id } = request.params as { id: string }
    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(mandateErrorBody('BAD_REQUEST', 'Invalid update payload.'))
    }
    const client = await prisma.client.findFirst({ where: { id, agencyId: agency.id } })
    if (!client) {
      return reply.code(404).send(mandateErrorBody('NOT_FOUND', 'Client not found.'))
    }

    if (parsed.data.maxBudgetUsd != null || parsed.data.budgetPeriod) {
      const rawKey = unsealSecret(client.sealedKey)
      await updateVirtualKey({
        key: rawKey,
        maxBudget: parsed.data.maxBudgetUsd ?? moneyUsd(client.maxBudgetUsd),
        budgetDuration: budgetDurationForLiteLLM(
          parsed.data.budgetPeriod ?? client.budgetPeriod,
        ),
        metadata: { client_name: parsed.data.name ?? client.name },
      })
    }

    const updated = await prisma.client.update({
      where: { id: client.id },
      data: {
        name: parsed.data.name,
        maxBudgetUsd: parsed.data.maxBudgetUsd,
        budgetPeriod: parsed.data.budgetPeriod,
      },
    })
    return {
      client: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        keyPrefix: updated.keyPrefix,
        maxBudgetUsd: moneyUsd(updated.maxBudgetUsd),
        budgetPeriod: updated.budgetPeriod,
        killed: updated.killed,
        createdAt: updated.createdAt.toISOString(),
      },
    }
  })

  app.post('/api/clients/:id/kill', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    const { id } = request.params as { id: string }
    const client = await prisma.client.findFirst({ where: { id, agencyId: agency.id } })
    if (!client) {
      return reply.code(404).send(mandateErrorBody('NOT_FOUND', 'Client not found.'))
    }
    await blockKey(unsealSecret(client.sealedKey))
    const updated = await prisma.client.update({
      where: { id: client.id },
      data: { killed: true },
    })
    return { client: { id: updated.id, killed: updated.killed, name: updated.name } }
  })

  app.post('/api/clients/:id/unkill', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    const { id } = request.params as { id: string }
    const client = await prisma.client.findFirst({ where: { id, agencyId: agency.id } })
    if (!client) {
      return reply.code(404).send(mandateErrorBody('NOT_FOUND', 'Client not found.'))
    }
    await unblockKey(unsealSecret(client.sealedKey))
    const updated = await prisma.client.update({
      where: { id: client.id },
      data: { killed: false },
    })
    return { client: { id: updated.id, killed: updated.killed, name: updated.name } }
  })
}
