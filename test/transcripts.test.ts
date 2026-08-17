import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyCache, parseRecord, scanTranscripts } from '../src/main/data/transcripts'

let dir = ''
let projects = ''
let file = ''

function line(ts: string, id: string, tokens = 100): string {
  return `${JSON.stringify({
    timestamp: ts,
    requestId: `req-${id}`,
    version: '2.1.3',
    message: {
      id: `msg-${id}`,
      model: 'claude-sonnet-4',
      usage: {
        input_tokens: tokens,
        output_tokens: tokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  })}\n`
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cm-'))
  projects = join(dir, 'projects', 'demo')
  mkdirSync(projects, { recursive: true })
  file = join(projects, 'session.jsonl')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('parseRecord', () => {
  it('ignoruje řádky bez usage', () => {
    expect(parseRecord('{"type":"user","message":{"content":"ahoj"}}')).toBeNull()
    expect(parseRecord('')).toBeNull()
    expect(parseRecord('rozbito{')).toBeNull()
  })

  it('vytáhne tokeny i model', () => {
    const rec = parseRecord(line('2026-08-17T12:00:00.000Z', 'a', 42).trim())
    expect(rec?.input).toBe(42)
    expect(rec?.model).toBe('claude-sonnet-4')
  })
})

describe('scanTranscripts', () => {
  it('načte záznamy a při druhém běhu už nečte nic', async () => {
    writeFileSync(file, line('2026-08-17T12:00:00.000Z', 'a') + line('2026-08-17T12:05:00.000Z', 'b'))

    const since = Date.parse('2026-08-01T00:00:00.000Z')
    const first = await scanTranscripts(dir, emptyCache(), { sinceMs: since })
    expect(first.records).toHaveLength(2)
    expect(first.filesRead).toBe(1)
    expect(first.scannedBytes).toBeGreaterThan(0)

    const second = await scanTranscripts(dir, first.cache, { sinceMs: since })
    expect(second.records).toHaveLength(2)
    // Nulové I/O — přesně kvůli tomuhle scan zvládne víceGB složku.
    expect(second.scannedBytes).toBe(0)
    expect(second.filesSkipped).toBe(1)
  })

  it('po připsání čte jen přírůstek', async () => {
    const since = Date.parse('2026-08-01T00:00:00.000Z')
    writeFileSync(file, line('2026-08-17T12:00:00.000Z', 'a'))
    const first = await scanTranscripts(dir, emptyCache(), { sinceMs: since })

    const added = line('2026-08-17T12:10:00.000Z', 'b')
    appendFileSync(file, added)
    const second = await scanTranscripts(dir, first.cache, { sinceMs: since })

    expect(second.records).toHaveLength(2)
    expect(second.scannedBytes).toBe(Buffer.byteLength(added, 'utf8'))
  })

  it('zvládne nedopsaný poslední řádek', async () => {
    const since = Date.parse('2026-08-01T00:00:00.000Z')
    const complete = line('2026-08-17T12:00:00.000Z', 'a')
    const partial = line('2026-08-17T12:10:00.000Z', 'b')
    const half = partial.slice(0, 40)

    writeFileSync(file, complete + half)
    const first = await scanTranscripts(dir, emptyCache(), { sinceMs: since })
    expect(first.records).toHaveLength(1)

    appendFileSync(file, partial.slice(40))
    const second = await scanTranscripts(dir, first.cache, { sinceMs: since })
    expect(second.records).toHaveLength(2)
  })

  it('po zkrácení souboru čte znovu od začátku', async () => {
    const since = Date.parse('2026-08-01T00:00:00.000Z')
    writeFileSync(file, line('2026-08-17T12:00:00.000Z', 'a') + line('2026-08-17T12:05:00.000Z', 'b'))
    const first = await scanTranscripts(dir, emptyCache(), { sinceMs: since })
    expect(first.records).toHaveLength(2)

    writeFileSync(file, line('2026-08-17T13:00:00.000Z', 'c'))
    const second = await scanTranscripts(dir, first.cache, { sinceMs: since })
    expect(second.records).toHaveLength(1)
    expect(second.scannedBytes).toBeGreaterThan(0)
  })

  it('deduplikuje podle msgId:reqId', async () => {
    const since = Date.parse('2026-08-01T00:00:00.000Z')
    const dup = line('2026-08-17T12:00:00.000Z', 'a')
    writeFileSync(file, dup + dup + line('2026-08-17T12:01:00.000Z', 'b'))
    const result = await scanTranscripts(dir, emptyCache(), { sinceMs: since })
    expect(result.records).toHaveLength(2)
  })

  it('vrátí prázdno, když projects neexistuje', async () => {
    rmSync(join(dir, 'projects'), { recursive: true, force: true })
    const result = await scanTranscripts(dir, emptyCache(), { sinceMs: 0 })
    expect(result.records).toEqual([])
  })
})
