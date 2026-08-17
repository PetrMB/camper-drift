export interface Bar {
  el: HTMLElement
  update(utilization: number | null, color: string): void
}

export function createBar(thick = false): Bar {
  const el = document.createElement('div')
  el.className = thick ? 'bar thick' : 'bar'
  el.setAttribute('role', 'img')

  const fill = document.createElement('span')
  fill.style.width = '0%'
  el.append(fill)

  return {
    el,
    update(utilization, color) {
      const pct = utilization === null ? 0 : Math.min(100, Math.max(0, utilization))
      fill.style.width = `${pct}%`
      fill.style.background = color
      el.setAttribute(
        'aria-label',
        utilization === null ? 'Vyčerpání neznámé' : `Vyčerpáno ${Math.round(utilization)} procent`,
      )
    },
  }
}
