/**
 * One turn on the ChatGPT plan over the Responses API (decision 0081). The
 * network is a fake fetch: no request reaches OpenAI and no plan is used.
 */
import type { AgentToolCall, AgentToolDef } from '@genoffice/agent-core'
import { describe, expect, it } from 'vitest'
import { createChatGptConnectionMemoryStore } from '../src/chatgpt/credentials'
import { createChatGptConnection, type ChatGptConnection } from '../src/chatgpt/connection'
import {
  CHATGPT_MODELS_URL,
  CHATGPT_RESPONSES_URL,
  chatChatGpt,
  chatGptModelsOf,
  streamChatGpt,
} from '../src/chatgpt/responses'
import { CHATGPT_PLAN_SCOPE } from '../src/chatgpt/oauth'
import { AiRunError, aiStreamErrorFields } from '../src/run-error'

const TOOLS: AgentToolDef[] = [
  {
    name: 'insert_text',
    description: 'Insert text',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
  },
]

function connection(): ChatGptConnection {
  return createChatGptConnection({
    store: createChatGptConnectionMemoryStore({
      hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000',
      clientId: 'oaiapp_1',
      session: {
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        expiresAt: Date.now() + 3_600_000,
        scopes: [CHATGPT_PLAN_SCOPE],
      },
    }),
    agentName: 'x',
    fetch: async () => new Response('', { status: 500 }),
  })
}

function sse(events: unknown[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

/** the answer streamed as text deltas, the way the Responses API sends it */
function answer(text: string, chunk = 7): unknown[] {
  const deltas: unknown[] = []
  for (let i = 0; i < text.length; i += chunk) {
    deltas.push({ type: 'response.output_text.delta', delta: text.slice(i, i + chunk) })
  }
  return [
    ...deltas,
    { type: 'response.completed', response: { usage: { input_tokens: 12, output_tokens: 34 } } },
  ]
}

interface Captured {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown> | null
}

function fakeApi(respond: (url: string) => Response) {
  const calls: Captured[] = []
  return {
    calls,
    fetch: async (url: string, init: RequestInit) => {
      calls.push({
        url,
        headers: { ...(init.headers as Record<string, string>) },
        body:
          typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
      })
      return respond(url)
    },
  }
}

function run(
  api: ReturnType<typeof fakeApi>,
  options: { model?: string; conn?: ChatGptConnection | null; images?: boolean } = {},
) {
  const deltas: string[] = []
  const calls: AgentToolCall[] = []
  const usage: unknown[] = []
  const promise = streamChatGpt(
    { apiKey: '', model: options.model ?? 'gpt-5.6-sol' },
    'You edit documents.',
    [
      {
        role: 'user',
        text: 'Add a title',
        ...(options.images ? { images: [{ mime: 'image/png', base64: 'AAAA' }] } : {}),
      },
    ],
    TOOLS,
    2048,
    {
      signal: new AbortController().signal,
      onDelta: (text) => deltas.push(text),
      onToolCall: (call) => calls.push(call),
      onUsage: (u) => usage.push(u),
    },
    { fetch: api.fetch, connection: options.conn === undefined ? connection() : options.conn },
  )
  return { promise, deltas, calls, usage }
}

describe('a ChatGPT turn', () => {
  it('sends only the fields the plan takes, with the app token, and reads text and tool calls', async () => {
    const api = fakeApi(() =>
      sse(
        answer(
          JSON.stringify({
            text: 'Adding a title.',
            toolCalls: [{ name: 'insert_text', inputJson: '{"text":"Title"}' }],
          }),
        ),
      ),
    )
    const { promise, deltas, calls, usage } = run(api)
    await promise
    expect(api.calls).toHaveLength(1)
    const request = api.calls[0]!
    expect(request.url).toBe(CHATGPT_RESPONSES_URL)
    expect(request.headers.Authorization).toBe('Bearer access-1')
    expect(Object.keys(request.body ?? {}).sort()).toEqual(['input', 'model', 'store', 'stream'])
    expect(request.body).toMatchObject({ model: 'gpt-5.6-sol', store: false, stream: true })
    const input = request.body?.input as Array<{
      role: string
      content: Array<{ type: string; text?: string }>
    }>
    expect(input).toHaveLength(1)
    expect(input[0]?.role).toBe('user')
    // the app's instructions and tool list travel inside the input, the system prompt first
    expect(input[0]?.content[0]?.text).toContain('You edit documents.')
    expect(JSON.stringify(input)).toContain('insert_text')
    expect(deltas.join('')).toBe('Adding a title.')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ name: 'insert_text', input: { text: 'Title' } })
    expect(calls[0]?.id).toMatch(/^chatgpt-/)
    expect(usage).toEqual([{ inputTokens: 12, outputTokens: 34 }])
  })

  it('sends attached images as input images', async () => {
    const api = fakeApi(() => sse(answer('{"text":"A cat.","toolCalls":[]}')))
    await run(api, { images: true }).promise
    const parts = (
      api.calls[0]?.body?.input as Array<{ content: Array<Record<string, string>> }>
    )[0]!.content
    expect(parts).toContainEqual({ type: 'input_image', image_url: 'data:image/png;base64,AAAA' })
  })

  it('takes a plain-prose answer as text without tool calls', async () => {
    const api = fakeApi(() => sse(answer('Done.')))
    const { promise, deltas, calls } = run(api)
    await promise
    expect(deltas.join('')).toBe('Done.')
    expect(calls).toEqual([])
  })

  it('runs on the first listed model when none is chosen', async () => {
    const api = fakeApi((url) =>
      url === CHATGPT_MODELS_URL
        ? Response.json({
            models: [
              { slug: 'hidden-model', display_name: 'Hidden', visibility: 'hide' },
              { slug: 'gpt-5.6-terra', display_name: 'GPT-5.6 Terra', visibility: 'list' },
            ],
          })
        : sse(answer('{"text":"ok","toolCalls":[]}')),
    )
    await run(api, { model: '' }).promise
    expect(api.calls.map((call) => call.url)).toEqual([CHATGPT_MODELS_URL, CHATGPT_RESPONSES_URL])
    expect(api.calls[1]?.body?.model).toBe('gpt-5.6-terra')
  })

  it('reports a used-up plan as a rate limit of ChatGPT, never as something to retry elsewhere', async () => {
    const api = fakeApi(() =>
      Response.json(
        { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'limit' } },
        { status: 429 },
      ),
    )
    const error = await run(api).promise.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiRunError)
    expect(aiStreamErrorFields(error)).toEqual({
      errorCode: 'rate-limit',
      errorProvider: 'chatgpt',
    })
  })

  it('drops the session OpenAI refuses and says signed out', async () => {
    const conn = connection()
    const api = fakeApi(() =>
      Response.json({ error: { code: 'subscription_sharing_invalid_user' } }, { status: 401 }),
    )
    const error = await run(api, { conn }).promise.catch((e: unknown) => e)
    expect(aiStreamErrorFields(error)).toEqual({
      errorCode: 'signed-out',
      errorProvider: 'chatgpt',
    })
    expect(await conn.state()).toEqual({ signedIn: false })
  })

  it('says signed out, and sends nothing, without a connection', async () => {
    const api = fakeApi(() => sse([]))
    const error = await run(api, { conn: null }).promise.catch((e: unknown) => e)
    expect(aiStreamErrorFields(error)).toEqual({
      errorCode: 'signed-out',
      errorProvider: 'chatgpt',
    })
    expect(api.calls).toEqual([])
  })

  it('names the part the plan does not take', async () => {
    const api = fakeApi(() =>
      Response.json(
        { error: { code: 'subscription_sharing_unsupported_capability', param: 'input_image' } },
        { status: 400 },
      ),
    )
    const error = (await run(api, { images: true }).promise.catch((e: unknown) => e)) as Error
    expect(error.message).toContain('input_image')
  })

  it('marks a stream that ended before it completed so the loop may send the turn again', async () => {
    const api = fakeApi(() => sse([]))
    const error = (await run(api).promise.catch((e: unknown) => e)) as Error
    expect(error.message).toContain('(empty stream)')
  })

  it('reports a failure inside the stream', async () => {
    const api = fakeApi(() =>
      sse([
        {
          type: 'response.failed',
          response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } },
        },
      ]),
    )
    const error = await run(api).promise.catch((e: unknown) => e)
    expect(aiStreamErrorFields(error)).toEqual({
      errorCode: 'rate-limit',
      errorProvider: 'chatgpt',
    })
  })

  // the API reference puts the error on the event; Codex reads it as `error: { code, message }`
  it('reads an error event with its error nested, as well as one with it on the event', async () => {
    const nested = fakeApi(() =>
      sse([
        {
          type: 'error',
          error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'limit' },
        },
      ]),
    )
    expect(aiStreamErrorFields(await run(nested).promise.catch((e: unknown) => e))).toEqual({
      errorCode: 'rate-limit',
      errorProvider: 'chatgpt',
    })

    const named = fakeApi(() =>
      sse([{ type: 'error', error: { code: 'model_not_found', message: 'No such model' } }]),
    )
    const namedError = (await run(named).promise.catch((e: unknown) => e)) as Error
    expect(namedError.message).toContain('No such model')
    expect(namedError.message).not.toContain('request failed')

    const flat = fakeApi(() =>
      sse([{ type: 'error', code: 'server_error', message: 'Something broke', param: null }]),
    )
    const flatError = (await run(flat).promise.catch((e: unknown) => e)) as Error
    expect(flatError.message).toContain('Something broke')
  })

  it('refuses a model name that is not a model slug', async () => {
    const api = fakeApi(() => sse([]))
    const error = (await run(api, { model: '--flag x' }).promise.catch((e: unknown) => e)) as Error
    expect(error.message).toContain('Invalid ChatGPT model name')
    expect(api.calls).toEqual([])
  })
})

describe('a one-shot ChatGPT chat', () => {
  it('returns the text as it came', async () => {
    const api = fakeApi(() => sse(answer('Hello there')))
    const result = await chatChatGpt(
      { apiKey: '', model: 'gpt-5.6-sol' },
      'Be brief.',
      'Hi',
      new AbortController().signal,
      { fetch: api.fetch, connection: connection() },
    )
    expect(result).toEqual({ ok: true, content: 'Hello there' })
  })
})

describe('the model catalog', () => {
  it('keeps listed entries with a slug, labelled with their display name', () => {
    expect(
      chatGptModelsOf({
        models: [
          { slug: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol', visibility: 'list' },
          { slug: 'secret', visibility: 'hide' },
          { slug: '--bad', display_name: 'Bad' },
          { display_name: 'No slug' },
        ],
      }),
    ).toEqual([{ id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }])
    expect(chatGptModelsOf(null)).toEqual([])
  })
})
