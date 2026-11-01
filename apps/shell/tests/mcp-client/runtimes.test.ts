import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MCP_RUNTIME_PINS,
  mcpRuntimePlatformKey,
  type McpRuntimePins,
  type PinnedArchive,
} from '../../src/main/mcp-client/runtime-pins'
import {
  createMcpRuntimeKit,
  findPcPython,
  runtimeForCommand,
  runtimeInstallDir,
  uvDataEnv,
  type McpRuntimeId,
  type McpRuntimeKitOptions,
  type RuntimeDownloadQuestion,
  type UvRunner,
} from '../../src/main/mcp-client/runtimes'

// ── fake distribution ──

async function zipOf(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [name, data] of Object.entries(files)) zip.file(name, data)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

interface TarEntry {
  name: string
  data?: string
  type?: '0' | '2' | '5' | 'x'
  mode?: number
  link?: string
}

function tarHeader(name: string, size: number, type: string, mode: number, link: string): Buffer {
  const block = Buffer.alloc(512)
  block.write(name, 0, 100, 'utf8')
  block.write(`${mode.toString(8).padStart(7, '0')}\0`, 100)
  block.write('0000000\0', 108)
  block.write('0000000\0', 116)
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124)
  block.write('00000000000\0', 136)
  block.fill(0x20, 148, 156)
  block.write(type, 156)
  block.write(link, 157, 100)
  block.write('ustar\0', 257)
  block.write('00', 263)
  let sum = 0
  for (const byte of block) sum += byte
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  return block
}

function padded(data: Buffer): Buffer {
  const rest = data.length % 512
  return rest === 0 ? data : Buffer.concat([data, Buffer.alloc(512 - rest)])
}

function paxRecord(key: string, value: string): Buffer {
  const body = ` ${key}=${value}\n`
  let length = body.length + 1
  while (`${length}${body}`.length !== length) length += 1
  return Buffer.from(`${length}${body}`)
}

function tarGzOf(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = []
  for (const entry of entries) {
    const data = Buffer.from(entry.data ?? '')
    const type = entry.type ?? '0'
    parts.push(tarHeader(entry.name, data.length, type, entry.mode ?? 0o644, entry.link ?? ''))
    if (data.length > 0) parts.push(padded(data))
  }
  parts.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(parts))
}

function archiveOf(
  url: string,
  bytes: Buffer,
  format: PinnedArchive['format'],
  root: string,
): PinnedArchive {
  return {
    url,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    format,
    root,
  }
}

async function windowsNodeZip(version: string): Promise<Buffer> {
  const root = `node-v${version}-win-x64`
  return zipOf({
    [`${root}/node.exe`]: `node ${version}`,
    [`${root}/node_modules/npm/bin/npm-cli.js`]: 'npm',
    [`${root}/node_modules/npm/bin/npx-cli.js`]: 'npx',
  })
}

async function windowsUvZip(): Promise<Buffer> {
  return zipOf({ 'uv.exe': 'uv', 'uvx.exe': 'uvx' })
}

/** Pins where every platform points at the same fake archive */
function pinsWith(overrides: {
  node?: { version: string; archive: PinnedArchive }
  uv?: { version: string; archive: PinnedArchive }
}): McpRuntimePins {
  const all = <T>(value: T) => ({
    'win32-x64': value,
    'darwin-arm64': value,
    'darwin-x64': value,
    'linux-x64': value,
  })
  return {
    node: overrides.node
      ? { version: overrides.node.version, archives: all(overrides.node.archive) }
      : MCP_RUNTIME_PINS.node,
    uv: overrides.uv
      ? { version: overrides.uv.version, archives: all(overrides.uv.archive) }
      : MCP_RUNTIME_PINS.uv,
    python: { version: '3.13.18', bytes: all(25_000_000) },
  }
}

interface FakeNet {
  fetch: McpRuntimeKitOptions['fetch'] & ReturnType<typeof vi.fn>
}

function fakeNet(files: Record<string, Buffer>, options: { offline?: boolean } = {}): FakeNet {
  const fetch = vi.fn(async (url: string) => {
    if (options.offline) throw new TypeError('fetch failed')
    const body = files[url]
    if (!body) return new Response('missing', { status: 404 })
    return new Response(new Uint8Array(body), { status: 200 })
  })
  return { fetch: fetch as FakeNet['fetch'] }
}

let scratch: string

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'mcp-runtimes-'))
})

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true })
})

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  )
}

interface Harness {
  root: string
  allowed: Set<McpRuntimeId>
  questions: RuntimeDownloadQuestion[]
  recorded: McpRuntimeId[]
  answer: boolean
}

function harness(): Harness {
  return {
    root: join(scratch, 'mcp-runtimes'),
    allowed: new Set(),
    questions: [],
    recorded: [],
    answer: true,
  }
}

function kitFor(h: Harness, overrides: Partial<McpRuntimeKitOptions> & { pathDirs?: string[] }) {
  const platform = overrides.platform ?? 'win32'
  const separator = platform === 'win32' ? ';' : delimiter
  return createMcpRuntimeKit({
    runtimesRoot: h.root,
    isRuntimeAllowed: (id) => h.allowed.has(id),
    recordRuntimeAllowed: (id) => {
      h.recorded.push(id)
      h.allowed.add(id)
    },
    askDownload: async (question) => {
      h.questions.push(question)
      return h.answer
    },
    platform,
    arch: 'x64',
    env: { PATH: (overrides.pathDirs ?? []).join(separator), SECRET_TOKEN: 'do-not-pass' },
    fallbackDirs: [],
    ...overrides,
  })
}

// ── pairing and pins ──

describe('runtimeForCommand', () => {
  it('pairs node, npx and npm with Node, uv and uvx with uv, python and python3 with Python', () => {
    expect(runtimeForCommand('node', 'linux')).toBe('node')
    expect(runtimeForCommand('npx', 'linux')).toBe('node')
    expect(runtimeForCommand('npm', 'darwin')).toBe('node')
    expect(runtimeForCommand('uv', 'linux')).toBe('uv')
    expect(runtimeForCommand('uvx', 'linux')).toBe('uv')
    expect(runtimeForCommand('python', 'linux')).toBe('python')
    expect(runtimeForCommand('python3', 'darwin')).toBe('python')
  })

  it('reads Windows names without case or extension', () => {
    expect(runtimeForCommand('NPX.cmd', 'win32')).toBe('node')
    expect(runtimeForCommand('uvx.exe', 'win32')).toBe('uv')
    expect(runtimeForCommand('Python', 'win32')).toBe('python')
  })

  it('pairs nothing with other commands or with paths', () => {
    expect(runtimeForCommand('docker', 'linux')).toBeNull()
    expect(runtimeForCommand('/usr/bin/node', 'linux')).toBeNull()
    expect(runtimeForCommand('C:\\nodejs\\node.exe', 'win32')).toBeNull()
    expect(runtimeForCommand('./npx', 'linux')).toBeNull()
  })
})

describe('pins', () => {
  it('pins Node, uv and the uv Python for every supported OS and chip', () => {
    for (const key of ['win32-x64', 'darwin-arm64', 'darwin-x64', 'linux-x64'] as const) {
      for (const id of ['node', 'uv'] as const) {
        const archive = MCP_RUNTIME_PINS[id].archives[key]
        expect(archive.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(archive.url).toMatch(/^https:\/\/(nodejs\.org|github\.com\/astral-sh\/uv)\//)
        expect(archive.url).toContain(MCP_RUNTIME_PINS[id].version)
        expect(archive.bytes).toBeGreaterThan(1_000_000)
      }
      expect(MCP_RUNTIME_PINS.python.bytes[key]).toBeGreaterThan(1_000_000)
    }
    expect(MCP_RUNTIME_PINS.node.archives['win32-x64'].format).toBe('zip')
    expect(MCP_RUNTIME_PINS.node.archives['linux-x64'].format).toBe('tar.gz')
    expect(MCP_RUNTIME_PINS.python.version).toMatch(/^3\.\d+\.\d+$/)
  })

  it('knows no pin for other OS and chip pairs', () => {
    expect(mcpRuntimePlatformKey('win32', 'x64')).toBe('win32-x64')
    expect(mcpRuntimePlatformKey('darwin', 'arm64')).toBe('darwin-arm64')
    expect(mcpRuntimePlatformKey('linux', 'arm64')).toBeNull()
    expect(mcpRuntimePlatformKey('win32', 'arm64')).toBeNull()
  })

  it('puts the app uv data under mcp-runtimes/uv-data', () => {
    const root = join('data', 'mcp-runtimes')
    expect(uvDataEnv(root)).toEqual({
      UV_PYTHON_INSTALL_DIR: join(root, 'uv-data', 'python'),
      UV_CACHE_DIR: join(root, 'uv-data', 'cache'),
    })
  })
})

// ── Node ──

describe('Node runtime', () => {
  const NODE_URL = 'https://dist.test/node-1.0.0.zip'

  async function nodePins(version = '1.0.0', url = NODE_URL) {
    const bytes = await windowsNodeZip(version)
    return {
      bytes,
      pins: pinsWith({
        node: { version, archive: archiveOf(url, bytes, 'zip', `node-v${version}-win-x64`) },
      }),
    }
  }

  it('asks, records the permission, downloads and runs npx through the app Node', async () => {
    const h = harness()
    const { bytes, pins } = await nodePins()
    const net = fakeNet({ [NODE_URL]: bytes })
    const kit = kitFor(h, { pins, fetch: net.fetch })

    const result = await kit.resolveCommand('npx')

    expect(h.questions).toEqual([
      {
        command: 'npx',
        runtime: 'node',
        downloads: [{ runtime: 'node', version: '1.0.0', bytes: bytes.length }],
        totalBytes: bytes.length,
      },
    ])
    expect(h.recorded).toEqual(['node'])
    const dir = runtimeInstallDir(h.root, 'node', '1.0.0')
    expect(result).toEqual({
      ok: true,
      command: join(dir, 'node.exe'),
      prefixArgs: [join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js')],
      env: {},
      pathPrepend: [dir],
      source: 'app',
      runtime: 'node',
    })
    expect(await readdir(h.root)).toEqual(['node-1.0.0'])
  })

  it('does not ask again when the download was allowed before', async () => {
    const h = harness()
    h.allowed.add('node')
    const { bytes, pins } = await nodePins()
    const net = fakeNet({ [NODE_URL]: bytes })

    const result = await kitFor(h, { pins, fetch: net.fetch }).resolveCommand('node')

    expect(result.ok).toBe(true)
    expect(h.questions).toEqual([])
    expect(net.fetch).toHaveBeenCalledTimes(1)
  })

  it('fails with runtime-missing and downloads nothing when the question is declined', async () => {
    const h = harness()
    h.answer = false
    const { bytes, pins } = await nodePins()
    const net = fakeNet({ [NODE_URL]: bytes })

    const result = await kitFor(h, { pins, fetch: net.fetch }).resolveCommand('npx')

    expect(result).toMatchObject({
      ok: false,
      reason: 'runtime-missing',
      detail: 'declined',
      runtime: 'node',
    })
    expect(h.questions).toHaveLength(1)
    expect(h.recorded).toEqual([])
    expect(net.fetch).not.toHaveBeenCalled()
    expect(await exists(runtimeInstallDir(h.root, 'node', '1.0.0'))).toBe(false)
  })

  it('deletes a download whose hash differs and reports runtime-missing', async () => {
    const h = harness()
    h.allowed.add('node')
    const { bytes, pins } = await nodePins()
    const tampered = Buffer.from(bytes)
    tampered[tampered.length - 1] ^= 0xff
    const net = fakeNet({ [NODE_URL]: tampered })

    const result = await kitFor(h, { pins, fetch: net.fetch }).resolveCommand('npx')

    expect(result).toMatchObject({ ok: false, reason: 'runtime-missing', detail: 'hash-mismatch' })
    expect(await readdir(h.root)).toEqual([])
  })

  it('refuses a download longer than the pinned size', async () => {
    const h = harness()
    h.allowed.add('node')
    const { bytes, pins } = await nodePins()
    const net = fakeNet({ [NODE_URL]: Buffer.concat([bytes, Buffer.from('extra')]) })

    const result = await kitFor(h, { pins, fetch: net.fetch }).resolveCommand('node')

    expect(result).toMatchObject({ ok: false, detail: 'hash-mismatch' })
    expect(await readdir(h.root)).toEqual([])
  })

  it('reports offline when the download cannot be made, and succeeds on retry', async () => {
    const h = harness()
    h.allowed.add('node')
    const { bytes, pins } = await nodePins()
    const offline = fakeNet({}, { offline: true })

    const failed = await kitFor(h, { pins, fetch: offline.fetch }).resolveCommand('npm')
    expect(failed).toMatchObject({ ok: false, reason: 'runtime-missing', detail: 'offline' })
    expect(await readdir(h.root)).toEqual([])

    const online = fakeNet({ [NODE_URL]: bytes })
    const retried = await kitFor(h, { pins, fetch: online.fetch }).resolveCommand('npm')
    expect(retried).toMatchObject({ ok: true, source: 'app' })
  })

  it('fetches a new pinned version without asking and deletes the old one', async () => {
    const h = harness()
    const first = await nodePins('1.0.0')
    await kitFor(h, {
      pins: first.pins,
      fetch: fakeNet({ [NODE_URL]: first.bytes }).fetch,
    }).resolveCommand('node')
    expect(h.questions).toHaveLength(1)
    await mkdir(join(h.root, 'uv-data', 'python'), { recursive: true })

    const nextUrl = 'https://dist.test/node-2.0.0.zip'
    const second = await nodePins('2.0.0', nextUrl)
    const result = await kitFor(h, {
      pins: second.pins,
      fetch: fakeNet({ [nextUrl]: second.bytes }).fetch,
    }).resolveCommand('node')

    expect(h.questions).toHaveLength(1)
    expect(result).toMatchObject({
      ok: true,
      command: join(runtimeInstallDir(h.root, 'node', '2.0.0'), 'node.exe'),
    })
    expect((await readdir(h.root)).sort()).toEqual(['node-2.0.0', 'uv-data'])
  })

  it('uses an installed pinned Node without asking or downloading', async () => {
    const h = harness()
    const { bytes, pins } = await nodePins()
    await kitFor(h, { pins, fetch: fakeNet({ [NODE_URL]: bytes }).fetch }).resolveCommand('node')
    h.allowed.clear()
    const net = fakeNet({})

    const result = await kitFor(h, { pins, fetch: net.fetch }).resolveCommand('npx')

    expect(result).toMatchObject({ ok: true, source: 'app' })
    expect(h.questions).toHaveLength(1)
    expect(net.fetch).not.toHaveBeenCalled()
  })

  it('prefers the PC Node and its npm scripts', async () => {
    const h = harness()
    const pcDir = join(scratch, 'pc-node')
    await mkdir(join(pcDir, 'node_modules', 'npm', 'bin'), { recursive: true })
    await writeFile(join(pcDir, 'node.exe'), '')
    await writeFile(join(pcDir, 'node_modules', 'npm', 'bin', 'npx-cli.js'), '')
    await writeFile(join(pcDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'), '')
    const { pins } = await nodePins()
    const net = fakeNet({})

    const result = await kitFor(h, {
      pins,
      fetch: net.fetch,
      pathDirs: ['', 'relative-dir', pcDir],
    }).resolveCommand('npx')

    expect(result).toEqual({
      ok: true,
      command: join(pcDir, 'node.exe'),
      prefixArgs: [join(pcDir, 'node_modules', 'npm', 'bin', 'npx-cli.js')],
      env: {},
      pathPrepend: [pcDir],
      source: 'pc',
      runtime: 'node',
    })
    expect(h.questions).toEqual([])
    expect(net.fetch).not.toHaveBeenCalled()
  })

  it('downloads Node for npx when the PC Node has no npm', async () => {
    const h = harness()
    h.allowed.add('node')
    const pcDir = join(scratch, 'pc-node-bare')
    await mkdir(pcDir, { recursive: true })
    await writeFile(join(pcDir, 'node.exe'), '')
    const { bytes, pins } = await nodePins()

    const result = await kitFor(h, {
      pins,
      fetch: fakeNet({ [NODE_URL]: bytes }).fetch,
      pathDirs: [pcDir],
    }).resolveCommand('npx')

    expect(result).toMatchObject({ ok: true, source: 'app' })
  })

  it('asks once when two servers need the same download at the same time', async () => {
    const h = harness()
    const { bytes, pins } = await nodePins()
    const net = fakeNet({ [NODE_URL]: bytes })
    const kit = kitFor(h, { pins, fetch: net.fetch })

    const [a, b] = await Promise.all([kit.resolveCommand('npx'), kit.resolveCommand('node')])

    expect(a.ok && b.ok).toBe(true)
    expect(h.questions).toHaveLength(1)
    expect(net.fetch).toHaveBeenCalledTimes(1)
  })

  it('reports download-needed without asking when no download is offered', async () => {
    const h = harness()
    const { pins } = await nodePins()
    const net = fakeNet({})

    const result = await kitFor(h, { pins, fetch: net.fetch }).resolveCommand('npx', {
      offerDownload: false,
    })

    expect(result).toMatchObject({
      ok: false,
      detail: 'download-needed',
      downloads: [{ runtime: 'node', version: '1.0.0' }],
    })
    expect(h.questions).toEqual([])
    expect(net.fetch).not.toHaveBeenCalled()
  })

  it('offers nothing on an OS and chip without a pin', async () => {
    const h = harness()
    const result = await kitFor(h, { platform: 'linux', arch: 'arm64' }).resolveCommand('npx')
    expect(result).toMatchObject({ ok: false, detail: 'unsupported-platform' })
    expect(h.questions).toEqual([])
  })

  it('unpacks the macOS and Linux tar.gz layout', async () => {
    const h = harness()
    h.allowed.add('node')
    const root = 'node-v1.0.0-linux-x64'
    const longName = `${root}/lib/node_modules/npm/${'deep/'.repeat(30)}file.txt`
    const parts: TarEntry[] = [
      { name: `${root}/`, type: '5', mode: 0o755 },
      { name: `${root}/bin/node`, data: 'node', mode: 0o755 },
      { name: `${root}/bin/npm`, type: '2', link: '../lib/node_modules/npm/bin/npm-cli.js' },
      { name: `${root}/lib/node_modules/npm/bin/npm-cli.js`, data: 'npm', mode: 0o755 },
      { name: `${root}/lib/node_modules/npm/bin/npx-cli.js`, data: 'npx', mode: 0o755 },
      { name: 'PaxHeader/long', type: 'x', data: paxRecord('path', longName).toString() },
      { name: `${root}/lib/short-name-ignored`, data: 'long content' },
    ]
    const bytes = tarGzOf(parts)
    const url = 'https://dist.test/node.tar.gz'
    const pins = pinsWith({
      node: { version: '1.0.0', archive: archiveOf(url, bytes, 'tar.gz', root) },
    })

    const result = await kitFor(h, {
      platform: 'linux',
      pins,
      fetch: fakeNet({ [url]: bytes }).fetch,
    }).resolveCommand('npx')

    const dir = runtimeInstallDir(h.root, 'node', '1.0.0')
    expect(result).toMatchObject({
      ok: true,
      command: join(dir, 'bin', 'node'),
      prefixArgs: [join(dir, 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js')],
    })
    expect(
      await exists(
        join(
          dir,
          'lib',
          'node_modules',
          'npm',
          ...'deep/'.repeat(30).split('/').filter(Boolean),
          'file.txt',
        ),
      ),
    ).toBe(true)
    expect(await exists(join(dir, 'lib', 'short-name-ignored'))).toBe(false)
    if (process.platform !== 'win32') {
      expect((await stat(join(dir, 'bin', 'node'))).mode & 0o111).not.toBe(0)
    }
  })

  it('refuses an archive entry that leaves the install folder', async () => {
    const h = harness()
    h.allowed.add('node')
    const root = 'node-v1.0.0-linux-x64'
    const bytes = tarGzOf([
      { name: `${root}/bin/node`, data: 'node', mode: 0o755 },
      { name: `${root}/../../escaped`, data: 'x' },
    ])
    const url = 'https://dist.test/evil.tar.gz'
    const pins = pinsWith({
      node: { version: '1.0.0', archive: archiveOf(url, bytes, 'tar.gz', root) },
    })

    const result = await kitFor(h, {
      platform: 'linux',
      pins,
      fetch: fakeNet({ [url]: bytes }).fetch,
    }).resolveCommand('node')

    expect(result).toMatchObject({ ok: false, detail: 'extract-failed' })
    expect(await readdir(h.root)).toEqual([])
    expect(await exists(join(scratch, 'escaped'))).toBe(false)
  })
})

// ── uv and Python ──

describe('uv and Python runtimes', () => {
  const UV_URL = 'https://dist.test/uv.zip'

  async function uvPins() {
    const bytes = await windowsUvZip()
    return {
      bytes,
      pins: pinsWith({ uv: { version: '0.1.0', archive: archiveOf(UV_URL, bytes, 'zip', '') } }),
    }
  }

  /** A uv that installs the pinned Python into UV_PYTHON_INSTALL_DIR */
  function fakeUv(
    calls: Array<{ uv: string; args: string[]; env: Record<string, string> }>,
  ): UvRunner {
    return async (uv, args, { env }) => {
      calls.push({ uv, args, env })
      const dir = join(
        env.UV_PYTHON_INSTALL_DIR ?? join(scratch, 'pc-uv-python'),
        'cpython-3.13.18-windows-x86_64-none',
      )
      const python = join(dir, 'python.exe')
      if (args[1] === 'install') {
        await mkdir(dir, { recursive: true })
        await writeFile(python, '')
        return { code: 0, stdout: '' }
      }
      return (await exists(python)) ? { code: 0, stdout: `${python}\n` } : { code: 2, stdout: '' }
    }
  }

  it('asks once for uv and its Python together, then runs uvx with the app data folders', async () => {
    const h = harness()
    const { bytes, pins } = await uvPins()
    const calls: Array<{ uv: string; args: string[]; env: Record<string, string> }> = []

    const result = await kitFor(h, {
      pins,
      fetch: fakeNet({ [UV_URL]: bytes }).fetch,
      runUv: fakeUv(calls),
    }).resolveCommand('uvx')

    expect(h.questions).toEqual([
      {
        command: 'uvx',
        runtime: 'uv',
        downloads: [
          { runtime: 'uv', version: '0.1.0', bytes: bytes.length },
          { runtime: 'python', version: '3.13.18', bytes: 25_000_000 },
        ],
        totalBytes: bytes.length + 25_000_000,
      },
    ])
    expect(h.recorded).toEqual(['uv', 'python'])
    const dir = runtimeInstallDir(h.root, 'uv', '0.1.0')
    expect(result).toEqual({
      ok: true,
      command: join(dir, 'uvx.exe'),
      prefixArgs: [],
      env: { ...uvDataEnv(h.root) },
      pathPrepend: [dir],
      source: 'app',
      runtime: 'uv',
    })
    expect(calls[0]).toMatchObject({
      uv: join(dir, 'uv.exe'),
      args: ['python', 'install', '3.13.18'],
    })
    expect(calls[0]!.env).toMatchObject(uvDataEnv(h.root))
    expect(calls[0]!.env.SECRET_TOKEN).toBeUndefined()
  })

  it('runs python through the uv-managed Python when the PC has none', async () => {
    const h = harness()
    h.allowed.add('uv')
    h.allowed.add('python')
    const { bytes, pins } = await uvPins()
    const calls: Array<{ uv: string; args: string[]; env: Record<string, string> }> = []

    const result = await kitFor(h, {
      pins,
      fetch: fakeNet({ [UV_URL]: bytes }).fetch,
      runUv: fakeUv(calls),
    }).resolveCommand('python')

    const python = join(
      uvDataEnv(h.root).UV_PYTHON_INSTALL_DIR,
      'cpython-3.13.18-windows-x86_64-none',
      'python.exe',
    )
    expect(result).toEqual({
      ok: true,
      command: python,
      prefixArgs: [],
      env: {},
      pathPrepend: [dirname(python)],
      source: 'app',
      runtime: 'python',
    })
    expect(h.questions).toEqual([])
  })

  it('fails with runtime-missing when uv cannot install its Python', async () => {
    const h = harness()
    h.allowed.add('uv')
    h.allowed.add('python')
    const { bytes, pins } = await uvPins()

    const result = await kitFor(h, {
      pins,
      fetch: fakeNet({ [UV_URL]: bytes }).fetch,
      runUv: async () => ({ code: 1, stdout: '' }),
    }).resolveCommand('python')

    expect(result).toMatchObject({
      ok: false,
      reason: 'runtime-missing',
      detail: 'python-install-failed',
    })
  })

  it('prefers the PC Python and the PC uv', async () => {
    const h = harness()
    const pcDir = join(scratch, 'pc-bin')
    await mkdir(pcDir, { recursive: true })
    for (const name of ['python.exe', 'uv.exe', 'uvx.exe']) await writeFile(join(pcDir, name), '')
    const net = fakeNet({})
    const runUv = vi.fn<UvRunner>()
    const kit = kitFor(h, { fetch: net.fetch, runUv, pathDirs: [pcDir] })

    expect(await kit.resolveCommand('python')).toMatchObject({
      ok: true,
      command: join(pcDir, 'python.exe'),
      source: 'pc',
    })
    expect(await kit.resolveCommand('uvx')).toMatchObject({
      ok: true,
      command: join(pcDir, 'uvx.exe'),
      env: {},
      source: 'pc',
    })
    expect(h.questions).toEqual([])
    expect(net.fetch).not.toHaveBeenCalled()
    expect(runUv).not.toHaveBeenCalled()
  })

  it('does not take the Windows store stub for the PC Python', async () => {
    const stubDir = join(scratch, 'Microsoft', 'WindowsApps')
    await mkdir(stubDir, { recursive: true })
    await writeFile(join(stubDir, 'python.exe'), '')

    expect(
      await findPcPython('python', { platform: 'win32', env: { PATH: stubDir }, fallbackDirs: [] }),
    ).toBeNull()
  })
})

// ── other commands ──

describe('other commands', () => {
  it('only looks them up on the PC, including Windows script files for the launcher to judge', async () => {
    const h = harness()
    const pcDir = join(scratch, 'tools')
    await mkdir(pcDir, { recursive: true })
    await writeFile(join(pcDir, 'docker.exe'), '')
    await writeFile(join(pcDir, 'helper.cmd'), '')
    const kit = kitFor(h, { pathDirs: [pcDir] })

    expect(await kit.resolveCommand('docker')).toMatchObject({
      ok: true,
      command: join(pcDir, 'docker.exe'),
      source: 'pc',
      runtime: null,
    })
    expect(await kit.resolveCommand('helper')).toMatchObject({ command: join(pcDir, 'helper.cmd') })
    expect(await kit.resolveCommand('missing-tool')).toMatchObject({
      ok: false,
      reason: 'runtime-missing',
      detail: 'not-found',
    })
    expect(await kit.resolveCommand(join(pcDir, 'docker.exe'))).toMatchObject({ ok: true })
    expect(await kit.resolveCommand(join('tools', 'docker.exe'))).toMatchObject({
      ok: false,
      detail: 'not-found',
    })
    expect(h.questions).toEqual([])
  })
})
