// @vitest-environment node
/**
 * The Word editor's main-process crash-recovery wiring over IPC: a copy is
 * what a save would write (lazily served pictures inlined), every save drops
 * the tab's stale copies (the path it left, its untitled slot), a restored
 * untitled copy reaches a renderer that boots while it is still being read,
 * a copy that cannot be decrypted is set aside instead of left undecided, and
 * the renderer hears when its copy was dropped. Real recovery store over a
 * temporary app data folder; Electron and the lazy-picture source are fakes.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown

const h = vi.hoisted(() => ({
  root: '',
  handlers: new Map<string, Handler>(),
  materialize: vi.fn(async (bytes: Buffer) => ({ bytes, hashes: new Set<string>() })),
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? h.root : tmpdir()),
    getAppPath: () => tmpdir(),
    getName: () => 'docs-test',
    getVersion: () => '0',
    getSystemLocale: () => 'en-US',
    on: () => {},
    once: () => {},
    whenReady: () => new Promise(() => {}),
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => h.handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  BrowserWindow: class {
    static fromWebContents() {
      return null
    }
    static getFocusedWindow() {
      return null
    }
    static getAllWindows() {
      return []
    }
  },
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  WebContentsView: class {},
  clipboard: {},
  dialog: {},
  nativeImage: {},
  net: {},
  session: {},
  shell: {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
}))
// this workspace's test aliases do not reach the rest of these packages, and
// the handlers under test use none of them
vi.mock('@genoffice/ai-search', async () => ({
  ...(await import('../../../packages/ai-search/src/media-call-abort')),
  documentMediaRoots: () => [],
}))
vi.mock('@genoffice/ai-provider/subscription', () => ({
  ensureSubscriptionIpc: () => ({}),
  sharedSubscriptionStatuses: () => ({}),
}))
vi.mock('@genoffice/ai-provider/codex-app-server', () => ({
  shutdownCodexAppServers: () => {},
}))
vi.mock('@genoffice/ai-provider/custom-models', () => ({}))
vi.mock('../src/main/lazy-media', () => ({
  registerLazyMediaProtocol: () => {},
  materializeLazyDocx: (bytes: Buffer) => h.materialize(bytes),
  adoptLazyMediaHashes: async () => {},
  forgetLazyMediaOwner: () => {},
  moveLazyMediaSource: () => {},
  openLazyDocx: async () => null,
  pointLazyMediaAt: () => {},
  readLazyMedia: async () => null,
}))
vi.mock('../src/main/lazy-media-inline', () => ({}))

import {
  createRecoveryStore,
  recoveryEditor,
  type RecoveryIdentity,
  type RecoveryStore,
} from '@genoffice/electron-utils'
import {
  authorizeMcpDocWrite,
  discardDocsRecovery,
  docsRecoveryIdentity,
  registerDocsIpc,
  setDocsShellHooks,
} from '../src/main/docs-main'
import { encryptDocx } from '../src/main/docx-encryption'
import { buildBlankDocx } from '@genoffice/docx-engine'
import { docxToOdt } from '@genoffice/odt-engine'

interface FakeTab {
  id: number
  isDestroyed: () => boolean
  isCrashed: () => boolean
  send: ReturnType<typeof vi.fn>
}

let nextTabId = 100
let userFolder: string
let store: RecoveryStore

function newTab(): FakeTab {
  return {
    id: nextTabId++,
    isDestroyed: () => false,
    isCrashed: () => false,
    send: vi.fn(),
  }
}

function invoke<T>(channel: string, tab: FakeTab, ...args: unknown[]): Promise<T> {
  const handler = h.handlers.get(channel)
  if (!handler) throw new Error(`no handler for ${channel}`)
  return Promise.resolve(handler({ sender: tab }, ...args)) as Promise<T>
}

function bytesOf(text: string): ArrayBuffer {
  const buf = Buffer.from(text)
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

const writeCopy = (tab: FakeTab, filePath: string | null, text: string) =>
  invoke<{ ok: boolean }>('docs:write-recovery', tab, filePath, bytesOf(text), {
    title: 'Untitled.docx',
    format: 'docx',
  })

const fileCopy = (filePath: string): RecoveryIdentity => ({ kind: 'docs', filePath })

beforeAll(() => {
  h.root = mkdtempSync(join(tmpdir(), 'docs-recovery-main-root-'))
  userFolder = mkdtempSync(join(tmpdir(), 'docs-recovery-main-user-'))
  store = createRecoveryStore({ userDataDir: h.root })
  registerDocsIpc()
})

afterAll(() => {
  rmSync(h.root, { recursive: true, force: true })
  rmSync(userFolder, { recursive: true, force: true })
})

beforeEach(() => {
  h.materialize.mockReset()
  h.materialize.mockImplementation(async (bytes: Buffer) => ({ bytes, hashes: new Set() }))
})

describe('copy bytes', () => {
  it('a docx copy carries its lazily served pictures, as a save would write it', async () => {
    h.materialize.mockImplementation(async () => ({
      bytes: Buffer.from('docx with its pictures'),
      hashes: new Set(['h']),
    }))
    const tab = newTab()
    expect(await writeCopy(tab, null, 'docx with picture placeholders')).toEqual({ ok: true })
    const identity = docsRecoveryIdentity(tab.id)!
    expect((await store.readCopy(identity))?.toString()).toBe('docx with its pictures')
  })
})

describe('saves drop stale copies', () => {
  it("a save drops the tab's untitled slot (an untitled write that crossed the first save)", async () => {
    const tab = newTab()
    const path = join(userFolder, 'first.docx')
    authorizeMcpDocWrite(tab.id, path)
    await writeCopy(tab, null, 'late untitled write')
    const orphan = docsRecoveryIdentity(tab.id)!
    expect(store.copyInfo(orphan)).not.toBeNull()
    const result = await invoke<{ ok: boolean }>('docs:save', tab, path, bytesOf('doc'), false)
    expect(result.ok).toBe(true)
    expect(store.copyInfo(orphan)).toBeNull()
  })

  it('an MCP save to another path drops the copy of the path the tab left', async () => {
    const tab = newTab()
    const a = join(userFolder, 'a.docx')
    const b = join(userFolder, 'b.docx')
    authorizeMcpDocWrite(tab.id, a)
    expect((await invoke<{ ok: boolean }>('docs:save-to', tab, a, bytesOf('v1'), true)).ok).toBe(
      true,
    )
    await writeCopy(tab, a, 'unsaved after a')
    expect(store.copyInfo(fileCopy(a))).not.toBeNull()
    authorizeMcpDocWrite(tab.id, b)
    expect((await invoke<{ ok: boolean }>('docs:save-to', tab, b, bytesOf('v2'), true)).ok).toBe(
      true,
    )
    expect(store.copyInfo(fileCopy(a))).toBeNull()
  })
})

describe('restoring', () => {
  it('a renderer that boots while its untitled copy is still being read gets it', async () => {
    const writer = newTab()
    await writeCopy(writer, null, 'restore me')
    const identity = docsRecoveryIdentity(writer.id)!
    const tab = newTab()
    const opening = recoveryEditor('docs')!.openUntitledCopy(tab as never, {
      copy: identity,
      title: 'Untitled.docx',
    })
    // the renderer asks for its first document right away
    const first = await invoke<{ untitledCopy?: boolean; recovered?: boolean } | null>(
      'docs:consume-copy',
      tab,
    )
    await opening
    expect(first).toMatchObject({ untitledCopy: true, recovered: true })
    // handed over once, not again as a second open
    expect(tab.send).not.toHaveBeenCalledWith('docs:opened', expect.anything())
  })

  it('a copy that cannot be decrypted opens the file and waits as "later"', async () => {
    const tab = newTab()
    await invoke('docs:consume-copy', tab)
    const path = join(userFolder, 'locked.docx')
    const docx = Buffer.from(await buildBlankDocx({}))
    writeFileSync(path, encryptDocx(docx, 'right'))
    // a copy sealed under a password the file no longer has
    const identity = fileCopy(path)
    await store.writeCopy(identity, encryptDocx(docx, 'other'))
    store.applyLaunchDecision(identity, 'restore')
    await recoveryEditor('docs')!.openFileWithDecision(tab as never, {
      filePath: path,
      decision: 'restore',
    })
    const opened = await invoke<{ ok: boolean; result?: { recovered?: boolean } }>(
      'docs:open-decrypt',
      tab,
      path,
      'right',
    )
    expect(opened.ok).toBe(true)
    expect(opened.result?.recovered).toBeUndefined()
    expect(store.copyInfo(identity)?.state).toBe('later')
  })

  it('the renderer hears that its copy was dropped, so it copies again if still dirty', async () => {
    const tab = newTab()
    await writeCopy(tab, null, 'dropped by an MCP close')
    discardDocsRecovery(tab as never)
    expect(tab.send).toHaveBeenCalledWith('docs:recovery-copy-dropped')
  })
})

describe('a new document into the panel project (spec 6)', () => {
  type Writer = (id: number, fileName: string, bytes: Uint8Array) => Promise<string | null>
  const useWriter = (write: Writer | undefined) =>
    setDocsShellHooks(write ? ({ writeNewDocument: write } as never) : null)
  const saveIntoProject = (tab: FakeTab, name: unknown, format: unknown, text: string) =>
    invoke<{ ok: boolean; path?: string; skipped?: boolean; error?: string }>(
      'docs:save-into-project',
      tab,
      name,
      format,
      bytesOf(text),
    )

  afterAll(() => setDocsShellHooks(null))

  it('hands a bare name and the bytes to the shell writer; the tab then saves to that file', async () => {
    const tab = newTab()
    await writeCopy(tab, null, 'untitled before the first save')
    const untitled = docsRecoveryIdentity(tab.id)!
    const calls: Array<[number, string]> = []
    const target = join(userFolder, 'Report (2).docx')
    useWriter(async (id, fileName, bytes) => {
      calls.push([id, fileName])
      writeFileSync(target, bytes)
      return target
    })
    const result = await saveIntoProject(tab, 'drafts/../Report.docx', 'docx', 'made doc')
    expect(result).toMatchObject({ ok: true, path: target })
    // the folder is never the renderer's to choose: only the name goes on
    expect(calls).toEqual([[tab.id, 'Report.docx']])
    expect(readFileSync(target, 'utf8')).toBe('made doc')
    // the untitled copy is stale, and the file is the tab's own now
    expect(store.copyInfo(untitled)).toBeNull()
    const next = await invoke<{ ok: boolean }>('docs:save', tab, target, bytesOf('v2'), false)
    expect(next.ok).toBe(true)
    // a document that has its file is no new one
    expect(await saveIntoProject(tab, 'Report.docx', 'docx', 'again')).toEqual({
      ok: false,
      skipped: true,
    })
    expect(calls).toHaveLength(1)
  })

  it('an ODT copy keeps its format in the name', async () => {
    const tab = newTab()
    const names: string[] = []
    useWriter(async (_id, fileName) => {
      names.push(fileName)
      return join(userFolder, fileName)
    })
    const odt = (await docxToOdt(await buildBlankDocx({}))).odtBytes
    const result = await invoke<{ ok: boolean }>(
      'docs:save-into-project',
      tab,
      'Letter.odt',
      'odt',
      odt.buffer.slice(odt.byteOffset, odt.byteOffset + odt.byteLength),
    )
    expect(result.ok).toBe(true)
    expect(names).toEqual(['Letter.odt'])
  })

  it('without a project nothing is written and the document stays untitled', async () => {
    const tab = newTab()
    useWriter(async () => null)
    expect(await saveIntoProject(tab, 'Report.docx', 'docx', 'x')).toEqual({
      ok: false,
      skipped: true,
    })
    useWriter(undefined)
    expect(await saveIntoProject(tab, 'Report.docx', 'docx', 'x')).toEqual({
      ok: false,
      skipped: true,
    })
  })

  it('a refused write is reported with its reason; nothing is adopted', async () => {
    const tab = newTab()
    useWriter(async () => {
      throw new Error('project folder refused the write')
    })
    expect(await saveIntoProject(tab, 'Report.docx', 'docx', 'x')).toEqual({
      ok: false,
      error: 'project folder refused the write',
    })
    // still untitled: a second try goes to the writer again
    useWriter(async () => null)
    expect((await saveIntoProject(tab, 'Report.docx', 'docx', 'x')).skipped).toBe(true)
  })

  it('a malformed request writes nothing', async () => {
    const tab = newTab()
    const write = vi.fn(async () => null)
    useWriter(write)
    expect((await saveIntoProject(tab, 42, 'docx', 'x')).ok).toBe(false)
    expect(write).not.toHaveBeenCalled()
  })
})
