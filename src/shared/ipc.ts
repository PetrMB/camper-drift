/**
 * Názvy IPC kanálů. Nikde jinde v kódu nesmí být string literál kanálu —
 * ipcRouter registruje výhradně tyhle konstanty.
 */
export const CH = {
  // invoke / handle (renderer -> main)
  STATE_GET: 'cm:state:get',
  REFRESH_NOW: 'cm:refresh:now',
  ACCOUNTS_LIST: 'cm:accounts:list',
  ACCOUNTS_PROBE: 'cm:accounts:probe',
  ACCOUNTS_PICK_DIR: 'cm:accounts:pickDir',
  ACCOUNTS_SUGGEST: 'cm:accounts:suggest',
  ACCOUNTS_ADD: 'cm:accounts:add',
  ACCOUNTS_UPDATE: 'cm:accounts:update',
  ACCOUNTS_REMOVE: 'cm:accounts:remove',
  SETTINGS_GET: 'cm:settings:get',
  SETTINGS_SET: 'cm:settings:set',
  WINDOW_SET_MODE: 'cm:window:setMode',
  WINDOW_SET_HEIGHT: 'cm:window:setHeight',
  WINDOW_SET_ALWAYS_ON_TOP: 'cm:window:setAlwaysOnTop',
  WINDOW_HIDE: 'cm:window:hide',
  WINDOW_QUIT: 'cm:window:quit',
  SHELL_OPEN_EXTERNAL: 'cm:shell:openExternal',
  DIAG_EXPORT: 'cm:diag:export',

  // push (main -> renderer)
  STATE_UPDATE: 'cm:state:update',
  TOAST: 'cm:toast',
  WINDOW_MODE: 'cm:window:mode',
} as const

export type Channel = (typeof CH)[keyof typeof CH]

export type RefreshResult = { ok: true } | { ok: false; reason: 'cooldown' | 'unknown-account' }
export type MutationResult = { ok: true; id?: string } | { ok: false; error: string }
