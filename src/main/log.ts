import { createWriteStream, mkdirSync, statSync, renameSync, existsSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'

type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const ENV_LEVEL = (process.env.CLAUDEMONITOR_LOG ?? 'warn').toLowerCase()
const MIN: number = ORDER[(ENV_LEVEL as Level) in ORDER ? (ENV_LEVEL as Level) : 'warn']

const MAX_BYTES = 1024 * 1024

let stream: WriteStream | null = null
let logPath: string | null = null

/**
 * Redakce běží na KAŽDÉM řádku, který projde loggerem. Token se tak nemůže
 * dostat do souboru ani do konzole ani omylem.
 */
export function redact(input: string): string {
  return input
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***')
    .replace(/(Authorization\s*[:=]\s*)(Bearer\s+)?\S+/gi, '$1***')
    .replace(/("(?:accessToken|refreshToken)"\s*:\s*")[^"]*(")/g, '$1***$2')
}

export function initLog(userDataDir: string): void {
  try {
    const dir = join(userDataDir, 'logs')
    mkdirSync(dir, { recursive: true })
    logPath = join(dir, 'claudemonitor.log')
    rotateIfNeeded()
    stream = createWriteStream(logPath, { flags: 'a' })
  } catch {
    stream = null
  }
}

function rotateIfNeeded(): void {
  if (!logPath || !existsSync(logPath)) return
  try {
    if (statSync(logPath).size > MAX_BYTES) renameSync(logPath, `${logPath}.1`)
  } catch {
    /* rotace je best-effort */
  }
}

function write(level: Level, args: unknown[]): void {
  if (ORDER[level] < MIN) return
  const line = redact(
    args
      .map((a) => {
        if (typeof a === 'string') return a
        if (a instanceof Error) return `${a.name}: ${a.message}`
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      })
      .join(' '),
  )
  const stamped = `${new Date().toISOString()} [${level}] ${line}\n`
  if (level === 'error' || level === 'warn') process.stderr.write(stamped)
  else process.stdout.write(stamped)
  stream?.write(stamped)
}

export const log = {
  debug: (...a: unknown[]) => write('debug', a),
  info: (...a: unknown[]) => write('info', a),
  warn: (...a: unknown[]) => write('warn', a),
  error: (...a: unknown[]) => write('error', a),
  path: () => logPath,
}
