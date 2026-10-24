/**
 * Save As annotation handling: keep (default), bake into page content, or leave
 * comment annotations out. Links and form widgets must survive "strip".
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { afterEach, describe, expect, it } from 'vitest'
import { applySaveRequest, copyPdfToPath, savePdfToPath } from '../src/main/save-pdf'
import type { SavePdfRequest } from '../src/shared/ipc'

let dir: string | null = null

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

const request = (over: Partial<SavePdfRequest> = {}): SavePdfRequest => ({
  path: 'source.pdf',
  markups: [],
  drawings: [],
  formValues: [],
  stamps: [],
  ...over,
})

const subtypes = (doc: PDFDocument, pageIndex = 0): string[] => {
  const annots = doc.getPage(pageIndex).node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (!annots) return []
  return Array.from({ length: annots.size() }, (_, i) => {
    const dict = annots.lookup(i, PDFDict)
    return dict.lookup(PDFName.of('Subtype'), PDFName).decodeText()
  })
}

/** A one-page source with a link annotation and a yellow highlight the save adds. */
async function sourceWithLinkAndHighlight(): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false })
  const page = doc.addPage([200, 200])
  const link = doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [10, 10, 50, 50],
    Border: [0, 0, 0],
    A: { S: 'URI', URI: PDFString.of('https://example.com') },
  })
  page.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(link)]))
  const withLink = await doc.save({ useObjectStreams: false })
  return (
    await applySaveRequest(
      withLink,
      request({
        markups: [
          {
            pageIndex: 0,
            type: 'highlight',
            color: [1, 0.87, 0.35],
            quads: [[50, 120, 150, 120, 50, 100, 150, 100]],
          },
        ],
      }),
    )
  ).bytes
}

function files(): { source: string; target: string } {
  dir = mkdtempSync(join(tmpdir(), 'ieum-pdf-annots-'))
  return { source: join(dir, 'source.pdf'), target: join(dir, 'copy.pdf') }
}

describe('Save As annotation handling', () => {
  it('keeps annotations by default', async () => {
    const { source, target } = files()
    writeFileSync(source, await sourceWithLinkAndHighlight())

    await savePdfToPath(source, target, request())

    const out = await PDFDocument.load(new Uint8Array(readFileSync(target)))
    expect(subtypes(out).sort()).toEqual(['Highlight', 'Link'])
  })

  it('leaves comment annotations out but keeps links', async () => {
    const { source, target } = files()
    writeFileSync(source, await sourceWithLinkAndHighlight())

    await savePdfToPath(source, target, request({ annotations: 'strip' }))

    const out = await PDFDocument.load(new Uint8Array(readFileSync(target)))
    expect(subtypes(out)).toEqual(['Link'])
  })

  it('bakes annotations into page content', async () => {
    const { source, target } = files()
    writeFileSync(source, await sourceWithLinkAndHighlight())

    await savePdfToPath(source, target, request({ annotations: 'flatten' }))

    const out = await PDFDocument.load(new Uint8Array(readFileSync(target)))
    expect(subtypes(out)).toEqual([])
  })

  it('copies a clean Save As source byte for byte', async () => {
    const { source, target } = files()
    const bytes = await sourceWithLinkAndHighlight()
    writeFileSync(source, bytes)

    await copyPdfToPath(source, target)

    expect(readFileSync(target).equals(Buffer.from(bytes))).toBe(true)
  })
})
