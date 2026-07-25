/**
 * Production entrypoint — always starts the server (no isMain guard).
 */
import 'dotenv/config'
import { env } from './config.js'
import { buildApp } from './app.js'

async function main() {
  const port = Number(process.env.PORT || env.PORT || 8788)
  console.log(`[mandate] starting on 0.0.0.0:${port} (standalone=${env.STANDALONE})`)
  const app = await buildApp()
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`[mandate] listening on 0.0.0.0:${port}`)
}

main().catch((err) => {
  console.error('[mandate] fatal startup error', err)
  process.exit(1)
})
