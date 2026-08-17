/**
 * ==========================================================================
 *  Jediné místo, kde se v celé aplikaci řeší certifikáty.
 *
 *  VÝCHOZÍ CHOVÁNÍ: nedělat nic.
 *  `net.request` v main procesu jde přes síťový stack Chromia, který na Windows
 *  používá SYSTÉMOVÉ úložiště certifikátů — přesně tam, kam firemní IT
 *  nainstalovalo Zscaler root. Proto v korporátní síti funguje bez konfigurace.
 *
 *  POZOR NA ROZDÍL: `NODE_EXTRA_CA_CERTS` je mechanismus Node `tls` a na
 *  `net.request` NEMÁ VLIV. Právě kvůli tomu používáme `net` a ne `https`
 *  nebo `undici` — jinak bychom museli řešit CA bundle ručně.
 *
 *  Volitelný fallback `pinned-extra-ca` je pro případ, že by systémové úložiště
 *  nestačilo (např. Zscaler PEM ležící jen v temp adresáři). Ověřování se
 *  NIKDY nevypíná — `ignore-certificate-errors` se v tomto projektu nepoužívá.
 * ==========================================================================
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { session as electronSession, type Session } from 'electron'
import { API_HOST } from '../../shared/constants'
import { log } from '../log'

export type CertMode = 'system' | 'pinned-extra-ca'

export interface NetworkSettings {
  extraCaPemPath: string | null
}

/** Fingerprinty v podobě, jakou používá Chromium: "sha256/<base64>". */
export function pemFingerprints(pem: string): Set<string> {
  const out = new Set<string>()
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? []
  for (const block of blocks) {
    const base64 = block
      .replace(/-----(BEGIN|END) CERTIFICATE-----/g, '')
      .replace(/\s+/g, '')
    try {
      const der = Buffer.from(base64, 'base64')
      out.add(`sha256/${createHash('sha256').update(der).digest('base64')}`)
    } catch {
      /* poškozený blok ignoruj */
    }
  }
  return out
}

export function configureNetwork(settings: NetworkSettings): {
  session: Session
  mode: CertMode
} {
  // Vlastní partition: žádné cookies ani cache sdílené s rendererem.
  const ses = electronSession.fromPartition('cm-net')

  const pemPath = settings.extraCaPemPath ?? process.env.CLAUDEMONITOR_EXTRA_CA ?? null
  if (!pemPath) {
    log.info('netCerts: režim system (systémové úložiště Windows)')
    return { session: ses, mode: 'system' }
  }

  let pinned: Set<string>
  try {
    pinned = pemFingerprints(readFileSync(pemPath, 'utf8'))
  } catch (err) {
    log.warn('netCerts: extra CA se nepodařilo načíst, zůstávám na system', err)
    return { session: ses, mode: 'system' }
  }

  if (pinned.size === 0) {
    log.warn('netCerts: v PEM nebyl žádný certifikát, zůstávám na system')
    return { session: ses, mode: 'system' }
  }

  ses.setCertificateVerifyProc((request, callback) => {
    // -3 = použij výchozí ověření Chromia, 0 = přijmi, -2 = odmítni.
    if (request.hostname !== API_HOST) return callback(-3)
    if (request.errorCode === 0 || request.verificationResult === 'net::OK') return callback(-3)
    const fp = request.certificate?.fingerprint
    if (fp && pinned.has(fp)) {
      log.info('netCerts: přijat pinned extra CA certifikát')
      return callback(0)
    }
    log.warn('netCerts: certifikát odmítnut', request.verificationResult)
    return callback(-2)
  })

  log.info(`netCerts: režim pinned-extra-ca (${pinned.size} cert.)`)
  return { session: ses, mode: 'pinned-extra-ca' }
}
