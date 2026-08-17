/**
 * Vyrenderuje widget do PNG bez Electronu — spustí sestavený renderer bundle
 * v Chromiu a podstrčí mu stub window.claudeMonitor s mock snapshotem.
 * Slouží k rychlé vizuální kontrole designu.
 *
 *   npx electron-vite build && node build/preview.mjs
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(ROOT, 'out/renderer')

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : req.url.split('?')[0]
  try {
    const body = await readFile(join(DIST, path))
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
})

await new Promise((r) => server.listen(4173, r))

const NOW = '2026-08-17T12:00:00.000Z'

function account(overrides = {}) {
  return {
    id: 'a1',
    label: 'Osobní',
    kind: 'personal',
    accent: 'electric',
    status: 'ok',
    estimated: false,
    fetchedAt: '2026-08-17T11:57:00.000Z',
    nextPollAt: '2026-08-17T12:03:00.000Z',
    fiveHour: { utilization: 62, resetsAt: '2026-08-17T13:12:00.000Z', source: 'api' },
    sevenDay: { utilization: 41, resetsAt: '2026-08-20T09:00:00.000Z', source: 'api' },
    localBlock: {
      start: '2026-08-17T10:00:00.000Z',
      end: '2026-08-17T15:00:00.000Z',
      tokens: { input: 400000, output: 240000, cacheCreate: 300000, cacheRead: 300000, total: 1240000 },
      costUsd: 3.1,
      messages: 42,
      models: ['claude-sonnet-4'],
    },
    ...overrides,
  }
}

const SCENES = {
  'single-compact': {
    width: 300,
    snapshot: { accounts: [account()], layout: 'single', mode: 'compact' },
  },
  'single-critical': {
    width: 300,
    snapshot: {
      accounts: [
        account({
          fiveHour: { utilization: 97, resetsAt: '2026-08-17T12:12:00.000Z', source: 'api' },
          sevenDay: { utilization: 88, resetsAt: '2026-08-20T09:00:00.000Z', source: 'api' },
        }),
      ],
      layout: 'single',
      mode: 'compact',
    },
  },
  'dual-compact': {
    width: 300,
    snapshot: {
      accounts: [
        account(),
        account({
          id: 'a2',
          label: 'Pracovní',
          kind: 'work',
          accent: 'teal',
          fiveHour: { utilization: 18, resetsAt: '2026-08-17T14:40:00.000Z', source: 'api' },
          sevenDay: { utilization: 27, resetsAt: '2026-08-20T09:00:00.000Z', source: 'api' },
        }),
      ],
      layout: 'multi',
      mode: 'compact',
    },
  },
  'single-expanded': {
    width: 340,
    snapshot: {
      accounts: [
        account({
          sevenDayOpus: { utilization: 22, resetsAt: '2026-08-20T09:00:00.000Z', source: 'api' },
          sevenDaySonnet: { utilization: 47, resetsAt: '2026-08-20T09:00:00.000Z', source: 'api' },
          extraUsage: { enabled: true, usedCredits: 12.4, monthlyLimit: 50, utilization: 24.8 },
        }),
      ],
      layout: 'single',
      mode: 'expanded',
    },
  },
  'token-expired': {
    width: 300,
    snapshot: {
      accounts: [
        account({
          status: 'token-expired',
          statusDetail: 'Token vypršel. Spusť libovolný příkaz v Claude Code, obnoví se sám.',
          estimated: true,
          fiveHour: { utilization: null, resetsAt: '2026-08-17T15:00:00.000Z', source: 'local-estimate' },
          sevenDay: { utilization: null, resetsAt: null, source: 'local-estimate' },
        }),
      ],
      layout: 'single',
      mode: 'compact',
    },
  },
}

// V prostředí s předinstalovaným Chromiem se dá ukázat přímo na binárku.
const executablePath = process.env.CHROMIUM_PATH || undefined
const browser = await chromium.launch(executablePath ? { executablePath } : {})

for (const [name, scene] of Object.entries(SCENES)) {
  const page = await browser.newPage({
    viewport: { width: scene.width, height: 400 },
    deviceScaleFactor: 2,
  })

  const snapshot = {
    ...scene.snapshot,
    theme: 'emerald',
    now: NOW,
    unknownApiKeys: [],
    mock: true,
  }

  await page.addInitScript((snap) => {
    const noop = () => Promise.resolve()
    window.claudeMonitor = {
      getState: () => Promise.resolve(snap),
      onState: () => () => {},
      onToast: () => () => {},
      onModeChange: () => () => {},
      refreshNow: () => Promise.resolve({ ok: true }),
      accounts: {
        list: () => Promise.resolve([]),
        probe: () => Promise.resolve(null),
        suggest: () => Promise.resolve([]),
        pickDir: () => Promise.resolve(null),
        add: () => Promise.resolve({ ok: true }),
        update: () => Promise.resolve({ ok: true }),
        remove: () => Promise.resolve({ ok: true }),
      },
      settings: { get: () => Promise.resolve({}), set: () => Promise.resolve({}) },
      window: {
        setMode: noop,
        // Tady se ověřuje reálná cesta měření výšky: renderer si ji spočítá
        // z obsahu úplně stejně jako v Electronu, jen ji zachytíme.
        setHeight: (h) => {
          window.__cmHeight = h
          return Promise.resolve()
        },
        setAlwaysOnTop: noop,
        hide: noop,
        quit: noop,
      },
      openExternal: () => Promise.resolve({ ok: false }),
      exportDiagnostics: () => Promise.resolve(''),
    }
  }, snapshot)

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => typeof window.__cmHeight === 'number', null, { timeout: 5000 })
  const height = await page.evaluate(() => window.__cmHeight)

  await page.setViewportSize({ width: scene.width, height })
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(ROOT, `build/preview-${name}.png`), omitBackground: true })
  process.stdout.write(`preview-${name}.png  ${scene.width}x${height}\n`)
  await page.close()
}

await browser.close()
server.close()
