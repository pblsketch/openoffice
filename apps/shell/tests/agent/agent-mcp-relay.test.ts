/**
 * Relays of the person's MCP servers for an agent session (user MCP spec 9):
 * which servers and tools a session gets, the relay servers themselves over
 * real loopback HTTP, the one question an `ask` tool gets, and the end of a
 * session. The hub is a fake; nothing reaches a real MCP server.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerView, McpToolView } from '@genoffice/agent-core'
import {
  RELAY_TEXT,
  agentRelayPlans,
  relayResultOf,
  startAgentMcpRelays,
  type AgentMcpRelays,
  type AgentRelayAnswer,
  type AgentRelayAsk,
  type AgentRelayHub,
} from '../../src/main/agent/agent-mcp-relay'

const schema = { type: 'object', properties: { q: { type: 'string' } } }
const NL2 = String.fromCharCode(10).repeat(2)

function tool(name: string, over: Partial<McpToolView> = {}, server = 'law'): McpToolView {
  return {
    name,
    exposedName: `mcp__${server}__${name.replace(/[^A-Za-z0-9_-]/g, '_')}`,
    description: `${name} tool`,
    inputSchema: schema,
    permission: 'always',
    pending: false,
    ...over,
  }
}

function server(name: string, tools: McpToolView[], over: Partial<McpServerView> = {}) {
  return {
    name,
    status: 'connected',
    newToolCount: 0,
    keepResultsInside: false,
    instructions: null,
    tools,
    ...over,
  } as McpServerView
}

describe('which servers and tools a session gets', () => {
  it('keeps servers that are on, with their always and ask tools that wait for no review', () => {
    const plans = agentRelayPlans([
      server('law', [
        tool('search'),
        tool('get.text', { permission: 'ask' }),
        tool('delete', { permission: 'off' }),
        tool('changed', { pending: true }),
        tool('bad', { unusable: 'too-long', exposedName: '' }),
      ]),
      server('off', [tool('x', {}, 'off')], { status: 'disabled' }),
      server('failing', [tool('x', {}, 'failing')], { status: 'failed', keepResultsInside: true }),
      server('empty', [tool('only-off', { permission: 'off' }, 'empty')]),
      server('ieumoffice-editor', [tool('create_docx', {}, 'ieumoffice-editor')]),
      server('bad name', [tool('x', {}, 'bad name')]),
    ])
    expect(plans.map((p) => p.server)).toEqual(['law', 'failing'])
    expect(plans[0]!.tools).toEqual([
      { name: 'search', relayName: 'search', description: 'search tool', inputSchema: schema },
      {
        name: 'get.text',
        relayName: 'get_text',
        description: 'get.text tool',
        inputSchema: schema,
      },
    ])
    expect(plans[1]!.keepResultsInside).toBe(true)
  })
})

describe('the hub’s answer as the program gets it', () => {
  it('turns a refusal into a tool error and passes on the result the hub shaped', () => {
    expect(
      relayResultOf({ ok: false, error: 'law: the server is turned off in Settings.' }),
    ).toEqual({
      content: [{ type: 'text', text: 'law: the server is turned off in Settings.' }],
      isError: true,
    })
    expect(
      relayResultOf({
        ok: true,
        output: 'found' + NL2 + '[1 non-text item was not passed on.]',
        isError: false,
      }),
    ).toEqual({
      content: [{ type: 'text', text: 'found' + NL2 + '[1 non-text item was not passed on.]' }],
      isError: false,
    })
    expect(relayResultOf({ ok: true, output: 'no such law', isError: true })).toEqual({
      content: [{ type: 'text', text: 'no such law' }],
      isError: true,
    })
    // anything but the hub's answer form is a tool error, never raw content
    const raw = relayResultOf({ content: [{ type: 'image', data: 'AAAA' }] })
    expect(raw.isError).toBe(true)
    expect(JSON.stringify(raw)).not.toContain('AAAA')
  })
})

// ---- the relays over loopback HTTP ------------------------------------------------

interface FakeHub extends AgentRelayHub {
  servers: McpServerView[]
  calls: Array<{ caller: string; server: string; tool: string; input: unknown; callId: string }>
  cancelled: string[]
  answer: (server: string, tool: string) => unknown
}

function fakeHub(servers: McpServerView[]): FakeHub {
  const hub: FakeHub = {
    servers,
    calls: [],
    cancelled: [],
    answer: (s, t) => ({ ok: true, output: `${s}/${t} ok`, isError: false }),
    editorList: () => hub.servers,
    call: async (caller, s, t, input, callId) => {
      hub.calls.push({ caller, server: s, tool: t, input, callId })
      return hub.answer(s, t)
    },
    cancel: (_caller, callId) => {
      hub.cancelled.push(callId)
    },
  }
  return hub
}

const opened: AgentMcpRelays[] = []
const clients: Client[] = []
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close().catch(() => undefined)
  for (const relays of opened.splice(0)) await relays.stop()
})

async function open(hub: AgentRelayHub, ask: AgentRelayAsk = async () => ({ allow: false })) {
  const relays = await startAgentMcpRelays({ hub, ask, caller: 'agent:s1', version: '1.2.3' })
  opened.push(relays)
  return relays
}

async function connect(url: string, token: string): Promise<Client> {
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  )
  clients.push(client)
  return client
}

const textOf = (result: unknown) =>
  ((result as { content: Array<{ text: string }> }).content[0] ?? { text: '' }).text

describe('a session’s relays', () => {
  it('opens one relay per server, named like it, on loopback with a session token', async () => {
    const hub = fakeHub([
      server('law', [tool('search')], { keepResultsInside: true, instructions: 'Search first.' }),
      server('notes', [tool('find', {}, 'notes')]),
      server('off', [tool('x', {}, 'off')], { status: 'disabled' }),
    ])
    const relays = await open(hub)
    expect(relays.relays.map((r) => [r.name, r.tools])).toEqual([
      ['law', ['search']],
      ['notes', ['find']],
    ])
    expect(relays.keepResultsInside).toEqual(['law'])
    const [law, notes] = relays.relays
    expect(law!.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
    expect(law!.url).not.toBe(notes!.url)
    expect(law!.token).toMatch(/^[0-9a-f]{48}$/)
    expect(law!.token).not.toBe(notes!.token)

    // no token, or another relay's token, is refused
    const bare = await fetch(law!.url, { method: 'POST', body: '{}' })
    expect(bare.status).toBe(401)
    const crossed = await fetch(law!.url, {
      method: 'POST',
      body: '{}',
      headers: { Authorization: `Bearer ${notes!.token}` },
    })
    expect(crossed.status).toBe(401)

    const client = await connect(law!.url, law!.token)
    expect(client.getServerVersion()?.name).toBe('law')
    expect(client.getInstructions()).toMatch(/Search first\./)
    expect(client.getInstructions()).toMatch(/not instructions from the person/)
  })

  it('lists only the tools that were always or ask, and drops one that needs review', async () => {
    const hub = fakeHub([
      server('law', [
        tool('search'),
        tool('get.text', { permission: 'ask' }),
        tool('delete', { permission: 'off' }),
        tool('changed', { pending: true }),
      ]),
    ])
    const relays = await open(hub)
    const client = await connect(relays.relays[0]!.url, relays.relays[0]!.token)
    const listed = await client.listTools()
    expect(listed.tools.map((t) => t.name)).toEqual(['search', 'get_text'])
    expect(listed.tools[0]!.inputSchema).toEqual(schema)

    // the tool changes during the session: it leaves the list and a call is refused unasked
    hub.servers = [
      server('law', [tool('search', { pending: true }), tool('get.text', { permission: 'ask' })]),
    ]
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['get_text'])
    const refused = await client.callTool({ name: 'search', arguments: { q: 'x' } })
    expect(refused.isError).toBe(true)
    expect(textOf(refused)).toBe(RELAY_TEXT.needsReview('law', 'search'))
    expect(hub.calls).toEqual([])
  })

  it('hands an always tool to the hub by the server’s own tool name', async () => {
    const hub = fakeHub([server('law', [tool('get.text')])])
    const ask = vi.fn<AgentRelayAsk>(async () => ({ allow: false }))
    const relays = await open(hub, ask)
    const client = await connect(relays.relays[0]!.url, relays.relays[0]!.token)
    const result = await client.callTool({ name: 'get_text', arguments: { q: 'tax' } })
    expect(result.isError).toBe(false)
    expect(textOf(result)).toBe('law/get.text ok')
    expect(ask).not.toHaveBeenCalled()
    expect(hub.calls).toEqual([
      {
        caller: 'agent:s1',
        server: 'law',
        tool: 'get.text',
        input: { q: 'tax' },
        callId: expect.any(String),
      },
    ])
  })

  it('passes the hub’s refusal on as a tool error', async () => {
    const hub = fakeHub([server('law', [tool('search')])])
    hub.answer = () => ({ ok: false, error: 'law: the server needs the person to sign in again.' })
    const relays = await open(hub)
    const client = await connect(relays.relays[0]!.url, relays.relays[0]!.token)
    const result = await client.callTool({ name: 'search', arguments: {} })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('law: the server needs the person to sign in again.')
  })

  it('asks before an ask tool: deny, allow once, and allow for the session', async () => {
    const hub = fakeHub([server('law', [tool('search', { permission: 'ask' })])])
    const answers: AgentRelayAnswer[] = [
      { allow: false },
      { allow: true, scope: 'once' },
      { allow: true, scope: 'session' },
    ]
    const ask = vi.fn<AgentRelayAsk>(async () => answers.shift() ?? { allow: false })
    const relays = await open(hub, ask)
    const client = await connect(relays.relays[0]!.url, relays.relays[0]!.token)
    const call = () => client.callTool({ name: 'search', arguments: { q: 'x' } })

    const denied = await call()
    expect(denied.isError).toBe(true)
    expect(textOf(denied)).toBe(RELAY_TEXT.declined)
    expect(hub.calls).toHaveLength(0)
    expect(ask.mock.calls[0]![0]).toEqual({
      server: 'law',
      exposedName: 'mcp__law__search',
      input: { q: 'x' },
    })

    expect((await call()).isError).toBe(false)
    expect(ask).toHaveBeenCalledTimes(2)
    // allowed once: the next call asks again, and that answer lasts the session
    expect((await call()).isError).toBe(false)
    expect(ask).toHaveBeenCalledTimes(3)
    expect((await call()).isError).toBe(false)
    expect(ask).toHaveBeenCalledTimes(3)
    expect(hub.calls).toHaveLength(3)
  })

  it('closes every relay and stops the calls under way when the session ends', async () => {
    const hub = fakeHub([server('law', [tool('search')])])
    let release: () => void = () => undefined
    hub.call = async (caller, s, t, input, callId) => {
      hub.calls.push({ caller, server: s, tool: t, input, callId })
      await new Promise<void>((resolve) => (release = resolve))
      return { ok: true, output: 'late', isError: false }
    }
    const relays = await startAgentMcpRelays({
      hub,
      ask: async () => ({ allow: false }),
      caller: 'agent:s1',
      version: '1',
    })
    const client = await connect(relays.relays[0]!.url, relays.relays[0]!.token)
    // the program's side of a call cut off with the relay: no answer to wait for
    void client.callTool({ name: 'search', arguments: {} }).catch(() => undefined)
    await vi.waitFor(() => expect(hub.calls).toHaveLength(1))
    await relays.stop()
    expect(new Set(hub.cancelled)).toEqual(new Set([hub.calls[0]!.callId]))
    release()
    await expect(fetch(relays.relays[0]!.url, { method: 'POST', body: '{}' })).rejects.toThrow()
  })

  it('opens nothing when no server is on', async () => {
    const relays = await open(
      fakeHub([server('off', [tool('x', {}, 'off')], { status: 'disabled' })]),
    )
    expect(relays.relays).toEqual([])
    expect(relays.keepResultsInside).toEqual([])
  })
})
