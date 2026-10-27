/**
 * LAN co-editing in the slides editor (decision 0073): the contract between
 * the tab's renderer, which carries the shared session, and the main process,
 * which holds the deck. Main captures every applied transaction at the
 * journal funnel and hands it to the renderer as a wire op; the renderer puts
 * it on the shared op stream and hands other people's ops back to main.
 */
import type { Op } from '@genoffice/pptx-ops'
import type { RenderSlide } from '@genoffice/pptx-render'

export const SLIDES_COLLAB_CHANNELS = {
  /** host: start capturing and return what a save would write now */
  describe: 'slides:collab-describe',
  /** what the share dialog needs to know before it offers sharing */
  info: 'slides:collab-info',
  /** the renderer's session is bound: host goes live, guest stops saving */
  begin: 'slides:collab-begin',
  end: 'slides:collab-end',
  /** how many people are in the session, this one included */
  peers: 'slides:collab-peers',
  snapshot: 'slides:collab-snapshot',
  apply: 'slides:collab-apply',
  reload: 'slides:collab-reload',
  /** main → renderer: an edit made here, or a jump the op stream cannot carry */
  captured: 'slides:collab-captured',
  /** main → renderer: a feature was refused for the session */
  blocked: 'slides:collab-blocked',
} as const

export type SlidesCollabRole = 'host' | 'guest'

/** the session messages main asks the renderer to show (keys of the shared collab strings) */
export type SlidesCollabNotice = 'guestBlocked' | 'hostBlocked' | 'guestSaveBlocked'

export type SlidesWireSource = 'edit' | 'batch' | 'script' | 'generate'

export interface SlidesWireOp {
  /** the journal source: peers settle the transaction the way its surface did */
  source: SlidesWireSource
  /** the transaction's ops; slides by "s_<n>", elements by "e_<cNvPr id>" */
  ops: Op[]
  /** built-in layouts the ops need, injected before they apply: [part path, layout key] */
  layouts?: Array<[string, string]>
  /** the elements and slides the transaction created, to notice a peer that numbered them differently */
  check: string
  /** what the transaction touches, to tell whether two ops land the same in either order */
  keys: string[]
  /** the host's own edits: their capture number (see SlidesCollabSnapshot) */
  seq?: number
}

/**
 * One captured transaction, numbered so a remote op is never applied ahead of
 * a local one the stream has not seen yet. `op` is null when the change cannot
 * travel as ops (an undo, a section edit): the host re-bases, a guest resyncs.
 */
export interface SlidesCollabCaptured {
  seq: number
  op: SlidesWireOp | null
}

/**
 * The host's bytes, and the capture number they include edits up to. Edits
 * captured after the op stream last looked are in the bytes but reach the
 * stream later; a guest that reloads these bytes skips them.
 */
export interface SlidesCollabSnapshot {
  bytes: Uint8Array
  seq: number
}

export interface SlidesCollabInfo {
  /** opened with a password: guests would receive it decrypted */
  encrypted: boolean
}

export interface SlidesCollabDescribe {
  title: string
  fileName: string
  base: Uint8Array
}

export type SlidesCollabApplyResult = { ok: true; check: string } | { ok: false; wait?: number }

export interface SlidesCollabReloaded {
  slides: RenderSlide[]
}

/** the preload bridge (`window.slidesCollab`) */
export interface SlidesCollabApi {
  info(): Promise<SlidesCollabInfo | null>
  describe(): Promise<SlidesCollabDescribe | null>
  begin(role: SlidesCollabRole): Promise<void>
  end(): Promise<void>
  peers(count: number): void
  snapshot(): Promise<SlidesCollabSnapshot>
  /** `known`: the last captured seq the renderer has put on the stream */
  apply(op: SlidesWireOp, known: number): Promise<SlidesCollabApplyResult>
  reload(bytes: Uint8Array): Promise<SlidesCollabReloaded | null>
  onCaptured(handler: (captured: SlidesCollabCaptured) => void): () => void
  onBlocked(handler: (notice: SlidesCollabNotice) => void): () => void
}

/** the key every op of a transaction that touches the deck as a whole carries */
export const DECK_KEY = 'deck'

function slideOfKey(key: string): string | null {
  const bar = key.indexOf('|')
  if (bar < 0) return null
  const rest = key.slice(bar + 1)
  const next = rest.indexOf('|')
  return next < 0 ? rest : rest.slice(0, next)
}

/**
 * Whether two ops give the same deck in either order. Keys: "deck" clashes with
 * everything, "b|<slide>" (slide-wide edits such as a background) with anything
 * on that slide, every other key only with itself.
 */
export function wireOpsCommute(a: SlidesWireOp, b: SlidesWireOp): boolean {
  for (const ka of a.keys) {
    for (const kb of b.keys) {
      if (ka === DECK_KEY || kb === DECK_KEY || ka === kb) return false
      if (
        (ka.startsWith('b|') || kb.startsWith('b|')) &&
        slideOfKey(ka) !== null &&
        slideOfKey(ka) === slideOfKey(kb)
      ) {
        return false
      }
    }
  }
  return true
}
