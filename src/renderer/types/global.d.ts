import type { ClaudeMonitorApi } from '../../preload/index'

declare global {
  interface Window {
    claudeMonitor: ClaudeMonitorApi
  }
}

export {}
