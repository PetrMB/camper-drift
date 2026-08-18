import type { AppSnapshot, AccountSnapshot, WindowUsage } from '../shared/types'

/*
 * Odesílání dat na ESP32 displej přes Web Serial.
 *
 * Proč Web Serial a ne knihovna `serialport`: ta je nativní modul, musel by se
 * rebuildovat proti ABI Electronu a rozbila by to, že projekt nemá jedinou
 * runtime závislost a balí se bez nativních modulů. Web Serial je přímo
 * v Chromiu, takže nestojí nic.
 */

// Minimální typy Web Serial — DOM lib je zatím neobsahuje a kvůli tomuhle
// nemá smysl tahat do projektu @types/w3c-web-serial.
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  readonly writable: WritableStream<Uint8Array> | null
}
interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>
  requestPort(): Promise<SerialPortLike>
  addEventListener(type: 'disconnect', listener: () => void): void
}

function serialApi(): SerialLike | null {
  const api = (navigator as unknown as { serial?: SerialLike }).serial
  return api ?? null
}

export function isSupported(): boolean {
  return serialApi() !== null
}

export type LinkStatus = 'off' | 'connecting' | 'connected' | 'error'

/**
 * Displej používá font bez diakritiky, takže háčky a čárky shodíme tady,
 * kde máme plný Unicode, a deska zůstane hloupá.
 */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function windowPayload(usage: WindowUsage | undefined): Record<string, unknown> | null {
  if (!usage) return null
  return {
    utilization: usage.utilization,
    resetsAt: usage.resetsAt === null ? null : Date.parse(usage.resetsAt),
    source: usage.source === 'local-estimate' ? 'estimate' : 'api',
  }
}

function accountPayload(account: AccountSnapshot): Record<string, unknown> {
  return {
    label: fold(account.label),
    accent: account.accent,
    status: account.status,
    estimated: account.estimated,
    // Displej má na hlášku jeden řádek, delší text by stejně nevykreslil.
    detail: fold(account.statusDetail ?? '').slice(0, 60),
    fiveHour: windowPayload(account.fiveHour),
    sevenDay: windowPayload(account.sevenDay),
  }
}

export function buildPayload(snapshot: AppSnapshot): string {
  return `${JSON.stringify({
    now: Date.parse(snapshot.now),
    accounts: snapshot.accounts.map(accountPayload),
  })}\n`
}

export class SerialLink {
  private port: SerialPortLike | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private status: LinkStatus = 'off'
  private lastPayload = ''

  constructor(private onStatus: (status: LinkStatus, message?: string) => void) {
    serialApi()?.addEventListener('disconnect', () => {
      if (this.status === 'off') return
      void this.disconnect()
      this.setStatus('error', 'Displej byl odpojen')
    })
  }

  getStatus(): LinkStatus {
    return this.status
  }

  private setStatus(status: LinkStatus, message?: string): void {
    this.status = status
    this.onStatus(status, message)
  }

  /** Připojí se k dřív povolenému portu bez dialogu. Volá se po startu. */
  async reconnect(): Promise<boolean> {
    const api = serialApi()
    if (!api) return false
    const ports = await api.getPorts()
    if (ports.length === 0) return false
    return this.open(ports[0])
  }

  /** Vyžádá si port od uživatele — musí běžet z kliknutí, jinak Chromium odmítne. */
  async connect(): Promise<boolean> {
    const api = serialApi()
    if (!api) {
      this.setStatus('error', 'Web Serial není v tomto sestavení dostupný')
      return false
    }
    try {
      const port = await api.requestPort()
      return this.open(port)
    } catch {
      // Uživatel dialog zavřel — to není chyba.
      this.setStatus('off')
      return false
    }
  }

  private async open(port: SerialPortLike): Promise<boolean> {
    this.setStatus('connecting')
    try {
      await port.open({ baudRate: 115200 })
      if (!port.writable) throw new Error('port nelze zapisovat')
      this.port = port
      this.writer = port.writable.getWriter()
      this.lastPayload = ''
      this.setStatus('connected')
      return true
    } catch (err) {
      this.port = null
      this.writer = null
      this.setStatus('error', err instanceof Error ? err.message : 'port se nepodařilo otevřít')
      return false
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.writer?.close()
    } catch {
      /* port už mohl zmizet */
    }
    try {
      await this.port?.close()
    } catch {
      /* dtto */
    }
    this.writer = null
    this.port = null
    this.setStatus('off')
  }

  async send(snapshot: AppSnapshot): Promise<void> {
    if (!this.writer) return
    const payload = buildPayload(snapshot)
    // `now` se mění pokaždé, ale zbytek ne — posílat identická data nemá smysl.
    const withoutNow = payload.replace(/"now":\d+,/, '')
    if (withoutNow === this.lastPayload) return
    this.lastPayload = withoutNow

    try {
      await this.writer.write(new TextEncoder().encode(payload))
    } catch (err) {
      this.writer = null
      this.port = null
      this.setStatus('error', err instanceof Error ? err.message : 'zápis selhal')
    }
  }
}
