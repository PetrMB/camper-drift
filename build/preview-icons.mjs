/**
 * Vyrenderuje vygenerované .ico soubory do jednoho PNG, aby šlo očima ověřit,
 * jak ikona vypadá ve velikostech, ve kterých ji Windows opravdu použije.
 *
 *   node build/make-icons.mjs && node build/preview-icons.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = join(ROOT, 'build')

const ICONS = ['icon', 'tray-ok', 'tray-warn', 'tray-critical', 'tray-error']
const SIZES = [16, 24, 32, 48, 128]

const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:20px;
  background:#8ab4dd;font:13px 'Segoe UI',system-ui,sans-serif;color:#0b2239">
${ICONS.map(
  (name) => `<div style="display:flex;align-items:flex-end;gap:18px;margin-bottom:16px">
  <div style="width:110px">${name}</div>
  ${SIZES.map(
    (s) =>
      `<img src="/${name}.ico" width="${s}" height="${s}" style="image-rendering:auto">`,
  ).join('')}
</div>`,
).join('')}
</body>`

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0]
  if (path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }
  try {
    const body = await readFile(join(BUILD, path))
    res.writeHead(200, {
      'Content-Type': extname(path) === '.ico' ? 'image/x-icon' : 'application/octet-stream',
    })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
})

await new Promise((r) => server.listen(4174, r))

const executablePath = process.env.CHROMIUM_PATH || undefined
const browser = await chromium.launch(executablePath ? { executablePath } : {})
const page = await browser.newPage({ viewport: { width: 560, height: 300 }, deviceScaleFactor: 2 })
await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' })
await page.screenshot({ path: join(BUILD, 'preview-icons.png'), fullPage: true })
process.stdout.write('preview-icons.png\n')

await browser.close()
server.close()
