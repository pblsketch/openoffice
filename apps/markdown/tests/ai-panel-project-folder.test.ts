import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeAiSettings,
  type AiSettings,
  type SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import { AiPanel, type MarkdownAiDeps } from '../src/renderer/ai/AiPanel'
import {
  installDocumentChatStore,
  installProjectFolderBridge,
  projectMessage,
  removeProjectFolderBridge,
} from './helpers/project-folder-fake'

// The project folder attached to the markdown AI panel (spec 5), against fake
// bridges. No provider is ever called: the fake `aiStream` only records the
// request and the test plays the main process's chunks back.

interface StreamRequest {
  requestId: string
  system: string
  tools: Array<{ name: string }>
}

type Chunk = Record<string, unknown> & { type: string }

const READY = {
  'claude-code': { provider: 'claude-code', state: 'ready', meteredAccepted: false },
  codex: { provider: 'codex', state: 'not-installed', meteredAccepted: false },
} as SubscriptionStatusMap

function installEditorBridge() {
  const settings: AiSettings = { ...normalizeAiSettings(undefined), subscriptionNoticeSeen: true }
  const streamListeners = new Set<(chunk: Chunk) => void>()
  const requests: StreamRequest[] = []
  const api = {
    getAiSettings: vi.fn(async () => settings),
    setAiSettings: vi.fn(async () => {}),
    onAiSettingsChanged: () => () => {},
    openAiModelSettings: vi.fn(async () => {}),
    setAiPanelPrefs: vi.fn(async () => ({})),
    aiStream: vi.fn(async (request: StreamRequest) => {
      requests.push(request)
    }),
    aiStreamCancel: vi.fn(async () => {}),
    onAiStream: (listener: (chunk: Chunk) => void) => {
      streamListeners.add(listener)
      return () => streamListeners.delete(listener)
    },
    aiSubscription: {
      statuses: vi.fn(async () => READY),
      recheck: vi.fn(async () => READY),
      login: vi.fn(async () => ({ ok: true })),
      install: vi.fn(async () => ({ ok: true })),
      setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses: READY })),
      onChanged: vi.fn(() => () => {}),
      openInstallHelp: vi.fn(async () => {}),
    },
    aiToolCapabilities: vi.fn(async () => ({ imageGeneration: { available: false } })),
  }
  Object.defineProperty(window, 'markdownApi', { configurable: true, value: api })
  return {
    api,
    requests,
    /** the reply to the last request: one text delta, then done */
    reply: (text: string) => {
      const requestId = requests.at(-1)!.requestId
      for (const listener of [...streamListeners]) {
        listener({ requestId, type: 'delta', text })
        listener({ requestId, type: 'done' })
      }
    },
  }
}

const mounted: Array<{ root: Root; container: HTMLElement }> = []

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mountPanel(filePath: string | null = null): Promise<HTMLElement> {
  const deps: MarkdownAiDeps = {
    getEditor: () => null,
    getFrontmatter: () => '',
    setFrontmatter: () => {},
    getSnapshot: () => ({ body: '', frontmatter: '' }),
    restoreSnapshot: () => {},
    onRunDone: () => {},
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(createElement(AiPanel, { deps, filePath, onCollapse: () => {} })))
  mounted.push({ root, container })
  await settle()
  return container
}

async function sendMessage(container: HTMLElement, text: string): Promise<void> {
  const textarea = container.querySelector<HTMLTextAreaElement>('textarea')!
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => container.querySelector<HTMLButtonElement>('.ai-send-btn')!.click())
  await settle()
}

/** the header's "New chat" button sits right before the collapse button */
const newChatButton = (container: HTMLElement) =>
  container.querySelector('.ai-panel-header-actions .ai-panel-collapse')!
    .previousElementSibling as HTMLButtonElement

beforeAll(() => {
  Element.prototype.scrollTo ??= () => {}
})

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
  removeProjectFolderBridge()
  vi.unstubAllGlobals()
})

describe('markdown AI panel: project folder', () => {
  it('without the bridge shows no picker and keeps the per-document chat', async () => {
    const editor = installEditorBridge()
    const store = installDocumentChatStore()
    const container = await mountPanel()
    expect(container.querySelector('.ai-input-below')).toBeNull()
    await sendMessage(container, 'hello')
    expect(editor.requests[0]!.system).not.toContain('## Project folder')
    expect(store.appendChat).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'doc-project', chatId: 'doc-chat', role: 'user' }),
    )
  })

  it('puts the picker under the input box and records no project as before', async () => {
    const editor = installEditorBridge()
    const store = installDocumentChatStore()
    const fake = installProjectFolderBridge()
    const container = await mountPanel()

    const below = container.querySelector('.ai-composer .ai-input-below')
    expect(below?.querySelector('.ai-project-chip')).not.toBeNull()
    // no project: no chat menu in the header
    expect(container.querySelector('.ai-panel-header .ai-project-chat-button')).toBeNull()

    await sendMessage(container, 'hello')
    act(() => editor.reply('hi there'))
    await settle()
    // the per-document store gets both messages; nothing goes to the project folder
    expect(store.appendChat).toHaveBeenCalledTimes(2)
    expect(fake.bridge.appendChat).not.toHaveBeenCalled()
    expect(fake.bridge.readContext).not.toHaveBeenCalled()
    // the project skill is in the list but adds nothing without a project
    expect(editor.requests[0]!.system).not.toContain('## Project folder')
    expect(editor.requests[0]!.tools.map((t) => t.name)).not.toContain('project_list_files')

    // "New chat" stays today's reset: no project chat is made
    act(() => newChatButton(container)!.click())
    await settle()
    expect(fake.bridge.newChat).not.toHaveBeenCalled()
    expect(container.querySelector('.ai-msg-user')).toBeNull()
  })

  it('with a project: prepares the context before the run and records into the folder', async () => {
    const editor = installEditorBridge()
    const store = installDocumentChatStore()
    const fake = installProjectFolderBridge({
      selection: { projectId: 'p1', initialChatId: null },
      context: { notices: [{ kind: 'memory-changed' }] },
    })
    const container = await mountPanel('C:/work/report/notes.md')
    expect(fake.bridge.newChat).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.ai-panel-header .ai-project-chat-button')).not.toBeNull()

    const release = fake.holdReadContext()
    await sendMessage(container, 'summarize')
    // the run waits for the project context
    expect(fake.bridge.readContext).toHaveBeenCalledWith({ projectId: 'p1' })
    expect(editor.api.aiStream).not.toHaveBeenCalled()
    release()
    await settle()
    expect(editor.api.aiStream).toHaveBeenCalledTimes(1)
    expect(fake.order.slice(0, 2)).toEqual(['readContext', 'openScope'])

    const request = editor.requests[0]!
    expect(request.system).toContain('## Project folder')
    expect(request.system).toContain('Write in short bullet points.')
    expect(request.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'project_list_files',
        'project_search',
        'project_read',
        'project_remember',
      ]),
    )
    // the notice the context carried shows in the panel
    expect(
      container.querySelector('.ai-project-notice[data-notice="memory-changed"]'),
    ).not.toBeNull()

    act(() => editor.reply('done'))
    await settle()
    expect(fake.appended.map((m) => [m.chatId, m.role, m.text])).toEqual([
      ['new1', 'user', 'summarize'],
      ['new1', 'assistant', 'done'],
    ])
    expect(store.appendChat).not.toHaveBeenCalled()
    expect(fake.order).toContain('closeScope')

    // "New chat" starts a new project chat and clears the transcript
    act(() => newChatButton(container)!.click())
    await settle()
    expect(fake.bridge.newChat).toHaveBeenCalledTimes(2)
    expect(container.querySelector('.ai-msg-user')).toBeNull()
  })

  it('opens the chat main chose, with memory lines and another editor’s tools as one line', async () => {
    installEditorBridge()
    installDocumentChatStore()
    const fake = installProjectFolderBridge({
      selection: { projectId: 'p1', initialChatId: 'c7' },
      chats: {
        c7: [
          projectMessage({ seq: 1, role: 'user', text: 'plan it', editor: 'hwp' }),
          projectMessage({
            seq: 2,
            role: 'assistant',
            text: 'planned',
            editor: 'hwp',
            fileRef: 'reports/plan.hwp',
            tools: [
              { name: 'hwp_edit', summary: 'edited' },
              {
                name: 'project_remember',
                summary: 'remembered',
                output: 'Memory updated: {"op":"add","text":"Due Friday (2026-10-29)"}',
              },
            ],
          }),
        ],
      },
    })
    const container = await mountPanel('C:/work/report/notes.md')
    expect(fake.bridge.openChat).toHaveBeenCalledWith({ projectId: 'p1', chatId: 'c7', limit: 200 })
    expect(container.querySelector('.ai-msg-user')?.textContent).toContain('plan it')
    expect(container.querySelector('.ai-project-tool-summary')?.textContent).toContain('plan.hwp')
    const memory = container.querySelector('.ai-project-event[data-memory-op="add"]')
    expect(memory?.textContent).toContain('Due Friday')

    // [Remove] takes the entry out of memory.md
    act(() => memory!.querySelector<HTMLButtonElement>('.ai-project-link')!.click())
    await settle()
    expect(fake.bridge.editMemory).toHaveBeenCalledWith({
      projectId: 'p1',
      change: { op: 'remove', text: 'Due Friday (2026-10-29)' },
    })
  })

  it('shows another window’s messages and tells main about the first save', async () => {
    installEditorBridge()
    installDocumentChatStore()
    const fake = installProjectFolderBridge({ selection: { projectId: 'p1', initialChatId: null } })
    const deps: MarkdownAiDeps = {
      getEditor: () => null,
      getFrontmatter: () => '',
      setFrontmatter: () => {},
      getSnapshot: () => ({ body: '', frontmatter: '' }),
      restoreSnapshot: () => {},
      onRunDone: () => {},
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const render = (filePath: string | null) =>
      act(() => root.render(createElement(AiPanel, { deps, filePath, onCollapse: () => {} })))
    render(null)
    mounted.push({ root, container })
    await settle()

    act(() =>
      fake.emitAppended({
        projectId: 'p1',
        chatId: 'new1',
        message: projectMessage({ seq: 50, role: 'user', text: 'from the other window' }),
      }),
    )
    await settle()
    expect(container.querySelector('.ai-msg-user')?.textContent).toContain('from the other window')

    render('C:/work/report/new.md')
    await settle()
    expect(fake.bridge.attachDocument).toHaveBeenCalledWith({ projectId: 'p1', chatId: 'new1' })
  })
})
