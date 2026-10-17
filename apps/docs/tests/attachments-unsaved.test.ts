// @vitest-environment node
/**
 * A chat attachment is read from disk. A file that is open in another tab with
 * unsaved changes may carry a withholding mark that has not reached the disk
 * yet, so it is not read until it is saved. The parser is mocked.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getAppPath: () => tmpdir(),
    getName: () => 'docs-test',
    getVersion: () => '0',
    on: () => {},
    once: () => {},
    whenReady: () => new Promise(() => {}),
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  BrowserWindow: class {},
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

const parseFileToText = vi.fn(async (_path: string) => ({
  ok: true,
  kind: 'text',
  text: 'text as last saved',
}))
vi.mock('@genoffice/file-parse', () => ({
  parseFileToText: (path: string) => parseFileToText(path),
  ATTACHABLE_EXTS: new Set([
    'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'html', 'htm',
    'log', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'h', 'cpp', 'go', 'rs', 'rb',
    'sh', 'sql', 'css', 'doc', 'docx', 'odt', 'pdf', 'pptx', 'ppt', 'xlsx', 'xlsm',
    'xls', 'xmind', 'hwp', 'hwpx', 'png', 'jpg', 'jpeg', 'gif', 'webp',
  ]),
  ATTACHABLE_IMAGE_EXTS: new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']),
  ATTACHABLE_MAX_BYTES: 50 * 1024 * 1024,
  ATTACHABLE_IMAGE_MAX_BYTES: 5 * 1024 * 1024,
}))
// this workspace's test aliases do not reach the rest of these packages, and
// the handler under test uses none of them
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
// nothing here is stored lazily; the real module reaches past the test aliases
vi.mock('../src/main/lazy-media', () => ({ registerLazyMediaProtocol: () => {} }))
vi.mock('../src/main/lazy-media-inline', () => ({}))

import { UNSAVED_CHANGES_MESSAGE, setOpenFilesSource } from '@genoffice/electron-utils'
import { registerDocsIpc } from '../src/main/docs-main'

type ReadResult = { ok: boolean; text?: string; error?: string }
let dir: string

function read(path: string): Promise<ReadResult> {
  return handlers.get('files:read')!({}, path, 0, 1000) as Promise<ReadResult>
}

beforeAll(() => {
  registerDocsIpc()
})
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-docs-attach-'))
  parseFileToText.mockClear()
})
afterEach(() => {
  setOpenFilesSource(null)
  rmSync(dir, { recursive: true, force: true })
})

describe('files:read and a file open with unsaved changes', () => {
  it('reads a file that is open but saved', async () => {
    const path = join(dir, 'saved.md')
    writeFileSync(path, 'x')
    setOpenFilesSource(() => [{ filePath: path, dirty: false }])
    expect(await read(path)).toMatchObject({ ok: true, text: 'text as last saved' })
  })

  it('does not read a file that is open with unsaved changes, and says to save it', async () => {
    const path = join(dir, 'editing.docx')
    writeFileSync(path, 'x')
    setOpenFilesSource(() => [{ filePath: path, dirty: true }])
    expect(await read(path)).toEqual({ ok: false, error: UNSAVED_CHANGES_MESSAGE })
    expect(parseFileToText).not.toHaveBeenCalled()
  })

  it('does not answer from the text cached before the edit either', async () => {
    const path = join(dir, 'cached.md')
    writeFileSync(path, 'x')
    expect((await read(path)).ok).toBe(true)
    setOpenFilesSource(() => [{ filePath: path, dirty: true }])
    expect(await read(path)).toEqual({ ok: false, error: UNSAVED_CHANGES_MESSAGE })
  })

  it('blocks nothing when the editor runs on its own, with no shell to ask', async () => {
    const path = join(dir, 'standalone.md')
    writeFileSync(path, 'x')
    expect((await read(path)).ok).toBe(true)
  })
})
