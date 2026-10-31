import { describe, expect, it } from 'vitest'
import {
  AgentLoop,
  COMPLETED_VIA_TOOLS_TEXT,
  type AgentMessage,
  type AgentStreamCallbacks,
  type AgentTransport,
} from '../src'

function scriptedTransport(script: Array<(cb: AgentStreamCallbacks) => void>): AgentTransport & {
  requests: Array<{ messages: AgentMessage[] }>
} {
  let turn = 0
  const transport = {
    requests: [] as Array<{ messages: AgentMessage[] }>,
    stream(request: { messages: AgentMessage[] }, cb: AgentStreamCallbacks) {
      transport.requests.push({ messages: [...request.messages] })
      const step = script[turn++]
      if (step) queueMicrotask(() => step(cb))
      return { cancel: () => queueMicrotask(() => cb.onDone()) }
    },
  }
  return transport
}

const skill = {
  id: 'test',
  systemPrompt: 'system',
  tools: [],
  executeTool: () => ({ output: 'ok', summary: 'ok' }),
}

const reply =
  (text: string) =>
  (cb: AgentStreamCallbacks): void => {
    cb.onDelta(text)
    cb.onDone()
  }

const flush = () => new Promise((r) => setTimeout(r, 0))

const texts = (messages: readonly AgentMessage[]) =>
  messages.map((m) => (m.role === 'tool' ? 'tool' : `${m.role}:${m.text}`))

describe('AgentLoop.appendHistory', () => {
  it('adds messages after the existing history without resetting it', async () => {
    const transport = scriptedTransport([reply('first answer'), reply('second answer')])
    const loop = new AgentLoop({ transport, skill })
    loop.run('first')
    await flush()
    expect(
      loop.appendHistory([
        { role: 'user', text: 'other window asks' },
        { role: 'assistant', text: 'other window answer' },
      ]),
    ).toBe(2)
    expect(texts(loop.messages)).toEqual([
      'user:first',
      'assistant:first answer',
      'user:other window asks',
      'assistant:other window answer',
    ])
    loop.run('second')
    await flush()
    expect(texts(transport.requests[1]!.messages)).toEqual([
      'user:first',
      'assistant:first answer',
      'user:other window asks',
      'assistant:other window answer',
      'user:second',
    ])
  })

  it('works on an empty loop like a restore', () => {
    const loop = new AgentLoop({ transport: scriptedTransport([]), skill })
    expect(
      loop.appendHistory([
        { role: 'user', text: 'q' },
        { role: 'assistant', text: 'a' },
      ]),
    ).toBe(2)
    expect(texts(loop.messages)).toEqual(['user:q', 'assistant:a'])
  })

  it('refuses while a run is in flight and leaves the history alone', async () => {
    let held: AgentStreamCallbacks | undefined
    const transport: AgentTransport = {
      stream(_request, cb) {
        held = cb
        return { cancel: () => cb.onDone() }
      },
    }
    const loop = new AgentLoop({ transport, skill })
    loop.run('mine')
    await flush()
    expect(loop.busy).toBe(true)
    expect(
      loop.appendHistory([
        { role: 'user', text: 'x' },
        { role: 'assistant', text: 'y' },
      ]),
    ).toBe(0)
    expect(texts(loop.messages)).toEqual(['user:mine'])
    held!.onDelta('done')
    held!.onDone()
    await flush()
    expect(loop.busy).toBe(false)
  })

  it('keeps only answered exchanges: an unanswered user message or a lone reply is left out', () => {
    const loop = new AgentLoop({ transport: scriptedTransport([]), skill })
    loop.appendHistory([
      { role: 'assistant', text: 'reply with no question' },
      { role: 'user', text: 'asked' },
      { role: 'assistant', text: 'answered' },
      { role: 'user', text: 'still waiting' },
    ])
    expect(texts(loop.messages)).toEqual(['user:asked', 'assistant:answered'])
  })

  it('carries text only and gives an empty reply the placeholder', () => {
    const loop = new AgentLoop({ transport: scriptedTransport([]), skill })
    loop.appendHistory([
      { role: 'user', text: 'do it' },
      {
        role: 'assistant',
        text: '',
        toolCalls: [{ id: 't', name: 'x', input: {} }],
        reasoning: 'r',
      },
      { role: 'tool', results: [{ id: 't', name: 'x', output: 'o' }] },
    ])
    expect(loop.messages).toEqual([
      { role: 'user', text: 'do it' },
      { role: 'assistant', text: COMPLETED_VIA_TOOLS_TEXT },
    ])
  })

  it('appends after a restored conversation', () => {
    const loop = new AgentLoop({ transport: scriptedTransport([]), skill })
    loop.restore([
      { role: 'user', text: 'q1' },
      { role: 'assistant', text: 'a1' },
    ])
    loop.appendHistory([
      { role: 'user', text: 'q2' },
      { role: 'assistant', text: 'a2' },
    ])
    expect(texts(loop.messages)).toEqual(['user:q1', 'assistant:a1', 'user:q2', 'assistant:a2'])
  })
})
