import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { MCP_TOOLS_CHANNELS } from '@genoffice/electron-utils/mcp-tools-channels'
import type { McpHub } from '../../src/main/mcp-client/hub'
import {
  MCP_SETTINGS_CHANNEL_NAMES,
  registerMcpHubIpc,
  type McpIpcEvent,
} from '../../src/main/mcp-client/hub-ipc'
import { MCP_SERVERS_CHANNELS } from '../../src/shared/mcp-servers-api'

type Handler = (event: McpIpcEvent, ...args: unknown[]) => unknown

/** A hub whose every method records that it ran */
function spyHub(): McpHub & { ran: string[] } {
  const ran: string[] = []
  const listeners = new Set<() => void>()
  const hub = new Proxy(
    { ran },
    {
      get(target, prop) {
        if (prop === 'ran') return target.ran
        if (prop === 'onChanged') {
          return (listener: () => void) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          }
        }
        if (prop === 'emit') return () => listeners.forEach((l) => l())
        return (...args: unknown[]) => {
          ran.push(String(prop))
          return { ok: true, args }
        }
      },
    },
  )
  return hub as unknown as McpHub & { ran: string[] }
}

function register() {
  const handlers = new Map<string, Handler>()
  const hub = spyHub()
  const shell = { id: 1 }
  const editor = { id: 7 }
  const sent: { to: number; channel: string; payload: unknown[] }[] = []
  const win = (id: number) => ({
    isDestroyed: () => false,
    send: (channel: string, ...payload: unknown[]) => sent.push({ to: id, channel, payload }),
  })
  registerMcpHubIpc({
    hub,
    ipcMain: { handle: (channel, listener) => handlers.set(channel, listener) },
    isSettingsSender: (sender) => sender === shell,
    allWindows: () => [win(1), win(7)],
    settingsWindow: () => win(1),
  })
  return { handlers, hub, shell, editor, sent }
}

describe('MCP hub channels', () => {
  it('answers the settings channels for the shell window only', async () => {
    const { handlers, hub, shell, editor } = register()
    const settings = Object.values(MCP_SERVERS_CHANNELS).filter(
      (c) => c !== MCP_SERVERS_CHANNELS.changed && c !== MCP_SERVERS_CHANNELS.openServer,
    )
    for (const channel of settings) {
      const handler = handlers.get(channel)
      expect(handler, channel).toBeTypeOf('function')
      await handler!({ sender: editor }, 'server-id', 'tool', 'ask')
    }
    // nothing ran for the editor
    expect(hub.ran).toEqual([])
    await handlers.get(MCP_SERVERS_CHANNELS.remove)!({ sender: shell }, 'server-id')
    await handlers.get(MCP_SERVERS_CHANNELS.list)!({ sender: shell })
    expect(hub.ran).toEqual(['remove', 'settingsView'])
  })

  it('keeps the AI windows’ channels apart from Settings’, and the editor bridge free of them', () => {
    const tools = Object.values(MCP_TOOLS_CHANNELS)
    for (const channel of tools) expect(MCP_SETTINGS_CHANNEL_NAMES).not.toContain(channel)
    const bridge = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        'packages',
        'electron-utils',
        'src',
        'mcp-tools-bridge.ts',
      ),
      'utf8',
    )
    expect(bridge).not.toMatch(/mcp-servers:|MCP_SERVERS_CHANNELS|mcp-servers-api/)
    for (const channel of MCP_SETTINGS_CHANNEL_NAMES) expect(bridge).not.toContain(channel)
  })

  it('reads AI window requests as untrusted and keys call ids by window', async () => {
    const { handlers, hub, editor } = register()
    const call = handlers.get(MCP_TOOLS_CHANNELS.call)!
    expect(await call({ sender: editor }, { server: 'law', tool: 'search' })).toEqual({
      ok: false,
      error: 'The MCP call was malformed.',
    })
    expect(
      await call({ sender: editor }, { server: 'law', tool: 'search', input: [], callId: 'c' }),
    ).toMatchObject({ ok: false })
    expect(hub.ran).toEqual([])
    const answer = (await call(
      { sender: editor },
      { server: 'law', tool: 'search', input: { q: 1 }, callId: 'c1' },
    )) as { args: unknown[] }
    expect(answer.args).toEqual(['7', 'law', 'search', { q: 1 }, 'c1'])
    await handlers.get(MCP_TOOLS_CHANNELS.cancel)!({ sender: editor }, 'c1')
    expect(hub.ran).toEqual(['call', 'cancel'])
  })

  it('tells every window of a change, and the shell window with the settings view', () => {
    const { hub, sent } = register()
    ;(hub as unknown as { emit(): void }).emit()
    expect(sent.filter((s) => s.channel === MCP_TOOLS_CHANNELS.changed).map((s) => s.to)).toEqual([
      1, 7,
    ])
    const settings = sent.filter((s) => s.channel === MCP_SERVERS_CHANNELS.changed)
    expect(settings.map((s) => s.to)).toEqual([1])
  })

  it('refuses a malformed settings request without running anything', async () => {
    const { handlers, hub, shell } = register()
    expect(await handlers.get(MCP_SERVERS_CHANNELS.add)!({ sender: shell }, { kind: 'x' })).toEqual(
      {
        ok: false,
        problem: 'invalid',
      },
    )
    expect(
      await handlers.get(MCP_SERVERS_CHANNELS.setToolPermission)!(
        { sender: shell },
        'id',
        'tool',
        'sometimes',
      ),
    ).toEqual({ ok: false, problem: 'invalid' })
    // "allow to run" names the plan the person saw; without it nothing is approved
    const approve = handlers.get(MCP_SERVERS_CHANNELS.approveLaunch)!
    expect(await approve({ sender: shell }, 'id')).toEqual({ ok: false, problem: 'invalid' })
    expect(await approve({ sender: shell }, 'id', 'sha256:short')).toEqual({
      ok: false,
      problem: 'invalid',
    })
    expect(hub.ran).toEqual([])
    const plan = `sha256:${'0'.repeat(64)}`
    expect(await approve({ sender: shell }, 'id', plan)).toMatchObject({ args: ['id', plan] })
    expect(hub.ran).toEqual(['approveLaunch'])
    vi.restoreAllMocks()
  })

  it('stops the calls of a window when it is destroyed, watching each window once', async () => {
    const { handlers, hub } = register()
    const listeners: (() => void)[] = []
    const window = {
      id: 9,
      once: vi.fn((event: string, listener: () => void) => {
        if (event === 'destroyed') listeners.push(listener)
      }),
    }
    const call = handlers.get(MCP_TOOLS_CHANNELS.call)!
    const request = { server: 'law', tool: 'search', input: {}, callId: 'c1' }
    await call({ sender: window }, request)
    await call({ sender: window }, { ...request, callId: 'c2' })
    expect(window.once).toHaveBeenCalledTimes(1)
    expect(hub.ran).toEqual(['call', 'call'])
    listeners[0]!()
    expect(hub.ran).toEqual(['call', 'call', 'cancelCaller'])
  })
})
