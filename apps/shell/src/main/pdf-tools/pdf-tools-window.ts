/**
 * The PDF tools window (decision 0030): a small separate BrowserWindow above
 * the shell window, opened from Home's "PDF tools" card. The user picks a task,
 * then its PDFs, then gets a new file; tasks that need the editor's view open
 * the file in a PDF tab instead.
 *
 * Paths never come from the window. Inputs are picked in a main-process open
 * dialog and handed to the window as opaque ids; outputs are picked in a
 * main-process save dialog, may not be a source, and come back as ids too.
 * Sources are only read. No AI and no network: tools.ts runs the editor's own
 * page functions here in the main process, as the editor's ribbon does.
 *
 * One window at a time; opening it again focuses it.
 */
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { productName, type Lang } from '@genoffice/i18n'
import {
  safeExternalUrl,
  saveAsSuggestion,
  showOpenDialogWithMemory,
  showSaveDialogWithMemory,
} from '@genoffice/electron-utils'
import { fileHasUnsavedChanges } from '@genoffice/electron-utils/unsaved-files'
import { writePdfAtomically } from '../../../../pdf/src/main/atomic-write'
import { uniqueGeneratedPdfPath } from '../../../../pdf/src/main/generated-output'
import {
  PDF_TOOLS_CHANNELS,
  type PdfPickResult,
  type PdfToolInput,
  type PdfToolRunResult,
  type PdfToolsTheme,
} from '../../shared/pdf-tools-api'
import { PDF_TOOLS_HOME_CHANNELS } from '../../shared/pdf-tools-home-channels'
import { pdfToolsText } from '../../renderer/src/i18n/strings-pdf-tools'
import {
  MAX_TOOL_INPUT_BYTES,
  checkOptions,
  inspectPdf,
  isPdfToolId,
  outputNames,
  runPdfTool,
  toolTakesMany,
} from './tools'

export interface PdfToolsWindowDeps {
  /** the window the tools window sits above */
  parentWindow(): BrowserWindow | null
  lang(): Lang
  theme(): PdfToolsTheme
  /**
   * Open a file this window just wrote. An open PDF tab on that path is
   * reloaded from disk; run() never writes over a file open with unsaved
   * changes, so nothing is lost.
   */
  openResult(path: string): boolean
  /** Open a PDF the user picked for an editor-only tool; an open tab is only focused */
  openForEditing(path: string): boolean
}

interface PickedInput extends PdfToolInput {
  path: string
}

let deps: PdfToolsWindowDeps | null = null
let win: BrowserWindow | null = null
let ipcRegistered = false
let running = false
/** this window's inputs and outputs by id; cleared when it closes */
const inputs = new Map<string, PickedInput>()
const results = new Map<string, string>()

const PDF_FILTER = { name: 'PDF', extensions: ['pdf'] }

export function configurePdfToolsWindow(next: PdfToolsWindowDeps): void {
  deps = next
  registerIpc()
}

function fromWindow(event: IpcMainInvokeEvent): boolean {
  return !!win && !win.isDestroyed() && event.sender === win.webContents
}

/** two paths name the same file (Windows paths ignore case) */
function samePath(a: string, b: string): boolean {
  const x = resolve(a)
  const y = resolve(b)
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

async function pickInputs(multi: boolean): Promise<PdfPickResult> {
  const owner = win
  const empty: PdfPickResult = { inputs: [], rejected: [] }
  if (!owner) return empty
  const picked = await showOpenDialogWithMemory(dialog, owner, {
    filters: [PDF_FILTER],
    properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
  })
  if (picked.canceled) return empty
  const out: PdfPickResult = { inputs: [], rejected: [] }
  for (const path of picked.filePaths) {
    const name = basename(path)
    try {
      const size = (await stat(path)).size
      if (size > MAX_TOOL_INPUT_BYTES) {
        out.rejected.push({ name, problem: 'too-large' })
        continue
      }
      const info = await inspectPdf(await readFile(path))
      if (!info.ok) {
        out.rejected.push({ name, problem: info.problem })
        continue
      }
      const input: PickedInput = { id: randomUUID(), name, pages: info.pages, size, path }
      inputs.set(input.id, input)
      out.inputs.push({ id: input.id, name, pages: input.pages, size })
    } catch {
      out.rejected.push({ name, problem: 'unreadable' })
    }
  }
  return out
}

async function run(raw: unknown): Promise<PdfToolRunResult> {
  const owner = win
  if (!owner) return { ok: false, error: 'failed' }
  const req = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const tool = req.tool
  if (!isPdfToolId(tool)) return { ok: false, error: 'failed' }
  const ids = Array.isArray(req.inputIds) ? req.inputIds : []
  const chosen = ids
    .map((id) => (typeof id === 'string' ? inputs.get(id) : undefined))
    .filter((input): input is PickedInput => !!input)
  if (chosen.length === 0) return { ok: false, error: 'no-input' }
  const sources = toolTakesMany(tool) ? chosen : chosen.slice(0, 1)
  if (toolTakesMany(tool) && sources.length < 2) return { ok: false, error: 'need-two' }
  if (running) return { ok: false, error: 'busy' }
  running = true
  try {
    let total = 0
    const bytes: Uint8Array[] = []
    for (const source of sources) {
      if (!existsSync(source.path)) return { ok: false, error: 'missing' }
      total += (await stat(source.path)).size
      if (total > MAX_TOOL_INPUT_BYTES) return { ok: false, error: 'too-large' }
      bytes.push(await readFile(source.path))
    }
    const first = await inspectPdf(bytes[0]!)
    if (!first.ok) return { ok: false, error: 'failed' }
    const checked = checkOptions(tool, req.options, first.pages)
    if (!checked.ok) return { ok: false, error: checked.error }
    const made = await runPdfTool(tool, bytes, checked.options)
    const names = outputNames(tool, sources[0]!.name, made.length, checked.options)
    const targets = await pickTargets(owner, sources[0]!.path, names)
    if (!targets) return { ok: false, canceled: true }
    for (const target of targets) {
      if (sources.some((source) => samePath(source.path, target))) {
        return { ok: false, error: 'same-as-source' }
      }
      if (await fileHasUnsavedChanges(target)) return { ok: false, error: 'unsaved-target' }
    }
    const outputs: { id: string; name: string }[] = []
    for (let i = 0; i < made.length; i++) {
      await writePdfAtomically(targets[i]!, made[i]!)
      const id = randomUUID()
      results.set(id, targets[i]!)
      outputs.push({ id, name: basename(targets[i]!) })
    }
    return { ok: true, outputs }
  } catch {
    return { ok: false, error: 'failed' }
  } finally {
    running = false
  }
}

/**
 * Where to write: one file asks with a save dialog next to the source; several
 * files (split) ask for a folder and take free names in it. Null: canceled.
 */
async function pickTargets(
  owner: BrowserWindow,
  sourcePath: string,
  names: string[],
): Promise<string[] | null> {
  if (names.length === 1) {
    const saved = await showSaveDialogWithMemory(dialog, owner, {
      defaultPath: saveAsSuggestion(sourcePath, names[0]!),
      filters: [PDF_FILTER],
    })
    if (saved.canceled || !saved.filePath) return null
    return [/\.pdf$/i.test(saved.filePath) ? saved.filePath : `${saved.filePath}.pdf`]
  }
  const folder = await showOpenDialogWithMemory(
    dialog,
    owner,
    { defaultPath: dirname(sourcePath), properties: ['openDirectory', 'createDirectory'] },
    dirname(sourcePath),
  )
  const dir = folder.filePaths[0]
  if (folder.canceled || !dir) return null
  const taken = new Set<string>()
  return names.map((name) => {
    const target = uniqueGeneratedPdfPath(dir, name, (p) => existsSync(p) || taken.has(p))
    taken.add(target)
    return target
  })
}

async function openInEditor(): Promise<void> {
  const owner = win
  if (!owner || !deps) return
  const picked = await showOpenDialogWithMemory(dialog, owner, {
    filters: [PDF_FILTER],
    properties: ['openFile'],
  })
  const path = picked.filePaths[0]
  if (!picked.canceled && path) deps.openForEditing(path)
}

function registerIpc(): void {
  if (ipcRegistered) return
  ipcRegistered = true
  ipcMain.handle(PDF_TOOLS_CHANNELS.getInit, (event) => {
    if (!fromWindow(event) || !deps) return null
    return { lang: deps.lang(), theme: deps.theme() }
  })
  ipcMain.handle(PDF_TOOLS_CHANNELS.pickInputs, (event, multi: unknown) => {
    if (!fromWindow(event)) return { inputs: [], rejected: [] }
    return pickInputs(multi === true)
  })
  ipcMain.handle(PDF_TOOLS_CHANNELS.run, (event, request: unknown) => {
    if (!fromWindow(event)) return { ok: false, error: 'failed' }
    return run(request)
  })
  ipcMain.handle(PDF_TOOLS_CHANNELS.openResult, (event, id: unknown) => {
    const path = fromWindow(event) && typeof id === 'string' ? results.get(id) : undefined
    if (path && existsSync(path)) deps?.openResult(path)
  })
  ipcMain.handle(PDF_TOOLS_CHANNELS.revealResult, (event, id: unknown) => {
    const path = fromWindow(event) && typeof id === 'string' ? results.get(id) : undefined
    if (path && existsSync(path)) shell.showItemInFolder(path)
  })
  ipcMain.handle(PDF_TOOLS_CHANNELS.openInEditor, (event) => {
    if (fromWindow(event)) return openInEditor()
  })
  ipcMain.handle(PDF_TOOLS_CHANNELS.close, (event) => {
    if (fromWindow(event)) win?.close()
  })
  ipcMain.handle(PDF_TOOLS_HOME_CHANNELS.open, (event) => {
    const parent = deps?.parentWindow()
    if (!parent || parent.isDestroyed() || event.sender !== parent.webContents) return
    openPdfToolsWindow()
  })
}

export function openPdfToolsWindow(): void {
  const d = deps
  if (!d) throw new Error('the PDF tools window is not configured')
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return
  }
  const lang = d.lang()
  const parent = d.parentWindow()
  const next = new BrowserWindow({
    width: 760,
    height: 720,
    minWidth: 520,
    minHeight: 520,
    ...(parent && !parent.isDestroyed() ? { parent } : {}),
    show: false,
    center: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: `${pdfToolsText(lang, 'windowTitle')} - ${productName(lang)}`,
    webPreferences: {
      preload: join(__dirname, '../preload/pdf-tools.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win = next
  next.removeMenu()
  next.webContents.setWindowOpenHandler(({ url }) => {
    const target = safeExternalUrl(url)
    if (target) void shell.openExternal(target)
    return { action: 'deny' }
  })
  next.once('ready-to-show', () => next.show())
  next.on('closed', () => {
    if (win !== next) return
    win = null
    inputs.clear()
    results.clear()
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void next.loadURL(`${process.env.ELECTRON_RENDERER_URL}/pdf-tools.html`)
  } else {
    void next.loadFile(join(__dirname, '../renderer/pdf-tools.html'))
  }
}
