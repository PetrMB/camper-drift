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
    size: { width: 300, height: 156 },
    snapshot: { accounts: [account()], layout: 'single', mode: 'compact' },
  },
  'single-critical': {
    size: { width: 300, height: 156 },
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
    size: { width: 300, height: 298 },
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
    size: { width: 340, height: 362 },
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
    size: { width: 300, height: 192 },
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
    viewport: scene.size,
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
      window: { setMode: noop, setAlwaysOnTop: noop, hide: noop, quit: noop },
      openExternal: () => Promise.resolve({ ok: false }),
      exportDiagnostics: () => Promise.resolve(''),
    }
  }, snapshot)

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(ROOT, `build/preview-${name}.png`), omitBackground: true })
  process.stdout.write(`preview-${name}.png\n`)
  await page.close()
}

await browser.close()
server.close()
