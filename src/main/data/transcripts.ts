import { createReadStream, promises as fs, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { TRANSCRIPT_MAX_AGE_MS } from '../../shared/constants'
import { now } from '../../shared/time'
import { log } from '../log'

export interface UsageRecord {
  ts: number
  model: string
  input: number
  output: number
  cacheCreate: number
  cacheRead: number
  key: string
}

export interface FileCacheEntry {
  size: number
  mtimeMs: number
  /** Bajtový offset, od kterého se příště čte. */
  offset: number
  /** Nedopsaný poslední řádek — Claude Code zapisuje průběžně. */
  pendingTail: string
  records: UsageRecord[]
}

export interface ScanCache {
  version: number
  files: Record<string, FileCacheEntry>
}

export function emptyCache(): ScanCache {
  return { version: 1, files: {} }
}

export interface ScanResult {
  records: UsageRecord[]
  cache: ScanCache
  scannedBytes: number
  filesRead: number
  filesSkipped: number
}

function toNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Z jednoho řádku JSONL vytáhne záznam o spotřebě. Vrací null pro všechno,
 * co usage nenese (uživatelské zprávy, meta záznamy, rozbité řádky).
 */
export function parseRecord(line: string): UsageRecord | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed[0] !== '{') return null

  let rec: Record<string, unknown>
  try {
    rec = JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return null
  }

  const message = rec.message
  if (typeof message !== 'object' || message === null) return null
  const msg = message as Record<string, unknown>
  const usage = msg.usage
  if (typeof usage !== 'object' || usage === null) return null
  const u = usage as Record<string, unknown>

  const tsRaw = rec.timestamp
  const ts = typeof tsRaw === 'string' ? Date.parse(tsRaw) : NaN
  if (Number.isNaN(ts)) return null

  const input = toNumber(u.input_tokens)
  const output = toNumber(u.output_tokens)
  const cacheCreate = toNumber(u.cache_creation_input_tokens)
  const cacheRead = toNumber(u.cache_read_input_tokens)
  if (input + output + cacheCreate + cacheRead === 0) return null

  const msgId = typeof msg.id === 'string' ? msg.id : ''
  const reqId = typeof rec.requestId === 'string' ? rec.requestId : ''

  return {
    ts,
    model: typeof msg.model === 'string' ? msg.model : 'unknown',
    input,
    output,
    cacheCreate,
    cacheRead,
    // Streamované odpovědi se v transcriptu objeví víckrát — deduplikace podle
    // msgId:reqId (stejný přístup používá ccusage). Bez nich fallback na ts+model.
    key: msgId || reqId ? `${msgId}:${reqId}` : `${ts}:${input}:${output}`,
  }
}

async function listTranscripts(projectsDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true, recursive: true })
    return entries
      .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
      .map((e) => join(e.parentPath ?? projectsDir, e.name))
  } catch {
    return []
  }
}

/**
 * Inkrementální scan. Soubor, kterému sedí velikost i mtime, se vůbec neotevře —
 * proto to zvládne i víceGB `projects/` složku bez znatelné zátěže.
 */
export async function scanTranscripts(
  configDir: string,
  cacheIn: ScanCache,
  opts: { sinceMs?: number } = {},
): Promise<ScanResult> {
  const projectsDir = join(configDir, 'projects')
  const cache: ScanCache = { version: cacheIn.version, files: { ...cacheIn.files } }
  const sinceMs = opts.sinceMs ?? now() - TRANSCRIPT_MAX_AGE_MS

  const files = await listTranscripts(projectsDir)
  const seen = new Set<string>()
  let scannedBytes = 0
  let filesRead = 0
  let filesSkipped = 0

  for (const file of files) {
    seen.add(file)
    let stat: Awaited<ReturnType<typeof fs.stat>>
    try {
      stat = await fs.stat(file)
    } catch {
      continue
    }

    const cached = cache.files[file]

    // Nic se nezměnilo → nulové I/O.
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      filesSkipped++
      continue
    }

    // Initial index: staré soubory jen ostatujeme, nikdy nečteme.
    if (!cached && stat.mtimeMs < sinceMs) {
      cache.files[file] = {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        offset: stat.size,
        pendingTail: '',
        records: [],
      }
      filesSkipped++
      continue
    }

    // Soubor se zmenšil → rotace/přepsání, čti od začátku.
    const rotated = cached ? stat.size < cached.size : false
    const start = cached && !rotated ? cached.offset : 0
    const carry = cached && !rotated ? cached.pendingTail : ''
    const previous = cached && !rotated ? cached.records : []

    const { records, tail, bytes } = await readFrom(file, start, carry)
    scannedBytes += bytes
    filesRead++

    cache.files[file] = {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      offset: start + bytes,
      pendingTail: tail,
      records: [...previous, ...records].filter((r) => r.ts >= sinceMs),
    }
  }

  // Smazané soubory vyhoď z cache.
  for (const key of Object.keys(cache.files)) if (!seen.has(key)) delete cache.files[key]

  // Deduplikace napříč soubory.
  const byKey = new Map<string, UsageRecord>()
  for (const entry of Object.values(cache.files)) {
    for (const r of entry.records) if (!byKey.has(r.key)) byKey.set(r.key, r)
  }

  const records = [...byKey.values()].sort((a, b) => a.ts - b.ts)
  return { records, cache, scannedBytes, filesRead, filesSkipped }
}

function readFrom(
  file: string,
  start: number,
  carry: string,
): Promise<{ records: UsageRecord[]; tail: string; bytes: number }> {
  return new Promise((resolve) => {
    const records: UsageRecord[] = []
    let bytes = 0
    let buffer = carry

    const stream = createReadStream(file, { start, encoding: 'utf8' })
    stream.on('data', (chunk: string | Buffer) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      bytes += Buffer.byteLength(text, 'utf8')
      buffer += text
      let idx: number
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 1)
        const rec = parseRecord(line)
        if (rec) records.push(rec)
      }
    })
    stream.on('error', (err) => {
      log.debug('transcripts: čtení selhalo', file, err)
      resolve({ records, tail: buffer, bytes })
    })
    // Poslední, nedopsaný řádek si necháme na příště.
    stream.on('close', () => resolve({ records, tail: buffer, bytes }))
  })
}

/**
 * Rekurzivní watch na Windows funguje; jinde (a když selže) padáme na stat poll.
 * Debounce 2 s, protože Claude Code zapisuje po částech.
 */
export function watchTranscripts(configDir: string, onChange: () => void): () => void {
  const projectsDir = join(configDir, 'projects')
  let timer: NodeJS.Timeout | null = null
  const fire = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, 2000)
  }

  let watcher: FSWatcher | null = null
  try {
    watcher = watch(projectsDir, { recursive: true }, fire)
  } catch {
    watcher = null
  }

  const poll = watcher ? null : setInterval(fire, 60_000)

  return () => {
    if (timer) clearTimeout(timer)
    watcher?.close()
    if (poll) clearInterval(poll)
  }
}
