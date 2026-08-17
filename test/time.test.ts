import { describe, expect, it } from 'vitest'
import { formatCountdown, formatTokens, formatUsd, pluralDays } from '../src/shared/time'

describe('formatCountdown', () => {
  it('hodiny a minuty', () => {
    expect(formatCountdown(72 * 60_000)).toBe('1:12')
    expect(formatCountdown(5 * 3600_000)).toBe('5:00')
  })

  it('pod hodinu jen minuty', () => {
    expect(formatCountdown(12 * 60_000)).toBe('12 min')
  })

  it('pod minutu sekundy', () => {
    expect(formatCountdown(30_000)).toBe('30 s')
  })

  it('nulový a záporný čas je "teď"', () => {
    expect(formatCountdown(0)).toBe('teď')
    expect(formatCountdown(-5000)).toBe('teď')
  })

  it('dny se skloňují česky', () => {
    expect(formatCountdown(2 * 24 * 3600_000 + 4 * 3600_000)).toBe('2 dny 4 h')
    expect(formatCountdown(5 * 24 * 3600_000)).toBe('5 dní')
    expect(formatCountdown(24 * 3600_000)).toBe('1 den')
  })
})

describe('pluralDays', () => {
  it('pokrývá všechny tvary', () => {
    expect(pluralDays(1)).toBe('1 den')
    expect(pluralDays(2)).toBe('2 dny')
    expect(pluralDays(4)).toBe('4 dny')
    expect(pluralDays(5)).toBe('5 dní')
    expect(pluralDays(11)).toBe('11 dní')
  })
})

describe('formátování čísel', () => {
  it('tokeny s českým desetinným oddělovačem', () => {
    expect(formatTokens(1_240_000)).toBe('1,24 M')
    expect(formatTokens(4300)).toBe('4,3 k')
    expect(formatTokens(120)).toBe('120')
  })

  it('částky', () => {
    expect(formatUsd(3.1)).toBe('3,10 USD')
    expect(formatUsd(null)).toBe('—')
  })
})
