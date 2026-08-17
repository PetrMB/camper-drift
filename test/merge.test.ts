import { describe, expect, it } from 'vitest'
import { buildSnapshot, emptyApiState, emptyLocalState, mergeAccount, type AccountState } from '../src/main/data/merge'
import { defaultSettings } from '../src/main/config/store'
import type { AccountConfig, Settings } from '../src/shared/types'
import type { UsageApiResponse } from '../src/main/data/usageApi'

const NOW = Date.parse('2026-08-17T12:00:00.000Z')

const account: AccountConfig = {
  id: 'a1',
  label: 'Osobní',
  kind: 'personal',
  configDir: '/home/petr/.claude',
  accent: 'electric',
  enabled: true,
  order: 0,
}

const apiData: UsageApiResponse = {
  fiveHour: { utilization: 62, resetsAt: '2026-08-17T13:12:00.000Z' },
  sevenDay: { utilization: 41, resetsAt: '2026-08-21T03:00:00.000Z' },
  sevenDayOpus: null,
  sevenDaySonnet: null,
  extraUsage: null,
}

function localWithBlock(): AccountState['local'] {
  return {
    blocks: [],
    activeBlock: {
      start: Date.parse('2026-08-17T10:00:00.000Z'),
      end: Date.parse('2026-08-17T15:00:00.000Z'),
      tokens: { input: 10, output: 10, cacheCreate: 0, cacheRead: 0, total: 20 },
      costUsd: 0.12,
      models: ['claude-sonnet-4'],
      messages: 3,
    },
    estimate: 33,
    week: { input: 1, output: 1, cacheCreate: 0, cacheRead: 0, total: 2, costUsd: 0.01 },
  }
}

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...defaultSettings(), ...patch }
}

describe('mergeAccount', () => {
  it('čerstvé API vyhrává a není označené jako odhad', () => {
    const state: AccountState = {
      api: { ...emptyApiState(), data: apiData, fetchedAt: NOW - 60_000 },
      local: localWithBlock(),
    }
    const s = mergeAccount(account, state, settings(), NOW)
    expect(s.status).toBe('ok')
    expect(s.estimated).toBe(false)
    expect(s.fiveHour?.source).toBe('api')
    expect(s.fiveHour?.utilization).toBe(62)
    // Lokální blok se ukáže jako doplněk, ale hlavní čísla jsou z API.
    expect(s.localBlock?.messages).toBe(3)
  })

  it('API starší než 10 min je stale, čísla ale zůstanou', () => {
    const state: AccountState = {
      api: { ...emptyApiState(), data: apiData, fetchedAt: NOW - 15 * 60_000 },
      local: emptyLocalState(),
    }
    const s = mergeAccount(account, state, settings(), NOW)
    expect(s.status).toBe('stale')
    expect(s.fiveHour?.utilization).toBe(62)
  })

  it('API starší než hodinu se nahradí lokálním odhadem', () => {
    const state: AccountState = {
      api: { ...emptyApiState(), data: apiData, fetchedAt: NOW - 90 * 60_000 },
      local: localWithBlock(),
    }
    const s = mergeAccount(account, state, settings(), NOW)
    expect(s.estimated).toBe(true)
    expect(s.fiveHour?.source).toBe('local-estimate')
    expect(s.fiveHour?.resetsAt).toBe('2026-08-17T15:00:00.000Z')
    // Týdenní reset z lokálních dat odvodit nelze — radši nic než smyšlené číslo.
    expect(s.sevenDay?.resetsAt).toBeNull()
  })

  it('expirovaný token dá jasnou hlášku a spadne na odhad', () => {
    const state: AccountState = {
      api: { ...emptyApiState(), lastError: { kind: 'token-expired' } },
      local: localWithBlock(),
    }
    const s = mergeAccount(account, state, settings(), NOW)
    expect(s.status).toBe('token-expired')
    expect(s.statusDetail).toContain('Claude Code')
    expect(s.fiveHour?.source).toBe('local-estimate')
  })

  it('chybějící credentials nehlásí síťovou chybu', () => {
    const state: AccountState = {
      api: { ...emptyApiState(), lastError: { kind: 'no-credentials', reason: 'missing' } },
      local: emptyLocalState(),
    }
    expect(mergeAccount(account, state, settings(), NOW).status).toBe('no-credentials')
  })

  it('429 se pozná jako rate-limited', () => {
    const state: AccountState = {
      api: { ...emptyApiState(), lastError: { kind: 'rate-limited', retryAfterMs: 60_000 } },
      local: emptyLocalState(),
    }
    expect(mergeAccount(account, state, settings(), NOW).status).toBe('rate-limited')
  })

  it('neznámý tvar API se pojmenuje a ukáže odhad', () => {
    const state: AccountState = {
      api: { ...emptyApiState(), lastError: { kind: 'bad-shape', message: 'x' } },
      local: localWithBlock(),
    }
    const s = mergeAccount(account, state, settings(), NOW)
    expect(s.status).toBe('unknown-shape')
    expect(s.estimated).toBe(true)
  })

  it('vypnuté API znamená čistě lokální režim', () => {
    const state: AccountState = {
      api: { ...emptyApiState(), data: apiData, fetchedAt: NOW },
      local: localWithBlock(),
    }
    const s = mergeAccount(account, state, settings({ network: { ...defaultSettings().network, disableApi: true } }), NOW)
    expect(s.status).toBe('api-disabled')
    expect(s.fiveHour?.source).toBe('local-estimate')
  })

  it('upozorní, když je reset podezřele daleko (posunuté hodiny)', () => {
    const state: AccountState = {
      api: {
        ...emptyApiState(),
        data: { ...apiData, fiveHour: { utilization: 10, resetsAt: '2026-08-18T12:00:00.000Z' } },
        fetchedAt: NOW,
      },
      local: emptyLocalState(),
    }
    expect(mergeAccount(account, state, settings(), NOW).statusDetail).toContain('systémový čas')
  })
})

describe('buildSnapshot', () => {
  it('přepne layout na multi až od druhého účtu', () => {
    const states = new Map<string, AccountState>()
    const one = buildSnapshot([account], states, settings(), NOW, false)
    expect(one.layout).toBe('single')

    const second: AccountConfig = { ...account, id: 'a2', label: 'Pracovní', order: 1 }
    const two = buildSnapshot([account, second], states, settings(), NOW, false)
    expect(two.layout).toBe('multi')
    expect(two.accounts).toHaveLength(2)
  })

  it('vypnutý účet se do snapshotu nedostane', () => {
    const disabled: AccountConfig = { ...account, id: 'a3', enabled: false }
    const snap = buildSnapshot([account, disabled], new Map(), settings(), NOW, false)
    expect(snap.accounts).toHaveLength(1)
    expect(snap.layout).toBe('single')
  })
})
