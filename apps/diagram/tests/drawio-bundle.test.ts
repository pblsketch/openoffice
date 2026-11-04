// The draw.io intake (vendor/drawio/bundle.mjs): removal list, hash pinning,
// the approved cut of js/extensions.min.js and the bundle license inventory.
// No network: downloads go through a fake fetch.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const root = join(__dirname, '../../..')

interface Config {
  version: string
  url: string
  sha256: string
  remove: string[]
  cut: { file: string; pieces: string[]; sha256: string }[]
}
interface Component {
  name: string
  license: string
  offered?: string
  files: string[]
}
interface Inventory {
  components: Component[]
}
interface Bundle {
  globToRegExp(pattern: string): RegExp
  isRemoved(path: string, config: Config): boolean
  sha256(bytes: Buffer): string
  verifySha256(bytes: Buffer, expected: string, label: string): void
  isSafeEntryName(name: string): boolean
  cutPieces(
    target: Buffer,
    pieces: { name: string; bytes: Buffer }[],
    label?: string,
  ): { bytes: Buffer; ranges: { name: string; offset: number; length: number }[] }
  checkInventory(args: {
    releaseFiles: string[]
    shippedFiles: string[]
    inventory: Inventory
    config: Config
    isAllowed: (expr: string) => boolean
  }): string[]
  ensureWar(args: {
    config: Config
    cacheDir: string
    fetchImpl: (url: string) => Promise<Response>
    log?: (msg: string) => void
  }): Promise<{ path: string; bytes: Buffer }>
  cachedWarPath(config: Config, cacheDir: string): string
  loadConfig(): Config
  loadInventory(): Inventory
}

const load = async () =>
  (await import(pathToFileURL(join(root, 'vendor/drawio/bundle.mjs')).href)) as Bundle
const loadAllowlist = async () =>
  (await import(pathToFileURL(join(root, 'tools/license-allowlist.mjs')).href)) as {
    isAllowed(expr: string): boolean
  }

const scratch: string[] = []
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'drawio-bundle-test-'))
  scratch.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const okResponse = (bytes: Buffer) =>
  ({ ok: true, status: 200, arrayBuffer: async () => bytes }) as unknown as Response

describe('removal list', () => {
  it('drops the listed release parts and keeps the editor', async () => {
    const { isRemoved, loadConfig } = await load()
    const config = loadConfig()
    for (const f of [
      'WEB-INF/lib/drawio.jar',
      'META-INF/MANIFEST.MF',
      'js/diagramly/App.js',
      'js/grapheditor/Graph.js',
      'js/plantuml/drawio-plantuml.min.js',
      'js/libavoid-js/libavoid.min.js',
      'js/elk/drawio-elk.min.js',
      'js/integrate.min.js',
      'js/viewer.min.js',
      'connect/common/js/mxReader.js',
      'teams.html',
      'onedrive3.html',
      'js/onedrive/OneDrive.js',
      'service-worker.js',
      'service-worker.js.map',
      'workbox-05b6c01b.js',
      'js/deflate/base64.js',
      'images/glyphicons_google.png',
    ]) {
      expect(isRemoved(f, config), f).toBe(true)
    }
    for (const f of [
      'index.html',
      'js/app.min.js',
      'js/extensions.min.js',
      'js/viewer-static.min.js',
      'js/mermaid/drawio-mermaid.min.js',
      'js/deflate/pako.min.js',
      'images/google-drive-logo.svg',
      'img/lib/azure2/identity/AAD_Licenses.svg',
      'templates/LICENSE',
    ]) {
      expect(isRemoved(f, config), f).toBe(false)
    }
  })

  it('matches * inside one folder and ** across folders', async () => {
    const { globToRegExp } = await load()
    expect(globToRegExp('service-worker*').test('service-worker.js')).toBe(true)
    expect(globToRegExp('service-worker*').test('js/service-worker.js')).toBe(false)
    expect(globToRegExp('js/elk/**').test('js/elk/a/b.js')).toBe(true)
    expect(globToRegExp('js/elk/**').test('js/elkx/a.js')).toBe(false)
    expect(globToRegExp('images/glyphicons_*.png').test('images/glyphicons_star.png')).toBe(true)
    expect(globToRegExp('js/app.min.js').test('js/appXmin.js')).toBe(false)
  })

  it('never ships the files the cut takes out of extensions.min.js', async () => {
    const { isRemoved, loadConfig } = await load()
    const config = loadConfig()
    expect(config.cut.map((c) => c.file)).toEqual(['js/extensions.min.js'])
    expect(config.cut[0].pieces).toEqual([
      'js/elk/drawio-elk.min.js',
      'js/libavoid-js/libavoid.min.js',
      'js/libavoid-js/libavoid-routing.js',
    ])
    for (const piece of config.cut[0].pieces) expect(isRemoved(piece, config)).toBe(true)
    expect(isRemoved(config.cut[0].file, config)).toBe(false)
  })
})

describe('hash pinning', () => {
  it('accepts the pinned bytes and rejects anything else', async () => {
    const { sha256, verifySha256 } = await load()
    const bytes = Buffer.from('draw.war bytes')
    expect(() => verifySha256(bytes, sha256(bytes), 'war')).not.toThrow()
    expect(() => verifySha256(bytes, sha256(Buffer.from('other')), 'war')).toThrow(
      /SHA-256 mismatch/,
    )
  })

  it('fails a download whose hash does not match and caches nothing', async () => {
    const { ensureWar, cachedWarPath, loadConfig, sha256 } = await load()
    const cacheDir = tempDir()
    const config = { ...loadConfig(), sha256: sha256(Buffer.from('the real release')) }
    const fetchImpl = vi.fn(async () => okResponse(Buffer.from('tampered release')))
    await expect(ensureWar({ config, cacheDir, fetchImpl, log: () => {} })).rejects.toThrow(
      /SHA-256 mismatch/,
    )
    expect(fetchImpl).toHaveBeenCalledWith(config.url, { redirect: 'follow' })
    expect(existsSync(cachedWarPath(config, cacheDir))).toBe(false)
  })

  it('fails on an HTTP error', async () => {
    const { ensureWar, loadConfig } = await load()
    const fetchImpl = async () => ({ ok: false, status: 404 }) as unknown as Response
    await expect(
      ensureWar({ config: loadConfig(), cacheDir: tempDir(), fetchImpl, log: () => {} }),
    ).rejects.toThrow(/HTTP 404/)
  })

  it('caches a verified download and never downloads again', async () => {
    const { ensureWar, cachedWarPath, loadConfig, sha256 } = await load()
    const cacheDir = tempDir()
    const bytes = Buffer.from('the real release')
    const config = { ...loadConfig(), sha256: sha256(bytes) }
    const fetchImpl = vi.fn(async () => okResponse(bytes))
    await ensureWar({ config, cacheDir, fetchImpl, log: () => {} })
    expect(readFileSync(cachedWarPath(config, cacheDir))).toEqual(bytes)
    const again = await ensureWar({ config, cacheDir, fetchImpl, log: () => {} })
    expect(again.bytes).toEqual(bytes)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects a cached file that no longer matches the pin, without downloading', async () => {
    const { ensureWar, cachedWarPath, loadConfig, sha256 } = await load()
    const cacheDir = tempDir()
    const config = { ...loadConfig(), sha256: sha256(Buffer.from('pinned')) }
    const cached = cachedWarPath(config, cacheDir)
    mkdirSync(join(cached, '..'), { recursive: true })
    writeFileSync(cached, 'corrupted')
    const fetchImpl = vi.fn()
    await expect(ensureWar({ config, cacheDir, fetchImpl, log: () => {} })).rejects.toThrow(
      /Delete .* to download it again/,
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('cutting standalone files out of a bundle', () => {
  const piece = (name: string, text: string) => ({ name, bytes: Buffer.from(text) })

  it('removes each piece and keeps every other byte in order', async () => {
    const { cutPieces } = await load()
    const target = Buffer.from('head;ELK();mid;AVOID();ROUTE();tail')
    const { bytes, ranges } = cutPieces(target, [
      piece('elk', 'ELK();'),
      piece('avoid', 'AVOID();'),
      piece('route', 'ROUTE();'),
    ])
    expect(bytes.toString()).toBe('head;mid;tail')
    expect(ranges).toEqual([
      { name: 'elk', offset: 5, length: 6 },
      { name: 'avoid', offset: 15, length: 8 },
      { name: 'route', offset: 23, length: 8 },
    ])
  })

  it('fails when a piece is not in the bundle (e.g. after a draw.io upgrade)', async () => {
    const { cutPieces } = await load()
    expect(() =>
      cutPieces(Buffer.from('head;tail'), [piece('js/elk/drawio-elk.min.js', 'ELK')], 'ext'),
    ).toThrow(/js\/elk\/drawio-elk\.min\.js were not found/)
  })

  it('fails when a piece occurs twice or pieces overlap', async () => {
    const { cutPieces } = await load()
    expect(() => cutPieces(Buffer.from('AB-AB'), [piece('ab', 'AB')])).toThrow(/more than once/)
    expect(() => cutPieces(Buffer.from('xABCx'), [piece('ab', 'AB'), piece('bc', 'BC')])).toThrow(
      /overlap/,
    )
  })
})

describe('bundle license inventory', () => {
  const config = (remove: string[]): Config => ({
    version: 'v0',
    url: 'u',
    sha256: 's',
    remove,
    cut: [],
  })
  const isAllowed = (expr: string) => ['MIT', 'Apache-2.0'].includes(expr)

  it('passes when every shipped file is covered by an allowlisted component', async () => {
    const { checkInventory } = await load()
    const problems = checkInventory({
      releaseFiles: ['index.html', 'js/a.js', 'js/elk/elk.js'],
      shippedFiles: ['index.html', 'js/a.js'],
      inventory: {
        components: [
          { name: 'draw.io', license: 'Apache-2.0', files: ['index.html', 'js/a.js'] },
          { name: 'lib', license: 'MIT', offered: 'MIT OR GPL-3.0-or-later', files: ['js/a.js'] },
        ],
      },
      config: config(['js/elk/**']),
      isAllowed,
    })
    expect(problems).toEqual([])
  })

  it('reports a shipped file no component covers', async () => {
    const { checkInventory } = await load()
    const problems = checkInventory({
      releaseFiles: ['index.html', 'js/new.js'],
      shippedFiles: ['index.html', 'js/new.js'],
      inventory: { components: [{ name: 'draw.io', license: 'MIT', files: ['index.html'] }] },
      config: config([]),
      isAllowed,
    })
    expect(problems).toEqual(['not covered by vendor/drawio/inventory.json: js/new.js'])
  })

  it('reports a license off the allowlist and a dual-license branch not offered', async () => {
    const { checkInventory } = await load()
    const problems = checkInventory({
      releaseFiles: ['a.js', 'b.js'],
      shippedFiles: ['a.js', 'b.js'],
      inventory: {
        components: [
          { name: 'elk', license: 'EPL-2.0', files: ['a.js'] },
          { name: 'odd', license: 'Apache-2.0', offered: 'MIT OR GPL-3.0', files: ['b.js'] },
        ],
      },
      config: config([]),
      isAllowed,
    })
    expect(problems).toEqual([
      'elk: license EPL-2.0 is not on the allowlist',
      'odd: chosen license Apache-2.0 is not offered by "MIT OR GPL-3.0"',
    ])
  })

  it('reports a removed file that would ship and stale patterns', async () => {
    const { checkInventory } = await load()
    const problems = checkInventory({
      releaseFiles: ['index.html', 'teams.html'],
      shippedFiles: ['index.html', 'teams.html'],
      inventory: {
        components: [{ name: 'draw.io', license: 'MIT', files: ['*.html', 'gone/**'] }],
      },
      config: config(['teams.html', 'connect/**']),
      isAllowed,
    })
    expect(problems).toEqual([
      'removed file would ship: teams.html',
      'draw.io: pattern matches no shipped file: gone/**',
      'removal pattern matches no release file: connect/**',
    ])
  })

  it('lists only allowlisted licenses, choosing an offered branch of every dual license', async () => {
    const { loadInventory } = await load()
    const { isAllowed: allowed } = await loadAllowlist()
    for (const c of loadInventory().components) {
      expect(allowed(c.license), `${c.name}: ${c.license}`).toBe(true)
      if (c.offered) expect(c.offered.split(' OR ')).toContain(c.license)
    }
  })
})

describe('zip entry names', () => {
  it('rejects names that leave the output folder', async () => {
    const { isSafeEntryName } = await load()
    expect(isSafeEntryName('js/app.min.js')).toBe(true)
    for (const bad of ['../x', 'a/../../x', '/etc/x', 'C:/x', 'a\\b', '', 'a/./b']) {
      expect(isSafeEntryName(bad), bad).toBe(false)
    }
  })
})
