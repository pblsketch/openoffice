/**
 * When the PDF editor writes its recovery copy (recovery spec 1): every ~30s
 * while there are unsaved changes that changed since the last copy, only
 * after input pauses (~2s) and never while a save is writing; a failure skips
 * a few rounds and then tries again.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RECOVERY_COPY_BACKOFF_TICKS,
  RECOVERY_COPY_IDLE_MS,
  RECOVERY_COPY_INTERVAL_MS,
  createRecoveryCopyScheduler,
  type RecoveryCopyWrite,
} from '../src/renderer/recovery/copy-scheduler'
import { useRecoveryCopies } from '../src/renderer/recovery/useRecoveryCopies'
import type { SavePdfRequest } from '../src/shared/ipc'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function host(overrides: { wanted?: () => boolean; busy?: () => boolean } = {}) {
  const results: RecoveryCopyWrite[] = []
  const write = vi.fn(async (): Promise<RecoveryCopyWrite> => results.shift() ?? 'written')
  return {
    results,
    write,
    host: {
      wanted: overrides.wanted ?? (() => true),
      busy: overrides.busy ?? (() => false),
      write,
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the copy schedule', () => {
  it('writes once the round comes, the document is dirty and input has paused', async () => {
    const { host: h, write } = host()
    const scheduler = createRecoveryCopyScheduler(h)
    scheduler.start()
    scheduler.bump()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS)
    expect(write).toHaveBeenCalledTimes(1)
    // nothing changed since: the next round writes nothing
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS)
    expect(write).toHaveBeenCalledTimes(1)
    scheduler.bump()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS)
    expect(write).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('writes nothing without unsaved changes', async () => {
    const { host: h, write } = host({ wanted: () => false })
    const scheduler = createRecoveryCopyScheduler(h)
    scheduler.start()
    scheduler.bump()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS * 3)
    expect(write).not.toHaveBeenCalled()
    scheduler.stop()
  })

  it('waits while the user keeps typing, then writes after the pause', async () => {
    const { host: h, write } = host()
    const scheduler = createRecoveryCopyScheduler(h)
    scheduler.start()
    scheduler.bump()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS - 500)
    // typing straight through the round
    for (let i = 0; i < 10; i++) {
      scheduler.noteInput()
      await vi.advanceTimersByTimeAsync(500)
    }
    expect(write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_IDLE_MS + 1000)
    expect(write).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })

  it('does not write while a save is writing, and writes once it is done', async () => {
    let busy = true
    const { host: h, write } = host({ busy: () => busy })
    const scheduler = createRecoveryCopyScheduler(h)
    scheduler.start()
    scheduler.bump()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS + 5000)
    expect(write).not.toHaveBeenCalled()
    busy = false
    await vi.advanceTimersByTimeAsync(1000)
    expect(write).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })

  it('skips rounds after a failure, then tries again', async () => {
    const { host: h, write, results } = host()
    results.push('failed')
    const scheduler = createRecoveryCopyScheduler(h)
    scheduler.start()
    scheduler.bump()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS)
    expect(write).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS * RECOVERY_COPY_BACKOFF_TICKS)
    expect(write).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS)
    expect(write).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('writes again after a save deleted the copy while the edits stayed', async () => {
    const { host: h, write } = host()
    const scheduler = createRecoveryCopyScheduler(h)
    scheduler.start()
    scheduler.bump()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS)
    scheduler.invalidate()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS)
    expect(write).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('flushes at once when the session ends, typing or not', async () => {
    const { host: h, write } = host()
    const scheduler = createRecoveryCopyScheduler(h)
    scheduler.start()
    scheduler.bump()
    scheduler.noteInput()
    await scheduler.flushNow()
    expect(write).toHaveBeenCalledTimes(1)
    await scheduler.flushNow()
    expect(write).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })
})

describe('useRecoveryCopies', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
  })

  function mount(
    options: Parameters<typeof useRecoveryCopies>[0],
    api: Parameters<typeof useRecoveryCopies>[1],
  ) {
    let scheduler: ReturnType<typeof useRecoveryCopies> | null = null
    function Probe() {
      scheduler = useRecoveryCopies(options, api)
      return null
    }
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => root!.render(createElement(Probe)))
    return () => scheduler!
  }

  const request = (): SavePdfRequest => ({
    path: '/docs/a.pdf',
    markups: [],
    drawings: [],
    formValues: [],
    stamps: [],
  })

  it('sends the edits as a copy request, and keyboard input delays it', async () => {
    const writeRecoveryCopy = vi.fn(async () => 'written' as const)
    const scheduler = mount(
      { wanted: () => true, busy: () => false, request },
      { writeRecoveryCopy },
    )
    scheduler().bump()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS - 100)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await vi.advanceTimersByTimeAsync(500)
    expect(writeRecoveryCopy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_IDLE_MS + 1000)
    expect(writeRecoveryCopy).toHaveBeenCalledWith(request())
  })

  it('answers the session-end flush request after writing', async () => {
    let flush: (() => void) | null = null
    const writeRecoveryCopy = vi.fn(async () => 'written' as const)
    const sendRecoveryFlushDone = vi.fn()
    const scheduler = mount(
      { wanted: () => true, busy: () => false, request },
      {
        writeRecoveryCopy,
        sendRecoveryFlushDone,
        onRecoveryFlushRequest: (handler) => {
          flush = handler
          return () => {
            flush = null
          }
        },
      },
    )
    scheduler().bump()
    flush!()
    await vi.advanceTimersByTimeAsync(0)
    expect(writeRecoveryCopy).toHaveBeenCalledTimes(1)
    expect(sendRecoveryFlushDone).toHaveBeenCalledTimes(1)
  })

  /** a mounted hook whose copy was written, then dropped by "Don't Save" */
  async function droppedAfterCopy() {
    let dropped: ((value: boolean) => void) | null = null
    const writeRecoveryCopy = vi.fn(async () => 'written' as const)
    const resumeRecoveryCopies = vi.fn(async () => {})
    const scheduler = mount(
      { wanted: () => true, busy: () => false, request },
      {
        writeRecoveryCopy,
        resumeRecoveryCopies,
        onRecoveryDropped: (handler) => {
          dropped = handler
          return () => {
            dropped = null
          }
        },
      },
    )
    scheduler().bump()
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS + RECOVERY_COPY_IDLE_MS)
    expect(writeRecoveryCopy).toHaveBeenCalledTimes(1)
    dropped!(true)
    return { drop: (value: boolean) => dropped!(value), writeRecoveryCopy, resumeRecoveryCopies }
  }

  it('after a cancelled close, the next edit input resumes copies and rewrites the copy', async () => {
    const { writeRecoveryCopy, resumeRecoveryCopies } = await droppedAfterCopy()
    // no input: nothing to resume, and the dropped copy is not rewritten
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS * 2)
    expect(resumeRecoveryCopies).not.toHaveBeenCalled()
    expect(writeRecoveryCopy).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(resumeRecoveryCopies).toHaveBeenCalledTimes(1)
    // the same edits are copied again although nothing changed since the dropped copy
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS + RECOVERY_COPY_IDLE_MS)
    expect(writeRecoveryCopy).toHaveBeenCalledTimes(2)
  })

  it('the shell reporting the cancelled close resumes copies without input', async () => {
    const { drop, writeRecoveryCopy, resumeRecoveryCopies } = await droppedAfterCopy()
    drop(false)
    await vi.advanceTimersByTimeAsync(RECOVERY_COPY_INTERVAL_MS + RECOVERY_COPY_IDLE_MS)
    expect(writeRecoveryCopy).toHaveBeenCalledTimes(2)
    // main already resumed: a later keystroke asks nothing more
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(resumeRecoveryCopies).not.toHaveBeenCalled()
  })
})
