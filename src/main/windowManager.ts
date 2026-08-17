import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import type { WindowMode } from '../shared/types'
import { getSettings, patchSettings } from './config/store'
import { log } from './log'

/**
 * `chrome` = hlavička + stavový řádek + odsazení na stín.
 * `rowSingle` / `rowMulti` = výška jedné karty účtu; v multi režimu má karta
 * navíc řádek s názvem účtu.
 */
const SIZES: Record<WindowMode, { width: number; chrome: number; rowSingle: number; rowMulti: number }> = {
  compact: { width: 300, chrome: 62, rowSingle: 94, rowMulti: 118 },
  expanded: { width: 340, chrome: 62, rowSingle: 300, rowMulti: 324 },
  settings: { width: 380, chrome: 34, rowSingle: 486, rowMulti: 486 },
}

/** Výška hlášky o stavu (token vypršel, 429, …) — až dva řádky. */
const DETAIL_ROW = 36

/** Nad tuhle výšku okno neroste — body má vlastní scroll. */
const MAX_HEIGHT = 900

let win: BrowserWindow | null = null
let accountCount = 1
let detailRows = 0

export function getWindow(): BrowserWindow | null {
  return win
}

export function createWindow(isDev: boolean, rendererUrl: string | null): BrowserWindow {
  const s = getSettings()

  win = new BrowserWindow({
    width: SIZES.compact.width,
    height: SIZES.compact.chrome + SIZES.compact.rowSingle,
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

/**
 * Okno si drží pevnou výšku — proto musí main vědět nejen kolik je účtů,
 * ale i kolik z nich má hlášku o stavu, aby se text nikdy neuřízl.
 */
export function setAccountCount(count: number, detailCount = 0): void {
  accountCount = Math.max(1, count)
  detailRows = Math.max(0, detailCount)
  applyMode(getSettings().window.mode)
}

export function applyMode(mode: WindowMode): void {
  if (!win) return
  const size = SIZES[mode]
  const rows = mode === 'settings' ? 1 : accountCount
  const rowHeight = rows > 1 ? size.rowMulti : size.rowSingle
  const details = mode === 'settings' ? 0 : detailRows * DETAIL_ROW
  const height = Math.min(MAX_HEIGHT, size.chrome + rows * rowHeight + details)
  win.setContentSize(size.width, Math.round(height))
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
