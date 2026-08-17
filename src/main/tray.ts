import { Menu, Tray, app, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CRITICAL_THRESHOLD, WARN_THRESHOLD } from '../shared/constants'
import type { AppSnapshot } from '../shared/types'
import { formatCountdown, formatClock } from '../shared/time'
import { hasError, worstUtilization } from './data/merge'
import { getSettings, patchSettings } from './config/store'
import { applyMode, setAlwaysOnTop, toggleVisibility, getWindow } from './windowManager'
import { log } from './log'

let tray: Tray | null = null
let lastIcon = ''

export function getTray(): Tray | null {
  return tray
}

function iconPath(name: string): string {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'build')
    : join(__dirname, '../../build')
  const p = join(base, `${name}.ico`)
  return existsSync(p) ? p : ''
}

function iconFor(snapshot: AppSnapshot): string {
  if (hasError(snapshot)) return 'tray-error'
  const worst = worstUtilization(snapshot)
  if (worst !== null && worst >= CRITICAL_THRESHOLD) return 'tray-critical'
  if (worst !== null && worst >= WARN_THRESHOLD) return 'tray-warn'
  return 'tray-ok'
}

/** Windows tooltip má limit kolem 127 znaků — stavíme ho s ohledem na to. */
export function buildTooltip(snapshot: AppSnapshot, nowMs: number): string {
  const lines = ['ClaudeMonitor']
  for (const a of snapshot.accounts) {
    const w = a.fiveHour
    if (!w?.resetsAt) {
      lines.push(`${a.label}: bez dat`)
      continue
    }
    const pct = w.utilization === null ? '—' : `${Math.round(w.utilization)} %`
    const left = formatCountdown(Date.parse(w.resetsAt) - nowMs)
    lines.push(`${a.label} 5h ${pct} · reset ${formatClock(w.resetsAt, nowMs)} (za ${left})`)
  }
  let out = lines.join('\n')
  if (out.length > 127) out = `${out.slice(0, 124)}…`
  return out
}

export function createTray(onRefresh: () => void, onQuit: () => void): Tray {
  const path = iconPath('tray-ok')
  const image = path ? nativeImage.createFromPath(path) : nativeImage.createEmpty()
  tray = new Tray(image)
  tray.setToolTip('ClaudeMonitor')

  tray.on('click', () => toggleVisibility())
  tray.on('double-click', () => {
    patchSettings({ window: { mode: 'expanded' } })
    applyMode('expanded')
    getWindow()?.show()
  })

  rebuildMenu(onRefresh, onQuit)
  return tray
}

export function rebuildMenu(onRefresh: () => void, onQuit: () => void): void {
  if (!tray) return
  const s = getSettings()

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Zobrazit / skrýt', click: () => toggleVisibility() },
      { type: 'separator' },
      {
        label: 'Vždy navrchu',
        type: 'checkbox',
        checked: s.window.alwaysOnTop,
        click: (item) => {
          setAlwaysOnTop(item.checked)
          rebuildMenu(onRefresh, onQuit)
        },
      },
      {
        label: 'Rozšířené zobrazení',
        type: 'checkbox',
        checked: s.window.mode === 'expanded',
        click: (item) => {
          const mode = item.checked ? 'expanded' : 'compact'
          patchSettings({ window: { mode } })
          applyMode(mode)
          getWindow()?.webContents.send('cm:window:mode', { mode })
          rebuildMenu(onRefresh, onQuit)
        },
      },
      { type: 'separator' },
      { label: 'Obnovit teď', click: onRefresh },
      {
        label: 'Nastavení',
        click: () => {
          patchSettings({ window: { mode: 'settings' } })
          applyMode('settings')
          getWindow()?.webContents.send('cm:window:mode', { mode: 'settings' })
          getWindow()?.show()
          rebuildMenu(onRefresh, onQuit)
        },
      },
      {
        label: 'Spouštět s Windows',
        type: 'checkbox',
        checked: s.startWithWindows,
        click: (item) => {
          setStartWithWindows(item.checked)
          rebuildMenu(onRefresh, onQuit)
        },
      },
      { type: 'separator' },
      { label: 'Ukončit', click: onQuit },
    ]),
  )
}

export function updateTray(snapshot: AppSnapshot, nowMs: number): void {
  if (!tray) return
  tray.setToolTip(buildTooltip(snapshot, nowMs))

  const wanted = iconFor(snapshot)
  if (wanted === lastIcon) return
  lastIcon = wanted
  const path = iconPath(wanted)
  if (path) tray.setImage(nativeImage.createFromPath(path))
}

/**
 * U portable buildu ukazuje `process.execPath` do dočasného adresáře, který
 * po ukončení zmizí — autostart by pak odkazoval do prázdna.
 */
export function setStartWithWindows(enabled: boolean): void {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, path: exe, args: ['--hidden'] })
    patchSettings({ startWithWindows: enabled })
  } catch (err) {
    log.warn('tray: nastavení autostartu selhalo', err)
  }
}
