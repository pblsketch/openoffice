import { describe, expect, it, vi } from 'vitest'
import {
  createKeyModelRefresher,
  withKeyProviderModels,
  withStoredKeyModels,
} from '../src/key-model-refresh'
import { listKeyProviderModelListing, listKeyProviderModels } from '../src/key-models'
import { defaultAiSettings } from '../src/providers'
import type { AiSettings } from '../src/types'

/**
 * The effort levels a key provider's own model list names (decision 0096):
 * read from the same answer as the ids, in each vendor's shape, kept only for
 * the vendors this app hands a level to, and stored beside `models`.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function fetchSequence(...responses: Response[]) {
  const mock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = responses.shift()
    if (!next) throw new Error('unexpected request')
    return next
  })
  return mock as unknown as typeof fetch & typeof mock
}

const leaf = (supported: boolean) => ({ supported })

describe('levels in a vendor list', () => {
  it("reads Anthropic's capability tree, and nothing for a model without effort", async () => {
    const fetchMock = fetchSequence(
      json({
        data: [
          {
            id: 'claude-opus-5-5',
            created_at: '2026-10-01T00:00:00Z',
            capabilities: {
              effort: {
                supported: true,
                low: leaf(true),
                medium: leaf(true),
                high: leaf(true),
                xhigh: leaf(true),
                max: leaf(true),
              },
            },
          },
          {
            id: 'claude-haiku-4-5',
            created_at: '2025-10-01T00:00:00Z',
            capabilities: { effort: { supported: false, low: leaf(false) } },
          },
        ],
        has_more: false,
      }),
    )
    expect(await listKeyProviderModelListing('anthropic', { apiKey: 'sk-ant' }, fetchMock)).toEqual(
      {
        models: ['claude-opus-5-5', 'claude-haiku-4-5'],
        efforts: { 'claude-opus-5-5': { efforts: ['low', 'medium', 'high', 'xhigh', 'max'] } },
      },
    )
  })

  it("reads OpenRouter's reasoning object, and nothing when it lists no levels", async () => {
    const fetchMock = fetchSequence(
      json({
        data: [
          {
            id: 'google/gemini-3.5-flash',
            created: 2,
            supported_parameters: ['tools', 'reasoning'],
            reasoning: {
              supported_efforts: ['high', 'medium', 'low', 'minimal'],
              default_effort: 'medium',
              mandatory: true,
            },
          },
          {
            id: 'someone/any-level',
            created: 1,
            supported_parameters: ['tools'],
            reasoning: { supported_efforts: null },
          },
        ],
      }),
    )
    const listing = await listKeyProviderModelListing('openrouter', { apiKey: 'sk-or' }, fetchMock)
    expect(listing?.efforts).toEqual({
      'google/gemini-3.5-flash': {
        efforts: ['minimal', 'low', 'medium', 'high'],
        defaultEffort: 'medium',
      },
    })
  })

  it("reads DeepSeek's effort object under the id the catalog uses", async () => {
    const fetchMock = fetchSequence(
      json({
        data: [
          {
            id: 'deepseek-flash',
            effort: { supported_levels: ['low', 'high', 'max'], default_level: 'high' },
          },
          { id: 'deepseek-v4-pro', effort: { supported_levels: ['low', 'high', 'max'] } },
        ],
      }),
    )
    const listing = await listKeyProviderModelListing('deepseek', { apiKey: 'sk-d' }, fetchMock)
    expect(listing?.efforts).toEqual({
      'deep-seek-v4.1-flash': { efforts: ['low', 'high', 'max'], defaultEffort: 'high' },
      'deepseek-v4-pro': { efforts: ['low', 'high', 'max'] },
    })
  })

  it("reads xAI's capabilities, from its full list when the short one leaves them out", async () => {
    const fetchMock = fetchSequence(
      json({
        data: [
          {
            id: 'grok-4.6',
            capabilities: {
              reasoning_effort: ['low', 'medium', 'high', 'xhigh'],
              default_reasoning_effort: 'high',
            },
          },
          { id: 'grok-4.5' },
        ],
      }),
      json({
        models: [{ id: 'grok-4.5', capabilities: { reasoning_effort: ['low', 'medium', 'high'] } }],
      }),
    )
    const listing = await listKeyProviderModelListing('xai', { apiKey: 'xai-k' }, fetchMock)
    expect(listing?.efforts).toEqual({
      'grok-4.6': { efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'high' },
      'grok-4.5': { efforts: ['low', 'medium', 'high'] },
    })
    expect(String(fetchMock.mock.calls[1]![0])).toBe('https://api.x.ai/v1/language-models')
  })

  it('keeps the xAI list when the full list cannot be read', async () => {
    const fetchMock = fetchSequence(json({ data: [{ id: 'grok-4.6' }] }), json({}, 500))
    expect(await listKeyProviderModelListing('xai', { apiKey: 'k' }, fetchMock)).toEqual({
      models: ['grok-4.6'],
      efforts: {},
    })
  })

  it('keeps no levels for a vendor this app hands none to, and the id list is unchanged', async () => {
    const body = {
      data: [{ id: 'gpt-5.6-terra', reasoning: { supported_efforts: ['low', 'high'] } }],
    }
    expect(
      await listKeyProviderModelListing('openai', { apiKey: 'k' }, fetchSequence(json(body))),
    ).toEqual({ models: ['gpt-5.6-terra'], efforts: {} })
    expect(
      await listKeyProviderModels('openai', { apiKey: 'k' }, fetchSequence(json(body))),
    ).toEqual(['gpt-5.6-terra'])
  })
})

function settingsWithKey(): AiSettings {
  const settings = defaultAiSettings()
  settings.providers.anthropic = { apiKey: 'sk-ant', model: 'claude-opus-5-5' }
  return settings
}

const OPUS = { 'claude-opus-5-5': { efforts: ['low', 'high'] as const } }

describe('the stored table', () => {
  it('is written beside the list, and an empty table removes it', () => {
    const written = withKeyProviderModels(settingsWithKey(), 'anthropic', ['claude-opus-5-5'], {
      'claude-opus-5-5': { efforts: ['low', 'high'] },
    })
    expect(written.providers.anthropic.modelEfforts).toEqual({
      'claude-opus-5-5': { efforts: ['low', 'high'] },
    })
    // the same answer again changes nothing
    expect(
      withKeyProviderModels(written, 'anthropic', ['claude-opus-5-5'], {
        'claude-opus-5-5': { efforts: ['low', 'high'] },
      }),
    ).toBe(written)
    const cleared = withKeyProviderModels(written, 'anthropic', ['claude-opus-5-5'], {})
    expect(cleared.providers.anthropic).not.toHaveProperty('modelEfforts')
  })

  it('is taken from the file on a save, not from what a window sent', () => {
    const stored = withKeyProviderModels(settingsWithKey(), 'anthropic', ['claude-opus-5-5'], {
      ...OPUS,
      'claude-opus-5-5': { efforts: ['low', 'high'] },
    })
    const sent = settingsWithKey()
    sent.providers.anthropic = {
      ...sent.providers.anthropic,
      effort: 'high',
      modelEfforts: { 'claude-opus-5-5': { efforts: ['max'] } },
    }
    const saved = withStoredKeyModels(sent, stored).providers.anthropic
    expect(saved.modelEfforts).toEqual({ 'claude-opus-5-5': { efforts: ['low', 'high'] } })
    // the level itself is the window's to set
    expect(saved.effort).toBe('high')
  })

  it('is refreshed with the list', async () => {
    let file = settingsWithKey()
    const refresher = createKeyModelRefresher({
      read: () => file,
      write: (update) => {
        file = update(file)
      },
      list: async () => ({
        models: ['claude-opus-5-5'],
        efforts: { 'claude-opus-5-5': { efforts: ['medium', 'high'] } },
      }),
    })
    refresher.refreshChanged()
    await refresher.idle()
    expect(file.providers.anthropic.models).toEqual(['claude-opus-5-5'])
    expect(file.providers.anthropic.modelEfforts).toEqual({
      'claude-opus-5-5': { efforts: ['medium', 'high'] },
    })
  })
})
