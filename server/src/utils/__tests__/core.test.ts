import { describe, expect, it } from 'vitest'
import { money, percentUsed, formatUsd } from '../money.js'
import { normalizeMandateTag, primaryTag } from '../tags.js'
import { mapLiteLLMGateError } from '../errors.js'
import { budgetDurationForLiteLLM, periodBounds, statementMonthBounds } from '../periods.js'
import { buildStatementCsv, aggregateStatement } from '../../services/statements.js'
import { sealSecret, unsealSecret } from '../seal.js'

describe('money', () => {
  it('formats and percentages safely', () => {
    expect(formatUsd(12.4)).toBe('12.40')
    expect(percentUsed(80, 100)).toBe(80)
    expect(percentUsed(0, 0)).toBe(0)
    expect(money('0.1').plus('0.2').toFixed(1)).toBe('0.3')
  })
})

describe('tags', () => {
  it('normalizes valid tags', () => {
    expect(normalizeMandateTag(' intake-sync ')).toBe('intake-sync')
    expect(primaryTag(['a', 'b'])).toBe('a')
    expect(primaryTag([])).toBeNull()
  })

  it('rejects invalid tags', () => {
    expect(() => normalizeMandateTag('bad tag')).toThrow('INVALID_MANDATE_TAG')
  })
})

describe('gate errors', () => {
  it('maps budget and kill responses', () => {
    const budget = mapLiteLLMGateError(429, 'Budget has been exceeded', 'Harbor')
    expect(budget?.status).toBe(429)
    expect(budget?.body.error.code).toBe('CLIENT_BUDGET_EXCEEDED')

    const killed = mapLiteLLMGateError(403, 'key is blocked', 'Harbor')
    expect(killed?.status).toBe(403)
    expect(killed?.body.error.code).toBe('CLIENT_KEY_KILLED')
  })
})

describe('periods', () => {
  it('maps budget durations for LiteLLM', () => {
    expect(budgetDurationForLiteLLM('daily')).toBe('1d')
    expect(budgetDurationForLiteLLM('weekly')).toBe('7d')
    expect(budgetDurationForLiteLLM('monthly')).toBe('30d')
  })

  it('builds monthly bounds with window ids', () => {
    const now = new Date('2026-07-25T18:00:00Z')
    const monthly = periodBounds('monthly', 'UTC', now)
    expect(monthly.windowId).toBe('2026-07')
    const stmt = statementMonthBounds('previous', 'UTC', now)
    expect(stmt.label).toContain('2026')
  })
})

describe('statements', () => {
  it('renders CSV with identical totals', () => {
    const data = aggregateStatement('Fieldnote', 'Millbrook', 'July 2026', [
      { name: 'openai', requests: 10, costUsd: 1.25 },
      { name: 'anthropic', requests: 2, costUsd: 0.75 },
    ])
    const csv = buildStatementCsv(data)
    expect(csv).toContain('openai,10,1.250000')
    expect(csv).toContain('TOTAL,12,2.000000')
    expect(data.totalUsd).toBe(2)
  })
})

describe('seal', () => {
  it('round-trips secrets', () => {
    const sealed = sealSecret('sk-test-key')
    expect(sealed.startsWith('v2.')).toBe(true)
    expect(unsealSecret(sealed)).toBe('sk-test-key')
  })
})
