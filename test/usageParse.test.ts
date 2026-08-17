import { describe, expect, it } from 'vitest'
import { parseUsage } from '../src/main/data/usageApi'

const FULL = {
  five_hour: { utilization: 62, resets_at: '2026-08-17T14:00:00Z' },
  seven_day: { utilization: 41, resets_at: '2026-08-21T03:00:00Z' },
  seven_day_opus: null,
  seven_day_sonnet: null,
  extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null },
}

describe('parseUsage', () => {
  it('rozparsuje reálnou odpověď', () => {
    const result = parseUsage(FULL)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.data.fiveHour?.utilization).toBe(62)
    expect(result.data.sevenDay?.resetsAt).toBe('2026-08-21T03:00:00.000Z')
    expect(result.data.extraUsage?.enabled).toBe(false)
    expect(result.unknownKeys).toEqual([])
  })

  it('přežije chybějící model split', () => {
    const result = parseUsage({ five_hour: FULL.five_hour, seven_day: FULL.seven_day })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.data.sevenDayOpus).toBeNull()
    expect(result.data.extraUsage).toBeNull()
  })

  it('nahlásí neznámé klíče místo tichého ignorování', () => {
    const result = parseUsage({ ...FULL, brand_new_window: { utilization: 5 } })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.unknownKeys).toContain('brand_new_window')
  })

  it('degraduje při přejmenovaném klíči, nespadne', () => {
    const result = parseUsage({ five_hour: FULL.five_hour, weekly: FULL.seven_day })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.data.sevenDay).toBeNull()
    expect(result.unknownKeys).toContain('weekly')
  })

  it('vrátí chybu, až když chybí obě hlavní okna', () => {
    expect('error' in parseUsage({ something: 1 })).toBe(true)
    expect('error' in parseUsage(null)).toBe(true)
    expect('error' in parseUsage('nope')).toBe(true)
  })

  it('ořízne utilization do 0–100 a zahodí nevalidní datum', () => {
    const result = parseUsage({
      five_hour: { utilization: 140, resets_at: 'nesmysl' },
      seven_day: FULL.seven_day,
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.data.fiveHour?.utilization).toBe(100)
    expect(result.data.fiveHour?.resetsAt).toBeNull()
  })

  it('nespadne na utilization, které není číslo', () => {
    const result = parseUsage({
      five_hour: { utilization: 'hodně', resets_at: FULL.five_hour.resets_at },
      seven_day: FULL.seven_day,
    })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.data.fiveHour?.utilization).toBeNull()
  })
})
