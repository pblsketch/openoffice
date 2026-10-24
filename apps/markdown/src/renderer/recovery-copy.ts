/**
 * The renderer half of crash-recovery copies (same file in the Markdown and
 * HTML editors). About every 30 s, while the document has unsaved changes,
 * the text a save would write is handed to the main process, which keeps it
 * as the document's recovery copy (and skips a text it already has). This
 * runs whether or not AutoSave is on. A failed write skips the next few
 * ticks, then tries again; copies are never switched off for good.
 */

/** time between copy attempts */
export const RECOVERY_COPY_INTERVAL_MS = 30_000
/** ticks skipped after a failed write (as slides' autosave backoff) */
export const RECOVERY_COPY_BACKOFF_TICKS = 10

export interface RecoveryCopyLoopOptions {
  /**
   * The exact text a save would write now, or null when there is nothing to
   * keep (still loading, no unsaved changes, a save in flight).
   */
  read: () => string | null
  /** hand the text to the main process; rejects when the copy could not be written */
  write: (text: string | null) => Promise<unknown>
  /** the main process asks for a copy now (the OS is ending the session) */
  onFlushRequest?: (handler: () => void) => () => void
  intervalMs?: number
  backoffTicks?: number
}

/** start the copy loop; the returned function stops it */
export function startRecoveryCopies(options: RecoveryCopyLoopOptions): () => void {
  const backoffTicks = options.backoffTicks ?? RECOVERY_COPY_BACKOFF_TICKS
  let skip = 0
  let busy = false
  let stopped = false

  const run = async (flush: boolean): Promise<void> => {
    // an in-flight write answers a flush request too
    if (busy || stopped) return
    if (!flush && skip > 0) {
      skip -= 1
      return
    }
    let text: string | null
    try {
      text = options.read()
    } catch (error) {
      console.warn('[recovery] could not serialize the document:', error)
      text = null
    }
    // a flush is always answered, so the main process does not wait it out
    if (text === null && !flush) return
    busy = true
    try {
      await options.write(text)
      skip = 0
    } catch (error) {
      console.warn('[recovery] copy not written, retrying later:', error)
      skip = backoffTicks
    } finally {
      busy = false
    }
  }

  const timer = setInterval(() => void run(false), options.intervalMs ?? RECOVERY_COPY_INTERVAL_MS)
  const offFlush = options.onFlushRequest?.(() => void run(true))
  return () => {
    stopped = true
    clearInterval(timer)
    offFlush?.()
  }
}
