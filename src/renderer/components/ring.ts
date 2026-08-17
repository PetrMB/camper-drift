const SVG_NS = 'http://www.w3.org/2000/svg'

export interface Ring {
  el: SVGSVGElement
  update(utilization: number | null, color: string): void
}

/**
 * Prstenec vyčerpání. Kreslí se inline SVG, aby se dal plynule animovat
 * přes stroke-dashoffset s přirozenou motion křivkou ze ŠKODA CI.
 */
export function createRing(size: number, strokeWidth: number): Ring {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'ring')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
  svg.setAttribute('role', 'img')

  const track = document.createElementNS(SVG_NS, 'circle')
  track.setAttribute('class', 'track')
  track.setAttribute('cx', String(size / 2))
  track.setAttribute('cy', String(size / 2))
  track.setAttribute('r', String(radius))
  track.setAttribute('stroke-width', String(strokeWidth))

  const value = document.createElementNS(SVG_NS, 'circle')
  value.setAttribute('class', 'value')
  value.setAttribute('cx', String(size / 2))
  value.setAttribute('cy', String(size / 2))
  value.setAttribute('r', String(radius))
  value.setAttribute('stroke-width', String(strokeWidth))
  value.setAttribute('stroke-dasharray', String(circumference))
  value.setAttribute('stroke-dashoffset', String(circumference))

  const text = document.createElementNS(SVG_NS, 'text')
  text.setAttribute('class', 'pct')
  text.setAttribute('x', String(size / 2))
  text.setAttribute('y', String(size / 2 + 1))
  text.setAttribute('font-size', String(Math.round(size * 0.28)))

  svg.append(track, value, text)

  return {
    el: svg,
    update(utilization, color) {
      const pct = utilization === null ? 0 : Math.min(100, Math.max(0, utilization))
      value.setAttribute('stroke-dashoffset', String(circumference * (1 - pct / 100)))
      value.style.stroke = color
      text.textContent = utilization === null ? '—' : `${Math.round(utilization)}%`
      svg.setAttribute(
        'aria-label',
        utilization === null ? 'Vyčerpání neznámé' : `Vyčerpáno ${Math.round(utilization)} procent`,
      )
    },
  }
}
