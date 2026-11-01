/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultAiSettings,
  type AiSettings,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider'
import { AiModelPicker, type AiModelPickerBridge } from '../src/AiModelPicker'

const statuses: AiSubscriptionStatuses = {
  'claude-code': {
    provider: 'claude-code',
    state: 'ready',
    meteredAccepted: false,
    models: [
      { id: 'opus', label: 'Opus 5.5', efforts: ['low', 'medium', 'high'] },
      { id: 'haiku', label: 'Haiku 4.5' },
    ],
  },
}

function stored(model: string, effort?: string): AiSettings {
  const settings = defaultAiSettings()
  settings.provider = 'claude-code'
  settings.providers['claude-code'] = { apiKey: '', model, ...(effort ? { effort } : {}) }
  return settings
}

describe('AiModelPicker effort row', () => {
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
  })

  async function render(initial: AiSettings) {
    let current = initial
    const written: AiSettings[] = []
    const bridge: AiModelPickerBridge = {
      getSettings: async () => current,
      setSettings: async (settings) => {
        written.push(settings)
        current = settings
      },
    }
    await act(async () => {
      root.render(
        createElement(AiModelPicker, { bridge, lang: 'en', subscriptionStatuses: statuses }),
      )
    })
    const chip = host.querySelector<HTMLButtonElement>('.ai-model-chip')!
    return { chip, written }
  }

  const options = () =>
    [...host.querySelectorAll<HTMLButtonElement>('.ai-effort-option')].map((button) => [
      button.textContent,
      button.getAttribute('aria-pressed'),
    ])

  it('lists the levels of the selected model, saves a pick and stays open', async () => {
    const { chip, written } = await render(stored('opus'))
    act(() => chip.click())
    expect(options()).toEqual([
      ['Default', 'true'],
      ['Low', 'false'],
      ['Medium', 'false'],
      ['High', 'false'],
    ])
    const high = [...host.querySelectorAll<HTMLButtonElement>('.ai-effort-option')][3]!
    await act(async () => high.click())
    expect(written.at(-1)?.providers['claude-code']).toMatchObject({
      model: 'opus',
      effort: 'high',
    })
    expect(host.querySelector('.ai-model-pop')).not.toBeNull()
    expect(options()[3]).toEqual(['High', 'true'])
    // the chip names the level beside the model
    expect(chip.textContent).toContain('High')
  })

  it('shows no row for a model the CLI lists without levels', async () => {
    const { chip } = await render(stored('haiku', 'high'))
    act(() => chip.click())
    expect(host.querySelector('.ai-effort')).toBeNull()
    expect(chip.textContent).not.toContain('High')
  })
})
