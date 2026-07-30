import { createHash, randomBytes } from 'node:crypto'
import { env } from '../config.js'
import { prisma } from '../db.js'
import { sealSecret, unsealSecret } from '../utils/seal.js'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function newMandateKey(): string {
  return `mdt_live_${randomBytes(24).toString('base64url')}`
}

type LiteLLMJson = Record<string, unknown>

async function litellmFetch(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; json: LiteLLMJson; text: string }> {
  if (!env.LITELLM_BASE_URL || !env.LITELLM_MASTER_KEY) {
    throw new Error('LiteLLM is not configured')
  }
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${env.LITELLM_MASTER_KEY}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${env.LITELLM_BASE_URL}${path}`, {
    ...init,
    headers,
  })
  const text = await res.text()
  let json: LiteLLMJson = {}
  try {
    json = text ? (JSON.parse(text) as LiteLLMJson) : {}
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json, text }
}

export async function litellmHealth(): Promise<boolean> {
  if (env.STANDALONE) return true
  if (!env.LITELLM_BASE_URL) return false
  try {
    const res = await fetch(`${env.LITELLM_BASE_URL}/health/liveliness`)
    return res.ok
  } catch {
    return false
  }
}

export type GenerateKeyInput = {
  keyAlias: string
  maxBudget: number
  budgetDuration: string
  metadata?: Record<string, unknown>
}

export async function generateVirtualKey(input: GenerateKeyInput): Promise<{
  key: string
  tokenHash: string
  raw: LiteLLMJson
}> {
  if (env.STANDALONE) {
    const key = newMandateKey()
    return {
      key,
      tokenHash: hashToken(key),
      raw: {
        key,
        key_alias: input.keyAlias,
        max_budget: input.maxBudget,
        budget_duration: input.budgetDuration,
        standalone: true,
      },
    }
  }

  const { status, json, text } = await litellmFetch('/key/generate', {
    method: 'POST',
    body: JSON.stringify({
      key_alias: input.keyAlias,
      max_budget: input.maxBudget,
      budget_duration: input.budgetDuration,
      models: ['openai/*', 'anthropic/*'],
      metadata: {
        mandate: true,
        ...(input.metadata ?? {}),
      },
    }),
  })
  if (status >= 400) {
    throw new Error(`LiteLLM key/generate failed (${status}): ${text}`)
  }
  const key = String(json.key ?? '')
  if (!key) throw new Error('LiteLLM key/generate returned no key')
  return { key, tokenHash: hashToken(key), raw: json }
}

export async function updateVirtualKey(input: {
  key?: string
  keyAlias?: string
  maxBudget?: number
  budgetDuration?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  if (env.STANDALONE) return
  const { status, text } = await litellmFetch('/key/update', {
    method: 'POST',
    body: JSON.stringify({
      key: input.key,
      key_alias: input.keyAlias,
      max_budget: input.maxBudget,
      budget_duration: input.budgetDuration,
      metadata: input.metadata,
    }),
  })
  if (status >= 400) {
    throw new Error(`LiteLLM key/update failed (${status}): ${text}`)
  }
}

export async function blockKey(key: string): Promise<void> {
  if (env.STANDALONE) return
  const { status, text } = await litellmFetch('/key/block', {
    method: 'POST',
    body: JSON.stringify({ key }),
  })
  if (status >= 400) {
    const fallback = await litellmFetch('/key/update', {
      method: 'POST',
      body: JSON.stringify({ key, blocked: true }),
    })
    if (fallback.status >= 400) {
      throw new Error(`LiteLLM key/block failed (${status}): ${text}`)
    }
  }
}

export async function unblockKey(key: string): Promise<void> {
  if (env.STANDALONE) return
  const { status, text } = await litellmFetch('/key/unblock', {
    method: 'POST',
    body: JSON.stringify({ key }),
  })
  if (status >= 400) {
    const fallback = await litellmFetch('/key/update', {
      method: 'POST',
      body: JSON.stringify({ key, blocked: false }),
    })
    if (fallback.status >= 400) {
      throw new Error(`LiteLLM key/unblock failed (${status}): ${text}`)
    }
  }
}

export async function storeProviderKeys(input: {
  agencyId: string
  openaiApiKey?: string
  anthropicApiKey?: string
}): Promise<void> {
  await prisma.agency.update({
    where: { id: input.agencyId },
    data: {
      sealedOpenaiKey: input.openaiApiKey ? sealSecret(input.openaiApiKey) : undefined,
      sealedAnthropicKey: input.anthropicApiKey ? sealSecret(input.anthropicApiKey) : undefined,
      openaiConfigured: input.openaiApiKey ? true : undefined,
      anthropicConfigured: input.anthropicApiKey ? true : undefined,
      setupComplete: input.openaiApiKey || input.anthropicApiKey ? true : undefined,
      fundingMode: input.openaiApiKey || input.anthropicApiKey ? 'BYOK' : undefined,
    },
  })
}

export async function getProviderKey(
  agencyId: string,
  provider: 'openai' | 'anthropic',
  opts?: { fundingSource?: 'BYOK' | 'MANDATE_PROMO' },
): Promise<string | null> {
  if (opts?.fundingSource === 'MANDATE_PROMO') {
    if (provider === 'openai') return env.PLATFORM_OPENAI_API_KEY ?? null
    return env.PLATFORM_ANTHROPIC_API_KEY ?? null
  }

  const agency = await prisma.agency.findUnique({ where: { id: agencyId } })
  if (!agency) return null
  if (provider === 'openai' && agency.sealedOpenaiKey) {
    return unsealSecret(agency.sealedOpenaiKey)
  }
  if (provider === 'anthropic' && agency.sealedAnthropicKey) {
    return unsealSecret(agency.sealedAnthropicKey)
  }
  return null
}

/** Rough list prices (USD / 1M tokens) for standalone metering. */
const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4.1': { in: 2, out: 8 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4.1-nano': { in: 0.1, out: 0.4 },
  'o4-mini': { in: 1.1, out: 4.4 },
  'claude-3-5-sonnet': { in: 3, out: 15 },
  'claude-3-5-haiku': { in: 0.8, out: 4 },
  'claude-sonnet-4': { in: 3, out: 15 },
  'claude-haiku-4': { in: 0.8, out: 4 },
  'claude-opus-4': { in: 15, out: 75 },
}

export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const bare = model.replace(/^(openai|anthropic)\//, '')
  const hit =
    PRICE_PER_MTOK[bare] ||
    Object.entries(PRICE_PER_MTOK).find(([k]) => bare.includes(k))?.[1] ||
    { in: 1, out: 3 }
  return (tokensIn * hit.in + tokensOut * hit.out) / 1_000_000
}

export async function ensureWildcardModels(_input: {
  openaiKey?: string
  anthropicKey?: string
}): Promise<void> {
  // Standalone: keys are sealed on the agency row. LiteLLM path unused.
  if (env.STANDALONE) return
}
