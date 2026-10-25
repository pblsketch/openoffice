import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  ADDED_SHORTCUTS,
  CHORDS,
  LABELS,
  REMOVED_SHORTCUTS,
  STYLE_KEYS,
  TEXT_COLORS,
  adaptToHancom,
  deleteLine,
  equalizeTableCells,
  hancomCellBlockKey,
  hancomCellKey,
  hancomChordKey,
  hancomChordStart,
  hancomCommands,
  hancomContextKey,
  hancomTableObjectKey,
  letterOf,
  MAIN_PROCESS_KEYS,
  resizeRowColumnBlock,
  resizeSelectedCell,
  studioCommandIds,
  withHancomLabel,
} from '../studio-plugin/hancom-keys.mjs'

type Key = Partial<KeyboardEvent> & { preventDefault: () => void }

const key = (init: Partial<KeyboardEvent>): Key => ({
  key: '',
  code: '',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  keyCode: 0,
  preventDefault: vi.fn(),
  ...init,
})

/** What a Korean IME hands the page for a letter it is about to compose. */
const imeKey = (code: string, init: Partial<KeyboardEvent> = {}) =>
  key({ key: 'Process', code, keyCode: 229, ...init })

function handler(enabled: string[] = []) {
  let phase = 1
  let focus = { row: 0, col: 0 }
  const cursor = {
    isInCell: () => false,
    isInTextBox: () => false,
    isInCellSelectionMode: () => false,
    isInTableObjectSelection: () => false,
    isInHeaderFooter: () => false,
    isInFootnote: () => false,
    getCellTableContext: (): { sec: number; ppi: number; ci: number } | null => null,
    getSelectedCellRange: () =>
      null as { startRow: number; startCol: number; endRow: number; endCol: number } | null,
    exitTableObjectSelection: vi.fn(),
    enterCellSelectionMode: vi.fn(() => true),
    advanceCellSelectionPhase: vi.fn(() => {
      phase = Math.min(3, phase + 1)
    }),
    getCellSelectionPhase: () => phase,
    getCellSelectionFocus: () => ({ ...focus }),
    setCellSelectionAnchor: vi.fn((row: number, col: number) => {
      focus = { row, col }
    }),
    setCellSelectionFocus: vi.fn((row: number, col: number) => {
      focus = { row, col }
    }),
    exitCellSelectionMode: vi.fn(),
    moveToCellByIndex: vi.fn(),
    moveTo: vi.fn(),
    clearSelection: vi.fn(),
  }
  return {
    _hancomChord: null as string | null,
    _cellBlockLetterImeGuard: { arm: vi.fn() },
    cursor,
    caret: { hide: vi.fn() },
    eventBus: { emit: vi.fn() },
    getCursorPosition: () => ({
      sectionIndex: 0,
      paragraphIndex: 0,
      charOffset: 0,
      parentParaIndex: 1,
      controlIndex: 0,
      cellIndex: 0,
      cellParaIndex: 0,
    }),
    getSelectedTableRef: (): {
      sec: number
      ppi: number
      ci: number
      cellPath?: unknown[]
    } | null => null,
    isFormMode: () => false,
    wasm: {
      getTableDimensions: () => ({ rowCount: 3, colCount: 3, cellCount: 9 }),
      getCellInfo: (_s: number, _p: number, _c: number, i: number) => ({
        row: Math.floor(i / 3),
        col: i % 3,
        rowSpan: 1,
        colSpan: 1,
      }),
      getParagraphCount: () => 2,
      getParagraphLength: () => 0,
      getCellParagraphCount: () => 1,
      getCellParagraphLength: () => 0,
      getTextInCell: () => '',
      setTableProperties: vi.fn(() => ({ ok: true })),
      changeShapeZOrder: vi.fn(() => ({
        ok: true,
        moves: [{ ppi: 1, ci: 0, before: 0, after: 1 }],
      })),
    },
    executeOperation: vi.fn(),
    updateCellSelection: vi.fn(),
    clearSelectedCellBlock: vi.fn(() => true),
    updateCaret: vi.fn(),
    dispatcher: {
      dispatch: vi.fn(() => true),
      isEnabled: vi.fn((id: string) => enabled.includes(id)),
    },
  }
}

describe('the key a letter sits on', () => {
  it('reads the physical key first, so the input language does not matter', () => {
    expect(letterOf(key({ key: 'Process', code: 'KeyT' }))).toBe('t')
    expect(letterOf(key({ key: 'ㅅ', code: 'KeyT' }))).toBe('t')
    expect(letterOf(key({ key: '!', code: 'Digit1' }))).toBe('1')
  })

  it('falls back to the key, and to the jamo of the Dubeolsik layout', () => {
    expect(letterOf(key({ key: 'T' }))).toBe('t')
    expect(letterOf(key({ key: 'ㅅ' }))).toBe('t')
    expect(letterOf(key({ key: 'Enter', code: 'Enter' }))).toBeNull()
  })
})

describe('Hangul sequences (Ctrl+N,T and the like)', () => {
  it('take Ctrl+N and run the command of the second key', () => {
    const ih = handler()
    const first = key({ key: 'n', code: 'KeyN', ctrlKey: true })
    expect(hancomChordStart(ih, first)).toBe(true)
    expect(first.preventDefault).toHaveBeenCalled()
    const second = key({ key: 't', code: 'KeyT' })
    expect(hancomChordKey(ih, second)).toBe(true)
    expect(second.preventDefault).toHaveBeenCalled()
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('table:create')
    expect(ih._hancomChord).toBeNull()
  })

  it('work while the IME composes, and keep the composed letter out of the document', () => {
    const ih = handler()
    expect(hancomChordStart(ih, imeKey('KeyN', { ctrlKey: true, isComposing: true }))).toBe(true)
    const second = imeKey('KeyN')
    expect(hancomChordKey(ih, second)).toBe(true)
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('insert:footnote')
    expect(ih._cellBlockLetterImeGuard.arm).toHaveBeenCalledWith(second)
  })

  it('take Ctrl+N pressed in the middle of composing, which the Windows IME reports twice', () => {
    // the keydowns the editor saw from the real Korean IME (2026-10-22): 가 composing, Ctrl+N, T
    const ih = handler()
    const run = (e: Key) => hancomChordKey(ih, e) || hancomChordStart(ih, e)
    expect(run(imeKey('ControlLeft', { ctrlKey: true, isComposing: true, timeStamp: 100 }))).toBe(
      false,
    )
    expect(
      run(
        key({ key: 'Control', code: 'ControlLeft', keyCode: 17, ctrlKey: true, isComposing: true }),
      ),
    ).toBe(false)
    expect(run(imeKey('KeyN', { ctrlKey: true, isComposing: true, timeStamp: 110 }))).toBe(true)
    // the IME commits 가 and hands the same press over again, as the plain key
    const again = key({ key: 'n', code: 'KeyN', keyCode: 78, ctrlKey: true, timeStamp: 130 })
    expect(run(again)).toBe(true)
    expect(again.preventDefault).toHaveBeenCalled()
    expect(ih.dispatcher.dispatch).not.toHaveBeenCalled()
    expect(ih._hancomChord).toBe('n')
    // T starts a new composition: "Process", 229, the physical key in the code
    const t = imeKey('KeyT', { timeStamp: 400 })
    expect(run(t)).toBe(true)
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('table:create')
    expect(ih._cellBlockLetterImeGuard.arm).toHaveBeenCalledWith(t)
  })

  it('take Ctrl+N,N typed with Ctrl held after an IME start, when it is a second press', () => {
    const ih = handler()
    hancomChordStart(ih, imeKey('KeyN', { ctrlKey: true, isComposing: true, timeStamp: 0 }))
    // well after the IME's repeat would have come: a press of its own
    hancomChordKey(ih, key({ key: 'n', code: 'KeyN', keyCode: 78, ctrlKey: true, timeStamp: 900 }))
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('insert:footnote')
  })

  it('accept the second key with Ctrl still held', () => {
    const ih = handler()
    hancomChordStart(ih, key({ key: 'n', code: 'KeyN', ctrlKey: true }))
    hancomChordKey(ih, key({ key: 'a', code: 'KeyA', ctrlKey: true }))
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('table:split')
  })

  it('wait through a modifier pressed between the keys', () => {
    const ih = handler()
    hancomChordStart(ih, key({ key: 'n', code: 'KeyN', ctrlKey: true }))
    expect(hancomChordKey(ih, key({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }))).toBe(false)
    expect(ih._hancomChord).toBe('n')
    expect(hancomChordKey(ih, key({ key: 'E', code: 'KeyE', shiftKey: true }))).toBe(true)
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('insert:endnote')
  })

  it('let a second key they have no command for go on as a key of its own', () => {
    const ih = handler()
    hancomChordStart(ih, key({ key: 'n', code: 'KeyN', ctrlKey: true }))
    const stray = key({ key: 'x', code: 'KeyX' })
    expect(hancomChordKey(ih, stray)).toBe(false)
    expect(stray.preventDefault).not.toHaveBeenCalled()
    expect(ih.dispatcher.dispatch).not.toHaveBeenCalled()
    expect(ih._hancomChord).toBeNull()
  })

  it('open what the caret is on for Ctrl+N,K, as Hangul does', () => {
    const inTable = handler(['table:cell-props'])
    hancomChordStart(inTable, key({ key: 'n', code: 'KeyN', ctrlKey: true }))
    hancomChordKey(inTable, key({ key: 'k', code: 'KeyK' }))
    expect(inTable.dispatcher.dispatch).toHaveBeenCalledWith('table:cell-props')
    const inField = handler(['field:edit', 'table:cell-props'])
    hancomChordStart(inField, key({ key: 'n', code: 'KeyN', ctrlKey: true }))
    hancomChordKey(inField, key({ key: 'k', code: 'KeyK' }))
    expect(inField.dispatcher.dispatch).toHaveBeenCalledWith('field:edit')
  })

  it('give Ctrl+M,<letter> to the text colours, as Hangul does', () => {
    const ih = handler()
    hancomChordStart(ih, key({ key: 'm', code: 'KeyM', ctrlKey: true }))
    hancomChordKey(ih, key({ key: 'r', code: 'KeyR' }))
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('ieum:text-color-r')
    expect(Object.keys(CHORDS.m).sort()).toEqual(Object.keys(TEXT_COLORS).sort())
  })

  it('do not start on Shift or Alt, or on a letter that has no sequence', () => {
    const ih = handler()
    expect(
      hancomChordStart(ih, key({ key: 'n', code: 'KeyN', ctrlKey: true, shiftKey: true })),
    ).toBe(false)
    expect(hancomChordStart(ih, key({ key: 'n', code: 'KeyN', ctrlKey: true, altKey: true }))).toBe(
      false,
    )
    expect(hancomChordStart(ih, key({ key: 'x', code: 'KeyX', ctrlKey: true }))).toBe(false)
    expect(ih._hancomChord).toBeNull()
  })

  it('leave Cmd+Q to the Mac, which quits on it', () => {
    const ih = handler()
    const quit = key({ key: 'q', code: 'KeyQ', metaKey: true })
    expect(hancomChordStart(ih, quit)).toBe(false)
    expect(quit.preventDefault).not.toHaveBeenCalled()
    expect(hancomChordStart(ih, key({ key: 'n', code: 'KeyN', metaKey: true }))).toBe(true)
  })
})

describe("the studio's shortcut table, made Hangul's", () => {
  const sample = () =>
    [
      [{ key: 'z', ctrl: true }, 'edit:undo'],
      [{ key: 'y', ctrl: true }, 'edit:redo'],
      [{ key: 'h', alt: true, shift: true }, 'format:align-right'],
      [{ key: 'ㅗ', alt: true, shift: true }, 'format:align-right'],
      [{ key: 'c', alt: true, shift: true }, 'format:align-center'],
      [{ key: '0', ctrl: true }, 'view:zoom-100'],
      [{ key: 'f10', alt: true }, 'insert:symbols'],
    ] as [Record<string, unknown>, string][]

  it('drops the stand-ins and the keys Hangul uses otherwise, and keeps the rest', () => {
    const table = adaptToHancom(sample())
    const ids = table.map(([def, id]) => `${JSON.stringify(def)} ${id}`)
    expect(ids).toContain('{"key":"z","ctrl":true} edit:undo')
    expect(ids).toContain('{"key":"f10","alt":true} insert:symbols')
    expect(ids.some((s) => s.endsWith('edit:redo'))).toBe(false)
    expect(ids.some((s) => s.endsWith('view:zoom-100'))).toBe(false)
    expect(ids.some((s) => s.includes('"alt":true') && s.includes('format:align'))).toBe(false)
  })

  it("puts Hangul's keys first", () => {
    const table = adaptToHancom(sample())
    expect(table.slice(0, ADDED_SHORTCUTS.length)).toEqual(ADDED_SHORTCUTS)
  })

  it('names Ctrl+1..0 and Ctrl+Alt+1..0 for the first ten styles', () => {
    const styles = ADDED_SHORTCUTS.filter(([, id]) => id.startsWith('ieum:style-'))
    expect(styles).toHaveLength(STYLE_KEYS * 2)
    expect(styles.find(([def]) => def.key === '1' && !def.alt)?.[1]).toBe('ieum:style-1')
    expect(styles.find(([def]) => def.key === '0' && !def.alt)?.[1]).toBe('ieum:style-10')
  })
})

describe('the menu labels', () => {
  it('follow the keys', () => {
    expect(
      withHancomLabel({ id: 'format:align-center', shortcutLabel: 'Alt+Shift+C' }).shortcutLabel,
    ).toBe('Ctrl+Shift+C')
    expect(
      withHancomLabel({ id: 'insert:equation', shortcutLabel: 'Ctrl+M,M' }).shortcutLabel,
    ).toBe('Ctrl+N,M')
  })

  it('leave every other command as it is, the same object', () => {
    const def = { id: 'edit:undo', shortcutLabel: 'Ctrl+Z' }
    expect(withHancomLabel(def)).toBe(def)
  })

  it('name only sequences that run the command they label', () => {
    for (const [id, label] of Object.entries(LABELS)) {
      const chord = /^Ctrl\+([A-Z]),([A-Z])$/.exec(label)
      if (!chord) continue
      const target = (CHORDS as Record<string, Record<string, string | string[]>>)[
        chord[1].toLowerCase()
      ][chord[2].toLowerCase()]
      expect([target].flat(), label).toContain(id)
    }
  })
})

describe('the new commands', () => {
  const services = (styles: { id: number; name: string }[] = []) => {
    const ih = { applyStyle: vi.fn() }
    return {
      ih,
      services: {
        getInputHandler: () => ih,
        eventBus: { emit: vi.fn() },
        wasm: { getStyleList: () => styles },
      },
    }
  }
  const command = (id: string) => hancomCommands('ko').find((c) => c.id === id)!

  it('apply the n-th style of the document for Ctrl+n', () => {
    const { ih, services: s } = services([
      { id: 0, name: '바탕글' },
      { id: 1, name: '본문' },
      { id: 2, name: '개요 1' },
    ])
    command('ieum:style-3').execute(s)
    expect(ih.applyStyle).toHaveBeenCalledWith(2)
    command('ieum:style-10').execute(s)
    expect(ih.applyStyle).toHaveBeenCalledTimes(1)
  })

  it("colour the text with Hangul's colours", () => {
    const { services: s } = services()
    command('ieum:text-color-d').execute(s)
    expect(s.eventBus.emit).toHaveBeenCalledWith('format-char', { textColor: '#993366' })
  })

  it('carry labels in the two languages the editor shows', () => {
    expect(command('ieum:delete-line').label).toBe('한 줄 지우기')
    expect(hancomCommands('en').find((c) => c.id === 'ieum:delete-line')!.label).toBe('Delete Line')
  })

  it('cover every command the keys name', () => {
    const ids = new Set(hancomCommands('en').map((c) => c.id))
    for (const [, id] of ADDED_SHORTCUTS) if (id.startsWith('ieum:')) expect(ids, id).toContain(id)
    for (const table of Object.values(CHORDS)) {
      for (const target of Object.values(table)) {
        for (const id of [target].flat()) if (id.startsWith('ieum:')) expect(ids, id).toContain(id)
      }
    }
    expect(studioCommandIds().some((id) => id.startsWith('ieum:'))).toBe(false)
  })

  it('register the table commands the keys use', () => {
    const ids = new Set(hancomCommands('en').map((command) => command.id))
    for (const id of [
      'ieum:table-insert-row-below',
      'ieum:table-resize',
      'ieum:table-order',
      'ieum:table-wrap',
      'ieum:table-block-resize',
      'ieum:table-row-column-resize',
      'ieum:table-cell-resize',
    ]) {
      expect(ids, id).toContain(id)
    }
  })
})

/**
 * A caret over paragraphs of fixed-width lines, enough of the studio's cursor for deleteLine: a
 * paragraph is split into lines of `width` characters, as the editor wraps it.
 */
function fakeEditor(paragraphs: string[], width = 10) {
  const paras = [...paragraphs]
  let position = { sectionIndex: 0, paragraphIndex: 0, charOffset: 0 }
  let anchor: typeof position | null = null
  const lineOf = (p: typeof position) =>
    Math.floor(Math.min(p.charOffset, Math.max(0, paras[p.paragraphIndex].length - 1)) / width)
  const cursor = {
    isInHeaderFooter: () => false,
    isInFootnote: () => false,
    isInPictureObjectSelection: () => false,
    isInTableObjectSelection: () => false,
    isInCellSelectionMode: () => false,
    clearSelection: () => {
      anchor = null
    },
    setAnchor: () => {
      anchor ??= { ...position }
    },
    moveToLineStart: () => {
      position = { ...position, charOffset: lineOf(position) * width }
    },
    moveToLineEnd: () => {
      const len = paras[position.paragraphIndex].length
      position = { ...position, charOffset: Math.min(len, (lineOf(position) + 1) * width) }
    },
    moveHorizontal: (delta: number) => {
      const len = paras[position.paragraphIndex].length
      const at = position.charOffset + delta
      if (at > len) {
        if (position.paragraphIndex + 1 < paras.length) {
          position = { ...position, paragraphIndex: position.paragraphIndex + 1, charOffset: 0 }
        }
      } else if (at >= 0) position = { ...position, charOffset: at }
    },
    moveTo: (p: typeof position) => {
      position = { ...p }
    },
    getPosition: () => ({ ...position }),
    getSelection: () => (anchor ? { anchor: { ...anchor }, focus: { ...position } } : null),
  }
  const ih = {
    cursor,
    isFormMode: () => false,
    updateCaret: vi.fn(),
    deleteSelection: () => {
      const [a, b] = [anchor!, position].sort(
        (x, y) => x.paragraphIndex - y.paragraphIndex || x.charOffset - y.charOffset,
      )
      const head = paras[a.paragraphIndex].slice(0, a.charOffset)
      const tail = paras[b.paragraphIndex].slice(b.charOffset)
      paras.splice(a.paragraphIndex, b.paragraphIndex - a.paragraphIndex + 1, head + tail)
      position = { ...a }
      anchor = null
    },
  }
  return {
    ih,
    paras,
    at: (paragraphIndex: number, charOffset: number) => {
      position = { sectionIndex: 0, paragraphIndex, charOffset }
    },
  }
}

describe("Ctrl+Y, Hangul's line deletion (as Hancom Hangul 2024 does it)", () => {
  it('deletes a one-line paragraph with its break: the next paragraph moves up', () => {
    const doc = fakeEditor(['가나다 라마바', '둘째 줄', '셋째 줄'])
    doc.at(0, 3)
    expect(deleteLine(doc.ih)).toBe(true)
    expect(doc.paras).toEqual(['둘째 줄', '셋째 줄'])
  })

  it('deletes one wrapped line of a long paragraph and nothing past it', () => {
    const doc = fakeEditor(['가'.repeat(25), '다음 문단'], 10)
    doc.at(0, 12)
    deleteLine(doc.ih)
    expect(doc.paras).toEqual(['가'.repeat(15), '다음 문단'])
  })

  it('empties the last line of the document and keeps the paragraph', () => {
    const doc = fakeEditor(['첫 줄', '끝 줄'])
    doc.at(1, 1)
    deleteLine(doc.ih)
    expect(doc.paras).toEqual(['첫 줄', ''])
  })

  it('takes an empty paragraph away', () => {
    const doc = fakeEditor(['첫 줄', '', '셋째'])
    doc.at(1, 0)
    deleteLine(doc.ih)
    expect(doc.paras).toEqual(['첫 줄', '셋째'])
  })

  it('does nothing on an empty last paragraph, and leaves no selection behind', () => {
    const doc = fakeEditor(['첫 줄', ''])
    doc.at(1, 0)
    expect(deleteLine(doc.ih)).toBe(false)
    expect(doc.paras).toEqual(['첫 줄', ''])
    expect(doc.ih.cursor.getSelection()).toBeNull()
  })

  it('does nothing in a header, a note, a selected object or a cell block', () => {
    for (const mode of [
      'isInHeaderFooter',
      'isInFootnote',
      'isInPictureObjectSelection',
      'isInTableObjectSelection',
      'isInCellSelectionMode',
    ] as const) {
      const doc = fakeEditor(['가나다', '라마바'])
      doc.ih.cursor[mode] = () => true
      expect(deleteLine(doc.ih), mode).toBe(false)
      expect(doc.paras).toEqual(['가나다', '라마바'])
    }
  })
})

describe("Hangul's table row keys inside a cell", () => {
  const inCell = (enabled = ['ieum:table-insert-row-below', 'table:delete-row']) => {
    const ih = handler(enabled)
    ih.cursor.isInCell = () => true
    return ih
  }

  it('adds a row below for Ctrl+Enter, not a page break', () => {
    const ih = inCell()
    const e = key({ key: 'Enter', code: 'Enter', ctrlKey: true })
    expect(hancomContextKey(ih, e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('ieum:table-insert-row-below')
  })

  it('puts the new row after a merged cell, reading its span live', () => {
    const ih = inCell()
    ih.wasm.getCellInfo = vi.fn(() => ({ row: 2, col: 0, rowSpan: 4, colSpan: 2 }))
    ih.wasm.insertTableRow = vi.fn(() => ({ ok: true, rowCount: 7, colCount: 3 }))
    ih.wasm.mergeTableCells = vi.fn(() => ({ ok: true }))
    ih.executeOperation = vi.fn((desc: { operation: (w: typeof ih.wasm) => unknown }) =>
      desc.operation(ih.wasm),
    )
    const command = hancomCommands('ko').find((c) => c.id === 'ieum:table-insert-row-below')!
    command.execute({ getInputHandler: () => ih, wasm: ih.wasm })
    expect(ih.wasm.insertTableRow).toHaveBeenCalledWith(0, 1, 0, 5, true)
    expect(ih.wasm.mergeTableCells).toHaveBeenCalledWith(0, 1, 0, 6, 0, 6, 1)
  })

  it('deletes the row for Ctrl+Backspace, not the word before', () => {
    const ih = inCell()
    const e = key({ key: 'Backspace', code: 'Backspace', ctrlKey: true })
    expect(hancomContextKey(ih, e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('table:delete-row')
  })

  it('keeps the last row of a table', () => {
    const ih = inCell()
    ih.wasm.getTableDimensions = () => ({ rowCount: 1, colCount: 1, cellCount: 1 })
    const e = key({ key: 'Backspace', code: 'Backspace', ctrlKey: true })
    expect(hancomContextKey(ih, e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(ih.dispatcher.dispatch).not.toHaveBeenCalled()
  })

  it('leaves both keys alone outside a table', () => {
    const ih = handler(['ieum:table-insert-row-below', 'table:delete-row'])
    for (const e of [
      key({ key: 'Enter', code: 'Enter', ctrlKey: true }),
      key({ key: 'Backspace', code: 'Backspace', ctrlKey: true }),
    ]) {
      expect(hancomContextKey(ih, e)).toBe(false)
      expect(e.preventDefault).not.toHaveBeenCalled()
    }
    expect(ih.dispatcher.dispatch).not.toHaveBeenCalled()
  })

  it('leaves Cmd+Backspace on a Mac to deleting the line', () => {
    const ih = inCell()
    const e = key({ key: 'Backspace', code: 'Backspace', metaKey: true })
    expect(hancomContextKey(ih, e)).toBe(false)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('does not page-break in a table that sits in a cell (Phase 2)', () => {
    const ih = inCell()
    ih.getCursorPosition = () => ({
      sectionIndex: 0,
      paragraphIndex: 0,
      charOffset: 0,
      parentParaIndex: 1,
      controlIndex: 0,
      cellIndex: 0,
      cellParaIndex: 0,
      cellPath: [
        { controlIndex: 0, cellIndex: 0, cellParaIndex: 0 },
        { controlIndex: 1, cellIndex: 0, cellParaIndex: 0 },
      ],
    })
    const e = key({ key: 'Enter', code: 'Enter', ctrlKey: true })
    expect(hancomContextKey(ih, e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(ih.dispatcher.dispatch).not.toHaveBeenCalled()
  })
})

describe('the table-object keys (표를 선택한 상태에서)', () => {
  const inObject = (enabled: string[]) => {
    const ih = handler(enabled)
    ih.cursor.isInTableObjectSelection = () => true
    return ih
  }

  it('run the command of the letter, and keep the letter out', () => {
    const keys = [
      ['p', 'table:cell-props'],
      ['t', 'ieum:table-transpose'],
      ['l', 'ieum:table-border-each'],
      ['c', 'ieum:table-border-background'],
    ] as const
    for (const [letter, id] of keys) {
      const ih = inObject([id])
      const e = key({ key: letter, code: `Key${letter.toUpperCase()}` })
      expect(hancomTableObjectKey(ih, e), letter).toBe(true)
      expect(e.preventDefault).toHaveBeenCalled()
      expect(ih.dispatcher.dispatch).toHaveBeenCalledWith(id)
      expect(ih._cellBlockLetterImeGuard.arm).toHaveBeenCalledWith(e)
    }
  })

  it('deletes the table with Ctrl+E', () => {
    const ih = inObject(['table:delete'])
    const e = key({ key: 'e', code: 'KeyE', ctrlKey: true })
    expect(hancomTableObjectKey(ih, e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('table:delete')
    expect(ih.cursor.exitTableObjectSelection).toHaveBeenCalled()
    expect(ih.eventBus.emit).toHaveBeenCalledWith('table-object-selection-changed', false)
  })

  it('takes nothing outside a table-object selection', () => {
    const ih = handler(['table:delete', 'table:cell-props'])
    const e = key({ key: 'p', code: 'KeyP' })
    expect(hancomTableObjectKey(ih, e)).toBe(false)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('keeps Ctrl+E meaning elsewhere', () => {
    const ih = handler(['table:delete'])
    ih.cursor.isInCell = () => true
    const e = key({ key: 'e', code: 'KeyE', ctrlKey: true })
    expect(hancomTableObjectKey(ih, e)).toBe(false)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})

describe('H/W in a cell block', () => {
  it('runs the equal-size command of the key and keeps the letter out', () => {
    const ih = handler(['table:cell-height-equal', 'table:cell-width-equal'])
    ih.cursor.isInCellSelectionMode = () => true
    for (const [letter, id] of [
      ['h', 'table:cell-height-equal'],
      ['w', 'table:cell-width-equal'],
    ] as const) {
      const e = key({ key: letter, code: `Key${letter.toUpperCase()}` })
      expect(hancomCellBlockKey(ih, e), letter).toBe(true)
      expect(e.preventDefault).toHaveBeenCalled()
      expect(ih.dispatcher.dispatch).toHaveBeenCalledWith(id)
    }
  })

  it('leaves H/W as letters outside a cell block', () => {
    const ih = handler(['table:cell-height-equal'])
    const e = key({ key: 'h', code: 'KeyH' })
    expect(hancomCellBlockKey(ih, e)).toBe(false)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('does not take Ctrl/Alt/Shift combinations', () => {
    const ih = handler(['table:cell-height-equal', 'table:cell-width-equal'])
    ih.cursor.isInCellSelectionMode = () => true
    for (const init of [
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
    ]) {
      expect(hancomCellBlockKey(ih, key({ key: 'h', code: 'KeyH', ...init }))).toBe(false)
    }
  })
})

describe('Phase 1B cell keys', () => {
  const inCell = (enabled: string[] = []) => {
    const ih = handler(enabled)
    ih.cursor.isInCell = () => true
    return ih
  }

  it('selects the whole column for F7 and the whole row for F8', () => {
    for (const [keyName, expected] of [
      ['F7', { anchor: [0, 2], focus: [2, 2] }],
      ['F8', { anchor: [1, 0], focus: [1, 2] }],
    ] as const) {
      const ih = inCell()
      ih.getCursorPosition = () => ({
        sectionIndex: 0,
        paragraphIndex: 0,
        charOffset: 0,
        parentParaIndex: 1,
        controlIndex: 0,
        cellIndex: 5,
        cellParaIndex: 0,
      })
      ih.cursor.getCellSelectionFocus = () => ({ row: 1, col: 2 })
      ih.cursor.getCellTableContext = () => ({ sec: 0, ppi: 1, ci: 0, rowCount: 3, colCount: 3 })
      const e = key({ key: keyName, code: keyName })
      expect(hancomCellKey(ih, e), keyName).toBe(true)
      expect(e.preventDefault).toHaveBeenCalled()
      expect(ih.cursor.setCellSelectionAnchor).toHaveBeenCalledWith(...expected.anchor)
      expect(ih.cursor.setCellSelectionFocus).toHaveBeenCalledWith(...expected.focus)
      expect(ih.updateCellSelection).toHaveBeenCalled()
    }
  })

  it('opens an expanding block for Shift+F5', () => {
    const ih = inCell()
    ih.cursor.isInCellSelectionMode = () => false
    const e = key({ key: 'F5', code: 'F5', shiftKey: true })
    expect(hancomCellKey(ih, e)).toBe(true)
    expect(ih.cursor.enterCellSelectionMode).toHaveBeenCalled()
    expect(ih.cursor.advanceCellSelectionPhase).toHaveBeenCalled()
  })

  it('moves one cell for Alt+arrow', () => {
    const ih = inCell()
    ih.getCursorPosition = () => ({
      sectionIndex: 0,
      paragraphIndex: 0,
      charOffset: 0,
      parentParaIndex: 1,
      controlIndex: 0,
      cellIndex: 1,
      cellParaIndex: 0,
    })
    const e = key({ key: 'ArrowDown', code: 'ArrowDown', altKey: true })
    expect(hancomCellKey(ih, e)).toBe(true)
    expect(ih.cursor.moveToCellByIndex).toHaveBeenCalledWith(0, 1, 0, undefined, 4, 'start')
    expect(ih.updateCaret).toHaveBeenCalled()
  })

  it('leaves the table for Shift+Esc', () => {
    const ih = inCell()
    ih.cursor.isInCellSelectionMode = () => true
    ih.getCursorPosition = () => ({
      sectionIndex: 0,
      paragraphIndex: 0,
      charOffset: 0,
      parentParaIndex: 0,
      controlIndex: 0,
      cellIndex: 0,
      cellParaIndex: 0,
    })
    const e = key({ key: 'Escape', code: 'Escape', shiftKey: true })
    expect(hancomCellKey(ih, e)).toBe(true)
    expect(ih.cursor.exitCellSelectionMode).toHaveBeenCalled()
    expect(ih.cursor.moveTo).toHaveBeenCalledWith({
      sectionIndex: 0,
      paragraphIndex: 1,
      charOffset: 0,
    })
  })

  it('takes nothing outside a table cell', () => {
    const ih = handler()
    const e = key({ key: 'F7', code: 'F7' })
    expect(hancomCellKey(ih, e)).toBe(false)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })
})

describe('Phase 1B cell block keys', () => {
  const inBlock = (enabled: string[] = []) => {
    const ih = handler(enabled)
    ih.cursor.isInCellSelectionMode = () => true
    ih.cursor.getCellTableContext = () => ({ sec: 0, ppi: 1, ci: 0 })
    ih.cursor.getSelectedCellRange = () => ({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 })
    return ih
  }

  it('empties the selected cells for Ctrl+E', () => {
    const ih = inBlock()
    const e = key({ key: 'e', code: 'KeyE', ctrlKey: true })
    expect(hancomCellBlockKey(ih, e)).toBe(true)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(ih.clearSelectedCellBlock).toHaveBeenCalled()
    expect(ih.updateCellSelection).toHaveBeenCalled()
  })

  it('copies the cells for Ctrl+C and cuts them for Ctrl+X', () => {
    const area = {
      value: '',
      style: {},
      setAttribute: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
    }
    vi.stubGlobal('document', {
      createElement: () => area,
      body: { appendChild: vi.fn() },
      execCommand: () => true,
    })
    try {
      for (const [keyName, cut] of [
        ['c', false],
        ['x', true],
      ] as const) {
        const ih = inBlock()
        ih.wasm.getTableDimensions = () => ({ rowCount: 1, colCount: 1, cellCount: 1 })
        ih.wasm.getCellParagraphLength = () => 2
        ih.wasm.getTextInCell = () => 'X1'
        const e = key({ key: keyName, code: `Key${keyName.toUpperCase()}`, ctrlKey: true })
        expect(hancomCellBlockKey(ih, e), keyName).toBe(true)
        expect(area.value).toBe('X1')
        if (cut) expect(ih.clearSelectedCellBlock).toHaveBeenCalled()
        else expect(ih.clearSelectedCellBlock).not.toHaveBeenCalled()
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('resizes the block for Alt+arrow', () => {
    const ih = inBlock(['ieum:table-block-resize'])
    const e = key({ key: 'ArrowRight', code: 'ArrowRight', altKey: true })
    expect(hancomCellBlockKey(ih, e)).toBe(true)
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('ieum:table-block-resize', {
      direction: 'right',
    })
  })

  it('resizes whole rows/columns for Ctrl+arrow', () => {
    const ih = inBlock(['ieum:table-row-column-resize'])
    const e = key({ key: 'ArrowDown', code: 'ArrowDown', ctrlKey: true })
    expect(hancomCellBlockKey(ih, e)).toBe(true)
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('ieum:table-row-column-resize', {
      direction: 'down',
    })
  })

  it('resizes one cell for Shift+arrow', () => {
    const ih = inBlock(['ieum:table-cell-resize'])
    const e = key({ key: 'ArrowRight', code: 'ArrowRight', shiftKey: true })
    expect(hancomCellBlockKey(ih, e)).toBe(true)
    expect(ih.dispatcher.dispatch).toHaveBeenCalledWith('ieum:table-cell-resize', {
      direction: 'right',
    })
  })
})

describe('Phase 1B table-object keys', () => {
  const inObject = (enabled: string[] = []) => {
    const ih = handler(enabled)
    ih.cursor.isInTableObjectSelection = () => true
    ih.getSelectedTableRef = () => ({ sec: 0, ppi: 1, ci: 0 })
    return ih
  }

  it('selects the first cell for F5', () => {
    const ih = inObject()
    const e = key({ key: 'F5', code: 'F5' })
    expect(hancomTableObjectKey(ih, e)).toBe(true)
    expect(ih.cursor.exitTableObjectSelection).toHaveBeenCalled()
    expect(ih.cursor.moveToCellByIndex).toHaveBeenCalledWith(0, 1, 0, undefined, 0, 'start')
    expect(ih.cursor.enterCellSelectionMode).toHaveBeenCalled()
    expect(ih.updateCellSelection).toHaveBeenCalled()
  })

  it('sends Shift+arrow and Shift+Page/Home/End to their commands', () => {
    const cases = [
      [
        { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true },
        'ieum:table-resize',
        { direction: 'right' },
      ],
      [
        { key: 'ArrowUp', code: 'ArrowUp', shiftKey: true },
        'ieum:table-resize',
        { direction: 'up' },
      ],
      [{ key: 'PageUp', code: 'PageUp', shiftKey: true }, 'ieum:table-order', { mode: 'front' }],
      [{ key: 'PageDown', code: 'PageDown', shiftKey: true }, 'ieum:table-order', { mode: 'back' }],
      [{ key: 'Home', code: 'Home', shiftKey: true }, 'ieum:table-wrap', { mode: 'front' }],
      [{ key: 'End', code: 'End', shiftKey: true }, 'ieum:table-wrap', { mode: 'back' }],
    ] as const
    for (const [init, id, params] of cases) {
      const ih = inObject([id])
      const e = key(init)
      expect(hancomTableObjectKey(ih, e), `${init.key}`).toBe(true)
      expect(e.preventDefault).toHaveBeenCalled()
      expect(ih.dispatcher.dispatch).toHaveBeenCalledWith(id, params)
    }
  })
})

describe('Ctrl+Tab in a table cell', () => {
  it('inserts a tab command instead of switching tabs', () => {
    class FakeTabCommand {
      constructor(readonly position: unknown) {}
    }
    hancomCommands('ko', { InsertTabCommand: FakeTabCommand })
    const ih = handler()
    ih.cursor.isInCell = () => true
    expect(MAIN_PROCESS_KEYS['ctrl-tab'](ih, ih.dispatcher)).toBe(true)
    expect(ih.executeOperation).toHaveBeenCalledTimes(1)
    const desc = ih.executeOperation.mock.calls[0][0] as {
      kind: string
      command: FakeTabCommand
    }
    expect(desc.kind).toBe('command')
    expect(desc.command).toBeInstanceOf(FakeTabCommand)
  })

  it('leaves the tab key to the shell outside a cell', () => {
    hancomCommands('ko', { InsertTabCommand: class {} })
    const ih = handler()
    expect(MAIN_PROCESS_KEYS['ctrl-tab'](ih, ih.dispatcher)).toBe(false)
  })
})

describe('equal cell sizes (H/W)', () => {
  function table(
    widths: number[][],
    heights: number[][],
    options: { spans?: boolean; nested?: boolean; range?: Record<string, number> } = {},
  ) {
    const rows = widths.length
    const cols = widths[0].length
    const cells = []
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        cells.push({
          cellIdx: row * cols + col,
          row,
          col,
          rowSpan: options.spans && row === 0 && col === 1 ? 2 : 1,
          colSpan: 1,
          width: widths[row][col],
          height: heights[row][col],
        })
      }
    }
    const wasm = {
      getTableDimensions: () => ({ rowCount: rows, colCount: cols, cellCount: cells.length }),
      getCellInfo: (_s: number, _p: number, _c: number, i: number) => cells[i],
      getCellProperties: (_s: number, _p: number, _c: number, i: number) => cells[i],
      getTableCellBboxes: () =>
        cells.map((cell) => ({
          cellIdx: cell.cellIdx,
          row: cell.row,
          col: cell.col,
          w: cell.width / 75,
          h: cell.height / 75,
        })),
      resizeTableCells: vi.fn(() => ({ ok: true })),
      resizeTableCell: vi.fn(() => ({ ok: true, moved: true })),
    }
    const ih = {
      cursor: {
        isInCellSelectionMode: () => true,
        getCellTableContext: () => ({
          sec: 0,
          ppi: 1,
          ci: 0,
          ...(options.nested
            ? {
                cellPath: [
                  { controlIndex: 0, cellIndex: 0, cellParaIndex: 0 },
                  { controlIndex: 1, cellIndex: 0, cellParaIndex: 0 },
                ],
              }
            : {}),
        }),
        getSelectedCellRange: () =>
          options.range ?? { startRow: 0, startCol: 0, endRow: rows - 1, endCol: cols - 1 },
      },
      getCursorPosition: () => ({
        sectionIndex: 0,
        paragraphIndex: 0,
        charOffset: 0,
        parentParaIndex: 1,
        controlIndex: 0,
        cellIndex: 0,
        cellParaIndex: 0,
      }),
      executeOperation: vi.fn((desc: { operation: (w: typeof wasm) => unknown }) =>
        desc.operation(wasm),
      ),
      updateCellSelection: vi.fn(),
    }
    return { services: { getInputHandler: () => ih, wasm }, wasm, ih }
  }

  it('gives every cell of the selected columns the same width, as one snapshot', () => {
    const { services, wasm, ih } = table(
      [
        [1500, 3000],
        [1500, 3000],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
    )
    expect(equalizeTableCells(services, 'width')).toBe(true)
    expect(ih.executeOperation).toHaveBeenCalledTimes(1)
    expect(ih.executeOperation.mock.calls[0][0]).toMatchObject({
      kind: 'snapshot',
      operationType: 'equalizeColumnWidths',
    })
    // the engine moves the next boundary, so each column is one call inside the snapshot
    expect(wasm.resizeTableCells).toHaveBeenCalledTimes(2)
    expect(wasm.resizeTableCells.mock.calls[0][3]).toEqual([
      { cellIdx: 0, widthDelta: 750 },
      { cellIdx: 2, widthDelta: 750 },
    ])
    expect(wasm.resizeTableCells.mock.calls[1][3]).toEqual([
      { cellIdx: 1, widthDelta: -750 },
      { cellIdx: 3, widthDelta: -750 },
    ])
    expect(ih.updateCellSelection).toHaveBeenCalled()
  })

  it('gives every cell of the selected rows the same height, as one snapshot', () => {
    const { services, wasm } = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [3000, 3000],
      ],
    )
    expect(equalizeTableCells(services, 'height')).toBe(true)
    expect(wasm.resizeTableCells.mock.calls[0][3]).toEqual([
      { cellIdx: 0, heightDelta: 1500 },
      { cellIdx: 1, heightDelta: 1500 },
    ])
  })

  it('leaves a table with merged cells alone and says why', () => {
    const { services, wasm } = table(
      [
        [1000, 3000],
        [1000, 3000],
      ],
      [
        [1000, 1000],
        [1000, 1000],
      ],
      { spans: true },
    )
    const showToast = vi.fn()
    hancomCommands('ko', { showToast })
    expect(equalizeTableCells(services, 'width')).toBe(false)
    expect(wasm.resizeTableCells).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalled()
  })

  it('leaves a partial row block alone and says why', () => {
    const { services, wasm } = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [3000, 3000],
      ],
      { range: { startRow: 1, startCol: 0, endRow: 1, endCol: 1 } },
    )
    const showToast = vi.fn()
    hancomCommands('ko', { showToast })
    expect(equalizeTableCells(services, 'height')).toBe(false)
    expect(wasm.resizeTableCells).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalled()
  })

  it('leaves a table inside a cell to Phase 2', () => {
    const { services, wasm } = table([[1000, 3000]], [[1000, 1000]], { nested: true })
    expect(equalizeTableCells(services, 'width')).toBe(false)
    expect(wasm.resizeTableCells).not.toHaveBeenCalled()
  })

  it('writes nothing when the sizes are already equal', () => {
    const { services, ih } = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
    )
    expect(equalizeTableCells(services, 'width')).toBe(false)
    expect(equalizeTableCells(services, 'height')).toBe(false)
    expect(ih.executeOperation).not.toHaveBeenCalled()
  })

  it('Ctrl+Right widens every cell of the selected column as one snapshot', () => {
    const { services, wasm, ih } = table(
      [
        [1500, 1500],
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
        [1500, 1500],
      ],
      { range: { startRow: 0, startCol: 1, endRow: 2, endCol: 1 } },
    )
    expect(resizeRowColumnBlock(services, 'right')).toBe(true)
    expect(ih.executeOperation).toHaveBeenCalledTimes(1)
    expect(ih.executeOperation.mock.calls[0][0]).toMatchObject({
      kind: 'snapshot',
      operationType: 'resizeRowColumnBlock',
    })
    expect(wasm.resizeTableCells.mock.calls[0][3]).toEqual([
      { cellIdx: 1, widthDelta: 300 },
      { cellIdx: 3, widthDelta: 300 },
      { cellIdx: 5, widthDelta: 300 },
    ])
    expect(ih.updateCellSelection).toHaveBeenCalled()
  })

  it('Ctrl+Down changes every cell of the selected row and the table height', () => {
    const { services, wasm } = table(
      [
        [1500, 1500],
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
        [1500, 1500],
      ],
      { range: { startRow: 1, startCol: 0, endRow: 1, endCol: 1 } },
    )
    expect(resizeRowColumnBlock(services, 'down')).toBe(true)
    expect(wasm.resizeTableCells.mock.calls[0][3]).toEqual([
      { cellIdx: 2, heightDelta: 300 },
      { cellIdx: 3, heightDelta: 300 },
    ])
  })

  it('Ctrl+Left shrinks the selected column', () => {
    const { services, wasm } = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
      { range: { startRow: 0, startCol: 0, endRow: 1, endCol: 0 } },
    )
    expect(resizeRowColumnBlock(services, 'left')).toBe(true)
    expect(wasm.resizeTableCells.mock.calls[0][3]).toEqual([
      { cellIdx: 0, widthDelta: -300 },
      { cellIdx: 2, widthDelta: -300 },
    ])
  })

  it('leaves merged cells and tables inside a cell alone', () => {
    const merged = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
      { spans: true },
    )
    const showToast = vi.fn()
    hancomCommands('ko', { showToast })
    expect(resizeRowColumnBlock(merged.services, 'right')).toBe(false)
    expect(merged.wasm.resizeTableCells).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalled()

    const nested = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
      { nested: true },
    )
    expect(resizeRowColumnBlock(nested.services, 'right')).toBe(false)
    expect(nested.wasm.resizeTableCells).not.toHaveBeenCalled()
  })

  it('Shift+Right moves one cell and its next cell as one snapshot', () => {
    const { services, wasm, ih } = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
    )
    expect(resizeSelectedCell(services, 'right')).toBe(true)
    expect(ih.executeOperation).toHaveBeenCalledTimes(1)
    expect(ih.executeOperation.mock.calls[0][0]).toMatchObject({
      kind: 'snapshot',
      operationType: 'resizeTableCell',
    })
    expect(wasm.resizeTableCell).toHaveBeenCalledWith(0, 1, 0, 0, 0, false, true)
    expect(ih.updateCellSelection).toHaveBeenCalled()
  })

  it('Shift+Down moves the current cell height and the next cell height back', () => {
    const { services, wasm } = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
    )
    expect(resizeSelectedCell(services, 'down')).toBe(true)
    expect(wasm.resizeTableCell).toHaveBeenCalledWith(0, 1, 0, 0, 0, true, true)
  })

  it('keeps a Shift+arrow at the last cell as no change', () => {
    const { services, wasm, ih } = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
    )
    wasm.resizeTableCell = vi.fn(() => ({ ok: true, moved: false }))
    expect(resizeSelectedCell(services, 'right')).toBe(false)
    expect(ih.updateCellSelection).not.toHaveBeenCalled()
  })

  it('leaves a table inside a cell alone for Shift+arrow', () => {
    const { services, wasm } = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
      { nested: true },
    )
    expect(resizeSelectedCell(services, 'right')).toBe(false)
    expect(wasm.resizeTableCell).not.toHaveBeenCalled()
  })

  it('leaves a table with actual merged cells alone for Shift+arrow', () => {
    const { services, wasm } = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
      { spans: true },
    )
    const showToast = vi.fn()
    hancomCommands('ko', { showToast })
    expect(resizeSelectedCell(services, 'right')).toBe(false)
    expect(wasm.resizeTableCell).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalled()
  })

  it('continues a grid this editor made with Shift+arrow', () => {
    const { services, wasm } = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
    )
    expect(resizeSelectedCell(services, 'right')).toBe(true)
    const original = wasm.getCellInfo
    wasm.getCellInfo = vi.fn((...args: [number, number, number, number]) => {
      const info = original(...args)
      return args[3] === 0 ? { ...info, colSpan: 2 } : info
    })
    expect(resizeSelectedCell(services, 'right')).toBe(true)
    expect(wasm.resizeTableCell).toHaveBeenCalledTimes(2)
  })

  it('does not trust the mark in another editor', () => {
    const first = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
    )
    expect(resizeSelectedCell(first.services, 'right')).toBe(true)
    const second = table(
      [
        [1500, 1500],
        [1500, 1500],
      ],
      [
        [1500, 1500],
        [1500, 1500],
      ],
      { spans: true },
    )
    expect(resizeSelectedCell(second.services, 'right')).toBe(false)
    expect(second.wasm.resizeTableCell).not.toHaveBeenCalled()
  })
})

describe('against the studio source the build fetched', () => {
  const core = JSON.parse(
    readFileSync(join(__dirname, '..', '..', '..', 'vendor', 'rhwp-core', 'package.json'), 'utf8'),
  )
  const studio = join(
    __dirname,
    '..',
    'node_modules',
    '.cache',
    'rhwp-studio',
    core.rhwp.tag,
    'rhwp-studio',
  )
  const map = join(studio, 'src', 'command', 'shortcut-map.ts')

  it.skipIf(!existsSync(map))('finds every entry it takes out', () => {
    const source = readFileSync(map, 'utf8')
    for (const [def, id] of REMOVED_SHORTCUTS) {
      const mods = (['ctrl', 'alt', 'shift'] as const)
        .filter((m) => (def as Record<string, unknown>)[m])
        .map((m) => `${m}: true`)
      // the studio writes alt before shift
      expect(source, `${def.key} ${id}`).toContain(
        `[{ key: '${def.key}', ${mods.join(', ')} }, '${id}']`,
      )
    }
  })

  it.skipIf(!existsSync(map))("turns the studio's own table into Hangul's", async () => {
    const { defaultShortcuts, matchShortcut } = await import(/* @vite-ignore */ map)
    const table = adaptToHancom([...defaultShortcuts])
    const match = (init: Partial<KeyboardEvent>) => matchShortcut(key(init), table, 'other')
    expect(match({ key: 'y', code: 'KeyY', ctrlKey: true })).toBe('ieum:delete-line')
    expect(match({ key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true })).toBe('edit:redo')
    expect(match({ key: 'C', code: 'KeyC', ctrlKey: true, shiftKey: true })).toBe(
      'format:align-center',
    )
    expect(match({ key: 'R', code: 'KeyR', ctrlKey: true, shiftKey: true })).toBe(
      'format:align-right',
    )
    expect(match({ key: 'T', code: 'KeyT', ctrlKey: true, shiftKey: true })).toBe(
      'format:align-distribute',
    )
    // Alt+Shift+C is Hangul's 보통 모양 now, no longer rhwp's stand-in for centering
    expect(match({ key: 'C', code: 'KeyC', altKey: true, shiftKey: true })).toBe(
      'ieum:normal-shape',
    )
    expect(match({ key: 'H', code: 'KeyH', altKey: true, shiftKey: true })).toBeNull()
    expect(match({ key: 'P', code: 'KeyP', altKey: true, shiftKey: true })).toBe(
      'format:superscript',
    )
    expect(match({ key: 'S', code: 'KeyS', altKey: true, shiftKey: true })).toBe('format:subscript')
    expect(match({ key: 'B', code: 'KeyB', altKey: true, shiftKey: true })).toBe('format:bold')
    expect(match({ key: 'Insert', code: 'Insert', altKey: true })).toBe('table:insert-row-col')
    expect(match({ key: 'f10', code: 'F10', ctrlKey: true })).toBe('insert:symbols')
    // rhwp's Alt+F10 stays: Hangul gives it nothing to do in the body
    expect(match({ key: 'f10', code: 'F10', altKey: true })).toBe('insert:symbols')
    expect(match({ key: 'h', code: 'KeyH', ctrlKey: true })).toBe('edit:find-replace')
    expect(match({ key: '0', code: 'Digit0', ctrlKey: true })).toBe('ieum:style-10')
    expect(match({ key: '1', code: 'Digit1', ctrlKey: true })).toBe('ieum:style-1')
    // the IME reports a Ctrl key as "Process" while it composes; the physical key decides
    expect(match({ key: 'Process', code: 'KeyY', ctrlKey: true, keyCode: 229 })).toBe(
      'ieum:delete-line',
    )
    expect(
      match({ key: 'Process', code: 'KeyC', ctrlKey: true, shiftKey: true, keyCode: 229 }),
    ).toBe('format:align-center')
    // keys that were and stay: bold, the other alignments, Hangul's own Ctrl+Shift+S in a cell block
    expect(match({ key: 'b', code: 'KeyB', ctrlKey: true })).toBe('format:bold')
    expect(match({ key: 'L', code: 'KeyL', ctrlKey: true, shiftKey: true })).toBe(
      'format:align-left',
    )
    expect(match({ key: 'M', code: 'KeyM', ctrlKey: true, shiftKey: true })).toBe(
      'format:align-justify',
    )
  })
})
