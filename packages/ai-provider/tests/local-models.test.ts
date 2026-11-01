import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_DEFAULT_USER_AGENT, setRescueFetch } from '../src/fetch'
import { inspectLocalModel, listLocalModels } from '../src/local-models'

/**
 * The two probes the local AI card runs against an address the user just typed.
 * What matters here: both wire shapes (Ollama's own API and the generic
 * `/v1/models` route), the fact that neither function throws no matter what
 * answers, and that a server's body never travels back out in a result — only a
 * code and, for HTTP failures, the status.
 *
 * The fixtures reproduce the shapes recorded from real servers: Ollama 0.20's
 * `/api/tags` (name with a colon, `details.parameter_size`) and `/api/show`
 * (capabilities plus `model_info` keys namespaced by architecture), and an
 * OpenAI-compatible `/v1/models` list that carries ids and nothing else.
 */

const OLLAMA_BASE = 'http://127.0.0.1:11434/v1'

const OLLAMA_TAGS = {
  models: [
    {
      name: 'gemma3:4b',
      model: 'gemma3:4b',
      modified_at: '2026-04-01T09:12:31.1Z',
      size: 3338801804,
      digest: 'a2af6cc3eb7fa8be8504abaf9b47e68b6dd4f17f9c7c9c5b1e4c5f1e2f3a4b5c',
      details: {
        parent_model: '',
        format: 'gguf',
        family: 'gemma3',
        families: ['gemma3'],
        parameter_size: '4.3B',
        quantization_level: 'Q4_K_M',
      },
    },
    {
      name: 'qwen3:8b',
      model: 'qwen3:8b',
      modified_at: '2026-04-02T11:03:07.4Z',
      size: 5225385984,
      digest: 'b3bf6cc3eb7fa8be8504abaf9b47e68b6dd4f17f9c7c9c5b1e4c5f1e2f3a4b5c',
      details: {
        parent_model: '',
        format: 'gguf',
        family: 'qwen3',
        families: ['qwen3'],
        parameter_size: '8.2B',
        quantization_level: 'Q4_K_M',
      },
    },
  ],
}

const SHOW_FULL = {
  model: 'qwen3:8b',
  modified_at: '2026-04-02T11:03:07.4Z',
  capabilities: ['completion', 'tools', 'vision'],
  details: { parameter_size: '8.2B', quantization_level: 'Q4_K_M' },
  model_info: {
    'general.architecture': 'qwen3',
    'general.context_length': 40960,
    'qwen3.context_length': 32768,
  },
}

const PS_LOADED = {
  models: [{ name: 'qwen3:8b', model: 'qwen3:8b', context_length: 8192, size: 5225385984 }],
}

function jsonBody(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function textBody(text: string, status = 200): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/html' } })
}

function stubFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(handler)
  vi.stubGlobal('fetch', mock)
  return mock
}

function requestedUrl(mock: ReturnType<typeof vi.fn>, index = 0): string {
  return mock.mock.calls[index]![0] as string
}

function requestedInit(mock: ReturnType<typeof vi.fn>, index = 0): RequestInit {
  return (mock.mock.calls[index]![1] ?? {}) as RequestInit
}

function sentHeaders(mock: ReturnType<typeof vi.fn>, index = 0): Headers {
  return new Headers(requestedInit(mock, index).headers)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
  setRescueFetch(null)
})

// ── discovery ─────────────────────────────────────────────

describe('listLocalModels against an Ollama server', () => {
  it('reads /api/tags from the server root and maps name, size and details', async () => {
    const mock = stubFetch((url) =>
      url === 'http://127.0.0.1:11434/api/tags'
        ? jsonBody(OLLAMA_TAGS)
        : textBody('not found', 404),
    )

    const result = await listLocalModels({ baseUrl: `${OLLAMA_BASE}///` })

    expect(result).toEqual({
      ok: true,
      server: 'ollama',
      models: [
        {
          id: 'gemma3:4b',
          sizeBytes: 3338801804,
          parameterSize: '4.3B',
          quantization: 'Q4_K_M',
        },
        {
          id: 'qwen3:8b',
          sizeBytes: 5225385984,
          parameterSize: '8.2B',
          quantization: 'Q4_K_M',
        },
      ],
    })
    expect(mock).toHaveBeenCalledTimes(1) // the ollama answer wins; no /models probe
    expect(requestedUrl(mock)).toBe('http://127.0.0.1:11434/api/tags')
  })

  it('keeps one bad entry from failing the whole list', async () => {
    const mock = stubFetch(() =>
      jsonBody({
        models: [
          {
            name: 'gemma3:4b',
            size: 10,
            details: { parameter_size: '4.3B', quantization_level: 'Q4_K_M' },
          },
          { name: 'gemma3:4b', size: 20 }, // duplicate id
          { size: 30 }, // no name
          null,
          { name: '   ' },
          { name: 'qwen3:8b' }, // no details at all
        ],
      }),
    )

    expect(await listLocalModels({ baseUrl: OLLAMA_BASE })).toEqual({
      ok: true,
      server: 'ollama',
      models: [
        {
          id: 'gemma3:4b',
          sizeBytes: 10,
          parameterSize: '4.3B',
          quantization: 'Q4_K_M',
        },
        { id: 'qwen3:8b' },
      ],
    })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('caps a pathological list at 2000 ids', async () => {
    const models = Array.from({ length: 2400 }, (_unused, i) => ({ name: `m${i}:latest` }))
    stubFetch(() => jsonBody({ models }))

    const result = await listLocalModels({ baseUrl: OLLAMA_BASE })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.models).toHaveLength(2000)
    expect(result.models[1999]!.id).toBe('m1999:latest')
  })
})

describe('listLocalModels against an OpenAI-compatible server', () => {
  it('falls back to /v1/models and keeps ids only', async () => {
    const mock = stubFetch((url) =>
      url.endsWith('/api/tags')
        ? textBody('404 page not found', 404)
        : jsonBody({
            object: 'list',
            data: [{ id: 'qwen3:8b' }, { id: 'llama3' }],
          }),
    )

    expect(await listLocalModels({ baseUrl: 'http://127.0.0.1:1234/v1' })).toEqual({
      ok: true,
      server: 'openai-compatible',
      models: [{ id: 'qwen3:8b' }, { id: 'llama3' }],
    })
    expect(requestedUrl(mock, 0)).toBe('http://127.0.0.1:1234/api/tags')
    expect(requestedUrl(mock, 1)).toBe('http://127.0.0.1:1234/v1/models')
  })

  it('drops blanks, non-strings and duplicates while keeping server order', async () => {
    stubFetch((url) =>
      url.endsWith('/api/tags')
        ? textBody('not found', 404)
        : jsonBody({
            data: [
              { id: 'b' },
              { id: 'a' },
              { id: 'b' },
              { id: '' },
              { id: '   ' },
              { id: 7 },
              { name: 'c' },
              null,
              { id: '  a  ' },
              { id: 'z' },
            ],
          }),
    )

    expect(await listLocalModels({ baseUrl: 'http://127.0.0.1:1234/v1' })).toEqual({
      ok: true,
      server: 'openai-compatible',
      models: [{ id: 'b' }, { id: 'a' }, { id: 'z' }],
    })
  })

  it('caps a pathological list at 2000 ids', async () => {
    const data = Array.from({ length: 2400 }, (_unused, i) => ({ id: `m${i}` }))
    stubFetch((url) =>
      url.endsWith('/api/tags') ? textBody('not found', 404) : jsonBody({ data }),
    )

    const result = await listLocalModels({ baseUrl: 'http://127.0.0.1:1234/v1' })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.models).toHaveLength(2000)
    expect(result.models[1999]!.id).toBe('m1999')
  })
})

describe('listLocalModels keys and addresses', () => {
  it('sends the key as a Bearer token only when one is given', async () => {
    const withKey = stubFetch(() => jsonBody(OLLAMA_TAGS))
    await listLocalModels({ baseUrl: OLLAMA_BASE, apiKey: '  sk-local  ' })
    expect(sentHeaders(withKey).get('authorization')).toBe('Bearer sk-local')
    expect(sentHeaders(withKey).get('user-agent')).toBe(AI_DEFAULT_USER_AGENT)

    const withoutKey = stubFetch(() => jsonBody(OLLAMA_TAGS))
    await listLocalModels({ baseUrl: OLLAMA_BASE, apiKey: '   ' })
    expect(sentHeaders(withoutKey).has('authorization')).toBe(false)
  })

  it('never calls a non-http(s) or empty address', async () => {
    const mock = stubFetch(() => jsonBody(OLLAMA_TAGS))

    expect(await listLocalModels({ baseUrl: 'ftp://127.0.0.1/v1' })).toEqual({
      ok: false,
      errorCode: 'unreachable',
    })
    expect(await listLocalModels({ baseUrl: '   ' })).toEqual({
      ok: false,
      errorCode: 'unreachable',
    })
    expect(mock).not.toHaveBeenCalled()
  })
})

describe('a server that cannot answer', () => {
  it('reports unreachable when nothing is listening', async () => {
    const rescue = vi.fn()
    setRescueFetch(rescue)
    stubFetch(() => Promise.reject(new Error('fetch failed')))

    expect(await listLocalModels({ baseUrl: OLLAMA_BASE })).toEqual({
      ok: false,
      errorCode: 'unreachable',
    })
    expect(rescue).not.toHaveBeenCalled()
  })

  it('reports http with the status and never echoes the body', async () => {
    stubFetch(() => textBody('SECRET-UPSTREAM-BODY', 500))

    const result = await listLocalModels({ baseUrl: OLLAMA_BASE })

    expect(result).toEqual({ ok: false, errorCode: 'http', status: 500 })
    expect(JSON.stringify(result)).not.toContain('SECRET-UPSTREAM-BODY')
  })

  it('prefers the more telling status: a missing /api/tags route says less than a failing /v1/models', async () => {
    stubFetch((url) =>
      url.endsWith('/api/tags') ? textBody('not found', 404) : textBody('boom', 500),
    )

    expect(await listLocalModels({ baseUrl: 'http://127.0.0.1:1234/v1' })).toEqual({
      ok: false,
      errorCode: 'http',
      status: 500,
    })
  })

  it('reports shape when both routes answer with something that is not this API', async () => {
    stubFetch(() => textBody('<html><body>hello</body></html>'))

    expect(await listLocalModels({ baseUrl: OLLAMA_BASE })).toEqual({
      ok: false,
      errorCode: 'shape',
    })
  })

  it('reports shape on malformed JSON', async () => {
    stubFetch(() => new Response('{"models":[', { status: 200 }))

    expect(await listLocalModels({ baseUrl: OLLAMA_BASE })).toEqual({
      ok: false,
      errorCode: 'shape',
    })
  })

  it('reports timeout when a route never answers, and aborts the request', async () => {
    vi.useFakeTimers()
    let aborted = false
    const mock = vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith('/api/tags')) return Promise.resolve(textBody('not found', 404))
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          aborted = true
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        })
      })
    })
    vi.stubGlobal('fetch', mock)

    const pending = listLocalModels({ baseUrl: OLLAMA_BASE })
    await vi.advanceTimersByTimeAsync(5000)

    expect(await pending).toEqual({ ok: false, errorCode: 'timeout' })
    expect(aborted).toBe(true)
  })

  it('refuses an oversized body instead of buffering it', async () => {
    const huge = `{"data":[{"id":"${'x'.repeat(2 * 1024 * 1024)}"}]}`
    stubFetch(() => new Response(huge, { status: 200 }))

    expect(await listLocalModels({ baseUrl: OLLAMA_BASE })).toEqual({
      ok: false,
      errorCode: 'shape',
    })
  })
})

// ── inspection ────────────────────────────────────────────

describe('inspectLocalModel against an Ollama server', () => {
  it('reads capabilities, the first context_length and the running context', async () => {
    const mock = stubFetch((url) => {
      if (url.endsWith('/api/show')) return jsonBody(SHOW_FULL)
      if (url.endsWith('/api/ps')) return jsonBody(PS_LOADED)
      return textBody('not found', 404)
    })

    const result = await inspectLocalModel({
      baseUrl: OLLAMA_BASE,
      apiKey: 'sk-local',
      model: 'qwen3:8b',
      server: 'ollama',
    })

    expect(result).toEqual({
      ok: true,
      profile: {
        contextLength: 40960,
        runningContextLength: 8192,
        tools: true,
        vision: true,
        // the capability list names no "thinking": the model takes no level
        efforts: [],
      },
    })
    expect(requestedUrl(mock, 0)).toBe('http://127.0.0.1:11434/api/show')
    expect(requestedInit(mock, 0).method).toBe('POST')
    expect(JSON.parse(String(requestedInit(mock, 0).body))).toEqual({ model: 'qwen3:8b' })
    expect(sentHeaders(mock, 0).get('authorization')).toBe('Bearer sk-local')
    expect(requestedUrl(mock, 1)).toBe('http://127.0.0.1:11434/api/ps')
  })

  it('reports missing tools and vision as false when the capability list exists', async () => {
    stubFetch((url) =>
      url.endsWith('/api/show')
        ? jsonBody({ capabilities: ['completion'] })
        : jsonBody({ models: [] }),
    )

    expect(
      await inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b', server: 'ollama' }),
    ).toEqual({ ok: true, profile: { efforts: [], tools: false, vision: false } })
  })

  it('leaves both capability fields unknown when the list is absent', async () => {
    stubFetch((url) =>
      url.endsWith('/api/show')
        ? jsonBody({ model_info: { 'x.context_length': 8192 } })
        : jsonBody({ models: [] }),
    )

    expect(
      await inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b', server: 'ollama' }),
    ).toEqual({ ok: true, profile: { contextLength: 8192 } })
  })

  it('takes vision from the list and tools as false', async () => {
    stubFetch((url) =>
      url.endsWith('/api/show')
        ? jsonBody({ capabilities: ['completion', 'vision'], model_info: {} })
        : jsonBody({ models: [] }),
    )

    expect(
      await inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b', server: 'ollama' }),
    ).toEqual({ ok: true, profile: { efforts: [], tools: false, vision: true } })
  })

  it('reports no running context when the model is not loaded', async () => {
    stubFetch((url) =>
      url.endsWith('/api/show')
        ? jsonBody({ capabilities: ['tools'], model_info: { 'x.context_length': 4096 } })
        : jsonBody({ models: [{ name: 'other:1b', model: 'other:1b', context_length: 8192 }] }),
    )

    expect(
      await inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b', server: 'ollama' }),
    ).toEqual({
      ok: true,
      profile: { efforts: [], contextLength: 4096, tools: true, vision: false },
    })
  })

  it('keeps the show profile when /api/ps fails', async () => {
    stubFetch((url) =>
      url.endsWith('/api/show')
        ? jsonBody({ capabilities: ['tools'], model_info: { 'x.context_length': 4096 } })
        : textBody('boom', 500),
    )

    expect(
      await inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b', server: 'ollama' }),
    ).toEqual({
      ok: true,
      profile: { efforts: [], contextLength: 4096, tools: true, vision: false },
    })
  })

  it('reports an http failure on /api/show and does not proceed to /api/ps', async () => {
    const mock = stubFetch(() => textBody('SECRET-NOT-FOUND', 404))

    const result = await inspectLocalModel({
      baseUrl: OLLAMA_BASE,
      model: 'missing:1b',
      server: 'ollama',
    })

    expect(result).toEqual({ ok: false, errorCode: 'http', status: 404 })
    expect(JSON.stringify(result)).not.toContain('SECRET-NOT-FOUND')
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('reports shape when /api/show is not this API', async () => {
    stubFetch(() => textBody('<html></html>'))

    expect(
      await inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b', server: 'ollama' }),
    ).toEqual({ ok: false, errorCode: 'shape' })
  })

  it('reports unreachable when the connection fails', async () => {
    stubFetch(() => Promise.reject(new Error('fetch failed')))

    expect(
      await inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b', server: 'ollama' }),
    ).toEqual({ ok: false, errorCode: 'unreachable' })
  })

  it('never calls a non-http(s) address', async () => {
    const mock = stubFetch(() => jsonBody(SHOW_FULL))

    expect(
      await inspectLocalModel({
        baseUrl: 'ftp://127.0.0.1/v1',
        model: 'qwen3:8b',
        server: 'ollama',
      }),
    ).toEqual({ ok: false, errorCode: 'unreachable' })
    expect(mock).not.toHaveBeenCalled()
  })
})

describe('inspectLocalModel and the server kind', () => {
  it('returns an empty profile for a generic server without probing it', async () => {
    const mock = stubFetch(() => jsonBody(SHOW_FULL))

    expect(
      await inspectLocalModel({
        baseUrl: 'http://127.0.0.1:1234/v1',
        model: 'qwen3:8b',
        server: 'openai-compatible',
      }),
    ).toEqual({ ok: true, profile: {} })
    expect(mock).not.toHaveBeenCalled()
  })

  it('probes /api/tags once when the server kind is unknown', async () => {
    const mock = stubFetch((url) => {
      if (url.endsWith('/api/tags')) return jsonBody(OLLAMA_TAGS)
      if (url.endsWith('/api/show')) return jsonBody({ capabilities: ['tools'], model_info: {} })
      return jsonBody({ models: [] })
    })

    expect(await inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b' })).toEqual({
      ok: true,
      profile: { efforts: [], tools: true, vision: false },
    })
    expect(requestedUrl(mock, 0)).toBe('http://127.0.0.1:11434/api/tags')
    expect(requestedUrl(mock, 1)).toBe('http://127.0.0.1:11434/api/show')
  })

  it('treats a 404 /api/tags response as a generic server', async () => {
    const mock = stubFetch(() => textBody('not found', 404))

    expect(
      await inspectLocalModel({ baseUrl: 'http://127.0.0.1:1234/v1', model: 'qwen3:8b' }),
    ).toEqual({ ok: true, profile: {} })
    expect(mock).toHaveBeenCalledTimes(1) // no /api/show: the generic profile needs no call
  })

  it('treats a 405 /api/tags response as a generic server too', async () => {
    const mock = stubFetch(() => textBody('method not allowed', 405))

    expect(
      await inspectLocalModel({ baseUrl: 'http://127.0.0.1:1234/v1', model: 'qwen3:8b' }),
    ).toEqual({ ok: true, profile: {} })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('does not claim success when the kind probe cannot reach the server', async () => {
    stubFetch(() => Promise.reject(new Error('fetch failed')))

    expect(await inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b' })).toEqual({
      ok: false,
      errorCode: 'unreachable',
    })
  })

  it('does not claim success when the kind probe times out', async () => {
    vi.useFakeTimers()
    let aborted = false
    const mock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', mock)

    const pending = inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b' })
    await vi.advanceTimersByTimeAsync(5000)

    expect(await pending).toEqual({ ok: false, errorCode: 'timeout' })
    expect(aborted).toBe(true)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('reports an http failure of the kind probe instead of a generic profile', async () => {
    const mock = stubFetch(() => textBody('boom', 500))

    expect(await inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b' })).toEqual({
      ok: false,
      errorCode: 'http',
      status: 500,
    })
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('reports shape when the kind probe answers with something that is not this API', async () => {
    stubFetch(() => textBody('<html>hello</html>', 200))

    expect(await inspectLocalModel({ baseUrl: OLLAMA_BASE, model: 'qwen3:8b' })).toEqual({
      ok: false,
      errorCode: 'shape',
    })
  })
})
