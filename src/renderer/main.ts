import './styles/tokens.css'
import './styles/typography.css'
import './styles/app.css'

import type { AppSnapshot, ToastPayload, WindowMode } from '../shared/types'
import { formatTimeOfDay } from '../shared/time'
import { hueColor, pickComposition, soonestAccountId } from './state'
import { createAccountCard, type AccountCard } from './components/accountCard'
import { createSettingsView } from './components/settings'
import { SerialLink } from './serialLink'

const root = document.getElementById('root') as HTMLElement

const card = document.createElement('div')
card.className = 'card'

const facet = document.createElement('div')
facet.className = 'facet'

const header = document.createElement('div')
header.className = 'header'
const headerDot = document.createElement('div')
headerDot.className = 'dot'
const headerTitle = document.createElement('div')
headerTitle.className = 'title t-subtitle2'
const spacer = document.createElement('div')
spacer.className = 'spacer'

const refreshBtn = iconButton('⟳', 'Obnovit teď')
const expandBtn = iconButton('⤢', 'Rozšířit / zmenšit')
const settingsBtn = iconButton('⚙', 'Nastavení')
const hideBtn = iconButton('—', 'Skrýt do trayi')

header.append(headerDot, headerTitle, spacer, refreshBtn, expandBtn, settingsBtn, hideBtn)

const body = document.createElement('div')
body.className = 'body'

// Vnitřní obal, který NEROSTE do zbylého místa — z něj se měří skutečná výška
// obsahu. Kdyby se měřil rovnou `body` (flex: 1), vrátil by vždy výšku okna
// a widget by se nikdy nezmenšil.
const bodyInner = document.createElement('div')
bodyInner.className = 'body-inner'
body.append(bodyInner)

const status = document.createElement('div')
status.className = 'status t-disclaimer'
const staleDot = document.createElement('div')
staleDot.className = 'staleness'
const statusText = document.createElement('span')
statusText.className = 'status-text'
// Že jde o odhad, hlásí přímo popisek u okna ("5h · odhad") — chip v patičce
// by to jen zopakoval a ukrojil místo textu.
status.append(staleDot, statusText)

card.append(facet, header, body, status)
root.append(card)

const settingsView = createSettingsView(() => {
  void refreshState()
})

/**
 * Volitelné propojení s ESP32 displejem. Když není připojený, nic nedělá
 * a widget se chová přesně jako dřív. Deklarace až za settingsView, aby
 * callback nesahal na proměnnou v dočasné mrtvé zóně.
 */
export const serialLink = new SerialLink((status, message) => {
  if (status === 'error' && message) showToast({ level: 'warn', message: `Displej: ${message}` })
  void settingsView.refresh()
})

const cards = new Map<string, AccountCard>()
let current: AppSnapshot | null = null
let currentMode: WindowMode = 'compact'
let ticker: number | null = null

function iconButton(glyph: string, title: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'iconbtn'
  b.type = 'button'
  b.textContent = glyph
  b.title = title
  b.setAttribute('aria-label', title)
  return b
}

refreshBtn.addEventListener('click', () => {
  void window.claudeMonitor.refreshNow().then((result) => {
    if (result.ok) return
    // Cooldown není chyba — jen decentní zavrtění, ne hláška.
    refreshBtn.classList.add('shake')
    setTimeout(() => refreshBtn.classList.remove('shake'), 340)
  })
})

expandBtn.addEventListener('click', () => {
  const next: WindowMode = currentMode === 'expanded' ? 'compact' : 'expanded'
  void window.claudeMonitor.window.setMode(next)
  applyMode(next)
})

settingsBtn.addEventListener('click', () => {
  const next: WindowMode = currentMode === 'settings' ? 'compact' : 'settings'
  void window.claudeMonitor.window.setMode(next)
  applyMode(next)
})

hideBtn.addEventListener('click', () => void window.claudeMonitor.window.hide())

function applyMode(mode: WindowMode): void {
  if (mode === currentMode) return
  currentMode = mode
  document.body.dataset.mode = mode
  // Karty se pro compact a expanded staví jinak (větší prstenec, sekce navíc).
  cards.clear()
  bodyInner.textContent = ''
  if (mode === 'settings') {
    bodyInner.append(settingsView.el)
    void settingsView.refresh().then(scheduleHeightReport)
    status.style.display = 'none'
  } else {
    status.style.display = ''
    if (current) render(current)
  }
  scheduleHeightReport()
}

function render(snapshot: AppSnapshot): void {
  current = snapshot
  document.documentElement.dataset.theme = snapshot.theme
  document.body.dataset.layout = snapshot.layout

  if (snapshot.mode !== currentMode) applyMode(snapshot.mode)
  if (currentMode === 'settings') return

  const nowMs = Date.parse(snapshot.now)
  const composition = pickComposition(snapshot, nowMs)
  const soonest = soonestAccountId(snapshot)

  headerTitle.textContent =
    snapshot.layout === 'single' ? (snapshot.accounts[0]?.label ?? 'ClaudeMonitor') : 'ClaudeMonitor'
  headerDot.style.display = snapshot.layout === 'single' ? '' : 'none'
  if (snapshot.accounts[0]) {
    headerDot.className = `dot accent-${snapshot.accounts[0].accent}`
  }

  if (snapshot.accounts.length === 0) {
    bodyInner.textContent = ''
    cards.clear()
    const empty = document.createElement('div')
    empty.className = 'muted t-caption2'
    empty.textContent =
      'Nenašel jsem přihlášený Claude Code. Přihlas se příkazem claude a otevři nastavení.'
    bodyInner.append(empty)
  } else {
    // Karty vytváříme/rušíme jen při změně množiny účtů, jinak jen updatujeme.
    const live = new Set(snapshot.accounts.map((a) => a.id))
    for (const [id, c] of cards) {
      if (live.has(id)) continue
      c.el.remove()
      cards.delete(id)
    }

    for (const account of snapshot.accounts) {
      let c = cards.get(account.id)
      if (!c) {
        c = createAccountCard(account.id, currentMode === 'expanded')
        cards.set(account.id, c)
        bodyInner.append(c.el)
      }
      c.update(account, composition, currentMode, nowMs)
      c.el.classList.toggle('soonest', snapshot.layout === 'multi' && account.id === soonest)
      c.tick(nowMs)
    }
  }

  staleDot.style.background = hueColor(composition.staleness)
  facet.style.background = 'var(--cm-facet)'

  const newest = snapshot.accounts
    .map((a) => a.fetchedAt)
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop()

  const parts: string[] = []
  parts.push(newest ? `Aktualizováno ${formatTimeOfDay(newest)}` : 'Zatím bez dat')
  if (snapshot.mock) parts.push('mock')
  // Neznámá pole z API jsou signál pro vývoj, ne pro uživatele — nedá se s tím
  // nic udělat a v 300px širokém widgetu to jen ukrajuje místo.
  // Konkrétní názvy klíčů zůstávají v diagnostice.
  statusText.textContent = parts.join(' · ')
  status.title = statusText.textContent

  void serialLink.send(snapshot)
  scheduleHeightReport()
}

let lastSentHeight = 0

/**
 * Výšku okna určuje skutečný obsah, ne napevno spočítané tabulky.
 * Bez tohohle se widget rozbije při jiném fontu (chybí SKODA Next → Segoe UI)
 * nebo při DPI škálování Windows — objeví se posuvník nebo useknutý text.
 */
function reportHeight(): void {
  const rootStyle = getComputedStyle(root)
  const padding =
    parseFloat(rootStyle.paddingTop || '0') + parseFloat(rootStyle.paddingBottom || '0')
  const bodyStyle = getComputedStyle(body)
  const bodyPadding =
    parseFloat(bodyStyle.paddingTop || '0') + parseFloat(bodyStyle.paddingBottom || '0')

  const needed =
    header.offsetHeight +
    bodyInner.getBoundingClientRect().height +
    bodyPadding +
    (status.style.display === 'none' ? 0 : status.offsetHeight) +
    padding

  const rounded = Math.ceil(needed)
  if (Math.abs(rounded - lastSentHeight) <= 1) return
  lastSentHeight = rounded
  void window.claudeMonitor.window.setHeight(rounded)
}

function scheduleHeightReport(): void {
  // Až po dokreslení, aby scrollHeight odpovídal finálnímu layoutu.
  requestAnimationFrame(() => requestAnimationFrame(reportHeight))
}

function tick(): void {
  if (!current || currentMode === 'settings') return
  const nowMs = Date.now()
  for (const [, c] of cards) c.tick(nowMs)
}

function startTicker(): void {
  if (ticker !== null) return
  ticker = window.setInterval(tick, 1000)
}

function stopTicker(): void {
  if (ticker === null) return
  window.clearInterval(ticker)
  ticker = null
}

document.addEventListener('visibilitychange', () => {
  // Skrytý widget nemá co přepočítávat — držíme se pod 0,5 % CPU.
  if (document.visibilityState === 'hidden') stopTicker()
  else {
    tick()
    startTicker()
  }
})

function showToast(payload: ToastPayload): void {
  const el = document.createElement('div')
  el.className = 'toast t-caption2'
  el.textContent = payload.message
  card.append(el)
  setTimeout(() => el.remove(), 4000)
}

async function refreshState(): Promise<void> {
  const snapshot = await window.claudeMonitor.getState()
  render(snapshot)
}

// Záchytná síť: cokoli změní obsah (přidání účtu v nastavení, zalomení textu
// jinou šířkou fontu), přeměří se výška bez ohledu na to, kdo změnu vyvolal.
new ResizeObserver(reportHeight).observe(bodyInner)

window.claudeMonitor.onState(render)
window.claudeMonitor.onToast(showToast)
window.claudeMonitor.onModeChange(applyMode)

void refreshState()
startTicker()

// Dřív povolený port se otevře bez dialogu; když žádný není, nic se nestane.
void serialLink.reconnect()
