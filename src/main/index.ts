import { app } from 'electron'
import { randomUUID } from 'node:crypto'
import { APP_ID } from '../shared/constants'
import type { AccountConfig, AppSnapshot } from '../shared/types'
import { now, setFrozenNow } from '../shared/time'
import { log, initLog } from './log'
import {
  candidateConfigDirs,
  guessKind,
  probeConfigDir,
  suggestLabel,
} from './config/accountsDetect'
import { flush, getSettings, loadSettings, setAccounts } from './config/store'
import { loadCache, saveCache } from './data/cache'
import { activeBlock, buildBlocks, estimateUtilization, rolling7d } from './data/blocks'
import { configureNetwork, type CertMode } from './data/netCerts'
import {
  buildSnapshot,
  emptyApiState,
  emptyLocalState,
  type AccountState,
  type ApiState,
} from './data/merge'
import { UsagePoller } from './data/poller'
import { scanTranscripts, watchTranscripts, type ScanCache, type UsageRecord } from './data/transcripts'
import { IS_MOCK } from './data/usageApi'
import { handleFontScheme, registerFontScheme } from './fontProtocol'
import { evaluateNotifications, fire, loadFired, saveFired } from './notify'
import { pushSnapshot, registerIpc } from './ipcRouter'
import { enableSerial } from './serialPermissions'
import { createTray, getTray, rebuildMenu, setStartWithWindows, updateTray } from './tray'
import { applyMode, createWindow, getWindow } from './windowManager'
import { readCredentials } from './data/credentials'
import { detectClaudeCodeVersion, fetchUsage } from './data/usageApi'

const IS_PROBE = process.env.CLAUDEMONITOR_PROBE === '1'
setFrozenNow(process.env.CLAUDEMONITOR_MOCK_CLOCK ?? null)

// Musí být před vytvořením jakékoli Notification, jinak Windows toasty tiše mlčí.
app.setAppUserModelId(APP_ID)

// Registrace schématu musí proběhnout ještě před app.whenReady().
registerFontScheme()

if (!app.requestSingleInstanceLock()) {
  // Druhá instance by dvojnásobným pollingem hnala token do 429.
  app.quit()
}

const states = new Map<string, AccountState>()
const caches = new Map<string, ScanCache>()
const unwatchers = new Map<string, () => void>()
let fired = new Set<string>()
let previousSnapshot: AppSnapshot | null = null
let poller: UsagePoller | null = null
let certMode: CertMode = 'system'
let quitting = false

function stateOf(id: string): AccountState {
  let s = states.get(id)
  if (!s) {
    s = { api: emptyApiState(), local: emptyLocalState() }
    states.set(id, s)
  }
  return s
}

function snapshot(): AppSnapshot {
  return buildSnapshot(getSettings().accounts, states, getSettings(), now(), IS_MOCK)
}

function publish(): void {
  const snap = snapshot()
  pushSnapshot(snap)
  updateTray(snap, now())

  const intents = evaluateNotifications(previousSnapshot, snap, getSettings(), fired, now())
  if (intents.length) {
    fire(intents, getTray(), now())
    void saveFired(app.getPath('userData'), fired)
  }
  previousSnapshot = snap
}

/** Lokální odhad — vždy označený jako odhad, nikdy nepřebije API. */
async function refreshLocal(account: AccountConfig): Promise<void> {
  const userData = app.getPath('userData')
  let cache = caches.get(account.id)
  if (!cache) {
    cache = await loadCache(userData, account.id)
    caches.set(account.id, cache)
  }

  let records: UsageRecord[] = []
  try {
    const result = await scanTranscripts(account.configDir, cache)
    caches.set(account.id, result.cache)
    records = result.records
    void saveCache(userData, account.id, result.cache)
    log.debug(
      `scan ${account.label}: ${result.filesRead} čteno, ${result.filesSkipped} přeskočeno, ${result.scannedBytes} B`,
    )
  } catch (err) {
    log.debug('scan selhal', err)
    return
  }

  const blocks = buildBlocks(records)
  const active = activeBlock(blocks, now())
  const s = stateOf(account.id)
  s.local = {
    blocks,
    activeBlock: active,
    estimate: estimateUtilization(blocks, active),
    week: rolling7d(records, now()),
  }
  publish()
}

async function ensureAccounts(): Promise<void> {
  if (getSettings().accounts.length > 0) return

  const candidates = await candidateConfigDirs()
  for (const candidate of candidates) {
    const probe = await probeConfigDir(candidate.path)
    if (!probe.hasCredentials) continue
    const account: AccountConfig = {
      id: randomUUID(),
      label: suggestLabel(candidate.path, []),
      kind: guessKind(candidate.path),
      configDir: candidate.path,
      accent: 'electric',
      enabled: true,
      order: 0,
    }
    setAccounts([account])
    log.info(`autodetekce: založen účet ${account.label} (${candidate.path})`)
    return
  }
  log.warn('autodetekce: nenalezen žádný přihlášený Claude Code')
}

function syncWatchers(): void {
  const accounts = getSettings().accounts.filter((a) => a.enabled)
  const live = new Set(accounts.map((a) => a.id))

  for (const [id, un] of unwatchers) {
    if (live.has(id)) continue
    un()
    unwatchers.delete(id)
    states.delete(id)
    caches.delete(id)
  }

  for (const account of accounts) {
    if (unwatchers.has(account.id)) continue
    unwatchers.set(
      account.id,
      watchTranscripts(account.configDir, () => void refreshLocal(account)),
    )
    void refreshLocal(account)
  }
}

function diagnostics(): string {
  const s = getSettings()
  const snap = snapshot()
  const lines = [
    `ClaudeMonitor ${app.getVersion()}`,
    `Electron ${process.versions.electron} · Node ${process.versions.node}`,
    `režim certifikátů: ${certMode}`,
    `mock: ${IS_MOCK}`,
    `interval: ${s.poll.intervalSec} s · API vypnuto: ${s.network.disableApi}`,
    `neznámé klíče API: ${snap.unknownApiKeys.join(', ') || '—'}`,
    '',
    ...snap.accounts.map(
      (a) =>
        `${a.label} [${a.kind}] status=${a.status} odhad=${a.estimated} ` +
        `5h=${a.fiveHour?.utilization ?? '—'}%/${a.fiveHour?.resetsAt ?? '—'} ` +
        `7d=${a.sevenDay?.utilization ?? '—'}%/${a.sevenDay?.resetsAt ?? '—'}`,
    ),
    '',
    `log: ${log.path() ?? '—'}`,
  ]
  return lines.join('\n')
}

/**
 * Headless jednorázový dotaz. Ověří Zscaler, User-Agent i beta hlavičku dřív,
 * než se na nich cokoli postaví. Token se nikdy nevypisuje.
 */
async function runProbe(): Promise<void> {
  const settings = getSettings()
  const { session } = configureNetwork(settings.network)
  await ensureAccounts()

  for (const account of getSettings().accounts) {
    process.stdout.write(`\n=== ${account.label} (${account.configDir}) ===\n`)
    const creds = await readCredentials(account.configDir)
    if (!creds.ok) {
      process.stdout.write(`credentials: CHYBA (${creds.reason})\n`)
      continue
    }
    process.stdout.write(
      `credentials: ok, platnost do ${new Date(creds.expiresAt).toISOString()}, expirovaný=${creds.expired}\n`,
    )

    const version = await detectClaudeCodeVersion(account.configDir, settings.network.userAgentVersion)
    process.stdout.write(`User-Agent: claude-code/${version}\n`)

    const result = await fetchUsage({
      accessToken: creds.accessToken,
      userAgent: `claude-code/${version}`,
      session,
    })

    if (result.ok) {
      process.stdout.write(`API: OK\n${JSON.stringify(result.data, null, 2)}\n`)
      if (result.unknownKeys.length) {
        process.stdout.write(`neznámé klíče: ${result.unknownKeys.join(', ')}\n`)
      }
    } else {
      process.stdout.write(`API: CHYBA ${result.kind} ${JSON.stringify(result)}\n`)
    }
  }

  process.stdout.write(`\nrežim certifikátů: ${certMode}\n`)
  app.exit(0)
}

async function bootstrap(): Promise<void> {
  const userData = app.getPath('userData')
  initLog(userData)
  await loadSettings(userData)

  const settings = getSettings()
  if (settings.ui.disableGpu) app.disableHardwareAcceleration()

  const net = configureNetwork(settings.network)
  certMode = net.mode

  if (IS_PROBE) {
    await runProbe()
    return
  }

  handleFontScheme(settings.ui.fontDir)
  fired = await loadFired(userData)
  await ensureAccounts()

  const win = createWindow(
    !app.isPackaged,
    process.env.ELECTRON_RENDERER_URL ?? null,
  )
  applyMode(getSettings().window.mode)
  enableSerial(win)

  poller = new UsagePoller({
    accounts: () => getSettings().accounts,
    settings: () => getSettings(),
    session: net.session,
    onState: (accountId: string, apiState: ApiState) => {
      stateOf(accountId).api = apiState
      publish()
    },
  })

  registerIpc({
    snapshot,
    refreshNow: async (accountId) => {
      const result = await poller!.refreshNow(accountId)
      for (const account of getSettings().accounts.filter((a) => !accountId || a.id === accountId)) {
        void refreshLocal(account)
      }
      return result
    },
    onAccountsChanged: () => {
      syncWatchers()
      poller?.sync()
      rebuildMenu(
        () => void poller?.refreshNow(),
        () => quit(),
      )
      publish()
    },
    onSettingsChanged: () => {
      poller?.sync()
      applyMode(getSettings().window.mode)
      publish()
    },
    diagnostics,
    quit: () => quit(),
  })

  createTray(
    () => void poller?.refreshNow(),
    () => quit(),
  )

  // Autostart srovnej s uloženým nastavením (uživatel ho mohl zrušit ve Windows).
  setStartWithWindows(getSettings().startWithWindows)

  syncWatchers()
  poller.start()

  win.webContents.on('did-finish-load', () => publish())
  log.info(`ClaudeMonitor spuštěn · cert=${certMode} · mock=${IS_MOCK}`)
}

function quit(): void {
  if (quitting) return
  quitting = true
  poller?.stop()
  for (const [, un] of unwatchers) un()
  unwatchers.clear()
  void saveFired(app.getPath('userData'), fired)
  for (const [id, cache] of caches) void saveCache(app.getPath('userData'), id, cache, true)
  void flush().finally(() => app.exit(0))
}

app.on('second-instance', () => {
  const win = getWindow()
  win?.show()
  win?.focus()
})

app.on('window-all-closed', () => {
  // Widget žije v trayi — zavření okna aplikaci neukončí.
})

app.on('before-quit', () => {
  poller?.stop()
})

void app.whenReady().then(bootstrap)
