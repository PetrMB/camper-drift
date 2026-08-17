import { powerMonitor, type Session } from 'electron'
import {
  MANUAL_REFRESH_COOLDOWN_MS,
  MAX_BACKOFF_MS,
  MIN_POLL_INTERVAL_MS,
} from '../../shared/constants'
import type { RefreshResult } from '../../shared/ipc'
import type { AccountConfig, Settings } from '../../shared/types'
import { now } from '../../shared/time'
import { log } from '../log'
import { readCredentials, watchCredentials } from './credentials'
import { detectClaudeCodeVersion, fetchUsage, type UsageFetchResult } from './usageApi'
import type { ApiState } from './merge'
import { emptyApiState } from './merge'

export interface PollerDeps {
  accounts: () => AccountConfig[]
  settings: () => Settings
  session: Session
  onState: (accountId: string, state: ApiState) => void
}

interface AccountRuntime {
  timer: NodeJS.Timeout | null
  unwatch: (() => void) | null
  backoffStep: number
  lastManual: number
  state: ApiState
  inFlight: boolean
}

export class UsagePoller {
  private runtime = new Map<string, AccountRuntime>()
  private started = false

  constructor(private deps: PollerDeps) {}

  start(): void {
    if (this.started) return
    this.started = true
    powerMonitor.on('suspend', () => this.suspend())
    powerMonitor.on('resume', () => this.resume())
    this.sync()
  }

  stop(): void {
    this.started = false
    for (const [, rt] of this.runtime) {
      if (rt.timer) clearTimeout(rt.timer)
      rt.unwatch?.()
    }
    this.runtime.clear()
  }

  /** Zavolá se po každé změně seznamu účtů nebo nastavení. */
  sync(): void {
    if (!this.started) return
    const accounts = this.deps.accounts().filter((a) => a.enabled)
    const live = new Set(accounts.map((a) => a.id))

    for (const [id, rt] of this.runtime) {
      if (live.has(id)) continue
      if (rt.timer) clearTimeout(rt.timer)
      rt.unwatch?.()
      this.runtime.delete(id)
    }

    const interval = this.intervalMs()
    accounts.forEach((account, index) => {
      let rt = this.runtime.get(account.id)
      if (!rt) {
        rt = {
          timer: null,
          unwatch: null,
          backoffStep: 0,
          lastManual: 0,
          state: emptyApiState(),
          inFlight: false,
        }
        this.runtime.set(account.id, rt)

        // Když Claude Code obnoví token, chceme se hned probrat z 'token-expired'.
        rt.unwatch = watchCredentials(account.configDir, () => {
          log.info(`poller: credentials změněny (${account.label}), zkouším znovu`)
          const cur = this.runtime.get(account.id)
          if (cur) cur.backoffStep = 0
          void this.pollAccount(account, true)
        })

        // Stagger: s dvěma účty 0 s a polovina intervalu.
        const offset = accounts.length > 1 ? Math.round((index * interval) / accounts.length) : 0
        this.schedule(account, offset)
      }
    })
  }

  private intervalMs(): number {
    return Math.max(MIN_POLL_INTERVAL_MS, this.deps.settings().poll.intervalSec * 1000)
  }

  private schedule(account: AccountConfig, delayMs: number): void {
    const rt = this.runtime.get(account.id)
    if (!rt) return
    if (rt.timer) clearTimeout(rt.timer)
    rt.state = { ...rt.state, nextPollAt: now() + delayMs }
    this.deps.onState(account.id, rt.state)
    rt.timer = setTimeout(() => {
      void this.pollAccount(account, false)
    }, delayMs)
  }

  async refreshNow(accountId?: string): Promise<RefreshResult> {
    const accounts = this.deps.accounts().filter((a) => a.enabled && (!accountId || a.id === accountId))
    if (accounts.length === 0) return { ok: false, reason: 'unknown-account' }

    let anyRan = false
    for (const account of accounts) {
      const rt = this.runtime.get(account.id)
      if (!rt) continue
      if (now() - rt.lastManual < MANUAL_REFRESH_COOLDOWN_MS) continue
      rt.lastManual = now()
      rt.backoffStep = 0
      anyRan = true
      void this.pollAccount(account, true)
    }
    return anyRan ? { ok: true } : { ok: false, reason: 'cooldown' }
  }

  private suspend(): void {
    for (const [, rt] of this.runtime) if (rt.timer) clearTimeout(rt.timer)
    log.info('poller: uspáno')
  }

  private resume(): void {
    log.info('poller: probuzeno, okamžitý refresh')
    for (const account of this.deps.accounts().filter((a) => a.enabled)) {
      const rt = this.runtime.get(account.id)
      if (rt) rt.backoffStep = 0
      void this.pollAccount(account, true)
    }
  }

  private async pollAccount(account: AccountConfig, immediate: boolean): Promise<void> {
    const rt = this.runtime.get(account.id)
    if (!rt || rt.inFlight) return
    rt.inFlight = true

    try {
      const settings = this.deps.settings()

      if (settings.network.disableApi) {
        this.update(account, { ...rt.state, lastError: null })
        this.schedule(account, this.intervalMs())
        return
      }

      const creds = await readCredentials(account.configDir)
      if (!creds.ok) {
        this.update(account, {
          ...rt.state,
          lastError: { kind: 'no-credentials', reason: creds.reason },
        })
        // Bez přihlášení nemá smysl tlouct na API — čekáme na změnu souboru.
        this.schedule(account, this.intervalMs())
        return
      }

      if (creds.expired) {
        this.update(account, { ...rt.state, lastError: { kind: 'token-expired' } })
        // Timer se nerestartuje krátce — probudí nás watchCredentials.
        this.schedule(account, this.intervalMs())
        return
      }

      const version = await detectClaudeCodeVersion(
        account.configDir,
        settings.network.userAgentVersion,
      )

      const result: UsageFetchResult = await fetchUsage({
        accessToken: creds.accessToken,
        userAgent: `claude-code/${version}`,
        session: this.deps.session,
      })

      this.applyResult(account, result, immediate)
    } catch (err) {
      log.warn('poller: neočekávaná chyba', err)
      this.update(account, {
        ...rt.state,
        lastError: { kind: 'network', message: String(err) },
      })
      this.schedule(account, this.backoffMs(account))
    } finally {
      const cur = this.runtime.get(account.id)
      if (cur) cur.inFlight = false
    }
  }

  private applyResult(account: AccountConfig, result: UsageFetchResult, _immediate: boolean): void {
    const rt = this.runtime.get(account.id)
    if (!rt) return

    if (result.ok) {
      rt.backoffStep = 0
      this.update(account, {
        data: result.data,
        fetchedAt: result.fetchedAt,
        lastError: null,
        unknownKeys: result.unknownKeys,
        nextPollAt: rt.state.nextPollAt,
      })
      this.schedule(account, this.intervalMs())
      return
    }

    if (result.kind === 'rate-limited') {
      rt.backoffStep++
      const delay = result.retryAfterMs ?? this.backoffMs(account)
      this.update(account, {
        ...rt.state,
        lastError: { kind: 'rate-limited', retryAfterMs: result.retryAfterMs },
      })
      log.warn(`poller: 429 (${account.label}), další pokus za ${Math.round(delay / 1000)} s`)
      this.schedule(account, delay)
      return
    }

    if (result.kind === 'unauthorized') {
      // Timer se zastaví — nemá smysl tlouct na API se zamítnutým tokenem.
      // Probudí nás až watchCredentials (Claude Code token obnoví) nebo ruční refresh.
      if (rt.timer) clearTimeout(rt.timer)
      rt.timer = null
      this.update(account, { ...rt.state, lastError: { kind: 'unauthorized' }, nextPollAt: null })
      return
    }

    rt.backoffStep++
    const error =
      result.kind === 'bad-shape'
        ? ({ kind: 'bad-shape', message: result.message } as const)
        : result.kind === 'network'
          ? ({ kind: 'network', message: result.message } as const)
          : ({ kind: result.kind, status: result.status } as const)

    this.update(account, { ...rt.state, lastError: error })
    this.schedule(account, this.backoffMs(account))
  }

  /** Exponenciální backoff s ±10 % jitterem, strop 30 min. */
  private backoffMs(account: AccountConfig): number {
    const rt = this.runtime.get(account.id)
    const step = rt?.backoffStep ?? 1
    const base = Math.min(this.intervalMs() * 2 ** Math.max(0, step - 1), MAX_BACKOFF_MS)
    const jitter = base * 0.1 * (Math.random() * 2 - 1)
    return Math.round(base + jitter)
  }

  private update(account: AccountConfig, state: ApiState): void {
    const rt = this.runtime.get(account.id)
    if (!rt) return
    rt.state = state
    this.deps.onState(account.id, state)
  }
}
