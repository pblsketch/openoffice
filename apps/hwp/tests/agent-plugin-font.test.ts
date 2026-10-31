/**
 * `replaceFont` against the real engine: every run that names a font takes another, in the
 * body and in table cells, and the whole thing is one undo step.
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

/** 첫째 / 둘째 / [2×2 table: 구분 내용 / 대상 업체] */
function openEditor() {
  let doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  const lines = ['첫째 문단입니다.', '둘째 문단입니다.', '']
  lines.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    if (line) doc.insertText(0, index, 0, line)
  })
  doc.pasteHtml(
    0,
    2,
    0,
    '<table><tr><td>구분</td><td>내용</td></tr><tr><td>대상</td><td>업체</td></tr></table>',
  )

  const history: Uint8Array[] = []
  const listeners: (() => void)[] = []
  const emit = () => listeners.forEach((listener) => listener())
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: (_label: string, fn: (tx: never) => unknown) => {
      const before = doc.exportHwp()
      try {
        const result = fn({ doc: () => doc, deferPagination: () => {} } as never)
        history.push(before)
        emit()
        return result
      } catch (thrown) {
        doc = new HwpDocument(before)
        throw thrown
      }
    },
    events: { on: (_name: string, handler: () => void) => listeners.push(handler) },
    automation: {
      execute: (command: string) => {
        if (command !== 'edit:undo') return null
        const before = history.pop()
        if (!before) return { ok: false }
        doc = new HwpDocument(before)
        emit()
        return { ok: true }
      },
    },
  } as unknown as AgentPluginHost

  const plugin = agentPlugin.activate(host)
  const charsAt = (para: number, offset = 0) =>
    JSON.parse(doc.getCharPropertiesAt(0, para, offset)) as { fontFamilies: string[] }
  const cellChars = () =>
    JSON.parse(doc.getCellCharPropertiesAtByPath(0, 2, CELL, 0)) as { fontFamilies: string[] }
  return {
    plugin,
    charsAt,
    cellChars,
    undo: () => void host.automation.execute('edit:undo'),
    steps: () => history.length,
  }
}

const CELL = JSON.stringify([{ controlIndex: 0, cellIndex: 0, cellParaIndex: 0 }])

describe('replaceFont', () => {
  it('changes every run that names the font, in the body', () => {
    const editor = openEditor()
    const applied = editor.plugin.formatText('첫째', null, false, { font: '휴먼명조' })
    expect(applied.ok).toBe(true)
    expect(editor.charsAt(0).fontFamilies[0]).toBe('휴먼명조')

    const result = editor.plugin.replaceFont('휴먼명조', '함초롬바탕')
    expect(result).toMatchObject({ ok: true })
    expect(result.ranges).toBeGreaterThan(0)
    expect(result.paragraphs).toBeGreaterThan(0)
    expect(editor.charsAt(0).fontFamilies[0]).toBe('함초롬바탕')
  })

  it('changes the text inside table cells too', () => {
    const editor = openEditor()
    const applied = editor.plugin.formatText('구분', null, false, { font: 'HY견명조' })
    expect(applied.ok).toBe(true)
    expect(editor.cellChars().fontFamilies[0]).toBe('HY견명조')

    const result = editor.plugin.replaceFont('HY견명조', '맑은 고딕')
    expect(result.ranges).toBeGreaterThan(0)
    expect(editor.cellChars().fontFamilies[0]).toBe('맑은 고딕')
  })

  it('answers zero when no text uses the font', () => {
    const editor = openEditor()
    const result = editor.plugin.replaceFont('없는글꼴', '함초롬바탕')
    expect(result).toMatchObject({ ok: true, ranges: 0, paragraphs: 0 })
  })

  it('takes one undo step', () => {
    const editor = openEditor()
    editor.plugin.formatText('첫째', null, false, { font: '휴먼명조' })
    const steps = editor.steps()
    editor.plugin.replaceFont('휴먼명조', '함초롬바탕')
    expect(editor.charsAt(0).fontFamilies[0]).toBe('함초롬바탕')
    expect(editor.steps()).toBe(steps + 1)

    editor.undo()
    expect(editor.charsAt(0).fontFamilies[0]).toBe('휴먼명조')
  })

  it('refuses an empty font name', () => {
    const editor = openEditor()
    expect(() => editor.plugin.replaceFont('', '함초롬바탕')).toThrow(/both font names/)
  })
})
