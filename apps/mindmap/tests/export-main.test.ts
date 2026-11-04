// @vitest-environment node
/**
 * Export and print, the main-process side: what it asks the user, the name and
 * extension of the file it writes, and what it refuses to write.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Handler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, Handler>()
const showSaveDialog = vi.fn()

vi.mock('electron', () => ({
  app: { getPath: (name: string) => join(tmpdir(), `mindmap-export-test-${name}`) },
  dialog: { showSaveDialog: (...args: unknown[]) => showSaveDialog(...args) },
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  ipcMain: { handle: (channel: string, fn: Handler) => handlers.set(channel, fn) },
  session: { fromPartition: () => ({ webRequest: { onBeforeRequest: vi.fn() } }) },
}))

import {
  allowPageFile,
  EXPORT_KINDS,
  exportFileBase,
  exportRequestAllowed,
  grantSaveAsExport,
  isMapSvg,
  registerMindmapExportIpc,
  withExportExtension,
} from '../src/main/export-main'
import { setUiLang } from '@genoffice/i18n'
import { MINDMAP_CHANNELS } from '../src/shared/ipc'
import type { ExportResult } from '../src/shared/ipc'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2])
setUiLang('en')
let mapPath: string | undefined
registerMindmapExportIpc({ filePathOf: () => mapPath })

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genoffice-mindmap-export-'))
  showSaveDialog.mockReset()
  mapPath = undefined
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const call = (channel: string, request: unknown): Promise<ExportResult> =>
  handlers.get(channel)!({ sender: { id: 7 } }, request) as Promise<ExportResult>

const pick = (path: string | null) =>
  showSaveDialog.mockResolvedValueOnce(
    path ? { canceled: false, filePath: path } : { canceled: true, filePath: '' },
  )

const dialogOptions = (): { defaultPath: string; filters: { extensions: string[] }[] } =>
  showSaveDialog.mock.calls[0]!.find(
    (arg: unknown) => typeof arg === 'object' && arg !== null && 'filters' in arg,
  )

describe('file names', () => {
  it('a suggested name loses path characters and is never empty', () => {
    expect(exportFileBase('Plan: day 1/2 <draft>')).toBe('Plan_ day 1_2 _draft_')
    expect(exportFileBase('a\u0007b')).toBe('a_b')
    expect(exportFileBase('...')).toBe('Untitled')
    expect(exportFileBase('   ')).toBe('Untitled')
    expect(exportFileBase(42)).toBe('Untitled')
    expect(exportFileBase('x'.repeat(200))).toHaveLength(80)
  })

  it('the extension of the format is added unless the name already ends with it', () => {
    expect(withExportExtension('C:\\out\\map', 'png')).toBe('C:\\out\\map.png')
    expect(withExportExtension('C:\\out\\map.PNG', 'png')).toBe('C:\\out\\map.PNG')
    expect(withExportExtension('C:\\out\\map.png', 'pdf')).toBe('C:\\out\\map.png.pdf')
    expect(withExportExtension('C:\\out\\outline', 'markdown')).toBe('C:\\out\\outline.md')
    expect(EXPORT_KINDS.markdown.extension).toBe('.md')
  })
})

describe('the outline', () => {
  it('is written as UTF-8 under the picked name with .md, and the dialog offers the map name in its folder', async () => {
    mapPath = join(dir, 'maps', 'Plan.xmind')
    pick(join(dir, 'outline'))
    const text = '# 시트\n\n- 토픽 <b>그대로</b>\n'
    const result = await call(MINDMAP_CHANNELS.exportMarkdown, { text, suggestedName: 'Plan' })
    expect(result).toEqual({ ok: true, path: join(dir, 'outline.md') })
    expect(readFileSync(join(dir, 'outline.md'), 'utf8')).toBe(text)
    const options = dialogOptions()
    expect(options.defaultPath).toBe(join(dir, 'maps', 'Plan.md'))
    expect(options.filters).toEqual([{ name: 'Markdown', extensions: ['md'] }])
  })

  it('a cancelled dialog writes nothing and is no failure', async () => {
    pick(null)
    const result = await call(MINDMAP_CHANNELS.exportMarkdown, { text: 'x', suggestedName: 'x' })
    expect(result).toEqual({ ok: true, canceled: true })
    expect(readdirSync(dir)).toEqual([])
  })

  it('a request without text is refused before any dialog', async () => {
    const result = await call(MINDMAP_CHANNELS.exportMarkdown, { suggestedName: 'x' })
    expect(result.ok).toBe(false)
    expect(showSaveDialog).not.toHaveBeenCalled()
  })
})

describe('the picture', () => {
  it('writes the PNG bytes as they came, under a name without path characters', async () => {
    pick(join(dir, 'sheet.png'))
    const result = await call(MINDMAP_CHANNELS.exportPng, {
      bytes: PNG,
      suggestedName: 'Plan - Day 1/2',
    })
    expect(result).toEqual({ ok: true, path: join(dir, 'sheet.png') })
    expect([...readFileSync(join(dir, 'sheet.png'))]).toEqual([...PNG])
    expect(dialogOptions().defaultPath.endsWith('Plan - Day 1_2.png')).toBe(true)
  })

  it('bytes that are not a PNG are refused, and nothing is asked or written', async () => {
    for (const bytes of [new Uint8Array([1, 2, 3]), 'not bytes', null]) {
      const result = await call(MINDMAP_CHANNELS.exportPng, { bytes, suggestedName: 'x' })
      expect(result.ok).toBe(false)
    }
    expect(showSaveDialog).not.toHaveBeenCalled()
    expect(readdirSync(dir)).toEqual([])
  })
})

describe('the PDF and print', () => {
  it('a request without a page is refused before any dialog or window', async () => {
    for (const channel of [MINDMAP_CHANNELS.exportPdf, MINDMAP_CHANNELS.print]) {
      expect((await call(channel, { html: '' })).ok).toBe(false)
      expect((await call(channel, {})).ok).toBe(false)
    }
    expect(showSaveDialog).not.toHaveBeenCalled()
  })

  it('the export session loads only the page file being exported and data: addresses', () => {
    const page = join(dir, 'map.html')
    const other = join(dir, 'other.html')
    expect(exportRequestAllowed(pathToFileURL(page).href)).toBe(false)
    const release = allowPageFile(page)
    expect(exportRequestAllowed(pathToFileURL(page).href)).toBe(true)
    expect(exportRequestAllowed('data:image/png;base64,AAAA')).toBe(true)
    for (const url of [
      pathToFileURL(other).href,
      'file://server/share/map.html',
      'file:///C:/Windows/win.ini',
      'https://example.com/x.png',
      'blob:https://example.com/1',
    ]) {
      expect(exportRequestAllowed(url), url).toBe(false)
    }
    release()
    expect(exportRequestAllowed(pathToFileURL(page).href)).toBe(false)
  })

  it('a cancelled PDF dialog makes no page and writes nothing', async () => {
    pick(null)
    const result = await call(MINDMAP_CHANNELS.exportPdf, { html: '<p>x</p>', suggestedName: 'x' })
    expect(result).toEqual({ ok: true, canceled: true })
    expect(existsSync(join(dir, 'x.pdf'))).toBe(false)
  })
})

describe('the SVG picture', () => {
  const SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10">' +
    '<foreignObject x="0" y="0" width="10" height="10">' +
    '<div xmlns="http://www.w3.org/1999/xhtml">a &lt;script&gt; in text</div>' +
    '</foreignObject></svg>'

  it('is written as UTF-8 with an XML declaration, under the picked name with .svg', async () => {
    pick(join(dir, 'sheet'))
    const result = await call(MINDMAP_CHANNELS.exportSvg, { svg: SVG, suggestedName: 'Plan' })
    expect(result).toEqual({ ok: true, path: join(dir, 'sheet.svg') })
    expect(readFileSync(join(dir, 'sheet.svg'), 'utf8')).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>\n${SVG}`,
    )
    expect(dialogOptions().filters).toEqual([{ name: 'SVG', extensions: ['svg'] }])
    expect(dialogOptions().defaultPath.endsWith('Plan.svg')).toBe(true)
  })

  it('anything but one SVG element without a script is refused before any dialog', async () => {
    expect(isMapSvg(SVG)).toBe(true)
    for (const svg of [
      '',
      'not svg',
      '<html><svg xmlns="http://www.w3.org/2000/svg"></svg></html>',
      `${SVG}<script>alert(1)</script>`,
      SVG.replace('</foreignObject>', '<script>alert(1)</script></foreignObject>'),
      SVG.replace('</foreignObject>', '<SCRIPT/></foreignObject>'),
      null,
      42,
    ]) {
      expect(isMapSvg(svg), String(svg)).toBe(false)
      const result = await call(MINDMAP_CHANNELS.exportSvg, { svg, suggestedName: 'x' })
      expect(result.ok).toBe(false)
    }
    expect(showSaveDialog).not.toHaveBeenCalled()
    expect(readdirSync(dir)).toEqual([])
  })

  it('a Save As path is written without a dialog, once, and only for the kind it was picked for', async () => {
    const target = join(dir, 'picked.svg')
    grantSaveAsExport(7, { kind: 'png', path: target })
    expect(
      (await call(MINDMAP_CHANNELS.exportSvg, { svg: SVG, suggestedName: 'x', path: target })).ok,
    ).toBe(false)
    grantSaveAsExport(7, { kind: 'svg', path: target })
    expect(
      await call(MINDMAP_CHANNELS.exportSvg, { svg: SVG, suggestedName: 'x', path: target }),
    ).toEqual({ ok: true, path: target })
    expect(
      (await call(MINDMAP_CHANNELS.exportSvg, { svg: SVG, suggestedName: 'x', path: target })).ok,
    ).toBe(false)
    expect(showSaveDialog).not.toHaveBeenCalled()
    expect(readdirSync(dir)).toEqual(['picked.svg'])
  })
})
