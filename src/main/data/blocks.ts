import { BLOCK_HOURS } from '../../shared/constants'
import type { TokenTotals } from '../../shared/types'
import { addTotals, costOf, emptyTotals } from './pricing'
import type { UsageRecord } from './transcripts'

export interface Block {
  start: number
  end: number
  tokens: TokenTotals
  costUsd: number | null
  models: string[]
  messages: number
}

function totalsOf(r: UsageRecord): TokenTotals {
  return {
    input: r.input,
    output: r.output,
    cacheCreate: r.cacheCreate,
    cacheRead: r.cacheRead,
    total: r.input + r.output + r.cacheCreate + r.cacheRead,
  }
}

function floorToHour(ms: number): number {
  return Math.floor(ms / 3600_000) * 3600_000
}

/**
 * Stejná sémantika jako ccusage: nový blok vzniká, když žádný neběží,
 * když od jeho začátku uplynulo 5 h, nebo když je mezi zprávami mezera ≥ 5 h.
 * Začátek se zaokrouhlí dolů na celou hodinu.
 */
export function buildBlocks(records: UsageRecord[], blockHours = BLOCK_HOURS): Block[] {
  const windowMs = blockHours * 3600_000
  const sorted = [...records].sort((a, b) => a.ts - b.ts)
  const blocks: Block[] = []

  let start = 0
  let lastTs = 0
  let tokens = emptyTotals()
  let models = new Set<string>()
  let messages = 0

  const flush = (): void => {
    if (messages === 0) return
    const modelList = [...models]
    let cost: number | null = 0
    for (const m of modelList) {
      // Rozpad podle modelu nemáme, tak náklad počítáme za dominantní model.
      const c = costOf(tokens, m)
      if (c === null) {
        cost = null
        break
      }
      cost = c
      break
    }
    blocks.push({ start, end: start + windowMs, tokens, costUsd: cost, models: modelList, messages })
  }

  for (const r of sorted) {
    const needsNew =
      messages === 0 || r.ts - start >= windowMs || (lastTs > 0 && r.ts - lastTs >= windowMs)

    if (needsNew) {
      flush()
      start = floorToHour(r.ts)
      tokens = emptyTotals()
      models = new Set<string>()
      messages = 0
    }

    tokens = addTotals(tokens, totalsOf(r))
    models.add(r.model)
    messages++
    lastTs = r.ts
  }
  flush()

  return blocks
}

/** Blok, do kterého spadá `nowMs`. Null když poslední blok už doběhl. */
export function activeBlock(blocks: Block[], nowMs: number): Block | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (nowMs >= blocks[i].start && nowMs < blocks[i].end) return blocks[i]
  }
  return null
}

export function rolling7d(
  records: UsageRecord[],
  nowMs: number,
): TokenTotals & { costUsd: number | null } {
  const since = nowMs - 7 * 24 * 3600_000
  let totals = emptyTotals()
  let cost: number | null = 0
  for (const r of records) {
    if (r.ts < since) continue
    const t = totalsOf(r)
    totals = addTotals(totals, t)
    if (cost !== null) {
      const c = costOf(t, r.model)
      cost = c === null ? null : cost + c
    }
  }
  return { ...totals, costUsd: cost }
}

/**
 * Hrubý odhad vyčerpání 5h okna z historie uživatele: aktuální objem tokenů
 * proti p90 jeho vlastních dokončených bloků. Vždy se v UI označí jako odhad —
 * skutečné % zná jen server, protože limit je účtový a zahrnuje i claude.ai web.
 */
export function estimateUtilization(blocks: Block[], current: Block | null): number | null {
  if (!current) return null
  const completed = blocks.filter((b) => b !== current && b.messages > 0).map((b) => b.tokens.total)
  if (completed.length < 5) return null
  completed.sort((a, b) => a - b)
  const p90 = completed[Math.min(completed.length - 1, Math.floor(completed.length * 0.9))]
  if (!p90) return null
  return Math.min(100, Math.round((current.tokens.total / p90) * 100))
}
