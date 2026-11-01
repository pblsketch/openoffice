import { afterEach, describe, expect, it, vi } from 'vitest'
import { sanitizeAiSettings } from '../src/ai-settings-guard'
import { resolveCustomEndpoints } from '../src/custom-endpoints'
import { inspectLocalModel } from '../src/local-models'
import { localModelProfileOf, mergeLocalModelProfile } from '../src/local-profile'
import { normalizeAiSettings } from '../src/legacy-settings'
import { streamForProvider } from '../src/stream'
import type { AiCustomEndpoint, AiSettings } from '../src/types'
import { okResponse, sseStream } from './test-utils'

/**
 * A local server's effort levels (decision 0096): Ollama's `/api/show` names
 * them, the model profile keeps them, the level is stored on the server entry,
 * and both reach the request through the `custom` slot.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

function showing(show: unknown) {
  const mock = vi.fn(async (url: string) =>
    url.endsWith('/api/show') ? json(show) : new Response('not found', { status: 404 }),
  )
  vi.stubGlobal('fetch', mock)
  return mock
}

const inspect = () =>
  inspectLocalModel({
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'gpt-oss:20b',
    server: 'ollama',
  })

describe('levels Ollama reports', () => {
  it('reads thinking.values and its default', async () => {
    showing({
      capabilities: ['completion', 'tools', 'thinking'],
      thinking: { values: ['low', 'medium', 'high'], default: 'medium' },
    })
    expect(await inspect()).toMatchObject({
      ok: true,
      profile: { efforts: ['low', 'medium', 'high'], defaultEffort: 'medium' },
    })
  })

  it('names no level for a model that only turns thinking on and off', async () => {
    showing({ capabilities: ['completion', 'thinking'], thinking: { values: [true, false] } })
    const result = await inspect()
    expect(result.ok && result.profile.efforts).toBeUndefined()
  })

  it('reads an explicit list without "thinking" as no level at all', async () => {
    showing({ capabilities: ['completion', 'tools'] })
    expect(await inspect()).toMatchObject({ ok: true, profile: { efforts: [] } })
  })
})

describe('levels in a model profile', () => {
  it('keep known ones, and the newer report replaces the older', () => {
    expect(
      localModelProfileOf({ efforts: ['high', 'ultra', 'low'], defaultEffort: 'ultra' }),
    ).toEqual({ efforts: ['low', 'high'] })
    const merged = mergeLocalModelProfile(
      { efforts: ['low', 'high'], defaultEffort: 'low', tools: true, toolsSource: 'user' },
      { efforts: ['medium'] },
    )
    expect(merged).toMatchObject({ efforts: ['medium'], tools: true })
    expect(merged).not.toHaveProperty('defaultEffort')
    // a check that says nothing about levels keeps the old ones
    expect(mergeLocalModelProfile({ efforts: ['low'] }, { tools: true })).toMatchObject({
      efforts: ['low'],
    })
  })
})

function localSettings(effort?: string): AiSettings {
  const endpoint: AiCustomEndpoint = {
    id: 'ollama-1',
    name: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: '',
    model: 'gpt-oss:20b',
    kind: 'local',
    modelProfiles: {
      'gpt-oss:20b': { efforts: ['low', 'medium', 'high'], checkedAt: 1 },
      'qwen3:8b': { tools: true },
    },
    ...(effort ? { effort } : {}),
  }
  return {
    provider: 'custom',
    providers: { custom: { apiKey: '', model: '', baseUrl: '' } } as AiSettings['providers'],
    customEndpoints: [endpoint],
    customEndpoint: 'ollama-1',
  }
}

describe('the level of a local server', () => {
  it('is mirrored into the custom slot with what the active model takes', () => {
    expect(resolveCustomEndpoints(localSettings('high')).providers.custom).toEqual({
      apiKey: '',
      model: 'gpt-oss:20b',
      baseUrl: 'http://127.0.0.1:11434/v1',
      effort: 'high',
      modelEfforts: { 'gpt-oss:20b': { efforts: ['low', 'medium', 'high'] } },
    })
  })

  it('survives the settings guard on the server entry, and an unknown one does not', () => {
    const kept = sanitizeAiSettings(localSettings('medium'))!
    expect(kept.customEndpoints?.[0]?.effort).toBe('medium')
    expect(kept.customEndpoints?.[0]?.modelProfiles?.['gpt-oss:20b']?.efforts).toEqual([
      'low',
      'medium',
      'high',
    ])
    expect(sanitizeAiSettings(localSettings('--x'))!.customEndpoints?.[0]).not.toHaveProperty(
      'effort',
    )
  })

  it('reaches the request as reasoning_effort', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(sseStream(['data: [DONE]'])))
    vi.stubGlobal('fetch', fetchMock)
    const settings = normalizeAiSettings(sanitizeAiSettings(localSettings('low'))!)
    await streamForProvider(
      'custom',
      settings.providers.custom,
      'sys',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      {
        signal: new AbortController().signal,
        onDelta: () => undefined,
        onToolCall: () => undefined,
      },
    ).catch(() => {})
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>
    expect(body.reasoning_effort).toBe('low')
  })
})
