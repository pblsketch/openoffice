import { describe, expect, it } from 'vitest'
import { abortOnDestroyed } from '../src/abort-on-destroyed'

type Navigate = (...args: unknown[]) => void

interface FakeSender {
  isDestroyed(): boolean
  once(event: 'destroyed', listener: () => void): unknown
  removeListener(event: string, listener: Navigate): void
  on(event: string, listener: Navigate): void
  destroy(): void
  listenerCount(): number
  navigate(...args: unknown[]): void
  navigationCount(): number
}

function fakeSender(destroyed = false): FakeSender {
  const listeners = new Set<() => void>()
  const navigations = new Set<Navigate>()
  const sender: FakeSender = {
    isDestroyed: () => destroyed,
    once: (_e, l) => {
      listeners.add(l)
    },
    removeListener: (e, l) => {
      if (e === 'destroyed') listeners.delete(l as () => void)
      else navigations.delete(l)
    },
    on: (_e, l) => {
      navigations.add(l)
    },
    destroy() {
      destroyed = true
      for (const l of [...listeners]) {
        listeners.delete(l)
        l()
      }
    },
    navigate(...args) {
      for (const l of [...navigations]) l(...args)
    },
    listenerCount: () => listeners.size,
    navigationCount: () => navigations.size,
  }
  return sender
}

describe('abortOnDestroyed', () => {
  it('aborts the controller when the sender is destroyed mid-stream', () => {
    const sender = fakeSender()
    const controller = new AbortController()
    abortOnDestroyed(sender, controller)
    expect(controller.signal.aborted).toBe(false)
    sender.destroy()
    expect(controller.signal.aborted).toBe(true)
  })

  it('aborts when the page reloads under a running stream', () => {
    const sender = fakeSender()
    const controller = new AbortController()
    abortOnDestroyed(sender, controller)
    sender.navigate({}, { isMainFrame: true, isSameDocument: false })
    expect(controller.signal.aborted).toBe(true)
  })

  it('keeps the stream through an in-page jump or a subframe load', () => {
    const sender = fakeSender()
    const controller = new AbortController()
    abortOnDestroyed(sender, controller)
    sender.navigate({}, { isMainFrame: true, isSameDocument: true })
    sender.navigate({}, { isMainFrame: false, isSameDocument: false })
    sender.navigate({}, 'https://example.test/#a', true, true)
    expect(controller.signal.aborted).toBe(false)
    // the older signature's main-frame document load still counts as a reload
    sender.navigate({}, 'https://example.test/', false, true)
    expect(controller.signal.aborted).toBe(true)
  })

  it('removes both listeners when the stream settles first', () => {
    const sender = fakeSender()
    const controller = new AbortController()
    const dispose = abortOnDestroyed(sender, controller)
    expect(sender.listenerCount()).toBe(1)
    expect(sender.navigationCount()).toBe(1)
    dispose()
    expect(sender.listenerCount()).toBe(0)
    expect(sender.navigationCount()).toBe(0)
    sender.destroy()
    sender.navigate({}, { isMainFrame: true, isSameDocument: false })
    expect(controller.signal.aborted).toBe(false)
  })

  it('aborts immediately for an already-destroyed sender', () => {
    const controller = new AbortController()
    abortOnDestroyed(fakeSender(true), controller)
    expect(controller.signal.aborted).toBe(true)
  })
})
