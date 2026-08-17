export type AccountKind = 'personal' | 'work'

/** Akcenty odpovídají ŠKODA Flow paletě — viz renderer/styles/tokens.css. */
export const ACCENT_CHOICES = ['electric', 'teal', 'yellow', 'orange', 'blue'] as const
export type Accent = (typeof ACCENT_CHOICES)[number]

export interface AccountConfig {
  id: string
  label: string
  kind: AccountKind
  /** Absolutní cesta ke konfigurační složce Claude Code (obsahuje .credentials.json). */
  configDir: string
  accent: Accent
  enabled: boolean
  order: number
}

export type WindowMode = 'compact' | 'expanded' | 'settings'

export interface PublicSettings {
  window: { x: number | null; y: number | null; mode: WindowMode; alwaysOnTop: boolean }
  poll: { intervalSec: number }
  network: {
    extraCaPemPath: string | null
    userAgentVersion: string | null
    /** Plně lokální režim — nulový síťový provoz. Compliance fallback. */
    disableApi: boolean
  }
  notifications: {
    enabled: boolean
    thresholds: number[]
    onReset: boolean
    quietHours: { from: number; to: number } | null
  }
  ui: { locale: 'cs'; theme: 'emerald' | 'light'; fontDir: string | null; disableGpu: boolean }
  startWithWindows: boolean
}

export interface Settings extends PublicSettings {
  schemaVersion: number
  accounts: AccountConfig[]
}

export type UsageSource = 'api' | 'local-estimate'

export interface WindowUsage {
  /** 0–100, nebo null když se nedá zjistit (typicky lokální fallback). */
  utilization: number | null
  /** Absolutní ISO čas resetu. Countdown si tiká renderer — přes IPC nikdy neposíláme sekundy. */
  resetsAt: string | null
  source: UsageSource
}

export type AccountStatus =
  | 'ok'
  | 'stale'
  | 'token-expired'
  | 'no-credentials'
  | 'rate-limited'
  | 'network-error'
  | 'unknown-shape'
  | 'api-disabled'

export interface TokenTotals {
  input: number
  output: number
  cacheCreate: number
  cacheRead: number
  total: number
}

export interface LocalBlockInfo {
  start: string
  end: string
  tokens: TokenTotals
  costUsd: number | null
  messages: number
  models: string[]
}

export interface AccountSnapshot {
  id: string
  label: string
  kind: AccountKind
  accent: Accent
  status: AccountStatus
  /** Česká hláška s návodem, co udělat. */
  statusDetail?: string
  fiveHour?: WindowUsage
  sevenDay?: WindowUsage
  sevenDayOpus?: WindowUsage
  sevenDaySonnet?: WindowUsage
  extraUsage?: {
    enabled: boolean
    usedCredits: number | null
    monthlyLimit: number | null
    utilization: number | null
  }
  localBlock?: LocalBlockInfo
  /** Součty za posledních 7 dní z lokálních transcriptů. */
  localWeek?: TokenTotals & { costUsd: number | null }
  /** true = alespoň jedna hodnota pochází z lokálního odhadu, ne z API. */
  estimated: boolean
  /** Kdy naposledy dorazila použitelná data. */
  fetchedAt: string | null
  /** Kdy se poll pokusí znovu. */
  nextPollAt: string | null
}

export interface AppSnapshot {
  accounts: AccountSnapshot[]
  layout: 'single' | 'multi'
  mode: WindowMode
  theme: 'emerald' | 'light'
  /** Serverový „teď" v okamžiku sestavení — renderer si dál tiká sám. */
  now: string
  /** Nenulové jen když endpoint vrátil neznámé klíče — signál, že se API změnilo. */
  unknownApiKeys: string[]
  mock: boolean
}

export interface ProbeResult {
  exists: boolean
  hasCredentials: boolean
  expiresAt: number | null
  expired: boolean
  hasProjects: boolean
  projectCount: number
  jsonlCount: number
}

export interface AddAccountInput {
  label: string
  kind: AccountKind
  configDir: string
  accent?: Accent
}

export type ToastLevel = 'info' | 'warn' | 'error'
export interface ToastPayload {
  level: ToastLevel
  message: string
}
