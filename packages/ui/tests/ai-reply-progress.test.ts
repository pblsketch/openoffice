/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiReplyProgress } from '../src/AiTypingIndicator'

type Reply = { streaming?: boolean; tools?: readonly unknown[] }

describe('AiReplyProgress', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const show = (reply: Reply) =>
    act(() =>
      root.render(
        createElement(AiReplyProgress, { reply, thinking: 'Thinking', working: 'Working' }),
      ),
    )
  const status = () => host.querySelector('[role="status"]')

  it('says thinking while the reply streams with no step yet', () => {
    show({ streaming: true })
    expect(status()?.getAttribute('aria-label')).toBe('Thinking')
  })

  it('says working once the reply has a step', () => {
    show({ streaming: true, tools: [{ name: 'apply_ops' }] })
    expect(status()?.getAttribute('aria-label')).toBe('Working')
  })

  it('is gone once the reply stops streaming', () => {
    show({ streaming: false, tools: [{ name: 'apply_ops' }] })
    expect(status()).toBeNull()
    show({})
    expect(status()).toBeNull()
  })

  it('keeps counting when the reply moves from thinking to working', () => {
    show({ streaming: true })
    act(() => vi.advanceTimersByTime(5000))
    expect(status()?.textContent).toBe('Thinking… · 5s')

    show({ streaming: true, tools: [{ name: 'apply_ops' }] })
    act(() => vi.advanceTimersByTime(1000))
    expect(status()?.textContent).toBe('Working… · 6s')
  })
})
