import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PROJECT_FOLDER_CHANNELS,
  PROJECT_FOLDER_EVENTS,
  type ProjectChatAppendedEvent,
  type ProjectChatInfo,
  type ProjectSelection,
  type ProjectTrustPrompt,
} from '@genoffice/project-store'
import type { ChatAppendedListener, ChatSender } from '../src/main/projects/chat-store'
import {
  PROJECT_IPC_BAD_REQUEST,
  PROJECT_IPC_UNKNOWN_WINDOW,
  registerProjectFolderIpc,
  waitForPageReturn,
  type ProjectFolderServices,
  type ProjectIpcController,
  type ProjectIpcDeps,
  type ProjectWindow,
} from '../src/main/projects/project-ipc'
import { PROJECT_SCOPE_UNKNOWN } from '../src/main/projects/project-tools'

/**
 * The project folder request layer (T5) with fake windows, guide, chat store
 * and tools: which window asks decides the document, run scopes belong to the
 * window that opened them, messages reach the other windows showing the chat,
 * and "open this chat / screen" waits for a window that is not listening yet.
 */

const ROOT = join(process.cwd(), 'fake-projects', 'Report')
const DOC = join(ROOT, 'draft.docx')
const OUTSIDE_DOC = join(process.cwd(), 'elsewhere', 'notes.md')

const HOME = 1
const DOCS = 2
const SHEETS = 3
const UNTITLED = 4
const STRANGER = 99
const NEW_TAB = 50

type Handler = (sender: number, args?: unknown) => unknown

function chatInfo(over: Partial<ProjectChatInfo> = {}): ProjectChatInfo {
  return {
    version: 1,
    id: 'c1',
    projectId: 'p1',
    title: 'Plan',
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
    origin: 'me',
    lastEditor: 'docs',
    documents: ['draft.docx'],
    ...over,
  }
}

function setup(extra: Partial<ProjectIpcDeps> = {}) {
  const handlers = new Map<string, Handler>()
  const windows = new Map<number, ProjectWindow>([
    [HOME, { kind: 'home' }],
    [DOCS, { kind: 'editor', editor: 'docs', docPath: DOC }],
    [SHEETS, { kind: 'editor', editor: 'sheets', docPath: OUTSIDE_DOC }],
    [UNTITLED, { kind: 'editor', editor: 'markdown', docPath: null }],
  ])
  const sent: Array<{ target: number; channel: string; payload: unknown }> = []
  const gone = new Set<number>()
  let appended: ChatAppendedListener | null = null

  const selection = (projectId: string | null): ProjectSelection => ({
    projectId,
    initialChatId: null,
  })
  const guide = {
    listProjects: vi.fn(async () => []),
    addFolder: vi.fn(async (_path: string, ask: (p: ProjectTrustPrompt) => Promise<unknown>) => {
      const answer = await ask(trustPrompt)
      return answer === null
        ? { status: 'cancelled' as const, stage: 'trust' as const }
        : {
            status: 'added' as const,
            project: projectItem,
            identity: 'new' as const,
            notices: [],
          }
    }),
    relocateProject: vi.fn(async () => ({
      status: 'added' as const,
      project: projectItem,
      identity: 'moved' as const,
      notices: [],
    })),
    getDefaultParentFolder: vi.fn(() => join(process.cwd(), 'Documents', 'IeumOffice')),
    createProject: vi.fn(
      async (args: { name: string; parentDir?: string; useExisting?: boolean }) =>
        args.useExisting
          ? {
              status: 'added' as const,
              project: projectItem,
              identity: 'new' as const,
              notices: [],
            }
          : { status: 'created' as const, project: projectItem },
    ),
    removeFromList: vi.fn(async () => undefined),
    setPinned: vi.fn(async () => undefined),
    renameProject: vi.fn(async () => ({ status: 'ok' as const })),
    retryUnwritable: vi.fn(async () => ({ status: 'ok' as const })),
    projectRoot: vi.fn((id: string) => (id === 'p1' ? ROOT : null)),
    getSelection: vi.fn(async (target: { kind: string; projectId?: string | null }) =>
      selection(
        target.kind === 'document'
          ? 'p1'
          : target.kind === 'untitled'
            ? (target.projectId ?? null)
            : null,
      ),
    ),
    setSelection: vi.fn(async (_target: unknown, projectId: string | null) => selection(projectId)),
    adoptFolderHint: vi.fn(async () => ({
      status: 'added' as const,
      project: projectItem,
      identity: 'new' as const,
      notices: [],
    })),
    readContext: vi.fn(async () => ({ status: 'unknown' as const })),
    editMemory: vi.fn(async (_id: string, change: unknown) => ({ status: 'ok' as const, change })),
    saveMemory: vi.fn(async () => ({ status: 'ok' as const })),
    applyMemoryConsolidation: vi.fn(),
    undoMemoryConsolidation: vi.fn(),
    getProjectDetail: vi.fn(),
    getSettings: vi.fn(),
    setSettings: vi.fn(async (_id: string, patch: unknown) => patch),
    decideTrust: vi.fn(),
    saveInstructions: vi.fn(),
    addIgnore: vi.fn(),
    removeIgnore: vi.fn(),
    aiVisibility: vi.fn(async () => null),
  }
  const chats = {
    newChat: vi.fn(async () => ({ chatId: 'fresh' })),
    listChats: vi.fn(async () => []),
    openChat: vi.fn(async (args: { projectId: string; chatId: string }) =>
      args.chatId === 'missing'
        ? { status: 'not-found' as const }
        : {
            status: 'ok' as const,
            info: chatInfo({ id: args.chatId }),
            messages: [],
            foreign: false,
          },
    ),
    append: vi.fn(async (_args: unknown, _sender: ChatSender) => ({
      status: 'unwritable' as const,
    })),
    renameChat: vi.fn(async () => ({ status: 'ok' as const })),
    deleteChat: vi.fn(async () => ({ status: 'ok' as const })),
    attachDocument: vi.fn(async () => ({ status: 'ok' as const })),
    chatForDocument: vi.fn(async () => 'c-doc' as string | null),
    chatInfo: vi.fn(async () => chatInfo() as ProjectChatInfo | null),
    onAppended: vi.fn((listener: ChatAppendedListener) => {
      appended = listener
      return () => undefined
    }),
  }
  const tools = {
    openScope: vi.fn(async (owner: number) => `scope-of-${owner}`),
    closeScope: vi.fn(),
    listFiles: vi.fn(async () => ({ files: [], total: 0 })),
    search: vi.fn(async () => ({ hits: [], total: 0 })),
    read: vi.fn(async () => ({ status: 'refused' as const, reason: 'outside' as const })),
  }
  const scopes = {
    projectOf: vi.fn((owner: number, raw: unknown) => {
      const scope = (raw as { scope?: unknown }).scope
      if (scope !== `scope-of-${owner}`) throw new Error('knowledge-base scope is not open')
      return 'p1'
    }),
  }
  const dialogs = {
    pickFolder: vi.fn(async () => join(process.cwd(), 'picked') as string | null),
    confirmUseExisting: vi.fn(async () => true),
    askTrust: vi.fn(async () => 'use' as const as 'use' | 'without' | 'view' | null),
    waitForReturn: vi.fn(async () => true),
  }
  const openFolder = vi.fn(async (_path: string) => undefined)
  const projectsChanged = vi.fn()
  const openDocument = vi.fn((_path: string) => NEW_TAB as number | null)
  const showHome = vi.fn(() => HOME as number | null)
  const legacyChatFor = vi.fn((_path: string) => ({
    projectId: 'default',
    chatId: 'old',
    updatedAt: '2026-01-01T00:00:00.000Z',
    approxCount: 3,
  }))

  const controller: ProjectIpcController = registerProjectFolderIpc({
    services: () => ({ guide, chats, tools, scopes }) as unknown as ProjectFolderServices,
    handle: (channel, handler) => handlers.set(channel, handler),
    windowOf: (sender) => windows.get(sender) ?? null,
    send: (target, channel, payload) => {
      if (gone.has(target)) return false
      sent.push({ target, channel, payload })
      return true
    },
    dialogs,
    legacyChatFor,
    openFolder,
    openDocument,
    showHome,
    projectsChanged,
    ...extra,
  })

  const call = (name: keyof typeof PROJECT_FOLDER_CHANNELS, sender: number, args?: unknown) => {
    const handler = handlers.get(PROJECT_FOLDER_CHANNELS[name])
    if (!handler) throw new Error(`no handler for ${name}`)
    return Promise.resolve().then(() => handler(sender, args))
  }
  const emitAppended = (event: ProjectChatAppendedEvent, from: number) => {
    if (!appended) throw new Error('the store was never subscribed')
    appended(event, { editor: 'docs', docPath: DOC, key: from })
  }

  return {
    handlers,
    windows,
    sent,
    gone,
    guide,
    chats,
    tools,
    scopes,
    dialogs,
    projectsChanged,
    openDocument,
    openFolder,
    showHome,
    legacyChatFor,
    controller,
    call,
    emitAppended,
  }
}

const projectItem = {
  id: 'p1',
  name: 'Report',
  path: ROOT,
  pinned: false,
  lastUsedAt: '2026-10-29T00:00:00.000Z',
  missing: false,
  unwritable: false,
  syncFolder: false,
}

const trustPrompt: ProjectTrustPrompt = {
  projectId: 'p1',
  name: 'Report',
  folderPath: ROOT,
  instructions: 'Write in short sentences.',
  memory: null,
  agents: null,
  claude: null,
  foreignChats: [],
}

let t: ReturnType<typeof setup>
beforeEach(() => {
  t = setup()
})

describe('registration', () => {
  it('registers one handler for every request channel of the bridge', () => {
    expect([...t.handlers.keys()].sort()).toEqual(Object.values(PROJECT_FOLDER_CHANNELS).sort())
  })

  it('refuses a request from a window with no AI panel', async () => {
    await expect(t.call('getSelection', STRANGER)).rejects.toThrow(PROJECT_IPC_UNKNOWN_WINDOW)
  })

  it('refuses a request without a usable project id', async () => {
    for (const bad of [undefined, {}, { projectId: '../x' }, { projectId: 7 }]) {
      await expect(t.call('readContext', DOCS, bad)).rejects.toThrow(PROJECT_IPC_BAD_REQUEST)
    }
  })
})

describe('the asking window decides the document', () => {
  it('judges an editor by its own saved document and picks the chat it opens with', async () => {
    const selection = await t.call('getSelection', DOCS)
    expect(t.guide.getSelection).toHaveBeenCalledWith({ kind: 'document', path: DOC })
    expect(t.chats.chatForDocument).toHaveBeenCalledWith('p1', DOC)
    expect(selection).toEqual({ projectId: 'p1', initialChatId: 'c-doc' })
  })

  it('asks for the home panel as home and gives it no document chat', async () => {
    const selection = await t.call('getSelection', HOME)
    expect(t.guide.getSelection).toHaveBeenCalledWith({ kind: 'home' })
    expect(t.chats.chatForDocument).not.toHaveBeenCalled()
    expect(selection).toEqual({ projectId: null, initialChatId: null })
  })

  it('keeps an untitled document’s choice with its window', async () => {
    expect(await t.call('getSelection', UNTITLED)).toEqual({ projectId: null, initialChatId: null })
    await t.call('setSelection', UNTITLED, { projectId: 'p1' })
    expect(await t.call('getSelection', UNTITLED)).toEqual({ projectId: 'p1', initialChatId: null })
    expect(t.controller.untitledProject(UNTITLED)).toBe('p1')
    t.controller.forget(UNTITLED)
    expect(t.controller.untitledProject(UNTITLED)).toBeNull()
  })

  it('starts a tab a create flow opened in its project until its panel chooses', async () => {
    const preset = setup({ presetProjectOf: async (sender) => (sender === UNTITLED ? 'p1' : null) })
    expect(await preset.controller.windowProject(UNTITLED)).toBe('p1')
    expect(await preset.call('getSelection', UNTITLED)).toEqual({
      projectId: 'p1',
      initialChatId: null,
    })
    expect(preset.guide.getSelection).toHaveBeenLastCalledWith({
      kind: 'untitled',
      projectId: 'p1',
    })
    await preset.call('setSelection', UNTITLED, { projectId: null })
    expect(await preset.call('getSelection', UNTITLED)).toEqual({
      projectId: null,
      initialChatId: null,
    })
    expect(await preset.controller.windowProject(UNTITLED)).toBeNull()
  })

  it('knows the project each window’s panel chose, and nothing for a stranger', async () => {
    expect(await t.controller.windowProject(DOCS)).toBe('p1')
    expect(await t.controller.windowProject(HOME)).toBeNull()
    await t.call('setSelection', HOME, { projectId: 'p1' })
    expect(await t.controller.windowProject(HOME)).toBe('p1')
    await t.call('setSelection', DOCS, { projectId: null })
    expect(await t.controller.windowProject(DOCS)).toBeNull()
    t.controller.reset(DOCS)
    // after a reload the starting selection counts again
    expect(await t.controller.windowProject(DOCS)).toBe('p1')
    expect(await t.controller.windowProject(STRANGER)).toBeNull()
  })

  it('ignores a path the renderer sends with a message', async () => {
    await t.call('appendChat', SHEETS, {
      projectId: 'p1',
      chatId: 'c1',
      role: 'user',
      text: 'hi',
      docPath: DOC,
      editor: 'docs',
    })
    const [, sender] = t.chats.append.mock.calls[0] ?? []
    expect(sender).toEqual({ editor: 'sheets', docPath: OUTSIDE_DOC, key: SHEETS })
  })

  it('records a home message as written at home, without a document', async () => {
    await t.call('appendChat', HOME, { projectId: 'p1', chatId: 'c1', role: 'user', text: 'hi' })
    expect(t.chats.append.mock.calls[0]?.[1]).toEqual({ editor: 'home', docPath: null, key: HOME })
  })

  it('attaches the window’s own saved document to the chat', async () => {
    await t.call('attachDocument', DOCS, { projectId: 'p1', chatId: 'c1', path: OUTSIDE_DOC })
    expect(t.chats.attachDocument).toHaveBeenCalledWith({ projectId: 'p1', chatId: 'c1' }, DOC)
  })

  it('attaches nothing for a window whose document was never saved', async () => {
    expect(await t.call('attachDocument', UNTITLED, { projectId: 'p1', chatId: 'c1' })).toEqual({
      status: 'ok',
    })
    expect(t.chats.attachDocument).not.toHaveBeenCalled()
  })

  it('offers the earlier per-document chat for a saved document only', async () => {
    const listed = await t.call('listChats', DOCS, { projectId: 'p1' })
    expect(t.legacyChatFor).toHaveBeenCalledWith(DOC)
    expect(listed).toMatchObject({ legacy: { chatId: 'old' } })
    expect(await t.call('listChats', HOME, { projectId: 'p1' })).toEqual({
      chats: [],
      legacy: null,
    })
    expect(t.legacyChatFor).toHaveBeenCalledTimes(1)
  })

  it('adopts the hinted folder for the window’s own document only', async () => {
    await t.call('adoptFolderHint', DOCS)
    expect(t.guide.adoptFolderHint).toHaveBeenCalledWith(DOC, expect.any(Function))
    expect(await t.call('adoptFolderHint', UNTITLED)).toEqual({
      status: 'refused',
      reason: 'not-a-folder',
    })
  })
})

describe('run scopes belong to the window that opened them', () => {
  it('opens and closes a scope as the asking window', async () => {
    const scope = await t.call('openScope', DOCS, { projectId: 'p1' })
    expect(t.tools.openScope).toHaveBeenCalledWith(DOCS, { projectId: 'p1' })
    await t.call('closeScope', DOCS, { scope })
    expect(t.tools.closeScope).toHaveBeenCalledWith(DOCS, { scope })
  })

  it('runs the read tools as the asking window', async () => {
    await t.call('listFiles', SHEETS, { scope: 's' })
    await t.call('search', SHEETS, { scope: 's', query: 'q' })
    await t.call('read', SHEETS, { scope: 's', relPath: 'a.md' })
    expect(t.tools.listFiles).toHaveBeenCalledWith(SHEETS, { scope: 's' })
    expect(t.tools.search).toHaveBeenCalledWith(SHEETS, { scope: 's', query: 'q' })
    expect(t.tools.read).toHaveBeenCalledWith(SHEETS, { scope: 's', relPath: 'a.md' })
  })

  it('remembers into the project of the window’s own scope', async () => {
    const change = { op: 'add', text: 'Use short sentences.' }
    await t.call('remember', DOCS, { scope: `scope-of-${DOCS}`, change, projectId: 'other' })
    expect(t.guide.editMemory).toHaveBeenCalledWith('p1', change, 'ai')
  })

  it('refuses a memory edit without a scope or with another window’s scope', async () => {
    const change = { op: 'add', text: 'x' }
    await expect(t.call('remember', DOCS, { change, projectId: 'p1' })).rejects.toThrow(
      PROJECT_SCOPE_UNKNOWN,
    )
    await expect(t.call('remember', SHEETS, { scope: `scope-of-${DOCS}`, change })).rejects.toThrow(
      PROJECT_SCOPE_UNKNOWN,
    )
    expect(t.guide.editMemory).not.toHaveBeenCalled()
  })

  it('refuses a malformed memory edit', async () => {
    await expect(
      t.call('remember', DOCS, { scope: `scope-of-${DOCS}`, change: { op: 'wipe' } }),
    ).rejects.toThrow(PROJECT_IPC_BAD_REQUEST)
    await expect(
      t.call('editMemory', DOCS, { projectId: 'p1', change: { op: 'add' } }),
    ).rejects.toThrow(PROJECT_IPC_BAD_REQUEST)
  })

  it('edits memory for a person outside a run', async () => {
    await t.call('editMemory', HOME, { projectId: 'p1', change: { op: 'remove', text: 'x' } })
    expect(t.guide.editMemory).toHaveBeenCalledWith('p1', { op: 'remove', text: 'x' }, 'person')
  })
})

describe('two windows with the same chat (spec 5.3.3)', () => {
  const event = (seq: number): ProjectChatAppendedEvent => ({
    projectId: 'p1',
    chatId: 'c1',
    message: {
      seq,
      ts: '2026-10-29T00:00:00.000Z',
      role: 'user',
      text: `m${seq}`,
      editor: 'docs',
      origin: 'me',
    },
  })
  const appendedTo = (target: number) =>
    t.sent.filter(
      (s) => s.target === target && s.channel === PROJECT_FOLDER_EVENTS.onChatMessageAppended,
    )

  it('sends a recorded message to the other window, not back to the sender', async () => {
    await t.call('openChat', DOCS, { projectId: 'p1', chatId: 'c1' })
    await t.call('appendChat', SHEETS, { projectId: 'p1', chatId: 'c1', role: 'user', text: 'x' })
    t.emitAppended(event(1), SHEETS)
    expect(appendedTo(DOCS).map((s) => s.payload)).toEqual([event(1)])
    expect(appendedTo(SHEETS)).toEqual([])
    t.emitAppended(event(2), DOCS)
    expect(appendedTo(SHEETS).map((s) => s.payload)).toEqual([event(2)])
  })

  it('stops after the window closes', async () => {
    await t.call('openChat', DOCS, { projectId: 'p1', chatId: 'c1' })
    await t.call('openChat', SHEETS, { projectId: 'p1', chatId: 'c1' })
    t.controller.forget(DOCS)
    t.emitAppended(event(1), SHEETS)
    expect(appendedTo(DOCS)).toEqual([])
  })

  it('stops after the window switches to another chat or to no project', async () => {
    await t.call('openChat', DOCS, { projectId: 'p1', chatId: 'c1' })
    await t.call('openChat', SHEETS, { projectId: 'p1', chatId: 'c1' })
    await t.call('newChat', DOCS, { projectId: 'p1' })
    t.emitAppended(event(1), SHEETS)
    expect(appendedTo(DOCS)).toEqual([])
    await t.call('openChat', DOCS, { projectId: 'p1', chatId: 'c1' })
    await t.call('setSelection', DOCS, { projectId: null })
    t.emitAppended(event(2), SHEETS)
    expect(appendedTo(DOCS)).toEqual([])
  })

  it('does not watch a chat that could not be opened', async () => {
    await t.call('openChat', DOCS, { projectId: 'p1', chatId: 'missing' })
    t.emitAppended({ ...event(1), chatId: 'missing' }, SHEETS)
    expect(appendedTo(DOCS)).toEqual([])
  })

  it('forgets a window that is gone when sending to it fails', async () => {
    await t.call('openChat', DOCS, { projectId: 'p1', chatId: 'c1' })
    t.gone.add(DOCS)
    t.emitAppended(event(1), SHEETS)
    t.gone.delete(DOCS)
    t.emitAppended(event(2), SHEETS)
    expect(appendedTo(DOCS)).toEqual([])
  })
})

describe('dialogs', () => {
  it('cancels "add folder" when the picker is closed', async () => {
    t.dialogs.pickFolder.mockResolvedValueOnce(null)
    expect(await t.call('addFolder', DOCS)).toEqual({ status: 'cancelled', stage: 'dialog' })
    expect(t.guide.addFolder).not.toHaveBeenCalled()
  })

  it('asks the trust question over the asking window and refreshes the index on success', async () => {
    const result = await t.call('addFolder', SHEETS)
    expect(t.dialogs.pickFolder).toHaveBeenCalledWith(SHEETS, 'add')
    expect(t.dialogs.askTrust).toHaveBeenCalledWith(SHEETS, trustPrompt)
    expect(result).toMatchObject({ status: 'added' })
    expect(t.projectsChanged).toHaveBeenCalledTimes(1)
  })

  it('cancels the addition when the trust prompt is closed', async () => {
    t.dialogs.askTrust.mockResolvedValueOnce(null)
    expect(await t.call('addFolder', DOCS)).toEqual({ status: 'cancelled', stage: 'trust' })
    expect(t.projectsChanged).not.toHaveBeenCalled()
  })

  describe('[view all] in the trust prompt', () => {
    const quoted: ProjectTrustPrompt = {
      ...trustPrompt,
      agents: 'Root rules',
      claude: 'More rules',
      foreignChats: [{ id: 'c9', title: 'From the laptop', updatedAt: '2026-10-29T00:00:00.000Z' }],
    }
    const addWith = (prompt: ProjectTrustPrompt) =>
      t.guide.addFolder.mockImplementationOnce(async (_path, ask) => {
        const answer = await ask(prompt)
        return answer === null
          ? { status: 'cancelled' as const, stage: 'trust' as const }
          : {
              status: 'added' as const,
              project: projectItem,
              identity: 'new' as const,
              notices: [],
            }
      })

    it('opens the quoted files in the app and the chats folder, then asks again', async () => {
      addWith(quoted)
      t.dialogs.askTrust.mockResolvedValueOnce('view').mockResolvedValueOnce('without')
      const result = await t.call('addFolder', DOCS)
      expect(t.openDocument.mock.calls.map(([path]) => path)).toEqual([
        join(ROOT, '.ieumoffice', 'instructions.md'),
        join(ROOT, 'AGENTS.md'),
        join(ROOT, 'CLAUDE.md'),
      ])
      expect(t.openFolder).toHaveBeenCalledWith(join(ROOT, '.ieumoffice', 'chats'))
      expect(t.dialogs.waitForReturn).toHaveBeenCalledWith(DOCS)
      expect(t.dialogs.askTrust).toHaveBeenCalledTimes(2)
      expect(t.dialogs.askTrust).toHaveBeenLastCalledWith(DOCS, quoted)
      expect(result).toMatchObject({ status: 'added' })
    })

    it('keeps asking after each [view all] until the person answers', async () => {
      addWith(trustPrompt)
      t.dialogs.askTrust
        .mockResolvedValueOnce('view')
        .mockResolvedValueOnce('view')
        .mockResolvedValueOnce('use')
      expect(await t.call('addFolder', HOME)).toMatchObject({ status: 'added' })
      expect(t.dialogs.askTrust).toHaveBeenCalledTimes(3)
      expect(t.openFolder).not.toHaveBeenCalled()
    })

    it('still cancels when the prompt is closed after viewing', async () => {
      addWith(quoted)
      t.dialogs.askTrust.mockResolvedValueOnce('view').mockResolvedValueOnce(null)
      expect(await t.call('addFolder', DOCS)).toEqual({ status: 'cancelled', stage: 'trust' })
      expect(t.projectsChanged).not.toHaveBeenCalled()
    })

    it('cancels when the asking page is gone while the files are read', async () => {
      addWith(quoted)
      t.dialogs.askTrust.mockResolvedValueOnce('view')
      t.dialogs.waitForReturn.mockResolvedValueOnce(false)
      expect(await t.call('addFolder', DOCS)).toEqual({ status: 'cancelled', stage: 'trust' })
      expect(t.dialogs.askTrust).toHaveBeenCalledTimes(1)
    })

    it('asks again at once when nothing could open in the app', async () => {
      addWith(quoted)
      t.openDocument.mockReturnValue(null)
      t.dialogs.askTrust.mockResolvedValueOnce('view').mockResolvedValueOnce('use')
      expect(await t.call('addFolder', DOCS)).toMatchObject({ status: 'added' })
      expect(t.dialogs.waitForReturn).not.toHaveBeenCalled()
    })

    it('loops the same way when switching a project to "use"', async () => {
      await t.call('decideTrust', SHEETS, { projectId: 'p1', decision: 'use' })
      const ask = t.guide.decideTrust.mock.calls[0]?.[2] as (p: ProjectTrustPrompt) => unknown
      t.dialogs.askTrust.mockResolvedValueOnce('view').mockResolvedValueOnce('use')
      expect(await ask(trustPrompt)).toBe('use')
      expect(t.openDocument).toHaveBeenCalledWith(join(ROOT, '.ieumoffice', 'instructions.md'))
      expect(t.dialogs.waitForReturn).toHaveBeenCalledWith(SHEETS)
    })
  })

  it('relocates a missing project to the folder the person picks', async () => {
    await t.call('relocateProject', HOME, { projectId: 'p1' })
    expect(t.dialogs.pickFolder).toHaveBeenCalledWith(HOME, 'relocate')
    expect(t.guide.relocateProject).toHaveBeenCalledWith(
      'p1',
      join(process.cwd(), 'picked'),
      expect.any(Function),
    )
  })

  it('creates a new project under the default save folder, without a dialog', async () => {
    const result = await t.call('createProject', DOCS, { name: '  Budget  ' })
    expect(t.dialogs.pickFolder).not.toHaveBeenCalled()
    expect(t.guide.createProject).toHaveBeenCalledWith({ name: 'Budget' }, expect.any(Function))
    expect(result).toMatchObject({ status: 'created' })
    expect(t.projectsChanged).toHaveBeenCalledTimes(1)
  })

  it('never lets a path in the request decide where the folder goes', async () => {
    const elsewhere = join(process.cwd(), 'Desktop')
    await t.call('createProject', DOCS, { name: 'Trip', parentDir: elsewhere, useExisting: true })
    expect(t.guide.createProject).toHaveBeenCalledTimes(1)
    expect(t.guide.createProject).toHaveBeenCalledWith({ name: 'Trip' }, expect.any(Function))
  })

  it('refuses an empty name without asking anything', async () => {
    for (const name of ['', '   ', undefined]) {
      expect(await t.call('createProject', DOCS, { name })).toEqual({ status: 'invalid-name' })
    }
    expect(t.dialogs.pickFolder).not.toHaveBeenCalled()
    expect(t.guide.createProject).not.toHaveBeenCalled()
  })

  it('"create somewhere else" asks main’s folder picker for the parent, then creates there', async () => {
    const parent = join(process.cwd(), 'Desktop')
    t.dialogs.pickFolder.mockResolvedValueOnce(parent)
    await t.call('createProject', SHEETS, { name: 'Trip', otherPlace: true })
    expect(t.dialogs.pickFolder).toHaveBeenCalledWith(SHEETS, 'parent')
    expect(t.guide.createProject).toHaveBeenCalledWith(
      { name: 'Trip', parentDir: parent },
      expect.any(Function),
    )
  })

  it('cancels a new project when the parent folder picker is closed', async () => {
    t.dialogs.pickFolder.mockResolvedValueOnce(null)
    expect(await t.call('createProject', DOCS, { name: 'x', otherPlace: true })).toEqual({
      status: 'cancelled',
      stage: 'dialog',
    })
    expect(t.guide.createProject).not.toHaveBeenCalled()
    expect(t.projectsChanged).not.toHaveBeenCalled()
  })

  it('passes on the guide’s refusal of a protected place and changes nothing', async () => {
    t.dialogs.pickFolder.mockResolvedValueOnce(join(process.cwd(), '.codex'))
    t.guide.createProject.mockResolvedValueOnce({ status: 'refused', reason: 'protected' } as never)
    expect(await t.call('createProject', DOCS, { name: 'x', otherPlace: true })).toEqual({
      status: 'refused',
      reason: 'protected',
    })
    expect(t.dialogs.confirmUseExisting).not.toHaveBeenCalled()
    expect(t.projectsChanged).not.toHaveBeenCalled()
  })

  it('asks before using an existing folder of that name, and uses it on yes', async () => {
    const existing = join(t.guide.getDefaultParentFolder(), 'Budget')
    t.guide.createProject.mockResolvedValueOnce({
      status: 'exists',
      folderPath: existing,
    } as never)
    const result = await t.call('createProject', DOCS, { name: 'Budget' })
    expect(t.dialogs.confirmUseExisting).toHaveBeenCalledWith(DOCS, existing)
    expect(t.guide.createProject).toHaveBeenLastCalledWith(
      { name: 'Budget', useExisting: true },
      expect.any(Function),
    )
    expect(result).toMatchObject({ status: 'added' })
  })

  it('keeps the picked parent when using an existing folder there', async () => {
    const parent = join(process.cwd(), 'Desktop')
    t.dialogs.pickFolder.mockResolvedValueOnce(parent)
    t.guide.createProject.mockResolvedValueOnce({
      status: 'exists',
      folderPath: join(parent, 'Trip'),
    } as never)
    await t.call('createProject', DOCS, { name: 'Trip', otherPlace: true })
    expect(t.dialogs.pickFolder).toHaveBeenCalledTimes(1)
    expect(t.guide.createProject).toHaveBeenLastCalledWith(
      { name: 'Trip', parentDir: parent, useExisting: true },
      expect.any(Function),
    )
  })

  it('leaves an existing folder alone when the person says no', async () => {
    t.guide.createProject.mockResolvedValueOnce({
      status: 'exists',
      folderPath: ROOT,
    } as never)
    t.dialogs.confirmUseExisting.mockResolvedValueOnce(false)
    expect(await t.call('createProject', DOCS, { name: 'Report' })).toEqual({
      status: 'cancelled',
      stage: 'dialog',
    })
    expect(t.guide.createProject).toHaveBeenCalledTimes(1)
  })

  it('shows the trust question again over the screen when switching to "use"', async () => {
    await t.call('decideTrust', HOME, { projectId: 'p1', decision: 'use' })
    const ask = t.guide.decideTrust.mock.calls[0]?.[2] as (p: ProjectTrustPrompt) => unknown
    await ask(trustPrompt)
    expect(t.dialogs.askTrust).toHaveBeenCalledWith(HOME, trustPrompt)
    await expect(
      t.call('decideTrust', HOME, { projectId: 'p1', decision: 'maybe' }),
    ).rejects.toThrow(PROJECT_IPC_BAD_REQUEST)
  })

  it('refreshes the index when a project leaves the list', async () => {
    await t.call('removeFromList', HOME, { projectId: 'p1' })
    expect(t.guide.removeFromList).toHaveBeenCalledWith('p1')
    expect(t.projectsChanged).toHaveBeenCalledTimes(1)
  })
})

describe('"open this chat" in another window', () => {
  const openChatTo = (target: number) =>
    t.sent.filter((s) => s.target === target && s.channel === PROJECT_FOLDER_EVENTS.onOpenChat)

  it('opens the chat’s latest document and waits for its panel to listen', async () => {
    t.chats.chatInfo.mockResolvedValueOnce(chatInfo({ documents: ['old.docx', 'sub/new.docx'] }))
    await t.call('openDocumentChat', HOME, { projectId: 'p1', chatId: 'c1' })
    expect(t.openDocument).toHaveBeenCalledWith(join(ROOT, 'sub', 'new.docx'))
    expect(openChatTo(NEW_TAB)).toEqual([])
    t.controller.listen(NEW_TAB, 'onOpenChat', true)
    expect(openChatTo(NEW_TAB).map((s) => s.payload)).toEqual([{ projectId: 'p1', chatId: 'c1' }])
  })

  it('tells a window that already listens right away', async () => {
    t.controller.listen(NEW_TAB, 'onOpenChat', true)
    await t.call('openDocumentChat', HOME, { projectId: 'p1', chatId: 'c1' })
    expect(openChatTo(NEW_TAB)).toHaveLength(1)
  })

  it('keeps only the latest request for a window that is still loading', async () => {
    await t.call('openDocumentChat', HOME, { projectId: 'p1', chatId: 'c1' })
    t.chats.chatInfo.mockResolvedValueOnce(chatInfo({ id: 'c2' }))
    await t.call('openDocumentChat', HOME, { projectId: 'p1', chatId: 'c2' })
    t.controller.listen(NEW_TAB, 'onOpenChat', true)
    expect(openChatTo(NEW_TAB).map((s) => s.payload)).toEqual([{ projectId: 'p1', chatId: 'c2' }])
  })

  it('keeps what was held across the new tab’s first page load', async () => {
    await t.call('openDocumentChat', HOME, { projectId: 'p1', chatId: 'c1' })
    t.controller.reset(NEW_TAB)
    t.controller.listen(NEW_TAB, 'onOpenChat', true)
    expect(openChatTo(NEW_TAB)).toHaveLength(1)
  })

  it('waits again after a reload until the new page listens', async () => {
    t.controller.listen(NEW_TAB, 'onOpenChat', true)
    t.controller.reset(NEW_TAB)
    await t.call('openDocumentChat', HOME, { projectId: 'p1', chatId: 'c1' })
    expect(openChatTo(NEW_TAB)).toEqual([])
    t.controller.listen(NEW_TAB, 'onOpenChat', true)
    expect(openChatTo(NEW_TAB)).toHaveLength(1)
  })

  it('drops what was held for a window that closed before it listened', async () => {
    await t.call('openDocumentChat', HOME, { projectId: 'p1', chatId: 'c1' })
    t.controller.forget(NEW_TAB)
    t.controller.listen(NEW_TAB, 'onOpenChat', true)
    expect(openChatTo(NEW_TAB)).toEqual([])
  })

  it('opens a chat with no document in the home ask panel', async () => {
    t.chats.chatInfo.mockResolvedValueOnce(chatInfo({ documents: [] }))
    t.controller.listen(HOME, 'onOpenChat', true)
    await t.call('openDocumentChat', DOCS, { projectId: 'p1', chatId: 'c1' })
    expect(t.openDocument).not.toHaveBeenCalled()
    expect(t.showHome).toHaveBeenCalled()
    expect(openChatTo(HOME)).toHaveLength(1)
  })

  it('opens a chat last used at home in the home ask panel', async () => {
    t.chats.chatInfo.mockResolvedValueOnce(chatInfo({ lastEditor: 'home' }))
    await t.call('openDocumentChat', DOCS, { projectId: 'p1', chatId: 'c1' })
    expect(t.openDocument).not.toHaveBeenCalled()
    expect(t.showHome).toHaveBeenCalled()
  })

  it('never opens a document path that leaves the project folder', async () => {
    t.chats.chatInfo.mockResolvedValueOnce(chatInfo({ documents: ['../../secret.docx'] }))
    await t.call('openDocumentChat', DOCS, { projectId: 'p1', chatId: 'c1' })
    expect(t.openDocument).not.toHaveBeenCalled()
    expect(t.showHome).toHaveBeenCalled()
  })

  it('falls back to home when the document cannot be opened', async () => {
    t.openDocument.mockReturnValueOnce(null)
    await t.call('openDocumentChat', DOCS, { projectId: 'p1', chatId: 'c1' })
    expect(t.showHome).toHaveBeenCalled()
  })

  it('does nothing for a chat the list does not show', async () => {
    t.chats.chatInfo.mockResolvedValueOnce(null)
    await t.call('openDocumentChat', DOCS, { projectId: 'p1', chatId: 'c1' })
    expect(t.openDocument).not.toHaveBeenCalled()
    expect(t.showHome).not.toHaveBeenCalled()
  })
})

describe('"open the project screen"', () => {
  const screenTo = (target: number) =>
    t.sent.filter(
      (s) => s.target === target && s.channel === PROJECT_FOLDER_EVENTS.onOpenProjectScreen,
    )

  it('switches to home and shows the section once the screen listens', async () => {
    await t.call('openProjectScreen', DOCS, { projectId: 'p1', section: 'memory' })
    expect(t.showHome).toHaveBeenCalled()
    expect(screenTo(HOME)).toEqual([])
    t.controller.listen(HOME, 'onOpenProjectScreen', true)
    expect(screenTo(HOME).map((s) => s.payload)).toEqual([{ projectId: 'p1', section: 'memory' }])
  })

  it('drops an unknown section and ignores unknown listen messages', async () => {
    t.controller.listen(HOME, 'onSomethingElse', true)
    t.controller.listen(HOME, 'onOpenProjectScreen', true)
    await t.call('openProjectScreen', DOCS, { projectId: 'p1', section: 'everything' })
    expect(screenTo(HOME).map((s) => s.payload)).toEqual([{ projectId: 'p1' }])
  })

  it('holds the request again after the screen stopped listening', async () => {
    t.controller.listen(HOME, 'onOpenProjectScreen', true)
    t.controller.listen(HOME, 'onOpenProjectScreen', false)
    await t.call('openProjectScreen', DOCS, { projectId: 'p1' })
    expect(screenTo(HOME)).toEqual([])
  })
})

describe('waitForPageReturn', () => {
  const page = () => {
    const emitter = new EventEmitter()
    let destroyed = false
    return {
      emitter,
      destroy: () => {
        destroyed = true
        emitter.emit('destroyed')
      },
      page: {
        isDestroyed: () => destroyed,
        on: (event: string, listener: () => void) => emitter.on(event, listener),
        off: (event: string, listener: () => void) => emitter.off(event, listener),
      },
    }
  }
  const settled = async (promise: Promise<boolean>) => {
    let value: boolean | 'pending' = 'pending'
    void promise.then((v) => (value = v))
    await Promise.resolve()
    await Promise.resolve()
    return value
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignores the focus the closing dialog hands straight back, then waits for the person', async () => {
    vi.useFakeTimers()
    const p = page()
    const waiting = waitForPageReturn(p.page, 1000)
    p.emitter.emit('focus')
    expect(await settled(waiting)).toBe('pending')
    p.emitter.emit('blur')
    p.emitter.emit('focus')
    expect(await settled(waiting)).toBe(true)
    expect(p.emitter.listenerCount('focus')).toBe(0)
    expect(p.emitter.listenerCount('blur')).toBe(0)
    expect(p.emitter.listenerCount('destroyed')).toBe(0)
  })

  it('counts a focus after the short grace time even without a blur first', async () => {
    vi.useFakeTimers()
    const p = page()
    const waiting = waitForPageReturn(p.page, 1000)
    vi.advanceTimersByTime(1000)
    p.emitter.emit('focus')
    expect(await settled(waiting)).toBe(true)
  })

  it('answers false when the page goes away, or is already gone', async () => {
    const p = page()
    const waiting = waitForPageReturn(p.page, 1000)
    p.destroy()
    expect(await waiting).toBe(false)
    expect(await waitForPageReturn(p.page)).toBe(false)
  })
})

describe('"the app wrote part of a project" (onProjectChanged)', () => {
  const changesTo = (target: number) =>
    t.sent
      .filter((s) => s.target === target && s.channel === PROJECT_FOLDER_EVENTS.onProjectChanged)
      .map((s) => s.payload)

  it('tells every listening window, the writer included, when memory changed', async () => {
    t.controller.listen(HOME, 'onProjectChanged', true)
    t.controller.listen(DOCS, 'onProjectChanged', true)
    await t.call('remember', DOCS, { scope: `scope-of-${DOCS}`, change: { op: 'add', text: 'x' } })
    await t.call('editMemory', HOME, { projectId: 'p1', change: { op: 'remove', text: 'x' } })
    expect(changesTo(HOME)).toEqual([
      { projectId: 'p1', part: 'memory' },
      { projectId: 'p1', part: 'memory' },
    ])
    expect(changesTo(DOCS)).toHaveLength(2)
    // a window that does not listen hears nothing, and nothing is held for it
    expect(changesTo(SHEETS)).toEqual([])
    t.controller.listen(SHEETS, 'onProjectChanged', true)
    expect(changesTo(SHEETS)).toEqual([])
  })

  it('says nothing when the write did not go through', async () => {
    t.controller.listen(HOME, 'onProjectChanged', true)
    t.guide.editMemory.mockResolvedValueOnce({ status: 'refused', reason: 'not-found' } as never)
    await t.call('editMemory', HOME, { projectId: 'p1', change: { op: 'remove', text: 'x' } })
    t.guide.saveInstructions.mockResolvedValueOnce({ status: 'unwritable' })
    await t.call('saveInstructions', HOME, { projectId: 'p1', text: 'y' })
    expect(changesTo(HOME)).toEqual([])
  })

  it('names the part: instructions, settings and chats', async () => {
    t.controller.listen(HOME, 'onProjectChanged', true)
    t.guide.saveInstructions.mockResolvedValueOnce({ status: 'ok' })
    await t.call('saveInstructions', HOME, { projectId: 'p1', text: 'y' })
    await t.call('setSettings', HOME, { projectId: 'p1', settings: { memoryEnabled: false } })
    t.guide.decideTrust.mockResolvedValueOnce({ status: 'ok', trust: 'without' })
    await t.call('decideTrust', HOME, { projectId: 'p1', decision: 'without' })
    await t.call('renameChat', HOME, { projectId: 'p1', chatId: 'c1', title: 'New' })
    await t.call('deleteChat', HOME, { projectId: 'p1', chatId: 'c1' })
    expect(changesTo(HOME)).toEqual([
      { projectId: 'p1', part: 'instructions' },
      { projectId: 'p1', part: 'settings' },
      { projectId: 'p1', part: 'settings' },
      { projectId: 'p1', part: 'chats' },
      { projectId: 'p1', part: 'chats' },
    ])
  })

  it('announces a chat message only once it is saved in the folder', async () => {
    t.controller.listen(HOME, 'onProjectChanged', true)
    const message = { role: 'user', text: 'hi' }
    await t.call('appendChat', DOCS, { projectId: 'p1', chatId: 'c1', ...message })
    expect(changesTo(HOME)).toEqual([])
    t.chats.append.mockResolvedValueOnce({ status: 'saved', message: {} } as never)
    await t.call('appendChat', DOCS, { projectId: 'p1', chatId: 'c1', ...message })
    expect(changesTo(HOME)).toEqual([{ projectId: 'p1', part: 'chats' }])
  })

  it('stops after the window stopped listening, and forgets a window that is gone', async () => {
    t.controller.listen(HOME, 'onProjectChanged', true)
    t.controller.listen(DOCS, 'onProjectChanged', true)
    t.controller.listen(HOME, 'onProjectChanged', false)
    t.gone.add(DOCS)
    await t.call('saveMemory', SHEETS, { projectId: 'p1', text: '- a' })
    t.gone.delete(DOCS)
    await t.call('saveMemory', SHEETS, { projectId: 'p1', text: '- b' })
    expect(changesTo(HOME)).toEqual([])
    expect(changesTo(DOCS)).toEqual([])
  })
})
