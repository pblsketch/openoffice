/**
 * The formatting of paragraphs the plugin adds, against the real rhwp engine. Enter gives
 * a new paragraph the formatting of the one it is made from; after a heading that would
 * make the AI's body text look like the heading, so there it takes the body's instead.
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

/** A heading's look: larger, bold, centred, with room above it. */
const HEADING_CHARS = { fontSize: 1400, bold: true }
const HEADING_PARA = { alignment: 'center', spacingBefore: 1000 }

/**
 * A document built with the engine itself, a line per paragraph. The lines named in
 * `headings` get HEADING_CHARS and HEADING_PARA; `table` puts a table in an empty
 * paragraph after the line it names.
 */
function open(lines: string[], headings: string[], table?: string) {
  let doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  const all = table ? lines.flatMap((line) => (line === table ? [line, ''] : [line])) : lines
  all.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    if (line) doc.insertText(0, index, 0, line)
  })
  all.forEach((line, index) => {
    if (!headings.includes(line)) return
    doc.applyCharFormat(0, index, 0, line.length, JSON.stringify(HEADING_CHARS))
    doc.applyParaFormat(0, index, JSON.stringify(HEADING_PARA))
  })
  if (table) {
    doc.pasteHtml(0, all.indexOf(table) + 1, 0, '<table><tr><td>가</td><td>나</td></tr></table>')
  }
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: (_label: string, fn: (tx: never) => unknown) => {
      const before = doc.exportHwp()
      try {
        return fn({ doc: () => doc, deferPagination: () => {} } as never)
      } catch (thrown) {
        doc = new HwpDocument(before)
        throw thrown
      }
    },
    events: { on: () => 0 },
    automation: { registerCommand: () => {}, execute: () => null },
  } as unknown as AgentPluginHost
  return { plugin: agentPlugin.activate(host), doc: () => doc }
}

/** The document as the engine reads back the HWP it writes. */
const saved = (doc: HwpDocument) => new HwpDocument(doc.exportHwp())

const textOf = (doc: HwpDocument, para: number) => {
  const length = doc.getParagraphLength(0, para)
  return length > 0 ? doc.getTextRange(0, para, 0, length) : ''
}

/** The paragraph and character formatting of a paragraph, as the engine numbers them. */
const lookOf = (doc: HwpDocument, para: number) => {
  const p = JSON.parse(doc.getParaPropertiesAt(0, para)) as { paraShapeId: number }
  const c = JSON.parse(doc.getCharPropertiesAt(0, para, 0)) as {
    charShapeId: number
    fontSize: number
    bold: boolean
  }
  return { paraShape: p.paraShapeId, charShape: c.charShapeId, size: c.fontSize, bold: c.bold }
}

const REPORT = ['보고서', '2. 목적', '본문 하나입니다.', '본문 둘입니다.', '3. 방법']
const REPORT_HEADINGS = ['2. 목적', '3. 방법']

describe('paragraphs added after a heading', () => {
  it('take the formatting of the body paragraph that follows, and leave the heading as it was', () => {
    const { plugin, doc } = open(REPORT, REPORT_HEADINGS)
    const heading = lookOf(doc(), 1)
    const body = lookOf(doc(), 2)
    expect(heading).not.toEqual(body)
    const result = plugin.insertParagraphs('2. 목적', null, 'after', ['새 하나', '', '새 셋'])
    expect(result).toMatchObject({ ok: true, count: 3, inTable: false })
    for (const d of [doc(), saved(doc())]) {
      expect([1, 2, 3, 4, 5].map((k) => textOf(d, k))).toEqual([
        '2. 목적',
        '새 하나',
        '',
        '새 셋',
        '본문 하나입니다.',
      ])
      expect(lookOf(d, 1)).toEqual(heading)
      for (const k of [2, 3, 4]) expect(lookOf(d, k)).toEqual(body)
    }
    // the places reported are the new paragraphs
    expect(result.ok && result.place).toMatchObject({ sec: 0, para: 2 })
  })

  it('do so for a heading that is only bold', () => {
    const { plugin, doc } = open(['보고서', '목적', '본문입니다.'], [])
    doc().applyCharFormat(0, 1, 0, 2, JSON.stringify({ bold: true }))
    plugin.insertParagraphs('목적', null, 'after', ['새 문단'])
    expect(lookOf(doc(), 2)).toEqual(lookOf(doc(), 3))
    expect(lookOf(doc(), 2).bold).toBe(false)
    expect(lookOf(doc(), 1).bold).toBe(true)
  })
})

describe('paragraphs added where Enter is kept', () => {
  it('after a body paragraph followed by one of the same look', () => {
    const { plugin, doc } = open(REPORT, REPORT_HEADINGS)
    const body = lookOf(doc(), 2)
    plugin.insertParagraphs('본문 하나', null, 'after', ['새 문단'])
    expect(textOf(doc(), 3)).toBe('새 문단')
    expect(lookOf(doc(), 3)).toEqual(body)
  })

  it('after a paragraph whose next one only lines up differently', () => {
    const { plugin, doc } = open(['보고서', '본문 하나입니다.', '본문 둘입니다.'], [])
    doc().applyParaFormat(0, 2, JSON.stringify({ alignment: 'right' }))
    const anchor = lookOf(doc(), 1)
    plugin.insertParagraphs('본문 하나', null, 'after', ['새 문단'])
    expect(lookOf(doc(), 2)).toEqual(anchor)
    expect(lookOf(doc(), 2).paraShape).not.toBe(lookOf(doc(), 3).paraShape)
  })

  it('after the last body paragraph before the next heading', () => {
    const { plugin, doc } = open(REPORT, REPORT_HEADINGS)
    const body = lookOf(doc(), 3)
    plugin.insertParagraphs('본문 둘', null, 'after', ['새 문단'])
    expect(textOf(doc(), 4)).toBe('새 문단')
    expect(lookOf(doc(), 4)).toEqual(body)
    expect(lookOf(doc(), 5).bold).toBe(true)
  })

  it('after a heading that is the last paragraph', () => {
    const { plugin, doc } = open(REPORT, REPORT_HEADINGS)
    const heading = lookOf(doc(), 4)
    plugin.insertParagraphs('3. 방법', null, 'after', ['새 문단'])
    expect(textOf(doc(), 5)).toBe('새 문단')
    expect(lookOf(doc(), 5)).toEqual(heading)
  })

  it('after a heading followed by a table, which stays whole', () => {
    const { plugin, doc } = open(['보고서', '2. 목적', '본문입니다.'], ['2. 목적'], '2. 목적')
    const heading = lookOf(doc(), 1)
    expect(plugin.insertParagraphs('2. 목적', null, 'after', ['새 문단'])).toMatchObject({
      ok: true,
    })
    expect(textOf(doc(), 2)).toBe('새 문단')
    expect(lookOf(doc(), 2)).toEqual(heading)
    const tables = (JSON.parse(doc().getControls()) as { ctrlId: string }[]).filter(
      (c) => c.ctrlId === 'tbl',
    )
    expect(tables).toHaveLength(1)
  })

  it('before a heading', () => {
    const { plugin, doc } = open(REPORT, REPORT_HEADINGS)
    const heading = lookOf(doc(), 4)
    plugin.insertParagraphs('3. 방법', null, 'before', ['새 문단'])
    expect(textOf(doc(), 4)).toBe('새 문단')
    expect(lookOf(doc(), 4)).toEqual(heading)
  })
})
