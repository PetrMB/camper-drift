/**
 * Ořez zbytečností z napakovaného Electronu.
 *
 * Co se NEmaže a proč:
 *  - vk_swiftshader.dll / libvulkan.dll — softwarové vykreslování. Přesně na to
 *    padá Chromium na strojích bez GPU akcelerace (a na to je i přepínač
 *    ui.disableGpu v nastavení). Bez nich by widget na některých firemních
 *    strojích zůstal černý.
 *  - ffmpeg.dll — aplikace sice žádné médium nepřehrává, ale Chromium si ho
 *    tahá při startu a bez něj umí spadnout. Ušetřené ~2,5 MB za to nestojí.
 */
const { existsSync, readdirSync, rmSync, statSync } = require('node:fs')
const { join } = require('node:path')

/** Ponecháme jen tyhle jazyky; ostatní .pak soubory jdou pryč. */
const KEEP_LOCALES = new Set(['en-US.pak'])

exports.default = async function afterPack(context) {
  const out = context.appOutDir
  let freed = 0

  const localesDir = join(out, 'locales')
  if (existsSync(localesDir)) {
    for (const name of readdirSync(localesDir)) {
      if (KEEP_LOCALES.has(name)) continue
      const path = join(localesDir, name)
      freed += statSync(path).size
      rmSync(path)
    }
  }

  // Licenční texty Chromia — zůstávají v repozitáři, v .exe je nepotřebujeme.
  for (const name of ['LICENSES.chromium.html', 'LICENSE.electron.txt']) {
    const path = join(out, name)
    if (!existsSync(path)) continue
    freed += statSync(path).size
    rmSync(path)
  }

  process.stdout.write(`afterPack: uvolněno ${(freed / 1024 / 1024).toFixed(1)} MB\n`)
}
