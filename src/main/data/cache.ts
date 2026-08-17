import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { log } from '../log'
import { now } from '../../shared/time'
import { emptyCache, type ScanCache } from './transcripts'

/**
 * Cache scanování transcriptů. Obsahuje výhradně cesty, velikosti, offsety
 * a agregované počty tokenů — nikdy token ani obsah zpráv.
 */
const WRITE_THROTTLE_MS = 60_000

const lastWrite = new Map<string, number>()

function cachePath(userDataDir: string, accountId: string): string {
  const safe = accountId.replace(/[^A-Za-z0-9_-]/g, '_')
  return join(userDataDir, `scan-cache.${safe}.json`)
}

export async function loadCache(userDataDir: string, accountId: string): Promise<ScanCache> {
  try {
    const raw = await fs.readFile(cachePath(userDataDir, accountId), 'utf8')
    const parsed = JSON.parse(raw) as ScanCache
    if (parsed && parsed.version === 1 && typeof parsed.files === 'object') return parsed
  } catch {
    /* první běh */
  }
  return emptyCache()
}

export async function saveCache(
  userDataDir: string,
  accountId: string,
  cache: ScanCache,
  force = false,
): Promise<void> {
  const key = `${userDataDir}:${accountId}`
  const last = lastWrite.get(key) ?? 0
  if (!force && now() - last < WRITE_THROTTLE_MS) return
  lastWrite.set(key, now())

  const path = cachePath(userDataDir, accountId)
  const tmp = `${path}.tmp`
  try {
    await fs.writeFile(tmp, JSON.stringify(cache), 'utf8')
    await fs.rename(tmp, path)
  } catch (err) {
    log.debug('cache: zápis selhal', err)
  }
}
