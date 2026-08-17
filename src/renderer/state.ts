import type { AccountSnapshot, AppSnapshot } from '../shared/types'

export const WARN_THRESHOLD = 80
export const CRITICAL_THRESHOLD = 95

const FRESH_MS = 5 * 60_000
const STALE_MS = 20 * 60_000

export type Hue = 'accent' | 'warn' | 'critical' | 'neutral'

export interface Composition {
  /** Barva prstenců a barů podle vyčerpání. */
  severity: Map<string, Hue>
  /** Barva tečky čerstvosti dat. */
  staleness: Hue
}

function severityOf(utilization: number | null): Hue {
  if (utilization === null) return 'neutral'
  if (utilization >= CRITICAL_THRESHOLD) return 'critical'
  if (utilization >= WARN_THRESHOLD) return 'warn'
  return 'accent'
}

function stalenessOf(a: AccountSnapshot, nowMs: number): Hue {
  if (['no-credentials', 'token-expired', 'network-error', 'unknown-shape'].includes(a.status)) {
    return 'critical'
  }
  if (!a.fetchedAt) return 'critical'
  const age = nowMs - Date.parse(a.fetchedAt)
  if (age < FRESH_MS) return 'accent'
  if (age < STALE_MS) return 'warn'
  return 'critical'
}

/**
 * ŠKODA CI: v jedné kompozici smí být MAX JEDNA terciární barva.
 * Vynucujeme to mechanicky — když svítí bar oranžově/červeně, tečka
 * čerstvosti se degraduje na neutrální šeď a naopak. Nikdy dvě zároveň.
 */
export function pickComposition(snapshot: AppSnapshot, nowMs: number): Composition {
  const raw = new Map<string, Hue>()

  for (const a of snapshot.accounts) {
    for (const [key, usage] of [
      ['5h', a.fiveHour],
      ['7d', a.sevenDay],
      ['opus', a.sevenDayOpus],
      ['sonnet', a.sevenDaySonnet],
    ] as const) {
      raw.set(`${a.id}:${key}`, severityOf(usage?.utilization ?? null))
    }
  }

  // Sjednocení na JEDNU terciární barvu: když je někde kritická červená,
  // ostatní překročené prahy dostanou taky červenou — nikdy červená a oranžová
  // vedle sebe. Zelené (primární) hodnoty se nesjednocují, ty tertiér nejsou.
  const tertiary: Hue = [...raw.values()].includes('critical')
    ? 'critical'
    : [...raw.values()].includes('warn')
      ? 'warn'
      : 'accent'

  const severity = new Map<string, Hue>()
  for (const [key, hue] of raw) {
    severity.set(key, hue === 'warn' || hue === 'critical' ? tertiary : hue)
  }

  const barsUseTertiary = tertiary !== 'accent'

  let staleness: Hue = 'accent'
  for (const a of snapshot.accounts) {
    const hue = stalenessOf(a, nowMs)
    if (hue === 'critical') staleness = 'critical'
    else if (hue === 'warn' && staleness !== 'critical') staleness = 'warn'
  }

  if (barsUseTertiary && staleness !== 'accent') staleness = 'neutral'

  return { severity, staleness }
}

export function hueColor(hue: Hue): string {
  switch (hue) {
    case 'critical':
      return 'var(--cm-red)'
    case 'warn':
      return 'var(--cm-orange)'
    case 'neutral':
      return 'var(--cm-steel-grey)'
    default:
      return 'var(--cm-account-accent, var(--cm-accent))'
  }
}

/** Účet s nejbližším resetem — zvýrazní se v multi režimu. */
export function soonestAccountId(snapshot: AppSnapshot): string | null {
  let best: { id: string; at: number } | null = null
  for (const a of snapshot.accounts) {
    const at = a.fiveHour?.resetsAt ? Date.parse(a.fiveHour.resetsAt) : NaN
    if (Number.isNaN(at)) continue
    if (!best || at < best.at) best = { id: a.id, at }
  }
  return best?.id ?? null
}
