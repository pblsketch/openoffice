import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatForProvider } from '../src/chat'
import { aiModelEffortOf, aiModelEffortsOf } from '../src/effort'
import { keyEffortBody, keyProviderEffort, takesKeyEffort } from '../src/key-effort'
import { streamForProvider } from '../src/stream'
import type { AiProviderConfig, AiProviderSelection } from '../src/types'
import { jsonResponse, okResponse, sseStream } from './test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
})

const TABLE = {
  'claude-opus-5-5': {
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'medium',
  },
  'deepseek-v4-pro': { efforts: ['low', 'high', 'max'], defaultEffort: 'high' },
  'grok-4.6': { efforts: ['low', 'medium', 'high', 'xhigh'] },
  'google/gemini-3.5-flash': { efforts: ['minimal', 'low', 'medium', 'high'] },
} as const

const config = (model: string, effort?: string): AiProviderConfig => ({
  apiKey: 'k',
  model,
  ...(effort ? { effort } : {}),
  modelEfforts: aiModelEffortsOf(TABLE),
})

describe('stored effort tables', () => {
  it('keep known levels, a default only when listed, and drop malformed entries', () => {
    expect(aiModelEffortOf({ efforts: ['max', 'low', 'ultra'], defaultEffort: 'low' })).toEqual({
      efforts: ['low', 'max'],
      defaultEffort: 'low',
    })
    expect(aiModelEffortOf({ efforts: ['low'], defaultEffort: 'high' })).toEqual({
      efforts: ['low'],
    })
    expect(aiModelEffortOf({ efforts: ['ultra'] })).toBeUndefined()
    expect(
      aiModelEffortsOf({ a: { efforts: ['high'] }, b: { efforts: 'high' }, ['x'.repeat(300)]: {} }),
    ).toEqual({ a: { efforts: ['high'] } })
    expect(aiModelEffortsOf([])).toBeUndefined()
  })
})

describe('the level a key provider is given', () => {
  it('is the configured one when the model is listed with it', () => {
    expect(keyProviderEffort('anthropic', config('claude-opus-5-5', 'xhigh'))).toBe('xhigh')
    expect(keyProviderEffort('deepseek', config('deepseek-v4-pro', 'max'))).toBe('max')
  })

  it('is nothing for a level the model is not listed with, an unlisted model or no level', () => {
    expect(keyProviderEffort('deepseek', config('deepseek-v4-pro', 'medium'))).toBeUndefined()
    expect(keyProviderEffort('anthropic', config('claude-haiku-4-5', 'low'))).toBeUndefined()
    expect(keyProviderEffort('anthropic', config('claude-opus-5-5'))).toBeUndefined()
    expect(keyProviderEffort('anthropic', config('claude-opus-5-5', '--x'))).toBeUndefined()
    // an inherited key is not a listed model
    expect(keyProviderEffort('anthropic', config('constructor', 'low'))).toBeUndefined()
  })

  it('is nothing for a provider whose list names no levels, whatever is stored', () => {
    for (const provider of ['openai', 'gemini', 'kimi', 'glm', 'mistral'] as const) {
      expect(takesKeyEffort(provider)).toBe(false)
      expect(keyProviderEffort(provider, config('claude-opus-5-5', 'high'))).toBeUndefined()
    }
  })

  it('goes where each vendor takes it, and only on its own protocol', () => {
    const body = (
      provider: AiProviderSelection,
      model: string,
      protocol: 'anthropic' | 'gemini' | 'openai-compatible',
    ) => keyEffortBody(provider, config(model, 'high'), protocol)
    expect(body('anthropic', 'claude-opus-5-5', 'anthropic')).toEqual({
      output_config: { effort: 'high' },
    })
    expect(body('openrouter', 'google/gemini-3.5-flash', 'openai-compatible')).toEqual({
      reasoning: { effort: 'high' },
    })
    expect(body('deepseek', 'deepseek-v4-pro', 'openai-compatible')).toEqual({
      reasoning_effort: 'high',
    })
    expect(body('xai', 'grok-4.6', 'openai-compatible')).toEqual({ reasoning_effort: 'high' })
    expect(body('anthropic', 'claude-opus-5-5', 'openai-compatible')).toBeUndefined()
    expect(body('deepseek', 'deepseek-v4-pro', 'gemini')).toBeUndefined()
  })
})

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>
}

const cb = () => ({
  signal: new AbortController().signal,
  onDelta: () => undefined,
  onToolCall: () => undefined,
})

describe('the level on the wire', () => {
  it('rides in output_config of an Anthropic turn and one-shot chat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(sseStream(['data: [DONE]'])))
    vi.stubGlobal('fetch', fetchMock)
    await streamForProvider(
      'anthropic',
      config('claude-opus-5-5', 'max'),
      'sys',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      cb(),
    ).catch(() => {})
    expect(sentBody(fetchMock).output_config).toEqual({ effort: 'max' })

    const chatMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'ok' }] }))
    vi.stubGlobal('fetch', chatMock)
    await chatForProvider('anthropic', config('claude-opus-5-5', 'low'), 'sys', 'hi')
    expect(sentBody(chatMock).output_config).toEqual({ effort: 'low' })
  })

  it('rides as reasoning_effort to DeepSeek, keyed by the listed id before the wire id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(sseStream(['data: [DONE]'])))
    vi.stubGlobal('fetch', fetchMock)
    await streamForProvider(
      'deepseek',
      config('deepseek-v4-pro', 'max'),
      'sys',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      cb(),
    ).catch(() => {})
    expect(sentBody(fetchMock).reasoning_effort).toBe('max')
  })

  it('rides as reasoning.effort to OpenRouter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(sseStream(['data: [DONE]'])))
    vi.stubGlobal('fetch', fetchMock)
    await streamForProvider(
      'openrouter',
      config('google/gemini-3.5-flash', 'minimal'),
      'sys',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      cb(),
    ).catch(() => {})
    expect(sentBody(fetchMock).reasoning).toEqual({ effort: 'minimal' })
  })

  it('is not sent for a model or level the table does not name', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(sseStream(['data: [DONE]'])))
    vi.stubGlobal('fetch', fetchMock)
    await streamForProvider(
      'anthropic',
      config('claude-haiku-4-5', 'high'),
      'sys',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      cb(),
    ).catch(() => {})
    await streamForProvider(
      'deepseek',
      config('deepseek-v4-pro', 'medium'),
      'sys',
      [{ role: 'user', text: 'hi' }],
      [],
      100,
      cb(),
    ).catch(() => {})
    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse(call[1].body as string) as Record<string, unknown>
      expect(body).not.toHaveProperty('output_config')
      expect(body).not.toHaveProperty('reasoning_effort')
      expect(body).not.toHaveProperty('reasoning')
    }
  })
})
