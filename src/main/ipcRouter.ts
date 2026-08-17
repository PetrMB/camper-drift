import { BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { CH, type MutationResult, type RefreshResult } from '../shared/ipc'
import type {
  AccountConfig,
  AddAccountInput,
  AppSnapshot,
  ProbeResult,
  PublicSettings,
  Settings,
  WindowMode,
} from '../shared/types'
import { ACCENT_CHOICES } from '../shared/types'
import { getSettings, patchSettings, setAccounts } from './config/store'
import { candidateConfigDirs, guessKind, probeConfigDir, suggestLabel } from './config/accountsDetect'
import { applyMode, getWindow, openExternal, setAlwaysOnTop } from './windowManager'
import { log } from './log'

export interface RouterDeps {
  snapshot: () => AppSnapshot
  refreshNow: (accountId?: string) => Promise<RefreshResult>
  onAccountsChanged: () => void
  onSettingsChanged: () => void
  diagnostics: () => string
  quit: () => void
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function publicSettings(s: Settings): PublicSettings {
  const { schemaVersion: _sv, accounts: _acc, ...rest } = s
  return rest
}

export function registerIpc(deps: RouterDeps): void {
  ipcMain.handle(CH.STATE_GET, () => deps.snapshot())

  ipcMain.handle(CH.REFRESH_NOW, async (_e, payload: unknown): Promise<RefreshResult> => {
    const accountId = isRecord(payload) && typeof payload.accountId === 'string' ? payload.accountId : undefined
    return deps.refreshNow(accountId)
  })

  ipcMain.handle(CH.ACCOUNTS_LIST, (): AccountConfig[] => getSettings().accounts)

  ipcMain.handle(CH.ACCOUNTS_PROBE, async (_e, payload: unknown): Promise<ProbeResult | null> => {
    if (!isRecord(payload) || typeof payload.configDir !== 'string') return null
    return probeConfigDir(payload.configDir)
  })

  ipcMain.handle(CH.ACCOUNTS_SUGGEST, async () => {
    const candidates = await candidateConfigDirs()
    const used = new Set(getSettings().accounts.map((a) => a.configDir))
    const labels = getSettings().accounts.map((a) => a.label)
    const free = candidates.filter((c) => !used.has(c.path))
    return Promise.all(
      free.map(async (c) => ({
        configDir: c.path,
        source: c.source,
        label: suggestLabel(c.path, labels),
        kind: guessKind(c.path),
        probe: await probeConfigDir(c.path),
      })),
    )
  })

  ipcMain.handle(CH.ACCOUNTS_PICK_DIR, async (): Promise<string | null> => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Vyber konfigurační složku Claude Code',
      properties: ['openDirectory'],
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle(CH.ACCOUNTS_ADD, async (_e, payload: unknown): Promise<MutationResult> => {
    if (!isRecord(payload)) return { ok: false, error: 'neplatný vstup' }
    const input = payload as unknown as AddAccountInput
    if (typeof input.configDir !== 'string' || !input.configDir) {
      return { ok: false, error: 'chybí složka' }
    }

    const accounts = getSettings().accounts
    if (accounts.some((a) => a.configDir === input.configDir)) {
      return { ok: false, error: 'tato složka už je přidaná' }
    }

    const probe = await probeConfigDir(input.configDir)
    if (!probe.exists) return { ok: false, error: 'složka neexistuje' }
    if (!probe.hasCredentials) {
      return { ok: false, error: 've složce není .credentials.json — přihlas se v Claude Code' }
    }

    const accent = ACCENT_CHOICES.includes(input.accent as never)
      ? (input.accent as AccountConfig['accent'])
      : accounts.length === 0
        ? 'electric'
        : 'teal'

    const account: AccountConfig = {
      id: randomUUID(),
      label: typeof input.label === 'string' && input.label.trim() ? input.label.trim() : suggestLabel(input.configDir, accounts.map((a) => a.label)),
      kind: input.kind === 'work' ? 'work' : 'personal',
      configDir: input.configDir,
      accent,
      enabled: true,
      order: accounts.length,
    }

    setAccounts([...accounts, account])
    deps.onAccountsChanged()
    log.info(`ipc: přidán účet ${account.label}`)
    return { ok: true, id: account.id }
  })

  ipcMain.handle(CH.ACCOUNTS_UPDATE, (_e, payload: unknown): MutationResult => {
    if (!isRecord(payload) || typeof payload.id !== 'string' || !isRecord(payload.patch)) {
      return { ok: false, error: 'neplatný vstup' }
    }
    const accounts = getSettings().accounts
    const index = accounts.findIndex((a) => a.id === payload.id)
    if (index < 0) return { ok: false, error: 'účet nenalezen' }

    const patch = payload.patch
    const next = [...accounts]
    next[index] = {
      ...next[index],
      label: typeof patch.label === 'string' && patch.label.trim() ? patch.label.trim() : next[index].label,
      kind: patch.kind === 'work' || patch.kind === 'personal' ? patch.kind : next[index].kind,
      accent: ACCENT_CHOICES.includes(patch.accent as never)
        ? (patch.accent as AccountConfig['accent'])
        : next[index].accent,
      enabled: typeof patch.enabled === 'boolean' ? patch.enabled : next[index].enabled,
    }
    setAccounts(next)
    deps.onAccountsChanged()
    return { ok: true }
  })

  ipcMain.handle(CH.ACCOUNTS_REMOVE, (_e, payload: unknown): MutationResult => {
    if (!isRecord(payload) || typeof payload.id !== 'string') return { ok: false, error: 'neplatný vstup' }
    const accounts = getSettings().accounts.filter((a) => a.id !== payload.id)
    setAccounts(accounts.map((a, i) => ({ ...a, order: i })))
    deps.onAccountsChanged()
    return { ok: true }
  })

  ipcMain.handle(CH.SETTINGS_GET, (): PublicSettings => publicSettings(getSettings()))

  ipcMain.handle(CH.SETTINGS_SET, (_e, payload: unknown): PublicSettings => {
    if (isRecord(payload) && isRecord(payload.patch)) {
      // `accounts` a `schemaVersion` přes tenhle kanál nikdy neprojdou.
      const { accounts: _a, schemaVersion: _s, ...safe } = payload.patch as Record<string, unknown>
      patchSettings(safe as Partial<Settings>)
      deps.onSettingsChanged()
    }
    return publicSettings(getSettings())
  })

  ipcMain.handle(CH.WINDOW_SET_MODE, (_e, payload: unknown) => {
    if (!isRecord(payload)) return
    const mode = payload.mode
    if (mode !== 'compact' && mode !== 'expanded' && mode !== 'settings') return
    patchSettings({ window: { mode: mode as WindowMode } })
    applyMode(mode)
  })

  ipcMain.handle(CH.WINDOW_SET_ALWAYS_ON_TOP, (_e, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.value !== 'boolean') return
    setAlwaysOnTop(payload.value)
  })

  ipcMain.handle(CH.WINDOW_HIDE, () => getWindow()?.hide())
  ipcMain.handle(CH.WINDOW_QUIT, () => deps.quit())

  ipcMain.handle(CH.SHELL_OPEN_EXTERNAL, async (_e, payload: unknown) => {
    if (!isRecord(payload) || typeof payload.url !== 'string') return { ok: false }
    return { ok: await openExternal(payload.url) }
  })

  ipcMain.handle(CH.DIAG_EXPORT, () => deps.diagnostics())
}

export function pushSnapshot(snapshot: AppSnapshot): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(CH.STATE_UPDATE, snapshot)
  }
}

export function pushToast(level: 'info' | 'warn' | 'error', message: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(CH.TOAST, { level, message })
  }
}
