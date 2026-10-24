// @vitest-environment node
/**
 * The renderer's copy loop: about every 30 s the text a save would write goes
 * to the main process while there are unsaved changes; a failed write backs
 * off a few ticks and then tries again; a flush request is always answered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RECOVERY_COPY_BACKOFF_TICKS,
  RECOVERY_COPY_INTERVAL_MS,
  startRecoveryCopies,
} from '../src/renderer/recovery-copy'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startRecoveryCopies', () => {
  it('sends the current text every interval while there is something to keep', async () => {
    let text: string | null = null
    const write = vi.fn(async () => 'written')
    const stop = startRecoveryCopies({ read: () => text, write })

    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS)
    expect(write).not.toHaveBeenCalled()

    text = '# edited'
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS)
    expect(write).toHaveBeenCalledWith('# edited')

    stop()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS * 3)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('backs off after a failed write, then tries again', async () => {
    const write = vi.fn(async () => {
      throw new Error('disk full')
    })
    const stop = startRecoveryCopies({ read: () => 'text', write })

    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS)
    expect(write).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS * RECOVERY_COPY_BACKOFF_TICKS)
    expect(write).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS)
    expect(write).toHaveBeenCalledTimes(2)
    stop()
  })

  it('answers a flush request at once, with null when nothing is unsaved', async () => {
    const flush: { current: (() => void) | null } = { current: null }
    let text: string | null = null
    const write = vi.fn(async () => 'written')
    const stop = startRecoveryCopies({
      read: () => text,
      write,
      onFlushRequest: (handler) => {
        flush.current = handler
        return () => {
          flush.current = null
        }
      },
    })

    flush.current?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(write).toHaveBeenLastCalledWith(null)

    text = 'unsaved'
    flush.current?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(write).toHaveBeenLastCalledWith('unsaved')

    stop()
    expect(flush.current).toBeNull()
  })
})
