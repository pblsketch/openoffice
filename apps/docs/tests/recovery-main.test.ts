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
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
} from '../src/main/docs-main'
import { encryptDocx } from '../src/main/docx-encryption'
import { buildBlankDocx } from '@genoffice/docx-engine'

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
