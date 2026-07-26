import type { FastifyInstance } from 'fastify'
import { verifyWebhook } from '@clerk/fastify/webhooks'
import { env } from '../config.js'
import { prisma } from '../db.js'
import { mandateRoleFromClerk } from '../services/auth.js'
import { mandateErrorBody } from '../utils/errors.js'

type ClerkUserData = {
  id: string
  primary_email_address_id?: string | null
  email_addresses?: Array<{ id: string; email_address: string }>
  first_name?: string | null
  last_name?: string | null
  image_url?: string | null
}

type ClerkOrganizationData = {
  id: string
  name?: string
}

type ClerkMembershipData = {
  id: string
  role: string
  organization: { id: string; name?: string }
  public_user_data: {
    user_id: string
    identifier?: string
    first_name?: string | null
    last_name?: string | null
    image_url?: string | null
  }
}

function userName(data: { first_name?: string | null; last_name?: string | null }): string | null {
  return [data.first_name, data.last_name].filter(Boolean).join(' ') || null
}

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.post('/api/webhooks/clerk', { config: { rateLimit: false } }, async (request, reply) => {
    let event: Awaited<ReturnType<typeof verifyWebhook>>
    try {
      event = await verifyWebhook(request, {
        signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET,
      })
    } catch (error) {
      request.log.warn({ error }, 'rejected invalid Clerk webhook')
      return reply
        .code(400)
        .send(mandateErrorBody('BAD_REQUEST', 'Invalid webhook signature.'))
    }

    switch (event.type) {
      case 'user.created':
      case 'user.updated': {
        const data = event.data as ClerkUserData
        const primaryEmail = data.email_addresses
          ?.find((email) => email.id === data.primary_email_address_id)
          ?.email_address.toLowerCase()
        await prisma.user.upsert({
          where: { clerkUserId: data.id },
          create: {
            clerkUserId: data.id,
            primaryEmail,
            name: userName(data),
            avatarUrl: data.image_url,
          },
          update: {
            primaryEmail,
            name: userName(data),
            avatarUrl: data.image_url,
          },
        })
        break
      }
      case 'user.deleted': {
        const data = event.data as { id?: string | null }
        if (data.id) {
          await prisma.user.deleteMany({ where: { clerkUserId: data.id } })
        }
        break
      }
      case 'organization.created':
      case 'organization.updated': {
        const data = event.data as ClerkOrganizationData
        await prisma.agency.upsert({
          where: { clerkOrganizationId: data.id },
          create: {
            clerkOrganizationId: data.id,
            name: data.name || env.AGENCY_NAME,
            timezone: env.AGENCY_TIMEZONE,
          },
          update: {
            name: data.name || undefined,
            status: 'ACTIVE',
          },
        })
        break
      }
      case 'organization.deleted': {
        const data = event.data as { id?: string | null }
        if (data.id) {
          await prisma.agency.updateMany({
            where: { clerkOrganizationId: data.id },
            data: { status: 'DISABLED' },
          })
        }
        break
      }
      case 'organizationMembership.created':
      case 'organizationMembership.updated': {
        const data = event.data as ClerkMembershipData
        const role = mandateRoleFromClerk(data.role)
        if (!role) {
          request.log.warn(
            { clerkMembershipId: data.id, role: data.role },
            'ignored Clerk membership with unsupported role',
          )
          break
        }
        await prisma.$transaction(async (tx) => {
          const agency = await tx.agency.upsert({
            where: { clerkOrganizationId: data.organization.id },
            create: {
              clerkOrganizationId: data.organization.id,
              name: data.organization.name || env.AGENCY_NAME,
              timezone: env.AGENCY_TIMEZONE,
            },
            update: {},
          })
          const user = await tx.user.upsert({
            where: { clerkUserId: data.public_user_data.user_id },
            create: {
              clerkUserId: data.public_user_data.user_id,
              primaryEmail: data.public_user_data.identifier?.toLowerCase(),
              name: userName(data.public_user_data),
              avatarUrl: data.public_user_data.image_url,
            },
            update: {
              primaryEmail: data.public_user_data.identifier?.toLowerCase(),
              name: userName(data.public_user_data),
              avatarUrl: data.public_user_data.image_url,
            },
          })
          await tx.agencyMembership.upsert({
            where: { agencyId_userId: { agencyId: agency.id, userId: user.id } },
            create: {
              clerkMembershipId: data.id,
              agencyId: agency.id,
              userId: user.id,
              role,
            },
            update: {
              clerkMembershipId: data.id,
              role,
            },
          })
        })
        break
      }
      case 'organizationMembership.deleted': {
        const data = event.data as ClerkMembershipData
        await prisma.agencyMembership.deleteMany({
          where: { clerkMembershipId: data.id },
        })
        break
      }
      default:
        request.log.debug({ eventType: event.type }, 'ignored Clerk webhook')
    }

    return { received: true }
  })
}
