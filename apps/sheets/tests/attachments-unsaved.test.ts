/**
 * A chat attachment is read from disk. A file that is open in another tab with
 * unsaved changes may carry a withholding mark that has not reached the disk
 * yet, so it is not read until it is saved. The sidecar and the parser are
 * mocked: nothing here starts a real program.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../src/shared/ipc-channels'

type Handler = (event: { sender: unknown }, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
let lastContents: unknown

vi.mock('electron', () => ({
  app: {
    getPath: () => tmpdir(),
    getName: () => 'sheets-test',
    getVersion: () => '0',
    getAppPath: () => tmpdir(),
    isPackaged: false,
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
  WebContentsView: class {
    webContents = (lastContents = {
      id: 901,
      isDestroyed: () => false,
      setWindowOpenHandler: vi.fn(),
      loadURL: vi.fn(),
      send: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
    })
  },
  desktopCapturer: {},
  dialog: {},
  net: {},
  screen: {},
  session: {},
  shell: {},
  systemPreferences: {},
  webContents: { getAllWebContents: () => [], fromId: () => null },
}))

// no spreadsheet engine process: a tab only needs a client object to exist
vi.mock('../src/main/xlsx-sidecar-client', () => ({
  XlsxSidecarClient: class {
    start(): void {}
    onProcessExit(): void {}
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

// no status check: registering the subscription channels would look for the CLIs
vi.mock('@genoffice/ai-provider/subscription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/ai-provider/subscription')>()),
  ensureSubscriptionIpc: () => ({}),
  sharedSubscriptionStatuses: () => ({}),
}))

import { UNSAVED_CHANGES_MESSAGE, setOpenFilesSource } from '@genoffice/electron-utils'
import { createSheetsView } from '../src/main/sheets-main'

type ReadResult = { ok: boolean; text?: string; error?: string }
let dir: string

function read(path: string): Promise<ReadResult> {
  if (!lastContents) createSheetsView({ includeAiHandlers: false })
  const handler = handlers.get(IPC_CHANNELS.filesRead)!
  return handler({ sender: lastContents }, path, 0, 1000) as Promise<ReadResult>
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-sheets-attach-'))
  parseFileToText.mockClear()
})
afterEach(() => {
  setOpenFilesSource(null)
  rmSync(dir, { recursive: true, force: true })
})

describe('sheets files-read and a file open with unsaved changes', () => {
  it('reads a file that is open but saved', async () => {
    const path = join(dir, 'saved.md')
    writeFileSync(path, 'x')
    setOpenFilesSource(() => [{ filePath: path, dirty: false }])
    expect(await read(path)).toMatchObject({ ok: true, text: 'text as last saved' })
  })

  it('does not read a file that is open with unsaved changes, and says to save it', async () => {
    const path = join(dir, 'editing.pptx')
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

describe('merging attached workbooks and a file open with unsaved changes', () => {
  /** how the handler behind merge_attached_workbooks answers: 'opened', or the error text */
  async function openForMerge(paths: string[]): Promise<string> {
    if (!lastContents) createSheetsView({ includeAiHandlers: false })
    const handler = handlers.get(IPC_CHANNELS.openWorkbooksForMerge)!
    try {
      await handler({ sender: lastContents }, paths)
      return 'opened'
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  const workbook = (name: string) => {
    const path = join(dir, name)
    writeFileSync(path, 'x')
    return path
  }

  it('does not open an attached workbook that is open with unsaved changes', async () => {
    const path = workbook('editing.xlsx')
    setOpenFilesSource(() => [{ filePath: path, dirty: true }])
    expect(await openForMerge([path])).toBe(UNSAVED_CHANGES_MESSAGE)
  })

  it('refuses the whole merge when any one of the workbooks is unsaved', async () => {
    const saved = workbook('saved.xlsx')
    const editing = workbook('editing.csv')
    setOpenFilesSource(() => [
      { filePath: saved, dirty: false },
      { filePath: editing, dirty: true },
    ])
    expect(await openForMerge([saved, editing])).toBe(UNSAVED_CHANGES_MESSAGE)
  })

  it('hands a saved workbook on to the engine', async () => {
    const path = workbook('saved.xlsx')
    setOpenFilesSource(() => [{ filePath: path, dirty: false }])
    // the engine is a stub here, so the open itself may fail: only not for this reason
    expect(await openForMerge([path])).not.toBe(UNSAVED_CHANGES_MESSAGE)
  })
})
