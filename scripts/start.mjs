#!/usr/bin/env node
/**
 * Production boot for Railway/Render/Docker.
 * 1) Bind /health immediately (so healthchecks pass while DB warms up)
 * 2) Run prisma migrate deploy (with retries)
 * 3) Start the real Fastify app on the same PORT
 */
import http from 'node:http'
import { spawnSync } from 'node:child_process'

function log(...args) {
  console.log('[mandate]', ...args)
}

function fatal(...args) {
  console.error('[mandate] FATAL:', ...args)
  process.exit(1)
}

const port = Number(process.env.PORT || 8788)

if (!process.env.DATABASE_URL) {
  fatal('DATABASE_URL is not set. Link the Railway Postgres plugin to this service.')
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  fatal('SESSION_SECRET must be set (16+ characters) on this service.')
}

if (!/[?&]connect_timeout=/.test(process.env.DATABASE_URL)) {
  const join = process.env.DATABASE_URL.includes('?') ? '&' : '?'
  process.env.DATABASE_URL = `${process.env.DATABASE_URL}${join}connect_timeout=10`
}

log(`boot NODE_ENV=${process.env.NODE_ENV || ''} PORT=${port}`)
log(`DATABASE_URL=set SESSION_SECRET=set`)

const probe = http.createServer((req, res) => {
  const path = req.url?.split('?')[0]
  if (path === '/health' || path === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, stage: 'starting' }))
    return
  }
  res.writeHead(503, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: false, stage: 'starting' }))
})

await new Promise((resolve, reject) => {
  probe.once('error', reject)
  probe.listen(port, '0.0.0.0', () => resolve())
})
log(`health probe listening on 0.0.0.0:${port}`)

function migrateOnce() {
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  })
  return result.status === 0
}

log('running prisma migrate deploy…')
let migrated = false
for (let i = 1; i <= 30; i++) {
  if (migrateOnce()) {
    migrated = true
    break
  }
  log(`migrate failed, retry ${i}/30…`)
  await new Promise((r) => setTimeout(r, 2000))
}
if (!migrated) {
  fatal('prisma migrate deploy failed after 30 attempts. Check DATABASE_URL is linked.')
}

log('migrate ok — swapping to Fastify')
await new Promise((resolve, reject) => {
  probe.close((err) => (err ? reject(err) : resolve()))
})
// Brief pause so the OS releases the port
await new Promise((r) => setTimeout(r, 150))

const { buildApp } = await import('../server/dist/app.js')
const app = await buildApp()

for (let i = 0; i < 20; i++) {
  try {
    await app.listen({ port, host: '0.0.0.0' })
    log(`listening on 0.0.0.0:${port}`)
    break
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE' && i < 19) {
      log(`port ${port} busy, retry ${i + 1}/20…`)
      await new Promise((r) => setTimeout(r, 200))
      continue
    }
    throw err
  }
}
