import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { BrowserWindow } from 'electron'
import { checkedHwpBytes, hwpPrintPages, type HwpPrintPage } from '@genoffice/file-parse'
import type { PrintJob } from '../shared/ipc'
import { sharePictures } from '../renderer/print-flow'
import { atomicWriteFile } from './atomic-write'
import { badJob, printJobToPdf } from './print-document'

/**
 * The HWP exporter of the app's `--headless-export` (the command line's
 * `convert x.hwp --to pdf`): the pages drawn for print by the same engine and profile
 * the editor's File > Export as PDF uses, put into one PDF by the same print path.
 * No editor window is opened.
 */

/** The print job of the pages: each picture kept once across the job, as the editor does. */
export function pdfJobOf(pages: HwpPrintPage[]): PrintJob {
  const images: string[] = []
  const known = new Map<string, number>()
  return {
    mode: 'pdf',
    pages: pages.map((page) => ({ ...page, svg: sharePictures(page.svg, images, known) })),
    images,
  }
}

/** A hidden window for printing: no preload, no scripts, sandboxed (as the File menu's). */
const printWindow = (): BrowserWindow =>
  new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })

export async function exportHwpPdfHeadless(input: string, outPath: string): Promise<void> {
  const ext = extname(input).slice(1).toLowerCase()
  const bytes = await checkedHwpBytes(new Uint8Array(await readFile(input)), ext)
  const job = pdfJobOf(await hwpPrintPages(bytes))
  const bad = badJob(job)
  if (bad) throw new Error(`cannot make a PDF of ${input}: ${bad}`)
  await atomicWriteFile(outPath, await printJobToPdf(job, printWindow))
}
