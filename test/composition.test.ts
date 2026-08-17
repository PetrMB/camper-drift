import { describe, expect, it } from 'vitest'
import { pickComposition, soonestAccountId } from '../src/renderer/state'
import type { AccountSnapshot, AppSnapshot } from '../src/shared/types'

const NOW = Date.parse('2026-08-17T12:00:00.000Z')

function account(id: string, five: number, seven: number, fetchedAgoMs = 0): AccountSnapshot {
  return {
    id,
    label: id,
    kind: 'personal',
    accent: 'electric',
    status: 'ok',
    estimated: false,
    fetchedAt: new Date(NOW - fetchedAgoMs).toISOString(),
    nextPollAt: null,
    fiveHour: { utilization: five, resetsAt: '2026-08-17T14:00:00.000Z', source: 'api' },
    sevenDay: { utilization: seven, resetsAt: '2026-08-21T09:00:00.000Z', source: 'api' },
  }
}

function snapshot(accounts: AccountSnapshot[]): AppSnapshot {
  return {
    accounts,
    layout: accounts.length > 1 ? 'multi' : 'single',
    mode: 'compact',
    theme: 'emerald',
    now: new Date(NOW).toISOString(),
    unknownApiKeys: [],
    mock: false,
  }
}

describe('pickComposition — ŠKODA CI: max jedna terciární barva', () => {
  it('pod prahem používá jen primární akcent', () => {
    const c = pickComposition(snapshot([account('a', 40, 20)]), NOW)
    expect(c.severity.get('a:5h')).toBe('accent')
    expect(c.severity.get('a:7d')).toBe('accent')
    expect(c.staleness).toBe('accent')
  })

  it('nikdy nedá červenou a oranžovou na jednu obrazovku', () => {
    // 97 % = kritická, 88 % = varovná — obojí musí skončit v kritické.
    const c = pickComposition(snapshot([account('a', 97, 88)]), NOW)
    expect(c.severity.get('a:5h')).toBe('critical')
    expect(c.severity.get('a:7d')).toBe('critical')
  })

  it('sjednotí terciár i napříč účty', () => {
    const c = pickComposition(snapshot([account('a', 85, 10), account('b', 96, 10)]), NOW)
    expect(c.severity.get('a:5h')).toBe('critical')
    expect(c.severity.get('b:5h')).toBe('critical')
    // Hodnoty pod prahem zůstávají zelené — zelená není terciár.
    expect(c.severity.get('a:7d')).toBe('accent')
  })

  it('zůstane u oranžové, když nikde není kritická hodnota', () => {
    const c = pickComposition(snapshot([account('a', 84, 10)]), NOW)
    expect(c.severity.get('a:5h')).toBe('warn')
  })

  it('degraduje tečku čerstvosti, když už terciár nesou bary', () => {
    // Stará data by chtěla oranžovou tečku, ale bar už terciár používá.
    const c = pickComposition(snapshot([account('a', 97, 10, 10 * 60_000)]), NOW)
    expect(c.severity.get('a:5h')).toBe('critical')
    expect(c.staleness).toBe('neutral')
  })

  it('tečka smí nést terciár, když ho bary nepoužívají', () => {
    const c = pickComposition(snapshot([account('a', 30, 10, 10 * 60_000)]), NOW)
    expect(c.staleness).toBe('warn')
  })
})

describe('soonestAccountId', () => {
  it('najde účet s nejbližším resetem', () => {
    const a = account('a', 10, 10)
    const b = account('b', 10, 10)
    b.fiveHour = { utilization: 10, resetsAt: '2026-08-17T12:30:00.000Z', source: 'api' }
    expect(soonestAccountId(snapshot([a, b]))).toBe('b')
  })

  it('vrátí null, když žádný účet nemá reset', () => {
    const a = account('a', 10, 10)
    a.fiveHour = undefined
    expect(soonestAccountId(snapshot([a]))).toBeNull()
  })
})
