/**
 * One copy of a shared map (decision 0073). What this person changes leaves
 * as ops on the host-ordered stream (`OpLog`); what other people change comes
 * in through the same reconciling the editor uses for its own edits.
 *
 * Every sheet keeps a base: the view every copy reaches once the ops sent and
 * received so far are in. A change here is the difference from the base. An
 * op from elsewhere is laid over the base, and this copy's own changes that
 * are not sent yet are laid over that in the order the host will give them:
 * the host's own before the op it is about to take, a guest's after the op
 * the host already ordered.
 *
 * - While a title is typed on a sheet (or a topic dragged) its ops wait; the
 *   map is drawn again only once the box is closed, so the typing survives.
 * - Topics and relationship records that someone else's change took out are
 *   kept. When an undo or a cut-and-paste brings one back under the same id,
 *   it returns whole, with what the editor never showed.
 * - Both histories of a sheet are whole copies of it, so they are dropped
 *   when someone else changes the sheet: undo never takes back another
 *   person's work.
 * - A guest that cannot apply an op starts over from the host's map. The host
 *   refuses an op it cannot apply; if one it already ordered fails later,
 *   everyone starts over from the host's map.
 */
import { OpLog, type CollabSession } from '@genoffice/collab'
import { openXmind, type ThemeId, type ViewSheet, type XmindTopic } from '@genoffice/xmind-engine'
import type { DocumentSession, SheetChange } from '../document/session'
import type { MapController } from '../map/controller'
import {
  commutes,
  diffSheet,
  type MapOp,
  mergeEdit,
  readOp,
  type SheetEdit,
  type SheetRef,
  showsState,
} from './ops'

/** The op stream's topic on the session. */
export const MAP_OPS_TOPIC = 'mindmap'
/** How many taken-out topics (and relationships) a sheet keeps for someone's undo. */
const GONE_LIMIT = 500
/** How often a sheet with waiting ops is looked at, until it is free. */
const HELD_POLL_MS = 150
/** A guest whose catch-up did not arrive asks again after this long. */
const RETRY_MS = 3000
/** The longest ops wait for a pressed topic that never moved or was released. */
const PRESS_WAIT_MS = 3000

/** What the binding needs from the editor around it. */
export interface MapCollabHost {
  /** the controller of a sheet that has been shown; null otherwise */
  controller(key: string): MapController | null
  activeKey(): string | null
  showSheet(key: string): void
  /** other people changed the map */
  changed(): void
}

/** A sheet as it was when the map was described for sharing. */
export interface CapturedSheet {
  view: ViewSheet
  title: string
  theme: ThemeId | null
  curves: Set<string>
}

interface SheetState {
  ref: SheetRef
  base: ViewSheet
  title: string
  theme: ThemeId | null
  /** relationships whose curve the file holds */
  curves: Set<string>
  /** other people's edits waiting while this copy types on the sheet */
  held: SheetEdit[]
  /** the theme changed while the sheet was busy: its look follows when it is free */
  relook: boolean
  /** when ops started to wait on this sheet */
  heldSince: number
  gone: Map<string, XmindTopic>
  /** relationship records, with their place in the list */
  goneLines: Map<string, { record: Record<string, unknown>; at: number }>
}

export function sheetIdOf(session: DocumentSession, key: string): string | null {
  const id = session.sheet(key).id
  return typeof id === 'string' ? id : null
}

function curvesOf(session: DocumentSession, key: string): Set<string> {
  const out = new Set<string>()
  for (const line of session.relationshipRecords(key)) {
    if (typeof line.id !== 'string') continue
    if (line.controlPoints !== undefined || line.lineEndPoints !== undefined) out.add(line.id)
  }
  return out
}

/** Every sheet as it stands, for the start of a session. */
export function captureSheets(session: DocumentSession): Map<string, CapturedSheet> {
  return new Map(
    session.tabs().map((tab) => [
      tab.key,
      {
        view: session.view(tab.key),
        title: tab.title,
        theme: session.themeOf(tab.key),
        curves: curvesOf(session, tab.key),
      },
    ]),
  )
}

function remember<T>(store: Map<string, T>, id: string, value: T): void {
  store.delete(id)
  store.set(id, value)
  if (store.size > GONE_LIMIT) store.delete(store.keys().next().value!)
}

function idsIn(view: ViewSheet): Set<string> {
  const out = new Set<string>()
  const pending = [view.root]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    out.add(topic.id)
    pending.push(...topic.children)
  }
  return out
}

export class MapCollabBinding {
  readonly #collab: CollabSession
  readonly #session: DocumentSession
  readonly #host: MapCollabHost
  readonly #log: OpLog<MapOp>
  readonly #states = new Map<string, SheetState>()
  /** sheets whose tree changed here and was not sent yet */
  readonly #changed = new Set<string>()
  readonly #offSession: () => void
  #flushQueued = false
  /** set while other people's changes go into the map: what the session reports then is not this person's */
  #applying = false
  /** guest: an op did not apply; the host's map is on its way */
  #startingOver = false
  #heldTimer: ReturnType<typeof setInterval> | null = null
  /** sheets to draw again, and whether their history goes too */
  readonly #redraws = new Map<string, boolean>()
  #redrawTurn = 0
  #retryTimer: ReturnType<typeof setTimeout> | null = null
  #disposed = false

  constructor(
    collab: CollabSession,
    session: DocumentSession,
    host: MapCollabHost,
    /** host: the sheets as they were described to the guests */
    described?: ReadonlyMap<string, CapturedSheet>,
  ) {
    this.#collab = collab
    this.#session = session
    this.#host = host
    for (const tab of session.tabs()) {
      const from = described?.get(tab.key)
      if (described && !from) continue
      this.#states.set(tab.key, this.#stateOf(tab.key, from))
    }
    this.#log = new OpLog<MapOp>(collab, {
      topic: MAP_OPS_TOPIC,
      apply: (op) => this.#apply(op),
      snapshot: () => this.#snapshot(),
      reload: (bytes) => this.#reload(bytes),
      onResync: () => this.#forgetHistories(),
      commutes,
    })
    this.#offSession = session.subscribe(this.#onChange)
    if (described) this.#catchUp(described)
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#offSession()
    this.#log.dispose()
    if (this.#heldTimer) clearInterval(this.#heldTimer)
    if (this.#retryTimer) clearTimeout(this.#retryTimer)
    // ops ordered before the end still belong in this copy
    for (const [key, state] of this.#states) {
      if (state.held.length === 0 && !state.relook) continue
      this.#host.controller(key)?.commitEdit()
      this.#drain(key)
    }
    this.#redrawNow()
  }

  // ---- this person's changes ----

  #onChange = (change: SheetChange | null): void => {
    if (this.#applying || this.#disposed || !change) return
    const { key } = change
    switch (change.kind) {
      case 'tree':
        this.#changed.add(key)
        if (!this.#flushQueued) {
          this.#flushQueued = true
          // one op for everything one action changed
          queueMicrotask(() => {
            this.#flushQueued = false
            for (const each of [...this.#changed]) this.#sendTree(each)
          })
        }
        return
      case 'added':
        return this.#sendAdded(key)
      case 'deleted':
        return this.#sendDeleted(key)
      case 'title':
        return this.#sendTitle(key)
      case 'theme':
        return this.#sendTheme(key)
    }
  }

  #sendTree(key: string): void {
    this.#changed.delete(key)
    const state = this.#states.get(key)
    // waiting ops come in first; the change goes out with them (`#drain`)
    if (!state || state.held.length > 0 || this.#disposed) return
    const view = this.#session.view(key)
    const edit = this.#localEdit(key, state, view)
    state.base = view
    state.curves = curvesOf(this.#session, key)
    if (edit) this.#log.submit({ kind: 'edit', sheet: state.ref, edit })
  }

  /** What this copy changed on a sheet since its base; `view` is the sheet now. */
  #localEdit(key: string, state: SheetState, view: ViewSheet): SheetEdit | null {
    const curves = curvesOf(this.#session, key)
    const reshaped = [...state.curves].filter((id) => !curves.has(id))
    return diffSheet(state.base, view, reshaped)
  }

  #sendAdded(key: string): void {
    if (this.#states.has(key)) return
    this.#refreshRefs()
    const sheet = structuredClone(this.#session.sheet(key))
    this.#states.set(key, this.#stateOf(key))
    this.#log.submit({ kind: 'add-sheet', sheet })
  }

  #sendDeleted(key: string): void {
    const state = this.#states.get(key)
    if (!state) return
    this.#states.delete(key)
    this.#changed.delete(key)
    this.#log.submit({ kind: 'delete-sheet', sheet: state.ref })
    this.#refreshRefs()
  }

  #sendTitle(key: string): void {
    const state = this.#states.get(key)
    const title = this.#session.tabs().find((tab) => tab.key === key)?.title
    if (!state || title === undefined || title === state.title) return
    state.title = title
    this.#log.submit({ kind: 'rename-sheet', sheet: state.ref, title })
  }

  #sendTheme(key: string): void {
    const state = this.#states.get(key)
    const theme = this.#session.themeOf(key)
    if (!state || !theme || theme === state.theme) return
    state.theme = theme
    this.#log.submit({ kind: 'theme', sheet: state.ref, theme })
  }

  /** host: what changed between describing the map and sharing it goes out first */
  #catchUp(described: ReadonlyMap<string, CapturedSheet>): void {
    const keys = new Set(this.#session.tabs().map((tab) => tab.key))
    for (const [key, sheet] of described) {
      if (keys.has(key)) continue
      this.#log.submit({
        kind: 'delete-sheet',
        sheet: { id: sheet.view.id, index: sheet.view.index },
      })
    }
    for (const key of keys) {
      if (!this.#states.has(key)) {
        this.#sendAdded(key)
        continue
      }
      this.#sendTree(key)
      this.#sendTitle(key)
      this.#sendTheme(key)
    }
    this.#refreshRefs()
  }

  // ---- other people's changes ----

  async #apply(raw: MapOp): Promise<void> {
    const op = readOp(raw)
    if (!op) return this.#cannot('not an op of a map')
    if (this.#startingOver) return
    switch (op.kind) {
      case 'edit':
        return this.#applyEdit(op.sheet, op.edit)
      case 'add-sheet': {
        if (this.#session.tabs().some((tab) => sheetIdOf(this.#session, tab.key) === op.sheet.id))
          return
        const added = this.#quietly(() => this.#session.adoptSheet(op.sheet))
        if (!added) return this.#cannot('the new sheet does not fit the map')
        this.#refreshRefs()
        this.#states.set(added.key, this.#stateOf(added.key))
        this.#host.changed()
        return
      }
      case 'rename-sheet': {
        const key = this.#keyOf(op.sheet)
        const state = key ? this.#states.get(key) : undefined
        if (!key || !state) return
        this.#quietly(() => this.#session.renameSheet(key, op.title))
        state.title = op.title
        this.#host.changed()
        return
      }
      case 'delete-sheet': {
        const key = this.#keyOf(op.sheet)
        if (!key) return
        const tabs = this.#session.tabs()
        if (tabs.length === 1) return this.#cannot('the last sheet stays')
        if (this.#host.activeKey() === key) {
          const at = tabs.findIndex((tab) => tab.key === key)
          this.#host.showSheet(tabs[at + 1]?.key ?? tabs[at - 1]!.key)
        }
        this.#quietly(() => this.#session.deleteSheet(key))
        this.#states.delete(key)
        this.#changed.delete(key)
        this.#refreshRefs()
        this.#host.changed()
        return
      }
      case 'theme': {
        const key = this.#keyOf(op.sheet)
        const state = key ? this.#states.get(key) : undefined
        if (!key || !state) return
        if (this.#session.themeOf(key) !== op.theme) {
          this.#quietly(() => this.#session.applyTheme(key, op.theme))
        }
        state.theme = op.theme
        // the look changes the whole drawing, which a title being typed would not survive
        if (this.#busy(key)) {
          if (!state.relook && state.held.length === 0) state.heldSince = Date.now()
          state.relook = true
          this.#watchHeld()
        } else {
          this.#host.controller(key)?.flush()
          this.#redrawSoon(key, false)
        }
        this.#host.changed()
        return
      }
    }
  }

  #applyEdit(ref: SheetRef, edit: SheetEdit): void {
    const key = this.#keyOf(ref)
    // the sheet is gone here, and so is everything on it
    const state = key ? this.#states.get(key) : undefined
    if (!key || !state) return
    const host = this.#collab.role === 'host'
    if (state.held.length > 0 || this.#busy(key)) {
      if (host) {
        // this person's change so far comes before the op in the order
        this.#sendTree(key)
        let projected: ViewSheet | null = state.base
        for (const each of [...state.held, edit])
          projected = projected && mergeEdit(projected, each)
        if (!projected) return this.#cannot('the edit does not fit the map')
      }
      if (state.held.length === 0) state.heldSince = Date.now()
      state.held.push(edit)
      this.#watchHeld()
      return
    }
    if (!this.#bringIn(key, [edit], host)) this.#cannot('the edit did not apply')
  }

  /**
   * Puts other people's edits into a sheet, with this copy's own unsent change
   * before them (`localFirst`, the host taking a new op) or after them. False
   * when they do not apply; the sheet is then as it was.
   */
  #bringIn(key: string, edits: readonly SheetEdit[], localFirst: boolean): boolean {
    const state = this.#states.get(key)!
    const controller = this.#host.controller(key)
    // what the screen shows and the tree does not have yet is this person's own change
    controller?.flush()
    if (localFirst) this.#sendTree(key)
    const current = this.#session.view(key)
    const local = localFirst ? null : this.#localEdit(key, state, current)
    let target: ViewSheet | null = state.base
    for (const edit of edits) target = target && mergeEdit(target, edit)
    if (target && local) target = mergeEdit(target, local)
    if (!target) return false
    const reshaped = edits.flatMap((edit) => edit.reshaped ?? [])
    const outcome = this.#reconcile(key, state, target, current, reshaped)
    if (outcome === 'failed') return false
    state.base = this.#session.view(key)
    state.curves = curvesOf(this.#session, key)
    this.#changed.delete(key)
    if (local) this.#log.submit({ kind: 'edit', sheet: state.ref, edit: local })
    if (outcome === 'changed') this.#redrawSoon(key, true)
    return true
  }

  #reconcile(
    key: string,
    state: SheetState,
    target: ViewSheet,
    current: ViewSheet,
    reshaped: readonly string[],
  ): 'changed' | 'same' | 'failed' {
    const staying = idsIn(target)
    // what leaves the sheet now is kept, in case someone brings it back
    const leaving: Array<[string, XmindTopic]> = []
    const look = [current.root]
    for (let topic = look.pop(); topic; topic = look.pop()) {
      for (const child of topic.children) {
        if (staying.has(child.id)) {
          look.push(child)
          continue
        }
        const copy = this.#session.copyOfTopic(key, child.id)
        if (copy) leaving.push([child.id, copy])
      }
    }
    const linesBefore = this.#session.relationshipRecords(key)

    // what comes back under an id it had is put back whole first
    const inUse = this.#session.topicIds()
    const revive: Array<{ parentId: string; topic: XmindTopic }> = []
    const walk = [target.root]
    for (let topic = walk.pop(); topic; topic = walk.pop()) {
      for (const child of topic.children) {
        const kept = !inUse.has(child.id) ? state.gone.get(child.id) : undefined
        if (kept) revive.push({ parentId: topic.id, topic: kept })
        else walk.push(child)
      }
    }
    const present = new Set(linesBefore.map((line) => line.id))
    const lines = target.relationships
      .filter((line) => !present.has(line.id))
      .map((line) => state.goneLines.get(line.id))
      .filter((line) => line !== undefined)

    const result = this.#quietly(() =>
      this.#session.applyShared(
        key,
        target,
        { topics: revive, relationships: lines, reshapedRelationships: reshaped },
        (outcome) =>
          outcome.ok &&
          outcome.ids.topics.size === 0 &&
          outcome.ids.relationships.size === 0 &&
          showsState(target, outcome.view),
      ),
    )
    if (!result) return 'failed'
    for (const { topic } of revive) state.gone.delete(topic.id)
    for (const { record } of lines) state.goneLines.delete(String(record.id))
    for (const [id, copy] of leaving) remember(state.gone, id, copy)
    const linesAfter = new Set(this.#session.relationshipRecords(key).map((line) => line.id))
    linesBefore.forEach((record, at) => {
      if (typeof record.id === 'string' && !linesAfter.has(record.id)) {
        remember(state.goneLines, record.id, { record, at })
      }
    })
    return (result.ok && result.changed) || revive.length > 0 || lines.length > 0
      ? 'changed'
      : 'same'
  }

  /** A sheet is busy while a title is typed on it or a topic is dragged: drawing it now would lose that. */
  #busy(key: string): boolean {
    const controller = this.#host.controller(key)
    if (!controller) return false
    if (controller.editingText || controller.composing) return true
    const ghost = controller.mind.container.querySelector<HTMLElement>('.mind-elixir-ghost')
    if (ghost !== null && ghost.style.display === 'block') return true
    // a topic is pressed and may start to move; a release that never came does not hold ops for good
    const state = this.#states.get(key)
    const waited =
      state && state.held.length + Number(state.relook) > 0 ? Date.now() - state.heldSince : 0
    return controller.mind.dragged != null && waited < PRESS_WAIT_MS
  }

  #watchHeld(): void {
    if (this.#heldTimer || this.#disposed) return
    this.#heldTimer = setInterval(() => {
      let waiting = false
      for (const [key, state] of this.#states) {
        if (state.held.length === 0 && !state.relook) continue
        if (this.#busy(key)) waiting = true
        else this.#drain(key)
      }
      if (!waiting && this.#heldTimer) {
        clearInterval(this.#heldTimer)
        this.#heldTimer = null
      }
    }, HELD_POLL_MS)
  }

  /** The waiting ops of a sheet go in, then this copy's change made meanwhile. */
  #drain(key: string): void {
    const state = this.#states.get(key)
    if (!state) return
    const edits = state.held.splice(0)
    if (edits.length > 0 && !this.#bringIn(key, edits, false)) {
      if (this.#collab.role === 'host') {
        // the host ordered these already: everyone starts over from this map
        console.warn('[mindmap] ops held during typing did not apply; sharing the map again')
        state.base = this.#session.view(key)
        state.curves = curvesOf(this.#session, key)
        void this.#log.rebase()
      } else this.#startOver()
      return
    }
    if (state.relook) {
      state.relook = false
      this.#redrawSoon(key, false)
    }
  }

  /**
   * Draws a sheet again once the ops that arrive together are in: a guest
   * catching up gets many at once. The drawing follows within the same turn,
   * before any key or click can reach the out-of-date drawing (two microtasks
   * deep, past the op stream's own await between two ops).
   */
  #redrawSoon(key: string, forget: boolean): void {
    this.#redraws.set(key, (this.#redraws.get(key) ?? false) || forget)
    const turn = ++this.#redrawTurn
    queueMicrotask(() =>
      queueMicrotask(() => {
        if (turn === this.#redrawTurn) this.#redrawNow()
      }),
    )
  }

  #redrawNow(): void {
    const pending = [...this.#redraws]
    this.#redraws.clear()
    for (const [key, forget] of pending) {
      if (this.#session.indexOf(key) < 0) continue
      const controller = this.#host.controller(key)
      if (controller) {
        controller.redraw()
        if (forget) controller.forgetHistory()
      } else if (forget) this.#session.dropHistory(key)
    }
    if (pending.length > 0) this.#host.changed()
  }

  // ---- starting over ----

  async #snapshot(): Promise<Uint8Array> {
    // what waits for a closed edit box is in the order already: the copy has to hold it
    for (const [key, state] of this.#states) {
      if (state.held.length === 0 && !state.relook) continue
      this.#host.controller(key)?.commitEdit()
      this.#drain(key)
    }
    return this.#session.recoveryBytes()
  }

  async #reload(bytes: Uint8Array): Promise<void> {
    const opened = await openXmind(bytes)
    if (opened.status !== 'ok')
      throw new Error(`mindmap: the host's map does not open (${opened.status})`)
    this.#quietly(() => this.#session.replaceSheets(opened.document.sheets))
    this.#states.clear()
    this.#changed.clear()
    this.#redraws.clear()
    for (const tab of this.#session.tabs()) this.#states.set(tab.key, this.#stateOf(tab.key))
    this.#startingOver = false
    const tabs = this.#session.tabs()
    const active = this.#host.activeKey()
    if (!tabs.some((tab) => tab.key === active) && tabs[0]) this.#host.showSheet(tabs[0].key)
    for (const tab of tabs) this.#host.controller(tab.key)?.redraw()
    this.#host.changed()
  }

  #forgetHistories(): void {
    for (const tab of this.#session.tabs()) {
      const controller = this.#host.controller(tab.key)
      if (controller) controller.forgetHistory()
      else this.#session.dropHistory(tab.key)
    }
  }

  /** An op that does not apply: the host refuses it, a guest takes the host's map. */
  #cannot(problem: string): void {
    if (this.#collab.role === 'host') throw new Error(`mindmap: ${problem}`)
    console.warn(`[mindmap] ${problem}; taking the host's map`)
    this.#startOver()
  }

  #startOver(): void {
    if (this.#disposed) return
    this.#startingOver = true
    for (const state of this.#states.values()) state.held = []
    void this.#log.resync().then(() => {
      // no answer came: ask again rather than stay apart
      if (!this.#startingOver || this.#disposed || this.#retryTimer) return
      this.#retryTimer = setTimeout(() => {
        this.#retryTimer = null
        if (this.#startingOver) this.#startOver()
      }, RETRY_MS)
    })
  }

  // ---- bookkeeping ----

  #quietly<T>(change: () => T): T {
    this.#applying = true
    try {
      return change()
    } finally {
      this.#applying = false
    }
  }

  #stateOf(key: string, from?: CapturedSheet): SheetState {
    const tab = this.#session.tabs().find((candidate) => candidate.key === key)!
    return {
      ref: { id: sheetIdOf(this.#session, key), index: tab.index },
      base: from?.view ?? this.#session.view(key),
      title: from?.title ?? tab.title,
      theme: from ? from.theme : this.#session.themeOf(key),
      curves: from?.curves ?? curvesOf(this.#session, key),
      held: [],
      relook: false,
      heldSince: 0,
      gone: new Map(),
      goneLines: new Map(),
    }
  }

  #refreshRefs(): void {
    for (const tab of this.#session.tabs()) {
      const state = this.#states.get(tab.key)
      if (state) state.ref = { id: sheetIdOf(this.#session, tab.key), index: tab.index }
    }
  }

  #keyOf(ref: SheetRef): string | null {
    for (const tab of this.#session.tabs()) {
      const id = sheetIdOf(this.#session, tab.key)
      if (ref.id !== null ? id === ref.id : id === null && tab.index === ref.index) return tab.key
    }
    return null
  }
}
