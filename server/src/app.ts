import Fastify from 'fastify'
import type { FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import { clerkPlugin } from '@clerk/fastify'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { env } from './config.js'
import { prisma } from './db.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerClientRoutes } from './routes/clients.js'
import { registerDashboardRoutes } from './routes/dashboard.js'
import { registerGatewayRoutes } from './routes/gateway.js'
import { registerStatementRoutes } from './routes/statements.js'
import { registerWebhookRoutes } from './routes/webhooks.js'
import { mandateErrorBody } from './utils/errors.js'
import { runBudgetAlertPass } from './workers/budget-alerts.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CANONICAL_HOST = 'trymandate.dev'
const WWW_HOST = `www.${CANONICAL_HOST}`

export async function buildApp(opts: { withStatic?: boolean } = {}) {
  const app = Fastify({
    logger: true,
    bodyLimit: 10 * 1024 * 1024,
    trustProxy: env.NODE_ENV === 'production' ? 1 : false,
  })

  app.addHook('onRequest', async (request, reply) => {
    if (request.hostname.toLowerCase().replace(/\.$/, '') !== WWW_HOST) return

    const requestTarget = request.raw.url?.startsWith('/') ? request.raw.url : '/'
    return reply.code(308).redirect(`https://${CANONICAL_HOST}${requestTarget}`)
  })

  // Register first so static/SPA fallback can never shadow it (Railway healthcheck).
  const healthResponse = async (reply: FastifyReply) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return {
        ok: true,
        database: 'ready',
        standalone: env.STANDALONE,
        port: Number(process.env.PORT || env.PORT),
      }
    } catch {
      return reply.code(503).send({
        ok: false,
        database: 'unavailable',
      })
    }
  }
  app.get('/health', async (_request, reply) => healthResponse(reply))
  app.get('/api/health', async (_request, reply) => healthResponse(reply))

  await app.register(cors, {
    origin: env.APP_ORIGINS,
    credentials: false,
  })
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://*.clerk.accounts.dev',
          'https://*.clerk.com',
          'https://challenges.cloudflare.com',
        ],
        connectSrc: [
          "'self'",
          ...env.APP_ORIGINS,
          'https://*.clerk.accounts.dev',
          'https://*.clerk.com',
          'https://api.clerk.com',
        ],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        workerSrc: ["'self'", 'blob:'],
        frameSrc: [
          "'self'",
          'https://*.clerk.accounts.dev',
          'https://*.clerk.com',
          'https://challenges.cloudflare.com',
        ],
      },
    },
  })
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  })
  await app.register(clerkPlugin, {
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    jwtKey: env.CLERK_JWT_KEY,
  })

  app.addContentTypeParser(
    ['application/json', 'application/json; charset=utf-8'],
    { parseAs: 'buffer' },
    (req, body, done) => {
      const url = req.url || ''
      if (url.startsWith('/openai/') || url.startsWith('/anthropic/')) {
        done(null, body)
        return
      }
      try {
        const json = body.length ? JSON.parse(body.toString('utf8')) : {}
        done(null, json)
      } catch (err) {
        done(err as Error, undefined)
      }
    },
  )

  await registerWebhookRoutes(app)
  await registerGatewayRoutes(app)
  await registerAuthRoutes(app)
  await registerClientRoutes(app)
  await registerDashboardRoutes(app)
  await registerStatementRoutes(app)

  app.setErrorHandler((error, request, reply) => {
    const err = error instanceof Error ? error : new Error('Unknown request error')
    const statusCode = (err as Error & { statusCode?: number }).statusCode
    const status = statusCode && statusCode >= 400 ? statusCode : 500
    if (status >= 500) {
      request.log.error({ err }, 'unhandled request error')
    } else {
      request.log.warn({ err }, 'request rejected')
    }
    return reply
      .code(status)
      .send(
        mandateErrorBody(
          status >= 500
            ? 'INTERNAL_ERROR'
            : status === 401
              ? 'UNAUTHORIZED'
              : status === 403
                ? 'FORBIDDEN'
                : 'BAD_REQUEST',
          status >= 500 ? 'An unexpected error occurred.' : err.message,
        ),
      )
  })

  if (env.NODE_ENV !== 'test') {
    const alertTimer = setInterval(() => {
      runBudgetAlertPass().catch((err) => app.log.error({ err }, 'budget alert pass failed'))
    }, 30_000)
    alertTimer.unref()
  }

  if (opts.withStatic !== false) {
    const distDir = path.resolve(__dirname, '../../dist')
    if (fs.existsSync(distDir)) {
      await app.register(fastifyStatic, {
        root: distDir,
        wildcard: false,
      })
      app.setNotFoundHandler((req, reply) => {
        if (
          req.url.startsWith('/api/') ||
          req.url.startsWith('/openai/') ||
          req.url.startsWith('/anthropic/') ||
          req.url === '/health' ||
          req.url.startsWith('/health?')
        ) {
          return reply.code(404).send({ error: { message: 'Not found' } })
        }
        return reply.sendFile('index.html')
      })
    }
  }

  return app
}
