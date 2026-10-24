// pdf-structure pulls in pdf2docx sources; their bidi-js shim is not on this package's include list.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../pdf2docx/src/bidi-js.d.ts" />
import { writeEpub, type DocumentTree, type TreeBlock } from '@genoffice/pdf-structure'
import { describe, expect, it } from 'vitest'
import { openEpub } from '../src/open'

describe('openEpub: a book written by pdf-structure', () => {
  it('opens cleanly with its nav and chapters', async () => {
    let seq = 0
    const at = (page: number) => ({
      id: `p${page}.${++seq}`,
      page,
      pageFingerprint: `fp${page}`,
      source: 'pdf' as const,
    })
    const heading = (page: number, text: string): TreeBlock => ({
      ...at(page),
      kind: 'heading',
      level: 1,
      levelSource: 'font',
      runs: [{ kind: 'text', text }],
    })
    const para = (page: number, text: string): TreeBlock => ({
      ...at(page),
      kind: 'paragraph',
      runs: [{ kind: 'text', text }],
    })
    const tree: DocumentTree = {
      version: 1,
      variant: 'original',
      info: {},
      sourcePageCount: 2,
      pages: [1, 2].map((page) => ({
        page,
        fingerprint: `fp${page}`,
        status: 'text' as const,
        widthPt: 612,
        heightPt: 792,
      })),
      blocks: [heading(1, 'Intro'), para(1, 'Hello.'), heading(2, 'Body'), para(2, 'World.')],
      footnotes: [],
      outline: [],
      toc: [],
      footnoteLinkFailedPages: [],
      warnings: [],
    }
    const bytes = await writeEpub(tree, {
      title: 'Written',
      author: 'Writer',
      uiLanguage: 'en',
      cover: false,
      modified: new Date('2026-01-02T03:04:05Z'),
    })

    const result = await openEpub(bytes)
    if (!result.ok) throw new Error(`${result.reason}: ${result.detail}`)
    const book = result.book
    expect(book.version).toBe('3')
    expect(book.metadata.title).toBe('Written')
    expect(book.metadata.creators).toEqual(['Writer'])
    expect(book.metadata.languages).toEqual(['en'])
    expect(book.metadata.uniqueIdentifier).toMatch(/^urn:uuid:/)
    expect(book.fixedLayout).toBe(false)
    expect(book.verticalWriting).toBe(false)
    expect(book.obfuscatedFonts).toEqual([])
    expect(book.spine.items.map((s) => s.path)).toEqual([
      'OEBPS/chapter-001.xhtml',
      'OEBPS/chapter-002.xhtml',
    ])
    expect(book.toc.source).toBe('nav')
    expect(book.toc.entries.map((e) => [e.title, e.spineIndex, e.depth])).toEqual([
      ['Intro', 0, 1],
      ['Body', 1, 1],
    ])
    expect((await book.readText('OEBPS/chapter-002.xhtml'))?.text).toContain('World.')
  })
})
