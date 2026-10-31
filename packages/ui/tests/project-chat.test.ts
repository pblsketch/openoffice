/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentMessage } from '@genoffice/agent-core'
import {
  createProjectChatController,
  useProjectChat,
  type ProjectChat,
  type ProjectChatOpened,
  type ProjectChatEntry,
  type ProjectChatOptions,
} from '../src/use-project-chat'
import { chatMessage, fakeProjectBridge, flush } from './project-fake-bridge'

function fakeLoop() {
  const loop = {
    busy: false,
    history: [] as AgentMessage[],
    appendHistory: vi.fn((messages: readonly AgentMessage[]) => {
      if (loop.busy) return 0
      loop.history.push(...messages)
      return messages.length
    }),
  }
  return loop
}

function setup(
  init: Parameters<typeof fakeProjectBridge>[0] = {},
  extra: Partial<ProjectChatOptions> = {},
) {
  const fake = fakeProjectBridge(init)
  const loop = fakeLoop()
  const opened: ProjectChatOpened[] = []
  const remote: ProjectChatEntry[] = []
  const legacyApi = {
    loadChat: vi.fn(async () => [
      { seq: 1, ts: 't', role: 'user' as const, text: 'old q' },
      { seq: 2, ts: 't', role: 'assistant' as const, text: 'old a' },
    ]),
    appendChat: vi.fn(async () => undefined),
  }
  const controller = createProjectChatController({
    editor: 'hwp',
    bridge: fake.bridge,
    legacyApi,
    loop: () => loop,
    onOpen: (o) => opened.push(o),
    onRemoteMessage: (m) => remote.push(m),
    ...extra,
  })
  return { fake, loop, opened, remote, legacyApi, controller }
}

const P1 = { projectId: 'p1', initialChatId: null }

describe('without a bridge or without a project (today’s behavior)', () => {
  it('a window without the bridge stays as it is', async () => {
    const opened: ProjectChatOpened[] = []
    const controller = createProjectChatController({
      editor: 'docs',
      bridge: null,
      loop: () => null,
      onOpen: (o) => opened.push(o),
    })
    await controller.start()
    expect(controller.getState()).toMatchObject({
      available: false,
      ready: true,
      projectId: null,
      chat: null,
    })
    expect(controller.persist({ role: 'user', text: 'hi' })).toBe(false)
    expect(await controller.newChat()).toBe(false)
    expect(await controller.prepareSend()).toEqual({ status: 'none' })
    expect(opened).toEqual([])
  })

  it('a window with no project chosen leaves its chat to the per-document store', async () => {
    const { controller, fake, opened } = setup()
    await controller.start()
    expect(controller.getState()).toMatchObject({ available: true, ready: true, projectId: null })
    expect(opened).toEqual([])
    expect(controller.persist({ role: 'user', text: 'hi' })).toBe(false)
    expect(await controller.newChat()).toBe(false)
    expect(await controller.prepareSend()).toEqual({ status: 'none' })
    expect(fake.bridge.appendChat).not.toHaveBeenCalled()
    expect(fake.bridge.newChat).not.toHaveBeenCalled()
    expect(fake.bridge.readContext).not.toHaveBeenCalled()
  })

  it('reports not ready (persist goes the old way) until the selection is known', () => {
    const { controller } = setup({ selection: P1 })
    expect(controller.getState().ready).toBe(false)
    expect(controller.persist({ role: 'user', text: 'early' })).toBe(false)
  })
})

describe('the chat a document opens with (spec 5.3.1)', () => {
  it('opens the chat main chose, with display entries and the model input', async () => {
    const { controller, fake, opened } = setup({
      selection: { projectId: 'p1', initialChatId: 'c7' },
      chats: {
        c7: [
          chatMessage({ seq: 1, role: 'user', text: 'q', editor: 'hwp' }),
          chatMessage({ seq: 2, role: 'assistant', text: 'a', editor: 'hwp' }),
        ],
      },
    })
    await controller.start()
    expect(fake.bridge.openChat).toHaveBeenCalledWith({ projectId: 'p1', chatId: 'c7', limit: 200 })
    expect(opened).toHaveLength(1)
    const o = opened[0]!
    expect(o.kind).toBe('project')
    if (o.kind !== 'project') return
    expect(o.chatId).toBe('c7')
    expect(o.entries.map((e) => e.text)).toEqual(['q', 'a'])
    expect(o.model).toEqual([
      { role: 'user', text: 'q' },
      { role: 'assistant', text: 'a' },
    ])
    expect(controller.getState()).toMatchObject({
      ready: true,
      projectId: 'p1',
      chat: { kind: 'project', projectId: 'p1', chatId: 'c7' },
    })
    await flush()
    expect(controller.getState().chats.map((c) => c.id)).toEqual(['c7'])
  })

  it('starts an empty new chat when main has none to open', async () => {
    const { controller, fake, opened } = setup({ selection: P1 })
    await controller.start()
    expect(fake.bridge.newChat).toHaveBeenCalledWith({ projectId: 'p1' })
    expect(opened).toEqual([
      expect.objectContaining({
        kind: 'project',
        chatId: 'new1',
        entries: [],
        model: [],
        isNew: true,
      }),
    ])
  })

  it('starts a new chat when the chosen chat cannot be opened', async () => {
    const { controller, opened } = setup({ selection: { projectId: 'p1', initialChatId: 'gone' } })
    await controller.start()
    expect(opened).toEqual([expect.objectContaining({ kind: 'project', chatId: 'new1' })])
  })
})

describe('choosing a project in the middle of a chat (spec 5.3.5)', () => {
  it('starts a new chat in the new project; the old chat is left where it was', async () => {
    const { controller, fake, opened } = setup({
      selection: { projectId: 'p1', initialChatId: 'c1' },
      chats: { c1: [chatMessage({ seq: 1 }), chatMessage({ seq: 2, role: 'assistant' })] },
    })
    await controller.start()
    await controller.selectProject('p2')
    expect(fake.bridge.setSelection).toHaveBeenCalledWith({ projectId: 'p2' })
    expect(fake.bridge.newChat).toHaveBeenCalledWith({ projectId: 'p2' })
    expect(fake.bridge.deleteChat).not.toHaveBeenCalled()
    expect(opened.at(-1)).toMatchObject({
      kind: 'project',
      projectId: 'p2',
      entries: [],
      isNew: true,
    })
    expect(controller.getState().chat).toMatchObject({ projectId: 'p2' })
  })

  it('goes back to the per-document chat with "no project"', async () => {
    const { controller, opened } = setup({ selection: P1 })
    await controller.start()
    await controller.selectProject(null)
    expect(opened.at(-1)).toEqual({ kind: 'document' })
    expect(controller.getState()).toMatchObject({ projectId: null, chat: null, chats: [] })
    expect(controller.persist({ role: 'user', text: 'x' })).toBe(false)
  })

  it('choosing a project from "no project" opens a new project chat', async () => {
    const { controller, opened } = setup()
    await controller.start()
    await controller.selectProject('p1')
    expect(opened).toEqual([
      expect.objectContaining({ kind: 'project', projectId: 'p1', isNew: true }),
    ])
  })

  it('choosing the same project again changes nothing', async () => {
    const { controller, fake, opened } = setup({ selection: P1 })
    await controller.start()
    await controller.selectProject('p1')
    expect(fake.bridge.setSelection).not.toHaveBeenCalled()
    expect(opened).toHaveLength(1)
  })
})

describe('recording messages', () => {
  it('appends to the open project chat in order', async () => {
    const { controller, fake } = setup({ selection: P1 })
    await controller.start()
    expect(controller.persist({ role: 'user', text: 'q', skills: [] })).toBe(true)
    expect(
      controller.persist({ role: 'assistant', text: 'a', tools: [{ name: 't', summary: 's' }] }),
    ).toBe(true)
    await controller.settled()
    expect(fake.appended.map((a) => [a.projectId, a.chatId, a.role, a.text])).toEqual([
      ['p1', 'new1', 'user', 'q'],
      ['p1', 'new1', 'assistant', 'a'],
    ])
    expect(fake.appended[1]!.tools).toEqual([{ name: 't', summary: 's' }])
  })

  it('shows "cannot write" and drops project_remember when the folder refuses the write', async () => {
    const { controller, fake } = setup({ selection: P1 })
    await controller.start()
    fake.state.appendStatus = 'unwritable'
    controller.persist({ role: 'user', text: 'q' })
    await controller.settled()
    expect(controller.getState().unwritable).toBe(true)
    expect(controller.run?.unwritable).toBe(true)
  })

  it('does not swallow a failed write', async () => {
    const { controller, fake } = setup({ selection: P1 })
    await controller.start()
    fake.bridge.appendChat.mockRejectedValueOnce(new Error('disk gone'))
    controller.persist({ role: 'user', text: 'q' })
    await controller.settled()
    expect(controller.getState().unwritable).toBe(true)
  })

  it('reads the chat list again once the first reply makes the chat files', async () => {
    const { controller, fake } = setup({ selection: P1 })
    await controller.start()
    await flush()
    const before = fake.bridge.listChats.mock.calls.length
    controller.persist({ role: 'user', text: 'q' })
    controller.persist({ role: 'assistant', text: 'a' })
    await controller.settled()
    await flush()
    expect(fake.bridge.listChats.mock.calls.length).toBeGreaterThan(before)
  })
})

describe('the same chat in two windows (spec 5.3.3)', () => {
  async function opened() {
    const s = setup({
      selection: { projectId: 'p1', initialChatId: 'c1' },
      chats: {
        c1: [
          chatMessage({ seq: 1, role: 'user', text: 'q1' }),
          chatMessage({ seq: 2, role: 'assistant', text: 'a1' }),
        ],
      },
    })
    await s.controller.start()
    return s
  }

  it('shows a message from the other window at once and sends it from the next request on', async () => {
    const { controller, fake, remote, loop } = await opened()
    fake.emitAppended({
      projectId: 'p1',
      chatId: 'c1',
      message: chatMessage({ seq: 3, role: 'user', text: 'q2', editor: 'docs' }),
    })
    fake.emitAppended({
      projectId: 'p1',
      chatId: 'c1',
      message: chatMessage({ seq: 4, role: 'assistant', text: 'a2', editor: 'docs' }),
    })
    expect(remote.map((r) => r.text)).toEqual(['q2', 'a2'])
    expect(loop.appendHistory).not.toHaveBeenCalled()
    await controller.prepareSend()
    expect(loop.history).toEqual([
      { role: 'user', text: 'q2' },
      { role: 'assistant', text: 'a2' },
    ])
  })

  it('waits for a running request to end before feeding the model', async () => {
    const { controller, fake, remote, loop } = await opened()
    loop.busy = true
    fake.emitAppended({
      projectId: 'p1',
      chatId: 'c1',
      message: chatMessage({ seq: 3, role: 'user', text: 'q2' }),
    })
    fake.emitAppended({
      projectId: 'p1',
      chatId: 'c1',
      message: chatMessage({ seq: 4, role: 'assistant', text: 'a2' }),
    })
    expect(remote).toHaveLength(2)
    expect(loop.history).toEqual([])
    loop.busy = false
    await controller.finishSend()
    expect(loop.history).toEqual([
      { role: 'user', text: 'q2' },
      { role: 'assistant', text: 'a2' },
    ])
    // fed once only
    await controller.prepareSend()
    expect(loop.history).toHaveLength(2)
  })

  it('holds the other window’s question until its answer arrives', async () => {
    const { controller, fake, loop } = await opened()
    fake.emitAppended({
      projectId: 'p1',
      chatId: 'c1',
      message: chatMessage({ seq: 3, role: 'user', text: 'q2' }),
    })
    await controller.prepareSend()
    expect(loop.history).toEqual([])
    await controller.finishSend()
    fake.emitAppended({
      projectId: 'p1',
      chatId: 'c1',
      message: chatMessage({ seq: 4, role: 'assistant', text: 'a2' }),
    })
    await controller.prepareSend()
    expect(loop.history).toEqual([
      { role: 'user', text: 'q2' },
      { role: 'assistant', text: 'a2' },
    ])
  })

  it('pairs an answer with a question that was already in the chat when it opened', async () => {
    const s = setup({
      selection: { projectId: 'p1', initialChatId: 'c1' },
      chats: { c1: [chatMessage({ seq: 1, role: 'user', text: 'asked elsewhere' })] },
    })
    await s.controller.start()
    s.fake.emitAppended({
      projectId: 'p1',
      chatId: 'c1',
      message: chatMessage({ seq: 2, role: 'assistant', text: 'answered elsewhere' }),
    })
    await s.controller.prepareSend()
    expect(s.loop.history).toEqual([
      { role: 'user', text: 'asked elsewhere' },
      { role: 'assistant', text: 'answered elsewhere' },
    ])
  })

  it('ignores messages of another chat and its own echoes', async () => {
    const { controller, fake, remote } = await opened()
    fake.emitAppended({
      projectId: 'p1',
      chatId: 'other',
      message: chatMessage({ seq: 9, text: 'elsewhere' }),
    })
    controller.persist({ role: 'user', text: 'mine' })
    await controller.settled()
    const mine = fake.state.seq
    fake.emitAppended({
      projectId: 'p1',
      chatId: 'c1',
      message: chatMessage({ seq: mine, text: 'mine' }),
    })
    fake.emitAppended({ projectId: 'p1', chatId: 'c1', message: chatMessage({ seq: 2 }) })
    expect(remote).toEqual([])
  })
})

describe('opening a chat on request (project screen, spec 5.12)', () => {
  it('opens chat X when main says so', async () => {
    const { controller, fake, opened } = setup({
      selection: P1,
      chats: { c9: [chatMessage({ seq: 1 }), chatMessage({ seq: 2, role: 'assistant' })] },
    })
    await controller.start()
    fake.emitOpenChat({ projectId: 'p1', chatId: 'c9' })
    await vi.waitFor(() => expect(opened.at(-1)).toMatchObject({ kind: 'project', chatId: 'c9' }))
  })

  it('switches to that project first when another one is chosen', async () => {
    const { controller, fake, opened } = setup({
      selection: P1,
      chats: { c9: [chatMessage({ seq: 1 }), chatMessage({ seq: 2, role: 'assistant' })] },
    })
    await controller.start()
    fake.emitOpenChat({ projectId: 'p2', chatId: 'c9' })
    await vi.waitFor(() =>
      expect(opened.at(-1)).toMatchObject({ kind: 'project', projectId: 'p2', chatId: 'c9' }),
    )
    expect(fake.bridge.setSelection).toHaveBeenCalledWith({ projectId: 'p2' })
    // no extra empty chat was started on the way
    expect(fake.bridge.newChat).toHaveBeenCalledTimes(1)
  })
  it('a request that comes before the selection is known waits for it, then opens', async () => {
    const { controller, fake, opened } = setup({
      selection: { projectId: null, initialChatId: null },
      chats: { c9: [chatMessage({ seq: 1 }), chatMessage({ seq: 2, role: 'assistant' })] },
    })
    const started = controller.start()
    // the home project screen handed it over before the window's selection came back
    controller.openChatRef({ projectId: 'p1', chatId: 'c9' })
    fake.emitOpenChat({ projectId: 'p1', chatId: 'c9' })
    await started
    expect(controller.getState().ready).toBe(true)
    await vi.waitFor(() =>
      expect(opened.at(-1)).toMatchObject({ kind: 'project', projectId: 'p1', chatId: 'c9' }),
    )
    expect(controller.getState().projectId).toBe('p1')
  })
})

describe('a write outside the chat records fails (spec 5.7)', () => {
  it('marks the chosen project unwritable and drops project_remember', async () => {
    const { controller } = setup({ selection: P1 })
    await controller.start()
    expect(controller.getState().unwritable).toBe(false)
    controller.markUnwritable()
    expect(controller.getState().unwritable).toBe(true)
    expect(controller.run?.unwritable).toBe(true)
  })

  it('does nothing with no project chosen', async () => {
    const { controller } = setup()
    await controller.start()
    controller.markUnwritable()
    expect(controller.getState().unwritable).toBe(false)
  })
})

describe('the earlier chat of the document (spec 5.3.4)', () => {
  it('continues it in the old store while the project stays chosen', async () => {
    const { controller, fake, opened, legacyApi } = setup({ selection: P1 })
    fake.bridge.listChats.mockResolvedValue({
      chats: [],
      legacy: { projectId: 'store-proj', chatId: 'doc-chat', updatedAt: 't', approxCount: 2 },
    } as never)
    await controller.start()
    await controller.refreshChats()
    expect(controller.getState().legacy).toMatchObject({ chatId: 'doc-chat' })
    await controller.openLegacy()
    expect(legacyApi.loadChat).toHaveBeenCalledWith({
      projectId: 'store-proj',
      chatId: 'doc-chat',
      limit: 200,
    })
    expect(opened.at(-1)).toMatchObject({
      kind: 'legacy',
      model: [
        { role: 'user', text: 'old q' },
        { role: 'assistant', text: 'old a' },
      ],
    })
    expect(controller.persist({ role: 'user', text: 'more' })).toBe(true)
    await controller.settled()
    expect(legacyApi.appendChat).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'store-proj', chatId: 'doc-chat', text: 'more' }),
    )
    expect(fake.bridge.appendChat).not.toHaveBeenCalled()
    // the project's context still comes along
    expect((await controller.prepareSend()).status).toBe('ok')
  })
})

describe('tool records of another editor (spec 5.3.2)', () => {
  it('collapses them into one summary; memory lines stay', async () => {
    const remember = {
      name: 'project_remember',
      summary: '기억함: x',
      output: 'Memory updated: {"op":"add","text":"x (2026-10-29)"}',
    }
    const { opened, controller } = setup({
      selection: { projectId: 'p1', initialChatId: 'c1' },
      chats: {
        c1: [
          chatMessage({ seq: 1, role: 'user', text: 'q' }),
          chatMessage({
            seq: 2,
            role: 'assistant',
            text: 'a',
            editor: 'docs',
            fileRef: 'report.docx',
            tools: [{ name: 'edit', summary: 'e' }, { name: 'edit', summary: 'e2' }, remember],
          }),
          chatMessage({
            seq: 3,
            role: 'assistant',
            text: 'b',
            editor: 'hwp',
            tools: [{ name: 'insert_text', summary: 'i' }],
          }),
        ],
      },
    })
    await controller.start()
    const o = opened[0]!
    if (o.kind !== 'project') throw new Error('expected a project chat')
    const [, other, mine] = o.entries
    expect(other!.tools).toBeUndefined()
    expect(other!.otherEditorTools).toEqual({ editor: 'docs', fileRef: 'report.docx', count: 3 })
    expect(other!.memory).toEqual([
      { kind: 'added', text: 'x (2026-10-29)', change: { op: 'add', text: 'x (2026-10-29)' } },
    ])
    expect(mine!.tools).toEqual([{ name: 'insert_text', summary: 'i' }])
    expect(mine!.otherEditorTools).toBeUndefined()
  })
})

describe('saving with a new folder (spec 5.3.6)', () => {
  it('keeps the chat and the choice, and asks main to add the document', async () => {
    const { controller, fake, opened } = setup({ selection: P1 })
    const attachDocument = vi.fn(async () => ({ status: 'ok' as const }))
    Object.assign(fake.bridge, { attachDocument })
    await controller.start()
    controller.persist({ role: 'user', text: 'q' })
    controller.persist({ role: 'assistant', text: 'a' })
    await controller.settled()
    await controller.documentSaved()
    expect(attachDocument).toHaveBeenCalledWith({ projectId: 'p1', chatId: 'new1' })
    expect(fake.bridge.getSelection).toHaveBeenCalledTimes(1)
    expect(opened).toHaveLength(1)
    expect(controller.getState().chat).toMatchObject({ projectId: 'p1', chatId: 'new1' })
  })
})

describe('chat list actions', () => {
  it('renames and deletes through the bridge; deleting the open chat starts a new one', async () => {
    const { controller, fake, opened } = setup({ selection: P1 })
    await controller.start()
    await controller.renameChat('new1', 'Budget')
    expect(fake.bridge.renameChat).toHaveBeenCalledWith({
      projectId: 'p1',
      chatId: 'new1',
      title: 'Budget',
    })
    await controller.deleteChat('new1')
    expect(fake.bridge.deleteChat).toHaveBeenCalledWith({ projectId: 'p1', chatId: 'new1' })
    expect(opened.at(-1)).toMatchObject({ kind: 'project', chatId: 'new2', isNew: true })
  })
})

describe('memory lines', () => {
  it('[remove] takes the entry out through the bridge for the chosen project', async () => {
    const { controller, fake } = setup({ selection: P1 })
    await controller.start()
    await controller.forgetMemory({
      kind: 'added',
      text: 'x (2026-10-29)',
      change: { op: 'add', text: 'x (2026-10-29)' },
    })
    expect(fake.bridge.editMemory).toHaveBeenCalledWith({
      projectId: 'p1',
      change: { op: 'remove', text: 'x (2026-10-29)' },
    })
  })
})

describe('the memory a chat knows (memory lines of other windows)', () => {
  const detail = (memoryEntries: string[]) => ({ memoryEntries }) as never

  it('reads the chosen project’s memory and reads it again when the app writes it', async () => {
    const { controller, fake } = setup({ selection: P1 })
    fake.bridge.getProjectDetail.mockResolvedValue(detail(['a (2026-10-30)']))
    await controller.start()
    await flush()
    expect(controller.getState().memoryEntries).toEqual(['a (2026-10-30)'])
    fake.bridge.getProjectDetail.mockResolvedValue(detail([]))
    fake.emitProjectChanged({ projectId: 'other', part: 'memory' })
    await flush()
    expect(controller.getState().memoryEntries).toEqual(['a (2026-10-30)'])
    fake.emitProjectChanged({ projectId: 'p1', part: 'memory' })
    await flush()
    expect(controller.getState().memoryEntries).toEqual([])
  })

  it('reads the chat list again when another window wrote a chat', async () => {
    const { controller, fake } = setup({ selection: P1 })
    await controller.start()
    await flush()
    fake.bridge.listChats.mockClear()
    fake.emitProjectChanged({ projectId: 'p1', part: 'chats' })
    await flush()
    expect(fake.bridge.listChats).toHaveBeenCalledWith({ projectId: 'p1' })
  })

  it('shows what this window’s tools just remembered before the next read lands', async () => {
    const { controller, fake } = setup({ selection: P1 })
    fake.bridge.getProjectDetail.mockResolvedValue(detail([]))
    await controller.start()
    await flush()
    await controller.run!.bridge.remember({
      scope: 's',
      change: { op: 'add', text: 'b (2026-10-30)' },
    })
    expect(fake.bridge.remember).toHaveBeenCalledTimes(1)
    expect(controller.getState().memoryEntries).toEqual(['b (2026-10-30)'])
  })

  it('reads the memory again after a [remove] that found the entry already gone', async () => {
    const { controller, fake } = setup({ selection: P1 })
    fake.bridge.getProjectDetail.mockResolvedValue(detail(['x (2026-10-29)']))
    await controller.start()
    await flush()
    fake.bridge.editMemory.mockResolvedValueOnce({
      status: 'refused',
      reason: 'not-found',
    } as never)
    fake.bridge.getProjectDetail.mockResolvedValue(detail([]))
    const line = {
      kind: 'added' as const,
      text: 'x (2026-10-29)',
      change: { op: 'add' as const, text: 'x (2026-10-29)' },
    }
    expect(await controller.forgetMemory(line)).toEqual({ status: 'refused', reason: 'not-found' })
    await flush()
    expect(controller.getState().memoryEntries).toEqual([])
  })

  it('knows nothing of the memory with no project chosen', async () => {
    const { controller, fake } = setup({ selection: { projectId: null, initialChatId: null } })
    await controller.start()
    await flush()
    expect(controller.getState().memoryEntries).toBeNull()
    expect(fake.bridge.getProjectDetail).not.toHaveBeenCalled()
  })
})

describe('useProjectChat', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  it('starts on mount, renders the state, and stops listening on unmount', async () => {
    const fake = fakeProjectBridge({ selection: P1 })
    let seen: ProjectChat | null = null
    function Panel() {
      seen = useProjectChat({
        editor: 'markdown',
        bridge: fake.bridge,
        loop: () => null,
        onOpen: () => undefined,
      })
      return null
    }
    await act(async () => {
      root.render(createElement(Panel))
    })
    await act(async () => {
      await flush()
    })
    expect(seen!.projectId).toBe('p1')
    expect(seen!.chat).toMatchObject({ kind: 'project', chatId: 'new1' })
    expect(seen!.run).not.toBeNull()
    expect(fake.listening).toBe(true)
    act(() => root.unmount())
    root = createRoot(host)
    expect(fake.listening).toBe(false)
  })
})
