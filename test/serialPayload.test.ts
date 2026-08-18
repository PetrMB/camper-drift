import { describe, expect, it } from 'vitest'
import { buildPayload } from '../src/renderer/serialLink'
import type { AccountSnapshot, AppSnapshot } from '../src/shared/types'

const NOW = '2026-08-17T12:00:00.000Z'

function account(patch: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    id: 'a1',
    label: 'Osobní',
    kind: 'personal',
    accent: 'electric',
    status: 'ok',
    estimated: false,
    fetchedAt: NOW,
    nextPollAt: null,
    fiveHour: { utilization: 62, resetsAt: '2026-08-17T13:12:00.000Z', source: 'api' },
    sevenDay: { utilization: 41, resetsAt: '2026-08-21T09:00:00.000Z', source: 'api' },
    ...patch,
  }
}

function snapshot(accounts: AccountSnapshot[]): AppSnapshot {
  return {
    accounts,
    layout: accounts.length > 1 ? 'multi' : 'single',
    mode: 'compact',
    theme: 'emerald',
    now: NOW,
    unknownApiKeys: [],
    mock: false,
  }
}

function parse(payload: string): Record<string, unknown> {
  return JSON.parse(payload.trim()) as Record<string, unknown>
}

describe('buildPayload', () => {
  it('končí novým řádkem — deska parsuje po řádcích', () => {
    expect(buildPayload(snapshot([account()])).endsWith('\n')).toBe(true)
  })

  it('posílá časy jako epoch ms, ne ISO řetězce', () => {
    const data = parse(buildPayload(snapshot([account()])))
    expect(data.now).toBe(Date.parse(NOW))
    const first = (data.accounts as Record<string, never>[])[0]
    expect((first.fiveHour as unknown as Record<string, number>).resetsAt).toBe(
      Date.parse('2026-08-17T13:12:00.000Z'),
    )
  })

  it('shodí diakritiku — font na displeji ji neumí', () => {
    const data = parse(buildPayload(snapshot([account({ label: 'Pracovní účet ěščřž' })])))
    const first = (data.accounts as Record<string, unknown>[])[0]
    expect(first.label).toBe('Pracovni ucet escrz')
  })

  it('přeloží zdroj na kratší tvar pro desku', () => {
    const data = parse(
      buildPayload(
        snapshot([
          account({
            fiveHour: { utilization: null, resetsAt: NOW, source: 'local-estimate' },
          }),
        ]),
      ),
    )
    const first = (data.accounts as Record<string, unknown>[])[0]
    expect((first.fiveHour as Record<string, unknown>).source).toBe('estimate')
  })

  it('chybějící okno pošle jako null, ne jako prázdný objekt', () => {
    const data = parse(buildPayload(snapshot([account({ sevenDay: undefined })])))
    const first = (data.accounts as Record<string, unknown>[])[0]
    expect(first.sevenDay).toBeNull()
  })

  it('ořízne dlouhou hlášku, na displeji je na ni jeden řádek', () => {
    const long = 'x'.repeat(200)
    const data = parse(buildPayload(snapshot([account({ statusDetail: long })])))
    const first = (data.accounts as Record<string, unknown>[])[0]
    expect((first.detail as string).length).toBe(60)
  })

  it('projde i více účty', () => {
    const data = parse(buildPayload(snapshot([account(), account({ id: 'a2', label: 'Pracovní' })])))
    expect((data.accounts as unknown[]).length).toBe(2)
  })
})
