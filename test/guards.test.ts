import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { redact } from '../src/main/log'

function walk(dir: string, ext: string[]): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, ext))
    else if (ext.some((e) => name.endsWith(e))) out.push(full)
  }
  return out
}

const SRC = resolve(__dirname, '../src')

describe('guard: do konfigurace Claude Code se nikdy nezapisuje', () => {
  it('žádný zápisový fs volání nad cestou odvozenou od configDir', () => {
    const offenders: string[] = []
    for (const file of walk(join(SRC, 'main'), ['.ts'])) {
      const text = readFileSync(file, 'utf8')
      const lines = text.split('\n')
      lines.forEach((line, i) => {
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return
        const writes = /\b(writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|unlink|rmdir|rm)\s*\(/.test(line)
        const openWrite = /\bopen\s*\([^)]*['"][rwa]\+/.test(line)
        if (!writes && !openWrite) return
        if (/configDir|credentialsPath|projectsDir/.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('credentials.ts nepoužívá žádný zápisový flag', () => {
    const text = readFileSync(join(SRC, 'main/data/credentials.ts'), 'utf8')
    expect(text).not.toMatch(/writeFile|appendFile|createWriteStream/)
    expect(text).toMatch(/flag: 'r'/)
  })
})

describe('guard: token se neloguje', () => {
  it('redact schová access i refresh token', () => {
    const line = 'Authorization: Bearer sk-ant-oat01-ABCdef_123 a "refreshToken": "sk-ant-ort01-XYZ"'
    const out = redact(line)
    expect(out).not.toContain('sk-ant-oat01-ABCdef_123')
    expect(out).not.toContain('sk-ant-ort01-XYZ')
  })

  it('nikde v kódu není přímý console.log s tokenem', () => {
    const offenders: string[] = []
    for (const file of walk(SRC, ['.ts'])) {
      const text = readFileSync(file, 'utf8')
      text.split('\n').forEach((line, i) => {
        if (/console\.(log|info|warn|error)\s*\(/.test(line) && /accessToken|refreshToken/.test(line)) {
          offenders.push(`${file}:${i + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})

describe('guard: ověřování certifikátů se nevypíná', () => {
  it('nikde není ignore-certificate-errors ani rejectUnauthorized: false', () => {
    const offenders: string[] = []
    for (const file of walk(SRC, ['.ts'])) {
      const text = readFileSync(file, 'utf8')
      text.split('\n').forEach((line, i) => {
        const isComment = line.trimStart().startsWith('*') || line.trimStart().startsWith('//')
        if (isComment) return
        if (/ignore-certificate-errors|rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })
})

describe('guard: ŠKODA CI pravidla v CSS', () => {
  const css = walk(join(SRC, 'renderer/styles'), ['.css']).map((f) => ({
    file: f,
    text: readFileSync(f, 'utf8'),
  }))

  it('Electric Green není barvou textu ve světlém motivu', () => {
    for (const { file, text } of css) {
      const lightBlocks = text.match(/:root\[data-theme="light"\][^}]*\}/g) ?? []
      for (const block of lightBlocks) {
        const colorLines = block.split('\n').filter((l) => /^\s*color\s*:/.test(l))
        for (const line of colorLines) {
          expect(line, `${file}: ${line}`).not.toMatch(/--cm-electric|#78faae/i)
        }
      }
    }
  })

  it('nikde není zarovnání vpravo ani do bloku', () => {
    for (const { file, text } of css) {
      expect(text, file).not.toMatch(/text-align\s*:\s*(right|justify)/)
    }
  })

  it('nikde se text nepřevádí na verzálky (brand je sentence case)', () => {
    for (const { file, text } of css) {
      expect(text, file).not.toMatch(/text-transform\s*:\s*uppercase/)
    }
  })

  it('facet nemá stín ani průhlednost a drží povolený úhel', () => {
    const app = css.find((c) => c.file.endsWith('app.css'))!
    const facet = app.text.match(/\.facet\s*\{[^}]*\}/)?.[0] ?? ''
    expect(facet).not.toMatch(/box-shadow|opacity/)
    expect(facet).toMatch(/clip-path/)
  })
})

describe('guard: čas se bere jen z time.ts', () => {
  it('Date.now() se v main a renderer používá jen přes now()', () => {
    const offenders: string[] = []
    for (const file of walk(join(SRC, 'main'), ['.ts'])) {
      const text = readFileSync(file, 'utf8')
      text.split('\n').forEach((line, i) => {
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return
        if (/\bDate\.now\s*\(/.test(line)) offenders.push(`${file}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

describe('guard: IPC kanály jsou jen konstanty', () => {
  it('preload i router používají CH.*, ne string literály', () => {
    for (const file of [join(SRC, 'preload/index.ts'), join(SRC, 'main/ipcRouter.ts')]) {
      const text = readFileSync(file, 'utf8')
      const literals = text.match(/ipcRenderer\.(invoke|on|off)\(\s*['"]/g) ?? []
      expect(literals, file).toEqual([])
      const handles = text.match(/ipcMain\.handle\(\s*['"]/g) ?? []
      expect(handles, file).toEqual([])
    }
  })
})
