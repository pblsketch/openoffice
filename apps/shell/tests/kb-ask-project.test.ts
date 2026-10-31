/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import type {
  AiSettings,
  AiStreamChunk,
  AiStreamRequest,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider'
import type {
  AppendProjectChatArgs,
  ProjectChatAppendedEvent,
  ProjectChatRef,
  ProjectContextBundle,
  ProjectFolderApi,
  ProjectListItem,
  ProjectNotice,
  ProjectSelection,
} from '@genoffice/project-store'
import { projectPanelText } from '@genoffice/ui'
import type { HomeApi } from '../src/shared/home-api'
import { KbAskPanel } from '../src/renderer/src/KbAskPanel'
import {
  notesAfterCreate,
  pathInsideFolder,
  askScopeFailure,
  openAskScope,
  storedToolNotes,
  toolRecordOf,
} from '../src/renderer/src/kb-ask-project'
import { kbAskProjectText } from '../src/renderer/src/kb-ask-project-strings'
import { LocaleProvider } from '../src/renderer/src/locale'
import { strings } from '../src/renderer/src/strings'
import type { SubscriptionConnection } from '../src/renderer/src/subscription-client'
import { KB_GROUP_EMPTY } from '../src/main/knowledge-base'
import { PROJECT_UNAVAILABLE } from '../src/main/projects/project-tools'

/**
 * The home ask panel with a project folder (spec 5.2, 5.3.8, 5.5). The
 * project folder bridge is a fake, as is the provider: nothing here reaches
 * Claude or Codex, and no folder is written. Covered: the picker under the
 * composer; without a project nothing is recorded and the chat stays in
 * memory; with one the run reads the folder plus the starred scope, prepares
 * the project context before the request goes out, carries the project tools
 * and records the exchange in the folder; the chat menu, a chat opened from
 * the project screen, memory lines and notices.
 */

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const LEASE = {
  path: '/kb/a/lease.docx',
  folder: 'a',
  name: 'lease.docx',
  ext: 'docx',
  sizeBytes: 10,
}

const PROJECT: ProjectListItem = {
  id: 'p1',
  name: 'Annual report',
  path: '/work/annual-report',
  pinned: false,
  lastUsedAt: '2026-10-29T10:00:00.000Z',
  missing: false,
  unwritable: false,
  syncFolder: false,
}

const context = (notices: ProjectNotice[] = []): ProjectContextBundle => ({
  projectId: 'p1',
  name: PROJECT.name,
  trust: 'use',
  instructions: { text: 'Write in short sentences.', sources: ['instructions'] },
  memory: null,
  files: [
    {
      relPath: 'drafts/plan.docx',
      ext: 'docx',
      sizeBytes: 100,
      mtimeMs: Date.parse('2026-10-28T00:00:00Z'),
      cloudOnly: false,
    },
  ] as ProjectContextBundle['files'],
  filesOmitted: 0,
  canRemember: true,
  notices,
})

let host: HTMLDivElement
let root: Root
let stored: AiSettings
let streamListeners: Array<(chunk: AiStreamChunk) => void>
let aiStream: ReturnType<typeof vi.fn<(request: AiStreamRequest) => Promise<void>>>
let kbOpenScope: ReturnType<typeof vi.fn<(group: unknown) => Promise<string>>>
let kbCloseScope: ReturnType<typeof vi.fn<(scope: string) => Promise<void>>>
let kbList: ReturnType<typeof vi.fn<(scope?: string) => Promise<(typeof LEASE)[]>>>
let starred: (typeof LEASE)[]
let groups: string[]
/** the order the bridge and the provider were called in */
let calls: string[]
let selection: ProjectSelection
let notices: ProjectNotice[]
let contextStatus: 'ok' | 'missing'
/** main refuses the knowledge scope: the project left the list or its folder is gone */
let kbProjectGone: boolean
let appendedListeners: Array<(event: ProjectChatAppendedEvent) => void>
let openChatListeners: Array<(event: ProjectChatRef) => void>
let bridge: { [K in keyof ProjectFolderApi]: ReturnType<typeof vi.fn> }

beforeEach(() => {
  Element.prototype.scrollTo = () => undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  stored = defaultAiSettings()
  streamListeners = []
  calls = []
  groups = ['Unit A']
  starred = [LEASE]
  selection = { projectId: null, initialChatId: null }
  notices = []
  contextStatus = 'ok'
  kbProjectGone = false
  appendedListeners = []
  openChatListeners = []
  aiStream = vi.fn(async () => {
    calls.push('aiStream')
  })
  let minted = 0
  kbOpenScope = vi.fn(async (request: unknown) => {
    calls.push('kbOpenScope')
    if (request && typeof request === 'object' && (request as { projectId?: string }).projectId) {
      if (kbProjectGone) throw new Error(PROJECT_UNAVAILABLE)
    }
    return `kb-scope-${++minted}`
  })
  kbCloseScope = vi.fn(async () => undefined)
  kbList = vi.fn(async () => starred)
  window.aiOffice = {
    kbList,
    kbSearch: vi.fn(async () => []),
    kbRead: vi.fn(async () => ({ text: '', totalChars: 0, offset: 0 })),
    kbOpenScope,
    kbCloseScope,
    starredGroups: async () => groups,
    starred: async () => ({ totalAll: 1 }),
    aiGetSettings: async () => stored,
    getAiSettings: async () => stored,
    setAiSettings: async () => undefined,
    aiStream,
    aiStreamCancel: async () => undefined,
    onAiStream: (handler: (chunk: AiStreamChunk) => void) => {
      streamListeners.push(handler)
      return () => {
        streamListeners = streamListeners.filter((listener) => listener !== handler)
      }
    },
  } as unknown as HomeApi

  let chatSeq = 0
  let messageSeq = 0
  const fake: Partial<Record<keyof ProjectFolderApi, (...args: never[]) => unknown>> = {
    listProjects: async () => [PROJECT],
    addFolder: async () => ({ status: 'refused', reason: 'protected' }),
    getDefaultParentFolder: async () => '/docs/IeumOffice',
    getSelection: async () => selection,
    setSelection: async (args: { projectId: string | null }) => {
      selection = { projectId: args.projectId, initialChatId: null }
      return selection
    },
    listChats: async () => ({
      chats: [
        {
          id: 'old-chat',
          title: 'Budget questions',
          updatedAt: '2026-10-28T09:00:00.000Z',
          lastEditor: 'docs',
          foreign: false,
        },
      ],
      legacy: null,
    }),
    newChat: async () => ({ chatId: `chat-${++chatSeq}` }),
    openChat: async (args: ProjectChatRef) => ({
      status: 'ok',
      info: { title: 'Budget questions' },
      foreign: false,
      messages: [
        {
          seq: 1,
          ts: '2026-10-28T09:00:00.000Z',
          role: 'user',
          text: 'What did we spend on paper?',
          editor: 'docs',
          origin: 'x',
        },
        {
          seq: 2,
          ts: '2026-10-28T09:00:05.000Z',
          role: 'assistant',
          text: 'About 120,000 won.',
          editor: 'docs',
          origin: 'x',
          fileRef: 'drafts/plan.docx',
          tools: [
            { name: 'docs_read', summary: 'Read' },
            { name: 'docs_edit', summary: 'Edit' },
          ],
        },
      ],
      chatId: args.chatId,
    }),
    appendChat: async (args: AppendProjectChatArgs) => {
      calls.push(`appendChat:${args.role}`)
      return {
        status: 'saved',
        message: {
          ...args,
          seq: ++messageSeq,
          ts: '2026-10-30T00:00:00.000Z',
          editor: 'home',
          origin: 'me',
        },
      }
    },
    renameChat: async () => ({ status: 'ok' }),
    deleteChat: async () => ({ status: 'ok' }),
    readContext: async () => {
      calls.push('readContext')
      return contextStatus === 'ok'
        ? { status: 'ok', context: context(notices) }
        : { status: 'missing' }
    },
    openScope: async () => {
      calls.push('openScope')
      return 'project-scope-1'
    },
    closeScope: async () => {
      calls.push('closeScope')
    },
    listFiles: async () => ({ files: [], total: 0 }),
    search: async () => ({ hits: [], total: 0 }),
    read: async () => ({ status: 'ok', text: '', offset: 0, totalChars: 0 }),
    remember: async (args: { change: unknown }) => ({ status: 'ok', change: args.change }),
    editMemory: async (args: { change: unknown }) => ({ status: 'ok', change: args.change }),
    openProjectScreen: async () => undefined,
    onChatMessageAppended: (listener: (event: ProjectChatAppendedEvent) => void) => {
      appendedListeners.push(listener)
      return () => undefined
    },
    onOpenChat: (listener: (event: ProjectChatRef) => void) => {
      openChatListeners.push(listener)
      return () => undefined
    },
  }
  bridge = Object.fromEntries(
    Object.entries(fake).map(([name, fn]) => [name, vi.fn(fn as (...args: unknown[]) => unknown)]),
  ) as typeof bridge
  window.projectFolderApi = bridge as unknown as ProjectFolderApi
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete window.projectFolderApi
})

const READY: SubscriptionStatusMap = {
  'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
  codex: { provider: 'codex', state: 'signed-out', meteredAccepted: false },
}

const connection: SubscriptionConnection = {
  statuses: READY,
  busy: false,
  failed: {},
  codexImageAvailable: false,
  install: vi.fn(),
  login: vi.fn(),
  switchAccount: vi.fn(),
  logout: vi.fn(),
  recheck: vi.fn(),
  refresh: vi.fn(),
  acceptMetered: vi.fn(async () => undefined),
  openInstallHelp: vi.fn(),
}

const settle = async (rounds = 10): Promise<void> => {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

async function renderPanel(
  extra: { openChatRequest?: { projectId: string; chatId: string; seq: number } } = {},
): Promise<void> {
  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(KbAskPanel, {
          connection,
          aiSettings: stored,
          noticeDue: false,
          onOpenAiSettings: vi.fn(),
          onOpenPath: vi.fn(),
          onGoToRecents: vi.fn(),
          ...extra,
        }),
      ),
    )
    await settle()
  })
}

async function click(element: Element | null | undefined): Promise<void> {
  expect(element).toBeTruthy()
  await act(async () => {
    ;(element as HTMLElement).click()
    await settle()
  })
}

async function ask(text: string): Promise<void> {
  const box = host.querySelector<HTMLTextAreaElement>('textarea')!
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(box, text)
    box.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click(host.querySelector('.ai-send-btn:not(.ai-stop-btn)'))
}

async function answer(chunks: Array<Omit<AiStreamChunk, 'requestId'>>): Promise<void> {
  const request = aiStream.mock.calls.at(-1)![0]
  await act(async () => {
    for (const chunk of chunks) {
      for (const listener of [...streamListeners]) {
        listener({ requestId: request.requestId, ...chunk })
      }
    }
    await settle()
  })
}

const lastRequest = (): AiStreamRequest => aiStream.mock.calls.at(-1)![0]
const toolNames = (): string[] => lastRequest().tools.map((tool) => tool.name)
const texts = (): string[] =>
  Array.from(host.querySelectorAll('.kb-ask-msg')).map((m) => m.textContent ?? '')

async function chooseInPicker(selector: string): Promise<void> {
  await click(host.querySelector('.ai-input-below .ai-project-chip'))
  await click(host.querySelector(`.ai-input-below ${selector}`))
}

describe('the home ask without a project', () => {
  it('shows the project picker under the composer, at "No project"', async () => {
    await renderPanel()
    const chip = host.querySelector('.ai-input-below .ai-project-chip')
    expect(chip).not.toBeNull()
    expect(chip!.textContent).toContain(projectPanelText('en', 'noProject'))
    expect(host.querySelector('.ai-project-chat-menu')).toBeNull()
  })

  it('keeps the chat in memory: nothing recorded, no project scope, no project tools', async () => {
    await renderPanel()
    await ask('What about pets?')
    expect(kbOpenScope).not.toHaveBeenCalled()
    expect(bridge.readContext).not.toHaveBeenCalled()
    expect(bridge.openScope).not.toHaveBeenCalled()
    expect(toolNames()).not.toContain('project_list_files')
    await answer([{ type: 'delta', text: 'Allowed.' }, { type: 'done' }])
    expect(bridge.appendChat).not.toHaveBeenCalled()
    expect(host.querySelector('.kb-ask-nosave')!.textContent).toBe(strings.en.askNoSave)
  })

  it('behaves as before when the window has no project folder bridge', async () => {
    delete window.projectFolderApi
    await renderPanel()
    expect(host.querySelector('.ai-input-below')).toBeNull()
    await ask('What about pets?')
    expect(aiStream).toHaveBeenCalledTimes(1)
  })
})

describe('the home ask with a project', () => {
  beforeEach(() => {
    // the last home choice, kept by main
    selection = { projectId: 'p1', initialChatId: null }
  })

  it('starts at the last home choice with a new chat and shows the chat menu', async () => {
    await renderPanel()
    expect(bridge.getSelection).toHaveBeenCalled()
    expect(bridge.newChat).toHaveBeenCalledWith({ projectId: 'p1' })
    expect(host.querySelector('.ai-input-below .ai-project-chip')!.textContent).toContain(
      PROJECT.name,
    )
    expect(host.querySelector('.kb-ask-headbar .ai-project-chat-menu')).not.toBeNull()
  })

  it('reads the project plus All, prepares the context before the request, and offers the project tools', async () => {
    await renderPanel()
    await ask('Summarise the plan')
    expect(kbOpenScope).toHaveBeenCalledWith({ group: null, projectId: 'p1' })
    expect(kbList).toHaveBeenLastCalledWith('kb-scope-1')
    // the project context and its run scope are ready before the request goes out
    expect(calls.indexOf('readContext')).toBeGreaterThan(-1)
    expect(calls.indexOf('readContext')).toBeLessThan(calls.indexOf('aiStream'))
    expect(calls.indexOf('openScope')).toBeLessThan(calls.indexOf('aiStream'))
    expect(toolNames()).toEqual(
      expect.arrayContaining([
        'search_knowledge_base',
        'project_list_files',
        'project_search',
        'project_read',
        'project_remember',
      ]),
    )
    // the project goes into the system prompt, not into the question
    expect(lastRequest().system).toContain(PROJECT.name)
    expect(lastRequest().system).toContain('Write in short sentences.')
    expect(JSON.stringify(lastRequest().messages)).not.toContain('Write in short sentences.')
  })

  it('keeps the group choice: the scope covers the project plus that group', async () => {
    await renderPanel()
    await click(
      Array.from(host.querySelectorAll('.kb-ask-scope button')).find(
        (b) => b.textContent === 'Unit A',
      ),
    )
    await ask('Summarise the plan')
    expect(kbOpenScope).toHaveBeenCalledWith({ group: 'Unit A', projectId: 'p1' })
  })

  it('asks even when nothing is starred: the folder is there to read', async () => {
    starred = []
    await renderPanel()
    expect(host.querySelector('.kb-ask-hero')).toBeNull()
    await ask('Summarise the plan')
    expect(aiStream).toHaveBeenCalledTimes(1)
  })

  it('records the question and the answer in the project chat, and closes the scopes', async () => {
    await renderPanel()
    await ask('Summarise the plan')
    await answer([{ type: 'delta', text: 'It has three parts.' }, { type: 'done' }])
    expect(bridge.appendChat).toHaveBeenCalledTimes(2)
    expect(bridge.appendChat.mock.calls[0]![0]).toMatchObject({
      projectId: 'p1',
      chatId: 'chat-1',
      role: 'user',
      text: 'Summarise the plan',
    })
    expect(bridge.appendChat.mock.calls[1]![0]).toMatchObject({
      role: 'assistant',
      text: 'It has three parts.',
    })
    expect(bridge.closeScope).toHaveBeenCalledWith({ scope: 'project-scope-1' })
    expect(kbCloseScope).toHaveBeenCalledWith('kb-scope-1')
    expect(host.querySelector('.kb-ask-nosave')).toBeNull()
  })

  it('sends nothing when main refuses the scope because the project folder is gone', async () => {
    kbProjectGone = true
    await renderPanel()
    await ask('Summarise the plan')
    expect(aiStream).not.toHaveBeenCalled()
    expect(bridge.readContext).not.toHaveBeenCalled()
    expect(bridge.appendChat).not.toHaveBeenCalled()
    expect(host.querySelector('.kb-ask-error')!.textContent).toBe(
      kbAskProjectText('en', 'askProjectMissing'),
    )
  })

  it('sends nothing when the project context finds the folder gone, and gives the scope back', async () => {
    contextStatus = 'missing'
    await renderPanel()
    await ask('Summarise the plan')
    expect(bridge.readContext).toHaveBeenCalled()
    expect(bridge.openScope).not.toHaveBeenCalled()
    expect(aiStream).not.toHaveBeenCalled()
    expect(bridge.appendChat).not.toHaveBeenCalled()
    expect(kbCloseScope).toHaveBeenCalledWith('kb-scope-1')
    expect(host.querySelector('.kb-ask-error')!.textContent).toBe(
      kbAskProjectText('en', 'askProjectMissing'),
    )
  })

  it('shows what the send brought up, and [View] opens the project screen there', async () => {
    notices = [{ kind: 'memory-changed' }, { kind: 'unwritable' }]
    await renderPanel()
    await ask('Summarise the plan')
    const notice = host.querySelector('[data-notice="memory-changed"]')
    expect(notice!.textContent).toContain(projectPanelText('en', 'memoryChanged'))
    expect(host.querySelector('[data-notice="unwritable"]')).not.toBeNull()
    await click(notice!.querySelector('button'))
    expect(bridge.openProjectScreen).toHaveBeenCalledWith({ projectId: 'p1', section: 'memory' })
  })

  it('shows a memory line for project_remember, and [Remove] takes the entry out', async () => {
    await renderPanel()
    await ask('Remember that the deadline is Friday')
    await answer([
      {
        type: 'tool-call',
        toolCall: {
          id: 't1',
          name: 'project_remember',
          input: { op: 'add', text: 'Deadline is Friday (2026-10-30)' },
        },
      },
      { type: 'done' },
    ])
    await answer([{ type: 'delta', text: 'Noted.' }, { type: 'done' }])
    const line = host.querySelector('[data-memory-op="add"]')
    expect(line!.textContent).toContain('Deadline is Friday (2026-10-30)')
    // the record keeps the remember output, so the line comes back when the chat reopens
    const answerRecord = bridge.appendChat.mock.calls.at(-1)![0] as AppendProjectChatArgs
    expect(answerRecord.tools?.[0]).toMatchObject({ name: 'project_remember' })
    expect(answerRecord.tools?.[0]?.output).toContain('Memory updated: ')
    await click(line!.querySelector('button'))
    expect(bridge.editMemory).toHaveBeenCalledWith({
      projectId: 'p1',
      change: { op: 'remove', text: 'Deadline is Friday (2026-10-30)' },
    })
    expect(host.querySelector('[data-memory-op="remove"]')).not.toBeNull()
  })

  it('"New chat" in the chat menu starts a new project chat and clears the transcript', async () => {
    await renderPanel()
    await ask('Summarise the plan')
    await answer([{ type: 'delta', text: 'It has three parts.' }, { type: 'done' }])
    expect(texts()).toHaveLength(2)
    await click(host.querySelector('.ai-project-chat-button'))
    await click(host.querySelector('.ai-project-row-new'))
    expect(bridge.newChat).toHaveBeenCalledTimes(2)
    expect(texts()).toHaveLength(0)
  })

  it('opens a chat the project screen sent here, with other editors’ tools as one line', async () => {
    await renderPanel()
    await act(async () => {
      for (const listener of openChatListeners) listener({ projectId: 'p1', chatId: 'old-chat' })
      await settle()
    })
    expect(bridge.openChat).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', chatId: 'old-chat' }),
    )
    expect(texts()[0]).toContain('What did we spend on paper?')
    expect(texts()[1]).toContain('About 120,000 won.')
    expect(host.querySelector('.ai-project-tool-summary')!.textContent).toContain('plan.docx')
    // the reopened chat is the model's history for the next question
    await ask('And on ink?')
    expect(JSON.stringify(lastRequest().messages)).toContain('About 120,000 won.')
  })

  it('shows a message another window recorded in the same chat', async () => {
    await renderPanel()
    await act(async () => {
      for (const listener of appendedListeners) {
        listener({
          projectId: 'p1',
          chatId: 'chat-1',
          message: {
            seq: 7,
            ts: '2026-10-30T00:00:00.000Z',
            role: 'user',
            text: 'Asked in the word editor',
            editor: 'docs',
            origin: 'me',
          },
        })
      }
      await settle()
    })
    expect(texts()).toEqual([expect.stringContaining('Asked in the word editor')])
  })
})

describe('choosing in the picker', () => {
  it('a project starts its chat; "No project" brings the in-memory chat back', async () => {
    await renderPanel()
    await ask('What about pets?')
    await answer([{ type: 'delta', text: 'Allowed.' }, { type: 'done' }])
    expect(texts()).toHaveLength(2)
    await chooseInPicker('.ai-project-row-project')
    expect(bridge.setSelection).toHaveBeenLastCalledWith({ projectId: 'p1' })
    expect(texts()).toHaveLength(0)
    expect(host.querySelector('.ai-project-chat-menu')).not.toBeNull()
    await chooseInPicker('.ai-project-row-none')
    expect(bridge.setSelection).toHaveBeenLastCalledWith({ projectId: null })
    expect(texts()).toHaveLength(2)
    expect(texts()[1]).toContain('Allowed.')
    // the restored chat is the model's history again, still unrecorded
    await ask('And cats?')
    expect(JSON.stringify(lastRequest().messages)).toContain('Allowed.')
    expect(bridge.appendChat).not.toHaveBeenCalled()
  })
})

describe('what the picker could not do', () => {
  it('says why a folder was refused (spec 5.1)', async () => {
    await renderPanel()
    await chooseInPicker('.ai-project-row-add-folder')
    expect(bridge.addFolder).toHaveBeenCalledTimes(1)
    const line = host.querySelector('[data-problem="refused"]')
    expect(line?.getAttribute('role')).toBe('alert')
    expect(line?.textContent).toBe(projectPanelText('en', 'refusedProtected'))
    // the choice stays where it was
    expect(bridge.setSelection).not.toHaveBeenCalled()
  })
})

describe('a chat the project screen handed over', () => {
  it('opens it once the ask panel is shown', async () => {
    await renderPanel({ openChatRequest: { projectId: 'p1', chatId: 'old-chat', seq: 1 } })
    await act(async () => {
      await settle()
    })
    expect(bridge.openChat).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', chatId: 'old-chat' }),
    )
    expect(texts()[1]).toContain('About 120,000 won.')
  })
})

describe('kb-ask-project helpers', () => {
  it('opens the knowledge scope as before without a project, and with the project otherwise', async () => {
    const api = { kbOpenScope: vi.fn(async () => 's') }
    expect(await openAskScope(api, null, null)).toBeUndefined()
    expect(api.kbOpenScope).not.toHaveBeenCalled()
    await openAskScope(api, 'A', null)
    expect(api.kbOpenScope).toHaveBeenLastCalledWith('A')
    await openAskScope(api, null, 'p1')
    expect(api.kbOpenScope).toHaveBeenLastCalledWith({ group: null, projectId: 'p1' })
  })

  it('tells a gone group from a gone project by main’s refusal', () => {
    const ipc = (message: string) =>
      new Error(`Error invoking remote method 'kb:open-scope': Error: ${message}`)
    expect(askScopeFailure(ipc(KB_GROUP_EMPTY), null)).toBe('group-gone')
    expect(askScopeFailure(ipc(KB_GROUP_EMPTY), 'p1')).toBe('group-gone')
    expect(askScopeFailure(ipc(PROJECT_UNAVAILABLE), 'p1')).toBe('project-missing')
  })

  it('keeps a tool’s output only for the remember tool', () => {
    const call = (name: string) => ({ id: '1', name, input: {} })
    expect(
      toolRecordOf(call('project_read'), { output: 'secret text', summary: 'Read: a.docx' }),
    ).toEqual({ name: 'project_read', summary: 'Read: a.docx' })
    expect(
      toolRecordOf(call('read_knowledge_file'), { output: 'secret text', summary: 'Read' }),
    ).toEqual({ name: 'read_knowledge_file', summary: 'Read' })
    expect(
      toolRecordOf(call('project_remember'), {
        output: 'Memory updated: {"op":"add","text":"x"}',
        summary: 'Remembered: x',
      }),
    ).toMatchObject({ output: 'Memory updated: {"op":"add","text":"x"}' })
  })

  it('shows stored tool records the way they showed when they ran', () => {
    const labels = { search: 'Searched', read: 'Read', create: 'Created' }
    expect(
      storedToolNotes(
        [
          { name: 'search_knowledge_base', summary: 'x' },
          { name: 'project_search', summary: 'Searched the project: plan' },
          { name: 'project_remember', summary: 'Remembered: x' },
          { name: 'use_skill', summary: 'Used the lease skill' },
          { name: 'read_skill_file', summary: 'ignored' },
        ],
        labels,
      ),
    ).toEqual([
      { label: 'Searched', kind: 'search' },
      { label: 'Searched the project: plan', kind: 'search' },
      { label: 'Used the lease skill', kind: 'skill' },
    ])
  })
})

describe('the home ask names the chosen project (first-use fixes)', () => {
  const placeholder = () => host.querySelector<HTMLTextAreaElement>('textarea')!.placeholder

  it('says the project in the head, the first line and the input hint', async () => {
    selection = { projectId: 'p1', initialChatId: null }
    await renderPanel()
    const head = host.querySelector('.kb-ask-headbar')!.textContent!
    expect(head).toContain(kbAskProjectText('en', 'askProjectTitle', { name: PROJECT.name }))
    expect(head).not.toContain('Ask your knowledge base')
    expect(placeholder()).toBe(
      kbAskProjectText('en', 'askProjectStarsPlaceholder', { name: PROJECT.name }),
    )
    expect(host.querySelector('.kb-ask-hint')!.textContent).toBe(
      kbAskProjectText('en', 'askProjectIntro', { name: PROJECT.name }),
    )
  })

  it('leaves the star count out with a project and nothing starred', async () => {
    selection = { projectId: 'p1', initialChatId: null }
    starred = []
    await renderPanel()
    expect(host.querySelector('.kb-ask-headbar')!.textContent).not.toContain('starred files')
    expect(placeholder()).toBe(
      kbAskProjectText('en', 'askProjectPlaceholder', { name: PROJECT.name }),
    )
  })

  it('without a project, points to the picker from the empty-stars guide and keeps its words', async () => {
    starred = []
    await renderPanel()
    expect(host.querySelector('.kb-ask-hero')!.textContent).toContain(
      kbAskProjectText('en', 'askHeroProjectHint'),
    )
    expect(placeholder()).toBe(strings.en.askPlaceholder)
  })

  it('a document made into the project folder says where it went, opens, and needs no "save as"', async () => {
    selection = { projectId: 'p1', initialChatId: null }
    const created = '/work/annual-report/October minutes.md'
    ;(window.aiOffice as unknown as Record<string, unknown>).kbCreateDocument = vi.fn(async () => ({
      path: created,
    }))
    const onOpenPath = vi.fn()
    await act(async () => {
      root.render(
        createElement(
          LocaleProvider,
          { initial: 'en' },
          createElement(KbAskPanel, {
            connection,
            aiSettings: stored,
            noticeDue: false,
            onOpenAiSettings: vi.fn(),
            onOpenPath,
            onGoToRecents: vi.fn(),
          }),
        ),
      )
      await settle()
    })
    await ask('Make the October minutes')
    await answer([
      {
        type: 'tool-call',
        toolCall: {
          id: 'c1',
          name: 'create_document',
          input: { title: 'October minutes', format: 'md', content: '# Minutes\n' },
        },
      },
      { type: 'done' },
    ])
    await answer([{ type: 'delta', text: 'Made it.' }, { type: 'done' }])
    const note = host.querySelector('.kb-ask-tool-note.is-done')!
    expect(note.textContent).toContain(
      kbAskProjectText('en', 'askSavedToProject', { name: 'October minutes.md' }),
    )
    expect(host.textContent).not.toContain(strings.en.askToolCreate)
    expect(host.querySelector('.kb-ask-actions')).toBeNull()
    await click(note.querySelector('button'))
    expect(onOpenPath).toHaveBeenCalledWith(created)
  })
})

describe('a created document and the project folder', () => {
  const labels = (name: string) => `saved: ${name}`

  it('turns the "making" note into a done one only inside the project folder', () => {
    const notes = [
      { label: 'Searching', kind: 'search' as const },
      { label: 'Making a document', kind: 'create' as const },
    ]
    expect(notesAfterCreate(notes, 'D:\\Work\\P\\a.md', 'd:\\work\\p', labels)).toEqual([
      notes[0],
      { label: 'saved: a.md', kind: 'created', path: 'D:\\Work\\P\\a.md' },
    ])
    expect(notesAfterCreate(notes, 'D:\\Work\\Other\\a.md', 'D:\\Work\\P', labels)).toBeNull()
    expect(notesAfterCreate(notes, '/home/me/P/a.md', null, labels)).toBeNull()
    expect(notesAfterCreate(notes, undefined, '/home/me/P', labels)).toBeNull()
    expect(pathInsideFolder('/home/me/Project2/a.md', '/home/me/Project')).toBe(false)
  })
})
