import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'

describe('canonical production host', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ withStatic: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('permanently redirects www while preserving path and query', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/sign-in?redirect_url=%2Fapp',
      headers: { host: 'www.trymandate.dev' },
    })

    expect(response.statusCode).toBe(308)
    expect(response.headers.location).toBe(
      'https://trymandate.dev/sign-in?redirect_url=%2Fapp',
    )
  })

  it('does not redirect Railway health checks', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { host: 'healthcheck.railway.app' },
    })

    expect(response.statusCode).not.toBe(308)
    expect(response.headers.location).toBeUndefined()
  })
})
