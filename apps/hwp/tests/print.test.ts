/**
 * PDF and print: the plugin draws the pages for print with the real engine, the renderer
 * gathers them a few at a time keeping each picture once, and the main process puts them
 * in one HTML page sized page by page.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { agentPlugin, type AgentPluginHost } from '../studio-plugin/agent-plugin.mjs'
import { badJob, imageFile, ownIds, printableHtml, sideMm } from '../src/main/print-document'
import { gatherPrintJob, sharePictures } from '../src/renderer/print-flow'
import type { AgentBridge } from '../src/renderer/ai/agent-bridge'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

/** A blank document of `pages` pages, each starting with its number. */
function open(pages: number) {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  for (let page = 0; page < pages; page++) {
    if (page > 0) doc.insertPageBreak(0, page - 1, doc.getParagraphLength(0, page - 1))
    doc.insertText(0, page, 0, `쪽 ${page + 1}`)
  }
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: () => {
      throw new Error('printing changes nothing')
    },
    events: { on: () => 0 },
    automation: { registerCommand: () => {}, execute: () => null },
  } as unknown as AgentPluginHost
  return { plugin: agentPlugin.activate(host), doc }
}

describe('the pages for print', () => {
  it('are SVG at the page size, from the page asked for', () => {
    const { plugin, doc } = open(3)
    expect(doc.pageCount()).toBe(3)
    const all = plugin.printPages(0)
    expect(all).toMatchObject({ pageCount: 3, from: 0 })
    expect(all.pages).toHaveLength(3)
    for (const page of all.pages) {
      expect(page.svg.startsWith('<svg')).toBe(true)
      // A4 in CSS pixels
      expect(sideMm(page.width)).toBe(210)
      expect(sideMm(page.height)).toBe(297)
    }
    const rest = plugin.printPages(2)
    expect(rest).toMatchObject({ pageCount: 3, from: 2 })
    expect(rest.pages).toHaveLength(1)
    expect(plugin.printPages(7).pages).toHaveLength(0)
  })

  it('lay out with the portable widths and put the screen’s back', () => {
    const { plugin, doc } = open(1)
    // the screen's widths need a canvas the test does not have: only the calls are recorded
    const calls: boolean[] = []
    Object.assign(doc, {
      canvasMetricsActive: () => true,
      selectCanvasMetrics: (on: boolean) => {
        calls.push(on)
        return true
      },
    })
    plugin.printPages(0)
    expect(calls).toEqual([false, true])
  })

  it('are gathered call by call, and the job keeps each picture once', async () => {
    const { plugin } = open(5)
    const logo = 'data:image/png;base64,iVBORw0KGgo='
    // two pages a call, every page carrying the same picture
    const bridge: Pick<AgentBridge, 'printPages'> = {
      printPages: async (from) => {
        const batch = plugin.printPages(from)
        const pages = batch.pages.slice(0, 2).map((page) => ({
          ...page,
          svg: page.svg.replace('</svg>', `<image href="${logo}"/></svg>`),
        }))
        return { ...batch, pages }
      },
    }
    const progress: number[] = []
    const job = await gatherPrintJob(bridge, 'pdf', (done) => progress.push(done))
    expect(progress).toEqual([2, 4, 5])
    expect(job.pages).toHaveLength(5)
    expect(job.images).toEqual([logo])
    for (const page of job.pages) expect(page.svg).toContain('href="ieum-image:0"')
  })

  it('stop when the document changes under them', async () => {
    let count = 4
    const bridge: Pick<AgentBridge, 'printPages'> = {
      printPages: async (from) => {
        const result = {
          pageCount: count,
          from,
          pages: [{ svg: '<svg/>', width: 10, height: 10 }],
        }
        count = 6
        return result
      },
    }
    await expect(gatherPrintJob(bridge, 'print', () => {})).rejects.toThrow(/changed/)
  })
})

describe('the preview page', () => {
  it('draws one page as print, with the count it belongs to', () => {
    const { plugin } = open(3)
    const page = plugin.previewPage(1)
    expect(page).toMatchObject({ pageCount: 3, page: 1 })
    expect(page.svg.startsWith('<svg')).toBe(true)
    expect(sideMm(page.width)).toBe(210)
    expect(sideMm(page.height)).toBe(297)
  })

  it('refuses a page outside the document', () => {
    const { plugin } = open(2)
    expect(() => plugin.previewPage(-1)).toThrow()
    expect(() => plugin.previewPage(2)).toThrow()
  })

  it('lays the page out with the portable widths, then puts the screen’s back', () => {
    const { plugin, doc } = open(1)
    const calls: boolean[] = []
    Object.assign(doc, {
      canvasMetricsActive: () => true,
      selectCanvasMetrics: (on: boolean) => {
        calls.push(on)
        return true
      },
    })
    plugin.previewPage(0)
    expect(calls).toEqual([false, true])
  })
})

describe('the preview page target', () => {
  it('finds the first paragraph that starts on the page', () => {
    const { plugin } = open(3)
    const target = plugin.pageTarget(1)
    expect(target.ok).toBe(true)
    if (!target.ok) return
    expect(target.page).toBe(1)
    expect(target.target).toMatchObject({
      kind: 'body_paragraph',
      section: 0,
      paragraph: 1,
      charOffset: 0,
    })
    expect(target.target.length).toBeGreaterThan(0)
  })

  it('refuses a page outside the document', () => {
    const { plugin } = open(2)
    expect(() => plugin.pageTarget(2)).toThrow()
    expect(() => plugin.pageTarget(-1)).toThrow()
  })
})

describe('sharing pictures', () => {
  it('replaces each picture by its place in the job, the same picture by the same place', () => {
    const images: string[] = []
    const known = new Map<string, number>()
    const a = 'data:image/png;base64,AAAA'
    const b = 'data:image/jpeg;base64,BBBB'
    expect(sharePictures(`<image href="${a}"/><image href="${b}"/>`, images, known)).toBe(
      '<image href="ieum-image:0"/><image href="ieum-image:1"/>',
    )
    expect(sharePictures(`<image href="${b}"/>`, images, known)).toBe(
      '<image href="ieum-image:1"/>',
    )
    expect(images).toEqual([a, b])
    // links are not pictures
    expect(sharePictures('<a href="https://example.com/">x</a>', images, known)).toContain(
      'https://example.com/',
    )
  })
})

describe('the printable HTML', () => {
  it('puts the paper sizes on the standard sizes they are meant to be', () => {
    // 59528 × 84186 HWPUNIT as the editor reports them
    expect(sideMm(793.7)).toBe(210)
    expect(sideMm(1122.5)).toBe(297)
    expect(sideMm(1587.4)).toBe(420)
    expect(sideMm(740.8)).toBe(196.003)
  })

  it('gives every page its own ids, with the references that use them', () => {
    const svg =
      '<svg><defs><clipPath id="body-clip-2"><rect/></clipPath></defs>' +
      '<g clip-path="url(#body-clip-2)"><use href="#body-clip-2"/></g></svg>'
    expect(ownIds(svg, 'p3-')).toBe(
      '<svg><defs><clipPath id="p3-body-clip-2"><rect/></clipPath></defs>' +
        '<g clip-path="url(#p3-body-clip-2)"><use href="#p3-body-clip-2"/></g></svg>',
    )
  })

  it('sizes each page on its own and points the pictures at their files', () => {
    const html = printableHtml(
      [
        { svg: '<svg id="a"><image href="ieum-image:0"/></svg>', width: 793.7, height: 1122.5 },
        { svg: '<svg id="a"></svg>', width: 1122.5, height: 793.7 },
      ],
      (index) => `image-${index}.png`,
    )
    expect(html).toContain('@page p0 { size: 210mm 297mm; margin: 0; }')
    expect(html).toContain('@page p1 { size: 297mm 210mm; margin: 0; }')
    expect(html).toContain('<div class="page p0"><svg id="p0-a"><image href="image-0.png"/></svg>')
    expect(html).toContain('<svg id="p1-a">')
    // nothing in it may run or reach out
    expect(html).toContain("default-src 'none'")
    expect(html).not.toContain('<script')
  })

  it('writes the usual picture types out as files and keeps the rest in the page', () => {
    const png = imageFile('data:image/png;base64,iVBORw0KGgo=', 4)
    expect(png?.name).toBe('image-4.png')
    expect([...png!.bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(imageFile('data:image/svg+xml;base64,PHN2Zy8+', 0)?.name).toBe('image-0.svg')
    expect(imageFile('data:image/x-wmf;base64,AAAA', 0)).toBeNull()
    expect(imageFile('data:text/html;base64,AAAA', 0)).toBeNull()
  })

  it('refuses jobs that are not pages', () => {
    const page = { svg: '<svg/>', width: 10, height: 10 }
    expect(badJob({ mode: 'pdf', pages: [page], images: [] })).toBeNull()
    expect(badJob({ mode: 'fax', pages: [page], images: [] })).toMatch(/mode/)
    expect(badJob({ mode: 'pdf', pages: [], images: [] })).toMatch(/no pages/)
    expect(badJob({ mode: 'pdf', pages: [{ ...page, svg: '<html>' }], images: [] })).toMatch(/page/)
    expect(badJob({ mode: 'pdf', pages: [{ ...page, width: -1 }], images: [] })).toMatch(/size/)
    expect(badJob({ mode: 'pdf', pages: [page], images: [3] })).toMatch(/pictures/)
    expect(badJob(null)).toMatch(/not a print job/)
  })
})
