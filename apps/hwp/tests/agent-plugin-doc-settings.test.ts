/**
 * The plugin's document-wide settings against the real rhwp engine: footnote and endnote
 * settings (engine patch 0029), page setup, numbered and bulleted paragraphs, and the
 * formatting profile with its looks. The editor's history is modelled by snapshots, as in
 * agent-plugin-notes.test.ts.
 *
 * footnote-typed-number.hwpx is a public reproduction of a document generator's HWPX: forty
 * filler paragraphs and three footnotes made by the engine, then, in its section XML, the
 * footnotes' automatic numbers replaced by typed text ("1) ") and every stored line layout
 * (linesegarray) removed, as the reported document had them.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { agentPlugin, type AgentPluginHost } from '../studio-plugin/agent-plugin.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

const LINES = ['보고서 제목', '국가인권위원회는 조사를 마쳤다.', '위원회는 권고를 냈다.', '맺음말.']

function blank(): HwpDocument {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  LINES.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    doc.insertText(0, index, 0, line)
  })
  return doc
}

function open(start: HwpDocument = blank()) {
  let doc = start
  const history: Uint8Array[] = []
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: (_label: string, fn: (tx: never) => unknown) => {
      const before = doc.exportHwp()
      try {
        const result = fn({ doc: () => doc, deferPagination: () => {} } as never)
        history.push(before)
        return result
      } catch (thrown) {
        doc = new HwpDocument(before)
        throw thrown
      }
    },
    events: { on: () => 0 },
    automation: {
      registerCommand: () => {},
      execute: (id: string) => {
        if (id !== 'edit:undo') return { ok: false }
        const before = history.pop()
        if (!before) return { ok: false }
        doc = new HwpDocument(before)
        return { ok: true }
      },
    },
  } as unknown as AgentPluginHost
  return { plugin: agentPlugin.activate(host), doc: () => doc, steps: () => history.length }
}

const fixture = (name: string) =>
  new HwpDocument(new Uint8Array(readFileSync(join(__dirname, 'fixtures', name))))

describe('note settings', () => {
  it('reads the footnote and endnote settings of a new document', () => {
    const { plugin } = open()
    const settings = plugin.noteSettings()
    expect(settings.footnote).toMatchObject({
      numberFormat: 'digit',
      suffix: ')',
      numbering: 'continue',
    })
    expect(settings.endnote).toMatchObject({ numberFormat: 'digit' })
  })

  it('changes the footnote number format in one undo step, renumbering the notes, and saves it', () => {
    const { plugin, doc, steps } = open()
    plugin.insertNote('footnote', '조사를', null, '첫 각주')
    plugin.insertNote('footnote', '권고를', null, '둘째 각주')
    const before = steps()
    const result = plugin.setNoteSettings('footnote', {
      numberFormat: 'circledDigit',
      suffix: '',
      superscript: true,
    })
    expect(result).toMatchObject({
      ok: true,
      kind: 'footnote',
      settings: { numberFormat: 'circledDigit', suffix: '', superscript: true },
    })
    expect(steps()).toBe(before + 1)
    // the notes keep their text and number in order
    expect(plugin.listNotes().notes.map((note) => note.text)).toEqual(['첫 각주', '둘째 각주'])
    for (const bytes of [doc().exportHwpx(), doc().exportHwp()]) {
      const again = new HwpDocument(bytes)
      expect(JSON.parse(again.getFootnoteShape(0))).toMatchObject({
        numberFormat: 'circledDigit',
        suffixChar: '',
        numberCodeSuperscript: true,
      })
    }
  })

  it('turns the separator line off and on again', () => {
    const { plugin } = open()
    expect(plugin.setNoteSettings('footnote', { separator: false })).toMatchObject({
      ok: true,
      settings: { separator: false },
    })
    expect(plugin.setNoteSettings('footnote', { separator: true })).toMatchObject({
      ok: true,
      settings: { separator: true },
    })
  })

  it('changes the endnote settings', () => {
    const { plugin } = open()
    expect(
      plugin.setNoteSettings('endnote', { numberFormat: 'lowerRoman', startNumber: 3 }),
    ).toMatchObject({ ok: true, settings: { numberFormat: 'lowerRoman', startNumber: 3 } })
  })

  it('refuses a value it does not know without changing the document', () => {
    const { plugin, steps } = open()
    expect(() => plugin.setNoteSettings('footnote', { numberFormat: 'emoji' })).toThrow(
      /numberFormat must be one of/,
    )
    expect(() => plugin.setNoteSettings('endnote', { numbering: 'restartPage' })).toThrow(
      /numbering must be one of/,
    )
    expect(() => plugin.setNoteSettings('footnote', { suffix: '))' })).toThrow(/one character/)
    expect(() => plugin.setNoteSettings('footnote', {})).toThrow(/nothing to change/)
    expect(steps()).toBe(0)
  })
})

describe('notes whose number is typed text', () => {
  it('lists the typed number as part of the text and says there is no automatic number', () => {
    const { plugin } = open(fixture('footnote-typed-number.hwpx'))
    const listed = plugin.listNotes()
    expect(listed.count).toBe(3)
    expect(listed.notes[0]).toMatchObject({ note: 1, noAutoNumber: true })
    expect(listed.notes[0].text.startsWith('1) 가나다라')).toBe(true)
  })

  it('rewrites the whole text, typed number included', () => {
    const { plugin } = open(fixture('footnote-typed-number.hwpx'))
    expect(plugin.editNote(2, '2) 고친 각주')).toMatchObject({ ok: true })
    expect(plugin.listNotes().notes[1].text).toBe('2) 고친 각주')
  })

  it('keeps the automatic number of a note made by the editor out of its text', () => {
    const { plugin } = open()
    plugin.insertNote('footnote', '조사를', null, '각주 글')
    const note = plugin.listNotes().notes[0]
    expect(note.text).toBe('각주 글')
    expect(note.noAutoNumber).toBeUndefined()
  })
})

describe('page setup', () => {
  it('reads the paper and margins in millimetres', () => {
    const { plugin } = open()
    const [section] = plugin.pageSetup().sections
    expect(section).toMatchObject({ paper: 'A4', width: 210, height: 297, orientation: 'portrait' })
    expect(section.margins.left).toBeGreaterThan(0)
  })

  it('changes paper, orientation and margins in one undo step', () => {
    const { plugin, doc, steps } = open()
    const result = plugin.setPageSetup(
      { paper: 'B5', orientation: 'landscape', margins: { left: 20, right: 15 } },
      null,
    )
    expect(result).toMatchObject({
      ok: true,
      sections: 1,
      pageSetup: { paper: 'B5', orientation: 'landscape', margins: { left: 20, right: 15 } },
    })
    expect(steps()).toBe(1)
    const def = JSON.parse(new HwpDocument(doc().exportHwpx()).getPageDef(0))
    expect(def.landscape).toBe(true)
    expect(Math.round((def.width * 25.4) / 7200)).toBe(182)
  })

  it('refuses margins that leave no room for text', () => {
    const { plugin, steps } = open()
    expect(plugin.setPageSetup({ margins: { left: 120, right: 100 } }, null)).toEqual({
      ok: false,
      reason: 'no_text_area',
      section: 1,
    })
    expect(plugin.setPageSetup({ paper: 'A4' }, 2)).toEqual({
      ok: false,
      reason: 'no_such_section',
      count: 1,
    })
    expect(() => plugin.setPageSetup({ paper: 'A9' }, null)).toThrow(/paper must be one of/)
    expect(() => plugin.setPageSetup({ width: 100 }, null)).toThrow(/go together/)
    expect(steps()).toBe(0)
  })
})

describe('numbered and bulleted paragraphs', () => {
  it("numbers, bullets and clears a paragraph with the editor's numbering", () => {
    const { plugin, doc } = open()
    const head = () => JSON.parse(doc().getParaPropertiesAt(0, 1))
    expect(plugin.formatParagraph('조사를', null, { list: 'number' })).toMatchObject({ ok: true })
    expect(head()).toMatchObject({ headType: 'Number', paraLevel: 0 })
    expect(head().numberingId).toBeGreaterThan(0)
    expect(
      plugin.formatParagraph('조사를', null, { list: 'bullet', bullet: '■', listLevel: 2 }),
    ).toMatchObject({ ok: true })
    expect(head()).toMatchObject({ headType: 'Bullet', paraLevel: 1 })
    expect(plugin.formatParagraph('조사를', null, { list: 'none' })).toMatchObject({ ok: true })
    expect(head()).toMatchObject({ headType: 'None' })
  })

  it('refuses list settings that do not go together', () => {
    const { plugin } = open()
    expect(() => plugin.formatParagraph('조사를', null, { listLevel: 2 })).toThrow(/listLevel/)
    expect(() => plugin.formatParagraph('조사를', null, { list: 'number', bullet: '■' })).toThrow(
      /bullet goes with/,
    )
    expect(() => plugin.formatParagraph('조사를', null, { list: 'number', listLevel: 9 })).toThrow(
      /1 to 7/,
    )
  })
})

describe('the formatting of a document', () => {
  it('groups the body paragraphs by look, with ids that stay while the look stays', () => {
    const { plugin } = open()
    const first = plugin.formatting()
    if (!first.ok) throw new Error('not read')
    expect(first.paragraphs).toBe(4)
    expect(first.looks[0]).toMatchObject({ paragraphs: 4, style: '바탕글' })
    expect(first.looks[0].id).toMatch(/^L[0-9a-z]{6}$/)
    expect(first.pageSetup).toMatchObject({ paper: 'A4' })
    expect(first.notes.footnote).toMatchObject({ numberFormat: 'digit' })
    const again = plugin.formatting()
    if (!again.ok) throw new Error('not read')
    expect(again.looks[0].id).toBe(first.looks[0].id)
  })

  it('formats every paragraph of one look in one undo step', () => {
    const { plugin, doc, steps } = open()
    plugin.formatParagraph('보고서 제목', null, { size: 16, bold: true, align: 'center' })
    const before = plugin.formatting()
    if (!before.ok) throw new Error('not read')
    const body = before.looks.find((look) => look.paragraphs === 3)!
    const result = plugin.formatLook(body.id!, { lineSpacing: 200, font: '맑은 고딕' })
    expect(result).toMatchObject({ ok: true, paragraphs: 3 })
    expect(steps()).toBe(2)
    for (const para of [1, 2, 3]) {
      expect(JSON.parse(doc().getParaPropertiesAt(0, para)).lineSpacing).toBe(200)
      expect(JSON.parse(doc().getCharPropertiesAt(0, para, 0)).fontFamily).toBe('맑은 고딕')
    }
    // the title had another look and is left alone
    expect(JSON.parse(doc().getParaPropertiesAt(0, 0)).lineSpacing).not.toBe(200)
    expect(plugin.formatLook(body.id!, { bold: true })).toMatchObject({
      ok: false,
      reason: 'no_such_look',
    })
  })

  it('reads another document handed over as base64, leaving this one as it was', () => {
    const { plugin, doc } = open()
    const other = fixture('footnote-typed-number.hwpx')
    const base64 = Buffer.from(other.exportHwpx()).toString('base64')
    const before = doc().getParagraphCount(0)
    const result = plugin.formatting(base64)
    if (!result.ok) throw new Error('not read')
    expect(result.paragraphs).toBe(40)
    expect(result.looks.every((look) => look.id === undefined)).toBe(true)
    expect(doc().getParagraphCount(0)).toBe(before)
    expect(plugin.formatting('bm90IGEgZG9jdW1lbnQ=')).toMatchObject({
      ok: false,
      reason: 'unreadable',
    })
  })
})
