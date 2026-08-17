import type { FetchUsageOptions, UsageFetchResult } from '../data/usageApi'
import { parseUsage } from '../data/usageApi'
import { now } from '../../shared/time'

export type MockScenario =
  | 'normal'
  | 'near-limit'
  | 'critical'
  | 'reset-soon'
  | 'expired-token'
  | 'rate-limited'
  | 'offline'
  | 'dual-account'
  | 'extra-usage'
  | 'weird-shape'

export function currentScenario(): MockScenario {
  const raw = (process.env.CLAUDEMONITOR_MOCK_SCENARIO ?? 'normal') as MockScenario
  return raw
}

function iso(offsetMs: number): string {
  return new Date(now() + offsetMs).toISOString()
}

function body(fiveHour: number, sevenDay: number, fiveHourInMs: number): Record<string, unknown> {
  return {
    five_hour: { utilization: fiveHour, resets_at: iso(fiveHourInMs) },
    seven_day: { utilization: sevenDay, resets_at: iso(3.2 * 24 * 3600_000) },
    seven_day_opus: null,
    seven_day_sonnet: null,
    extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null },
  }
}

/**
 * Shodná signatura s fetchUsageReal — mock prochází úplně stejnou parse
 * a merge cestou jako produkce, takže mock režim testuje reálný kód.
 */
export async function fetchUsageMock(_o: FetchUsageOptions): Promise<UsageFetchResult> {
  const scenario = currentScenario()

  switch (scenario) {
    case 'rate-limited':
      return { ok: false, kind: 'rate-limited', retryAfterMs: 60_000 }
    case 'expired-token':
      return { ok: false, kind: 'unauthorized' }
    case 'offline':
      return { ok: false, kind: 'network', message: 'mock: síť nedostupná' }
    default:
      break
  }

  let raw: Record<string, unknown>
  switch (scenario) {
    case 'near-limit':
      raw = body(84, 61, 47 * 60_000)
      break
    case 'critical':
      raw = body(97, 88, 12 * 60_000)
      break
    case 'reset-soon':
      raw = body(73, 44, 73_000)
      break
    case 'extra-usage':
      raw = {
        ...body(58, 39, 92 * 60_000),
        seven_day_opus: { utilization: 22, resets_at: iso(3.2 * 24 * 3600_000) },
        seven_day_sonnet: { utilization: 47, resets_at: iso(3.2 * 24 * 3600_000) },
        extra_usage: { is_enabled: true, monthly_limit: 50, used_credits: 12.4, utilization: 24.8 },
      }
      break
    case 'weird-shape':
      // Simuluje změnu API: přejmenovaný klíč + neznámé pole navíc.
      raw = {
        five_hour: { utilization: 41, resets_at: iso(133 * 60_000) },
        weekly: { utilization: 30, resets_at: iso(2 * 24 * 3600_000) },
        brand_new_window: { utilization: 5 },
      }
      break
    default:
      raw = body(62, 41, 72 * 60_000)
  }

  const parsed = parseUsage(raw)
  if ('error' in parsed) return { ok: false, kind: 'bad-shape', message: parsed.error }
  return { ok: true, data: parsed.data, fetchedAt: now(), unknownKeys: parsed.unknownKeys }
}
