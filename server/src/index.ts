import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import { env } from './config.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerClientRoutes } from './routes/clients.js'
import { registerDashboardRoutes } from './routes/dashboard.js'
import { registerGatewayRoutes } from './routes/gateway.js'
import { registerStatementRoutes } from './routes/statements.js'
import { runBudgetAlertPass } from './workers/budget-alerts.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function buildApp(opts: { withStatic?: boolean } = {}) {
  const app = Fastify({
    logger: true,
    bodyLimit: 25 * 1024 * 1024,
    trustProxy: true,
  })

  // Register first so static/SPA fallback can never shadow it (Railway healthcheck).
  app.get('/health', async () => ({ ok: true }))
  app.get('/api/health', async () => ({
    ok: true,
    standalone: env.STANDALONE,
    port: env.PORT,
  }))

  await app.register(cors, {
    origin: true,
    credentials: true,
  })
  await app.register(cookie, {
    secret: env.SESSION_SECRET,
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

  await registerGatewayRoutes(app)
  await registerAuthRoutes(app)
  await registerClientRoutes(app)
  await registerDashboardRoutes(app)
  await registerStatementRoutes(app)

  if (env.NODE_ENV !== 'test') {
    setInterval(() => {
      runBudgetAlertPass().catch((err) => app.log.error({ err }, 'budget alert pass failed'))
    }, 30_000)
  }

  if (opts.withStatic !== false) {
    const distDir = path.resolve(__dirname, '../../dist')
    if (fs.existsSync(distDir)) {
      await app.register(fastifyStatic, {
        root: distDir,
        // Do not register a catch-all that races API routes.
        wildcard: false,
      })
      app.setNotFoundHandler((req, reply) => {
        if (
          req.url.startsWith('/api/') ||
          req.url.startsWith('/openai/') ||
          req.url.startsWith('/anthropic/') ||
          req.url.startsWith('/health')
        ) {
          return reply.code(404).send({ error: { message: 'Not found' } })
        }
        return reply.sendFile('index.html')
      })
    }
  }

  return app
}

async function main() {
  const port = Number(process.env.PORT || env.PORT || 8788)
  const app = await buildApp()
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`Mandate listening on 0.0.0.0:${port}`)
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === entry) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

