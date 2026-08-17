import { describe, expect, it } from 'vitest'
import { evaluateNotifications } from '../src/main/notify'
import { defaultSettings } from '../src/main/config/store'
import type { AccountSnapshot, AppSnapshot } from '../src/shared/types'

const NOW = Date.parse('2026-08-17T12:00:00.000Z')

function account(patch: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    id: 'a1',
    label: 'Osobní',
    kind: 'personal',
    accent: 'electric',
    status: 'ok',
    estimated: false,
    fetchedAt: new Date(NOW).toISOString(),
    nextPollAt: null,
    fiveHour: { utilization: 85, resetsAt: '2026-08-17T14:00:00.000Z', source: 'api' },
    ...patch,
  }
}

function snapshot(a: AccountSnapshot): AppSnapshot {
  return {
    accounts: [a],
    layout: 'single',
    mode: 'compact',
    theme: 'emerald',
    now: new Date(NOW).toISOString(),
    unknownApiKeys: [],
    mock: false,
  }
}

describe('evaluateNotifications', () => {
  it('odpálí práh 80 % jednou', () => {
    const fired = new Set<string>()
    const next = snapshot(account())
    const first = evaluateNotifications(null, next, defaultSettings(), fired, NOW)
    expect(first).toHaveLength(1)
    expect(first[0].kind).toBe('threshold')

    const second = evaluateNotifications(next, next, defaultSettings(), fired, NOW)
    expect(second).toHaveLength(0)
  })

  it('po posunu resetsAt se práh může odpálit znovu', () => {
    const fired = new Set<string>()
    const first = snapshot(account())
    evaluateNotifications(null, first, defaultSettings(), fired, NOW)

    const later = snapshot(
      account({ fiveHour: { utilization: 85, resetsAt: '2026-08-17T19:00:00.000Z', source: 'api' } }),
    )
    const again = evaluateNotifications(first, later, defaultSettings(), fired, NOW)
    expect(again.some((i) => i.kind === 'threshold')).toBe(true)
  })

  it('z lokálního odhadu nenotifikuje nikdy', () => {
    const next = snapshot(
      account({
        estimated: true,
        fiveHour: { utilization: 99, resetsAt: '2026-08-17T14:00:00.000Z', source: 'local-estimate' },
      }),
    )
    expect(evaluateNotifications(null, next, defaultSettings(), new Set(), NOW)).toHaveLength(0)
  })

  it('reset se ohlásí jen když bylo předtím aspoň 50 %', () => {
    const before = snapshot(
      account({ fiveHour: { utilization: 87, resetsAt: '2026-08-17T13:00:00.000Z', source: 'api' } }),
    )
    const after = snapshot(
      account({ fiveHour: { utilization: 2, resetsAt: '2026-08-17T18:00:00.000Z', source: 'api' } }),
    )
    const intents = evaluateNotifications(before, after, defaultSettings(), new Set(), NOW)
    expect(intents.some((i) => i.kind === 'reset')).toBe(true)

    const lowBefore = snapshot(
      account({ fiveHour: { utilization: 12, resetsAt: '2026-08-17T13:00:00.000Z', source: 'api' } }),
    )
    const noReset = evaluateNotifications(lowBefore, after, defaultSettings(), new Set(), NOW)
    expect(noReset.some((i) => i.kind === 'reset')).toBe(false)
  })

  it('vypnuté notifikace neprodukují nic', () => {
    const s = defaultSettings()
    s.notifications.enabled = false
    expect(evaluateNotifications(null, snapshot(account()), s, new Set(), NOW)).toHaveLength(0)
  })

  it('v tiché době mlčí', () => {
    const s = defaultSettings()
    s.notifications.quietHours = { from: 22, to: 7 }
    const nightMs = Date.parse('2026-08-17T23:30:00.000Z')
    const local = new Date(nightMs).getHours()
    // Test je závislý na TZ běhu, tak si tichou dobu nastavíme kolem aktuální hodiny.
    s.notifications.quietHours = { from: local, to: (local + 1) % 24 }
    expect(evaluateNotifications(null, snapshot(account()), s, new Set(), nightMs)).toHaveLength(0)
  })
})
