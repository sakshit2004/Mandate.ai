import type { FastifyInstance, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { env } from '../config.js'
import { prisma } from '../db.js'
import { estimateCostUsd, getProviderKey, hashToken } from '../services/litellm.js'
import { enforcePromoExpiry, isPromoExpired } from '../services/promo.js'
import {
  recordUsageEvent,
  releaseBudgetReservation,
  reserveClientBudget,
} from '../services/usage.js'
import { mandateErrorBody, mapLiteLLMGateError } from '../utils/errors.js'
import { moneyUsd } from '../utils/money.js'
import { periodBounds } from '../utils/periods.js'
import { normalizeMandateTag } from '../utils/tags.js'

type Provider = 'openai' | 'anthropic'

function extractApiKey(request: FastifyRequest): string | null {
  const auth = request.headers.authorization
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim()
  }
  const xApi = request.headers['x-api-key']
  if (typeof xApi === 'string' && xApi.trim()) return xApi.trim()
  return null
}

function stripProviderPrefix(model: unknown): unknown {
  if (typeof model !== 'string') return model
  return model.replace(/^(openai|anthropic)\//, '')
}

/**
 * OpenAI only accepts stream_options when stream:true on chat/completions.
 * n8n/LangChain often attaches stream_options.include_usage on non-stream calls → 400.
 */
function sanitizeOpenAIBody(
  body: Record<string, unknown>,
  restPath: string,
): Record<string, unknown> {
  const next = { ...body }
  const isChatCompletions = restPath.replace(/^\/+/, '').startsWith('chat/completions')
  const streaming = next.stream === true

  if (!isChatCompletions || !streaming) {
    delete next.stream_options
    return next
  }

  const existing =
    next.stream_options && typeof next.stream_options === 'object'
      ? (next.stream_options as Record<string, unknown>)
      : {}
  next.stream_options = { ...existing, include_usage: true }
  return next
}

function rewriteBody(
  provider: Provider,
  raw: Buffer | undefined,
  contentType: string | undefined,
  restPath = '',
) {
  if (!raw || raw.length === 0) {
    return { body: undefined as Buffer | undefined, json: null as Record<string, unknown> | null }
  }
  if (!contentType?.includes('application/json')) {
    return { body: raw, json: null }
  }
  try {
    const parsed = JSON.parse(raw.toString('utf8')) as Record<string, unknown>
    // Providers want bare model names; LiteLLM wanted prefixed — standalone strips.
    if (env.STANDALONE) {
      parsed.model = stripProviderPrefix(parsed.model)
    } else if (typeof parsed.model === 'string' && !parsed.model.includes('/')) {
      parsed.model = `${provider}/${parsed.model}`
    }
    const next = provider === 'openai' ? sanitizeOpenAIBody(parsed, restPath) : parsed
    return { body: Buffer.from(JSON.stringify(next), 'utf8'), json: next }
  } catch {
    return { body: raw, json: null }
  }
}

function upstreamUrl(provider: Provider, restPath: string, search: string): string {
  const clean = restPath.replace(/^\/+/, '')
  if (env.STANDALONE) {
    if (provider === 'openai') {
      return `https://api.openai.com/v1/${clean}${search}`
    }
    return `https://api.anthropic.com/v1/${clean}${search}`
  }
  const base = env.LITELLM_BASE_URL!.replace(/\/$/, '')
  return `${base}/v1/${clean}${search}`
}

function extractUsage(json: Record<string, unknown> | null): {
  tokensIn: number
  tokensOut: number
} {
  if (!json) return { tokensIn: 0, tokensOut: 0 }
  const usage = (json.usage || {}) as Record<string, unknown>
  const tokensIn = Number(
    usage.prompt_tokens ?? usage.input_tokens ?? 0,
  )
  const tokensOut = Number(
    usage.completion_tokens ?? usage.output_tokens ?? 0,
  )
  return {
    tokensIn: Number.isFinite(tokensIn) ? tokensIn : 0,
    tokensOut: Number.isFinite(tokensOut) ? tokensOut : 0,
  }
}

async function collectSseUsage(text: string): Promise<{ tokensIn: number; tokensOut: number }> {
  let tokensIn = 0
  let tokensOut = 0
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const chunk = JSON.parse(payload) as Record<string, unknown>
      const u = extractUsage(chunk)
      if (u.tokensIn || u.tokensOut) {
        tokensIn = u.tokensIn
        tokensOut = u.tokensOut
      }
      // Anthropic message_delta usage
      const deltaUsage = (chunk.usage || (chunk.message as { usage?: Record<string, unknown> })?.usage) as
        | Record<string, unknown>
        | undefined
      if (deltaUsage) {
        tokensIn = Number(deltaUsage.input_tokens ?? tokensIn) || tokensIn
        tokensOut = Number(deltaUsage.output_tokens ?? tokensOut) || tokensOut
      }
    } catch {
      // ignore non-JSON SSE lines
    }
  }
  return { tokensIn, tokensOut }
}

export async function registerGatewayRoutes(app: FastifyInstance) {
  const handler = (provider: Provider) => {
    return async (request: FastifyRequest, reply: import('fastify').FastifyReply) => {
      const key = extractApiKey(request)
      if (!key) {
        return reply
          .code(401)
          .send(mandateErrorBody('INVALID_MANDATE_KEY', 'Missing Mandate API key.'))
      }

      const clientRow = await prisma.client.findUnique({
        where: { tokenHash: hashToken(key) },
        include: { agency: true },
      })
      if (!clientRow) {
        return reply
          .code(401)
          .send(mandateErrorBody('INVALID_MANDATE_KEY', 'Unknown Mandate API key.'))
      }
      const client = await enforcePromoExpiry(clientRow)
      if (client.agency.status === 'DISABLED') {
        return reply
          .code(403)
          .send(mandateErrorBody('CLIENT_KEY_KILLED', 'This agency workspace is disabled.'))
      }
      if (isPromoExpired(client) || (client.killed && client.fundingSource === 'MANDATE_PROMO' && client.promoExpiresAt && client.promoExpiresAt.getTime() < Date.now())) {
        return reply.code(403).send(
          mandateErrorBody(
            'PROMO_TRIAL_ENDED',
            `Mandate free credits for ${client.name} have ended. Add your own OpenAI or Anthropic key in Settings, then re-enable this client.`,
            { client: client.name },
          ),
        )
      }
      if (client.killed) {
        return reply.code(403).send(
          mandateErrorBody(
            'CLIENT_KEY_KILLED',
            `Client ${client.name} is killed. Re-enable the key in Mandate to resume.`,
            { client: client.name },
          ),
        )
      }

      let tag: string | null = null
      try {
        const headerTag = request.headers['x-mandate-tag']
        tag = normalizeMandateTag(typeof headerTag === 'string' ? headerTag : null)
      } catch {
        return reply
          .code(400)
          .send(mandateErrorBody('INVALID_MANDATE_TAG', 'X-Mandate-Tag is invalid.'))
      }

      const params = request.params as { '*': string }
      const rest = params['*'] || ''
      const search = request.url.includes('?') ? '?' + request.url.split('?')[1] : ''
      const contentType = request.headers['content-type']
      const rawBody = request.body as Buffer | undefined
      const { body, json: reqJson } = rewriteBody(provider, rawBody, contentType, rest)
      const model =
        typeof reqJson?.model === 'string'
          ? String(stripProviderPrefix(reqJson.model))
          : 'unknown'
      const period = periodBounds(client.budgetPeriod, client.agency.timezone)
      const reservationId = randomUUID()
      const estimatedInputTokens = Math.ceil((rawBody?.byteLength || 0) / 4)
      const requestedOutputTokens = Number(
        reqJson?.max_output_tokens ?? reqJson?.max_completion_tokens ?? reqJson?.max_tokens ?? 4096,
      )
      const estimatedCost = estimateCostUsd(
        model,
        estimatedInputTokens,
        Number.isFinite(requestedOutputTokens) ? requestedOutputTokens : 4096,
      )
      const reserved = await reserveClientBudget({
        reservationId,
        clientId: client.id,
        budgetWindowId: period.windowId,
        start: period.start,
        end: period.end,
        capUsd: moneyUsd(client.maxBudgetUsd),
        amountUsd: Math.max(0.01, estimatedCost * 1.25),
      })
      if (!reserved) {
        return reply.code(429).send(
          mandateErrorBody(
            'CLIENT_BUDGET_EXCEEDED',
            `Client ${client.name} is over budget. Raise the cap or wait for the next period.`,
            { client: client.name },
          ),
        )
      }

      const headers = new Headers()
      if (env.STANDALONE) {
        const providerKey = await getProviderKey(client.agencyId, provider, {
          fundingSource: client.fundingSource,
        })
        if (!providerKey) {
          await releaseBudgetReservation(reservationId)
          const promoHint =
            client.fundingSource === 'MANDATE_PROMO'
              ? 'Mandate platform provider keys are not configured. Contact support.'
              : `No ${provider} provider key configured. Add it in Settings.`
          return reply.code(502).send(mandateErrorBody('UPSTREAM_ERROR', promoHint))
        }
        if (provider === 'openai') {
          headers.set('Authorization', `Bearer ${providerKey}`)
        } else {
          headers.set('x-api-key', providerKey)
          headers.set('anthropic-version', String(request.headers['anthropic-version'] || '2023-06-01'))
        }
      } else {
        headers.set('Authorization', `Bearer ${key}`)
        headers.set('x-api-key', key)
        if (tag) {
          headers.set('x-mandate-tag', tag)
          headers.set('x-litellm-tags', tag)
        }
      }
      if (contentType) headers.set('Content-Type', contentType)
      const accept = request.headers.accept
      if (typeof accept === 'string') headers.set('Accept', accept)
      const anthropicVersion = request.headers['anthropic-version']
      if (typeof anthropicVersion === 'string' && provider === 'anthropic') {
        headers.set('anthropic-version', anthropicVersion)
      }

      const method = request.method.toUpperCase()
      const target = upstreamUrl(provider, rest, search)
      let upstream: Response
      try {
        upstream = await fetch(target, {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' ? undefined : body,
        })
      } catch (err) {
        await releaseBudgetReservation(reservationId)
        request.log.error({ err }, 'upstream fetch failed')
        return reply
          .code(502)
          .send(mandateErrorBody('UPSTREAM_ERROR', 'Mandate could not reach the upstream provider.'))
      }

      const requestId =
        upstream.headers.get('x-request-id') ||
        upstream.headers.get('request-id') ||
        randomUUID()
      const isEventStream = upstream.headers.get('content-type')?.includes('text/event-stream')

      if (!isEventStream && upstream.status >= 400) {
        const upstreamText = await upstream.text()
        if (!env.STANDALONE) {
          const mapped = mapLiteLLMGateError(upstream.status, upstreamText, client.name)
          if (mapped) return reply.code(mapped.status).send(mapped.body)
        }
        await recordUsageEvent({
          requestId,
          reservationId,
          clientId: client.id,
          provider,
          model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          status: 'error',
          tag,
        })
        reply.code(upstream.status)
        const ct = upstream.headers.get('content-type')
        if (ct) reply.header('content-type', ct)
        return reply.send(upstreamText)
      }

      if (!isEventStream) {
        const buf = Buffer.from(await upstream.arrayBuffer())
        let tokensIn = 0
        let tokensOut = 0
        try {
          const parsed = JSON.parse(buf.toString('utf8')) as Record<string, unknown>
          const u = extractUsage(parsed)
          tokensIn = u.tokensIn
          tokensOut = u.tokensOut
        } catch {
          // non-json
        }
        const costUsd = estimateCostUsd(model, tokensIn, tokensOut)
        await recordUsageEvent({
          requestId,
          reservationId,
          clientId: client.id,
          provider,
          model,
          tokensIn,
          tokensOut,
          costUsd,
          status: upstream.ok ? 'success' : 'error',
          tag,
        })
        reply.code(upstream.status)
        reply.header('x-mandate-request-id', requestId)
        reply.header('x-mandate-response-cost', String(costUsd))
        const ct = upstream.headers.get('content-type')
        if (ct) reply.header('content-type', ct)
        return reply.send(buf)
      }

      // Streaming: buffer SSE to meter final usage, then replay to client.
      const text = await upstream.text()
      const usage = await collectSseUsage(text)
      const costUsd = estimateCostUsd(model, usage.tokensIn, usage.tokensOut)
      await recordUsageEvent({
        requestId,
        reservationId,
        clientId: client.id,
        provider,
        model,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costUsd,
        status: upstream.ok ? 'success' : 'error',
        tag,
      })
      reply.code(upstream.status)
      reply.header('content-type', upstream.headers.get('content-type') || 'text/event-stream')
      reply.header('x-mandate-request-id', requestId)
      reply.header('x-mandate-response-cost', String(costUsd))
      return reply.send(Readable.from([text]))
    }
  }

  const gatewayRate = { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }
  app.all('/openai/v1/*', gatewayRate, handler('openai'))
  app.all('/openai/v1', gatewayRate, handler('openai'))
  app.all('/anthropic/v1/*', gatewayRate, handler('anthropic'))
  app.all('/anthropic/v1', gatewayRate, handler('anthropic'))
}
