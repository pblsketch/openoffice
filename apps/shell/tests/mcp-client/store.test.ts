import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SafeStorageLike } from '../../src/main/ai-secrets'
import {
  safeStorageMcpCodec,
  secretView,
  type McpSecretCodec,
} from '../../src/main/mcp-client/secrets'
import {
  createMcpServersStore,
  emptyMcpServersFile,
  MCP_SERVERS_FILE_NAME,
  mcpServersFilePath,
  newMcpServerConfig,
  normalizeMcpServersFile,
} from '../../src/main/mcp-client/store'

/** reversible stand-in for the OS cipher; marks its output so plain text would show */
const codec = (canSeal = true): McpSecretCodec => ({
  canSeal: () => canSeal,
  seal: (plain) => `sealed:v1:${Buffer.from([...plain].reverse().join('')).toString('base64')}`,
  open: (sealed) =>
    sealed.startsWith('sealed:v1:')
      ? [...Buffer.from(sealed.slice(10), 'base64').toString()].reverse().join('')
      : null,
})

const dirs: string[] = []
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-store-'))
  dirs.push(dir)
  return join(dir, MCP_SERVERS_FILE_NAME)
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const remote = () =>
  newMcpServerConfig({
    name: 'law',
    kind: 'remote',
    url: 'https://law.example.com/mcp',
    headers: { Authorization: 'Bearer secret-key-1234', 'X-Team': 'blue-team' },
    oauth: { clientId: 'client-1', clientSecret: 'client-secret-9876', tokens: '{"a":"tok"}' },
  })
const local = () =>
  newMcpServerConfig({
    name: 'docs',
    kind: 'local',
    command: 'npx',
    args: ['-y', 'docs-mcp'],
    env: { DOCS_TOKEN: 'env-secret-5555' },
  })

describe('mcpServersFilePath', () => {
  it('puts mcp-servers.json in the data folder', () => {
    expect(mcpServersFilePath(join('C:', 'data'))).toBe(join('C:', 'data', 'mcp-servers.json'))
  })
})

describe('normalizeMcpServersFile', () => {
  it('reads unknown permission values as ask', () => {
    const file = normalizeMcpServersFile({
      version: 1,
      servers: [
        {
          id: 's1',
          name: 'law',
          kind: 'remote',
          url: 'https://x',
          tools: {
            a: {
              permission: 'always',
              approved: 'sha256:1',
              definition: { description: 'a', inputSchema: {} },
            },
            b: {
              permission: 'sometimes',
              approved: 'sha256:2',
              definition: { description: 'b', inputSchema: {} },
            },
            c: { approved: 'sha256:3', definition: { description: 'c', inputSchema: {} } },
          },
        },
      ],
    })
    const tools = file.servers[0].tools
    expect(tools.a.permission).toBe('always')
    expect(tools.b.permission).toBe('ask')
    expect(tools.c.permission).toBe('ask')
  })

  it('tolerates missing fields and junk', () => {
    expect(normalizeMcpServersFile(null)).toEqual(emptyMcpServersFile())
    expect(normalizeMcpServersFile({ servers: 'no' })).toEqual(emptyMcpServersFile())
    const file = normalizeMcpServersFile({ servers: [{ name: 'bare', command: 'npx' }, 7, null] })
    expect(file.version).toBe(1)
    expect(file.servers).toHaveLength(1)
    const s = file.servers[0]
    expect(s).toMatchObject({
      name: 'bare',
      kind: 'local',
      enabled: true,
      keepResultsInside: true,
      command: 'npx',
      args: [],
      env: {},
      approvedLaunch: null,
      approvedPlan: null,
      instructions: null,
      pendingInstructions: null,
      tools: {},
      newTools: [],
    })
    expect(s.id.length).toBeGreaterThan(0)
  })

  it('keeps a tool entry with a broken definition reviewable rather than approved', () => {
    const file = normalizeMcpServersFile({
      servers: [
        {
          id: 's',
          name: 'a',
          kind: 'remote',
          url: 'https://x',
          tools: { t: { permission: 'always' } },
        },
      ],
    })
    expect(file.servers[0].tools.t).toEqual({
      permission: 'always',
      approved: '',
      definition: { description: '', inputSchema: {} },
      pending: null,
    })
  })

  it('drops newTools that are not tools and keeps the runtimes', () => {
    const file = normalizeMcpServersFile({
      runtimes: { node: { allowed: true }, uv: { allowed: 'yes' } },
      servers: [
        { id: 's', name: 'a', kind: 'remote', url: 'https://x', tools: {}, newTools: ['gone', 3] },
      ],
    })
    expect(file.runtimes).toEqual({ node: { allowed: true }, uv: { allowed: false } })
    expect(file.servers[0].newTools).toEqual([])
  })
})

describe('createMcpServersStore', () => {
  it('starts empty when the file is missing', async () => {
    const store = createMcpServersStore(tempFile(), codec())
    expect(await store.load()).toEqual({ state: 'missing', unreadable: [] })
    expect(store.get()).toEqual(emptyMcpServersFile())
  })

  it('round-trips servers, sealing every secret in the file', async () => {
    const path = tempFile()
    const store = createMcpServersStore(path, codec())
    await store.load()
    const r = remote()
    // an approved launch keeps the plan the person saw
    const l = { ...local(), approvedLaunch: 'sha256:launch', approvedPlan: 'sha256:plan' }
    await store.update((f) => ({ ...f, runtimes: { node: { allowed: true } }, servers: [r, l] }))

    const text = readFileSync(path, 'utf8')
    for (const secret of [
      'secret-key-1234',
      'blue-team',
      'client-secret-9876',
      '"a":"tok"',
      'env-secret-5555',
    ]) {
      expect(text).not.toContain(secret)
    }
    const raw = JSON.parse(text)
    expect(raw.version).toBe(1)
    expect(raw.servers[0].headers.Authorization).toMatch(/^sealed:v1:/)
    expect(raw.servers[0].oauth.clientId).toBe('client-1')
    expect(raw.servers[1].env.DOCS_TOKEN).toMatch(/^sealed:v1:/)
    // fields of the other kind are not written
    expect(raw.servers[0]).not.toHaveProperty('command')
    expect(raw.servers[1]).not.toHaveProperty('url')
    expect(raw.servers[1].approvedPlan).toBe('sha256:plan')
    expect(raw.servers[0]).not.toHaveProperty('approvedPlan')

    const again = createMcpServersStore(path, codec())
    expect(await again.load()).toEqual({ state: 'ok', unreadable: [] })
    expect(again.get()).toEqual({
      version: 1,
      runtimes: { node: { allowed: true } },
      servers: [r, l],
    })
    expect(again.sealing()).toBe(true)
  })

  it('keeps secrets in memory only when the PC cannot seal', async () => {
    const path = tempFile()
    const store = createMcpServersStore(path, codec(false))
    await store.load()
    await store.update((f) => ({ ...f, servers: [remote(), local()] }))

    const raw = JSON.parse(readFileSync(path, 'utf8'))
    expect(raw.servers[0].headers).toEqual({ Authorization: '', 'X-Team': '' })
    expect(raw.servers[0].oauth).toEqual({ clientId: 'client-1', clientSecret: '', tokens: '' })
    expect(raw.servers[1].env).toEqual({ DOCS_TOKEN: '' })
    // this run still has them
    expect(store.get().servers[0].headers.Authorization).toBe('Bearer secret-key-1234')
    expect(store.sealing()).toBe(false)

    const view = store.view()
    expect(view.sealing).toBe(false)
    expect(view.servers[0].secretsMemoryOnly).toBe(true)
    expect(view.servers[0].headers.Authorization).toEqual({ state: 'memory-only', last4: '1234' })

    // after a restart they are gone and must be entered again
    const again = createMcpServersStore(path, codec(false))
    await again.load()
    expect(again.get().servers[0].headers.Authorization).toBe('')
    expect(again.view().servers[0].headers.Authorization).toEqual({ state: 'missing', last4: '' })
    expect(again.view().servers[0].secretsMemoryOnly).toBe(false)
  })

  it('opens a value sealed elsewhere as empty and reports it', async () => {
    const path = tempFile()
    const store = createMcpServersStore(path, codec())
    await store.load()
    const r = remote()
    await store.update((f) => ({ ...f, servers: [r] }))
    const other = createMcpServersStore(path, { ...codec(), open: () => null })
    const loaded = await other.load()
    expect(loaded.state).toBe('ok')
    expect(loaded.unreadable).toContainEqual({ serverId: r.id, secret: 'headers:Authorization' })
    expect(other.get().servers[0].headers.Authorization).toBe('')
  })

  it('reads a hand-written plain value and seals it on the next save', async () => {
    const path = tempFile()
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        servers: [
          {
            id: 's',
            name: 'a',
            kind: 'remote',
            url: 'https://x',
            headers: { Authorization: 'Bearer plain-0000' },
          },
        ],
      }),
    )
    const store = createMcpServersStore(path, codec())
    await store.load()
    expect(store.get().servers[0].headers.Authorization).toBe('Bearer plain-0000')
    await store.update(() => {})
    expect(readFileSync(path, 'utf8')).not.toContain('plain-0000')
  })

  it('never puts a secret into the renderer view', async () => {
    const store = createMcpServersStore(tempFile(), codec())
    await store.load()
    await store.update((f) => ({ ...f, servers: [remote(), local()] }))
    const view = store.view()
    const text = JSON.stringify(view)
    for (const secret of ['secret-key', 'blue-team', 'client-secret', 'tok', 'env-secret']) {
      expect(text).not.toContain(secret)
    }
    const [r, l] = view.servers
    expect(r.headers).toEqual({
      Authorization: { state: 'saved', last4: '1234' },
      'X-Team': { state: 'saved', last4: 'team' },
    })
    expect(r.oauth).toEqual({
      clientId: 'client-1',
      clientSecret: { state: 'saved', last4: '9876' },
      signedIn: true,
    })
    expect(l.env).toEqual({ DOCS_TOKEN: { state: 'saved', last4: '5555' } })
    expect(l.launchReviewNeeded).toBe(true)
    expect(l.command).toBe('npx')
    expect(view.sealing).toBe(true)
  })

  it('removes a server with all of its secrets', async () => {
    const path = tempFile()
    const store = createMcpServersStore(path, codec(false))
    await store.load()
    const r = remote()
    await store.update((f) => ({ ...f, servers: [r, local()] }))
    expect(await store.removeServer(r.id)).toBe(true)
    expect(await store.removeServer('missing')).toBe(false)
    expect(store.get().servers.map((s) => s.name)).toEqual(['docs'])
    expect(JSON.stringify(store.get())).not.toContain('secret-key-1234')
    expect(JSON.parse(readFileSync(path, 'utf8')).servers).toHaveLength(1)
  })

  it('keeps a damaged file aside instead of overwriting it silently', async () => {
    const path = tempFile()
    writeFileSync(path, '{ broken')
    const store = createMcpServersStore(path, codec())
    expect((await store.load()).state).toBe('damaged')
    expect(store.get()).toEqual(emptyMcpServersFile())
    await store.update((f) => ({ ...f, servers: [local()] }))
    expect(readFileSync(`${path}.damaged`, 'utf8')).toBe('{ broken')
    expect(existsSync(path)).toBe(true)
  })

  it('serializes concurrent updates', async () => {
    const store = createMcpServersStore(tempFile(), codec())
    await store.load()
    const a = local()
    const b = { ...remote(), name: 'law2' }
    await Promise.all([
      store.update((f) => ({ ...f, servers: [...f.servers, a] })),
      store.update((f) => ({ ...f, servers: [...f.servers, b] })),
    ])
    expect(store.get().servers.map((s) => s.name)).toEqual(['docs', 'law2'])
  })

  it('hands out copies, so callers cannot change the stored state by accident', async () => {
    const store = createMcpServersStore(tempFile(), codec())
    await store.load()
    await store.update((f) => ({ ...f, servers: [local()] }))
    store.get().servers[0].name = 'changed'
    expect(store.get().servers[0].name).toBe('docs')
  })
})

describe('secretView', () => {
  it('shows the last four characters only of a long enough value', () => {
    expect(secretView('abcdefgh1234', false)).toEqual({ state: 'saved', last4: '1234' })
    expect(secretView('short', false)).toEqual({ state: 'saved', last4: '' })
    expect(secretView('', false)).toEqual({ state: 'missing', last4: '' })
    expect(secretView('abcdefgh1234', true)).toEqual({ state: 'memory-only', last4: '1234' })
  })
})

describe('safeStorageMcpCodec', () => {
  const storage = (available: boolean, backend?: string): SafeStorageLike => ({
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from(`enc:${plain}`),
    decryptString: (sealed) => sealed.toString().slice(4),
    getSelectedStorageBackend: backend ? () => backend : undefined,
  })

  it('follows the Drive vault rule for when sealing counts', () => {
    expect(safeStorageMcpCodec(storage(true), 'win32').canSeal()).toBe(true)
    expect(safeStorageMcpCodec(storage(true), 'darwin').canSeal()).toBe(true)
    expect(safeStorageMcpCodec(storage(true, 'gnome_libsecret'), 'linux').canSeal()).toBe(true)
    expect(safeStorageMcpCodec(storage(true, 'basic_text'), 'linux').canSeal()).toBe(false)
    expect(safeStorageMcpCodec(storage(false), 'win32').canSeal()).toBe(false)
  })

  it('seals with the shared prefix and opens it back', () => {
    const c = safeStorageMcpCodec(storage(true), 'win32')
    const sealed = c.seal('value')
    expect(sealed.startsWith('sealed:v1:')).toBe(true)
    expect(sealed).not.toContain('value')
    expect(c.open(sealed)).toBe('value')
    expect(c.open('plain')).toBeNull()
  })

  it('opens nothing when the system cannot decrypt', () => {
    const c = safeStorageMcpCodec(
      {
        ...storage(true),
        decryptString: () => {
          throw new Error('other user')
        },
      },
      'win32',
    )
    expect(c.open('sealed:v1:AAAA')).toBeNull()
  })
})
