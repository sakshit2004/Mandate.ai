import type { FastifyInstance } from 'fastify'
import { clerkClient } from '@clerk/fastify'
import { z } from 'zod'
import { env } from '../config.js'
import { prisma } from '../db.js'
import { clerkIdentity, recordAuditEvent, requireAdmin, requireAuth } from '../services/auth.js'
import { storeProviderKeys } from '../services/litellm.js'
import { mandateErrorBody } from '../utils/errors.js'

const onboardingSchema = z.object({
  timezone: z.string().min(2).default('America/Denver'),
  fundingMode: z.enum(['BYOK', 'MANDATE_PROMO']).optional(),
})

const invitationSchema = z.object({
  emailAddress: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER']),
})

function agencyPublic(agency: {
  id: string
  name: string
  timezone: string
  setupComplete: boolean
  fundingMode: 'BYOK' | 'MANDATE_PROMO' | null
  promoClientClaimed: boolean
  openaiConfigured: boolean
  anthropicConfigured: boolean
  clerkOrganizationId: string | null
}) {
  return {
    id: agency.id,
    name: agency.name,
    timezone: agency.timezone,
    setupComplete: agency.setupComplete,
    fundingMode: agency.fundingMode,
    promoClientClaimed: agency.promoClientClaimed,
    openaiConfigured: agency.openaiConfigured,
    anthropicConfigured: agency.anthropicConfigured,
    clerkOrganizationId: agency.clerkOrganizationId,
  }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/api/bootstrap', async () => ({
    authProvider: 'clerk',
    agencyNameDefault: env.AGENCY_NAME,
    standalone: env.STANDALONE,
  }))

  app.post('/api/team/invitations', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    const agency = await requireAdmin(request, reply)
    if (!agency) return
    const parsed = invitationSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send(mandateErrorBody('BAD_REQUEST', 'Enter a valid invitation email and role.'))
    }

    const redirectUrl = new URL('/accept-invitation', env.PUBLIC_BASE_URL)
    redirectUrl.searchParams.set('organization_id', agency.clerkOrganizationId)
    const invitation = await clerkClient.organizations.createOrganizationInvitation({
      organizationId: agency.clerkOrganizationId,
      inviterUserId: agency.actorClerkUserId,
      emailAddress: parsed.data.emailAddress.toLowerCase(),
      role: parsed.data.role === 'ADMIN' ? 'org:admin' : 'org:member',
      redirectUrl: redirectUrl.toString(),
    })
    await recordAuditEvent(agency, 'member.invited', 'organizationInvitation', invitation.id, {
      emailAddress: parsed.data.emailAddress.toLowerCase(),
      role: parsed.data.role,
    })
    return {
      invitation: {
        id: invitation.id,
        emailAddress: invitation.emailAddress,
        role: invitation.role,
        status: invitation.status,
      },
    }
  })

  app.post('/api/onboarding/complete', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const identity = clerkIdentity(request)
    if (!identity.userId) {
      return reply.code(401).send(mandateErrorBody('UNAUTHORIZED', 'Sign in required.'))
    }
    if (!identity.organizationId) {
      return reply
        .code(409)
        .send(mandateErrorBody('ORGANIZATION_REQUIRED', 'Create an agency workspace first.'))
    }
    if (identity.role !== 'ADMIN') {
      return reply
        .code(403)
        .send(mandateErrorBody('FORBIDDEN', 'Only an organization admin can provision an agency.'))
    }
    const role = identity.role

    const parsed = onboardingSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply
        .code(400)
        .send(mandateErrorBody('BAD_REQUEST', 'Invalid onboarding payload.', { issues: parsed.error.issues }))
    }

    const [organization, clerkUser] = await Promise.all([
      clerkClient.organizations.getOrganization({ organizationId: identity.organizationId }),
      clerkClient.users.getUser(identity.userId),
    ])

    const agency = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { clerkUserId: clerkUser.id },
        create: {
          clerkUserId: clerkUser.id,
          primaryEmail: clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase(),
          name: clerkUser.fullName,
          avatarUrl: clerkUser.imageUrl,
        },
        update: {
          primaryEmail: clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase(),
          name: clerkUser.fullName,
          avatarUrl: clerkUser.imageUrl,
        },
      })

      let localAgency = await tx.agency.findUnique({
        where: { clerkOrganizationId: organization.id },
      })
      if (localAgency) {
        const fundingUpdate =
          parsed.data.fundingMode && !localAgency.fundingMode
            ? {
                fundingMode: parsed.data.fundingMode,
                setupComplete:
                  parsed.data.fundingMode === 'MANDATE_PROMO'
                    ? true
                    : localAgency.setupComplete ||
                      localAgency.openaiConfigured ||
                      localAgency.anthropicConfigured,
              }
            : parsed.data.fundingMode === 'MANDATE_PROMO' && localAgency.fundingMode !== 'BYOK'
              ? { fundingMode: 'MANDATE_PROMO' as const, setupComplete: true }
              : parsed.data.fundingMode === 'BYOK' && !localAgency.fundingMode
                ? { fundingMode: 'BYOK' as const }
                : {}

        localAgency = await tx.agency.update({
          where: { id: localAgency.id },
          data: {
            name: organization.name,
            timezone: parsed.data.timezone,
            status: 'ACTIVE',
            ...fundingUpdate,
          },
        })
      }
      if (!localAgency && env.CLERK_LEGACY_AGENCY_ID) {
        const legacy = await tx.agency.findUnique({ where: { id: env.CLERK_LEGACY_AGENCY_ID } })
        if (legacy && !legacy.clerkOrganizationId) {
          localAgency = await tx.agency.update({
            where: { id: legacy.id },
            data: {
              clerkOrganizationId: organization.id,
              name: organization.name,
              timezone: parsed.data.timezone,
              status: 'ACTIVE',
              ...(parsed.data.fundingMode
                ? {
                    fundingMode: parsed.data.fundingMode,
                    setupComplete: parsed.data.fundingMode === 'MANDATE_PROMO',
                  }
                : {}),
            },
          })
        }
      }
      if (!localAgency) {
        localAgency = await tx.agency.create({
          data: {
            clerkOrganizationId: organization.id,
            name: organization.name,
            timezone: parsed.data.timezone,
            status: 'ACTIVE',
            fundingMode: parsed.data.fundingMode,
            setupComplete: parsed.data.fundingMode === 'MANDATE_PROMO',
          },
        })
      }

      await tx.agencyMembership.upsert({
        where: { agencyId_userId: { agencyId: localAgency.id, userId: user.id } },
        create: {
          agencyId: localAgency.id,
          userId: user.id,
          role,
        },
        update: { role },
      })
      return localAgency
    })

    request.log.info(
      { actorClerkUserId: identity.userId, clerkOrganizationId: organization.id, agencyId: agency.id },
      'agency provisioned',
    )
    return { agency: agencyPublic(agency) }
  })

  app.get('/api/me', async (request, reply) => {
    const agency = await requireAuth(request, reply)
    if (!agency) return
    return {
      agency: {
        id: agency.id,
        name: agency.name,
        timezone: agency.timezone,
        setupComplete: agency.setupComplete,
        fundingMode: agency.fundingMode,
        promoClientClaimed: agency.promoClientClaimed,
        openaiConfigured: agency.openaiConfigured,
        anthropicConfigured: agency.anthropicConfigured,
        clerkOrganizationId: agency.clerkOrganizationId,
      },
      user: {
        id: agency.actorClerkUserId,
        role: agency.role,
        permissions: agency.permissions,
      },
    }
  })

  app.post('/api/providers', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const agency = await requireAdmin(request, reply)
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
    if (!body.data.openaiApiKey && !body.data.anthropicApiKey) {
      return reply
        .code(400)
        .send(mandateErrorBody('BAD_REQUEST', 'Provide at least one OpenAI or Anthropic API key.'))
    }
    await storeProviderKeys({
      agencyId: agency.id,
      openaiApiKey: body.data.openaiApiKey,
      anthropicApiKey: body.data.anthropicApiKey,
    })
    await recordAuditEvent(agency, 'providers.updated', 'agency', agency.id, {
      openai: Boolean(body.data.openaiApiKey),
      anthropic: Boolean(body.data.anthropicApiKey),
    })
    const updated = await prisma.agency.findUniqueOrThrow({ where: { id: agency.id } })
    return { agency: agencyPublic(updated) }
  })
}
