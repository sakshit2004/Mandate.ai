/**
 * Single-process dev server: Mandate API + Vite UI on ONE port.
 * No :3001 — UI and API share PORT (default 8788).
 */
import 'dotenv/config'
import middie from '@fastify/middie'
import { createServer as createViteServer } from 'vite'
import { buildApp } from './index.js'

const PORT = Number(process.env.PORT || 8788)

async function main() {
  process.env.PUBLIC_BASE_URL = `http://localhost:${PORT}`

  const app = await buildApp({ withStatic: false })

  const vite = await createViteServer({
    server: { middlewareMode: true },
    // custom — do NOT let Vite SPA-fallback swallow /api/*
    appType: 'custom',
  })

  await app.register(middie)

  // Vite must never handle API / gateway paths
  app.use((req, res, next) => {
    const url = req.originalUrl || req.url || ''
    if (
      url.startsWith('/api/') ||
      url.startsWith('/openai/') ||
      url.startsWith('/anthropic/')
    ) {
      return next()
    }
    return vite.middlewares(req, res, next)
  })

  app.setNotFoundHandler(async (req, reply) => {
    if (
      req.url.startsWith('/api/') ||
      req.url.startsWith('/openai/') ||
      req.url.startsWith('/anthropic/')
    ) {
      return reply.code(404).send({ error: { message: 'Not found' } })
    }

    try {
      const template = await vite.transformIndexHtml(
        req.url,
        `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mandate</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
      )
      return reply.type('text/html').send(template)
    } catch (err) {
      vite.ssrFixStacktrace(err as Error)
      throw err
    }
  })

  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`\n  Mandate (API + UI) → http://localhost:${PORT}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
