/**
 * Vygeneruje .ico ikony (app + 4 stavy trayi) přímo z barev ŠKODA CI.
 * Bez externích závislostí — zapisuje BMP/DIB obrázky do ICO kontejneru.
 *
 *   node build/make-icons.mjs
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

/** Kruh v Emeraldu s prstencem v barvě stavu a facetem v pravém horním rohu. */
function draw(size, accent) {
  // BGRA, řádky zdola nahoru (DIB konvence)
  const px = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  const rOuter = size * 0.46
  const rRing = size * 0.36
  const rInner = size * 0.26

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c
      const dy = y - c
      const dist = Math.sqrt(dx * dx + dy * dy)

      let color = null
      let alpha = 0

      if (dist <= rOuter) {
        color = EMERALD
        alpha = 255
      }
      if (dist <= rRing && dist >= rInner) {
        // Prstenec končí v 300° — vizuální ozvěna widgetu.
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI
        const norm = (angle + 90 + 360) % 360
        if (norm <= 300) color = accent
      }
      // Facet: úhlový řez v pravém horním rohu (~22°).
      if (dist <= rOuter && y < size * 0.34 && x > size * 0.52 + (size * 0.34 - y) * 2.4) {
        color = accent
      }

      const flippedY = size - 1 - y
      const o = (flippedY * size + x) * 4
      if (color) {
        px[o] = color[2]
        px[o + 1] = color[1]
        px[o + 2] = color[0]
        px[o + 3] = alpha
      }
    }
  }
  return px
}

function dib(size, pixels) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(size, 4)
  header.writeInt32LE(size * 2, 8) // výška = 2× kvůli AND masce
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(pixels.length, 20)
  const mask = Buffer.alloc(((size + 31) >> 5) * 4 * size)
  return Buffer.concat([header, pixels, mask])
}

function ico(sizes) {
  const images = sizes.map(({ size, accent }) => dib(size, draw(size, accent)))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  const entries = []
  let offset = 6 + images.length * 16
  images.forEach((image, i) => {
    const e = Buffer.alloc(16)
    const size = sizes[i].size
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt8(0, 2)
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(image.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += image.length
  })

  return Buffer.concat([header, ...entries, ...images])
}

const variants = {
  'icon': ELECTRIC,
  'tray-ok': ELECTRIC,
  'tray-warn': ORANGE,
  'tray-critical': RED,
  'tray-error': STEEL,
}

for (const [name, accent] of Object.entries(variants)) {
  const sizes = name === 'icon' ? [16, 24, 32, 48, 64, 128, 256] : [16, 24, 32, 48]
  writeFileSync(join(OUT, `${name}.ico`), ico(sizes.map((size) => ({ size, accent }))))
  process.stdout.write(`${name}.ico\n`)
}
