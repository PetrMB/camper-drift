import type { TokenTotals } from '../../shared/types'

/**
 * Ceny za 1 M tokenů v USD. Slouží VÝHRADNĚ k orientačnímu odhadu nákladů
 * z lokálních transcriptů — u předplatného se nic neúčtuje. Kdo to nechce
 * vidět, vypne to v nastavení.
 */
export const PRICES_UPDATED_AT = '2026-08-01'

export interface ModelPrice {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}

const TABLE: Array<{ match: RegExp; price: ModelPrice }> = [
  { match: /opus/i, price: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 } },
  { match: /sonnet/i, price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
  { match: /haiku/i, price: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 } },
]

export function priceFor(model: string): ModelPrice | null {
  for (const row of TABLE) if (row.match.test(model)) return row.price
  return null
}

export function costOf(t: TokenTotals, model: string): number | null {
  const p = priceFor(model)
  if (!p) return null
  return (
    (t.input * p.input +
      t.output * p.output +
      t.cacheCreate * p.cacheWrite +
      t.cacheRead * p.cacheRead) /
    1_000_000
  )
}

export function emptyTotals(): TokenTotals {
  return { input: 0, output: 0, cacheCreate: 0, cacheRead: 0, total: 0 }
}

export function addTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheCreate: a.cacheCreate + b.cacheCreate,
    cacheRead: a.cacheRead + b.cacheRead,
    total: a.total + b.total,
  }
}
