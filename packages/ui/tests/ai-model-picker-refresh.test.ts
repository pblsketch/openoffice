/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import {
  AI_MODEL_PICKER_REFRESH_MS,
  AiModelPicker,
  type AiModelPickerBridge,
} from '../src/AiModelPicker'

const bridge: AiModelPickerBridge = {
  getSettings: async () => defaultAiSettings(),
  setSettings: async () => undefined,
}

describe('AiModelPicker model refresh', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function render(refresh: () => void): Promise<HTMLButtonElement> {
    await act(async () => {
      root.render(
        createElement(AiModelPicker, {
          bridge,
          lang: 'en',
          subscriptionStatuses: {},
          onRefreshSubscriptions: refresh,
        }),
      )
    })
    const chip = host.querySelector<HTMLButtonElement>('.ai-model-chip')
    expect(chip).not.toBeNull()
    return chip!
  }

  it('asks for a fresh check when the list opens, and not again on every reopen', async () => {
    const refresh = vi.fn()
    const chip = await render(refresh)

    act(() => chip.click())
    expect(refresh).toHaveBeenCalledTimes(1)

    // close, then reopen before the interval is over
    act(() => chip.click())
    act(() => chip.click())
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('asks again once the interval has passed', async () => {
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const refresh = vi.fn()
    const chip = await render(refresh)

    act(() => chip.click())
    expect(refresh).toHaveBeenCalledTimes(1)

    vi.mocked(Date.now).mockReturnValue(now + AI_MODEL_PICKER_REFRESH_MS)
    act(() => chip.click())
    act(() => chip.click())
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('opens without asking when no refresh is wired', async () => {
    await act(async () => {
      root.render(createElement(AiModelPicker, { bridge, lang: 'en', subscriptionStatuses: {} }))
    })
    const chip = host.querySelector<HTMLButtonElement>('.ai-model-chip')!
    act(() => chip.click())
    expect(host.querySelector('.ai-model-pop')).not.toBeNull()
  })
})
