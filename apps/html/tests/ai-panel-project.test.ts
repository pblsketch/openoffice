/**
 * The AI panel with project folders (decision 0088), against a fake project
 * folder bridge and a scripted stream: the project skill joins the request,
 * its context is read before the run starts, messages go to the project chat
 * (or, with no project, to the per-document store as before), "New chat"
 * starts a project chat, and the project chip sits under the input. No
 * provider is reached: the stream channel is the fake below.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { defaultAiSettings, type AiStreamChunk, type AiStreamRequest } from '@genoffice/ai-provider'
import type { SubscriptionStatusMap } from '@genoffice/ai-provider/browser'
import type {
  ProjectChatAppendedEvent,
  ProjectContextBundle,
  ProjectSelection,
} from '@genoffice/project-store'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { AiPanel, type HtmlAiDeps } from '../src/renderer/ai/AiPanel'
import { buildParseMap, type ParseMap } from '../src/renderer/document/parse-map'

const DOC = '<!doctype html><html><head><title>T</title></head><body><h1>Hello</h1></body></html>'

function fakeDeps(): HtmlAiDeps {
  let map: ParseMap | null = null
  return {
    access: {
      getText: () => DOC,
      getVersion: () => 1,
      getMap: () => (map ??= buildParseMap(DOC, 1, null)),
      getLastManualVersion: () => 0,
      getFilePath: () => 'C:/work/report/page.html',
      getSelectedSid: () => null,
      applyOps: () => ({ ok: true, ranges: [] }),
      replaceAll: () => undefined,
    },
    getSnapshot: () => ({ text: DOC }),
    restoreSnapshot: () => undefined,
    onPrompt: () => undefined,
    onRunDone: () => undefined,
    clearHighlights: () => undefined,
    navigateTo: () => undefined,
    onBriefConfirmed: () => undefined,
    previewDraft: () => undefined,
  }
}

const STATUSES = {
  'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
  codex: { provider: 'codex', state: 'ready', meteredAccepted: false },
} as SubscriptionStatusMap

function fakeHtmlApi() {
  let streamListener: ((chunk: AiStreamChunk) => void) | null = null
  const requests: AiStreamRequest[] = []
  const api = {
    getLanguage: async () => 'en',
    onLanguageChanged: () => () => {},
    getAiSettings: async () => ({ ...defaultAiSettings(), subscriptionNoticeSeen: true }),
    setAiSettings: async () => {},
    onAiSettingsChanged: () => () => {},
    openAiModelSettings: async () => {},
    aiToolCapabilities: async () => ({}),
    setAiPanelPrefs: async () => ({}),
    readAttachmentImage: async () => ({ ok: false }),
    subscription: {
      statuses: vi.fn(async () => STATUSES),
      recheck: vi.fn(async () => STATUSES),
      onChanged: () => () => {},
    },
    onAiStream: (listener: (chunk: AiStreamChunk) => void) => {
      streamListener = listener
      return () => {
        streamListener = null
      }
    },
    aiStream: async (request: AiStreamRequest) => {
      requests.push(request)
      for (const chunk of [{ type: 'delta', text: 'ok' }, { type: 'done' }]) {
        streamListener?.({ requestId: request.requestId, ...chunk } as AiStreamChunk)
      }
    },
    aiStreamCancel: async () => {},
  }
  return { api, requests }
}

const CONTEXT: ProjectContextBundle = {
  projectId: 'p1',
  name: 'Report 2026',
  trust: 'use',
  instructions: { text: 'Write in short bullet points.', sources: ['instructions'] },
  memory: { text: '- The deadline is Friday. (2026-10-20)', chars: 40 },
  files: [],
  filesOmitted: 0,
  canRemember: true,
  notices: [],
}

/** the project folder bridge with every call a mock; `order` records calls that matter for timing */
function fakeFolderApi(selection: ProjectSelection, context: ProjectContextBundle = CONTEXT) {
  const order: string[] = []
  let appended: ((event: ProjectChatAppendedEvent) => void) | null = null
  let releaseContext: (() => void) | null = null
  const holdContext = { on: false }
  let seq = 0
  let chats = 0
  const api = {
    listProjects: vi.fn(async () => [
      {
        id: 'p1',
        name: 'Report 2026',
        path: 'C:/work/report',
        pinned: false,
        lastUsedAt: '2026-10-29T00:00:00.000Z',
        missing: false,
        unwritable: false,
        syncFolder: false,
      },
    ]),
    getDefaultParentFolder: vi.fn(async () => 'C:/Users/me/Documents/IeumOffice'),
    getSelection: vi.fn(async () => selection),
    setSelection: vi.fn(async ({ projectId }: { projectId: string | null }) => ({
      projectId,
      initialChatId: null,
    })),
    readContext: vi.fn(async () => {
      order.push('readContext')
      if (holdContext.on) await new Promise<void>((resolve) => (releaseContext = resolve))
      return { status: 'ok' as const, context }
    }),
    openScope: vi.fn(async () => 'scope-1'),
    closeScope: vi.fn(async () => undefined),
    listFiles: vi.fn(async () => ({ files: [], total: 0 })),
    search: vi.fn(async () => ({ hits: [], total: 0 })),
    read: vi.fn(),
    remember: vi.fn(),
    editMemory: vi.fn(async ({ change }: { change: unknown }) => ({ status: 'ok', change })),
    listChats: vi.fn(async () => ({ chats: [], legacy: null })),
    newChat: vi.fn(async () => ({ chatId: `c${++chats}` })),
    openChat: vi.fn(async () => ({ status: 'not-found' })),
    appendChat: vi.fn(async (args: { role: 'user' | 'assistant'; text: string }) => {
      order.push(`append:${args.role}`)
      return {
        status: 'saved' as const,
        message: { ...args, seq: ++seq, ts: '2026-10-30T00:00:00.000Z', editor: 'html' },
      }
    }),
    renameChat: vi.fn(async () => ({ status: 'ok' })),
    deleteChat: vi.fn(async () => ({ status: 'ok' })),
    attachDocument: vi.fn(async () => ({ status: 'ok' })),
    openProjectScreen: vi.fn(async () => undefined),
    onChatMessageAppended: (listener: (event: ProjectChatAppendedEvent) => void) => {
      appended = listener
      return () => {
        appended = null
      }
    },
    onOpenChat: () => () => {},
  }
  return {
    api,
    order,
    holdContext,
    release: () => releaseContext?.(),
    emitAppended: (event: ProjectChatAppendedEvent) => appended?.(event),
  }
}

function fakeDocumentStore() {
  return {
    resolveChat: vi.fn(async () => ({ projectId: 'doc', chatId: 'doc-chat' })),
    appendChat: vi.fn(async (_args: unknown) => {}),
    loadChat: vi.fn(async () => []),
    rebindChat: vi.fn(async () => null),
  }
}

let container: HTMLElement
let unmount: () => void = () => {}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  Element.prototype.scrollTo = () => undefined
})
afterEach(() => {
  unmount()
  unmount = () => {}
  document.body.innerHTML = ''
  delete (window as { htmlApi?: unknown }).htmlApi
  delete (window as { projectFolderApi?: unknown }).projectFolderApi
  delete (window as { projectApi?: unknown }).projectApi
  vi.unstubAllGlobals()
})

async function settle(turns = 12): Promise<void> {
  for (let turn = 0; turn < turns; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mountPanel(options: {
  folder?: ReturnType<typeof fakeFolderApi>
  store: ReturnType<typeof fakeDocumentStore>
}) {
  const html = fakeHtmlApi()
  Object.assign(window, { htmlApi: html.api, projectApi: options.store })
  if (options.folder) Object.assign(window, { projectFolderApi: options.folder.api })
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      createElement(LocaleProvider, {
        initial: 'en',
        children: createElement(AiPanel, {
          deps: fakeDeps(),
          filePath: 'C:/work/report/page.html',
          editQueue: [],
          onQueueEditInstruction: () => undefined,
          onQueueRemove: () => undefined,
          onQueueClear: () => undefined,
          onQueueFocus: () => undefined,
          onQueueConsume: () => undefined,
          onCollapse: () => undefined,
        }),
      }),
    )
  })
  unmount = () => act(() => root.unmount())
  await settle()
  return html
}

const composer = () => container.querySelector<HTMLTextAreaElement>('.ai-input-box textarea')!

async function sendMessage(text: string, turns = 16): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(composer(), text)
    composer().dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => container.querySelector<HTMLButtonElement>('.ai-send-btn')!.click())
  await settle(turns)
}

const newChatButton = () =>
  container.querySelector<HTMLButtonElement>(
    '.ai-panel-header button.ai-header-btn[aria-label="New chat"]',
  )

const toolNames = (request: AiStreamRequest) =>
  (request as AiStreamRequest & { tools: Array<{ name: string }> }).tools.map((t) => t.name)

describe('the AI panel with a project chosen', () => {
  it('puts the project chip under the input and the chat menu in the header', async () => {
    const folder = fakeFolderApi({ projectId: 'p1', initialChatId: null })
    await mountPanel({ folder, store: fakeDocumentStore() })
    const below = container.querySelector('.ai-input-below')
    expect(below?.querySelector('.ai-project-chip')?.textContent).toContain('Report 2026')
    expect(container.querySelector('.ai-panel-header .ai-project-chat-menu')).not.toBeNull()
  })

  it('reads the project context before the run starts and sends the project tools', async () => {
    const folder = fakeFolderApi({ projectId: 'p1', initialChatId: null })
    folder.holdContext.on = true
    const store = fakeDocumentStore()
    const html = await mountPanel({ folder, store })
    await sendMessage('what is on the page?', 8)
    // the context read is still pending: nothing went to the model yet
    expect(folder.api.readContext).toHaveBeenCalledTimes(1)
    expect(html.requests).toHaveLength(0)
    folder.release()
    await settle()
    expect(html.requests).toHaveLength(1)
    const request = html.requests[0]! as AiStreamRequest & { system: string }
    expect(toolNames(request)).toEqual(
      expect.arrayContaining([
        'project_list_files',
        'project_search',
        'project_read',
        'project_remember',
      ]),
    )
    // the page's own tools stay
    expect(toolNames(request)).toEqual(expect.arrayContaining(['apply_ops']))
    expect(request.system).toContain('Report 2026')
    expect(request.system).toContain('Write in short bullet points.')
    // the run's scope is closed after the run
    expect(folder.api.closeScope).toHaveBeenCalled()
  })

  it('records both messages in the project chat, not the per-document store', async () => {
    const folder = fakeFolderApi({ projectId: 'p1', initialChatId: null })
    const store = fakeDocumentStore()
    await mountPanel({ folder, store })
    await sendMessage('hello')
    expect(folder.order.filter((o) => o.startsWith('append:'))).toEqual([
      'append:user',
      'append:assistant',
    ])
    expect(folder.api.appendChat.mock.calls[0]![0]).toMatchObject({
      projectId: 'p1',
      chatId: 'c1',
      role: 'user',
      text: 'hello',
    })
    expect(store.appendChat).not.toHaveBeenCalled()
  })

  it('shows the notices the context brought', async () => {
    const folder = fakeFolderApi(
      { projectId: 'p1', initialChatId: null },
      { ...CONTEXT, notices: [{ kind: 'memory-long', chars: 9000, limit: 8000 }] },
    )
    await mountPanel({ folder, store: fakeDocumentStore() })
    await sendMessage('hello')
    expect(container.querySelector('.ai-project-notice[data-notice="memory-long"]')).not.toBeNull()
  })

  it('"New chat" starts a new chat of the project and clears the panel', async () => {
    const folder = fakeFolderApi({ projectId: 'p1', initialChatId: null })
    await mountPanel({ folder, store: fakeDocumentStore() })
    await sendMessage('hello')
    expect(folder.api.newChat).toHaveBeenCalledTimes(1)
    await act(async () => newChatButton()!.click())
    await settle()
    expect(folder.api.newChat).toHaveBeenCalledTimes(2)
    expect(container.querySelectorAll('.ai-msg')).toHaveLength(0)
    await sendMessage('again')
    expect(folder.api.appendChat.mock.calls.at(-1)![0]).toMatchObject({ chatId: 'c2' })
  })

  it('shows a message another window recorded in the same chat', async () => {
    const folder = fakeFolderApi({ projectId: 'p1', initialChatId: null })
    await mountPanel({ folder, store: fakeDocumentStore() })
    await act(async () =>
      folder.emitAppended({
        projectId: 'p1',
        chatId: 'c1',
        message: {
          seq: 50,
          ts: '2026-10-30T00:00:00.000Z',
          role: 'user',
          text: 'asked in the other window',
          editor: 'docs',
          origin: 'install-a',
        },
      }),
    )
    await settle()
    expect(container.querySelector('.ai-msg-user')?.textContent).toContain(
      'asked in the other window',
    )
  })
})

describe('the AI panel with no project chosen', () => {
  it('keeps the per-document chat and sends no project tools', async () => {
    const folder = fakeFolderApi({ projectId: null, initialChatId: null })
    const store = fakeDocumentStore()
    const html = await mountPanel({ folder, store })
    expect(container.querySelector('.ai-input-below .ai-project-chip')).not.toBeNull()
    expect(container.querySelector('.ai-project-chat-menu')).toBeNull()
    await sendMessage('hello')
    expect(html.requests).toHaveLength(1)
    expect(toolNames(html.requests[0]!).some((name) => name.startsWith('project_'))).toBe(false)
    expect(folder.api.readContext).not.toHaveBeenCalled()
    expect(folder.api.appendChat).not.toHaveBeenCalled()
    expect(store.appendChat).toHaveBeenCalledTimes(2)
    expect(store.appendChat.mock.calls[0]![0]).toMatchObject({ chatId: 'doc-chat', text: 'hello' })
  })

  it('"New chat" clears the panel without asking the bridge for a chat', async () => {
    const folder = fakeFolderApi({ projectId: null, initialChatId: null })
    await mountPanel({ folder, store: fakeDocumentStore() })
    await sendMessage('hello')
    expect(container.querySelectorAll('.ai-msg').length).toBeGreaterThan(0)
    await act(async () => newChatButton()!.click())
    await settle()
    expect(container.querySelectorAll('.ai-msg')).toHaveLength(0)
    expect(folder.api.newChat).not.toHaveBeenCalled()
  })

  it('shows no project chip without the project folder bridge', async () => {
    await mountPanel({ store: fakeDocumentStore() })
    expect(container.querySelector('.ai-project-chip')).toBeNull()
  })
})
