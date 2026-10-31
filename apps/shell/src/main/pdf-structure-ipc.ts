/**
 * The pdf editor's structure-job and result-store channels (PDF_CHANNELS
 * structure* / store*). Each structure job runs in its own Electron
 * utilityProcess (pdf-structure/pdf-structure-process.ts), so a large document never
 * stalls the shell main process; the light store calls run here.
 *
 * A job ends with its process: when it answers, when the renderer cancels it,
 * when its tab closes (the view's webContents is destroyed), and when the app
 * quits. Logic and permission checks live in pdf-structure/handlers.ts.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, app, dialog, ipcMain, utilityProcess, webContents } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { showOpenDialogWithMemory, showSaveDialogWithMemory } from '@genoffice/electron-utils'
import { PDF_CHANNELS } from '../../../pdf/src/shared/ipc'
import type { PdfStructureProgress } from '../../../pdf/src/shared/ipc'
import { pdfPathGranted } from '../../../pdf/src/main/pdf-main'
import { hbSubsetWasmPath, pdfiumWasmPath, qpdfWasmPath } from '../../../pdf/src/main/wasm-path'
import { ResultStore, documentHashOfFile } from '../../../../packages/pdf-structure/src/store'
import {
  createPdfStructureHandlers,
  targetExtension,
  targetFilterName,
  type CallContext,
  type PdfStructureHandlers,
} from './pdf-structure/handlers'
import { StructureJobRunner, type JobProcess, type JobRunOutcome } from './pdf-structure/runner'
import type { ProcessSetup, StructureJob } from './pdf-structure/protocol'
import processEntryPath from './pdf-structure/pdf-structure-process?modulePath'

/** OCR helper candidates, same order as pdf2docx-local.ts (packaged first, then the repo build) */
function ocrHelperPaths(): string[] {
  const here = dirname(fileURLToPath(import.meta.url))
  const helper = process.platform === 'darwin' ? 'vision-ocr' : 'win-ocr.exe'
  return [
    ...(process.resourcesPath ? [join(process.resourcesPath, 'ocr', helper)] : []),
    join(here, '../../../../packages/pdf2docx/ocr-helper', helper),
  ]
}

function processSetup(): ProcessSetup {
  return {
    wasmPath: pdfiumWasmPath(),
    ocrHelperPaths: ocrHelperPaths(),
    userDataDir: app.getPath('userData'),
    hbSubsetWasmPath: hbSubsetWasmPath(),
    qpdfWasmPath: qpdfWasmPath(),
  }
}

function spawnJobProcess(): JobProcess {
  return utilityProcess.fork(processEntryPath, [], { serviceName: 'pdf-structure' })
}

let handlers: PdfStructureHandlers | null = null
let runner: StructureJobRunner | null = null

/** the views whose lifetime already ends their jobs */
const watched = new Set<number>()

function watch(contents: WebContents): void {
  const id = contents.id
  if (watched.has(id)) return
  watched.add(id)
  // closing the tab (or its detached window) destroys the view
  contents.once('destroyed', () => {
    watched.delete(id)
    handlers?.forgetOwner(id)
  })
  // a crashed renderer cannot take the answer any more
  contents.on('render-process-gone', () => runner?.cancelOwner(id))
}

function context(e: IpcMainInvokeEvent): CallContext {
  const sender = e.sender
  watch(sender)
  return {
    owner: sender.id,
    progress: (progress: PdfStructureProgress) => {
      if (!sender.isDestroyed()) sender.send(PDF_CHANNELS.structureProgress, progress)
    },
  }
}

/**
 * Run a job for another window of the shell (the PDF tools window) in a
 * process of its own, ended with that window like a tab's jobs are.
 */
export function runWindowJob(
  owner: WebContents,
  jobId: string,
  job: StructureJob,
  onProgress?: (done: number, total: number) => void,
): Promise<JobRunOutcome> {
  if (!runner) return Promise.resolve({ ok: false, error: 'not-available' })
  watch(owner)
  return runner.run(owner.id, jobId, job, onProgress)
}

/** end a job runWindowJob started; false when it no longer runs */
export function cancelWindowJob(owner: number, jobId: string): boolean {
  return runner?.cancel(owner, jobId) ?? false
}

/**
 * Grant a Markdown target the shell's own save dialog picked (PDF Save As ›
 * Markdown) to a pdf view, so its conversion dialog may write there. The path
 * never comes from the renderer. False = no structure handlers yet, or the
 * source/target failed the same checks a dialog-picked target passes.
 */
export function grantPdfStructureTarget(
  contents: WebContents,
  sourcePath: string,
  outPath: string,
  kind: 'md',
): boolean {
  if (!handlers || contents.isDestroyed()) return false
  return handlers.grantTarget(contents.id, sourcePath, outPath, kind)
}

export function registerPdfStructureIpc(): void {
  if (handlers) return
  const jobRunner = new StructureJobRunner(spawnJobProcess, processSetup)
  runner = jobRunner
  let store: ResultStore | null = null
  const h = createPdfStructureHandlers({
    runner: jobRunner,
    store: () => (store ??= new ResultStore(app.getPath('userData'))),
    isGranted: (owner, path) => pdfPathGranted(owner, path),
    hashFile: documentHashOfFile,
    caseInsensitivePaths: process.platform === 'win32' || process.platform === 'darwin',
    pickPath: async (owner, request) => {
      const sender = webContents.fromId(owner)
      const win =
        (sender && BrowserWindow.fromWebContents(sender)) ??
        BrowserWindow.getFocusedWindow() ??
        undefined
      if (request.kind === 'folder') {
        const picked = await showOpenDialogWithMemory(dialog, win, {
          ...(request.title ? { title: request.title } : {}),
          defaultPath: request.defaultPath,
          properties: ['openDirectory', 'createDirectory'],
        })
        return picked.canceled ? null : (picked.filePaths[0] ?? null)
      }
      const picked = await showSaveDialogWithMemory(dialog, win, {
        ...(request.title ? { title: request.title } : {}),
        defaultPath: request.defaultPath,
        filters: [
          { name: targetFilterName(request.kind), extensions: [targetExtension(request.kind)] },
        ],
      })
      return picked.canceled ? null : (picked.filePath ?? null)
    },
  })
  handlers = h

  ipcMain.handle(PDF_CHANNELS.structurePickTarget, (e, req) => {
    watch(e.sender)
    return h.pickTarget(e.sender.id, req)
  })
  ipcMain.handle(PDF_CHANNELS.structureTree, (e, req) => h.tree(context(e), req))
  ipcMain.handle(PDF_CHANNELS.structureText, (e, req) => h.text(context(e), req))
  ipcMain.handle(PDF_CHANNELS.structureConvert, (e, req) => h.convert(context(e), req))
  ipcMain.handle(PDF_CHANNELS.structureExtractImages, (e, req) => h.extractImages(context(e), req))
  ipcMain.handle(PDF_CHANNELS.structureWriteBack, (e, req) => h.writeBack(context(e), req))
  ipcMain.handle(PDF_CHANNELS.structureCancel, (e, jobId) => h.cancel(e.sender.id, jobId))

  ipcMain.handle(PDF_CHANNELS.storeDocHash, (e, path) => {
    watch(e.sender)
    return h.storeDocHash(e.sender.id, path)
  })
  ipcMain.handle(PDF_CHANNELS.storeAiReadPages, (e, docHash) =>
    h.storeAiReadPages(e.sender.id, docHash),
  )
  ipcMain.handle(PDF_CHANNELS.storeTranslations, (e, docHash) =>
    h.storeTranslations(e.sender.id, docHash),
  )
  ipcMain.handle(PDF_CHANNELS.storeTranslation, (e, docHash, lang) =>
    h.storeTranslation(e.sender.id, docHash, lang),
  )
  ipcMain.handle(PDF_CHANNELS.storeUnfinishedJobs, (e, docHash) =>
    h.storeUnfinishedJobs(e.sender.id, docHash),
  )
  ipcMain.handle(PDF_CHANNELS.storeWrite, (e, req) => h.storeWrite(e.sender.id, req))
  ipcMain.handle(PDF_CHANNELS.storeMigrate, (e, req) => h.storeMigrate(context(e), req))
  ipcMain.handle(PDF_CHANNELS.storeDeleteDocument, (e, docHash) =>
    h.storeDeleteDocument(e.sender.id, docHash),
  )
  ipcMain.handle(PDF_CHANNELS.storePassages, (e, docHash) => h.storePassages(e.sender.id, docHash))
  ipcMain.handle(PDF_CHANNELS.storeHighlightRuns, (e, docHash) =>
    h.storeHighlightRuns(e.sender.id, docHash),
  )
  ipcMain.handle(PDF_CHANNELS.storeHighlightBlocks, (e, docHash, runId) =>
    h.storeHighlightBlocks(e.sender.id, docHash, runId),
  )
  ipcMain.handle(PDF_CHANNELS.storeLatestHighlight, (e, docHash) =>
    h.storeLatestHighlight(e.sender.id, docHash),
  )
  ipcMain.handle(PDF_CHANNELS.storeInsights, (e, docHash, lang) =>
    h.storeInsights(e.sender.id, docHash, lang),
  )
  ipcMain.handle(PDF_CHANNELS.storeDeleteCounts, (e, docHash) =>
    h.storeDeleteCounts(e.sender.id, docHash),
  )
  ipcMain.handle(PDF_CHANNELS.storePageFingerprints, (e, req) =>
    h.storePageFingerprints(context(e), req),
  )
  ipcMain.handle(PDF_CHANNELS.storeTranslationRecency, (e, docHash) =>
    h.storeTranslationRecency(e.sender.id, docHash),
  )

  // no job process outlives the app: will-quit for a normal quit, 'exit'
  // for app.exit() / process.exit() (which skip will-quit)
  app.on('will-quit', () => jobRunner.cancelAll())
  process.on('exit', () => jobRunner.cancelAll())
}
