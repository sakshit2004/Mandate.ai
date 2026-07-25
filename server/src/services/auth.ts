import bcrypt from 'bcryptjs'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '../config.js'
import { prisma } from '../db.js'
import { mandateErrorBody } from '../utils/errors.js'
import { hashToken, newSessionToken } from './litellm.js'

const COOKIE = 'mandate_session'
const SESSION_DAYS = 14

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSession(agencyId: string, reply: FastifyReply) {
  const token = newSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await prisma.session.create({
    data: {
      agencyId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  })
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    expires: expiresAt,
  })
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[COOKIE]
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
  }
  reply.clearCookie(COOKIE, { path: '/' })
}

export type AuthAgency = {
  id: string
  name: string
  timezone: string
  adminEmail: string
  setupComplete: boolean
  openaiConfigured: boolean
  anthropicConfigured: boolean
}

declare module 'fastify' {
  interface FastifyRequest {
    agency?: AuthAgency
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthAgency | null> {
  const token = request.cookies[COOKIE]
  if (!token) {
    reply.code(401).send(mandateErrorBody('UNAUTHORIZED', 'Sign in required.'))
    return null
  }
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { agency: true },
  })
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } })
    reply.clearCookie(COOKIE, { path: '/' })
    reply.code(401).send(mandateErrorBody('UNAUTHORIZED', 'Session expired.'))
    return null
  }
  const agency: AuthAgency = {
    id: session.agency.id,
    name: session.agency.name,
    timezone: session.agency.timezone,
    adminEmail: session.agency.adminEmail,
    setupComplete: session.agency.setupComplete,
    openaiConfigured: session.agency.openaiConfigured,
    anthropicConfigured: session.agency.anthropicConfigured,
  }
  request.agency = agency
  return agency
}
