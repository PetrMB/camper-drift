/**
 * Vygeneruje .ico ikony (aplikace + 4 stavy trayi) z barev ŠKODA CI.
 * Bez externích závislostí — zapisuje 32bit BGRA obrázky do ICO kontejneru.
 *
 *   node build/make-icons.mjs
 *
 * Motiv je záměrně stejný jako v samotném widgetu: prstenec vyčerpání
 * na Emerald podkladu. Kreslí se 4× zvětšeně a downsampluje, jinak jsou
 * hrany na 16px roztřepené.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))

const EMERALD = [0x0e, 0x3a, 0x2f]
const ELECTRIC = [0x78, 0xfa, 0xae]
const ORANGE = [0xf7, 0xb0, 0x46]
const RED = [0xf1, 0x52, 0x52]
const STEEL = [0xa0, 0xa7, 0xa8]

/** Násobek supersamplingu. 4 = 16 vzorků na pixel, na hrany bohatě stačí. */
const SS = 4

/** Zaoblený čtverec — čitelnější než kruh, když Windows ikonu ještě zmenší. */
function insideRoundedSquare(x, y, size, radius) {
  const min = radius
  const max = size - radius
  const cx = x < min ? min : x > max ? max : x
  const cy = y < min ? min : y > max ? max : y
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

/**
 * Vrátí barvu vzorku, nebo null pro průhledno.
 *
 * Facet se tu záměrně NEKRESLÍ: v rohu se slil s prstencem a celek pak četl
 * jako písmeno Q. ŠKODA facet zůstává ve widgetu, kde má dost místa.
 */
function sample(x, y, size, accent) {
  const radius = size * 0.24
  if (!insideRoundedSquare(x, y, size, radius)) return null

  const cx = size / 2
  const cy = size / 2
  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy)

  const ringOuter = size * 0.36
  const ringInner = size * 0.22

  if (dist <= ringOuter && dist >= ringInner) {
    // Prstenec začíná nahoře a končí v 290° — stejná mezera jako ve widgetu.
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI
    const fromTop = (deg + 90 + 360) % 360
    if (fromTop <= 290) return accent
  }

  return EMERALD
}

function render(size, accent) {
  const px = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let covered = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size, accent)
          if (!c) continue
          r += c[0]
          g += c[1]
          b += c[2]
          covered++
        }
      }

      if (covered === 0) continue
      // DIB má řádky zdola nahoru.
      const o = ((size - 1 - y) * size + x) * 4
      px[o] = Math.round(b / covered)
      px[o + 1] = Math.round(g / covered)
      px[o + 2] = Math.round(r / covered)
      px[o + 3] = Math.round((covered / (SS * SS)) * 255)
    }
  }

  return px
}

function dib(size, pixels) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8) // dvojnásobek kvůli (prázdné) AND masce
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(pixels.length, 20)
  const mask = Buffer.alloc(((size + 31) >> 5) * 4 * size)
  return Buffer.concat([header, pixels, mask])
}

function ico(entries) {
  const images = entries.map((e) => dib(e.size, render(e.size, e.accent)))

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const dir = []
  let offset = 6 + images.length * 16
  images.forEach((image, i) => {
    const size = entries[i].size
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(image.length, 8)
    e.writeUInt32LE(offset, 12)
    dir.push(e)
    offset += image.length
  })

  return Buffer.concat([header, ...dir, ...images])
}

const variants = {
  icon: ELECTRIC,
  'tray-ok': ELECTRIC,
  'tray-warn': ORANGE,
  'tray-critical': RED,
  'tray-error': STEEL,
}

for (const [name, accent] of Object.entries(variants)) {
  const sizes = name === 'icon' ? [16, 24, 32, 48, 64, 128, 256] : [16, 20, 24, 32, 40, 48]
  const entries = sizes.map((size) => ({ size, accent }))
  writeFileSync(join(OUT, `${name}.ico`), ico(entries))
  process.stdout.write(`${name}.ico (${sizes.join(', ')})\n`)
}
