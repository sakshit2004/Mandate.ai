/** Money helpers using micro-dollars (1e-6 USD) to avoid float drift. */

export type MoneyInput = number | string | null | undefined | { toString(): string }

function toMicros(value: MoneyInput): bigint {
  if (value == null || value === '') return 0n
  const n = typeof value === 'number' ? value : Number(value.toString())
  if (!Number.isFinite(n)) return 0n
  return BigInt(Math.round(n * 1_000_000))
}

function fromMicros(micros: bigint, places: number): number {
  const neg = micros < 0n
  const abs = neg ? -micros : micros
  const whole = abs / 1_000_000n
  const frac = abs % 1_000_000n
  const fracStr = frac.toString().padStart(6, '0').slice(0, places).padEnd(places, '0')
  const asNumber = Number(`${neg ? '-' : ''}${whole}.${fracStr}`)
  return asNumber
}

export function moneyUsd(value: MoneyInput, places = 6): number {
  return fromMicros(toMicros(value), places)
}

export function formatUsd(value: MoneyInput, places = 2): string {
  return moneyUsd(value, places).toFixed(places)
}

export function percentUsed(spend: MoneyInput, cap: MoneyInput): number {
  const c = toMicros(cap)
  if (c <= 0n) return 0
  const pct = (Number(toMicros(spend)) / Number(c)) * 100
  return Math.round(pct * 10) / 10
}

export function sumUsd(values: MoneyInput[]): number {
  let total = 0n
  for (const v of values) total += toMicros(v)
  return fromMicros(total, 6)
}

/** Compatibility shim used by older call sites expecting Decimal-like add. */
export function money(value: MoneyInput) {
  const micros = toMicros(value)
  return {
    plus(other: MoneyInput) {
      return money(fromMicros(micros + toMicros(other), 6))
    },
    toFixed(places = 6) {
      return fromMicros(micros, places).toFixed(places)
    },
    toNumber() {
      return fromMicros(micros, 6)
    },
  }
}
