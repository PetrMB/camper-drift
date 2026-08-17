import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import type { WindowMode } from '../shared/types'
import { getSettings, patchSettings } from './config/store'
import { log } from './log'

/**
 * Šířka je pevná, výška NENÍ — tu si po každém renderu naměří renderer
 * z reálného obsahu a pošle přes `cm:window:setHeight`. Napevno spočítané
 * výšky se rozbíjejí při jiném fontu (chybějící SKODA Next → Segoe UI)
 * a při DPI škálování Windows; hodnoty níž slouží jen jako odhad do doby,
 * než dorazí první měření.
 */
const SIZES: Record<WindowMode, { width: number; initialHeight: number }> = {
  compact: { width: 300, initialHeight: 160 },
  expanded: { width: 340, initialHeight: 380 },
  settings: { width: 380, initialHeight: 520 },
}

const MIN_HEIGHT = 96
const MAX_HEIGHT = 900

let win: BrowserWindow | null = null
let measuredHeight: number | null = null

export function getWindow(): BrowserWindow | null {
  return win
}

export function createWindow(isDev: boolean, rendererUrl: string | null): BrowserWindow {
  const s = getSettings()

  win = new BrowserWindow({
    width: SIZES.compact.width,
    height: SIZES.compact.initialHeight,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: s.window.alwaysOnTop,
    backgroundColor: '#00000000',
    // Windows kolem bezrámového okna jinak maluje vlastní stín a na Win11
    // i zaoblený okraj — obojí by kolem průhledného widgetu udělalo šedivý lem.
    hasShadow: false,
    roundedCorners: false,
    thickFrame: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  })

  if (s.window.alwaysOnTop) win.setAlwaysOnTop(true, 'floating')

  restoreBounds()

  // Widget nikdy nikam nenaviguje a neotevírá okna — všechno je lokální.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event) => event.preventDefault())

  win.on('moved', () => {
    if (!win) return
    const [x, y] = win.getPosition()
    patchSettings({ window: { x, y } })
  })

  win.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) win?.show()
  })

  screen.on('display-metrics-changed', () => clampToDisplay())
  screen.on('display-removed', () => clampToDisplay())

  if (rendererUrl) void win.loadURL(rendererUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))

  if (isDev) win.webContents.openDevTools({ mode: 'detach' })

  return win
}

function restoreBounds(): void {
  if (!win) return
  const s = getSettings()
  if (s.window.x !== null && s.window.y !== null) {
    win.setPosition(s.window.x, s.window.y)
    clampToDisplay()
    return
  }
  // Výchozí umístění: pravý horní roh pracovní plochy s odsazením.
  const area = screen.getPrimaryDisplay().workArea
  const [w] = win.getSize()
  win.setPosition(area.x + area.width - w - 24, area.y + 24)
}

/** Po odpojení monitoru nebo změně DPI okno srovnej zpátky na viditelnou plochu. */
function clampToDisplay(): void {
  if (!win) return
  const [x, y] = win.getPosition()
  const [w, h] = win.getSize()
  const area = screen.getDisplayMatching({ x, y, width: w, height: h }).workArea
  const nx = Math.min(Math.max(x, area.x), area.x + area.width - w)
  const ny = Math.min(Math.max(y, area.y), area.y + area.height - h)
  if (nx !== x || ny !== y) {
    win.setPosition(Math.round(nx), Math.round(ny))
    log.debug('window: pozice srovnána na viditelnou plochu')
  }
}

export function applyMode(mode: WindowMode): void {
  if (!win) return
  const size = SIZES[mode]
  // Výška je jen odhad; renderer ji hned po vykreslení upřesní.
  const [, currentHeight] = win.getContentSize()
  const height = measuredHeight ?? currentHeight ?? size.initialHeight
  win.setContentSize(size.width, clampHeight(height))
  clampToDisplay()
}

function clampHeight(height: number): number {
  return Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height)))
}

/**
 * Výška naměřená rendererem z reálného obsahu. Tím odpadá jakékoli hádání
 * podle počtu účtů, délky hlášek, fontu nebo DPI — a nevzniká posuvník.
 */
export function setMeasuredHeight(height: number): void {
  if (!win || !Number.isFinite(height)) return
  const target = clampHeight(height)
  const [width, current] = win.getContentSize()
  if (Math.abs(current - target) <= 1) return
  measuredHeight = target
  win.setContentSize(width, target)
  clampToDisplay()
}

export function setAlwaysOnTop(value: boolean): void {
  if (!win) return
  win.setAlwaysOnTop(value, value ? 'floating' : 'normal')
  // Když widget není navrchu, chová se jako běžné okno včetně taskbaru.
  win.setSkipTaskbar(value)
  patchSettings({ window: { alwaysOnTop: value } })
}

export function toggleVisibility(): void {
  if (!win) return
  if (win.isVisible()) win.hide()
  else {
    win.show()
    win.focus()
  }
}

const ALLOWED_HOSTS = new Set(['github.com', 'docs.anthropic.com', 'claude.ai'])

export async function openExternal(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) return false
    await shell.openExternal(parsed.toString())
    return true
  } catch {
    return false
  }
}
