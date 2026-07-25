import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { env } from '../config.js'
import { prisma } from '../db.js'
import {
  createSession,
  destroySession,
  hashPassword,
  requireAuth,
  verifyPassword,
} from '../services/auth.js'
import { litellmHealth, storeProviderKeys } from '../services/litellm.js'
import { mandateErrorBody } from '../utils/errors.js'

const setupSchema = z.object({
  agencyName: z.string().min(2).max(120),
  adminEmail: z.string().email(),
  password: z.string().min(8).max(200),
  timezone: z.string().min(2).default('America/Denver'),
  openaiApiKey: z.string().min(10).optional(),
  anthropicApiKey: z.string().min(10).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    const gateway = await litellmHealth()
    return { ok: true, standalone: env.STANDALONE, gateway }
  })

  app.get('/api/bootstrap', async () => {
    const count = await prisma.agency.count()
    return {
      needsSetup: count === 0,
      agencyNameDefault: env.AGENCY_NAME,
      standalone: env.STANDALONE,
    }
  })

  app.post('/api/setup', async (request, reply) => {
    const existing = await prisma.agency.count()
    if (existing > 0) {
      return reply
        .code(400)
        .send(mandateErrorBody('BAD_REQUEST', 'Setup already completed.'))
    }
    const parsed = setupSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .code(400)
        .send(mandateErrorBody('BAD_REQUEST', 'Invalid setup payload.', { issues: parsed.error.issues }))
    }
    const data = parsed.data
    if (!data.openaiApiKey && !data.anthropicApiKey) {
      return reply
        .code(400)
        .send(mandateErrorBody('BAD_REQUEST', 'Provide at least one provider API key.'))
    }

    const agency = await prisma.agency.create({
      data: {
        name: data.agencyName,
        adminEmail: data.adminEmail.toLowerCase(),
        passwordHash: await hashPassword(data.password),
        timezone: data.timezone,
        setupComplete: true,
        openaiConfigured: Boolean(data.openaiApiKey),
        anthropicConfigured: Boolean(data.anthropicApiKey),
      },
    })

    await storeProviderKeys({
      agencyId: agency.id,
      openaiApiKey: data.openaiApiKey,
      anthropicApiKey: data.anthropicApiKey,
    })

    await createSession(agency.id, reply)
    return {
      agency: {
        id: agency.id,
        name: agency.name,
        adminEmail: agency.adminEmail,
        timezone: agency.timezone,
        setupComplete: true,
        openaiConfigured: Boolean(data.openaiApiKey),
        anthropicConfigured: Boolean(data.anthropicApiKey),
      },
    }
  })

  app.post('/api/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(mandateErrorBody('BAD_REQUEST', 'Invalid credentials payload.'))
    }
    const agency = await prisma.agency.findUnique({
      where: { adminEmail: parsed.data.email.toLowerCase() },
    })
    if (!agency || !(await verifyPassword(parsed.data.password, agency.passwordHash))) {
      return reply.code(401).send(mandateErrorBody('UNAUTHORIZED', 'Invalid email or password.'))
    }
    await createSession(agency.id, reply)
    return {
      agency: {
        id: agency.id,
        name: agency.name,
        adminEmail: agency.adminEmail,
        timezone: agency.timezone,
        setupComplete: agency.setupComplete,
        openaiConfigured: agency.openaiConfigured,
        anthropicConfigured: agency.anthropicConfigured,
      },
    }
  })

  app.post('/api/logout', async (request, reply) => {
    await destroySession(request, reply)
    return { ok: true }
  })

  app.get('/api/me', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    return { agency }
  })

  app.post('/api/providers', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    const body = z
      .object({
        openaiApiKey: z.string().min(10).optional(),
        anthropicApiKey: z.string().min(10).optional(),
      })
      .safeParse(request.body)
    if (!body.success) {
      return reply.code(400).send(mandateErrorBody('BAD_REQUEST', 'Invalid provider payload.'))
    }
    await storeProviderKeys({
      agencyId: agency.id,
      openaiApiKey: body.data.openaiApiKey,
      anthropicApiKey: body.data.anthropicApiKey,
    })
    const updated = await prisma.agency.findUniqueOrThrow({ where: { id: agency.id } })
    return {
      agency: {
        id: updated.id,
        name: updated.name,
        adminEmail: updated.adminEmail,
        timezone: updated.timezone,
        setupComplete: updated.setupComplete,
        openaiConfigured: updated.openaiConfigured,
        anthropicConfigured: updated.anthropicConfigured,
      },
    }
  })
}
