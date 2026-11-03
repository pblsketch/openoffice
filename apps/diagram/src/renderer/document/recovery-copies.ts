/**
 * Crash-recovery copies of the open diagram (decision 0061), as in the mind
 * map editor: while the diagram has unsaved changes, about every 30 seconds
 * the bytes a save would write now go to the main process, which keeps them
 * in the app data folder. A copy is made only when the diagram changed since
 * the last copy that landed. It never touches the file or the unsaved mark.
 *
 * - A copy that fails skips the next ticks, then tries again.
 * - A copy made while a save ran is dropped: its bytes may be what the save
 *   just wrote, and a copy of them would outlive it.
 */
import type { RecoveryCopyResult } from '../../shared/ipc'

export const RECOVERY_COPY_TIMING = {
  intervalMs: 30_000,
  backoffTicks: 10,
}

export interface DiagramCopierHost {
  dirty(): boolean
  /** bumped by every change of the diagram */
  revision(): number
  saving(): boolean
  /** what a save would write now */
  bytes(): Promise<Uint8Array>
  write(bytes: Uint8Array): Promise<RecoveryCopyResult>
}

export type CopyOutcome =
  'written' | 'clean' | 'unchanged' | 'busy' | 'backoff' | 'dropped' | 'failed'

export class DiagramCopier {
  readonly #host: DiagramCopierHost
  #copied = -1
  #backoff = 0
  #saves = 0
  #running: Promise<CopyOutcome> | null = null

  constructor(host: DiagramCopierHost) {
    this.#host = host
  }

  noteSave(): void {
    this.#saves++
  }

  /** the main process dropped the last copy and the tab stayed open */
  reset(): void {
    this.#copied = -1
  }

  tick(): Promise<CopyOutcome> {
    if (this.#backoff > 0) {
      this.#backoff--
      return Promise.resolve('backoff')
    }
    return this.#attempt()
  }

  /** the OS is ending the session: a copy now, after any copy under way */
  async writeNow(): Promise<CopyOutcome> {
    if (this.#running) await this.#running
    return this.#attempt()
  }

  #attempt(): Promise<CopyOutcome> {
    if (this.#running || this.#host.saving()) return Promise.resolve('busy')
    if (!this.#host.dirty()) return Promise.resolve('clean')
    const revision = this.#host.revision()
    if (revision === this.#copied) return Promise.resolve('unchanged')
    const running = this.#write(revision)
    this.#running = running
    void running.finally(() => {
      if (this.#running === running) this.#running = null
    })
    return running
  }

  async #write(revision: number): Promise<CopyOutcome> {
    const saves = this.#saves
    try {
      const bytes = await this.#host.bytes()
      if (saves !== this.#saves || this.#host.saving()) return 'dropped'
      const result = await this.#host.write(bytes)
      if (result === 'written') this.#copied = revision
      return result === 'written' ? 'written' : 'dropped'
    } catch (err) {
      console.warn('[diagram] the recovery copy failed:', err)
      this.#backoff = RECOVERY_COPY_TIMING.backoffTicks
      return 'failed'
    }
  }
}
