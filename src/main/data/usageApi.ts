import { net, type Session } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  ANTHROPIC_BETA,
  DEFAULT_CLAUDE_CODE_VERSION,
  USAGE_URL,
} from '../../shared/constants'
import { log } from '../log'
import { now } from '../../shared/time'

export interface ApiWindow {
  utilization: number | null
  resetsAt: string | null
}

export interface UsageApiResponse {
  fiveHour: ApiWindow | null
  sevenDay: ApiWindow | null
  sevenDayOpus: ApiWindow | null
  sevenDaySonnet: ApiWindow | null
  extraUsage: {
    enabled: boolean
    monthlyLimit: number | null
    usedCredits: number | null
    utilization: number | null
  } | null
}

export type UsageFetchResult =
  | { ok: true; data: UsageApiResponse; fetchedAt: number; unknownKeys: string[] }
  | { ok: false; kind: 'rate-limited'; retryAfterMs: number | null }
  | { ok: false; kind: 'unauthorized' }
  | { ok: false; kind: 'forbidden' | 'server'; status: number }
  | { ok: false; kind: 'network'; message: string }
  | { ok: false; kind: 'bad-shape'; message: string }

const KNOWN_TOP_LEVEL = new Set([
  'five_hour',
  'seven_day',
  'seven_day_opus',
  'seven_day_sonnet',
  'extra_usage',
])

function toWindow(value: unknown): ApiWindow | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>

  let utilization: number | null = null
  const rawUtil = v.utilization
  if (typeof rawUtil === 'number' && Number.isFinite(rawUtil)) {
    utilization = Math.min(100, Math.max(0, rawUtil))
  }

  let resetsAt: string | null = null
  const rawReset = v.resets_at
  if (typeof rawReset === 'string') {
    const parsed = Date.parse(rawReset)
    if (!Number.isNaN(parsed)) resetsAt = new Date(parsed).toISOString()
  }

  if (utilization === null && resetsAt === null) return null
  return { utilization, resetsAt }
}

function toNumberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Záměrně maximálně tolerantní. Endpoint je nedokumentovaný — chybějící nebo
 * přejmenovaný klíč nesmí shodit aplikaci, jen zúžit to, co umíme ukázat.
 * Neznámé klíče sbíráme, aby změna tvaru API byla VIDĚT, ne tichá.
 */
export function parseUsage(
  json: unknown,
): { data: UsageApiResponse; unknownKeys: string[] } | { error: string } {
  if (typeof json !== 'object' || json === null) return { error: 'odpověď není objekt' }
  const o = json as Record<string, unknown>

  const unknownKeys = Object.keys(o).filter((k) => !KNOWN_TOP_LEVEL.has(k))

  const fiveHour = toWindow(o.five_hour)
  const sevenDay = toWindow(o.seven_day)
  if (!fiveHour && !sevenDay) return { error: 'chybí five_hour i seven_day' }

  let extraUsage: UsageApiResponse['extraUsage'] = null
  if (typeof o.extra_usage === 'object' && o.extra_usage !== null) {
    const e = o.extra_usage as Record<string, unknown>
    extraUsage = {
      enabled: e.is_enabled === true,
      monthlyLimit: toNumberOrNull(e.monthly_limit),
      usedCredits: toNumberOrNull(e.used_credits),
      utilization: toNumberOrNull(e.utilization),
    }
  }

  return {
    data: {
      fiveHour,
      sevenDay,
      sevenDayOpus: toWindow(o.seven_day_opus),
      sevenDaySonnet: toWindow(o.seven_day_sonnet),
      extraUsage,
    },
    unknownKeys,
  }
}

let cachedVersion: string | null = null

/**
 * User-Agent musí vypadat jako Claude Code, jinak se chytíme do agresivního
 * 429 bucketu. Verzi bereme z posledního transcriptu (Claude Code ji razítkuje
 * do každého záznamu), případně z konfigurace.
 */
export async function detectClaudeCodeVersion(
  configDir: string,
  override: string | null,
): Promise<string> {
  if (override) return override
  if (cachedVersion) return cachedVersion

  try {
    const projects = join(configDir, 'projects')
    const entries = await fs.readdir(projects, { withFileTypes: true, recursive: true })
    let newest: { path: string; mtime: number } | null = null
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.jsonl')) continue
      const full = join(e.parentPath ?? projects, e.name)
      const st = await fs.stat(full)
      if (!newest || st.mtimeMs > newest.mtime) newest = { path: full, mtime: st.mtimeMs }
    }
    if (newest) {
      const raw = await fs.readFile(newest.path, 'utf8')
      const lines = raw.split('\n').filter((l) => l.trim())
      for (let i = lines.length - 1; i >= 0 && i > lines.length - 40; i--) {
        try {
          const rec = JSON.parse(lines[i]) as Record<string, unknown>
          if (typeof rec.version === 'string' && /^\d+\.\d+/.test(rec.version)) {
            cachedVersion = rec.version
            return cachedVersion
          }
        } catch {
          /* rozbitý řádek přeskoč */
        }
      }
    }
  } catch {
    /* transcripty nemusí existovat */
  }

  cachedVersion = DEFAULT_CLAUDE_CODE_VERSION
  return cachedVersion
}

export interface FetchUsageOptions {
  accessToken: string
  userAgent: string
  session: Session
  timeoutMs?: number
}

async function fetchUsageReal(o: FetchUsageOptions): Promise<UsageFetchResult> {
  const timeoutMs = o.timeoutMs ?? 15_000

  return new Promise<UsageFetchResult>((resolve) => {
    let settled = false
    const done = (r: UsageFetchResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }

    const request = net.request({
      method: 'GET',
      url: USAGE_URL,
      session: o.session,
      redirect: 'error',
    })

    request.setHeader('Authorization', `Bearer ${o.accessToken}`)
    request.setHeader('anthropic-beta', ANTHROPIC_BETA)
    request.setHeader('User-Agent', o.userAgent)
    request.setHeader('Content-Type', 'application/json')
    request.setHeader('Accept', 'application/json')

    const timer = setTimeout(() => {
      try {
        request.abort()
      } catch {
        /* už doběhl */
      }
      done({ ok: false, kind: 'network', message: `timeout po ${timeoutMs} ms` })
    }, timeoutMs)

    request.on('response', (response) => {
      const status = response.statusCode
      const chunks: Buffer[] = []
      response.on('data', (c: Buffer) => chunks.push(c))
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')

        if (status === 401) return done({ ok: false, kind: 'unauthorized' })
        if (status === 429) {
          const header = response.headers['retry-after']
          const value = Array.isArray(header) ? header[0] : header
          const seconds = value ? Number(value) : NaN
          return done({
            ok: false,
            kind: 'rate-limited',
            retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null,
          })
        }
        if (status === 403) return done({ ok: false, kind: 'forbidden', status })
        if (status >= 500) return done({ ok: false, kind: 'server', status })
        if (status < 200 || status >= 300) return done({ ok: false, kind: 'server', status })

        let json: unknown
        try {
          json = JSON.parse(body)
        } catch {
          return done({ ok: false, kind: 'bad-shape', message: 'odpověď není JSON' })
        }
        const parsed = parseUsage(json)
        if ('error' in parsed) return done({ ok: false, kind: 'bad-shape', message: parsed.error })
        if (parsed.unknownKeys.length) {
          log.info('usageApi: neznámé klíče v odpovědi', parsed.unknownKeys.join(','))
        }
        done({ ok: true, data: parsed.data, fetchedAt: now(), unknownKeys: parsed.unknownKeys })
      })
    })

    request.on('error', (err) => done({ ok: false, kind: 'network', message: err.message }))
    request.end()
  })
}

export const IS_MOCK = process.env.CLAUDEMONITOR_MOCK === '1'

/**
 * V mock režimu se podstrčí generátor se shodnou signaturou — celé UI a merge
 * vrstva tak běží přes reálné kódové cesty i bez účtu.
 */
export async function fetchUsage(o: FetchUsageOptions): Promise<UsageFetchResult> {
  if (IS_MOCK) {
    const { fetchUsageMock } = await import('../mock/mockApi')
    return fetchUsageMock(o)
  }
  return fetchUsageReal(o)
}

export { fetchUsageReal }
