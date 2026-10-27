/**
 * Watch mode for LAN co-editing in the Hangul editor (decision 0073).
 *
 * The document lives in the engine inside the editor frame, and the editor has
 * no way to merge two people's edits, so only the person sharing edits. After
 * each pause in their work the whole document goes out to everyone else, who
 * load it in place. This module is the timing and bookkeeping of that, with no
 * editor or session in it.
 */
import type { CollabPeer } from '@genoffice/collab'

/** host → everyone: the document as it is now */
export const SNAPSHOT_TOPIC = 'hwp:snapshot'
/** guest → host: the latest snapshot, to start from */
export const LATEST_TOPIC = 'hwp:latest'
/** the presence field where the host says which page it is on */
export const PRESENCE_FIELD = 'hwp'

export interface HwpSnapshot {
  /** 0 is the copy guests opened; each later snapshot counts up */
  seq: number
  bytes: Uint8Array
}

export interface HwpPresence {
  /** 1-based, as the editor's status bar counts */
  page: number
}

/** a snapshot as it came off the wire, or null for anything else */
export function snapshotOf(raw: unknown): HwpSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const { seq, bytes } = raw as { seq?: unknown; bytes?: unknown }
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || seq < 0) return null
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return null
  return { seq, bytes }
}

/**
 * The page in the editor's status bar ("Page 3 / 10", "3 / 10 쪽"): the page being edited
 * while it is on screen, else the one in view, numbered as the document numbers it.
 */
export function pageOfIndicator(text: string | null | undefined): number | null {
  const match = /\d+/.exec(text ?? '')
  const page = match ? Number(match[0]) : 0
  return Number.isSafeInteger(page) && page > 0 ? page : null
}

export function presenceOf(raw: unknown): HwpPresence | null {
  if (!raw || typeof raw !== 'object') return null
  const { page } = raw as { page?: unknown }
  return typeof page === 'number' && Number.isSafeInteger(page) && page > 0 ? { page } : null
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a === b) return true
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false
  return true
}

export interface SnapshotTiming {
  /** how long the host leaves the editor alone before its document goes out */
  idleMs: number
  /** during unbroken work on a light document it still goes out this often */
  maxWaitMs: number
  /** an export slower than this waits for a real pause */
  slowMs: number
  /** after an export, the next waits at least this many times what it took */
  costFactor: number
  /** with no sign of work, how often the cheap change mark is looked at */
  pollMs: number
  /** after a failed export */
  failureMs: number
}

export const SNAPSHOT_TIMING: SnapshotTiming = {
  idleMs: 1_500,
  maxWaitMs: 6_000,
  slowMs: 400,
  costFactor: 4,
  pollMs: 3_000,
  failureMs: 5_000,
}

/** How often the publisher looks whether a snapshot is due (the look itself is free). */
export const SNAPSHOT_TICK_MS = 250

export interface SnapshotSource {
  /** changes whenever the user changes the document in the editor; cheap to read */
  changeMark(): Promise<string>
  /** the document as it is now, in the format it was opened in */
  exportBytes(): Promise<Uint8Array>
}

export interface SnapshotPublisherOptions {
  source: SnapshotSource
  /** what guests opened: snapshot 0 */
  base: Uint8Array
  /** the editor's own export of that same document, when `base` was corrected after it */
  baseline?: Uint8Array
  /** the change mark read before `baseline` was exported; unknown means look at once */
  baselineMark?: string | null
  publish(snapshot: HwpSnapshot): void
  /** a save or a print has the editor */
  isBusy?(): boolean
  now?(): number
  timing?: Partial<SnapshotTiming>
}

export type SnapshotTickResult = 'waiting' | 'unchanged' | 'sent' | 'failed'

export interface SnapshotPublisher {
  /** the host is at work in the editor: look again once it pauses */
  noteInput(): void
  /** the document changed with no key or click in the editor (the AI panel) */
  noteChange(): void
  tick(): Promise<SnapshotTickResult>
  latest(): HwpSnapshot
}

/**
 * The host's side. Exporting a whole document is heavy and runs on the thread the
 * host types on, so the cheap change mark is looked at first and the export only
 * happens once it moved and the host has paused. Unchanged bytes are not sent.
 */
export function createSnapshotPublisher(options: SnapshotPublisherOptions): SnapshotPublisher {
  const timing = { ...SNAPSHOT_TIMING, ...options.timing }
  const now = options.now ?? (() => Date.now())
  const { source } = options
  let latest: HwpSnapshot = { seq: 0, bytes: options.base }
  let lastExport = options.baseline ?? options.base
  let lastMark: string | null = options.baselineMark ?? null
  let changed = lastMark === null
  // a first look right away: the document may have moved since it was exported for sharing
  let dueSince: number | null = now()
  let inputSeen = false
  let lastInputAt = Number.NEGATIVE_INFINITY
  let lastLookAt = now()
  let cost = 0
  let notBefore = Number.NEGATIVE_INFINITY
  let running = false

  const noteInput = () => {
    lastInputAt = now()
    inputSeen = true
    dueSince ??= lastInputAt
  }

  return {
    noteInput,
    noteChange() {
      changed = true
      noteInput()
    },
    async tick() {
      if (running) return 'waiting'
      const at = now()
      if (dueSince === null) {
        if (at - lastLookAt < timing.pollMs) return 'waiting'
        dueSince = at
      }
      const paused = at - lastInputAt >= timing.idleMs
      const overdue = cost < timing.slowMs && at - dueSince >= timing.maxWaitMs
      if ((!paused && !overdue) || at < notBefore || options.isBusy?.()) return 'waiting'
      running = true
      lastLookAt = at
      dueSince = null
      const worked = inputSeen
      inputSeen = false
      try {
        const mark = await source.changeMark().catch(() => null)
        // without the mark, any work in the editor may have changed it
        const moved = changed || (mark === null ? worked : mark !== lastMark)
        lastMark = mark
        if (!moved) return 'unchanged'
        changed = false
        const started = now()
        const bytes = await source.exportBytes()
        cost = now() - started
        notBefore = now() + cost * timing.costFactor
        if (sameBytes(bytes, lastExport)) return 'unchanged'
        lastExport = bytes
        latest = { seq: latest.seq + 1, bytes }
        options.publish(latest)
        return 'sent'
      } catch {
        changed = true
        dueSince ??= now()
        notBefore = now() + timing.failureMs
        return 'failed'
      } finally {
        running = false
      }
    },
    latest: () => latest,
  }
}

export interface SnapshotReceiverOptions {
  /** put these bytes in the editor in place of what it shows */
  load(bytes: Uint8Array): Promise<void>
  /** the editor is printing: a load now would change the pages under it */
  isBusy?(): boolean
  retryMs?: number
}

export interface SnapshotReceiver {
  offer(snapshot: HwpSnapshot): void
  /** the guest's copy moved off the host's (a key that slipped through): show the host's again */
  restore(): void
  /** the snapshot on screen */
  shown(): number
  dispose(): void
}

/**
 * The guest's side: the newest snapshot wins, one load at a time. Snapshot 0 is the
 * copy the guest's tab opened, so it is only kept, not loaded again.
 */
export function createSnapshotReceiver(options: SnapshotReceiverOptions): SnapshotReceiver {
  let shownSeq = 0
  let shownBytes: Uint8Array | null = null
  let pending: HwpSnapshot | null = null
  let stray = false
  let loading = false
  let retry: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const pump = (): void => {
    if (disposed || loading || retry) return
    const next = pending ?? (stray && shownBytes ? { seq: shownSeq, bytes: shownBytes } : null)
    if (!next) return
    if (options.isBusy?.()) {
      retry = setTimeout(() => {
        retry = null
        pump()
      }, options.retryMs ?? 500)
      return
    }
    pending = null
    stray = false
    loading = true
    options
      .load(next.bytes)
      .then(
        () => {
          shownSeq = next.seq
          shownBytes = next.bytes
        },
        (error: unknown) => console.warn('[hwp] could not show the shared document:', error),
      )
      .finally(() => {
        loading = false
        pump()
      })
  }

  return {
    offer(snapshot) {
      if (disposed || snapshot.seq < shownSeq) return
      if (pending && snapshot.seq <= pending.seq) return
      if (snapshot.seq === shownSeq) {
        shownBytes ??= snapshot.bytes
        pump()
        return
      }
      pending = snapshot
      pump()
    },
    restore() {
      stray = true
      pump()
    },
    shown: () => shownSeq,
    dispose() {
      disposed = true
      if (retry) clearTimeout(retry)
      retry = null
    },
  }
}

/** keys that only move around or read: everything else a guest presses is refused */
const MOVING_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  'Escape',
  // the presentation and fullscreen keys
  'F5',
  'F11',
])
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'])
/** copy and select all; Ctrl+Shift with these letters is Hangul's alignment */
const READING_CHORDS = new Set(['KeyC', 'KeyA'])

export interface KeyLike {
  key: string
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** whether a guest's key may reach the editor */
export function guestKeyAllowed(event: KeyLike): boolean {
  if (MODIFIER_KEYS.has(event.key)) return true
  // Alt with an arrow resizes cells in a block
  if (MOVING_KEYS.has(event.key)) return !event.altKey
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return false
  return READING_CHORDS.has(event.code)
}

export interface HostPlace {
  name: string
  /** index into the --collab-<n> palette */
  color: number
  page: number | null
}

/** guest: the person sharing and the page they are on, from the session's peers */
export function hostPlaceOf(
  peers: readonly CollabPeer[],
  presences: ReadonlyArray<{ clientId: number; value: unknown }>,
): HostPlace | null {
  const host = peers.find((peer) => peer.host && !peer.self)
  if (!host) return null
  const value = presences.find((entry) => entry.clientId === host.clientId)?.value
  return { name: host.name, color: host.color, page: presenceOf(value)?.page ?? null }
}
