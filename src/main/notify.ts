import { Notification, type Tray } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AccountSnapshot, AppSnapshot, Settings } from '../shared/types'
import { formatCountdown } from '../shared/time'
import { now } from '../shared/time'
import { log } from './log'

export type NotificationIntent =
  | {
      kind: 'threshold'
      accountId: string
      label: string
      window: '5h' | '7d'
      threshold: number
      utilization: number
      resetsAt: string | null
    }
  | {
      kind: 'reset'
      accountId: string
      label: string
      window: '5h' | '7d'
      previousUtilization: number
    }

function windowsOf(a: AccountSnapshot): Array<{ key: '5h' | '7d'; usage: NonNullable<AccountSnapshot['fiveHour']> }> {
  const out: Array<{ key: '5h' | '7d'; usage: NonNullable<AccountSnapshot['fiveHour']> }> = []
  if (a.fiveHour) out.push({ key: '5h', usage: a.fiveHour })
  if (a.sevenDay) out.push({ key: '7d', usage: a.sevenDay })
  return out
}

function inQuietHours(s: Settings, nowMs: number): boolean {
  const q = s.notifications.quietHours
  if (!q) return false
  const hour = new Date(nowMs).getHours()
  return q.from <= q.to ? hour >= q.from && hour < q.to : hour >= q.from || hour < q.to
}

/**
 * Čistá funkce — celá logika notifikací je testovatelná bez Electronu.
 *
 * Klíč dedupe obsahuje `resetsAt`, takže se sada sama zneplatní při resetu okna:
 * jakmile se reset posune, práh se může odpálit znovu, ale ne dřív.
 */
export function evaluateNotifications(
  prev: AppSnapshot | null,
  next: AppSnapshot,
  settings: Settings,
  fired: Set<string>,
  nowMs: number,
): NotificationIntent[] {
  if (!settings.notifications.enabled) return []
  if (inQuietHours(settings, nowMs)) return []

  const intents: NotificationIntent[] = []
  const prevById = new Map((prev?.accounts ?? []).map((a) => [a.id, a]))

  for (const account of next.accounts) {
    // Z odhadu nikdy nenotifikujeme — falešný poplach je horší než žádný.
    if (account.estimated) continue

    for (const { key, usage } of windowsOf(account)) {
      if (usage.source !== 'api') continue

      if (usage.utilization !== null) {
        for (const threshold of settings.notifications.thresholds) {
          if (usage.utilization < threshold) continue
          const dedupeKey = `${account.id}:${key}:${threshold}:${usage.resetsAt ?? 'none'}`
          if (fired.has(dedupeKey)) continue
          fired.add(dedupeKey)
          intents.push({
            kind: 'threshold',
            accountId: account.id,
            label: account.label,
            window: key,
            threshold,
            utilization: usage.utilization,
            resetsAt: usage.resetsAt,
          })
        }
      }

      if (!settings.notifications.onReset) continue
      const before = prevById.get(account.id)
      const beforeUsage = key === '5h' ? before?.fiveHour : before?.sevenDay
      if (!beforeUsage?.resetsAt || !usage.resetsAt) continue
      const moved = Date.parse(usage.resetsAt) > Date.parse(beforeUsage.resetsAt)
      if (moved && (beforeUsage.utilization ?? 0) >= 50) {
        intents.push({
          kind: 'reset',
          accountId: account.id,
          label: account.label,
          window: key,
          previousUtilization: beforeUsage.utilization ?? 0,
        })
      }
    }
  }

  return intents
}

export function messageFor(intent: NotificationIntent, nowMs: number): { title: string; body: string } {
  const windowLabel = intent.window === '5h' ? '5h limit' : 'týdenní limit'
  if (intent.kind === 'reset') {
    return {
      title: `${intent.label}: ${windowLabel} se obnovil`,
      body: `Před resetem jsi byl na ${Math.round(intent.previousUtilization)} %.`,
    }
  }
  const remaining = intent.resetsAt
    ? ` Reset za ${formatCountdown(Date.parse(intent.resetsAt) - nowMs)}.`
    : ''
  return {
    title: `${intent.label}: ${windowLabel} na ${Math.round(intent.utilization)} %`,
    body: `Překročen práh ${intent.threshold} %.${remaining}`,
  }
}

/**
 * Toasty na Windows vyžadují zástupce ve Start menu (vytváří ho NSIS build).
 * Portable .exe ho nemá, takže tam padáme na tray balloon — jinak by
 * notifikace tiše nefungovaly a nikdo by nevěděl proč.
 */
export function fire(intents: NotificationIntent[], tray: Tray | null, nowMs: number): void {
  const usePortableFallback =
    !Notification.isSupported() || Boolean(process.env.PORTABLE_EXECUTABLE_FILE)

  for (const intent of intents) {
    const { title, body } = messageFor(intent, nowMs)
    try {
      if (usePortableFallback && tray) {
        tray.displayBalloon({ title, content: body })
      } else {
        new Notification({ title, body, silent: false }).show()
      }
    } catch (err) {
      log.warn('notify: zobrazení selhalo', err)
    }
  }
}

/** Persistence dedupe sady, aby restart neodpálil notifikace znovu. */
export async function loadFired(userDataDir: string): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(join(userDataDir, 'notify-state.json'), 'utf8')
    const parsed = JSON.parse(raw) as { keys?: unknown }
    if (Array.isArray(parsed.keys)) {
      return new Set(parsed.keys.filter((k): k is string => typeof k === 'string'))
    }
  } catch {
    /* první běh */
  }
  return new Set()
}

export async function saveFired(userDataDir: string, fired: Set<string>): Promise<void> {
  const path = join(userDataDir, 'notify-state.json')
  try {
    // Sadu držíme malou — klíče obsahují resetsAt, takže staré přirozeně zmizí.
    const keys = [...fired].slice(-200)
    await fs.writeFile(`${path}.tmp`, JSON.stringify({ keys, savedAt: now() }), 'utf8')
    await fs.rename(`${path}.tmp`, path)
  } catch (err) {
    log.debug('notify: uložení stavu selhalo', err)
  }
}
