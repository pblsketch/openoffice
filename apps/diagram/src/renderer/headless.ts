/**
 * The page of a windowless job (`?headless=1`, `src/main/headless-main.ts`):
 * draw.io in a frame of a hidden window, no editor around it. It opens the
 * granted file the way a tab does, runs the one job the app gave it and
 * reports. Nothing here saves, autosaves, copies for recovery or talks to
 * the AI; the app writes the files from the report.
 */
import type { Lang } from '@genoffice/i18n'
import { createDiagramFile, type DiagramFormat } from '@genoffice/drawio-model'
import { drawioStartUrl } from '../shared/drawio-start'
import { exportKindOf } from '../shared/formats'
import type {
  DiagramHeadlessJob,
  DiagramHeadlessReport,
  ExportPageImage,
  HeadlessBatchOutcome,
  PrintPage,
} from '../shared/ipc'
import { DrawioFrame } from './drawio/frame-client'
import { applyLiveOps } from './document/live-ops'
import { pagePictureBytes, printPageOf } from './document/page-pictures'

/** The diagram the job works on, as the file opened. */
export interface HeadlessFile {
  format: DiagramFormat
  compressed: boolean
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * Runs a job on the diagram draw.io has loaded. Never throws: a failure is a
 * report. A `write` job's bytes are null when nothing is to be written: the
 * batch was rejected, or it changed nothing in a file already of that format.
 */
export async function runHeadlessJob(
  client: DrawioFrame,
  job: DiagramHeadlessJob,
  file: HeadlessFile,
): Promise<DiagramHeadlessReport> {
  try {
    const { pages } = await client.request('pageInfo', {})
    if (job.page !== undefined && (job.page < 1 || job.page > pages.length)) {
      return {
        ok: false,
        error: `page ${job.page} is out of range: the diagram has ${pages.length} page(s)`,
      }
    }
    if (job.kind === 'export') {
      const numbered = pages.map((page, index) => ({ page, number: index + 1 }))
      const chosen =
        job.page === undefined ? numbered : numbered.filter((p) => p.number === job.page)
      if (job.format === 'pdf') {
        const sheets: PrintPage[] = []
        for (const { page } of chosen) sheets.push(await printPageOf(client, page))
        return { ok: true, kind: 'pdf', pages: sheets }
      }
      const images: ExportPageImage[] = []
      for (const { page, number } of chosen) {
        images.push({ number, bytes: await pagePictureBytes(client, job.format, page.id) })
      }
      return { ok: true, kind: 'images', format: job.format, pages: images }
    }
    let batch: HeadlessBatchOutcome | null = null
    if (job.ops.length > 0) {
      const defaultPage = job.page === undefined ? undefined : pages[job.page - 1]!.id
      const result = await applyLiveOps(client, job.ops, {
        mode: job.mode,
        ...(defaultPage !== undefined ? { defaultPage } : {}),
      })
      batch = {
        status: result.status,
        changed: result.changed,
        results: result.results,
        created: result.created,
      }
    }
    const write =
      batch === null ||
      (batch.status !== 'rejected' && (batch.changed || file.format !== job.format))
    const bytes = write ? await client.serialize(exportKindOf(job.format), file.compressed) : null
    return { ok: true, kind: 'write', bytes, batch }
  } catch (err) {
    return { ok: false, error: errorText(err) }
  }
}

/** The whole page: open the granted file, let draw.io load it, run the job, report once. */
export async function startHeadlessPage(lang: Lang): Promise<void> {
  const api = window.diagramApi
  let reported = false
  const report = (r: DiagramHeadlessReport): void => {
    if (reported) return
    reported = true
    api.headlessDone(r)
  }
  try {
    const job = await api.headlessJob()
    if (!job) return
    const pending = await api.consumePending()
    let xml: string
    let file: HeadlessFile
    if (pending) {
      const opened = await api.openFile(pending)
      if (opened.status !== 'ok') {
        report({ ok: false, error: `the file does not open as a diagram (${opened.status})` })
        return
      }
      xml = opened.xml
      file = { format: opened.format, compressed: opened.compressed }
    } else {
      xml = createDiagramFile().xml
      file = { format: 'drawio', compressed: false }
    }
    const frameElement = document.createElement('iframe')
    frameElement.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0'
    const client = new DrawioFrame({
      onInit: () => client.sendEmbed({ action: 'load', xml, autosave: 0, dark: false }),
      onLoad: () => void runHeadlessJob(client, job, file).then(report),
      onSave: () => {},
      onBridgeEvent: () => {},
    })
    frameElement.addEventListener('load', () => client.attach(frameElement.contentWindow))
    frameElement.src = drawioStartUrl({ lang, dark: false })
    document.getElementById('root')?.appendChild(frameElement)
  } catch (err) {
    report({ ok: false, error: errorText(err) })
  }
}
