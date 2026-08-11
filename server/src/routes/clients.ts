import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { recordAuditEvent, requireAuth } from '../services/auth.js'
import {
  blockKey,
  generateVirtualKey,
  unblockKey,
  updateVirtualKey,
} from '../services/litellm.js'
import {
  enforcePromoExpiry,
  enforcePromoExpiryForAgency,
  isPromoExpired,
  PROMO_BUDGET_PERIOD,
  PROMO_BUDGET_USD,
  PROMO_LOCKED_MESSAGE,
  promoExpiresAtFromNow,
} from '../services/promo.js'
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
  fundingSource: z.enum(['BYOK', 'MANDATE_PROMO']),
})

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  maxBudgetUsd: z.number().positive().max(1_000_000).optional(),
  budgetPeriod: z.enum(['daily', 'weekly', 'monthly']).optional(),
})

function clientPublic(c: {
  id: string
  name: string
  slug: string
  keyPrefix: string
  maxBudgetUsd: number
  budgetPeriod: string
  fundingSource: 'BYOK' | 'MANDATE_PROMO'
  promoExpiresAt: Date | null
  killed: boolean
  createdAt: Date
}) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    keyPrefix: c.keyPrefix,
    maxBudgetUsd: moneyUsd(c.maxBudgetUsd),
    budgetPeriod: c.budgetPeriod,
    fundingSource: c.fundingSource,
    promoExpiresAt: c.promoExpiresAt?.toISOString() ?? null,
    killed: c.killed,
    createdAt: c.createdAt.toISOString(),
  }
}

export async function registerClientRoutes(
  app: FastifyInstance,
  resolveAuth: typeof requireAuth = requireAuth,
) {
  app.get('/api/clients', async (request, reply) => {
    const agency = await resolveAuth(request, reply)
    if (!agency) return
    await enforcePromoExpiryForAgency(agency.id)
    const clients = await prisma.client.findMany({
      where: { agencyId: agency.id },
      orderBy: { name: 'asc' },
    })
    return {
      clients: clients.map(clientPublic),
    }
  })

  app.post('/api/clients', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const agency = await resolveAuth(request, reply)
    if (!agency) return
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(mandateErrorBody('BAD_REQUEST', 'Invalid client payload.'))
    }

    const agencyRow = await prisma.agency.findUniqueOrThrow({ where: { id: agency.id } })
    const hasByok = agencyRow.openaiConfigured || agencyRow.anthropicConfigured
    const usePromo = parsed.data.fundingSource === 'MANDATE_PROMO'

    if (!usePromo && !hasByok) {
      return reply.code(400).send(
        mandateErrorBody(
          'BYOK_REQUIRED',
          'Add your own OpenAI or Anthropic API key, or choose the Mandate promo if it is still available.',
        ),
      )
    }

    const maxBudgetUsd = usePromo ? PROMO_BUDGET_USD : parsed.data.maxBudgetUsd
    const budgetPeriod = usePromo ? PROMO_BUDGET_PERIOD : parsed.data.budgetPeriod
    const fundingSource = usePromo ? ('MANDATE_PROMO' as const) : ('BYOK' as const)
    const promoExpiresAt = usePromo ? promoExpiresAtFromNow() : null

    let slug = slugify(parsed.data.name)
    if (!slug) slug = `client-${Date.now()}`
    const collision = await prisma.client.findUnique({
      where: { agencyId_slug: { agencyId: agency.id, slug } },
    })
    if (collision) slug = `${slug}-${Date.now().toString(36)}`

    const alias = `mandate:${agency.id}:${slug}`
    const generated = await generateVirtualKey({
      keyAlias: alias,
      maxBudget: maxBudgetUsd,
      budgetDuration: budgetDurationForLiteLLM(budgetPeriod),
      metadata: { client_name: parsed.data.name, agency_id: agency.id, funding_source: fundingSource },
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
        maxBudgetUsd,
        budgetPeriod,
        fundingSource,
        promoExpiresAt,
      },
    })

    await recordAuditEvent(agency, 'client.created', 'client', client.id, {
      name: client.name,
      budgetPeriod: client.budgetPeriod,
      maxBudgetUsd: client.maxBudgetUsd,
      fundingSource: client.fundingSource,
    })

    return {
      client: clientPublic(client),
      mandateKey: generated.key,
    }
  })

  app.patch('/api/clients/:id', async (request, reply) => {
    const agency = await resolveAuth(request, reply)
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

    if (
      client.fundingSource === 'MANDATE_PROMO' &&
      (parsed.data.maxBudgetUsd != null || parsed.data.budgetPeriod)
    ) {
      return reply.code(400).send(mandateErrorBody('PROMO_LOCKED', PROMO_LOCKED_MESSAGE))
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
    await recordAuditEvent(agency, 'client.updated', 'client', updated.id, parsed.data)
    return { client: clientPublic(updated) }
  })

  app.post('/api/clients/:id/kill', async (request, reply) => {
    const agency = await resolveAuth(request, reply)
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
    await recordAuditEvent(agency, 'client.killed', 'client', updated.id)
    return { client: { id: updated.id, killed: updated.killed, name: updated.name } }
  })

  app.post('/api/clients/:id/unkill', async (request, reply) => {
    const agency = await resolveAuth(request, reply)
    if (!agency) return
    const { id } = request.params as { id: string }
    let client = await prisma.client.findFirst({ where: { id, agencyId: agency.id } })
    if (!client) {
      return reply.code(404).send(mandateErrorBody('NOT_FOUND', 'Client not found.'))
    }
    client = await enforcePromoExpiry(client)

    if (isPromoExpired(client)) {
      const agencyRow = await prisma.agency.findUniqueOrThrow({ where: { id: agency.id } })
      if (!agencyRow.openaiConfigured && !agencyRow.anthropicConfigured) {
        return reply.code(400).send(
          mandateErrorBody(
            'BYOK_REQUIRED',
            'Trial ended. Add your own OpenAI or Anthropic key in Settings, then re-enable this client.',
          ),
        )
      }
      await unblockKey(unsealSecret(client.sealedKey))
      const updated = await prisma.client.update({
        where: { id: client.id },
        data: { killed: false, fundingSource: 'BYOK' },
      })
      await recordAuditEvent(agency, 'client.reenabled', 'client', updated.id, {
        convertedFromPromo: true,
      })
      return { client: { id: updated.id, killed: updated.killed, name: updated.name } }
    }

    await unblockKey(unsealSecret(client.sealedKey))
    const updated = await prisma.client.update({
      where: { id: client.id },
      data: { killed: false },
    })
    await recordAuditEvent(agency, 'client.reenabled', 'client', updated.id)
    return { client: { id: updated.id, killed: updated.killed, name: updated.name } }
  })
}
