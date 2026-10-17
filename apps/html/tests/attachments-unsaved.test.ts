// @vitest-environment node
/**
 * A chat attachment is read from disk. A file that is open in another tab with
 * unsaved changes may carry a withholding mark that has not reached the disk
 * yet, so it is not read until it is saved.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: () => new Promise(() => {}),
    getPath: (name: string) => join('/fake', name),
  },
  dialog: {},
  shell: {},
  net: {},
  protocol: { handle: vi.fn() },
  webContents: { fromId: () => null, getAllWebContents: () => [] },
  BrowserWindow: { fromWebContents: () => null },
  WebContentsView: class {
    webContents = {
      id: 1,
      isDestroyed: () => false,
      setWindowOpenHandler: vi.fn(),
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    }
  },
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    on: (channel: string, fn: Handler) => handlers.set(channel, fn),
    removeHandler: vi.fn(),
  },
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
vi.mock('@genoffice/ai-provider/subscription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider/subscription')>()),
  sharedSubscriptionStatuses: () => ({}),
}))

import { UNSAVED_CHANGES_MESSAGE, setOpenFilesSource } from '@genoffice/electron-utils'
import { createHtmlView } from '../src/main/html-main'
import { HTML_CHANNELS } from '../src/shared/ipc'

type ReadResult = { ok: boolean; text?: string; error?: string }
let dir: string

function read(path: string): Promise<ReadResult> {
  if (!handlers.has(HTML_CHANNELS.filesRead)) createHtmlView(null)
  return handlers.get(HTML_CHANNELS.filesRead)!({}, path, 0, 1000) as Promise<ReadResult>
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-html-attach-'))
  parseFileToText.mockClear()
})
afterEach(() => {
  setOpenFilesSource(null)
  rmSync(dir, { recursive: true, force: true })
})

describe('html files-read and a file open with unsaved changes', () => {
  it('reads a file that is open but saved', async () => {
    const path = join(dir, 'saved.md')
    writeFileSync(path, 'x')
    setOpenFilesSource(() => [{ filePath: path, dirty: false }])
    expect(await read(path)).toMatchObject({ ok: true, text: 'text as last saved' })
  })

  it('does not read a file that is open with unsaved changes, and says to save it', async () => {
    const path = join(dir, 'editing.html')
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
