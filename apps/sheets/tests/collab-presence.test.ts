import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CollabPresenceExtension,
  cellPresence,
  isCellPresence,
  presenceBoxes,
  showPresences,
} from '../src/renderer/collab/presence'

const cellAt = (row: number, column: number) => ({
  startX: column * 10,
  endX: (column + 1) * 10,
  startY: row * 20,
  endY: (row + 1) * 20,
})

describe('cellPresence', () => {
  it('publishes the active cell and the selection', () => {
    expect(
      cellPresence(
        'sheet-1',
        { row: 2, column: 3 },
        { startRow: 1, endRow: 4, startColumn: 3, endColumn: 5 },
      ),
    ).toEqual({ sheet: 'sheet-1', row: 2, col: 3, range: [1, 3, 4, 5] })
  })

  it('falls back to the cell alone, and to nothing without a cell', () => {
    expect(cellPresence('s', { row: 0, column: 0 }, null)).toEqual({
      sheet: 's',
      row: 0,
      col: 0,
      range: [0, 0, 0, 0],
    })
    expect(cellPresence('s', null, null)).toBeNull()
    expect(cellPresence('s', { row: -1, column: 0 }, null)).toBeNull()
  })

  it('accepts only well-formed values from other peers', () => {
    expect(isCellPresence({ sheet: 's', row: 1, col: 1, range: [1, 1, 1, 1] })).toBe(true)
    expect(isCellPresence({ sheet: 's', row: 1, col: 1, range: [1, 1, 1] })).toBe(false)
    expect(isCellPresence({ sheet: 's', row: 1.5, col: 1, range: [1, 1, 1, 1] })).toBe(false)
    expect(isCellPresence(null)).toBe(false)
  })
})

describe('presenceBoxes', () => {
  it('spans the selection and outlines the active cell', () => {
    expect(presenceBoxes({ sheet: 's', row: 2, col: 1, range: [1, 1, 3, 2] }, cellAt)).toEqual({
      selection: { x: 10, y: 20, width: 20, height: 60 },
      cell: { x: 10, y: 40, width: 10, height: 20 },
    })
  })
})

describe('CollabPresenceExtension', () => {
  afterEach(() => vi.unstubAllGlobals())

  function paint(mode: string, sheetId = 'sheet-1') {
    const calls: string[] = []
    const canvas = {
      __mode: mode,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
      font: '',
      textBaseline: '',
      save: vi.fn(),
      restore: vi.fn(),
      getScale: () => ({ scaleX: 1, scaleY: 1 }),
      fillRect: vi.fn(() => calls.push('fillRect')),
      strokeRect: vi.fn(() => calls.push('strokeRect')),
      measureText: (text: string) => ({ width: text.length * 6 }),
      fillText: vi.fn((text: string) => calls.push(`text:${text}`)),
    }
    const skeleton = {
      worksheet: { unitId: 'book-1', getSheetId: () => sheetId },
      getCellWithCoordByIndex: cellAt,
    }
    new CollabPresenceExtension().draw(canvas as never, { scaleX: 1, scaleY: 1 }, skeleton as never)
    return calls
  }

  it('paints each other person on their sheet with their name, never when printing', () => {
    vi.stubGlobal('document', { documentElement: {} })
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => (name === '--collab-ink' ? 'white' : 'teal'),
    }))
    const runtime = {
      univer: { __getInjector: () => ({ get: () => ({ getRenderById: () => null }) }) },
    } as never
    showPresences(runtime, 'book-1', [
      {
        name: 'Jun',
        palette: 3,
        sheetId: 'sheet-1',
        presence: { sheet: 'sheet-1', row: 4, col: 2, range: [4, 2, 4, 2] },
      },
    ])
    expect(paint('normal')).toEqual([
      'fillRect',
      'strokeRect',
      'strokeRect',
      'fillRect',
      'text:Jun',
    ])
    expect(paint('printing')).toEqual([])
    expect(paint('normal', 'sheet-2')).toEqual([])
    showPresences(runtime, 'book-1', [])
    expect(paint('normal')).toEqual([])
  })
})
