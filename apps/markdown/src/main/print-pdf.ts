import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { MARKDOWN_PRINT_OPTIONS, type MarkdownPrintOptions } from '../shared/print-options'

/** Shared pagination for PDF and PNG export. Document scripts remain disabled. */
export async function printMarkdownPdf(
  html: string,
  options: MarkdownPrintOptions = MARKDOWN_PRINT_OPTIONS,
): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), 'genoffice-md-print-'))
  let printWin: BrowserWindow | undefined
  try {
    printWin = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, javascript: false },
    })
    const htmlPath = join(workDir, 'print.html')
    await writeFile(htmlPath, html, 'utf8')
    await printWin.loadFile(htmlPath)
    const margin = options.marginIn
    return await printWin.webContents.printToPDF({
      pageSize: options.pageSize,
      printBackground: options.printBackground,
      landscape: options.landscape,
      margins: { top: margin, bottom: margin, left: margin, right: margin },
    })
  } finally {
    printWin?.destroy()
    await rm(workDir, { recursive: true, force: true })
  }
}
