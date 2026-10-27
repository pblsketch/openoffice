/**
 * Co-editing on the main side (decision 0073). The deck lives here while the
 * shared session lives in the tab's renderer, so this module sits between the
 * two: it captures every transaction the journal funnel applies and sends it
 * to the renderer as a wire op, applies other people's ops through the same
 * funnel, serves the host's bytes, reloads a guest that fell out of step, and
 * refuses what cannot work during a session.
 *
 * A guest never saves and never looks changed; once its session ends the copy
 * becomes that person's own unsaved deck. Undo is snapshot based and cannot
 * tell whose edit it would undo, so other people's ops clear the history and
 * a snapshot jump (undo, AI rollback) is only allowed to a host that is alone,
 * after which everyone starts again from its bytes.
 */
import { ipcMain, webContents, type WebContents } from 'electron'
import { basename } from 'node:path'
import { commitSaved, savePptx } from '@genoffice/pptx-engine'
import type { OpRecord } from '@genoffice/pptx-ops'
import type { RenderSlide } from '@genoffice/pptx-render'
import {
  SLIDES_COLLAB_CHANNELS as CH,
  type SlidesCollabApplyResult,
  type SlidesCollabCaptured,
  type SlidesCollabDescribe,
  type SlidesCollabNotice,
  type SlidesCollabRole,
  type SlidesCollabSnapshot,
  type SlidesWireOp,
  type SlidesWireSource,
} from '../shared/collab'
import {
  markMetaDirty,
  restoreSnapshot,
  scheduleDeckBroadcast,
  scheduleHistoryNotify,
  sessions,
  takeSnapshot,
  type Session,
} from './session-state'
import { indexElements, SECTION_OPS, toWireOp } from './collab-wire'

interface CollabState {
  role: SlidesCollabRole
  /** the tab whose renderer carries the session */
  wcId: number
  /** host: the session is bound; captures wait until then */
  live: boolean
  /** host: someone else is in the session */
  others: boolean
  /** another person's op is being applied: it is not captured again */
  applying: boolean
  /** the last capture number sent to the renderer */
  seq: number
  held: SlidesCollabCaptured[]
  /** built-in layouts this deck injected: part path → layout key */
  layouts: Map<string, string>
}

const states = new WeakMap<Session, CollabState>()

export function isCollabGuest(session: Session | undefined): boolean {
  return !!session && states.get(session)?.role === 'guest'
}

function notify(wc: WebContents, notice: SlidesCollabNotice): void {
  if (!wc.isDestroyed()) wc.send(CH.blocked, notice)
}

/**
 * Refuse a feature during a session and tell the person why. `guest` refuses
 * only guests, `others` also a host with people in, `session` everyone.
 */
export function collabRefuse(
  session: Session | undefined,
  wc: WebContents,
  scope: 'guest' | 'others' | 'session',
): boolean {
  const state = session && states.get(session)
  if (!state) return false
  if (state.role === 'guest') {
    notify(wc, 'guestBlocked')
    return true
  }
  if (scope === 'guest') return false
  if (state.others) {
    notify(wc, 'hostBlocked')
    return true
  }
  if (scope === 'others') return false
  notify(wc, 'guestBlocked')
  return true
}

/** a guest's copy is not saved while the session lasts */
export function collabSaveRefused(session: Session | undefined, wc: WebContents): boolean {
  if (!isCollabGuest(session)) return false
  notify(wc, 'guestSaveBlocked')
  return true
}

/** ops a guest cannot send: they would be lost when it falls back to the host's bytes */
export function collabRefusesOps(session: Session, ops: Array<{ op?: unknown }>): string | null {
  if (!isCollabGuest(session)) return null
  return ops.some((op) => SECTION_OPS.has(String(op?.op)))
    ? 'Sections cannot be changed by a guest in a co-editing session.'
    : null
}

function send(state: CollabState, captured: SlidesCollabCaptured): void {
  if (!state.live) {
    state.held.push(captured)
    return
  }
  const wc = webContents.fromId(state.wcId)
  if (wc && !wc.isDestroyed()) wc.send(CH.captured, captured)
}

/**
 * The deck jumped in a way ops cannot carry (an undo, an AI tool that edits
 * outside the executor): the host re-bases everyone, a guest takes the
 * host's bytes again.
 */
export function collabReset(session: Session): void {
  const state = states.get(session)
  if (state && !state.applying) send(state, { seq: ++state.seq, op: null })
}

/**
 * Called by the journal funnel before a transaction runs: returns what to do
 * with its records once applied, or null when the deck is not shared. The
 * element index is taken first, so deleted elements can still be named.
 */
export function collabCapture(
  session: Session,
): ((records: OpRecord[], source: SlidesWireSource) => void) | null {
  const state = states.get(session)
  if (!state || state.applying) return null
  const pre = indexElements(session.opened)
  return (records, source) => {
    if (records.length === 0) return
    const op = toWireOp(records, source, pre, session.opened, state.layouts)
    send(state, { seq: ++state.seq, op })
  }
}

/** a built-in layout was injected before a transaction: peers inject it too */
export function noteBuiltinLayout(session: Session, path: string, key: string): void {
  states.get(session)?.layouts.set(path, key)
}

/** apply `fn` as another person's edit: not captured, not undoable here */
export function asRemote<T>(session: Session, fn: () => T): T {
  const state = states.get(session)
  if (!state) return fn()
  state.applying = true
  try {
    return fn()
  } finally {
    state.applying = false
  }
}

/**
 * Other people's edits are not in this person's undo snapshots, so history
 * restarts after each one; a running AI batch restarts its rollback point too.
 */
export function forgetHistory(session: Session): void {
  session.undoStack = []
  session.redoStack = []
  session.aiSnapshots?.clear()
  if (session.historyBatch) {
    session.historyBatch.before = takeSnapshot(session)
    session.historyBatch.undoStart = 0
  }
  scheduleHistoryNotify(session)
}

/**
 * A drag in progress has its preview frames in the model, unjournaled: drop
 * them so another person's op lands on the committed deck. The next frame
 * starts the gesture again from there.
 */
export function dropTransformPreview(session: Session): void {
  if (!session.transformPreview) return
  session.transformPreview = false
  const snap = session.undoStack.pop()
  if (snap) restoreSnapshot(session, snap)
  if (session.previewRedo) session.redoStack = session.previewRedo
  session.previewRedo = undefined
}

export interface SlidesCollabDeps {
  /** the deck has edits a save would write */
  isDirty(session: Session): boolean
  /** an untitled deck's name */
  untitledName(session: Session): string
  /** apply another person's wire op; the result's check is compared with theirs */
  applyRemote(session: Session, op: SlidesWireOp): SlidesCollabApplyResult
  /** a guest takes the host's bytes */
  reload(session: Session, bytes: Uint8Array): Promise<RenderSlide[] | null>
}

/**
 * What a save would write now. On the host the in-memory deck is then synced
 * with those bytes the way a save syncs it (still unsaved), so it numbers new
 * elements exactly as a guest that opened them does.
 */
async function hostBytes(session: Session, deps: SlidesCollabDeps): Promise<Uint8Array> {
  const dirty = deps.isDirty(session)
  // buildZip runs before savePptx's first await: no edit can slip in between
  const bytes = await savePptx(session.opened)
  commitSaved(session.opened)
  if (dirty) markMetaDirty(session)
  return bytes
}

function stateOf(e: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent): {
  session: Session
  state: CollabState
} | null {
  const session = sessions.get(e.sender.id)
  const state = session && states.get(session)
  return session && state && state.wcId === e.sender.id ? { session, state } : null
}

function fresh(role: SlidesCollabRole, wc: WebContents, live: boolean): CollabState {
  return {
    role,
    wcId: wc.id,
    live,
    others: false,
    applying: false,
    seq: 0,
    held: [],
    layouts: new Map(),
  }
}

/** the deck each tab shares or joined, so its state goes when the tab does */
const tabDecks = new Map<number, Session>()

function dropWith(wc: WebContents, session: Session): void {
  const id = wc.id
  if (!tabDecks.has(id)) {
    wc.once('destroyed', () => {
      const deck = tabDecks.get(id)
      tabDecks.delete(id)
      if (deck && states.get(deck)?.wcId === id) states.delete(deck)
    })
  }
  tabDecks.set(id, session)
}

let registered = false

export function registerSlidesCollabIpc(deps: SlidesCollabDeps): void {
  if (registered) return
  registered = true

  ipcMain.handle(CH.info, (e) => {
    const session = sessions.get(e.sender.id)
    return session ? { encrypted: session.password !== undefined } : null
  })

  ipcMain.handle(CH.describe, async (e): Promise<SlidesCollabDescribe | null> => {
    const session = sessions.get(e.sender.id)
    if (!session || session.password !== undefined || session.masterEdit) return null
    const current = states.get(session)
    if (current && current.wcId !== e.sender.id) return null
    // capturing starts before the bytes are taken, so nothing falls between them
    const state = fresh('host', e.sender, false)
    states.set(session, state)
    dropWith(e.sender, session)
    const base = await hostBytes(session, deps)
    const fileName = session.path
      ? basename(session.path)
      : `${deps.untitledName(session).replace(/\.pptx$/i, '')}.pptx`
    return { title: fileName, fileName, base }
  })

  ipcMain.handle(CH.begin, (e, role: unknown) => {
    const session = sessions.get(e.sender.id)
    if (!session || (role !== 'host' && role !== 'guest')) return
    let state = states.get(session)
    if (role === 'guest' || !state || state.wcId !== e.sender.id) {
      state = fresh(role, e.sender, true)
      states.set(session, state)
      dropWith(e.sender, session)
    }
    if (role === 'host') {
      state.live = true
      for (const captured of state.held.splice(0)) send(state, captured)
    } else {
      forgetHistory(session)
    }
    // the renderer asks again whether the deck is changed
    scheduleDeckBroadcast(session, true)
  })

  ipcMain.handle(CH.end, (e) => {
    const found = stateOf(e)
    if (!found) return
    states.delete(found.session)
    // the copy is now this person's own deck, which no file holds yet
    if (found.state.role === 'guest') markMetaDirty(found.session)
    scheduleDeckBroadcast(found.session, true)
  })

  ipcMain.on(CH.peers, (e, count: unknown) => {
    const found = stateOf(e)
    if (found) found.state.others = typeof count === 'number' && count > 1
  })

  ipcMain.handle(CH.snapshot, async (e): Promise<SlidesCollabSnapshot> => {
    const found = stateOf(e)
    if (!found || found.state.role !== 'host') throw new Error('not hosting')
    // read where the bytes are frozen: hostBytes serializes before its first await
    const seq = found.state.seq
    return { bytes: await hostBytes(found.session, deps), seq }
  })

  ipcMain.handle(CH.apply, (e, op: SlidesWireOp, known: unknown): SlidesCollabApplyResult => {
    const found = stateOf(e)
    if (!found || !op || !Array.isArray(op.ops)) return { ok: false }
    // an edit made here is still on its way to the stream: applying the remote
    // op now would put them in a different order than everyone else's
    if (typeof known === 'number' && found.state.seq > known) {
      return { ok: false, wait: found.state.seq }
    }
    try {
      return deps.applyRemote(found.session, op)
    } catch (err) {
      console.error('[slides collab] remote op failed:', err)
      return { ok: false }
    }
  })

  ipcMain.handle(CH.reload, async (e, bytes: unknown) => {
    const found = stateOf(e)
    if (!found || found.state.role !== 'guest' || !(bytes instanceof Uint8Array)) return null
    const slides = await deps.reload(found.session, bytes)
    return slides ? { slides } : null
  })
}
