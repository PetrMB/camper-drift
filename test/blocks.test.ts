import { describe, expect, it } from 'vitest'
import { activeBlock, buildBlocks, estimateUtilization, rolling7d } from '../src/main/data/blocks'
import type { UsageRecord } from '../src/main/data/transcripts'

const HOUR = 3600_000

function rec(tsIso: string, tokens = 1000, model = 'claude-sonnet-4'): UsageRecord {
  const ts = Date.parse(tsIso)
  return {
    ts,
    model,
    input: tokens,
    output: tokens,
    cacheCreate: 0,
    cacheRead: 0,
    key: `${ts}:${tokens}`,
  }
}

describe('buildBlocks', () => {
  it('vrátí prázdné pole pro prázdný vstup', () => {
    expect(buildBlocks([])).toEqual([])
  })

  it('zaokrouhlí začátek bloku dolů na celou hodinu', () => {
    const blocks = buildBlocks([rec('2026-08-17T12:37:00.000Z')])
    expect(blocks).toHaveLength(1)
    expect(new Date(blocks[0].start).toISOString()).toBe('2026-08-17T12:00:00.000Z')
    expect(blocks[0].end - blocks[0].start).toBe(5 * HOUR)
  })

  it('drží zprávy uvnitř 5h okna v jednom bloku', () => {
    const blocks = buildBlocks([
      rec('2026-08-17T12:10:00.000Z'),
      rec('2026-08-17T14:00:00.000Z'),
      rec('2026-08-17T16:50:00.000Z'),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].messages).toBe(3)
  })

  it('otevře nový blok po překročení 5 h od začátku', () => {
    const blocks = buildBlocks([
      rec('2026-08-17T12:00:00.000Z'),
      rec('2026-08-17T14:00:00.000Z'),
      rec('2026-08-17T17:30:00.000Z'),
    ])
    expect(blocks).toHaveLength(2)
    expect(new Date(blocks[1].start).toISOString()).toBe('2026-08-17T17:00:00.000Z')
  })

  it('otevře nový blok po mezeře >= 5 h mezi zprávami', () => {
    const blocks = buildBlocks([rec('2026-08-17T08:00:00.000Z'), rec('2026-08-17T13:10:00.000Z')])
    expect(blocks).toHaveLength(2)
  })

  it('sečte tokeny včetně cache', () => {
    const r = rec('2026-08-17T12:00:00.000Z')
    r.cacheCreate = 500
    r.cacheRead = 250
    const blocks = buildBlocks([r])
    expect(blocks[0].tokens.total).toBe(1000 + 1000 + 500 + 250)
  })
})

describe('activeBlock', () => {
  it('najde blok, do kterého spadá teď', () => {
    const blocks = buildBlocks([rec('2026-08-17T12:10:00.000Z')])
    expect(activeBlock(blocks, Date.parse('2026-08-17T14:00:00.000Z'))).toBe(blocks[0])
  })

  it('vrátí null, když poslední blok už doběhl', () => {
    const blocks = buildBlocks([rec('2026-08-17T12:10:00.000Z')])
    expect(activeBlock(blocks, Date.parse('2026-08-17T18:00:00.000Z'))).toBeNull()
  })
})

describe('rolling7d', () => {
  it('započítá jen posledních 7 dní', () => {
    const nowMs = Date.parse('2026-08-17T12:00:00.000Z')
    const totals = rolling7d(
      [rec('2026-08-01T12:00:00.000Z'), rec('2026-08-15T12:00:00.000Z')],
      nowMs,
    )
    expect(totals.total).toBe(2000)
  })
})

describe('estimateUtilization', () => {
  it('vrátí null, když není dost historie', () => {
    const blocks = buildBlocks([rec('2026-08-17T12:00:00.000Z')])
    expect(estimateUtilization(blocks, blocks[0])).toBeNull()
  })

  it('spočítá odhad proti p90 historických bloků', () => {
    const records: UsageRecord[] = []
    // Šest hotových bloků po 2000 tokenech, každý s odstupem 6 h.
    for (let i = 0; i < 6; i++) {
      records.push(rec(new Date(Date.parse('2026-08-10T00:00:00.000Z') + i * 6 * HOUR).toISOString()))
    }
    records.push(rec('2026-08-17T12:00:00.000Z', 500))
    const blocks = buildBlocks(records)
    const active = activeBlock(blocks, Date.parse('2026-08-17T13:00:00.000Z'))
    const estimate = estimateUtilization(blocks, active)
    expect(estimate).not.toBeNull()
    expect(estimate).toBeGreaterThan(0)
    expect(estimate).toBeLessThanOrEqual(100)
  })
})
