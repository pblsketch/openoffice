/**
 * The editor's right-click item 쉬운 말로 풀기 as the plugin registers it, against the real rhwp
 * engine: the name the app gives it, off while nothing is selected, and a click that hands the
 * selected text to the app as an event on the editor's window and changes nothing.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import init, { HwpDocument } from '@rhwp/core'
import {
  EASY_WORDS_COMMAND,
  EASY_WORDS_EVENT,
  agentPlugin,
  type AgentEditorContext,
  type AgentPluginHost,
} from '../studio-plugin/agent-plugin.mjs'

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
  label: string
  canExecute?(context: AgentEditorContext): boolean
  execute(services: unknown, params?: unknown): void
}

const inBody = (para: number, offset: number): Position => ({
  sectionIndex: 0,
  paragraphIndex: para,
  charOffset: offset,
})
const inCell = (cell: number, offset: number): Position => ({
  sectionIndex: 0,
  paragraphIndex: 1,
  charOffset: offset,
  parentParaIndex: 1,
  controlIndex: 0,
  cellIndex: cell,
  cellParaIndex: 0,
})

const FIRST = '본인부담금은 소득 하위 30%에 면제한다.'

/**
 * A document built with the engine itself:
 *   본인부담금은 소득 하위 30%에 면제한다. / [2×2 table] / 신청은 3월 31일까지 한다.
 */
function openDocument(registers = true) {
  const doc = HwpDocument.createEmpty()
  doc.createBlankDocument()
  const lines = [FIRST, '', '신청은 3월 31일까지 한다.']
  lines.forEach((line, index) => {
    if (index > 0) doc.splitParagraph(0, index - 1, doc.getParagraphLength(0, index - 1))
    if (line) doc.insertText(0, index, 0, line)
  })
  doc.pasteHtml(0, 1, 0, '<table><tr><td>대상</td><td>65세 이상</td></tr></table>')
  const before = doc.exportHwp()

  const commands = new Map<string, Command>()
  let changes = 0
  const cursor = {
    anchor: null as Position | null,
    position: inBody(0, 0),
    block: null as null | { startRow: number; startCol: number; endRow: number; endCol: number },
    hasSelection() {
      return this.anchor !== null
    },
    getPosition() {
      return { ...this.position }
    },
    isInCellSelectionMode() {
      return this.block !== null
    },
    getSelectedCellRange() {
      return this.block
    },
    getCellTableContext() {
      return this.block ? { sec: 0, ppi: 1, ci: 0 } : null
    },
    getExcludedCells() {
      return new Set<string>()
    },
    getSelectionOrdered() {
      return this.anchor ? { start: this.anchor, end: this.position } : null
    },
    clearSelection() {
      this.anchor = null
    },
    moveTo(position: Position) {
      this.position = { ...position }
    },
    setAnchor() {
      this.anchor = { ...this.position }
    },
  }
  const automation: Record<string, unknown> = {
    execute: (id: string, params?: unknown) => {
      const command = commands.get(id)
      if (!command) return { ok: false }
      command.execute({ getInputHandler: () => ({ cursor, updateCaret: () => {} }) }, params)
      return { ok: true }
    },
  }
  if (registers) {
    // the studio's registry overwrites a command registered again under the same id
    automation.registerCommand = (command: Command) => commands.set(command.id, command)
    automation.unregisterCommand = (id: string) => commands.delete(id)
  }
  const host = {
    read: (fn: (d: never) => unknown) => fn(doc as never),
    transaction: (_label: string, fn: (tx: never) => unknown) => {
      changes += 1
      return fn({ doc: () => doc, deferPagination: () => {} } as never)
    },
    events: { on: () => 0 },
    automation,
  } as unknown as AgentPluginHost

  const plugin = agentPlugin.activate(host)
  /** the editor's state as its command dispatcher reads it */
  const context = (over: Partial<AgentEditorContext> = {}): AgentEditorContext => ({
    hasDocument: true,
    hasSelection: cursor.anchor !== null,
    inCellSelectionMode: cursor.block !== null,
    ...over,
  })
  return {
    plugin,
    command: () => commands.get(EASY_WORDS_COMMAND),
    context,
    select: (start: Position, end: Position) => {
      cursor.anchor = start
      cursor.position = end
    },
    selectCells: (range: {
      startRow: number
      startCol: number
      endRow: number
      endCol: number
    }) => {
      cursor.block = range
    },
    /** a click on the menu item: the dispatcher runs the command only when it is on */
    click: () => {
      const command = commands.get(EASY_WORDS_COMMAND)
      if (!command) throw new Error('not registered')
      if (command.canExecute && !command.canExecute(context())) return false
      command.execute(undefined)
      return true
    },
    unchanged: () => changes === 0 && doc.exportHwp().length === before.length,
  }
}

const fired: unknown[] = []
const scope = globalThis as { dispatchEvent?: (event: Event) => boolean }
const original = scope.dispatchEvent
scope.dispatchEvent = (event: Event) => {
  if (event.type === EASY_WORDS_EVENT) fired.push((event as CustomEvent).detail)
  return true
}

afterEach(() => {
  fired.length = 0
})

afterAll(() => {
  if (original === undefined) delete scope.dispatchEvent
  else scope.dispatchEvent = original
})

describe('the right-click item 쉬운 말로 풀기', () => {
  it('is the command the menus name, under the label the app gives it', () => {
    const { plugin, command } = openDocument()
    expect(EASY_WORDS_COMMAND).toBe('ext:ieum-easy-words')
    expect(plugin.installEasyWords('쉬운 말로 풀기')).toEqual({ ok: true })
    expect(command()?.label).toBe('쉬운 말로 풀기')
    // the screen language changed: the item takes the new name
    expect(plugin.installEasyWords('Explain in plain words')).toEqual({ ok: true })
    expect(command()?.label).toBe('Explain in plain words')
  })

  it('is off while nothing is selected, and without a document', () => {
    const { plugin, command, context, select } = openDocument()
    plugin.installEasyWords('쉬운 말로 풀기')
    const canExecute = command()?.canExecute
    expect(canExecute).toBeTypeOf('function')
    expect(canExecute!(context())).toBe(false)
    select(inBody(0, 0), inBody(0, 5))
    expect(canExecute!(context())).toBe(true)
    expect(canExecute!(context({ hasDocument: false }))).toBe(false)
    const cells = openDocument()
    cells.plugin.installEasyWords('쉬운 말로 풀기')
    cells.selectCells({ startRow: 0, startCol: 0, endRow: 0, endCol: 1 })
    expect(cells.command()!.canExecute!(cells.context())).toBe(true)
  })

  it('does nothing on a click with nothing selected', () => {
    const { plugin, click, unchanged } = openDocument()
    plugin.installEasyWords('쉬운 말로 풀기')
    expect(click()).toBe(false)
    expect(fired).toEqual([])
    expect(unchanged()).toBe(true)
  })

  it('hands the selected text to the app and changes nothing', () => {
    const { plugin, select, click, unchanged } = openDocument()
    plugin.installEasyWords('쉬운 말로 풀기')
    select(inBody(0, 0), inBody(0, FIRST.length))
    expect(click()).toBe(true)
    expect(fired).toEqual([{ text: FIRST }])
    expect(unchanged()).toBe(true)
  })

  it('hands over the text of a cell and of a block of cells, a line per paragraph', () => {
    const one = openDocument()
    one.plugin.installEasyWords('쉬운 말로 풀기')
    one.select(inCell(1, 0), inCell(1, 6))
    one.click()
    const block = openDocument()
    block.plugin.installEasyWords('쉬운 말로 풀기')
    block.selectCells({ startRow: 0, startCol: 0, endRow: 0, endCol: 1 })
    block.click()
    expect(fired).toEqual([{ text: '65세 이상' }, { text: '대상\n65세 이상' }])
  })

  it('refuses an empty name, and says so in an editor without commands', () => {
    expect(() => openDocument().plugin.installEasyWords('  ')).toThrow(/label/)
    expect(openDocument(false).plugin.installEasyWords('쉬운 말로 풀기')).toEqual({ ok: false })
  })
})
