import type { Client, FundingMode } from '@prisma/client'
import { prisma } from '../db.js'

export const PROMO_BUDGET_USD = 5
export const PROMO_BUDGET_PERIOD = 'weekly' as const
export const PROMO_TRIAL_DAYS = 7
export const PROMO_LOCKED_MESSAGE =
  'Custom budgets and periods are only available with your own provider keys. Mandate free credits are $5 for one week.'

export function promoExpiresAtFromNow(now = new Date()): Date {
  return new Date(now.getTime() + PROMO_TRIAL_DAYS * 24 * 60 * 60 * 1000)
}

export function isPromoExpired(client: {
  fundingSource: FundingMode
  promoExpiresAt: Date | null
}): boolean {
  return (
    client.fundingSource === 'MANDATE_PROMO' &&
    client.promoExpiresAt != null &&
    client.promoExpiresAt.getTime() < Date.now()
  )
}

/** Lazily hard-stop expired promo clients (sets killed=true). */
export async function enforcePromoExpiry<T extends Client>(client: T): Promise<T> {
  if (!isPromoExpired(client) || client.killed) return client
  await prisma.client.update({
    where: { id: client.id },
    data: { killed: true },
  })
  return { ...client, killed: true }
}

export async function enforcePromoExpiryForAgency(agencyId: string): Promise<void> {
  const now = new Date()
  await prisma.client.updateMany({
    where: {
      agencyId,
      fundingSource: 'MANDATE_PROMO',
      killed: false,
      promoExpiresAt: { lt: now },
    },
    data: { killed: true },
  })
}
