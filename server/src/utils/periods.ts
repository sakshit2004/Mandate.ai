import type { BudgetPeriod } from '@prisma/client'

export type PeriodBounds = {
  start: Date
  end: Date
  windowId: string
}

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** Approximate offset ms of timeZone at `date` (for local midnight construction). */
function tzOffsetMs(date: Date, timeZone: string): number {
  const asUtc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
  const asTz = new Date(date.toLocaleString('en-US', { timeZone }))
  return asTz.getTime() - asUtc.getTime()
}

function localMidnight(year: number, month: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const offset = tzOffsetMs(guess, timeZone)
  return new Date(guess.getTime() - offset)
}

function startOfIsoWeek(year: number, month: number, day: number, timeZone: string): Date {
  const midnight = localMidnight(year, month, day, timeZone)
  const weekday = new Date(
    Date.UTC(year, month - 1, day, 12, 0, 0),
  ).getUTCDay() // 0 Sun … 6 Sat
  const iso = weekday === 0 ? 7 : weekday
  const monday = new Date(midnight.getTime() - (iso - 1) * 24 * 60 * 60 * 1000)
  const p = zonedParts(monday, timeZone)
  return localMidnight(p.year, p.month, p.day, timeZone)
}

export function periodBounds(
  period: BudgetPeriod,
  timeZone: string,
  now = new Date(),
): PeriodBounds {
  const p = zonedParts(now, timeZone)

  if (period === 'daily') {
    const start = localMidnight(p.year, p.month, p.day, timeZone)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    const windowId = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
    return { start, end, windowId }
  }

  if (period === 'weekly') {
    const start = startOfIsoWeek(p.year, p.month, p.day, timeZone)
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
    const sp = zonedParts(start, timeZone)
    const windowId = `${sp.year}-W${isoWeekNumber(sp.year, sp.month, sp.day)}`
    return { start, end, windowId }
  }

  const start = localMidnight(p.year, p.month, 1, timeZone)
  const nextMonth = p.month === 12 ? { year: p.year + 1, month: 1 } : { year: p.year, month: p.month + 1 }
  const end = localMidnight(nextMonth.year, nextMonth.month, 1, timeZone)
  const windowId = `${p.year}-${String(p.month).padStart(2, '0')}`
  return { start, end, windowId }
}

function isoWeekNumber(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return String(week).padStart(2, '0')
}

export function todayBounds(timeZone: string, now = new Date()): PeriodBounds {
  return periodBounds('daily', timeZone, now)
}

export function statementMonthBounds(
  which: 'current' | 'previous',
  timeZone: string,
  now = new Date(),
): { start: Date; end: Date; label: string } {
  const p = zonedParts(now, timeZone)
  let year = p.year
  let month = p.month
  if (which === 'previous') {
    if (month === 1) {
      year -= 1
      month = 12
    } else {
      month -= 1
    }
  }
  const start = localMidnight(year, month, 1, timeZone)
  const next =
    month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
  const end = localMidnight(next.year, next.month, 1, timeZone)
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
    year: 'numeric',
  }).format(new Date(start.getTime() + 12 * 60 * 60 * 1000))
  return { start, end, label }
}

export function budgetDurationForLiteLLM(period: BudgetPeriod): string {
  if (period === 'daily') return '1d'
  if (period === 'weekly') return '7d'
  return '30d'
}
