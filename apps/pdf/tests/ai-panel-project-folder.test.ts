/**
 * The project folder attached to the PDF AI panel (spec 5), against fake
 * bridges: the picker under the input, the project skill in every request,
 * the context read before the run, where messages are recorded, and "New
 * chat". No provider is ever reached.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcStreamChunk } from '@genoffice/agent-core'
import {
  normalizeAiSettings,
  type AiSettings,
  type SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import type { PdfAppDeps } from '../src/renderer/ai/tools'
import {
  installDocumentChatStore,
  installProjectFolderBridge,
  projectMessage,
  removeProjectFolderBridge,
} from './helpers/project-folder-fake'

interface StreamStart {
  requestId: string
  system: string
  tools: Array<{ name: string }>
}

const READY: SubscriptionStatusMap = {
  'claude-code': {
    provider: 'claude-code',
    state: 'ready',
    meteredAccepted: false,
    loginMethod: 'subscription',
  },
  codex: { provider: 'codex', state: 'not-installed', meteredAccepted: false },
}

function installEditorBridge() {
  const settings: AiSettings = { ...normalizeAiSettings({}), subscriptionNoticeSeen: true }
  const starts: StreamStart[] = []
  let streamListener: ((chunk: IpcStreamChunk) => void) | null = null
  const api = {
    getAiSettings: vi.fn(async () => settings),
    setAiSettings: vi.fn(async () => {}),
    onAiSettingsChanged: () => () => {},
    openAiModelSettings: vi.fn(async () => {}),
    onLanguageChanged: () => () => {},
    setAiPanelPrefs: vi.fn(async () => ({})),
    openSourcePath: vi.fn(async () => {}),
    subscription: {
      statuses: vi.fn(async () => READY),
      recheck: vi.fn(async () => READY),
      login: vi.fn(async () => ({ ok: true })),
      install: vi.fn(async () => ({ ok: true })),
      setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses: READY })),
      onChanged: () => () => {},
      openInstallHelp: vi.fn(async () => {}),
    },
    imageGenerationAvailable: vi.fn(async () => false),
    aiStream: vi.fn(async (request: StreamStart) => {
      starts.push(request)
    }),
    aiStreamCancel: vi.fn(async () => {}),
    onAiStream: (listener: (chunk: IpcStreamChunk) => void) => {
      streamListener = listener
      return () => {
        streamListener = null
      }
    },
  }
  vi.stubGlobal('pdfApi', api)
  return {
    api,
    starts,
    reply: (text: string) => {
      const requestId = starts.at(-1)!.requestId
      streamListener?.({ requestId, type: 'delta', text })
      streamListener?.({ requestId, type: 'done' })
    },
  }
}

const APP_DEPS = new Proxy(
  {
    fileName: () => 'doc.pdf',
    pageCount: () => 3,
    currentPage: () => 1,
    readOnly: () => false,
    selection: () => null,
    pendingSummary: () => '',
    annotationSummary: () => '',
    metadata: () => ({}),
    outline: () => null,
  } as Record<string, unknown>,
  {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return () => {
        throw new Error(`unexpected deps call: ${prop}`)
      }
    },
  },
) as unknown as PdfAppDeps

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  Element.prototype.scrollTo = () => {}
})

beforeEach(() => localStorage.clear())

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
  removeProjectFolderBridge()
  vi.unstubAllGlobals()
})

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  })

async function renderPanel(filePath?: string) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(AiPanel, { api: APP_DEPS, filePath, onCollapse: () => {} }),
      ),
    )
  })
  await settle()
  return container
}

async function typeAndEnter(panel: HTMLElement, text: string) {
  const input = panel.querySelector('.ai-composer textarea') as HTMLTextAreaElement
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => {
    setValue.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
  })
  await settle()
}

/** the header's "New chat" button sits right before the collapse button */
const newChatButton = (panel: HTMLElement) =>
  panel.querySelector('.ai-panel-header-actions .ai-panel-collapse')!
    .previousElementSibling as HTMLButtonElement

describe('PDF AI panel: project folder', () => {
  it('puts the picker under the input box and records no project as before', async () => {
    const editor = installEditorBridge()
    const store = installDocumentChatStore()
    const fake = installProjectFolderBridge()
    const panel = await renderPanel('C:/work/doc.pdf')

    expect(panel.querySelector('.ai-composer .ai-input-below .ai-project-chip')).not.toBeNull()
    expect(panel.querySelector('.ai-panel-header .ai-project-chat-button')).toBeNull()

    await typeAndEnter(panel, 'what is this')
    await act(async () => editor.reply('a report'))
    await settle()
    expect(store.appendChat.mock.calls.map(([m]) => m.role)).toEqual(['user', 'assistant'])
    expect(fake.bridge.appendChat).not.toHaveBeenCalled()
    expect(fake.bridge.readContext).not.toHaveBeenCalled()
    expect(editor.starts[0]!.system).not.toContain('## Project folder')

    await act(async () => newChatButton(panel).click())
    await settle()
    expect(fake.bridge.newChat).not.toHaveBeenCalled()
    expect(panel.querySelector('.ai-msg-user')).toBeNull()
  })

  it('with a project: the context is read before the run and the chat goes to the folder', async () => {
    const editor = installEditorBridge()
    const store = installDocumentChatStore()
    const fake = installProjectFolderBridge({
      selection: { projectId: 'p1', initialChatId: null },
      context: { notices: [{ kind: 'memory-long', chars: 9000, limit: 8000 }] },
    })
    const panel = await renderPanel('C:/work/report/doc.pdf')
    expect(panel.querySelector('.ai-panel-header .ai-project-chat-button')).not.toBeNull()

    const release = fake.holdReadContext()
    await typeAndEnter(panel, 'summarize')
    expect(fake.bridge.readContext).toHaveBeenCalledWith({ projectId: 'p1' })
    expect(editor.api.aiStream).not.toHaveBeenCalled()
    release()
    await settle()
    expect(editor.api.aiStream).toHaveBeenCalledTimes(1)
    expect(editor.starts[0]!.system).toContain('## Project folder')
    expect(editor.starts[0]!.tools.map((t) => t.name)).toContain('project_read')
    expect(panel.querySelector('.ai-project-notice[data-notice="memory-long"]')).not.toBeNull()

    await act(async () => editor.reply('summary'))
    await settle()
    expect(fake.appended.map((m) => [m.chatId, m.role])).toEqual([
      ['new1', 'user'],
      ['new1', 'assistant'],
    ])
    expect(store.appendChat).not.toHaveBeenCalled()
    expect(fake.order).toContain('closeScope')

    await act(async () => newChatButton(panel).click())
    await settle()
    expect(fake.bridge.newChat).toHaveBeenCalledTimes(2)
    expect(panel.querySelector('.ai-msg-user')).toBeNull()
  })

  it('choosing "No project" goes back to the per-document chat', async () => {
    installEditorBridge()
    const store = installDocumentChatStore([
      projectMessage({ seq: 1, role: 'user', text: 'document question' }),
      projectMessage({ seq: 2, role: 'assistant', text: 'document answer' }),
    ])
    const fake = installProjectFolderBridge({
      selection: { projectId: 'p1', initialChatId: 'c1' },
      chats: {
        c1: [
          projectMessage({ seq: 1, role: 'user', text: 'project question', editor: 'pdf' }),
          projectMessage({ seq: 2, role: 'assistant', text: 'project answer', editor: 'pdf' }),
        ],
      },
    })
    const panel = await renderPanel('C:/work/report/doc.pdf')
    expect(panel.querySelector('.ai-msg-user')?.textContent).toContain('project question')
    expect(panel.textContent).not.toContain('document question')

    // the chip's list: "No project" is its last row
    await act(async () => panel.querySelector<HTMLButtonElement>('.ai-project-chip')!.click())
    await settle()
    const rows = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
    await act(async () => rows.at(-1)!.click())
    await settle()
    expect(fake.bridge.setSelection).toHaveBeenCalledWith({ projectId: null })
    expect(store.loadChat).toHaveBeenCalledTimes(2)
    expect(panel.querySelector('.ai-msg-user')?.textContent).toContain('document question')
  })
})
