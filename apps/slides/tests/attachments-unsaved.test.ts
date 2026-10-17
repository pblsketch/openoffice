/**
 * A chat attachment is read from disk. A deck, document or page that is open in
 * another tab with unsaved changes may carry a withholding mark that has not
 * reached the file yet, so it is not read until it is saved.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  dialog: {},
  ipcMain: {
    handle: (channel: string, fn: (...args: never[]) => unknown) => handlers.set(channel, fn),
  },
  BrowserWindow: class {},
  webContents: {},
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
vi.mock('@genoffice/cli/agent-skills', () => ({}))
vi.mock('@genoffice/cli/install', () => ({}))
// the real unsaved-files helper, by path: the package root reaches Electron
vi.mock('@genoffice/electron-utils', async () => ({
  showOpenDialogWithMemory: vi.fn(),
  ...(await import('../../../packages/electron-utils/src/unsaved-files')),
}))
vi.mock('../src/main/session-state', () => ({ dialogParent: vi.fn(() => null) }))

import {
  UNSAVED_CHANGES_MESSAGE,
  setOpenFilesSource,
} from '../../../packages/electron-utils/src/unsaved-files'
import { registerAttachmentIpc } from '../src/main/attachments-ipc'

type ReadResult = { ok: boolean; text?: string; error?: string }
let dir: string

function read(path: string): Promise<ReadResult> {
  handlers.clear()
  registerAttachmentIpc()
  const fn = handlers.get('slides:files-read') as unknown as (
    e: unknown,
    path: string,
    offset: number,
    maxChars: number,
  ) => Promise<ReadResult>
  return fn({}, path, 0, 1000)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-slides-attach-'))
  parseFileToText.mockClear()
})
afterEach(() => {
  setOpenFilesSource(null)
  rmSync(dir, { recursive: true, force: true })
})

describe('slides:files-read and a file open with unsaved changes', () => {
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
