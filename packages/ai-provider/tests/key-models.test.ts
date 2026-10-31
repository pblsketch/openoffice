import { describe, expect, it, vi } from 'vitest'
import { keyModelIdsOf, listKeyProviderModels, listsKeyProviderModels } from '../src/key-models'

/**
 * The live list of an API-key provider (decision 0087): one request per page to
 * the vendor's own list endpoint with the key a chat would send, read into the
 * chat models the pickers may offer. These cases pin the three wire shapes, the
 * filtering that keeps embedding, speech, image and Responses-only models out
 * of a chat picker, the newest-first order, and that nothing it is handed makes
 * it throw.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** a fetch that answers each call with the next body, recording what was asked */
function fetchSequence(...responses: Response[]) {
  const mock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = responses.shift()
    if (!next) throw new Error('unexpected request')
    return next
  })
  return mock as unknown as typeof fetch & typeof mock
}

function headerOf(mock: ReturnType<typeof fetchSequence>, call: number, name: string) {
  const headers = (mock.mock.calls[call]![1]?.headers ?? {}) as Record<string, string>
  return headers[name]
}

describe('listKeyProviderModels — Gemini', () => {
  it('reads every page, keeps the generateContent chat models and puts the newest release first', async () => {
    const fetchMock = fetchSequence(
      json({
        models: [
          { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-embedding-2', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
          {
            name: 'models/gemini-3.1-flash-image',
            supportedGenerationMethods: ['generateContent'],
          },
          { name: 'models/gemini-3.8-live', supportedGenerationMethods: ['bidiGenerateContent'] },
          { name: 'models/gemini-4-argon', supportedGenerationMethods: ['generateContent'] },
          // deprecated, and routed by Google to 3.8 Flash: listed once under its replacement
          { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] },
        ],
        nextPageToken: 'p2',
      }),
      json({
        models: [
          { name: 'models/gemini-4.1-flash', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    )

    const models = await listKeyProviderModels('gemini', { apiKey: ' AIza-key ' }, fetchMock)

    expect(models).toEqual([
      'gemini-4.1-flash',
      'gemini-4-argon',
      'gemini-3.8-flash',
      'gemini-2.5-flash',
    ])
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=p2',
    ])
    // the key goes in the header the chat uses, never in the address
    expect(headerOf(fetchMock, 0, 'x-goog-api-key')).toBe('AIza-key')
  })
})

describe('listKeyProviderModels — Anthropic', () => {
  it('follows has_more and orders by release date', async () => {
    const fetchMock = fetchSequence(
      json({
        data: [
          { id: 'claude-opus-5-5', created_at: '2026-09-01T00:00:00Z', type: 'model' },
          { id: 'claude-sonnet-5', created_at: '2026-05-01T00:00:00Z', type: 'model' },
        ],
        has_more: true,
        last_id: 'claude-sonnet-5',
      }),
      json({
        data: [{ id: 'claude-opus-6', created_at: '2026-10-20T00:00:00Z', type: 'model' }],
        has_more: false,
      }),
    )

    const models = await listKeyProviderModels('anthropic', { apiKey: 'sk-ant' }, fetchMock)

    expect(models).toEqual(['claude-opus-6', 'claude-opus-5-5', 'claude-sonnet-5'])
    expect(fetchMock.mock.calls[1]![0]).toBe(
      'https://api.anthropic.com/v1/models?limit=1000&after_id=claude-sonnet-5',
    )
    expect(headerOf(fetchMock, 0, 'x-api-key')).toBe('sk-ant')
    expect(headerOf(fetchMock, 0, 'anthropic-version')).toBe('2023-06-01')
  })
})

describe('listKeyProviderModels — OpenAI-compatible', () => {
  it('drops non-chat, Responses-only and dated-snapshot ids, newest first', async () => {
    const fetchMock = fetchSequence(
      json({
        object: 'list',
        data: [
          { id: 'o4-mini', created: 100 },
          { id: 'gpt-5.6-sol', created: 200 },
          { id: 'gpt-5.7', created: 300 },
          { id: 'gpt-5.7-2026-10-01', created: 301 },
          { id: 'gpt-6-sol', created: 400 },
          { id: 'gpt-5.5-pro', created: 250 },
          { id: 'gpt-5.6-codex', created: 260 },
          { id: 'text-embedding-3-large', created: 1 },
          { id: 'tts-1', created: 1 },
          { id: 'whisper-1', created: 1 },
          { id: 'gpt-image-2', created: 1 },
          { id: 'dall-e-3', created: 1 },
          { id: 'gpt-4o-realtime-preview', created: 1 },
          { id: 'gpt-4o-mini-transcribe', created: 1 },
          { id: 'omni-moderation-latest', created: 1 },
        ],
      }),
    )

    const models = await listKeyProviderModels('openai', { apiKey: 'sk-1' }, fetchMock)

    expect(models).toEqual(['gpt-5.7', 'gpt-5.6-sol', 'o4-mini'])
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.openai.com/v1/models')
    expect(headerOf(fetchMock, 0, 'Authorization')).toBe('Bearer sk-1')
  })

  it('asks a stored base URL, as the chat would', async () => {
    const fetchMock = fetchSequence(json({ data: [{ id: 'gpt-5.7' }] }))
    await listKeyProviderModels(
      'openai',
      { apiKey: 'sk-1', baseUrl: 'https://gw.example.com/v1' },
      fetchMock,
    )
    expect(fetchMock.mock.calls[0]![0]).toBe('https://gw.example.com/v1/models')
  })

  it('keeps only models a gateway marks as taking tools and answering in text', async () => {
    const fetchMock = fetchSequence(
      json({
        data: [
          {
            id: 'google/gemini-4-argon',
            created: 500,
            supported_parameters: ['tools', 'temperature'],
            architecture: { output_modalities: ['text'] },
          },
          // the batch-priced copy of a listed model, as OpenRouter lists it
          { id: 'google/gemini-4-argon:batch', created: 501, supported_parameters: ['tools'] },
          { id: 'someone/new:batch', created: 502, supported_parameters: ['tools'] },
          { id: 'someone/no-tools', created: 600, supported_parameters: ['temperature'] },
          {
            id: 'someone/pictures',
            created: 700,
            supported_parameters: ['tools'],
            architecture: { output_modalities: ['image'] },
          },
        ],
      }),
    )
    // a :batch id whose base is not listed is the only way to that model, so it stays
    expect(await listKeyProviderModels('openrouter', { apiKey: 'sk-or' }, fetchMock)).toEqual([
      'someone/new:batch',
      'google/gemini-4-argon',
    ])
  })

  it("honours a vendor's own capability flags and type field", async () => {
    const fetchMock = fetchSequence(
      json({
        data: [
          {
            id: 'mistral-medium-latest',
            capabilities: { completion_chat: true, function_calling: true },
          },
          { id: 'codestral-latest', capabilities: { completion_chat: false } },
          {
            id: 'mistral-tiny-latest',
            capabilities: { completion_chat: true, function_calling: false },
          },
          { id: 'some-reranker', type: 'rerank' },
        ],
      }),
    )
    expect(await listKeyProviderModels('mistral', { apiKey: 'k' }, fetchMock)).toEqual([
      'mistral-medium-latest',
    ])
  })

  it('lists a wire id under the name the catalog uses', async () => {
    const fetchMock = fetchSequence(
      json({ data: [{ id: 'deepseek-flash' }, { id: 'deepseek-v4-pro' }] }),
    )
    expect(await listKeyProviderModels('deepseek', { apiKey: 'sk-d' }, fetchMock)).toEqual([
      'deep-seek-v4.1-flash',
      'deepseek-v4-pro',
    ])
  })

  it('leaves out what the OpenCode gateways serve on the Responses API only', async () => {
    const fetchMock = fetchSequence(
      json({ data: [{ id: 'gpt-5.6-luna' }, { id: 'grok-4.7' }, { id: 'claude-opus-6' }] }),
    )
    expect(await listKeyProviderModels('opencode-zen', { apiKey: 'k' }, fetchMock)).toEqual([
      'claude-opus-6',
    ])
    expect(fetchMock.mock.calls[0]![0]).toBe('https://opencode.ai/zen/v1/models')
  })
})

describe('listKeyProviderModels — no list', () => {
  it('sends nothing without a key, for a subscription or for a user-hosted server', async () => {
    const fetchMock = fetchSequence()
    expect(await listKeyProviderModels('gemini', { apiKey: '  ' }, fetchMock)).toBeNull()
    expect(await listKeyProviderModels('claude-code', { apiKey: 'x' }, fetchMock)).toBeNull()
    expect(await listKeyProviderModels('codex', { apiKey: 'x' }, fetchMock)).toBeNull()
    expect(
      await listKeyProviderModels(
        'custom',
        { apiKey: 'x', baseUrl: 'http://127.0.0.1:1/v1' },
        fetchMock,
      ),
    ).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads a refusal, an odd body, a broken body and a network failure as no list', async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => json({ error: { message: 'invalid key' } }, 401),
      async () => json({ data: 'not a list' }),
      async () => new Response('not json', { status: 200 }),
      async () => {
        throw new TypeError('fetch failed')
      },
      // a list with nothing a chat could use is no list either
      async () => json({ data: [{ id: 'text-embedding-3-large' }] }),
    ]
    for (const answer of cases) {
      const fetchMock = vi.fn(answer) as unknown as typeof fetch
      await expect(listKeyProviderModels('openai', { apiKey: 'k' }, fetchMock)).resolves.toBeNull()
    }
  })
})

describe('keyModelIdsOf', () => {
  it('trims, drops blanks, over-long ids and duplicates', () => {
    expect(
      keyModelIdsOf('kimi', [
        { id: ' kimi-k3 ' },
        { id: '' },
        { id: 'kimi-k3' },
        { id: 'x'.repeat(300) },
        { id: 'kimi-k3.1' },
      ]),
    ).toEqual(['kimi-k3', 'kimi-k3.1'])
  })

  it('keeps a dated id whose undated alias is not listed', () => {
    expect(keyModelIdsOf('doubao', [{ id: 'doubao-seed-2-1-pro-260628' }])).toEqual([
      'doubao-seed-2-1-pro-260628',
    ])
  })
})

describe('listsKeyProviderModels', () => {
  it('is every API-key provider but the user-hosted servers', () => {
    expect(listsKeyProviderModels('gemini')).toBe(true)
    expect(listsKeyProviderModels('openrouter')).toBe(true)
    expect(listsKeyProviderModels('custom')).toBe(false)
    expect(listsKeyProviderModels('claude-code')).toBe(false)
    expect(listsKeyProviderModels('chatgpt')).toBe(false)
  })
})
