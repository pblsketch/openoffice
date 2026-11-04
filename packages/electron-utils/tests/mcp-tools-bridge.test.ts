import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MCP_TOOLS_BRIDGE_KEY,
  MCP_TOOLS_CHANNELS,
  mcpCallIdOf,
  mcpServerNameOf,
  mcpToolCallRequestOf,
} from '../src/mcp-tools-channels'
import { mcpToolsBridge } from '../src/mcp-tools-bridge'

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
}))

beforeEach(() => {
  electronMocks.invoke.mockReset()
  electronMocks.on.mockReset()
  electronMocks.removeListener.mockReset()
})

describe('MCP tools channels', () => {
  it('names one bridge and prefixes every channel with mcp-tools:', () => {
    expect(MCP_TOOLS_BRIDGE_KEY).toBe('aiOfficeMcpTools')
    const names = Object.values(MCP_TOOLS_CHANNELS)
    expect(names.every((n) => n.startsWith('mcp-tools:'))).toBe(true)
    expect(new Set(names).size).toBe(names.length)
  })

  it('reads a call request as untrusted data', () => {
    expect(
      mcpToolCallRequestOf({ server: 'law', tool: 'search', input: { q: 1 }, callId: 'c1', x: 1 }),
    ).toEqual({ server: 'law', tool: 'search', input: { q: 1 }, callId: 'c1' })
    expect(mcpToolCallRequestOf({ server: 'law', tool: 'search', callId: 'c1' })).toEqual({
      server: 'law',
      tool: 'search',
      input: {},
      callId: 'c1',
    })
    expect(mcpToolCallRequestOf({ server: 'law', tool: 'search', input: [], callId: 'c' })).toBe(
      undefined,
    )
    expect(mcpToolCallRequestOf({ server: '', tool: 'search', callId: 'c' })).toBeUndefined()
    expect(mcpToolCallRequestOf(null)).toBeUndefined()
    expect(mcpCallIdOf('x'.repeat(201))).toBeUndefined()
    expect(mcpServerNameOf(3)).toBeUndefined()
  })
})

describe('MCP tools bridge', () => {
  it('has the calls agent-core’s bridge check expects', () => {
    const bridge = mcpToolsBridge()
    for (const key of ['list', 'call', 'cancel', 'onChanged', 'retry', 'openSettings']) {
      expect(typeof (bridge as unknown as Record<string, unknown>)[key]).toBe('function')
    }
  })

  it('sends a call with its id and answers a refusal when the shell is not there', async () => {
    electronMocks.invoke.mockResolvedValueOnce({ content: [] })
    const bridge = mcpToolsBridge()
    expect(await bridge.call('law', 'search', { q: 'x' }, 'c1')).toEqual({ content: [] })
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(MCP_TOOLS_CHANNELS.call, {
      server: 'law',
      tool: 'search',
      input: { q: 'x' },
      callId: 'c1',
    })
    electronMocks.invoke.mockRejectedValueOnce(new Error('No handler registered'))
    expect(await bridge.call('law', 'search', {}, 'c2')).toEqual({
      ok: false,
      error: 'The MCP connection did not answer.',
    })
    electronMocks.invoke.mockRejectedValueOnce(new Error('No handler registered'))
    expect(await bridge.list()).toEqual([])
  })

  it('listens for changes and stops listening', () => {
    const bridge = mcpToolsBridge()
    const listener = vi.fn()
    const off = bridge.onChanged(listener)
    const handler = electronMocks.on.mock.calls[0]?.[1] as () => void
    expect(electronMocks.on.mock.calls[0]?.[0]).toBe(MCP_TOOLS_CHANNELS.changed)
    handler()
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    expect(electronMocks.removeListener).toHaveBeenCalledWith(MCP_TOOLS_CHANNELS.changed, handler)
  })

  it('cancels, retries and opens Settings by name', async () => {
    electronMocks.invoke.mockResolvedValue({ ok: true })
    const bridge = mcpToolsBridge()
    await bridge.cancel('c1')
    await bridge.retry('law')
    await bridge.openSettings('law')
    expect(electronMocks.invoke.mock.calls).toEqual([
      [MCP_TOOLS_CHANNELS.cancel, 'c1'],
      [MCP_TOOLS_CHANNELS.retry, 'law'],
      [MCP_TOOLS_CHANNELS.openSettings, 'law'],
    ])
  })
})
