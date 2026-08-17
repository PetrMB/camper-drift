import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { MIN_POLL_INTERVAL_MS } from '../../shared/constants'
import type { AccountConfig, Settings } from '../../shared/types'
import { ACCENT_CHOICES } from '../../shared/types'
import { log } from '../log'

const SCHEMA_VERSION = 1

export function defaultSettings(): Settings {
  return {
    schemaVersion: SCHEMA_VERSION,
    accounts: [],
    window: { x: null, y: null, mode: 'compact', alwaysOnTop: true },
    poll: { intervalSec: MIN_POLL_INTERVAL_MS / 1000 },
    network: { extraCaPemPath: null, userAgentVersion: null, disableApi: false },
    notifications: { enabled: true, thresholds: [80, 95], onReset: true, quietHours: null },
    ui: { locale: 'cs', theme: 'emerald', fontDir: null, disableGpu: false },
    startWithWindows: false,
  }
}

type Listener = (s: Settings) => void

let current: Settings = defaultSettings()
let filePath = ''
let writeTimer: NodeJS.Timeout | null = null
const listeners: Listener[] = []

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function sanitizeAccount(raw: unknown, index: number): AccountConfig | null {
  if (!isRecord(raw)) return null
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null
  const configDir = typeof raw.configDir === 'string' && raw.configDir ? raw.configDir : null
  if (!id || !configDir) return null
  const accent = ACCENT_CHOICES.includes(raw.accent as never) ? (raw.accent as AccountConfig['accent']) : 'electric'
  return {
    id,
    label: typeof raw.label === 'string' && raw.label ? raw.label : 'Účet',
    kind: raw.kind === 'work' ? 'work' : 'personal',
    configDir,
    accent,
    enabled: raw.enabled !== false,
    order: typeof raw.order === 'number' ? raw.order : index,
  }
}

/** Sanitizace je zároveň migrace — neznámé/rozbité hodnoty spadnou na default. */
export function migrate(raw: unknown): Settings {
  const d = defaultSettings()
  if (!isRecord(raw)) return d

  const accounts = Array.isArray(raw.accounts)
    ? raw.accounts.map(sanitizeAccount).filter((a): a is AccountConfig => a !== null)
    : []

  const win = isRecord(raw.window) ? raw.window : {}
  const poll = isRecord(raw.poll) ? raw.poll : {}
  const net = isRecord(raw.network) ? raw.network : {}
  const notif = isRecord(raw.notifications) ? raw.notifications : {}
  const ui = isRecord(raw.ui) ? raw.ui : {}

  const intervalSec = typeof poll.intervalSec === 'number' ? poll.intervalSec : d.poll.intervalSec

  return {
    schemaVersion: SCHEMA_VERSION,
    accounts,
    window: {
      x: typeof win.x === 'number' ? win.x : null,
      y: typeof win.y === 'number' ? win.y : null,
      mode: win.mode === 'expanded' || win.mode === 'settings' ? win.mode : 'compact',
      alwaysOnTop: win.alwaysOnTop !== false,
    },
    // Clamp je bezpečnostní pojistka proti 429 — nikdy nedovolíme rychlejší polling.
    poll: { intervalSec: Math.max(MIN_POLL_INTERVAL_MS / 1000, intervalSec) },
    network: {
      extraCaPemPath: typeof net.extraCaPemPath === 'string' ? net.extraCaPemPath : null,
      userAgentVersion: typeof net.userAgentVersion === 'string' ? net.userAgentVersion : null,
      disableApi: net.disableApi === true,
    },
    notifications: {
      enabled: notif.enabled !== false,
      thresholds: Array.isArray(notif.thresholds)
        ? notif.thresholds.filter((n): n is number => typeof n === 'number' && n > 0 && n <= 100)
        : d.notifications.thresholds,
      onReset: notif.onReset !== false,
      quietHours:
        isRecord(notif.quietHours) &&
        typeof notif.quietHours.from === 'number' &&
        typeof notif.quietHours.to === 'number'
          ? { from: notif.quietHours.from, to: notif.quietHours.to }
          : null,
    },
    ui: {
      locale: 'cs',
      theme: ui.theme === 'light' ? 'light' : 'emerald',
      fontDir: typeof ui.fontDir === 'string' ? ui.fontDir : null,
      disableGpu: ui.disableGpu === true,
    },
    startWithWindows: raw.startWithWindows === true,
  }
}

export async function loadSettings(userDataDir: string): Promise<Settings> {
  filePath = join(userDataDir, 'settings.json')
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    current = migrate(JSON.parse(raw))
  } catch {
    current = defaultSettings()
  }
  return current
}

export function getSettings(): Settings {
  return current
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export function patchSettings(patch: DeepPartial<Settings>): Settings {
  current = migrate(deepMerge(current as unknown as Record<string, unknown>, patch as Record<string, unknown>))
  scheduleWrite()
  for (const l of listeners) l(current)
  return current
}

export function setAccounts(accounts: AccountConfig[]): Settings {
  current = { ...current, accounts }
  scheduleWrite()
  for (const l of listeners) l(current)
  return current
}

export function onSettingsChange(l: Listener): () => void {
  listeners.push(l)
  return () => {
    const i = listeners.indexOf(l)
    if (i >= 0) listeners.splice(i, 1)
  }
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (isRecord(v) && isRecord(out[k])) out[k] = deepMerge(out[k] as Record<string, unknown>, v)
    else out[k] = v
  }
  return out
}

function scheduleWrite(): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    void flush()
  }, 300)
}

/** Atomický zápis: .tmp + rename, aby se nikdy nečetl half-written soubor. */
export async function flush(): Promise<void> {
  if (!filePath) return
  const tmp = `${filePath}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(current, null, 2), 'utf8')
    await fs.rename(tmp, filePath)
  } catch (err) {
    log.warn('store: zápis nastavení selhal', err)
  }
}
