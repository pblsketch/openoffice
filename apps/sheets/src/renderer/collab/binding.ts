/**
 * One shared workbook (LAN co-editing, decision 0073), wired to Univer.
 *
 * Every peer applies its own edits at once; the mutations an action produced
 * go out as one op and the host puts all ops in one order (OpLog). Remote ops
 * run as plain mutations with `fromCollab`, so they reach the edit journal
 * (the host's save picks them up), never the undo stack, and never close the
 * cell editor or switch the sheet. A guest that falls out of step reloads
 * the host's bytes; the host starts everyone over after it saves.
 */
import {
  CommandType,
  ICommandService,
  IUndoRedoService,
  IUniverInstanceService,
  type ICommandInfo,
  type IExecutionOptions,
  type Workbook,
} from '@univerjs/core'
import { IDefinedNamesService } from '@univerjs/engine-formula'
import { OpLog, type CollabSession, type CollabStringKey } from '@genoffice/collab'
import { BULK_FILL_UNDO_COMMAND_ID } from '../bulk-fill-undo'
import { threadStore, type ThreadStore } from '../threaded-comments'
import { VISUAL_UNDO_COMMAND_ID } from '../undo-carry'
import { journalSuppression, type LazyWorkbookState, type UniverRuntime } from '../univer-state'
import { PRESENCE_FIELD, cellPresence, isCellPresence, showPresences } from './presence'
import {
  changesLayout,
  fromWire,
  isSharedMutation,
  isSheetOp,
  missingTarget,
  needsResidentCells,
  opsCommute,
  packSnapshot,
  sheetAliases,
  toWire,
  unpackSnapshot,
  unsharedJournalKey,
  type SheetOp,
  type SnapshotMeta,
  type TargetLookup,
  type WireMutation,
} from './sheet-ops'
import { isUnsharedUniverCommand } from './session-rules'

const TOPIC = 'sheets'
/** how often the journal is checked for edits the op stream did not carry */
const UNSHARED_CHECK_MS = 1_000
const REBASE_DELAY_MS = 400

/** mutations that only undo/redo app-side edits; their effect never travels */
const UNSHARED_MUTATIONS = new Set([VISUAL_UNDO_COMMAND_ID, BULK_FILL_UNDO_COMMAND_ID])

/** the thread actions a person takes (moves and shifts follow shared ops) */
const THREAD_EDITS = [
  'add',
  'reply',
  'setDone',
  'editText',
  'deleteReply',
  'remove',
  'convertToNote',
] as const satisfies readonly (keyof ThreadStore)[]

export interface SheetsCollabHooks {
  runtime(): UniverRuntime | null
  state(): LazyWorkbookState | null
  isCellEditing(): boolean
  /** resolves once no save is running */
  saveIdle(): Promise<void>
  /**
   * The workbook as a save would write it now. `capture` runs in the turn the
   * save payload is read, so what it returns describes exactly those bytes.
   */
  snapshot<T>(capture: () => T): Promise<{ bytes: Uint8Array; captured: T }>
  /** guest: end the cell editor's edit (it goes out like any other) */
  commitEditor(): Promise<void>
  /** guest: open these bytes in place of the workbook on screen */
  replace(bytes: Uint8Array): Promise<void>
  /** loads every cell (once per workbook) */
  fullLoad(): Promise<void>
  refuse(key: CollabStringKey): void
}

type CommandStack = Array<{ type?: CommandType }>

export class SheetsCollabBinding {
  private readonly log: OpLog<SheetOp>
  /** structural ops seen, in this peer's order; an op stamped with an older one is stale */
  private layout = 0
  /** host: its own ops so far */
  private hostOps = 0
  /** guest: host ops already inside the bytes it last reloaded */
  private skipHostOpsThrough = 0
  /** guest: how often this copy reloaded the host's bytes */
  private generation = 0
  /** host: per guest, the copy generation whose ops it refuses (one was refused already) */
  private readonly barred = new Map<string, number>()
  private hostToLocal = new Map<string, string>()
  private localToHost = new Map<string, string>()
  private batch: WireMutation[] = []
  private batchLayout = 0
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private applying = false
  private reloading = false
  private unsharedKey: { state: LazyWorkbookState; key: string } | null = null
  private rebaseTimer: ReturnType<typeof setTimeout> | null = null
  private presenceFrame: number | null = null
  private editorWaiters: Array<() => void> = []
  private readonly offs: Array<() => void> = []
  private disposed = false

  constructor(
    private readonly session: CollabSession,
    private readonly hooks: SheetsCollabHooks,
  ) {
    const runtime = hooks.runtime()
    if (!runtime) throw new Error('no workbook to share')
    this.log = new OpLog<SheetOp>(session, {
      topic: TOPIC,
      accept: (op) => (isSheetOp(op) ? op : null),
      apply: (op, from) => this.apply(op, from),
      snapshot: () => this.snapshot(),
      reload: (bytes) => this.reload(bytes),
      commutes: opsCommute,
    })
    const injector = runtime.univer.__getInjector()
    const commands = injector.get(ICommandService)
    const api = runtime.univerAPI
    this.offs.push(
      disposer(
        commands.onMutationExecutedForCollab((info, options) => this.capture(info, options)),
      ),
      disposer(
        commands.onCommandExecuted((info) => {
          if (info.type !== CommandType.COMMAND || this.commandDepth(commands) > 1) return
          // the outermost command ended: its mutations are one op
          this.flush()
          queueMicrotask(() => this.checkUnshared())
        }),
      ),
      disposer(
        api.addEvent(api.Event.BeforeCommandExecute, (event) => {
          if (!isUnsharedUniverCommand(event.id)) return
          if (this.session.role === 'host' && !this.othersIn()) {
            this.scheduleRebase()
            return
          }
          event.cancel = true
          this.hooks.refuse(this.session.role === 'guest' ? 'guestBlocked' : 'hostBlocked')
        }),
      ),
      disposer(api.addEvent(api.Event.SelectionChanged, () => this.schedulePresence())),
      disposer(api.addEvent(api.Event.ActiveSheetChanged, () => this.schedulePresence())),
      disposer(
        api.addEvent(api.Event.SheetEditEnded, () => {
          // after the commit's own mutations have run
          setTimeout(() => this.wakeEditorWaiters(), 0)
        }),
      ),
      session.onPeersChanged(() => this.paintPresences()),
      this.watchThreads(),
    )
    const timer = setInterval(() => this.checkUnshared(), UNSHARED_CHECK_MS)
    this.offs.push(() => clearInterval(timer))
    this.rebaselineUnshared()
    this.publishPresence()
    void hooks.fullLoad()
  }

  get role(): 'host' | 'guest' {
    return this.session.role
  }

  othersIn(): boolean {
    return this.session.peers().some((peer) => !peer.self)
  }

  /** the workbook on screen was replaced (a save reopened it, or a guest reloaded) */
  workbookOpened(): void {
    if (this.disposed || this.reloading) return
    this.flush()
    this.rebaselineUnshared()
    this.publishPresence()
    this.paintPresences()
    void this.hooks.fullLoad()
    // a save renumbers styles, sheets and rules: everyone starts from its bytes
    if (this.session.role === 'host') this.scheduleRebase(0)
  }

  /** the host did something the stream cannot carry while alone: later guests start from its bytes */
  hostChangedAlone(): void {
    this.scheduleRebase()
  }

  dispose(): void {
    if (this.disposed) return
    this.flush()
    this.disposed = true
    this.log.dispose()
    for (const off of this.offs.splice(0)) off()
    if (this.flushTimer) clearTimeout(this.flushTimer)
    if (this.rebaseTimer) clearTimeout(this.rebaseTimer)
    if (this.presenceFrame !== null) cancelAnimationFrame(this.presenceFrame)
    this.wakeEditorWaiters(true)
    const runtime = this.hooks.runtime()
    if (runtime) showPresences(runtime, '', [])
  }

  // ---- outgoing ------------------------------------------------------------

  private capture(info: Readonly<ICommandInfo>, options?: IExecutionOptions): void {
    if (this.disposed || this.reloading || this.applying || journalSuppression.active) return
    if (options?.onlyLocal || options?.fromCollab || options?.fromChangeset) return
    if (options?.fromFormula) return
    if (UNSHARED_MUTATIONS.has(info.id)) {
      this.unsharedEdit()
      return
    }
    if (!isSharedMutation(info.id)) return
    const runtime = this.hooks.runtime()
    const workbook = runtime?.univerAPI.getActiveWorkbook()
    if (!runtime || !workbook) return
    const unitId = workbook.getId()
    if ((info.params as { unitId?: unknown } | undefined)?.unitId !== unitId) return
    const styles = runtime.univer
      .__getInjector()
      .get(IUniverInstanceService)
      .getUnit<Workbook>(unitId)
      ?.getStyles()
    if (this.batch.length === 0) this.batchLayout = this.layout
    // copied now: Univer may still change the params object after its listeners ran
    this.batch.push(
      toWire(info.id, info.params, {
        unitId,
        styleOf: (id) => styles?.get(id) ?? null,
        hostSheet: (id) => this.localToHost.get(id) ?? id,
      }),
    )
    const commands = runtime.univer.__getInjector().get(ICommandService)
    if (this.commandDepth(commands) === 0) this.flush()
    else if (!this.flushTimer) {
      // a command that never reports back (it threw) still sends what it did
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        this.flush()
      }, 0)
    }
  }

  /** COMMANDs on Univer's execution stack (private, read defensively) */
  private commandDepth(commands: ICommandService): number {
    const stack = (commands as unknown as { _commandExecutionStack?: CommandStack })
      ._commandExecutionStack
    return Array.isArray(stack)
      ? stack.filter((entry) => entry.type === CommandType.COMMAND).length
      : 0
  }

  /** send the open batch; returns it (null when there was none) */
  private flush(): SheetOp | null {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.batch.length === 0 || this.disposed) return null
    const m = this.batch
    this.batch = []
    let op: SheetOp = { m, l: this.batchLayout }
    if (this.session.role === 'host') {
      this.hostOps += 1
      op = { ...op, n: this.hostOps }
    } else if (this.generation > 0) {
      op = { ...op, g: this.generation }
    }
    if (changesLayout(op)) {
      this.layout += 1
      // a row insert also moves links, breaks and threads in the journal
      this.rebaselineUnshared()
    }
    this.log.submit(op)
    return op
  }

  // ---- incoming ------------------------------------------------------------

  private async apply(op: SheetOp, from: string): Promise<void> {
    if (this.session.role !== 'host') return this.applyHere(op)
    // the ops a guest made after one of its own was refused build on that one
    const barred = this.barred.get(from)
    if (barred !== undefined && (op.g ?? 0) <= barred) throw new Error('after a refused op')
    try {
      await this.applyHere(op)
    } catch (err) {
      this.barred.set(from, op.g ?? 0)
      throw err
    }
  }

  private async applyHere(op: SheetOp): Promise<void> {
    const host = this.session.role === 'host'
    if (!isSheetOp(op)) {
      if (host) throw new Error('not a sheets op')
      void this.log.resync()
      return
    }
    // already inside the bytes this guest last reloaded
    if (!host && op.n !== undefined && op.n <= this.skipHostOpsThrough) return
    // edits of ours not sent yet ran before this one here; they go out first
    const unsent: SheetOp[] = []
    const send = (): void => {
      const own = this.flush()
      if (own) unsent.push(own)
    }
    send()
    if (needsResidentCells(op)) await this.hooks.fullLoad()
    if (host) await this.hooks.saveIdle()
    // a cell editor would commit to a cell that moved under it
    if (changesLayout(op)) await this.editorClosed()
    if (this.disposed) return
    send()
    if (host && op.l !== this.layout) {
      // made against rows or columns that have moved since: it would land elsewhere
      throw new Error('stale sheets op')
    }
    const runtime = this.hooks.runtime()
    const workbook = runtime?.univerAPI.getActiveWorkbook()
    if (!runtime || !workbook) return this.failed(false, 'no workbook')
    const unitId = workbook.getId()
    const local: SheetOp = {
      ...op,
      m: op.m.map((mutation) => fromWire(mutation, unitId, (id) => this.hostToLocal.get(id) ?? id)),
    }
    const missing = missingTarget(local, this.targets(runtime, unitId))
    if (missing !== null) return this.failed(false, `missing ${missing}`)
    const commands = runtime.univer.__getInjector().get(ICommandService)
    let applied = 0
    this.applying = true
    try {
      for (const mutation of local.m) {
        if (
          !commands.syncExecuteCommand(mutation.id, mutation.params as object, { fromCollab: true })
        ) {
          break
        }
        applied += 1
      }
    } catch (err) {
      console.error('[collab] a shared sheets edit did not apply:', err)
    } finally {
      this.applying = false
    }
    if (applied < local.m.length) return this.failed(applied > 0, 'mutation refused')
    if (changesLayout(op)) {
      this.layout += 1
      // undo would replay positions from before someone else's rows moved
      runtime.univer.__getInjector().get(IUndoRedoService).clearUndoRedo(unitId)
    }
    this.rebaselineUnshared()
    this.paintPresences()
    // the host heard ours after this one: if order matters, take its result
    if (!host && unsent.some((own) => !opsCommute(own, op))) void this.log.resync()
  }

  private failed(partial: boolean, reason: string): void {
    if (this.session.role === 'host') {
      // half of it ran here: the guests start over from what the host now has
      if (partial) this.scheduleRebase(0)
      throw new Error(`sheets op not applied: ${reason}`)
    }
    console.warn('[collab] resyncing a shared workbook:', reason)
    void this.log.resync()
  }

  private targets(runtime: UniverRuntime, unitId: string): TargetLookup {
    const injector = runtime.univer.__getInjector()
    const workbook = injector.get(IUniverInstanceService).getUnit<Workbook>(unitId)
    const facade = runtime.univerAPI.getActiveWorkbook()
    const sheetFacade = (sheetId: string) =>
      facade?.getSheetBySheetId(sheetId) as
        | {
            getConditionalFormattingRules?(): Array<{ cfId?: string }>
            getDataValidation?(ruleId: string): unknown
          }
        | null
        | undefined
    const names = (): Record<string, { name?: string; localSheetId?: string }> => {
      try {
        return (injector.get(IDefinedNamesService).getDefinedNameMap(unitId) ?? {}) as Record<
          string,
          { name?: string; localSheetId?: string }
        >
      } catch {
        return {}
      }
    }
    return {
      sheet: (id) => workbook?.getSheetBySheetId(id) != null,
      cfRule: (sheetId, cfId) => {
        try {
          return (
            sheetFacade(sheetId)
              ?.getConditionalFormattingRules?.()
              .some((rule) => rule.cfId === cfId) ?? false
          )
        } catch {
          return false
        }
      },
      dvRule: (sheetId, ruleId) => {
        try {
          return sheetFacade(sheetId)?.getDataValidation?.(ruleId) != null
        } catch {
          return false
        }
      },
      nameId: (name, scope) => {
        for (const [id, entry] of Object.entries(names())) {
          if (entry.name === name && (entry.localSheetId ?? 'AllDefaultWorkbook') === scope) {
            return id
          }
        }
        return null
      },
      name: (id) => names()[id] !== undefined,
    }
  }

  private editorClosed(): Promise<void> {
    if (!this.hooks.isCellEditing()) return Promise.resolve()
    return new Promise((resolve) => this.editorWaiters.push(resolve))
  }

  private wakeEditorWaiters(all = false): void {
    if (!all && this.hooks.isCellEditing()) return
    for (const wake of this.editorWaiters.splice(0)) wake()
  }

  // ---- snapshots -----------------------------------------------------------

  private async snapshot(): Promise<Uint8Array> {
    const { bytes, captured } = await this.hooks.snapshot<SnapshotMeta>(() => {
      // the bytes include what ran here so far: it must be numbered inside them
      this.flush()
      return { sheets: this.localSheets(), ops: this.hostOps, layout: this.layout }
    })
    return packSnapshot(bytes, captured)
  }

  private async reload(data: Uint8Array): Promise<void> {
    const { bytes, meta } = unpackSnapshot(data)
    // a half-typed cell goes out before the workbook under it does
    await this.hooks.commitEditor()
    this.flush()
    this.reloading = true
    try {
      await this.hooks.replace(bytes)
    } catch (err) {
      console.error('[collab] could not reload the shared workbook:', err)
      // this copy no longer matches the host's; it stays as the person's own
      void this.session.leave()
      return
    } finally {
      this.reloading = false
    }
    this.batch = []
    this.generation += 1
    this.hostToLocal = meta ? sheetAliases(meta.sheets, this.localSheets()) : new Map()
    this.localToHost = new Map([...this.hostToLocal].map(([hostId, localId]) => [localId, hostId]))
    this.layout = meta?.layout ?? 0
    this.skipHostOpsThrough = meta?.ops ?? 0
    this.rebaselineUnshared()
    this.publishPresence()
    this.paintPresences()
    void this.hooks.fullLoad()
  }

  private localSheets(): Array<[string, string]> {
    const workbook = this.hooks.runtime()?.univerAPI.getActiveWorkbook()
    return (workbook?.getSheets() ?? []).map(
      (sheet) => [sheet.getSheetId(), sheet.getSheetName()] as [string, string],
    )
  }

  private scheduleRebase(delay = REBASE_DELAY_MS): void {
    if (this.session.role !== 'host' || this.disposed) return
    if (this.rebaseTimer) clearTimeout(this.rebaseTimer)
    this.rebaseTimer = setTimeout(() => {
      this.rebaseTimer = null
      if (!this.disposed) void this.log.rebase()
    }, delay)
  }

  // ---- edits outside the stream -------------------------------------------

  /**
   * The host starts the others over from its bytes; a guest's copy goes
   * back to the host's (the edit cannot reach anyone else).
   */
  private unsharedEdit(): void {
    if (this.disposed) return
    if (this.session.role === 'host') {
      this.scheduleRebase()
      return
    }
    this.hooks.refuse('guestBlocked')
    void this.log.resync()
  }

  private rebaselineUnshared(): void {
    const state = this.hooks.state()
    this.unsharedKey = state ? { state, key: unsharedJournalKey(state.editJournal) } : null
  }

  private checkUnshared(): void {
    if (this.disposed || this.reloading || this.applying) return
    const state = this.hooks.state()
    if (!state) return
    const key = unsharedJournalKey(state.editJournal)
    if (this.unsharedKey?.state !== state) {
      this.unsharedKey = { state, key }
      return
    }
    if (this.unsharedKey.key === key) return
    this.unsharedKey = { state, key }
    this.unsharedEdit()
  }

  /** comment threads live beside the workbook model: watch what people do to them */
  private watchThreads(): () => void {
    const store = threadStore as unknown as Record<string, unknown>
    const own = THREAD_EDITS.filter((name) => Object.prototype.hasOwnProperty.call(store, name))
    if (own.length > 0) return () => undefined
    for (const name of THREAD_EDITS) {
      const original = threadStore[name] as (...args: unknown[]) => unknown
      store[name] = (...args: unknown[]) => {
        const result = original.apply(threadStore, args)
        this.unsharedEdit()
        return result
      }
    }
    return () => {
      for (const name of THREAD_EDITS) delete store[name]
    }
  }

  // ---- presence ------------------------------------------------------------

  private schedulePresence(): void {
    if (this.presenceFrame !== null || this.disposed) return
    this.presenceFrame = requestAnimationFrame(() => {
      this.presenceFrame = null
      this.publishPresence()
    })
  }

  private publishPresence(): void {
    if (this.disposed) return
    try {
      const workbook = this.hooks.runtime()?.univerAPI.getActiveWorkbook()
      const sheet = workbook?.getActiveSheet()
      if (!workbook || !sheet) return
      const cell = workbook.getActiveCell()
      let range = null
      try {
        range = workbook.getActiveRange()?.getRange() ?? null
      } catch {
        // a whole-column selection can outlive a row delete; the cell is enough
      }
      const sheetId = sheet.getSheetId()
      this.session.setPresence(
        PRESENCE_FIELD,
        cellPresence(
          this.localToHost.get(sheetId) ?? sheetId,
          cell ? { row: cell.getRow(), column: cell.getColumn() } : null,
          range,
        ),
      )
    } catch {
      // the workbook is being replaced; the next selection publishes again
    }
  }

  private paintPresences(): void {
    if (this.disposed) return
    const runtime = this.hooks.runtime()
    const workbook = runtime?.univerAPI.getActiveWorkbook()
    if (!runtime || !workbook) return
    const peers = this.session.presences<unknown>(PRESENCE_FIELD).flatMap(({ user, value }) =>
      isCellPresence(value)
        ? [
            {
              name: user.name,
              palette: user.palette,
              sheetId: this.hostToLocal.get(value.sheet) ?? value.sheet,
              presence: value,
            },
          ]
        : [],
    )
    showPresences(runtime, workbook.getId(), peers)
  }
}

function disposer(disposable: { dispose(): void }): () => void {
  return () => disposable.dispose()
}
