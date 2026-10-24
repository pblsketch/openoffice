/**
 * Crash-recovery copies of the open map (spec "work is not lost", 1).
 *
 * While the map has unsaved changes, about every 30 seconds the bytes a save
 * would write now (`DocumentSession.recoveryBytes`) go to the main process,
 * which keeps them in the app data folder. A copy is made only when the map
 * changed since the last copy that landed. It is independent of the AutoSave
 * switch, and it never touches the file, the unsaved mark or what a later
 * save compares with.
 *
 * - A title being typed is not closed for a copy: that tick is skipped, the
 *   same rule as the 30-second AutoSave (`commitEdit` belongs to saves and
 *   reads). A copy asked for because the OS is ending the session
 *   (`writeNow`) takes the typed title in, as a save would.
 * - A big map is copied only once the user stopped typing for a moment, so a
 *   copy never cuts into typing.
 * - A copy that fails skips the next ticks and tries again; copies are never
 *   switched off.
 * - A copy made while a save ran is dropped: its bytes may be what the save
 *   just wrote, and a copy of them would outlive it.
 */
import { useEffect, useRef, useState } from 'react'
import type { RecoveryCopyResult } from '../../shared/ipc'
import type { DocumentSession } from './session'

/** Tunable timing (spec "tunable values"); tests shorten it. */
export const RECOVERY_COPY_TIMING = {
  /** between two copy ticks */
  intervalMs: 30_000,
  /** how long the user must have stopped typing before a big map is copied */
  idleMs: 2_000,
  /** ticks skipped after a copy failed (the slides editor's autosave backoff) */
  backoffTicks: 10,
  /** from this many topics on, a map counts as big */
  bigMapTopics: 300,
}

export type RecoveryCopyTiming = typeof RECOVERY_COPY_TIMING

/** A sheet on screen, as far as copies care. */
export interface CopiedSheet {
  /** a title is being typed in an edit box */
  readonly editingText: boolean
  /** an input method is composing in that box */
  readonly composing: boolean
}

export interface RecoveryCopierHost {
  session(): DocumentSession | null
  sheets(): readonly CopiedSheet[]
  /** bring the tree in line with the screen; `commit` also takes a title being typed */
  flush(commit: boolean): void
  /** a save is running */
  saving(): boolean
  write(bytes: Uint8Array): Promise<RecoveryCopyResult>
}

export type RecoveryCopyOutcome =
  | 'written'
  | 'clean'
  | 'unchanged'
  | 'typing'
  | 'waiting'
  | 'busy'
  | 'backoff'
  | 'dropped'
  | 'failed'

export class RecoveryCopier {
  readonly #host: RecoveryCopierHost
  readonly #timing: RecoveryCopyTiming
  readonly #now: () => number
  /** bumped on every change of the tree */
  #revision = 0
  /** the revision the last copy that landed holds; -1 for none */
  #copied = -1
  #backoff = 0
  /** bumped whenever a save starts */
  #saves = 0
  #lastInput = Number.NEGATIVE_INFINITY
  #running: Promise<RecoveryCopyOutcome> | null = null
  #retry: ReturnType<typeof setTimeout> | null = null
  #stopped = false

  constructor(
    host: RecoveryCopierHost,
    timing: RecoveryCopyTiming = RECOVERY_COPY_TIMING,
    now: () => number = () => performance.now(),
  ) {
    this.#host = host
    this.#timing = timing
    this.#now = now
  }

  /** the tree changed */
  noteChange(): void {
    this.#revision++
  }

  /** the user typed, clicked or scrolled */
  noteInput(): void {
    this.#lastInput = this.#now()
  }

  /** a save starts */
  noteSave(): void {
    this.#saves++
  }

  /** the timer's tick */
  tick(): Promise<RecoveryCopyOutcome> {
    if (this.#stopped) return Promise.resolve('clean')
    if (this.#backoff > 0) {
      this.#backoff--
      return Promise.resolve('backoff')
    }
    return this.#attempt(false)
  }

  /** the OS is ending the session: a copy now, typed title included, after any copy under way */
  async writeNow(): Promise<RecoveryCopyOutcome> {
    if (this.#running) await this.#running
    return this.#attempt(true)
  }

  /** the main process dropped the last copy and the tab stayed open: the next tick copies again */
  reset(): void {
    this.#copied = -1
  }

  stop(): void {
    this.#stopped = true
    if (this.#retry) clearTimeout(this.#retry)
    this.#retry = null
  }

  #attempt(urgent: boolean): Promise<RecoveryCopyOutcome> {
    const session = this.#host.session()
    if (!session) return Promise.resolve('clean')
    if (this.#running || this.#host.saving()) return Promise.resolve('busy')
    if (!urgent) {
      // The timer never closes a title being typed or cuts into an input method; a later tick takes it.
      if (this.#host.sheets().some((sheet) => sheet.editingText || sheet.composing)) {
        return Promise.resolve('typing')
      }
      const quiet = this.#now() - this.#lastInput
      if (quiet < this.#timing.idleMs && this.#isBig(session)) {
        this.#retryIn(this.#timing.idleMs - quiet)
        return Promise.resolve('waiting')
      }
      // an edit the screen has not handed over yet arrives by itself; the next tick copies it
      if (!session.dirty) return Promise.resolve('clean')
    }
    this.#host.flush(urgent)
    if (!session.dirty) return Promise.resolve('clean')
    const revision = this.#revision
    if (revision === this.#copied) return Promise.resolve('unchanged')
    const running = this.#write(session, revision)
    this.#running = running
    void running.finally(() => {
      if (this.#running === running) this.#running = null
    })
    return running
  }

  async #write(session: DocumentSession, revision: number): Promise<RecoveryCopyOutcome> {
    const saves = this.#saves
    try {
      const bytes = await session.recoveryBytes()
      if (this.#saves !== saves || this.#stopped) return 'dropped'
      const result = await this.#host.write(bytes)
      if (result !== 'written') return 'dropped'
      this.#copied = revision
      return 'written'
    } catch (err) {
      console.warn('[mindmap] the recovery copy could not be written:', err)
      this.#backoff = this.#timing.backoffTicks
      return 'failed'
    }
  }

  #isBig(session: DocumentSession): boolean {
    return session.topicIds().size >= this.#timing.bigMapTopics
  }

  /** one more try once the user has been quiet long enough (one pending at most) */
  #retryIn(ms: number): void {
    if (this.#retry || this.#stopped) return
    this.#retry = setTimeout(() => {
      this.#retry = null
      if (!this.#stopped && this.#backoff === 0) void this.#attempt(false)
    }, ms)
  }
}

export interface RecoveryCopiesOptions {
  /** the map opened and is shown */
  ready: boolean
  session: DocumentSession | null
  sheets(): readonly CopiedSheet[]
  flush(commit: boolean): void
  saving(): boolean
}

/**
 * Writes the open map's recovery copies for the editor screen. Returns the
 * copier so a save can tell it that it started (`noteSave`).
 */
export function useRecoveryCopies(options: RecoveryCopiesOptions): RecoveryCopier {
  const latest = useRef(options)
  latest.current = options
  const [current] = useState(
    () =>
      new RecoveryCopier({
        session: () => latest.current.session,
        sheets: () => latest.current.sheets(),
        flush: (commit) => latest.current.flush(commit),
        saving: () => latest.current.saving(),
        write: async (bytes) => {
          const session = latest.current.session
          const name = session ? rootTitle(session) : undefined
          return window.mindmapApi.writeRecoveryCopy({ bytes, name })
        },
      }),
  )
  const { ready, session } = options

  // every change of the tree is a reason for a new copy
  useEffect(() => {
    if (!session) return
    current.noteChange()
    return session.subscribe(() => current.noteChange())
  }, [session, current])

  // what counts as the user working: keys, the pointer, the wheel, text input
  useEffect(() => {
    const note = (): void => current.noteInput()
    const events = ['keydown', 'pointerdown', 'wheel', 'input', 'compositionupdate'] as const
    for (const event of events) window.addEventListener(event, note, true)
    return () => {
      for (const event of events) window.removeEventListener(event, note, true)
    }
  }, [current])

  useEffect(() => {
    if (!ready) return
    const id = window.setInterval(() => void current.tick(), RECOVERY_COPY_TIMING.intervalMs)
    const off = window.mindmapApi.onRecoveryCopyNow?.(() => {
      void current.writeNow().finally(() => window.mindmapApi.sendRecoveryCopyNowDone())
    })
    const offReset = window.mindmapApi.onRecoveryReset?.(() => current.reset())
    return () => {
      window.clearInterval(id)
      off?.()
      offReset?.()
    }
  }, [ready, current])

  useEffect(() => () => current.stop(), [current])

  return current
}

/** the first sheet's central topic, offered as the name of an untitled map's copy */
function rootTitle(session: DocumentSession): string | undefined {
  const first = session.tabs()[0]
  const title = first ? session.view(first.key).root.title.trim() : ''
  return title || undefined
}
