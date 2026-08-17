import { formatCountdown } from '../../shared/time'

export interface Countdown {
  el: HTMLElement
  setTarget(resetsAt: string | null): void
  tick(nowMs: number): void
}

/**
 * Odpočet si tiká renderer sám z absolutního času resetu.
 * Přes IPC se nikdy neposílají sekundy — žádný drift, žádný provoz každou vteřinu.
 */
export function createCountdown(className: string): Countdown {
  const el = document.createElement('div')
  el.className = className
  el.textContent = '—'

  let target: number | null = null
  let lastText = ''

  return {
    el,
    setTarget(resetsAt) {
      if (!resetsAt) {
        target = null
        if (lastText !== '—') {
          el.textContent = '—'
          lastText = '—'
        }
        return
      }
      const parsed = Date.parse(resetsAt)
      target = Number.isNaN(parsed) ? null : parsed
    },
    tick(nowMs) {
      const text = target === null ? '—' : formatCountdown(target - nowMs)
      // Přepisujeme jen text node a jen když se opravdu změnil.
      if (text !== lastText) {
        el.textContent = text
        lastText = text
      }
    },
  }
}
