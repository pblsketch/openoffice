/**
 * Windowless diagram jobs: the diagram half of the app's `--headless-export`
 * entry (docs/headless-pdf-export.md), which the command line starts for the
 * work only draw.io can do.
 *
 * - `--to pdf|png|svg`: the pictures and the PDF the export menu makes, with
 *   the same functions (one sheet per page at its own size for PDF; PNG and
 *   SVG one file per page, `<name>-p<n>.<ext>`, unless `--page` picks one).
 * - `--to drawio|dio|drawio.svg|drawio.png`: run `--ops` on the diagram with
 *   the AI panel's executor (Mermaid included) and write the diagram in that
 *   format with draw.io's own serialization, as Save does. A rejected batch,
 *   or one that changed nothing in a file of the same format, writes nothing.
 *
 * The job runs in a hidden window of the diagram tab's own session
 * (`createDiagramHiddenWindow`), so the tab's request refusal holds: nothing
 * leaves this PC. Files are written here, never by the renderer, and a
 * diagram file is written only when its bytes open as a diagram.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { ipcMain, type BrowserWindow } from 'electron'
import type {
  HeadlessExportFormat,
  HeadlessExportProduct,
  HeadlessExportRequest,
} from '@genoffice/electron-utils'
import { atomicWriteFile } from '@genoffice/electron-utils/atomic-write'
import { detectDiagramFormat, openDiagram, type DiagramFormat } from '@genoffice/drawio-model'
import { nodePageCodec } from '@genoffice/drawio-model/node'
import { DIAGRAM_CHANNELS } from '../shared/ipc'
import type { DiagramHeadlessJob, DiagramHeadlessReport, ExportFormat } from '../shared/ipc'
import { diagramBaseName } from '../shared/formats'
import { createDiagramHiddenWindow } from './diagram-main'
import { diagramRequestLog } from './diagram-session'
import { looksLike, renderPdf } from './export-main'
import { pageFilePaths } from './export-paths'
import { isPrintPage } from './print-document'

/** Under the command line's own wait (180 s), so the app answers before it is killed. */
const JOB_TIMEOUT_MS = 170_000

interface RunningJob {
  job: DiagramHeadlessJob
  done: (report: DiagramHeadlessReport) => void
}

const running = new Map<number, RunningJob>()
let channelsRegistered = false

function registerHeadlessChannels(): void {
  if (channelsRegistered) return
  channelsRegistered = true
  // only a hidden window made for a job gets one; every other view asks nothing
  ipcMain.handle(DIAGRAM_CHANNELS.headlessJob, (e) => running.get(e.sender.id)?.job ?? null)
  ipcMain.on(DIAGRAM_CHANNELS.headlessDone, (e, report: unknown) => {
    running.get(e.sender.id)?.done(reportOf(report))
  })
}

function reportOf(value: unknown): DiagramHeadlessReport {
  if (value && typeof value === 'object' && 'ok' in value) return value as DiagramHeadlessReport
  return { ok: false, error: 'the diagram page sent no report' }
}

function bytesOf(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  return null
}

const asBuffer = (bytes: Uint8Array): Buffer =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

/** The ops file the command line wrote: a JSON array, or `{ "ops": [...] }`. */
async function readOps(path: string): Promise<unknown[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'))
  } catch (err) {
    throw new Error(`--ops ${path} is not a JSON file: ${(err as Error).message}`, {
      cause: err,
    })
  }
  if (Array.isArray(parsed)) return parsed
  const ops = (parsed as { ops?: unknown } | null)?.ops
  if (Array.isArray(ops)) return ops
  throw new Error(`--ops ${path} must hold a JSON array of ops`)
}

/** Runs one job in a hidden window and answers the page's report. */
function runInHiddenWindow(input: string, job: DiagramHeadlessJob): Promise<DiagramHeadlessReport> {
  registerHeadlessChannels()
  const win: BrowserWindow = createDiagramHiddenWindow(input)
  const id = win.webContents.id
  return new Promise<DiagramHeadlessReport>((resolve) => {
    let settled = false
    const finish = (report: DiagramHeadlessReport): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      running.delete(id)
      if (!win.isDestroyed()) win.destroy()
      resolve(report)
    }
    const timer = setTimeout(
      () => finish({ ok: false, error: 'the diagram editor did not finish in time' }),
      JOB_TIMEOUT_MS,
    )
    running.set(id, { job, done: finish })
    win.webContents.once('render-process-gone', (_e, details) =>
      finish({ ok: false, error: `the diagram page stopped (${details.reason})` }),
    )
    win.webContents.once('did-fail-load', (_e, code, description, _url, isMainFrame) => {
      if (isMainFrame)
        finish({ ok: false, error: `the diagram page did not load (${description || code})` })
    })
  })
}

function failed(report: DiagramHeadlessReport): never {
  throw new Error(report.ok ? 'the diagram page answered another job' : report.error)
}

async function exportPictures(
  input: string,
  outPath: string,
  format: ExportFormat,
  page: number | undefined,
): Promise<HeadlessExportProduct> {
  const report = await runInHiddenWindow(input, {
    kind: 'export',
    format,
    ...(page !== undefined ? { page } : {}),
  })
  if (!report.ok) failed(report)
  if (format === 'pdf') {
    if (report.kind !== 'pdf' || report.pages.length === 0 || !report.pages.every(isPrintPage)) {
      failed(report)
    }
    const pdf = await renderPdf(report.pages, diagramBaseName(input))
    await atomicWriteFile(outPath, asBuffer(pdf))
    return { paths: [outPath] }
  }
  if (report.kind !== 'images' || report.format !== format || report.pages.length === 0) {
    failed(report)
  }
  const files = report.pages.map((p) => {
    const bytes = bytesOf(p.bytes)
    if (!bytes || !looksLike(format, bytes))
      throw new Error(`page ${p.number} is not a ${format} picture`)
    return { number: p.number, bytes }
  })
  // without a page picked, a file per page (spec 9.3), a one-page diagram too
  const paths = pageFilePaths(
    outPath,
    format,
    files.map((f) => f.number),
    page === undefined,
  )
  for (const [index, file] of files.entries())
    await atomicWriteFile(paths[index]!, asBuffer(file.bytes))
  return { paths }
}

async function writeDiagram(
  input: string,
  outPath: string,
  format: DiagramFormat,
  request: HeadlessExportRequest,
): Promise<HeadlessExportProduct> {
  const ops = request.ops === undefined ? [] : await readOps(request.ops)
  const report = await runInHiddenWindow(input, {
    kind: 'write',
    format,
    ops,
    mode: request.batch ?? 'all-or-nothing',
    ...(request.page !== undefined ? { page: request.page } : {}),
  })
  if (!report.ok) failed(report)
  if (report.kind !== 'write') failed(report)
  const detail = { batch: report.batch, format }
  const bytes = report.bytes === null ? null : bytesOf(report.bytes)
  if (bytes === null) return { paths: [], detail }
  // draw.io made these bytes: they reach the disk only when they open as a diagram of that format
  const check = openDiagram(basename(outPath), bytes, nodePageCodec)
  if (!check.ok)
    throw new Error(`refusing to write a diagram that would not open (${check.reason})`)
  await atomicWriteFile(outPath, asBuffer(bytes))
  return { paths: [outPath], detail }
}

/** The shell's `diagram` exporter for `--headless-export` (HEADLESS_TARGETS lists the formats). */
export async function exportDiagramHeadless(
  input: string,
  outPath: string,
  format: HeadlessExportFormat,
  request: HeadlessExportRequest,
): Promise<HeadlessExportProduct> {
  let product: HeadlessExportProduct
  if (format === 'pdf' || format === 'png' || format === 'svg') {
    product = await exportPictures(input, outPath, format, request.page)
  } else {
    const target = detectDiagramFormat(`x.${format}`)
    if (!target || target === 'vsdx') throw new Error(`cannot write a diagram as ${format}`)
    product = await writeDiagram(input, outPath, target, request)
  }
  // what the diagram session let through and refused in this run: a scripted check reads
  // `refused` (every refusal) and `blocked` (the last refused addresses)
  const { allowed, refused, blocked } = diagramRequestLog()
  return { ...product, detail: { ...product.detail, requests: { allowed, refused, blocked } } }
}
