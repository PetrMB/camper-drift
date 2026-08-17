import { contextBridge, ipcRenderer } from 'electron'
import { CH, type MutationResult, type RefreshResult } from '../shared/ipc'
import type {
  AccountConfig,
  AddAccountInput,
  AppSnapshot,
  ProbeResult,
  PublicSettings,
  ToastPayload,
  WindowMode,
} from '../shared/types'

export interface AccountSuggestion {
  configDir: string
  source: 'env' | 'default' | 'sibling'
  label: string
  kind: 'personal' | 'work'
  probe: ProbeResult
}

/**
 * Jediná plocha, přes kterou se renderer dostane k main procesu.
 * Žádný `ipcRenderer` neprosakuje ven; token se sem nikdy nedostane —
 * renderer vidí výhradně odvozená čísla, ISO časy a stavové enumy.
 */
const api = {
  getState: (): Promise<AppSnapshot> => ipcRenderer.invoke(CH.STATE_GET),

  onState: (cb: (s: AppSnapshot) => void): (() => void) => {
    const handler = (_e: unknown, s: AppSnapshot): void => cb(s)
    ipcRenderer.on(CH.STATE_UPDATE, handler)
    return () => ipcRenderer.off(CH.STATE_UPDATE, handler)
  },

  onToast: (cb: (t: ToastPayload) => void): (() => void) => {
    const handler = (_e: unknown, t: ToastPayload): void => cb(t)
    ipcRenderer.on(CH.TOAST, handler)
    return () => ipcRenderer.off(CH.TOAST, handler)
  },

  onModeChange: (cb: (mode: WindowMode) => void): (() => void) => {
    const handler = (_e: unknown, p: { mode: WindowMode }): void => cb(p.mode)
    ipcRenderer.on(CH.WINDOW_MODE, handler)
    return () => ipcRenderer.off(CH.WINDOW_MODE, handler)
  },

  refreshNow: (accountId?: string): Promise<RefreshResult> =>
    ipcRenderer.invoke(CH.REFRESH_NOW, { accountId }),

  accounts: {
    list: (): Promise<AccountConfig[]> => ipcRenderer.invoke(CH.ACCOUNTS_LIST),
    probe: (configDir: string): Promise<ProbeResult | null> =>
      ipcRenderer.invoke(CH.ACCOUNTS_PROBE, { configDir }),
    suggest: (): Promise<AccountSuggestion[]> => ipcRenderer.invoke(CH.ACCOUNTS_SUGGEST),
    pickDir: (): Promise<string | null> => ipcRenderer.invoke(CH.ACCOUNTS_PICK_DIR),
    add: (input: AddAccountInput): Promise<MutationResult> => ipcRenderer.invoke(CH.ACCOUNTS_ADD, input),
    update: (id: string, patch: Partial<AccountConfig>): Promise<MutationResult> =>
      ipcRenderer.invoke(CH.ACCOUNTS_UPDATE, { id, patch }),
    remove: (id: string): Promise<MutationResult> => ipcRenderer.invoke(CH.ACCOUNTS_REMOVE, { id }),
  },

  settings: {
    get: (): Promise<PublicSettings> => ipcRenderer.invoke(CH.SETTINGS_GET),
    set: (patch: Record<string, unknown>): Promise<PublicSettings> =>
      ipcRenderer.invoke(CH.SETTINGS_SET, { patch }),
  },

  window: {
    setMode: (mode: WindowMode): Promise<void> => ipcRenderer.invoke(CH.WINDOW_SET_MODE, { mode }),
    setHeight: (height: number): Promise<void> =>
      ipcRenderer.invoke(CH.WINDOW_SET_HEIGHT, { height }),
    setAlwaysOnTop: (value: boolean): Promise<void> =>
      ipcRenderer.invoke(CH.WINDOW_SET_ALWAYS_ON_TOP, { value }),
    hide: (): Promise<void> => ipcRenderer.invoke(CH.WINDOW_HIDE),
    quit: (): Promise<void> => ipcRenderer.invoke(CH.WINDOW_QUIT),
  },

  openExternal: (url: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(CH.SHELL_OPEN_EXTERNAL, { url }),

  exportDiagnostics: (): Promise<string> => ipcRenderer.invoke(CH.DIAG_EXPORT),
}

contextBridge.exposeInMainWorld('claudeMonitor', api)

export type ClaudeMonitorApi = typeof api
