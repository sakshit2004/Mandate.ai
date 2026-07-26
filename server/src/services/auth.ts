import type { FastifyReply, FastifyRequest } from 'fastify'
import { getAuth } from '@clerk/fastify'
import { Prisma } from '@prisma/client'
import { env } from '../config.js'
import { prisma } from '../db.js'
import { mandateErrorBody } from '../utils/errors.js'

export type MandateRole = 'ADMIN' | 'MEMBER'

export type AuthAgency = {
  id: string
  clerkOrganizationId: string
  name: string
  timezone: string
  status: 'ACTIVE' | 'DISABLED'
  setupComplete: boolean
  openaiConfigured: boolean
  anthropicConfigured: boolean
  actorClerkUserId: string
  role: MandateRole
  permissions: string[]
}

declare module 'fastify' {
  interface FastifyRequest {
    agency?: AuthAgency
  }
}

function roleFromClerk(role: string | null | undefined): MandateRole {
  return role === 'org:admin' || role === 'admin' ? 'ADMIN' : 'MEMBER'
}

export function clerkIdentity(
  request: FastifyRequest,
): {
  userId: string | null
  organizationId: string | null
  role: MandateRole
  permissions: string[]
} {
  const auth = getAuth(request)
  const authorizedParty =
    typeof auth.sessionClaims?.azp === 'string' ? auth.sessionClaims.azp.replace(/\/$/, '') : null
  const partyAllowed = authorizedParty !== null && env.APP_ORIGINS.includes(authorizedParty)
  return {
    userId: partyAllowed ? (auth.userId ?? null) : null,
    organizationId: partyAllowed ? (auth.orgId ?? null) : null,
    role: roleFromClerk(auth.orgRole),
    permissions: [...(auth.orgPermissions || [])],
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthAgency | null> {
  const identity = clerkIdentity(request)
  if (!identity.userId) {
    reply.code(401).send(mandateErrorBody('UNAUTHORIZED', 'Sign in required.'))
    return null
  }
  if (!identity.organizationId) {
    reply
      .code(409)
      .send(mandateErrorBody('ORGANIZATION_REQUIRED', 'Select or create an agency workspace.'))
    return null
  }
  const row = await prisma.agency.findUnique({
    where: { clerkOrganizationId: identity.organizationId },
  })
  if (!row) {
    reply
      .code(409)
      .send(mandateErrorBody('SETUP_REQUIRED', 'Complete agency onboarding before continuing.'))
    return null
  }
  if (row.status === 'DISABLED') {
    reply.code(403).send(mandateErrorBody('FORBIDDEN', 'This agency workspace is disabled.'))
    return null
  }
  const agency: AuthAgency = {
    id: row.id,
    clerkOrganizationId: identity.organizationId,
    name: row.name,
    timezone: row.timezone,
    status: row.status,
    setupComplete: row.setupComplete,
    openaiConfigured: row.openaiConfigured,
    anthropicConfigured: row.anthropicConfigured,
    actorClerkUserId: identity.userId,
    role: identity.role,
    permissions: identity.permissions,
  }
  request.agency = agency
  return agency
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthAgency | null> {
  const agency = await requireAuth(request, reply)
  if (!agency) return null
  if (agency.role !== 'ADMIN') {
    reply.code(403).send(mandateErrorBody('FORBIDDEN', 'Agency admin access required.'))
    return null
  }
  return agency
}

export async function recordAuditEvent(
  agency: AuthAgency,
  action: string,
  targetType: string,
  targetId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      agencyId: agency.id,
      actorClerkUserId: agency.actorClerkUserId,
      action,
      targetType,
      targetId,
      metadata: metadata as Prisma.InputJsonValue | undefined,
    },
  })
}
