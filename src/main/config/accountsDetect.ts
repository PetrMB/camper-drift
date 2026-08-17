import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ProbeResult } from '../../shared/types'
import { credentialsPath, readCredentials } from '../data/credentials'

export interface Candidate {
  path: string
  source: 'env' | 'default' | 'sibling'
}

/**
 * Kandidáti na konfigurační složku Claude Code. `sibling` je to, co dělá
 * přidání druhého účtu bezbolestné — najde `~/.claude-work` a podobné samo.
 */
export async function candidateConfigDirs(): Promise<Candidate[]> {
  const out: Candidate[] = []
  const seen = new Set<string>()

  const push = (path: string, source: Candidate['source']): void => {
    const norm = path.replace(/[\\/]+$/, '')
    if (!norm || seen.has(norm)) return
    seen.add(norm)
    out.push({ path: norm, source })
  }

  const env = process.env.CLAUDE_CONFIG_DIR
  if (env) for (const part of env.split(',')) if (part.trim()) push(part.trim(), 'env')

  const home = homedir()
  push(join(home, '.claude'), 'default')

  try {
    const entries = await fs.readdir(home, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isDirectory() || !e.name.startsWith('.claude')) continue
      const dir = join(home, e.name)
      try {
        await fs.access(credentialsPath(dir))
        push(dir, 'sibling')
      } catch {
        /* složka bez přihlášení nás nezajímá */
      }
    }
  } catch {
    /* domovský adresář nečitelný */
  }

  return out
}

export async function probeConfigDir(dir: string): Promise<ProbeResult> {
  const result: ProbeResult = {
    exists: false,
    hasCredentials: false,
    expiresAt: null,
    expired: false,
    hasProjects: false,
    projectCount: 0,
    jsonlCount: 0,
  }

  try {
    const st = await fs.stat(dir)
    result.exists = st.isDirectory()
  } catch {
    return result
  }
  if (!result.exists) return result

  const creds = await readCredentials(dir)
  if (creds.ok) {
    result.hasCredentials = true
    result.expiresAt = creds.expiresAt || null
    result.expired = creds.expired
  }

  const projects = join(dir, 'projects')
  try {
    const entries = await fs.readdir(projects, { withFileTypes: true, recursive: true })
    result.hasProjects = true
    const dirs = new Set<string>()
    for (const e of entries) {
      if (e.isDirectory()) dirs.add(e.name)
      else if (e.name.endsWith('.jsonl')) result.jsonlCount++
    }
    result.projectCount = dirs.size
  } catch {
    /* projects nemusí existovat */
  }

  return result
}

/** Popisek, který se nabídne pro nově detekovaný účet. */
export function suggestLabel(dir: string, existing: string[]): string {
  const base = dir.split(/[\\/]/).pop() ?? '.claude'
  const guess =
    base === '.claude'
      ? 'Osobní'
      : /work|prac|corp|skoda|škoda/i.test(base)
        ? 'Pracovní'
        : base.replace(/^\./, '')
  if (!existing.includes(guess)) return guess
  let n = 2
  while (existing.includes(`${guess} ${n}`)) n++
  return `${guess} ${n}`
}

export function guessKind(dir: string): 'personal' | 'work' {
  return /work|prac|corp|skoda|škoda/i.test(dir) ? 'work' : 'personal'
}
