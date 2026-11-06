/**
 * The status bar's character count as the plugin puts it up (showCharCount, issue #295),
 * against the real rhwp engine: the document's characters as 문서 정보 counts them, the block's
 * through the same selection walk the AI panel reads, and a count put off while typing.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { JSDOM } from 'jsdom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import { agentPlugin, type AgentPluginHost } from '../studio-plugin/agent-plugin.mjs'
import { CHAR_COUNT_ID, TOTAL_PAUSE_MS } from '../studio-plugin/char-count.mjs'
import { documentStats } from '../studio-plugin/document-info.mjs'

const require = createRequire(import.meta.url)

beforeAll(async () => {
  const wasm = join(dirname(require.resolve('@rhwp/core')), 'rhwp_bg.wasm')
  await init({ module_or_path: readFileSync(wasm) })
})

interface Position {
  sectionIndex: number
  paragraphIndex: number
  charOffset: number
  parentParaIndex?: number
  controlIndex?: number
  cellIndex?: number
  cellParaIndex?: number
}

interface Command {
  id: string
  execute(services: unknown, params?: unknown): void
}

const json = (value: string) => JSON.parse(value)

/** The editor's WasmBridge for the counts, as tests/document-info.test.ts has it. */
function bridgeOf(doc: HwpDocument) {
  return {
    getSectionCount: () => doc.getSectionCount(),
    getParagraphCount: (sec: number) => doc.getParagraphCount(sec),
    getParagraphLength: (sec: number, para: number) => doc.getParagraphLength(sec, para),
    getTextRange: (sec: number, para: number, offset: number, count: number) =>
      doc.getTextRange(sec, para, offset, count),
    getTextBoxControlIndex: (sec: number, para: number) => doc.getTextBoxControlIndex(sec, para),
    getControlTextPositions: (sec: number, para: number) =>
      json(doc.getControlTextPositions(sec, para)),
    getTableDimensionsByPath: (sec: number, para: number, path: string) =>
      json(doc.getTableDimensionsByPath(sec, para, path)),
    getCellParagraphCountByPath: (sec: number, para: number, path: string) =>
      doc.getCellParagraphCountByPath(sec, para, path),
    getCellParagraphLengthByPath: (sec: number, para: number, path: string) =>
      doc.getCellParagraphLengthByPath(sec, para, path),
    getTextInCellByPath: (sec: number, para: number, path: string, offset: number, count: number) =>
      doc.getTextInCellByPath(sec, para, path, offset, count),
  }
}

const inBody = (para: number, offset: number): Position => ({
  sectionIndex: 0,
  paragraphIndex: para,
  charOffset: offset,
})

const LABELS = {
  total: '글자 {total}',
  selected: '글자 {selected} / {total}',
  hint: '공백 제외 {noSpace}',
  locale: 'ko',
}

/** 첫째 문단 글. / [2×2 table] / 셋째 문단 글., as the engine builds it. */
function openDocument() {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  const lines = ['첫째 문단 글.', '', '셋째 문단 글.']
  lines.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    if (line) doc.insertText(0, index, 0, line)
  })
  doc.pasteHtml(0, 1, 0, '<table><tr><td>대상</td><td>65세 이상</td></tr></table>')

  const commands = new Map<string, Command>()
  const listeners = new Map<string, (() => void)[]>()
  const cursor = {
    anchor: null as Position | null,
    position: inBody(0, 0),
    hasSelection() {
      return this.anchor !== null
    },
    getPosition() {
      return { ...this.position }
    },
    isInCellSelectionMode: () => false,
    getSelectionOrdered() {
      return this.anchor ? { start: this.anchor, end: this.position } : null
    },
  }
  const services = { getInputHandler: () => ({ cursor }), wasm: bridgeOf(doc) }
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: () => {
      throw new Error('the count changes nothing')
    },
    events: {
      on: (name: string, fn: () => void) => {
        listeners.set(name, [...(listeners.get(name) ?? []), fn])
        return () =>
          listeners.set(
            name,
            (listeners.get(name) ?? []).filter((f) => f !== fn),
          )
      },
    },
    automation: {
      registerCommand: (command: Command) => commands.set(command.id, command),
      execute: (id: string, params?: unknown) => {
        commands.get(id)?.execute(services, params)
        return { ok: true }
      },
    },
  } as unknown as AgentPluginHost
  const plugin = agentPlugin.activate(host)
  return {
    doc,
    plugin,
    emit: (name: string) => (listeners.get(name) ?? []).forEach((fn) => fn()),
    listening: (name: string) => (listeners.get(name) ?? []).length,
    select: (start: Position, end: Position) => {
      cursor.anchor = start
      cursor.position = end
    },
  }
}

const scope = globalThis as { document?: Document }
const realDocument = scope.document

afterEach(() => {
  agentPlugin.deactivate()
  vi.useRealTimers()
  if (realDocument === undefined) delete scope.document
  else scope.document = realDocument
})

function withStatusBar() {
  const page = new JSDOM(
    '<footer id="status-bar"><span id="sb-mode">삽입</span><span id="sb-message"></span></footer>',
  ).window.document
  scope.document = page
  return () => page.getElementById(CHAR_COUNT_ID)
}

describe('the status bar character count', () => {
  it('shows the characters 문서 정보 counts, and the block against them', () => {
    vi.useFakeTimers()
    const item = withStatusBar()
    const open = openDocument()
    expect(open.plugin.showCharCount(LABELS)).toEqual({ ok: true })
    vi.advanceTimersByTime(0)
    const stats = documentStats(bridgeOf(open.doc) as never, { textOnly: true })
    // 첫째 문단 글.(8) + 셋째 문단 글.(8) + the cells 대상(2) and 65세 이상(6)
    expect(stats.chars).toBe(24)
    expect(item()?.textContent).toBe('글자 24')
    expect(item()?.title).toBe(`공백 제외 ${stats.charsNoSpace}`)

    // 문단 글 in the first paragraph
    open.select(inBody(0, 3), inBody(0, 7))
    open.emit('cursor-rect-updated')
    vi.advanceTimersByTime(1000)
    expect(item()?.textContent).toBe('글자 4 / 24')
    expect(item()?.title).toBe(`공백 제외 3 / ${stats.charsNoSpace}`)

    // from the first paragraph to the last: the table between goes in whole
    open.select(inBody(0, 0), inBody(2, open.doc.getParagraphLength(0, 2)))
    open.emit('cursor-rect-updated')
    vi.advanceTimersByTime(1000)
    expect(item()?.textContent).toBe('글자 24 / 24')
  })

  it('counts the document again once typing rests, not for each key', () => {
    vi.useFakeTimers()
    const item = withStatusBar()
    const open = openDocument()
    open.plugin.showCharCount(LABELS)
    vi.advanceTimersByTime(0)
    for (const text of ['가', '나', '다']) {
      open.doc.insertText(0, 0, 0, text)
      open.emit('document-changed')
      vi.advanceTimersByTime(100)
      expect(item()?.textContent).toBe('글자 24')
    }
    vi.advanceTimersByTime(TOTAL_PAUSE_MS)
    expect(item()?.textContent).toBe('글자 27')
  })

  it('changes its words when the app gives others, without a second item', () => {
    vi.useFakeTimers()
    const item = withStatusBar()
    const open = openDocument()
    open.plugin.showCharCount(LABELS)
    vi.advanceTimersByTime(0)
    open.plugin.showCharCount({
      total: 'Characters {total}',
      selected: '{selected} / {total}',
      hint: '{noSpace}',
      locale: 'en',
    })
    expect(item()?.textContent).toBe('Characters 24')
    expect(scope.document!.querySelectorAll(`#${CHAR_COUNT_ID}`)).toHaveLength(1)
    expect(open.listening('document-changed')).toBeGreaterThan(0)
  })

  it('stops counting when the plugin goes', () => {
    vi.useFakeTimers()
    withStatusBar()
    const open = openDocument()
    open.plugin.showCharCount(LABELS)
    const before = open.listening('cursor-rect-updated')
    agentPlugin.deactivate()
    expect(open.listening('cursor-rect-updated')).toBe(before - 1)
  })

  it('refuses labels it cannot show, and answers false without a status bar', () => {
    const open = openDocument()
    expect(() => open.plugin.showCharCount({ ...LABELS, total: '' })).toThrow(/total/)
    scope.document = new JSDOM('<body></body>').window.document
    expect(open.plugin.showCharCount(LABELS)).toEqual({ ok: false })
  })
})
