import { WrapStrategy, type ICellDataForSheetInterceptor } from '@univerjs/core'
import { BreakLineCommand } from '@univerjs/docs-ui'
import { SheetInterceptorService } from '@univerjs/sheets'
import { IEditorBridgeService } from '@univerjs/sheets-ui'
import { describe, expect, it } from 'vitest'

import { installAltEnterWrap } from '../src/renderer/alt-enter-wrap'
import type { LazyWorkbookState, UniverRuntime } from '../src/renderer/univer-state'

interface FakeEditState {
  unitId: string
  sheetId: string
  row: number
  column: number
}

interface FakeCommandEvent {
  id: string
}

type WriteHandler = (
  cell: ICellDataForSheetInterceptor | null,
  context: { unitId: string; subUnitId: string; row: number; col: number },
  next: (value: ICellDataForSheetInterceptor | null) => ICellDataForSheetInterceptor | null,
) => ICellDataForSheetInterceptor | null

function fakeRuntime(options: { edit: FakeEditState | null }) {
  const handlers: ((event: FakeCommandEvent) => void)[] = []
  const visibility: ((state: { visible: boolean }) => void)[] = []
  let writeHandler: WriteHandler | null = null
  const univerAPI = {
    Event: { CommandExecuted: 'CommandExecuted' },
    addEvent: (_name: string, handler: (event: FakeCommandEvent) => void) => {
      handlers.push(handler)
      return {
        dispose: () => {
          const index = handlers.indexOf(handler)
          if (index >= 0) handlers.splice(index, 1)
        },
      }
    },
  }
  const bridge = {
    getEditCellState: () => options.edit,
    visible$: {
      subscribe: (handler: (state: { visible: boolean }) => void) => {
        visibility.push(handler)
        return {
          unsubscribe: () => {
            const index = visibility.indexOf(handler)
            if (index >= 0) visibility.splice(index, 1)
          },
        }
      },
    },
  }
  const writeCellInterceptor = {
    intercept: (_key: unknown, interceptor: { handler: WriteHandler }) => {
      writeHandler = interceptor.handler
      return () => {}
    },
  }
  const univer = {
    __getInjector: () => ({
      get: (key: unknown) => {
        if (key === IEditorBridgeService) return bridge
        if (key === SheetInterceptorService) return { writeCellInterceptor }
        return undefined
      },
    }),
  }
  const runtime = { univerAPI, univer } as unknown as UniverRuntime
  return {
    runtime,
    emit(event: FakeCommandEvent): void {
      handlers.forEach((handler) => handler(event))
    },
    setVisible(visible: boolean): void {
      visibility.forEach((handler) => handler({ visible }))
    },
    write(
      cell: ICellDataForSheetInterceptor | null,
      context: { unitId: string; subUnitId: string; row: number; col: number },
    ): ICellDataForSheetInterceptor | null {
      if (!writeHandler) throw new Error('write cell interceptor not installed')
      return writeHandler(cell, context, (value) => value)
    },
  }
}

function protectionState(options: { protected: boolean; formatCells: boolean }): LazyWorkbookState {
  return {
    editJournal: {
      sheetProtection: new Map(),
      sheets: { added: new Set<string>() },
    },
    sheetProtections: new Map([
      [
        'sheet',
        {
          protected: options.protected,
          hasPassword: false,
          allow: { formatCells: options.formatCells },
          password: null,
        },
      ],
    ]),
  } as unknown as LazyWorkbookState
}

const EDITED_CELL: FakeEditState = { unitId: 'unit', sheetId: 'sheet', row: 3, column: 2 }
const EDITED_CONTEXT = { unitId: 'unit', subUnitId: 'sheet', row: 3, col: 2 }

describe('installAltEnterWrap', () => {
  it('adds wrap to the committed cell after Alt+Enter', () => {
    const { runtime, emit, write } = fakeRuntime({ edit: EDITED_CELL })
    installAltEnterWrap(runtime, { getState: () => null })
    emit({ id: BreakLineCommand.id })
    const cell = write({ v: 'first\nsecond' }, EDITED_CONTEXT)
    expect(cell?.v).toBe('first\nsecond')
    expect((cell?.s as { tb?: WrapStrategy }).tb).toBe(WrapStrategy.WRAP)
  })

  it('leaves the cell alone when Alt+Enter did not run', () => {
    const { runtime, write } = fakeRuntime({ edit: EDITED_CELL })
    installAltEnterWrap(runtime, { getState: () => null })
    const cell = write({ v: 'plain' }, EDITED_CONTEXT)
    expect(cell?.s).toBeUndefined()
  })

  it('ignores commands other than the line break', () => {
    const { runtime, emit, write } = fakeRuntime({ edit: EDITED_CELL })
    installAltEnterWrap(runtime, { getState: () => null })
    emit({ id: 'sheet.command.set-range-values' })
    expect(write({ v: 'plain' }, EDITED_CONTEXT)?.s).toBeUndefined()
  })

  it('ignores a line break outside the cell editor (formula bar)', () => {
    const { runtime, emit, write } = fakeRuntime({ edit: null })
    installAltEnterWrap(runtime, { getState: () => null })
    emit({ id: BreakLineCommand.id })
    expect(write({ v: 'plain' }, EDITED_CONTEXT)?.s).toBeUndefined()
  })

  it('does not wrap a different cell than the edited one', () => {
    const { runtime, emit, write } = fakeRuntime({ edit: EDITED_CELL })
    installAltEnterWrap(runtime, { getState: () => null })
    emit({ id: BreakLineCommand.id })
    expect(write({ v: 'plain' }, { ...EDITED_CONTEXT, row: 9 })?.s).toBeUndefined()
    expect(write({ v: 'plain' }, { ...EDITED_CONTEXT, subUnitId: 'other' })?.s).toBeUndefined()
  })

  it('drops the pending wrap when the edit is cancelled', async () => {
    const { runtime, emit, setVisible, write } = fakeRuntime({ edit: EDITED_CELL })
    installAltEnterWrap(runtime, { getState: () => null })
    emit({ id: BreakLineCommand.id })
    setVisible(false)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(write({ v: 'plain' }, EDITED_CONTEXT)?.s).toBeUndefined()
  })

  it('skips a protected sheet that forbids format changes', () => {
    const { runtime, emit, write } = fakeRuntime({ edit: EDITED_CELL })
    installAltEnterWrap(runtime, {
      getState: () => protectionState({ protected: true, formatCells: false }),
    })
    emit({ id: BreakLineCommand.id })
    expect(write({ v: 'first\nsecond' }, EDITED_CONTEXT)?.s).toBeUndefined()
  })

  it('wraps a protected sheet that allows format changes', () => {
    const { runtime, emit, write } = fakeRuntime({ edit: EDITED_CELL })
    installAltEnterWrap(runtime, {
      getState: () => protectionState({ protected: true, formatCells: true }),
    })
    emit({ id: BreakLineCommand.id })
    expect((write({ v: 'first\nsecond' }, EDITED_CONTEXT)?.s as { tb?: WrapStrategy }).tb).toBe(
      WrapStrategy.WRAP,
    )
  })

  it('keeps a rich-text style object on the write', () => {
    const { runtime, emit, write } = fakeRuntime({ edit: EDITED_CELL })
    installAltEnterWrap(runtime, { getState: () => null })
    emit({ id: BreakLineCommand.id })
    const cell = write({ v: 'first\nsecond', s: { ff: 'Arial' } }, EDITED_CONTEXT)
    expect(cell?.s).toMatchObject({ ff: 'Arial', tb: WrapStrategy.WRAP })
  })

  it('stops wrapping after dispose', () => {
    const { runtime, emit, write } = fakeRuntime({ edit: EDITED_CELL })
    const installed = installAltEnterWrap(runtime, { getState: () => null })
    installed.dispose()
    emit({ id: BreakLineCommand.id })
    expect(write({ v: 'plain' }, EDITED_CONTEXT)?.s).toBeUndefined()
  })
})
