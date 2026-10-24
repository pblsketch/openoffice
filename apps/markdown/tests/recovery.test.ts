// @vitest-environment node
/**
 * Crash-recovery copies of the Markdown editor: while a document has unsaved
 * changes the renderer hands over the text a save would write, kept in
 * <userData>/markdown-autosave; saves and "Don't Save" delete it, opening a
 * file with a copy asks the shared per-file prompt first, untitled documents
 * keep their copies in the app data folder only, and the user's file is never
 * written by any of it.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: { sender: FakeWebContents }, ...args: unknown[]) => unknown

interface FakeWebContents {
  id: number
  listeners: Map<string, () => void>
  isDestroyed: ReturnType<typeof vi.fn>
  loadFile: ReturnType<typeof vi.fn>
  loadURL: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  reload: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  setWindowOpenHandler: ReturnType<typeof vi.fn>
}

const handlers = new Map<string, IpcHandler>()
const showMessageBox = vi.fn()
const showSaveDialogWithMemory = vi.fn()
const webContents: FakeWebContents[] = []
let nextWebContentsId = 1
let userDataDir = tmpdir()
let defaultSaveDir = tmpdir()

function makeWebContents(): FakeWebContents {
  const listeners = new Map<string, () => void>()
  const contents: FakeWebContents = {
    id: nextWebContentsId++,
    listeners,
    isDestroyed: vi.fn(() => false),
    loadFile: vi.fn(),
    loadURL: vi.fn(),
    once: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    reload: vi.fn(),
    send: vi.fn(),
    setWindowOpenHandler: vi.fn(),
  }
  webContents.push(contents)
  return contents
}

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => userDataDir),
    on: vi.fn(),
    quit: vi.fn(),
    whenReady: vi.fn(() => new Promise(() => {})),
  },
  BrowserWindow: class {
    static fromWebContents() {
      return null
    }
    static getFocusedWindow() {
      return null
    }
  },
  dialog: {
    showMessageBox: (...args: unknown[]) => showMessageBox(...args),
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)),
    on: vi.fn((channel: string, handler: IpcHandler) => handlers.set(channel, handler)),
    removeHandler: vi.fn(),
  },
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn() },
  shell: { openExternal: vi.fn() },
  WebContentsView: class {
    webContents = makeWebContents()
  },
}))

vi.mock('@genoffice/electron-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genoffice/electron-utils')>()),
  configuredDefaultSaveDir: vi.fn(() => defaultSaveDir),
  contextMenuLabels: vi.fn(() => ({})),
  installContextMenu: vi.fn(),
  installNavigationGuard: vi.fn(),
  rendererUrl: vi.fn(() => 'genoffice-app://markdown/index.html'),
  safeExternalUrl: vi.fn(() => null),
  showOpenDialogWithMemory: vi.fn(),
  showSaveDialogWithMemory: (...args: unknown[]) => showSaveDialogWithMemory(...args),
}))

import {
  createRecoveryStore,
  markAppShuttingDown,
  newUntitledRecoveryId,
  recoveryEditor,
  resetAppShuttingDown,
  resumeDiscardedCopies,
  type RecoveryIdentity,
} from '@genoffice/electron-utils'
import {
  createMarkdownView,
  markdownDiscardPendingAssets,
  markdownRecoveryEditor,
  markdownRecoveryIdentity,
  markdownSaveToPath,
  requestMarkdownClose,
  setMarkdownRecoveryTitleSource,
  markdownFileRenamed,
} from '../src/main/markdown-main'
import { MARKDOWN_CHANNELS } from '../src/shared/ipc'
import type { SaveMarkdownResult } from '../src/shared/ipc'

const temporaryDirectories: string[] = []

function tempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

const store = () => createRecoveryStore({ userDataDir: () => userDataDir })

function createDocument(text = '# Saved'): string {
  const path = join(tempDir('markdown-recovery-doc-'), 'note.md')
  writeFileSync(path, text)
  return path
}

function openView(path?: string): FakeWebContents {
  return createMarkdownView(path).webContents as unknown as FakeWebContents
}

const setDirty = (contents: FakeWebContents, dirty: boolean) =>
  handlers.get(MARKDOWN_CHANNELS.dirtyChanged)!({ sender: contents }, dirty)

const writeCopy = (contents: FakeWebContents, text: string | null) =>
  handlers.get(MARKDOWN_CHANNELS.recoveryWrite)!({ sender: contents }, text) as Promise<string>

const recoveryOpen = (contents: FakeWebContents) =>
  handlers.get(MARKDOWN_CHANNELS.recoveryOpen)!({ sender: contents }) as Promise<{
    text: string
    originalPath?: string
  } | null>

const save = (contents: FakeWebContents, request: unknown) =>
  handlers.get(MARKDOWN_CHANNELS.save)!(
    { sender: contents },
    request,
  ) as Promise<SaveMarkdownResult>

const fileId = (filePath: string): RecoveryIdentity => ({ kind: 'markdown', filePath })

function destroy(contents: FakeWebContents): void {
  contents.isDestroyed.mockReturnValue(true)
  contents.listeners.get('destroyed')?.()
  webContents.splice(webContents.indexOf(contents), 1)
}

beforeEach(() => {
  userDataDir = tempDir('markdown-recovery-userdata-')
  defaultSaveDir = tempDir('markdown-recovery-saves-')
})

afterEach(() => {
  resetAppShuttingDown()
  resumeDiscardedCopies()
  setMarkdownRecoveryTitleSource(null)
  showMessageBox.mockReset()
  showSaveDialogWithMemory.mockReset()
  for (const contents of webContents.splice(0)) contents.listeners.get('destroyed')?.()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('writing copies', () => {
  it('keeps the exact text while dirty, skips an unchanged text, never touches the file', async () => {
    const path = createDocument()
    const before = statSync(path).mtimeMs
    const contents = openView(path)
    setDirty(contents, true)

    await expect(writeCopy(contents, '# Saved\n\nedited\n')).resolves.toBe('written')
    const copyPath = store().copyPath(fileId(path))
    expect(copyPath.startsWith(join(userDataDir, 'markdown-autosave'))).toBe(true)
    expect(readFileSync(copyPath, 'utf8')).toBe('# Saved\n\nedited\n')
    expect(store().copyInfo(fileId(path))).toMatchObject({ state: 'undecided', title: 'note.md' })

    await expect(writeCopy(contents, '# Saved\n\nedited\n')).resolves.toBe('unchanged')
    await expect(writeCopy(contents, '# Saved\n\nmore\n')).resolves.toBe('written')
    expect(readFileSync(copyPath, 'utf8')).toBe('# Saved\n\nmore\n')

    expect(readFileSync(path, 'utf8')).toBe('# Saved')
    expect(statSync(path).mtimeMs).toBe(before)
  })

  it('writes nothing for a document without unsaved changes', async () => {
    const path = createDocument()
    const contents = openView(path)
    await expect(writeCopy(contents, 'text')).resolves.toBe('skipped')
    expect(store().copyInfo(fileId(path))).toBeNull()
  })

  it('keeps an untitled copy in the app data folder only, titled after the tab', async () => {
    const contents = openView()
    setMarkdownRecoveryTitleSource(() => 'AI Markdown 2')
    setDirty(contents, true)

    await expect(writeCopy(contents, '# Draft\n')).resolves.toBe('written')
    const identity = markdownRecoveryIdentity(contents.id)!
    expect(identity).toMatchObject({ kind: 'markdown', ext: '.md' })
    const copyPath = store().copyPath(identity)
    expect(copyPath.startsWith(join(userDataDir, 'markdown-autosave', 'untitled'))).toBe(true)
    expect(readFileSync(copyPath, 'utf8')).toBe('# Draft\n')
    expect(store().copyInfo(identity)).toMatchObject({ title: 'AI Markdown 2', filePath: null })
  })

  it('writes every dirty document now when the OS ends the session', async () => {
    const path = createDocument()
    const contents = openView(path)
    setDirty(contents, true)
    contents.send.mockImplementation((channel: string) => {
      if (channel === MARKDOWN_CHANNELS.recoveryFlushRequest) void writeCopy(contents, '# now\n')
    })

    await recoveryEditor('markdown')!.writeCopiesNow()

    expect(readFileSync(store().copyPath(fileId(path)), 'utf8')).toBe('# now\n')
  })
})

describe('deleting copies', () => {
  it('deletes the copy after a manual save and after an AutoSave', async () => {
    const path = createDocument()
    const contents = openView(path)
    setDirty(contents, true)
    await writeCopy(contents, 'one')
    expect(await save(contents, { text: 'one', mode: 'save' })).toMatchObject({ ok: true, path })
    expect(store().copyInfo(fileId(path))).toBeNull()

    setDirty(contents, true)
    await writeCopy(contents, 'two')
    expect(await save(contents, { text: 'two', mode: 'save', auto: true })).toMatchObject({
      ok: true,
    })
    expect(store().copyInfo(fileId(path))).toBeNull()
    expect(readFileSync(path, 'utf8')).toBe('two')
  })

  it("deletes the copy on Don't Save, keeps it on Cancel", async () => {
    const path = createDocument()
    const contents = openView(path)
    setDirty(contents, true)
    await writeCopy(contents, 'unsaved')

    showMessageBox.mockResolvedValueOnce({ response: 2 })
    await expect(requestMarkdownClose(contents as never)).resolves.toBe(false)
    expect(store().copyInfo(fileId(path))).not.toBeNull()

    showMessageBox.mockResolvedValueOnce({ response: 1 })
    await expect(requestMarkdownClose(contents as never)).resolves.toBe(true)
    expect(store().copyInfo(fileId(path))).toBeNull()
    expect(readFileSync(path, 'utf8')).toBe('# Saved')
  })

  it("writes no copy after Don't Save while the window still asks other tabs, until the close is cancelled", async () => {
    const path = createDocument()
    const contents = openView(path)
    setDirty(contents, true)
    await writeCopy(contents, 'unsaved')
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    await expect(requestMarkdownClose(contents as never)).resolves.toBe(true)
    // the window close walks on to the next tab: this one is still open and dirty
    await expect(writeCopy(contents, 'unsaved')).resolves.toBe('superseded')
    expect(store().copyInfo(fileId(path))).toBeNull()
    // a later tab cancels the close: this tab copies again at its next tick
    resumeDiscardedCopies()
    await expect(writeCopy(contents, 'unsaved')).resolves.toBe('written')
    expect(readFileSync(store().copyPath(fileId(path)), 'utf8')).toBe('unsaved')
  })

  it('deletes the copy when an MCP tool closes the document without saving', async () => {
    const contents = openView()
    setDirty(contents, true)
    await writeCopy(contents, 'draft')
    const identity = markdownRecoveryIdentity(contents.id)!
    expect(store().copyInfo(identity)).not.toBeNull()

    await markdownDiscardPendingAssets(contents as never)

    expect(store().copyInfo(identity)).toBeNull()
  })

  it('deletes its copy when the tab closes clean, keeps it when unsaved or crashed', async () => {
    const cleanPath = createDocument()
    const clean = openView(cleanPath)
    setDirty(clean, true)
    await writeCopy(clean, 'typed')
    setDirty(clean, false) // undone back to the saved text
    destroy(clean)
    expect(store().copyInfo(fileId(cleanPath))).toBeNull()

    const dirtyPath = createDocument()
    const dirty = openView(dirtyPath)
    setDirty(dirty, true)
    await writeCopy(dirty, 'typed')
    destroy(dirty)
    expect(store().copyInfo(fileId(dirtyPath))).not.toBeNull()

    const crashedPath = createDocument()
    const crashed = openView(crashedPath)
    setDirty(crashed, true)
    await writeCopy(crashed, 'typed')
    crashed.listeners.get('render-process-gone')?.()
    setDirty(crashed, false)
    destroy(crashed)
    expect(store().copyInfo(fileId(crashedPath))).not.toBeNull()
  })

  it("never deletes on a clean close while the app is ending; Don't Save still does", async () => {
    const path = createDocument()
    const contents = openView(path)
    setDirty(contents, true)
    await writeCopy(contents, 'typed')
    setDirty(contents, false)
    markAppShuttingDown()
    destroy(contents)
    expect(store().copyInfo(fileId(path))).not.toBeNull()

    const other = createDocument()
    const prompted = openView(other)
    setDirty(prompted, true)
    await writeCopy(prompted, 'typed')
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    await requestMarkdownClose(prompted as never)
    expect(store().copyInfo(fileId(other))).toBeNull()
  })
})

describe('opening a document that has a copy', () => {
  async function leaveCopy(path: string, text: string): Promise<void> {
    await store().writeCopy(fileId(path), Buffer.from(text, 'utf8'))
  }

  it('asks with the document name and restores the copy, original untouched', async () => {
    const path = createDocument()
    await leaveCopy(path, '# Before the crash\n')
    const contents = openView(path)
    showMessageBox.mockResolvedValueOnce({ response: 0 })

    await expect(recoveryOpen(contents)).resolves.toEqual({ text: '# Before the crash\n' })

    expect(showMessageBox).toHaveBeenCalledTimes(1)
    const box = showMessageBox.mock.calls[0]!.at(-1) as { message: string; cancelId: number }
    expect(box.message).toContain('note.md')
    expect(readFileSync(path, 'utf8')).toBe('# Saved')
    // the copy stays until the restored document is saved or dropped
    expect(store().copyInfo(fileId(path))).toMatchObject({ state: 'undecided' })
  })

  it('treats Esc (the cancel answer) as restore', async () => {
    const path = createDocument()
    await leaveCopy(path, 'kept')
    const contents = openView(path)
    showMessageBox.mockImplementationOnce(async (...args: unknown[]) => ({
      response: (args.at(-1) as { cancelId: number }).cancelId,
    }))

    await expect(recoveryOpen(contents)).resolves.toEqual({ text: 'kept' })
  })

  it('opens the file and deletes the copy on Discard', async () => {
    const path = createDocument()
    await leaveCopy(path, 'old')
    const contents = openView(path)
    showMessageBox.mockResolvedValueOnce({ response: 1 })

    await expect(recoveryOpen(contents)).resolves.toBeNull()
    expect(store().copyInfo(fileId(path))).toBeNull()
    expect(readFileSync(path, 'utf8')).toBe('# Saved')
  })

  it('restores without asking when the launch list chose restore', async () => {
    const path = createDocument()
    await leaveCopy(path, 'chosen')
    store().applyLaunchDecision(fileId(path), 'restore')
    const contents = openView(path)

    await expect(recoveryOpen(contents)).resolves.toEqual({ text: 'chosen' })
    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('follows the decision the shell gives a restored tab', async () => {
    const path = createDocument()
    await leaveCopy(path, 'copy text')
    const original = openView()
    await markdownRecoveryEditor.openFileWithDecision(original as never, {
      filePath: path,
      decision: 'original',
    })
    await expect(recoveryOpen(original)).resolves.toBeNull()
    expect(showMessageBox).not.toHaveBeenCalled()
    expect(store().copyInfo(fileId(path))).not.toBeNull()

    const restored = openView()
    await markdownRecoveryEditor.openFileWithDecision(restored as never, {
      filePath: path,
      decision: 'restore',
    })
    // the restored tab saves to the original path, after it opened unsaved
    expect(await handlers.get(MARKDOWN_CHANNELS.consumePending)!({ sender: restored })).toBe(path)
    await expect(recoveryOpen(restored)).resolves.toEqual({ text: 'copy text' })
    setDirty(restored, true)
    expect(await save(restored, { text: 'copy text', mode: 'save' })).toMatchObject({ path })
    expect(readFileSync(path, 'utf8')).toBe('copy text')
    expect(store().copyInfo(fileId(path))).toBeNull()
  })

  it('reloads a renderer that already asked when the decision comes later', async () => {
    const path = createDocument()
    const contents = openView()
    await recoveryOpen(contents)
    await markdownRecoveryEditor.openFileWithDecision(contents as never, {
      filePath: path,
      decision: 'original',
    })
    expect(contents.reload).toHaveBeenCalledTimes(1)
  })
})

describe('untitled copies', () => {
  it('reopens an untitled copy as an untitled tab, asks where on the first save, then deletes it', async () => {
    const identity: RecoveryIdentity = {
      kind: 'markdown',
      untitledId: newUntitledRecoveryId(),
      ext: '.md',
    }
    await store().writeCopy(identity, Buffer.from('# Untitled work\n', 'utf8'), {
      title: 'AI Markdown',
    })
    const contents = openView()
    await markdownRecoveryEditor.openUntitledCopy(contents as never, {
      copy: identity,
      title: 'AI Markdown',
    })

    expect(await handlers.get(MARKDOWN_CHANNELS.consumePending)!({ sender: contents })).toBeNull()
    await expect(recoveryOpen(contents)).resolves.toEqual({ text: '# Untitled work\n' })
    setDirty(contents, true)
    // later copies of the reopened tab replace the same copy
    await writeCopy(contents, '# Untitled work\n\nmore\n')
    expect(readFileSync(store().copyPath(identity), 'utf8')).toBe('# Untitled work\n\nmore\n')

    const target = join(tempDir('markdown-recovery-target-'), 'saved.md')
    showSaveDialogWithMemory.mockResolvedValueOnce({ canceled: false, filePath: target })
    expect(await save(contents, { text: '# Untitled work\n\nmore\n', mode: 'save' })).toMatchObject(
      { ok: true, path: target },
    )
    expect(showSaveDialogWithMemory).toHaveBeenCalledTimes(1)
    expect(store().copyInfo(identity)).toBeNull()
  })

  it('offers the missing original path as the first Save As default', async () => {
    const missing = join(tempDir('markdown-recovery-gone-'), 'gone.md')
    const identity = fileId(missing)
    await store().writeCopy(identity, Buffer.from('lost file', 'utf8'))
    const contents = openView()
    await markdownRecoveryEditor.openUntitledCopy(contents as never, {
      copy: identity,
      title: 'gone.md',
      saveAsDefaultPath: missing,
    })
    // the editor learns the original's name (its format) but the document stays untitled
    await expect(recoveryOpen(contents)).resolves.toEqual({
      text: 'lost file',
      originalPath: missing,
    })
    expect(await handlers.get(MARKDOWN_CHANNELS.consumePending)!({ sender: contents })).toBeNull()
    setDirty(contents, true)

    showSaveDialogWithMemory.mockResolvedValueOnce({ canceled: true })
    await save(contents, { text: 'lost file', mode: 'save' })
    const options = showSaveDialogWithMemory.mock.calls[0]![2] as { defaultPath: string }
    expect(options.defaultPath).toBe(missing)
    expect(existsSync(missing)).toBe(false)
  })

  it('names the original of a restored plain-text copy so its format survives', async () => {
    const missing = join(tempDir('markdown-recovery-gone-'), 'notes.txt')
    const identity = fileId(missing)
    await store().writeCopy(identity, Buffer.from('*not* markdown\n', 'utf8'))
    const contents = openView()
    await markdownRecoveryEditor.openUntitledCopy(contents as never, {
      copy: identity,
      title: 'notes.txt',
    })
    await expect(recoveryOpen(contents)).resolves.toEqual({
      text: '*not* markdown\n',
      originalPath: missing,
    })
    expect(markdownRecoveryIdentity(contents.id)).toEqual(identity)
    // the first Save As suggests that file, so the text goes back to a .txt
    setDirty(contents, true)
    showSaveDialogWithMemory.mockResolvedValueOnce({ canceled: true })
    await save(contents, { text: '*not* markdown\n', mode: 'save' })
    const options = showSaveDialogWithMemory.mock.calls[0]![2] as { defaultPath: string }
    expect(options.defaultPath).toBe(missing)
  })

  it('creates nothing outside the app data folder for an untitled document', async () => {
    const contents = openView()
    setDirty(contents, true)
    await writeCopy(contents, 'draft')
    const { readdirSync } = await import('node:fs')
    expect(readdirSync(defaultSaveDir)).toEqual([])
  })
})

describe('two panes on the same file', () => {
  it("lets the other pane write its copy again after one pane saves or picks Don't Save", async () => {
    const path = createDocument()
    const first = openView(path)
    const second = openView(path)
    setDirty(first, true)
    setDirty(second, true)
    await writeCopy(first, 'first pane')
    await writeCopy(second, 'second pane')

    expect(await save(first, { text: 'first pane', mode: 'save' })).toMatchObject({
      ok: true,
      path,
    })
    expect(store().copyInfo(fileId(path))).toBeNull()
    // the other pane still has unsaved work: its next tick writes the copy again
    await expect(writeCopy(second, 'second pane')).resolves.toBe('written')
    expect(readFileSync(store().copyPath(fileId(path)), 'utf8')).toBe('second pane')

    setDirty(first, true)
    await writeCopy(first, 'first again')
    showMessageBox.mockResolvedValueOnce({ response: 1 })
    await expect(requestMarkdownClose(first as never)).resolves.toBe(true)
    expect(store().copyInfo(fileId(path))).toBeNull()
    await expect(writeCopy(second, 'second pane')).resolves.toBe('written')
    expect(readFileSync(store().copyPath(fileId(path)), 'utf8')).toBe('second pane')
  })
})

describe('a failed save to a given path (MCP)', () => {
  it("leaves no copy under the target and keeps writing the document's own copy", async () => {
    const contents = openView()
    setDirty(contents, true)
    await writeCopy(contents, 'draft')
    const own = markdownRecoveryIdentity(contents.id)!
    const target = join(tempDir('markdown-recovery-mcp-'), 'out.md')

    const saving = markdownSaveToPath(contents as never, target)
    // a copy tick lands while the save is pointed at the target
    await expect(writeCopy(contents, 'draft 2')).resolves.toBe('written')
    expect(store().copyInfo(fileId(target))).not.toBeNull()
    // the renderer's save fails
    await save(contents, { text: 42 })
    await expect(saving).rejects.toThrow()

    expect(store().copyInfo(fileId(target))).toBeNull()
    // nothing was discarded by the user: a later document at that path copies as usual
    expect(store().isDiscarded(fileId(target))).toBe(false)
    expect(existsSync(target)).toBe(false)
    expect(markdownRecoveryIdentity(contents.id)).toEqual(own)
    await expect(writeCopy(contents, 'draft 2')).resolves.toBe('written')
    expect(readFileSync(store().copyPath(own), 'utf8')).toBe('draft 2')
  })

  it("keeps the copy when the failed save pointed at the document's own path", async () => {
    const path = createDocument()
    const contents = openView(path)
    setDirty(contents, true)
    const saving = markdownSaveToPath(contents as never, path)
    await writeCopy(contents, 'typed')
    await save(contents, { text: 42 })
    await expect(saving).rejects.toThrow()
    expect(readFileSync(store().copyPath(fileId(path)), 'utf8')).toBe('typed')
  })
})

describe('a file renamed while open', () => {
  it('moves the copy to the new path at the next write', async () => {
    const path = createDocument()
    const contents = openView(path)
    setDirty(contents, true)
    await writeCopy(contents, 'typed')
    const renamedPath = path.replace(/\.md$/, '-renamed.md')
    renameSync(path, renamedPath)

    markdownFileRenamed(contents as never, path, renamedPath)

    expect(contents.send).toHaveBeenCalledWith(MARKDOWN_CHANNELS.recoveryFlushRequest)
    expect(store().copyInfo(fileId(path))).not.toBeNull()
    await writeCopy(contents, 'typed')
    expect(readFileSync(store().copyPath(fileId(renamedPath)), 'utf8')).toBe('typed')
    expect(store().copyInfo(fileId(path))).toBeNull()
  })
})
