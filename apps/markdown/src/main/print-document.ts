import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import {
  MARKDOWN_PRINT_OPTIONS,
  type MarkdownPageRange,
  type MarkdownPrintOptions,
} from '../shared/print-options'
import type { MarkdownPrintDocumentResult } from '../shared/ipc'

/**
 * Print the same self-contained HTML the preview drew, in a throwaway window
 * with scripts off. The options are the preview's: A4, 0.6 in margins, no
 * header or footer, one range when the dialog chose one.
 */
export async function printMarkdownDocument(
  html: string,
  pages: MarkdownPageRange | null,
  options: MarkdownPrintOptions = MARKDOWN_PRINT_OPTIONS,
): Promise<MarkdownPrintDocumentResult> {
  const workDir = await mkdtemp(join(tmpdir(), 'genoffice-md-print-'))
  let win: BrowserWindow | undefined
  try {
    win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, javascript: false },
    })
    const htmlPath = join(workDir, 'print.html')
    await writeFile(htmlPath, html, 'utf8')
    await win.loadFile(htmlPath)
    const margin = options.marginIn
    // Windows attaches the native dialog to the printed window, so it must be visible.
    if (process.platform === 'win32') {
      win.show()
      win.focus()
    }
    const target = win
    return await new Promise<MarkdownPrintDocumentResult>((resolve) => {
      target.webContents.print(
        {
          silent: false,
          printBackground: options.printBackground,
          pageSize: options.pageSize,
          landscape: options.landscape,
          margins: {
            marginType: 'custom',
            top: margin,
            bottom: margin,
            left: margin,
            right: margin,
          },
          header: '',
          footer: '',
          ...(pages === null ? {} : { pageRanges: [{ from: pages.from, to: pages.to }] }),
        },
        (success, reason) => {
          if (success) resolve({ ok: true })
          else if (/cancel/i.test(reason)) resolve({ ok: true, canceled: true })
          else resolve({ ok: false, error: reason || 'print failed' })
        },
      )
    })
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    win?.destroy()
    await rm(workDir, { recursive: true, force: true })
  }
}
