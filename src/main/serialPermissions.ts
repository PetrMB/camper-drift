import type { BrowserWindow } from 'electron'
import { log } from './log'

/**
 * Web Serial je v Chromiu k dispozici, ale Electron ho ve výchozím stavu
 * zamítne — výběr portu i oprávnění si musí aplikace obsloužit sama.
 *
 * Držíme to co nejužší: povolujeme výhradně `serial`, nic jiného.
 */
export function enableSerial(win: BrowserWindow): void {
  const { session } = win.webContents

  session.setPermissionCheckHandler((_wc, permission) => permission === 'serial')
  session.setDevicePermissionHandler((details) => details.deviceType === 'serial')

  // Pozor: `select-serial-port` je událost session, ne webContents.
  session.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault()
    if (portList.length === 0) {
      log.info('serial: žádný port k dispozici')
      callback('')
      return
    }

    // ESP32-S3 se hlásí nativním USB (VID 0x303A = Espressif). Když je na
    // sběrnici, ber ho přednostně — uživatel tak nemusí hádat mezi COM porty.
    const espressif = portList.find((port) => Number(port.vendorId) === 0x303a)
    const chosen = espressif ?? portList[0]
    log.info(`serial: vybrán port ${chosen.portName ?? chosen.portId}`)
    callback(chosen.portId)
  })
}
