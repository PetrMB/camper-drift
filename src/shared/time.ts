/**
 * Jediné místo v celém kódu, kde se sahá na aktuální čas.
 * Pravidlo: `Date.now()` nesmí být nikde jinde — díky tomu jsou testy
 * i mock screenshoty deterministické (CLAUDEMONITOR_MOCK_CLOCK).
 */
let frozenNow: number | null = null

export function setFrozenNow(iso: string | null): void {
  if (!iso) {
    frozenNow = null
    return
  }
  const parsed = Date.parse(iso)
  frozenNow = Number.isNaN(parsed) ? null : parsed
}

export function now(): number {
  return frozenNow ?? Date.now()
}

/** Přesná čeština pro odpočet. Nikdy nevrací záporné hodnoty. */
export function formatCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'teď'
  const totalMinutes = Math.floor(ms / 60_000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    const d = pluralDays(days)
    return hours > 0 ? `${d} ${hours} h` : d
  }
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}`
  if (minutes > 0) return `${minutes} min`
  return `${Math.max(1, Math.floor(ms / 1000))} s`
}

export function pluralDays(n: number): string {
  if (n === 1) return '1 den'
  if (n >= 2 && n <= 4) return `${n} dny`
  return `${n} dní`
}

/** Zkratky dnů pro absolutní čas resetu ("út 9:00"). */
const DAY_SHORT = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so']

export function formatClock(iso: string, nowMs: number): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const d = new Date(t)
  const hhmm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const nd = new Date(nowMs)
  const sameDay =
    d.getFullYear() === nd.getFullYear() &&
    d.getMonth() === nd.getMonth() &&
    d.getDate() === nd.getDate()
  if (sameDay) return hhmm
  const withinWeek = t - nowMs < 7 * 24 * 3600_000
  if (withinWeek) return `${DAY_SHORT[d.getDay()]} ${hhmm}`
  return `${d.getDate()}. ${d.getMonth() + 1}. ${hhmm}`
}

export function formatTimeOfDay(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return '—'
  const d = new Date(t)
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 1 234 567 -> "1,23 M". Používá české oddělovače. */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace('.', ',')} M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.', ',')} k`
  return String(Math.round(n))
}

export function formatUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(2).replace('.', ',')} USD`
}
