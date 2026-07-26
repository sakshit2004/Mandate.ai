import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'

describe('production auth boundaries', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ withStatic: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('rejects an unauthenticated API request', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/me' })
    expect(response.statusCode).toBe(401)
    expect(response.json().error.code).toBe('UNAUTHORIZED')
  })

  it('rejects an unsigned Clerk webhook', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/webhooks/clerk',
      payload: { type: 'user.created', data: { id: 'user_test' } },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.message).toBe('Invalid webhook signature.')
  })

  it('sets production security headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/bootstrap' })
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(response.headers['content-security-policy']).toContain("default-src 'self'")
  })
})
