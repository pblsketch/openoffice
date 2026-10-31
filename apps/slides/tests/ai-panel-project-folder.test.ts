import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// The project folder attached to the slides AI panel (spec 5), with the loop
// mocked: the test sees what the composed skill offers at the moment `run` is
// called, and plays the loop's events back. No provider is ever reached.

const agentHarness = vi.hoisted(() => ({
  events: null as null | {
    onDone?: (result: { text: string; cancelled: boolean; turnLimit: boolean }) => void
  },
  skill: null as null | { systemPrompt: string; tools: Array<{ name: string }> },
  /** what the skill offered when each run started */
  runs: [] as Array<{ instruction: unknown; prompt: string; tools: string[] }>,
  reset: vi.fn(),
  restore: vi.fn(),
}))

vi.mock('@genoffice/agent-core', async () => {
  const actual =
    await vi.importActual<typeof import('@genoffice/agent-core')>('@genoffice/agent-core')
  return {
    ...actual,
    AgentLoop: class MockAgentLoop {
      busy = false
      messages = []

      constructor(options: {
        events?: typeof agentHarness.events
        skill?: typeof agentHarness.skill
      }) {
        agentHarness.events = options.events ?? null
        agentHarness.skill = options.skill ?? null
      }

      run(instruction: unknown) {
        const skill = agentHarness.skill!
        agentHarness.runs.push({
          instruction,
          prompt: skill.systemPrompt,
          tools: skill.tools.map((t) => t.name),
        })
      }

      cancel() {}

      reset() {
        agentHarness.reset()
      }

      restore(...args: unknown[]) {
        agentHarness.restore(...args)
      }

      appendHistory() {
        return 0
      }
    },
  }
})

vi.mock('../src/renderer/ai/transport', () => ({
  createElectronTransport: () => ({}),
}))

// react-konva's node entry requires the native 'canvas' package; these tests do not draw.
vi.mock('react-konva', () => {
  const stub = () => null
  return {
    Stage: stub,
    Layer: stub,
    Rect: stub,
    Group: stub,
    Transformer: stub,
    Line: stub,
    Arrow: stub,
    Text: stub,
    Ellipse: stub,
    Image: stub,
    Path: stub,
    Circle: stub,
    Arc: stub,
  }
})

import { AiPanel } from '../src/renderer/ai/AiPanel'
import { AI_PROVIDERS, type AiSettings } from '../src/shared/ipc'
import {
  installDocumentChatStore,
  installProjectFolderBridge,
  projectMessage,
  removeProjectFolderBridge,
} from './helpers/project-folder-fake'

const settings: AiSettings = {
  provider: 'anthropic',
  providers: Object.fromEntries(
    // a key provider that can run: the panel starts nothing while no provider is connected
    AI_PROVIDERS.map((provider) => [
      provider.id,
      { apiKey: provider.id === 'anthropic' ? 'test-key' : '', model: provider.defaultModel },
    ]),
  ) as AiSettings['providers'],
}

const mounted: Array<{ root: Root; container: HTMLElement }> = []

function panelProps(overrides: Record<string, unknown> = {}) {
  return {
    slides: [],
    current: 0,
    selectedIds: [],
    images: new Map<string, HTMLImageElement>(),
    applySlide: () => {},
    applyDeck: () => {},
    fitWidthPx: 960,
    settings,
    open: true,
    onExpand: () => {},
    onCollapse: () => {},
    ...overrides,
  }
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function mountPanel(overrides: Record<string, unknown> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(createElement(AiPanel, panelProps(overrides))))
  mounted.push({ root, container })
  await settle()
  return { root, container }
}

async function send(container: HTMLElement, text: string) {
  const input = container.querySelector<HTMLTextAreaElement>('textarea[data-slides-ai-input]')!
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setValue.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
  })
  await settle()
}

async function finishRun(text: string) {
  await act(async () => {
    agentHarness.events!.onDone?.({ text, cancelled: false, turnLimit: false })
  })
  await settle()
}

/** the header's "New chat" button sits right before the collapse button */
const newChatButton = (container: HTMLElement) =>
  container.querySelector('.ai-panel-header-actions .ai-panel-collapse')!
    .previousElementSibling as HTMLButtonElement

beforeAll(() => {
  Element.prototype.scrollTo ??= () => {}
})

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  agentHarness.events = null
  agentHarness.skill = null
  agentHarness.runs = []
  agentHarness.reset.mockReset()
  agentHarness.restore.mockReset()
  Object.defineProperty(window, 'slidesApi', {
    configurable: true,
    value: {
      beginHistoryBatch: vi.fn(async () => false),
      endHistoryBatch: vi.fn(async () => null),
      aiLogRunFailure: vi.fn(async () => undefined),
      setAiPanelPrefs: vi.fn(async () => ({})),
    },
  })
  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: { readAttachmentImage: vi.fn(async () => ({ ok: false })) },
  })
})

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
  removeProjectFolderBridge()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('slides AI panel: project folder', () => {
  it('puts the picker under the input box and records no project as before', async () => {
    const store = installDocumentChatStore()
    const fake = installProjectFolderBridge()
    const { container } = await mountPanel({ currentFilePath: 'C:/work/deck.pptx' })

    expect(
      container.querySelector('.ai-composer > .ai-input-below .ai-project-chip'),
    ).not.toBeNull()
    expect(container.querySelector('.ai-panel-header .ai-project-chat-button')).toBeNull()

    await send(container, 'tighten the titles')
    expect(agentHarness.runs).toHaveLength(1)
    // the project skill is composed in, and adds nothing without a project
    expect(agentHarness.runs[0]!.prompt).not.toContain('## Project folder')
    expect(agentHarness.runs[0]!.tools).not.toContain('project_list_files')
    await finishRun('done')
    expect(store.appendChat.mock.calls.map(([m]) => m.role)).toEqual(['user', 'assistant'])
    expect(fake.bridge.appendChat).not.toHaveBeenCalled()
    expect(fake.bridge.readContext).not.toHaveBeenCalled()

    act(() => newChatButton(container).click())
    await settle()
    expect(fake.bridge.newChat).not.toHaveBeenCalled()
    expect(container.querySelector('.ai-msg-user')).toBeNull()
  })

  it('with a project: the context is ready when the run starts and the chat goes to the folder', async () => {
    const store = installDocumentChatStore()
    const fake = installProjectFolderBridge({
      selection: { projectId: 'p1', initialChatId: null },
      context: { notices: [{ kind: 'instructions-changed', files: ['instructions'] }] },
    })
    const { container } = await mountPanel({ currentFilePath: 'C:/work/report/deck.pptx' })
    expect(container.querySelector('.ai-panel-header .ai-project-chat-button')).not.toBeNull()

    const release = fake.holdReadContext()
    await send(container, 'tighten the titles')
    expect(fake.bridge.readContext).toHaveBeenCalledWith({ projectId: 'p1' })
    expect(agentHarness.runs).toHaveLength(0)
    release()
    await settle()
    expect(agentHarness.runs).toHaveLength(1)
    expect(agentHarness.runs[0]!.prompt).toContain('## Project folder')
    expect(agentHarness.runs[0]!.prompt).toContain('Write in short bullet points.')
    expect(agentHarness.runs[0]!.tools).toEqual(
      expect.arrayContaining(['project_list_files', 'project_search', 'project_read']),
    )
    expect(
      container.querySelector('.ai-project-notice[data-notice="instructions-changed"]'),
    ).not.toBeNull()

    await finishRun('titles tightened')
    expect(fake.appended.map((m) => [m.chatId, m.role, m.text])).toEqual([
      ['new1', 'user', 'tighten the titles'],
      ['new1', 'assistant', 'titles tightened'],
    ])
    expect(store.appendChat).not.toHaveBeenCalled()
    expect(fake.order).toContain('closeScope')

    act(() => newChatButton(container).click())
    await settle()
    expect(fake.bridge.newChat).toHaveBeenCalledTimes(2)
    expect(container.querySelector('.ai-msg-user')).toBeNull()
  })

  it('opens the chat main chose into the transcript and the loop', async () => {
    installDocumentChatStore()
    installProjectFolderBridge({
      selection: { projectId: 'p1', initialChatId: 'c3' },
      chats: {
        c3: [
          projectMessage({ seq: 1, role: 'user', text: 'make a deck', editor: 'docs' }),
          projectMessage({
            seq: 2,
            role: 'assistant',
            text: 'made',
            editor: 'docs',
            fileRef: 'brief.docx',
            tools: [{ name: 'docs_edit', summary: 'edited' }],
          }),
        ],
      },
    })
    const { container } = await mountPanel({ currentFilePath: 'C:/work/report/deck.pptx' })
    expect(container.querySelector('.ai-msg-historic')?.textContent).toContain('make a deck')
    expect(container.querySelector('.ai-project-tool-summary')?.textContent).toContain('brief.docx')
    expect(agentHarness.restore).toHaveBeenCalledWith([
      { role: 'user', text: 'make a deck' },
      { role: 'assistant', text: 'made' },
    ])
  })
})
