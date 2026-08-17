/**
 * ==========================================================================
 *  ČTENÍ POUZE. Do žádné konfigurační složky Claude Code se NIKDY nezapisuje.
 *  Refresh tokeny rotují — kdybychom soubor přepsali, rozbijeme uživatelovo
 *  přihlášení v Claude Code. Když token vyprší, jen to oznámíme a počkáme,
 *  až ho Claude Code sám obnoví (watchCredentials to zachytí).
 *
 *  Hlídá to test/no-writes.test.ts — jakýkoli zápisový fs volání nad cestou
 *  odvozenou od configDir shodí testy.
 * ==========================================================================
 */
import { promises as fs, watchFile, unwatchFile } from 'node:fs'
import { join } from 'node:path'
import { TOKEN_EXPIRY_MARGIN_MS } from '../../shared/constants'
import { now } from '../../shared/time'

export function credentialsPath(configDir: string): string {
  return join(configDir, '.credentials.json')
}

export type CredentialsRead =
  | {
      ok: true
      accessToken: string
      expiresAt: number
      scopes: string[]
      expired: boolean
    }
  | { ok: false; reason: 'missing' | 'unreadable' | 'malformed' | 'busy' }

const RETRY_DELAYS_MS = [250, 250]

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Claude Code soubor při refreshi přepisuje, takže čtení může trefit rozepsaný
 * stav. Proto dva retry, než to prohlásíme za rozbité.
 */
export async function readCredentials(configDir: string): Promise<CredentialsRead> {
  const path = credentialsPath(configDir)
  let lastReason: 'unreadable' | 'malformed' | 'busy' = 'unreadable'

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let raw: string
    try {
      // flag 'r' — jen čtení, nikdy 'r+', 'w' ani 'a'.
      raw = await fs.readFile(path, { encoding: 'utf8', flag: 'r' })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, reason: 'missing' }
      lastReason = code === 'EBUSY' || code === 'EPERM' ? 'busy' : 'unreadable'
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt])
        continue
      }
      return { ok: false, reason: lastReason }
    }

    const parsed = parseCredentials(raw)
    if (parsed) return parsed

    lastReason = 'malformed'
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt])
  }

  return { ok: false, reason: lastReason }
}

/** Oddělené kvůli testovatelnosti — bere obsah souboru, ne cestu. */
export function parseCredentials(raw: string): CredentialsRead | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof json !== 'object' || json === null) return null
  const oauth = (json as Record<string, unknown>).claudeAiOauth
  if (typeof oauth !== 'object' || oauth === null) return null

  const o = oauth as Record<string, unknown>
  const accessToken = typeof o.accessToken === 'string' ? o.accessToken : null
  if (!accessToken) return null

  const expiresAt = typeof o.expiresAt === 'number' && Number.isFinite(o.expiresAt) ? o.expiresAt : 0
  const scopes = Array.isArray(o.scopes) ? o.scopes.filter((s): s is string => typeof s === 'string') : []

  return {
    ok: true,
    accessToken,
    expiresAt,
    scopes,
    expired: expiresAt > 0 && now() >= expiresAt - TOKEN_EXPIRY_MARGIN_MS,
  }
}

/**
 * Když Claude Code token obnoví, změní se mtime — to je náš signál, že se dá
 * zkusit poll znovu. `fs.watch` na jednotlivém souboru je na Windows nespolehlivý,
 * proto watchFile s pollingem.
 */
export function watchCredentials(configDir: string, onChange: () => void): () => void {
  const path = credentialsPath(configDir)
  const listener = (curr: { mtimeMs: number }, prev: { mtimeMs: number }): void => {
    if (curr.mtimeMs !== prev.mtimeMs) onChange()
  }
  watchFile(path, { interval: 30_000 }, listener)
  return () => unwatchFile(path, listener)
}
