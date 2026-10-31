/**
 * The shell's side of the pdf conversion screen: what the dialog may ask
 * around a Markdown / EPUB job, and the File menu items that open it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { PDF_CHANNELS } from '../../pdf/src/shared/ipc'
import {
  createPdfConvertUiHandlers,
  type PdfConvertUiDeps,
} from '../src/main/pdf-convert-ui-handlers'

const VIEW = 7
const SOURCE = 'C:\\docs\\report.pdf'

function deps(overrides: Partial<PdfConvertUiDeps> = {}) {
  const open = new Map<string, string>()
  const d = {
    ownsSource: vi.fn((viewId: number, path: string) => viewId === VIEW && path === SOURCE),
    exists: vi.fn(() => true),
    showInFolder: vi.fn(),
    findMarkdownTab: vi.fn((path: string) => open.get(path)),
    closeTab: vi.fn(async (tabId: string) => {
      for (const [path, id] of open) if (id === tabId) open.delete(path)
    }),
    activateView: vi.fn(),
    openDocument: vi.fn(() => true),
    ...overrides,
  }
  return { d, open, h: createPdfConvertUiHandlers(d) }
}

describe('pdf conversion screen: shell handlers', () => {
  it('answers only the view that owns the source PDF', async () => {
    const { d, h } = deps()
    const req = { source: 'C:\\other.pdf', path: 'C:\\out\\a.md' }
    expect(await h.releaseTarget(VIEW, req)).toBe(false)
    expect(h.openResult(VIEW, req)).toBe(false)
    expect(h.revealResult(VIEW, req)).toBe(false)
    expect(h.openResult(8, { source: SOURCE, path: 'C:\\out\\a.md' })).toBe(false)
    expect(h.openResult(VIEW, null)).toBe(false)
    expect(h.openResult(VIEW, { source: SOURCE })).toBe(false)
    expect(d.openDocument).not.toHaveBeenCalled()
    expect(d.showInFolder).not.toHaveBeenCalled()
  })

  it('opens only Markdown results, through the normal file routing', () => {
    const { d, h } = deps()
    expect(h.openResult(VIEW, { source: SOURCE, path: 'C:\\out\\a.md' })).toBe(true)
    expect(d.openDocument).toHaveBeenCalledWith('C:\\out\\a.md')
    expect(h.openResult(VIEW, { source: SOURCE, path: 'C:\\out\\a.epub' })).toBe(false)
    expect(h.openResult(VIEW, { source: SOURCE, path: 'C:\\out\\run.exe' })).toBe(false)
    expect(d.openDocument).toHaveBeenCalledTimes(1)
  })

  it('does not open a result that is not on disk', () => {
    const { d, h } = deps({ exists: vi.fn(() => false) })
    expect(h.openResult(VIEW, { source: SOURCE, path: 'C:\\out\\a.md' })).toBe(false)
    expect(d.openDocument).not.toHaveBeenCalled()
  })

  it('shows written results in the file manager', () => {
    const { d, h } = deps()
    for (const path of [
      'C:\\out\\a.epub',
      'C:\\out\\a.md',
      'C:\\out\\pics\\p1.png',
      'C:\\out\\a.ko.pdf',
    ]) {
      expect(h.revealResult(VIEW, { source: SOURCE, path })).toBe(true)
      expect(d.showInFolder).toHaveBeenLastCalledWith(path)
    }
    expect(h.revealResult(VIEW, { source: SOURCE, path: 'C:\\Windows\\notepad.exe' })).toBe(false)
  })

  it('closes a Markdown tab showing the target and brings the pdf tab back', async () => {
    const { d, h, open } = deps()
    open.set('C:\\out\\a.md', 't3')
    expect(await h.releaseTarget(VIEW, { source: SOURCE, path: 'C:\\out\\a.md' })).toBe(true)
    expect(d.closeTab).toHaveBeenCalledWith('t3')
    expect(d.activateView).toHaveBeenCalledWith(VIEW)
  })

  it('reports a target the user kept open (unsaved changes)', async () => {
    const { d, h, open } = deps()
    open.set('C:\\out\\a.md', 't3')
    d.closeTab.mockImplementation(async () => {})
    expect(await h.releaseTarget(VIEW, { source: SOURCE, path: 'C:\\out\\a.md' })).toBe(false)
  })

  it('has nothing to free when no tab shows the target', async () => {
    const { d, h } = deps()
    expect(await h.releaseTarget(VIEW, { source: SOURCE, path: 'C:\\out\\a.md' })).toBe(true)
    expect(d.closeTab).not.toHaveBeenCalled()
  })
})

describe('pdf conversion screen: wiring', () => {
  const main = (file: string) => readFileSync(join(__dirname, '../src/main', file), 'utf8')
  const index = main('index.ts')
  const wiring = main('pdf-convert-ui.ts')

  it('is registered once from the shell entry', () => {
    expect(index.match(/^registerPdfConvertUiIpc\(\{$/gm)).toHaveLength(1)
  })

  it('handles each of the dialog requests', () => {
    for (const key of ['convertReleaseTarget', 'convertOpenResult', 'convertRevealResult']) {
      expect(PDF_CHANNELS).toHaveProperty(key)
      expect(wiring).toContain(`ipcMain.handle(PDF_CHANNELS.${key},`)
    }
    expect(wiring).toContain('pdfPathGranted(viewId, path)')
  })

  it('offers Markdown in the pdf Save As dialog and hands the name to the conversion', () => {
    const start = index.indexOf('async function savePdfAs(')
    const end = index.indexOf('let exportingPdfDocx', start)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const flow = index.slice(start, end)
    expect(flow).toContain("{ name: 'Markdown', extensions: ['md'] }")
    expect(flow).toContain("grantPdfStructureTarget(tab.webContents, tab.filePath, target, 'md')")
    expect(flow).toContain("requestPdfConvertDialog(tab.webContents, 'md', target)")
  })

  it('adds Markdown and EPUB to the pdf File menu next to the existing conversions', () => {
    const items = [
      "label: tm('menuExportDocx')",
      "label: tm('menuExportPptx')",
      "label: tm('menuExportXlsx')",
      "label: tm('menuExportMd')",
      "label: tm('menuExportEpub')",
    ].map((label) => index.indexOf(label))
    expect(items.every((at) => at > 0)).toBe(true)
    expect([...items].sort((a, b) => a - b)).toEqual(items)
    expect(index).toContain("requestPdfConvertDialog(activePdfTarget()?.webContents, 'md')")
    expect(index).toContain("requestPdfConvertDialog(activePdfTarget()?.webContents, 'epub')")
  })

  it('labels the new menu items in every language', () => {
    expect(index.match(/^ {4}menuExportMd: '.+',$/gm)).toHaveLength(21)
    expect(index.match(/^ {4}menuExportEpub: '.+',$/gm)).toHaveLength(21)
  })
})
