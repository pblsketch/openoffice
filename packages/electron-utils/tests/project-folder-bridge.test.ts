import { describe, expect, it, vi } from 'vitest'
import {
  PROJECT_FOLDER_CHANNELS,
  PROJECT_FOLDER_EVENTS,
  PROJECT_FOLDER_LISTEN_CHANNEL,
  type ProjectFolderApi,
} from '@genoffice/project-store/folder-api'
import { projectFolderBridge, type ProjectFolderBridgeIpc } from '../src/project-folder-bridge'

type Listener = (event: unknown, payload: unknown) => void

function fakeIpc() {
  const handlers = new Map<string, Set<Listener>>()
  const ipc = {
    invoke: vi.fn(async (channel: string, args?: unknown) => ({ channel, args })),
    send: vi.fn(),
    on: vi.fn((channel: string, listener: Listener) => {
      const set = handlers.get(channel) ?? new Set<Listener>()
      set.add(listener)
      handlers.set(channel, set)
      return ipc
    }),
    removeListener: vi.fn((channel: string, listener: Listener) => {
      handlers.get(channel)?.delete(listener)
      return ipc
    }),
  }
  const emit = (channel: string, payload: unknown) => {
    for (const listener of handlers.get(channel) ?? []) listener({}, payload)
  }
  return { ipc, emit, handlers }
}

const EVENT_METHODS = [
  'onChatMessageAppended',
  'onOpenChat',
  'onOpenProjectScreen',
  'onProjectChanged',
] as const

describe('projectFolderBridge', () => {
  it('has every method of the bridge contract', () => {
    const { ipc } = fakeIpc()
    const bridge = projectFolderBridge(ipc as unknown as ProjectFolderBridgeIpc)
    const expected = [...Object.keys(PROJECT_FOLDER_CHANNELS), ...EVENT_METHODS].sort()
    expect(Object.keys(bridge).sort()).toEqual(expected)
    for (const name of expected) {
      expect(typeof bridge[name as keyof ProjectFolderApi], name).toBe('function')
    }
  })

  it('invokes each request on its channel, passing the argument as given', async () => {
    const { ipc } = fakeIpc()
    const bridge = projectFolderBridge(ipc as unknown as ProjectFolderBridgeIpc)
    await bridge.listProjects()
    expect(ipc.invoke).toHaveBeenLastCalledWith(PROJECT_FOLDER_CHANNELS.listProjects)
    await bridge.openChat({ projectId: 'p1', chatId: 'c1' })
    expect(ipc.invoke).toHaveBeenLastCalledWith(PROJECT_FOLDER_CHANNELS.openChat, {
      projectId: 'p1',
      chatId: 'c1',
    })
    await bridge.attachDocument({ projectId: 'p1', chatId: 'c1' })
    expect(ipc.invoke).toHaveBeenLastCalledWith(PROJECT_FOLDER_CHANNELS.attachDocument, {
      projectId: 'p1',
      chatId: 'c1',
    })
  })

  it('passes a failed request on as a rejection', async () => {
    const { ipc } = fakeIpc()
    ipc.invoke.mockRejectedValueOnce(new Error('unknown project'))
    const bridge = projectFolderBridge(ipc as unknown as ProjectFolderBridgeIpc)
    await expect(bridge.readContext({ projectId: 'p1' })).rejects.toThrow('unknown project')
  })

  it('delivers events to listeners until they unsubscribe', () => {
    const { ipc, emit } = fakeIpc()
    const bridge = projectFolderBridge(ipc as unknown as ProjectFolderBridgeIpc)
    const seen: unknown[] = []
    const off = bridge.onOpenChat((event) => seen.push(event))
    emit(PROJECT_FOLDER_EVENTS.onOpenChat, { projectId: 'p1', chatId: 'c1' })
    off()
    off()
    emit(PROJECT_FOLDER_EVENTS.onOpenChat, { projectId: 'p1', chatId: 'c2' })
    expect(seen).toEqual([{ projectId: 'p1', chatId: 'c1' }])
  })

  it('delivers project changes on their own channel', () => {
    const { ipc, emit } = fakeIpc()
    const bridge = projectFolderBridge(ipc as unknown as ProjectFolderBridgeIpc)
    const seen: unknown[] = []
    const off = bridge.onProjectChanged((event) => seen.push(event))
    expect(ipc.send).toHaveBeenLastCalledWith(PROJECT_FOLDER_LISTEN_CHANNEL, {
      method: 'onProjectChanged',
      listening: true,
    })
    emit(PROJECT_FOLDER_EVENTS.onProjectChanged, { projectId: 'p1', part: 'memory' })
    off()
    expect(seen).toEqual([{ projectId: 'p1', part: 'memory' }])
  })

  it('tells main when the first listener of an event comes and the last one goes', () => {
    const { ipc } = fakeIpc()
    const bridge = projectFolderBridge(ipc as unknown as ProjectFolderBridgeIpc)
    const one = bridge.onOpenProjectScreen(() => undefined)
    const two = bridge.onOpenProjectScreen(() => undefined)
    expect(ipc.send.mock.calls).toEqual([
      [PROJECT_FOLDER_LISTEN_CHANNEL, { method: 'onOpenProjectScreen', listening: true }],
    ])
    one()
    expect(ipc.send).toHaveBeenCalledTimes(1)
    two()
    expect(ipc.send).toHaveBeenLastCalledWith(PROJECT_FOLDER_LISTEN_CHANNEL, {
      method: 'onOpenProjectScreen',
      listening: false,
    })
  })
})
