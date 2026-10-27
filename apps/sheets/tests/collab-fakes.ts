/**
 * In-memory stand-ins for the collab binding tests: a relay that routes the
 * bridge traffic like the shell's LAN server, and a tiny workbook behind a
 * Univer-shaped command service (enough for values, row inserts and sheets).
 */
import {
  CommandType,
  ICommandService,
  IUndoRedoService,
  IUniverInstanceService,
} from '@univerjs/core'
import { IDefinedNamesService } from '@univerjs/engine-formula'
import type { CollabBridge } from '@genoffice/electron-utils/collab-bridge'
import {
  COLLAB_HOST_PEER,
  type CollabEvent,
  type CollabIncoming,
  type CollabTicket,
} from '@genoffice/electron-utils/collab-channels'
import { createEditJournal } from '../src/renderer/edit-journal'
import type { SheetsCollabHooks } from '../src/renderer/collab/binding'
import type { LazyWorkbookState, UniverRuntime } from '../src/renderer/univer-state'

interface RelayPeer {
  onMessage: Set<(message: CollabIncoming) => void>
  onEvent: Set<(event: CollabEvent) => void>
  ticket: CollabTicket | null
}

export class Relay {
  private readonly peers = new Map<string, RelayPeer>()
  private readonly queue: Array<() => void> = []
  private seq = 0

  private bridge(id: string, ticket: CollabTicket | null): CollabBridge {
    const peer: RelayPeer = { onMessage: new Set(), onEvent: new Set(), ticket }
    this.peers.set(id, peer)
    return {
      available: async () => true,
      profile: async () => ({ name: id, color: 0 }),
      setProfile: async (profile) => profile,
      host: async () => ({ ok: true, info: { pin: '123456', port: 47631, addresses: [] } }),
      newPin: async () => '654321',
      join: async () => ({ ok: true }),
      take: async () => {
        const taken = peer.ticket
        peer.ticket = null
        return taken
      },
      leave: async () => {
        this.peers.delete(id)
      },
      send: ({ to, data }) => {
        const targets = to !== undefined ? [to] : [...this.peers.keys()].filter((p) => p !== id)
        for (const target of targets) {
          const copy = new Uint8Array(data)
          this.queue.push(() => {
            for (const handler of [...(this.peers.get(target)?.onMessage ?? [])]) {
              handler({ from: id, data: copy })
            }
          })
        }
      },
      onMessage: (handler) => {
        peer.onMessage.add(handler)
        return () => peer.onMessage.delete(handler)
      },
      onEvent: (handler) => {
        peer.onEvent.add(handler)
        return () => peer.onEvent.delete(handler)
      },
      discover: () => () => {},
    } as CollabBridge
  }

  host(): CollabBridge {
    return this.bridge(COLLAB_HOST_PEER, null)
  }

  guest(): CollabBridge {
    const id = `g${++this.seq}`
    const bridge = this.bridge(id, {
      peerId: id,
      kind: 'sheets',
      title: 'Book',
      hostName: 'Host',
      hostColor: 1,
    })
    this.queue.push(() => {
      for (const handler of [...(this.peers.get(COLLAB_HOST_PEER)?.onEvent ?? [])]) {
        handler({ type: 'peer-join', peerId: id })
      }
    })
    return bridge
  }

  /** deliver everything, letting async handlers catch up between deliveries */
  async flush(): Promise<void> {
    for (let round = 0; round < 2000; round++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      const next = this.queue.shift()
      if (next) {
        next()
        continue
      }
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (this.queue.length === 0) return
    }
    throw new Error('relay never went quiet')
  }
}

type Listener = (
  info: { id: string; type?: CommandType; params?: unknown },
  options?: object,
) => void

interface Sheet {
  id: string
  name: string
  cells: Map<string, Record<string, unknown>>
}

/** a workbook of sheets and cells, changed only through mutations */
export class FakeBook {
  unitId: string
  sheets: Sheet[] = [{ id: 'sheet-1', name: 'Data', cells: new Map() }]
  readonly styles: Record<string, unknown> = {}
  readonly executed: Array<{ id: string; params: unknown; options: object }> = []
  readonly undoCleared: string[] = []
  editing = false
  active = { sheet: 'sheet-1', row: 0, col: 0 }
  private readonly collab = new Set<Listener>()
  private readonly done = new Set<Listener>()
  private readonly events = new Map<string, Set<(event: Record<string, unknown>) => void>>()
  readonly _commandExecutionStack: Array<{ id: string; type: CommandType }> = []
  readonly state: LazyWorkbookState

  constructor(unitId: string) {
    this.unitId = unitId
    this.state = { editJournal: createEditJournal() } as unknown as LazyWorkbookState
  }

  value(sheet: string, row: number, col: number): unknown {
    return this.sheets.find((s) => s.id === sheet)?.cells.get(`${row}:${col}`)?.v
  }

  dump(): unknown {
    return this.sheets.map((sheet) => [sheet.id, sheet.name, [...sheet.cells].sort()])
  }

  load(json: string, unitId: string): void {
    const sheets = JSON.parse(json) as Array<
      [string, string, Array<[string, Record<string, unknown>]>]
    >
    this.sheets = sheets.map(([id, name, cells]) => ({ id, name, cells: new Map(cells) }))
    this.unitId = unitId
  }

  private apply(id: string, params: Record<string, unknown>): boolean {
    if (params.unitId !== undefined && params.unitId !== this.unitId) return false
    const sheet = this.sheets.find((s) => s.id === params.subUnitId)
    switch (id) {
      case 'sheet.mutation.set-range-values': {
        if (!sheet) return false
        for (const [row, columns] of Object.entries(params.cellValue as object)) {
          for (const [col, cell] of Object.entries(columns as object)) {
            const key = `${row}:${col}`
            sheet.cells.set(key, { ...sheet.cells.get(key), ...(cell as object) })
          }
        }
        return true
      }
      case 'sheet.mutation.insert-row': {
        if (!sheet) return false
        const range = params.range as { startRow: number; endRow: number }
        const count = range.endRow - range.startRow + 1
        sheet.cells = new Map(
          [...sheet.cells].map(([key, cell]) => {
            const [row, col] = key.split(':').map(Number) as [number, number]
            return [`${row >= range.startRow ? row + count : row}:${col}`, cell]
          }),
        )
        return true
      }
      case 'sheet.mutation.insert-sheet': {
        const added = params.sheet as { id: string; name: string }
        this.sheets.push({ id: added.id, name: added.name, cells: new Map() })
        return true
      }
      default:
        return true
    }
  }

  private readonly commands = {
    onMutationExecutedForCollab: (listener: Listener) => {
      this.collab.add(listener)
      return { dispose: () => this.collab.delete(listener) }
    },
    onCommandExecuted: (listener: Listener) => {
      this.done.add(listener)
      return { dispose: () => this.done.delete(listener) }
    },
    syncExecuteCommand: (id: string, params: Record<string, unknown>, options: object = {}) => {
      const info = { id, type: CommandType.MUTATION, params }
      this._commandExecutionStack.push(info)
      const ok = this.apply(id, params)
      this.executed.push({ id, params, options })
      for (const listener of [...this.done]) listener(info, options)
      for (const listener of [...this.collab]) listener(info, options)
      this._commandExecutionStack.pop()
      return ok
    },
    _commandExecutionStack: this._commandExecutionStack,
  }

  /** a person's action: one command running these mutations */
  run(...mutations: Array<[string, Record<string, unknown>]>): void {
    const info = { id: 'test.command', type: CommandType.COMMAND }
    this._commandExecutionStack.push(info)
    for (const [id, params] of mutations) {
      this.commands.syncExecuteCommand(id, { unitId: this.unitId, ...params })
    }
    for (const listener of [...this.done]) listener(info, {})
    this._commandExecutionStack.pop()
  }

  type(sheet: string, row: number, col: number, v: unknown, s?: unknown): void {
    this.run([
      'sheet.mutation.set-range-values',
      { subUnitId: sheet, cellValue: { [row]: { [col]: s === undefined ? { v } : { v, s } } } },
    ])
  }

  /** a Univer event as the facade raises it; the return says whether a handler cancelled it */
  emit(event: string, payload: Record<string, unknown> = {}): boolean {
    const record = { ...payload, cancel: false }
    for (const handler of [...(this.events.get(event) ?? [])]) handler(record)
    return record.cancel
  }

  readonly runtime = {
    univer: {
      __getInjector: () => ({
        get: (token: unknown) => {
          if (token === ICommandService) return this.commands
          if (token === IUndoRedoService) {
            return { clearUndoRedo: (unitId: string) => this.undoCleared.push(unitId) }
          }
          if (token === IUniverInstanceService) {
            return {
              getUnit: () => ({
                getStyles: () => ({ get: (id: string) => this.styles[id] ?? null }),
                getSheetBySheetId: (id: string) => this.sheets.find((s) => s.id === id) ?? null,
              }),
            }
          }
          if (token === IDefinedNamesService) return { getDefinedNameMap: () => ({}) }
          return { getRenderById: () => null }
        },
      }),
    },
    univerAPI: {
      Event: {
        BeforeCommandExecute: 'before-command',
        SelectionChanged: 'selection',
        ActiveSheetChanged: 'active-sheet',
        SheetEditEnded: 'edit-ended',
      },
      addEvent: (event: string, handler: (event: Record<string, unknown>) => void) => {
        const set = this.events.get(event) ?? new Set()
        set.add(handler)
        this.events.set(event, set)
        return { dispose: () => set.delete(handler) }
      },
      getActiveWorkbook: () => ({
        getId: () => this.unitId,
        getSheets: () =>
          this.sheets.map((sheet) => ({
            getSheetId: () => sheet.id,
            getSheetName: () => sheet.name,
          })),
        getSheetBySheetId: (id: string) => (this.sheets.some((s) => s.id === id) ? {} : null),
        getActiveSheet: () => ({ getSheetId: () => this.active.sheet }),
        getActiveCell: () => ({ getRow: () => this.active.row, getColumn: () => this.active.col }),
        getActiveRange: () => null,
      }),
    },
  } as unknown as UniverRuntime
}

/** binding hooks over a FakeBook; a guest's reload takes the host book's cells */
export function hooksFor(
  book: FakeBook,
  extra: {
    refused?: string[]
    reloads?: { count: number }
    /** what the host's bytes hold, when a save would write something else than the book */
    written?: () => unknown
  } = {},
): SheetsCollabHooks {
  return {
    runtime: () => book.runtime,
    state: () => book.state,
    isCellEditing: () => book.editing,
    saveIdle: async () => {},
    snapshot: async (capture) => {
      const captured = capture()
      const written = extra.written?.() ?? book.dump()
      return { bytes: new TextEncoder().encode(JSON.stringify(written)), captured }
    },
    commitEditor: async () => {},
    replace: async (bytes) => {
      if (extra.reloads) extra.reloads.count += 1
      book.load(new TextDecoder().decode(bytes), `${book.unitId}+`)
    },
    fullLoad: async () => {},
    refuse: (key) => extra.refused?.push(key),
  }
}
