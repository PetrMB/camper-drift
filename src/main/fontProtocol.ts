import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { isAbsolute, join, normalize, resolve } from 'node:path'
import { log } from './log'

/**
 * Font SKODA Next je licencovaný a v repu není. Kdo ho má, ukáže na složku
 * s .woff2 soubory v nastavení a widget je načte přes vlastní schéma cmfont://.
 * Bez toho se použije Segoe UI — layout je na to připravený.
 */
export function registerFontScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'cmfont', privileges: { standard: false, secure: true, supportFetchAPI: true } },
  ])
}

export function handleFontScheme(fontDir: string | null): void {
  protocol.handle('cmfont', async (request) => {
    if (!fontDir) return new Response(null, { status: 404 })

    const name = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, '') || request.url.replace('cmfont://', ''))
    // Servírujeme výhradně z nastavené složky — žádné ../ ven.
    if (!/^[A-Za-z0-9._-]+\.(woff2?|ttf)$/.test(name)) {
      return new Response(null, { status: 400 })
    }

    const base = resolve(fontDir)
    const target = normalize(join(base, name))
    if (!isAbsolute(target) || !target.startsWith(base)) {
      return new Response(null, { status: 403 })
    }

    try {
      return await net.fetch(pathToFileURL(target).toString())
    } catch {
      log.debug('fontProtocol: soubor nenalezen', name)
      return new Response(null, { status: 404 })
    }
  })
}
