import { describe, expect, it } from 'vitest'
import { encodeEntryText } from '../src/encoding'
import * as engine from '../src/index'
import { openEpub } from '../src/open'
import type { RangeReplacement } from '../src/ranges'
import {
  formatModifiedTimestamp,
  saveEpub,
  type EpubChapterEdits,
  type EpubSaveResult,
} from '../src/save'
import { buildEpub, CONTAINER_XML, epub2Files, epub3Files, xhtml, zipEntries } from './helpers'
import { firstLocalEntry, readEntries, utf8, type ReadEntry } from './save-helpers'

const NOW = new Date('2026-10-24T05:06:07.890Z')
const STAMP = '2026-10-24T05:06:07Z'
const clock = (): Date => NOW

const OPF3 = 'OEBPS/content.opf'
const C2 = 'OEBPS/text/c2.xhtml'

/** A replacement of the first occurrence of `find` in `source`. */
function replace(source: string, find: string, text: string): RangeReplacement {
  const start = source.indexOf(find)
  if (start < 0) throw new Error(`"${find}" not found`)
  return { start, end: start + find.length, text }
}

async function save(original: Uint8Array, edits: EpubChapterEdits): Promise<EpubSaveResult> {
  return saveEpub(original, edits, { now: clock })
}

async function saved(original: Uint8Array, edits: EpubChapterEdits): Promise<Uint8Array> {
  const result = await save(original, edits)
  if (!result.ok) throw new Error(`refused: ${result.reason} ${result.path} ${result.detail}`)
  if (!result.changed) throw new Error('expected a change')
  return result.bytes
}

const byName = (entries: ReadEntry[]): Map<string, ReadEntry> =>
  new Map(entries.map((e) => [e.name, e]))

function expectOcfMimetype(bytes: Uint8Array, content = 'application/epub+zip'): void {
  const first = firstLocalEntry(bytes)
  expect(first.signature).toBe(0x04034b50)
  expect(first.name).toBe('mimetype')
  expect(first.method).toBe(0)
  expect(first.extraLength).toBe(0)
  expect(first.content).toBe(content)
}

describe('saveEpub: nothing to write', () => {
  it('reports no change for no edits, empty lists and replacements that change nothing', async () => {
    const original = await buildEpub(epub3Files())
    const c2 = epub3Files()[C2]!
    expect(await save(original, {})).toEqual({ ok: true, changed: false })
    expect(await save(original, new Map())).toEqual({ ok: true, changed: false })
    expect(await save(original, { [C2]: [] })).toEqual({ ok: true, changed: false })
    expect(
      await save(original, { [C2]: [replace(c2, 'Second chapter.', 'Second chapter.')] }),
    ).toEqual({ ok: true, changed: false })
  })

  it('does not fix the mimetype entry when nothing else changes', async () => {
    const files = epub3Files()
    const original = await zipEntries([
      { name: 'META-INF/container.xml', data: CONTAINER_XML() },
      ...Object.entries(files).map(([name, data]) => ({ name, data })),
    ])
    expect(await save(original, {})).toEqual({ ok: true, changed: false })
  })
})

describe('saveEpub: one block edited', () => {
  const files = epub3Files()
  const c2 = files[C2]!
  const edit = replace(c2, 'Second chapter.', 'Edited <em>second</em> chapter.')

  it('changes only that range of that chapter and the modified date', async () => {
    const original = await buildEpub(files)
    const result = await save(original, { [C2]: [edit] })
    expect(result).toMatchObject({ ok: true, changed: true, changedChapters: [C2] })
    const bytes = (result as { bytes: Uint8Array }).bytes

    const before = await readEntries(original)
    const after = await readEntries(bytes)
    expect(after.map((e) => e.name)).toEqual(before.map((e) => e.name))
    const afterByName = byName(after)
    for (const entry of before) {
      const next = afterByName.get(entry.name)!
      expect(next.method, entry.name).toBe(entry.method)
      expect(next.date, entry.name).toBe(entry.date)
      if (entry.name === C2 || entry.name === OPF3) continue
      expect(next.bytes, entry.name).toEqual(entry.bytes)
    }

    const chapter = utf8(afterByName.get(C2)!.bytes)
    expect(chapter).toBe(c2.slice(0, edit.start) + edit.text + c2.slice(edit.end))

    const opfText = utf8(afterByName.get(OPF3)!.bytes)
    expect(opfText).toBe(
      files[OPF3]!.replace(
        '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>',
        `<meta property="dcterms:modified">${STAMP}</meta>`,
      ),
    )
    expectOcfMimetype(bytes)
  })

  it('reopens the saved book', async () => {
    const bytes = await saved(await buildEpub(files), { [C2]: [edit] })
    const reopened = await openEpub(bytes)
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) return
    expect(reopened.book.spine.items.map((s) => s.path)).toContain(C2)
    expect((await reopened.book.readText(C2))!.text).toContain('Edited <em>second</em> chapter.')
  })

  it('keeps each entry stored or deflated as it was', async () => {
    const original = await zipEntries([
      { name: 'mimetype', data: 'application/epub+zip', store: true },
      { name: 'META-INF/container.xml', data: CONTAINER_XML() },
      ...Object.entries(files).map(([name, data]) => ({
        name,
        data,
        store: name === C2 || name.endsWith('.css'),
      })),
      { name: 'OEBPS/images/pic.png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) },
    ])
    const after = byName(await readEntries(await saved(original, { [C2]: [edit] })))
    expect(after.get(C2)!.method).toBe('STORE')
    expect(after.get('OEBPS/styles/book.css')!.method).toBe('STORE')
    expect(after.get(OPF3)!.method).toBe('DEFLATE')
    expect(after.get('OEBPS/images/pic.png')!.method).toBe('DEFLATE')
    expect(after.get('OEBPS/images/pic.png')!.bytes).toEqual(
      new Uint8Array([137, 80, 78, 71, 1, 2, 3]),
    )
  })

  it('applies several replacements and edits several chapters', async () => {
    const c1Path = 'OEBPS/text/chapter 1.xhtml'
    const c1 = files[c1Path]!
    const bytes = await saved(await buildEpub(files), {
      [C2]: [replace(c2, 'Two</h1>', 'Deux</h1>'), edit],
      [c1Path]: [replace(c1, 'First chapter.', 'Premier.')],
    })
    const after = byName(await readEntries(bytes))
    expect(utf8(after.get(C2)!.bytes)).toContain('<h1 id="top">Deux</h1>')
    expect(utf8(after.get(C2)!.bytes)).toContain('Edited <em>second</em> chapter.')
    expect(utf8(after.get(c1Path)!.bytes)).toContain('<p id="s1">Premier.</p>')
  })

  it('reports only the chapters whose text changed', async () => {
    const c1Path = 'OEBPS/text/chapter 1.xhtml'
    const result = await save(await buildEpub(files), {
      [C2]: [edit],
      [c1Path]: [replace(files[c1Path]!, 'First', 'First')],
    })
    expect(result).toMatchObject({ ok: true, changed: true, changedChapters: [C2] })
  })
})

describe('saveEpub: from an opened book', () => {
  const files = epub3Files()
  const edit = replace(files[C2]!, 'Second chapter.', 'Edited <em>second</em> chapter.')

  it('writes the same bytes as from the raw bytes, without changing the book', async () => {
    const original = await buildEpub(files)
    const fromBytes = await saved(original, { [C2]: [edit] })
    const opened = await openEpub(original, { takeOwnership: true })
    if (!opened.ok) throw new Error(opened.reason)
    const fromBook = await saveEpub(opened.book, { [C2]: [edit] }, { now: clock })
    expect(fromBook.ok && fromBook.changed && fromBook.bytes).toEqual(fromBytes)
    // the book still reads the original, and saves the same way again
    expect((await opened.book.readText(C2))!.text).toBe(files[C2])
    const again = await saveEpub(opened.book, { [C2]: [edit] }, { now: clock })
    expect(again.ok && again.changed && again.bytes).toEqual(fromBytes)
    expect(await saveEpub(opened.book, {}, { now: clock })).toEqual({ ok: true, changed: false })
  })

  it('writes an EPUB 2 book and a late mimetype the same way as from the raw bytes', async () => {
    const files2 = epub2Files()
    const path = 'ch1.html'
    const text = files2[path]!
    const at = text.indexOf('</p>')
    const edits = { [path]: [{ start: at, end: at, text: ' more' }] }
    const original = await zipEntries([
      { name: 'META-INF/container.xml', data: CONTAINER_XML('content.opf') },
      ...Object.entries(files2).map(([name, data]) => ({ name, data })),
      { name: 'mimetype', data: 'application/epub+zip' },
    ])
    const opened = await openEpub(original)
    if (!opened.ok) throw new Error(opened.reason)
    expect(await saveEpub(opened.book, edits, { now: clock })).toEqual(
      await saveEpub(original, edits, { now: clock }),
    )
  })

  it('refuses a book this engine did not open', async () => {
    const opened = await openEpub(await buildEpub(files))
    if (!opened.ok) throw new Error(opened.reason)
    const copy = { ...opened.book }
    expect(await saveEpub(copy, { [C2]: [edit] }, { now: clock })).toMatchObject({
      ok: false,
      reason: 'not-opened',
      path: null,
    })
  })
})

describe('saveEpub: the mimetype entry', () => {
  const files = epub3Files()
  const edit = { [C2]: [replace(files[C2]!, 'Second', 'Other')] }
  const rest = Object.entries(files).map(([name, data]) => ({ name, data }))

  it('moves a late, compressed mimetype to the front, stored, keeping its content', async () => {
    const original = await zipEntries([
      { name: 'META-INF/container.xml', data: CONTAINER_XML() },
      { name: 'mimetype', data: 'application/epub+zip' },
      ...rest,
    ])
    const bytes = await saved(original, edit)
    expectOcfMimetype(bytes)
    const names = (await readEntries(bytes)).map((e) => e.name)
    expect(names).toEqual(['mimetype', 'META-INF/container.xml', ...Object.keys(files)])
  })

  it('adds a missing mimetype entry at the front', async () => {
    const original = await zipEntries([
      { name: 'META-INF/container.xml', data: CONTAINER_XML() },
      ...rest,
    ])
    const bytes = await saved(original, edit)
    expectOcfMimetype(bytes)
    const entries = await readEntries(bytes)
    expect(entries.map((e) => e.name)).toEqual([
      'mimetype',
      'META-INF/container.xml',
      ...Object.keys(files),
    ])
    expect((await openEpub(bytes)).ok).toBe(true)
  })
})

describe('saveEpub: dcterms:modified', () => {
  it('formats the save time in UTC to the second', () => {
    expect(formatModifiedTimestamp(NOW)).toBe(STAMP)
    expect(formatModifiedTimestamp(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05Z')
  })

  it('inserts the meta line when an EPUB 3 package has none', async () => {
    const files = epub3Files()
    const metaLine = '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>\n'
    const original = files[OPF3]!.replace(metaLine, '')
    files[OPF3] = original
    const bytes = await saved(await buildEpub(files), {
      [C2]: [replace(files[C2]!, 'Second', 'Other')],
    })
    const opfText = utf8(byName(await readEntries(bytes)).get(OPF3)!.bytes)
    const inserted = `<meta property="dcterms:modified">${STAMP}</meta>\n`
    expect(opfText).toBe(original.replace('</metadata>', `${inserted}</metadata>`))
    expect((await openEpub(bytes)).ok).toBe(true)
  })

  it('inserts with the indentation and line ends of the package document', async () => {
    const files = epub3Files()
    const opfText =
      '<?xml version="1.0" encoding="UTF-8"?>\r\n' +
      '<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">\r\n' +
      '  <opf:metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\r\n' +
      '    <dc:identifier id="uid">urn:x</dc:identifier>\r\n' +
      '    <dc:title>T&nbsp;itle</dc:title>\r\n' +
      '  </opf:metadata>\r\n' +
      '  <opf:manifest><opf:item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/></opf:manifest>\r\n' +
      '  <opf:spine><opf:itemref idref="c2"/></opf:spine>\r\n' +
      '</opf:package>\r\n'
    const bytes = await saved(await buildEpub({ [OPF3]: opfText, [C2]: files[C2]! }), {
      [C2]: [replace(files[C2]!, 'Second', 'Other')],
    })
    const after = utf8(byName(await readEntries(bytes)).get(OPF3)!.bytes)
    expect(after).toBe(
      opfText.replace(
        '  </opf:metadata>',
        `    <opf:meta property="dcterms:modified">${STAMP}</opf:meta>\r\n  </opf:metadata>`,
      ),
    )
  })

  it('replaces only the value of an existing modified meta, not a refining one', async () => {
    const files = epub3Files()
    const refining = '<meta refines="#uid" property="dcterms:modified">1999-01-01T00:00:00Z</meta>'
    files[OPF3] = files[OPF3]!.replace(
      '<meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>',
      `${refining}\n<meta  property='dcterms:modified' > 2026-01-01T00:00:00Z </meta>`,
    )
    const bytes = await saved(await buildEpub(files), {
      [C2]: [replace(files[C2]!, 'Second', 'Other')],
    })
    const after = utf8(byName(await readEntries(bytes)).get(OPF3)!.bytes)
    expect(after).toBe(
      files[OPF3]!.replace(
        "<meta  property='dcterms:modified' > 2026-01-01T00:00:00Z </meta>",
        `<meta  property='dcterms:modified' >${STAMP}</meta>`,
      ),
    )
  })

  it('leaves an EPUB 2 package document byte for byte as it was', async () => {
    const files = epub2Files()
    const original = await buildEpub(files, 'content.opf')
    const bytes = await saved(original, {
      'ch1.html': [replace(files['ch1.html']!, '<p>One</p>', '<p>Uno</p>')],
    })
    const before = byName(await readEntries(original))
    const after = byName(await readEntries(bytes))
    expect(after.get('content.opf')!.bytes).toEqual(before.get('content.opf')!.bytes)
    expect(utf8(after.get('ch1.html')!.bytes)).toContain('<p>Uno</p>')
    expect(after.get('ch2.html')!.bytes).toEqual(before.get('ch2.html')!.bytes)
    expectOcfMimetype(bytes)
  })
})

describe('saveEpub: refusals', () => {
  it('refuses an edit that leaves the chapter not well-formed, naming the chapter', async () => {
    const files = epub3Files()
    const result = await save(await buildEpub(files), {
      [C2]: [replace(files[C2]!, 'Second chapter.', '<b>oops')],
    })
    expect(result).toMatchObject({ ok: false, reason: 'not-well-formed', path: C2 })
  })

  it('never edits a chapter that was not well-formed, and keeps it as it was', async () => {
    const files = epub3Files()
    const brokenPath = 'OEBPS/text/notes.xhtml'
    files[brokenPath] = xhtml('Notes', '<p>Notes.<p>unclosed')
    const original = await buildEpub(files)
    const refused = await save(original, {
      [brokenPath]: [replace(files[brokenPath]!, 'Notes.', 'Edited.')],
    })
    expect(refused).toMatchObject({ ok: false, reason: 'broken', path: brokenPath })

    const bytes = await saved(original, { [C2]: [replace(files[C2]!, 'Second', 'Other')] })
    const before = byName(await readEntries(original))
    expect(byName(await readEntries(bytes)).get(brokenPath)!.bytes).toEqual(
      before.get(brokenPath)!.bytes,
    )
  })

  it('refuses replacements that do not fit the chapter', async () => {
    const original = await buildEpub(epub3Files())
    const result = await save(original, { [C2]: [{ start: 0, end: 1e6, text: '' }] })
    expect(result).toMatchObject({ ok: false, reason: 'invalid-replacements', path: C2 })
  })

  it('refuses an edit to an entry the book does not have', async () => {
    const original = await buildEpub(epub3Files())
    const result = await save(original, {
      'OEBPS/text/nope.xhtml': [{ start: 0, end: 0, text: 'x' }],
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'unknown-entry',
      path: 'OEBPS/text/nope.xhtml',
    })
  })

  it('refuses an original that does not open', async () => {
    const result = await save(new Uint8Array([1, 2, 3]), {})
    expect(result).toMatchObject({ ok: false, reason: 'not-opened', path: null })
  })
})

describe('saveEpub: encodings', () => {
  const body = '<h1 id="top">Two</h1><p>Second chapter: 한글.</p>'

  it.each([
    ['utf-8', 'utf-8' as const],
    ['utf-16le', 'utf-16le' as const],
    ['utf-16be', 'utf-16be' as const],
  ])('writes a %s chapter with a BOM back in the same encoding', async (_label, encoding) => {
    const files: Record<string, string | Uint8Array> = epub3Files()
    const text = '﻿' + xhtml('Two', body).replace('encoding="UTF-8"', `encoding="${encoding}"`)
    files[C2] = encodeEntryText(text, encoding)
    const bytes = await saved(await buildEpub(files), {
      [C2]: [replace(text, 'Second chapter: 한글.', '두 번째 장.')],
    })
    const written = byName(await readEntries(bytes)).get(C2)!.bytes
    expect(written).toEqual(
      encodeEntryText(text.replace('Second chapter: 한글.', '두 번째 장.'), encoding),
    )
    const reopened = await openEpub(bytes)
    expect(reopened.ok && (await reopened.book.readText(C2))!.encoding).toBe(encoding)
  })
})

describe('public entry', () => {
  it('exports the saving API', () => {
    for (const name of ['saveEpub', 'formatModifiedTimestamp', 'modifiedReplacements']) {
      expect(engine).toHaveProperty(name)
    }
  })
})
