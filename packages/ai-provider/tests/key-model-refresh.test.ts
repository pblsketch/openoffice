import { describe, expect, it, vi } from 'vitest'
import {
  createKeyModelRefresher,
  withKeyProviderModels,
  withStoredKeyModels,
} from '../src/key-model-refresh'
import { defaultAiSettings } from '../src/providers'
import type { AiProviderId, AiSettings } from '../src/types'

/**
 * When the main process lists a key provider's models and what reaches the
 * settings file (decision 0087): once per run, again on a changed key, never
 * for a provider without one, and a list the renderer sends is never written.
 */

function settingsWith(keys: Partial<Record<AiProviderId, string>>): AiSettings {
  return defaultAiSettings(keys)
}

/** an in-memory settings file with the refresher's read/write */
function store(initial: AiSettings) {
  let file = initial
  const writes: AiSettings[] = []
  return {
    get file() {
      return file
    },
    set file(next: AiSettings) {
      file = next
    },
    writes,
    deps: {
      read: () => file,
      write: (update: (latest: AiSettings) => AiSettings) => {
        const next = update(file)
        if (next === file) return
        file = next
        writes.push(next)
      },
    },
  }
}

describe('createKeyModelRefresher', () => {
  it('lists each provider with a key once, and writes what it got', async () => {
    const s = store(settingsWith({ gemini: 'AIza-1', openai: 'sk-1' }))
    const list = vi.fn(async (provider: AiProviderId) =>
      provider === 'gemini' ? ['gemini-4-argon'] : ['gpt-5.7'],
    )
    const refresher = createKeyModelRefresher({ ...s.deps, list })

    refresher.refreshChanged()
    refresher.refreshChanged()
    await refresher.idle()

    expect(list.mock.calls.map((c) => c[0]).sort()).toEqual(['gemini', 'openai'])
    expect(s.file.providers.gemini.models).toEqual(['gemini-4-argon'])
    expect(s.file.providers.openai.models).toEqual(['gpt-5.7'])
    // a provider without a key is not contacted
    expect(s.file.providers.anthropic.models).toBeUndefined()
  })

  it('lists again when the key changes, and not when it does not', async () => {
    const s = store(settingsWith({ gemini: 'AIza-1' }))
    const list = vi.fn(async (_provider: AiProviderId, _config: { apiKey: string }) => [
      'gemini-4-argon',
    ])
    const refresher = createKeyModelRefresher({ ...s.deps, list })
    refresher.refreshChanged()
    await refresher.idle()

    s.file = withStoredKeyModels(
      { ...s.file, provider: 'gemini' }, // another field changed: no new listing
      s.file,
    )
    refresher.refreshChanged()
    await refresher.idle()
    expect(list).toHaveBeenCalledTimes(1)

    s.file = {
      ...s.file,
      providers: { ...s.file.providers, gemini: { ...s.file.providers.gemini, apiKey: 'AIza-2' } },
    }
    refresher.refreshChanged()
    await refresher.idle()
    expect(list).toHaveBeenCalledTimes(2)
    expect(list.mock.calls[1]![1]).toMatchObject({ apiKey: 'AIza-2' })
  })

  it('keeps the stored list when there is no answer', async () => {
    const s = store(withKeyProviderModels(settingsWith({ gemini: 'AIza-1' }), 'gemini', ['old']))
    const refresher = createKeyModelRefresher({ ...s.deps, list: async () => null })
    refresher.refreshChanged()
    await refresher.idle()
    expect(s.file.providers.gemini.models).toEqual(['old'])
    expect(s.writes).toHaveLength(0)
  })

  it('drops an answer for a key that was replaced while it was on its way', async () => {
    const s = store(settingsWith({ gemini: 'AIza-1' }))
    let answer!: (models: string[]) => void
    const list = vi.fn(() => new Promise<string[] | null>((resolve) => (answer = resolve)))
    const refresher = createKeyModelRefresher({ ...s.deps, list })
    refresher.refreshChanged()
    s.file = {
      ...s.file,
      providers: { ...s.file.providers, gemini: { ...s.file.providers.gemini, apiKey: 'AIza-2' } },
    }
    answer(['for-the-old-key'])
    await refresher.idle()
    expect(s.file.providers.gemini.models).toBeUndefined()
  })

  it('writes nothing when the list is unchanged', async () => {
    const s = store(withKeyProviderModels(settingsWith({ gemini: 'AIza-1' }), 'gemini', ['a', 'b']))
    const refresher = createKeyModelRefresher({ ...s.deps, list: async () => ['a', 'b'] })
    refresher.refreshChanged()
    await refresher.idle()
    expect(s.writes).toHaveLength(0)
  })

  it('survives a settings file it cannot read', () => {
    const list = vi.fn()
    const refresher = createKeyModelRefresher({
      read: () => {
        throw new Error('EBUSY')
      },
      write: () => undefined,
      list,
    })
    expect(() => refresher.refreshChanged()).not.toThrow()
    expect(list).not.toHaveBeenCalled()
  })
})

describe('withStoredKeyModels', () => {
  it("takes every provider's list from the file, whatever the renderer sent", () => {
    const stored = withKeyProviderModels(settingsWith({ gemini: 'k' }), 'gemini', [
      'gemini-4-argon',
    ])
    const sent = withKeyProviderModels(settingsWith({ gemini: 'k' }), 'openai', ['planted'])
    const next = withStoredKeyModels(sent, stored)
    expect(next.providers.gemini.models).toEqual(['gemini-4-argon'])
    expect(next.providers.openai.models).toBeUndefined()
  })
})
