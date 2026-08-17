import {
  BLOCK_HOURS,
  CRITICAL_THRESHOLD,
  FRESH_AFTER_MS,
  STALE_AFTER_MS,
} from '../../shared/constants'
import type {
  AccountConfig,
  AccountSnapshot,
  AccountStatus,
  AppSnapshot,
  Settings,
  WindowUsage,
} from '../../shared/types'
import type { Block } from './blocks'
import type { UsageApiResponse } from './usageApi'
import type { TokenTotals } from '../../shared/types'

export interface ApiState {
  data: UsageApiResponse | null
  fetchedAt: number | null
  lastError:
    | null
    | { kind: 'rate-limited'; retryAfterMs: number | null }
    | { kind: 'unauthorized' }
    | { kind: 'forbidden' | 'server'; status: number }
    | { kind: 'network'; message: string }
    | { kind: 'bad-shape'; message: string }
    | { kind: 'no-credentials'; reason: string }
    | { kind: 'token-expired' }
  unknownKeys: string[]
  nextPollAt: number | null
}

export interface LocalState {
  blocks: Block[]
  activeBlock: Block | null
  estimate: number | null
  week: (TokenTotals & { costUsd: number | null }) | null
}

export function emptyApiState(): ApiState {
  return { data: null, fetchedAt: null, lastError: null, unknownKeys: [], nextPollAt: null }
}

export function emptyLocalState(): LocalState {
  return { blocks: [], activeBlock: null, estimate: null, week: null }
}

export interface AccountState {
  api: ApiState
  local: LocalState
}

function apiWindow(w: { utilization: number | null; resetsAt: string | null } | null): WindowUsage | undefined {
  if (!w) return undefined
  return { utilization: w.utilization, resetsAt: w.resetsAt, source: 'api' }
}

function statusFromError(err: ApiState['lastError']): { status: AccountStatus; detail: string } {
  switch (err?.kind) {
    case 'token-expired':
      return {
        status: 'token-expired',
        detail: 'Token vypršel. Spusť libovolný příkaz v Claude Code, obnoví se sám.',
      }
    case 'no-credentials':
      return {
        status: 'no-credentials',
        detail: 'V této složce není .credentials.json. Přihlas se v Claude Code.',
      }
    case 'unauthorized':
      return {
        status: 'token-expired',
        detail: 'Token odmítnut (401). Spusť libovolný příkaz v Claude Code.',
      }
    case 'rate-limited':
      return { status: 'rate-limited', detail: 'Příliš mnoho dotazů (429), zkusím to později.' }
    case 'bad-shape':
      return {
        status: 'unknown-shape',
        detail: 'API vrátilo neznámý tvar dat. Ukazuji lokální odhad.',
      }
    case 'forbidden':
    case 'server':
      return { status: 'network-error', detail: `Server odpověděl ${err.status}.` }
    case 'network':
      return { status: 'network-error', detail: `Síť: ${err.message}` }
    default:
      return { status: 'network-error', detail: 'Data se zatím nepodařilo načíst.' }
  }
}

/**
 * Priorita: čerstvé API > zastaralé API > lokální odhad.
 * Lokální data nikdy nepřebijí API a vždy se označí jako odhad.
 */
export function mergeAccount(
  cfg: AccountConfig,
  state: AccountState,
  settings: Settings,
  nowMs: number,
): AccountSnapshot {
  const { api, local } = state
  const age = api.fetchedAt === null ? Infinity : nowMs - api.fetchedAt
  const apiUsable = api.data !== null && age < STALE_AFTER_MS

  const base: AccountSnapshot = {
    id: cfg.id,
    label: cfg.label,
    kind: cfg.kind,
    accent: cfg.accent,
    status: 'ok',
    estimated: false,
    fetchedAt: api.fetchedAt === null ? null : new Date(api.fetchedAt).toISOString(),
    nextPollAt: api.nextPollAt === null ? null : new Date(api.nextPollAt).toISOString(),
  }

  if (local.activeBlock) {
    base.localBlock = {
      start: new Date(local.activeBlock.start).toISOString(),
      end: new Date(local.activeBlock.end).toISOString(),
      tokens: local.activeBlock.tokens,
      costUsd: local.activeBlock.costUsd,
      messages: local.activeBlock.messages,
      models: local.activeBlock.models,
    }
  }
  if (local.week) base.localWeek = local.week

  if (settings.network.disableApi) {
    return {
      ...base,
      ...localOnly(local, nowMs),
      status: 'api-disabled',
      statusDetail: 'Síťové dotazy jsou vypnuté — ukazuji jen lokální odhad.',
      estimated: true,
    }
  }

  if (apiUsable && api.data) {
    const snapshot: AccountSnapshot = {
      ...base,
      fiveHour: apiWindow(api.data.fiveHour),
      sevenDay: apiWindow(api.data.sevenDay),
      sevenDayOpus: apiWindow(api.data.sevenDayOpus),
      sevenDaySonnet: apiWindow(api.data.sevenDaySonnet),
      extraUsage: api.data.extraUsage
        ? {
            enabled: api.data.extraUsage.enabled,
            usedCredits: api.data.extraUsage.usedCredits,
            monthlyLimit: api.data.extraUsage.monthlyLimit,
            utilization: api.data.extraUsage.utilization,
          }
        : undefined,
      status: age < FRESH_AFTER_MS ? 'ok' : 'stale',
    }

    if (snapshot.status === 'stale') {
      snapshot.statusDetail = 'Data se chvíli neobnovila.'
    }
    if (api.lastError) {
      const { status, detail } = statusFromError(api.lastError)
      // Chyba je čerstvější než data — pojmenuj ji, ale čísla nech vidět.
      snapshot.status = status
      snapshot.statusDetail = detail
    }

    return withClockSkewGuard(snapshot, nowMs)
  }

  const { status, detail } = statusFromError(api.lastError)
  return withClockSkewGuard(
    {
      ...base,
      ...localOnly(local, nowMs),
      status,
      statusDetail: detail,
      estimated: true,
    },
    nowMs,
  )
}

function localOnly(local: LocalState, _nowMs: number): Partial<AccountSnapshot> {
  const fiveHour: WindowUsage | undefined = local.activeBlock
    ? {
        utilization: local.estimate,
        resetsAt: new Date(local.activeBlock.end).toISOString(),
        source: 'local-estimate',
      }
    : undefined

  // Týdenní reset z lokálních dat odvodit nelze — raději `—` než smyšlené číslo.
  const sevenDay: WindowUsage | undefined = local.week
    ? { utilization: null, resetsAt: null, source: 'local-estimate' }
    : undefined

  return { fiveHour, sevenDay }
}

/** Když systémový čas ujel, countdown by lhal — radši to řekni. */
function withClockSkewGuard(s: AccountSnapshot, nowMs: number): AccountSnapshot {
  const resets = s.fiveHour?.resetsAt
  if (!resets) return s
  const delta = Date.parse(resets) - nowMs
  if (delta > (BLOCK_HOURS + 0.1) * 3600_000) {
    return { ...s, statusDetail: 'Reset je podezřele daleko — zkontroluj systémový čas.' }
  }
  return s
}

export function buildSnapshot(
  cfgs: AccountConfig[],
  states: Map<string, AccountState>,
  settings: Settings,
  nowMs: number,
  mock: boolean,
): AppSnapshot {
  const enabled = cfgs.filter((c) => c.enabled).sort((a, b) => a.order - b.order)
  const accounts = enabled.map((cfg) =>
    mergeAccount(cfg, states.get(cfg.id) ?? { api: emptyApiState(), local: emptyLocalState() }, settings, nowMs),
  )

  const unknownApiKeys = [
    ...new Set(enabled.flatMap((c) => states.get(c.id)?.api.unknownKeys ?? [])),
  ]

  return {
    accounts,
    layout: accounts.length > 1 ? 'multi' : 'single',
    mode: settings.window.mode,
    theme: settings.ui.theme,
    now: new Date(nowMs).toISOString(),
    unknownApiKeys,
    mock,
  }
}

/** Nejvyšší vyčerpání napříč účty — pro barvu tray ikony a tooltip. */
export function worstUtilization(snapshot: AppSnapshot): number | null {
  let worst: number | null = null
  for (const a of snapshot.accounts) {
    for (const w of [a.fiveHour, a.sevenDay]) {
      if (w?.utilization !== null && w?.utilization !== undefined) {
        worst = worst === null ? w.utilization : Math.max(worst, w.utilization)
      }
    }
  }
  return worst
}

export function hasError(snapshot: AppSnapshot): boolean {
  return snapshot.accounts.some((a) =>
    ['no-credentials', 'token-expired', 'network-error', 'unknown-shape'].includes(a.status),
  )
}

export function isCritical(snapshot: AppSnapshot): boolean {
  const w = worstUtilization(snapshot)
  return w !== null && w >= CRITICAL_THRESHOLD
}
