/**
 * The PPT editor takes a request handed over by the shell's "make" window
 * (spec 8.5): the materials go in as the AI panel's attachments, the request
 * text into the composer, and the run starts through the normal send gate. A
 * gate that blocks or holds it leaves the text and the attachments in place.
 * Taking happens once per tab — a remount or a reload starts nothing — and a
 * run admitted with a handed-over material attached is reported as started.
 *
 * Nothing here reaches a real program: the agent loop and the transport are
 * stubbed, and the connection statuses come from a fake subscription API.
 */
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const agentHarness = vi.hoisted(() => ({
  options: null as null | {
    events?: {
      onDone?: (result: { text: string; cancelled: boolean }) => void
      onError?: (error: string) => void
    }
    skill?: {
      executeTool: (call: {
        id: string
        name: string
        input: unknown
      }) => Promise<{ isError?: boolean; output: string }>
    }
  },
  run: vi.fn(),
}))

vi.mock('@genoffice/agent-core', async () => {
  const actual =
    await vi.importActual<typeof import('@genoffice/agent-core')>('@genoffice/agent-core')
  return {
    ...actual,
    AgentLoop: class MockAgentLoop {
      busy = false

      constructor(options: typeof agentHarness.options) {
        agentHarness.options = options
      }

      run(...args: unknown[]) {
        this.busy = true
        agentHarness.run(...args)
      }

      cancel() {}

      reset() {}

      restore() {}
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
import { resetGenerateHandoffForTest } from '../src/renderer/ai/generate-handoff'
import {
  AI_PROVIDERS,
  type AiSettings,
  type AttachmentAddResult,
  type AttachmentMeta,
} from '../src/shared/ipc'

type State = 'checking' | 'not-installed' | 'signed-out' | 'ready' | 'metered' | 'error'
const statusMap = (claude: State, codex: State) => ({
  'claude-code': { provider: 'claude-code', state: claude, meteredAccepted: false },
  codex: { provider: 'codex', state: codex, meteredAccepted: false },
})

const baseSettings: AiSettings = {
  provider: 'auto',
  providers: Object.fromEntries(
    AI_PROVIDERS.map((provider) => [provider.id, { apiKey: '', model: provider.defaultModel }]),
  ) as AiSettings['providers'],
}
/** the first-connection notice was read earlier: only the connection stands in front */
const seenSettings: AiSettings = { ...baseSettings, subscriptionNoticeSeen: true }

const BRIEF: AttachmentMeta = {
  path: 'C:\\work\\brief.docx',
  name: 'brief.docx',
  ext: 'docx',
  sizeBytes: 2048,
}
const PLAN: AttachmentMeta = {
  path: 'C:\\work\\plan.xmind',
  name: 'plan.xmind',
  ext: 'xmind',
  sizeBytes: 4096,
}
const REQUEST = 'Make a kickoff deck from these'
const HANDOFF = {
  id: 'h-1',
  text: REQUEST,
  materials: [
    { path: BRIEF.path, name: BRIEF.name },
    { path: PLAN.path, name: PLAN.name },
  ],
}

const bridge = {
  take: vi.fn<() => Promise<typeof HANDOFF | null>>(),
  report: vi.fn<(paths: string[]) => Promise<boolean>>(),
  addAttachmentPaths: vi.fn<(paths: string[]) => Promise<AttachmentAddResult>>(),
  setAiSettings: vi.fn<(next: AiSettings) => Promise<undefined>>(),
  emit: async (_next: ReturnType<typeof statusMap>) => {},
}

function installBridge(statuses: ReturnType<typeof statusMap>, handoff: typeof HANDOFF | null) {
  let current = statuses
  let changed: ((next: ReturnType<typeof statusMap>) => void) | null = null
  bridge.take = vi.fn(async () => handoff)
  bridge.report = vi.fn(async () => true)
  bridge.addAttachmentPaths = vi.fn(async (paths: string[]) => ({
    accepted: [BRIEF, PLAN].filter((m) => paths.includes(m.path)),
    rejected: [],
  }))
  bridge.setAiSettings = vi.fn(async () => undefined)
  bridge.emit = async (next) => {
    current = next
    await act(async () => changed?.(next))
  }
  Object.defineProperty(window, 'slidesApi', {
    configurable: true,
    value: {
      beginHistoryBatch: vi.fn(async () => false),
      endHistoryBatch: vi.fn(async () => null),
      aiLogRunFailure: vi.fn(async () => undefined),
      setAiSettings: bridge.setAiSettings,
      takeGenerateHandoff: () => bridge.take(),
      reportGenerateRunStarted: (paths: string[]) => bridge.report(paths),
      aiSubscription: {
        statuses: vi.fn(async () => current),
        recheck: vi.fn(async () => current),
        login: vi.fn(async () => ({ ok: true })),
        install: vi.fn(async () => ({ ok: true })),
        setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses: current })),
        onChanged: vi.fn((handler: (next: ReturnType<typeof statusMap>) => void) => {
          changed = handler
          return () => {}
        }),
      },
    },
  })
  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: {
      readAttachmentImage: vi.fn(async () => ({ ok: false })),
      addAttachmentPaths: (paths: string[]) => bridge.addAttachmentPaths(paths),
    },
  })
}

const mounted: Array<{ root: Root; container: HTMLElement }> = []

function panelProps(overrides: Record<string, unknown> = {}) {
  return {
    slides: [],
    current: 0,
    selectedIds: [],
    deckEmpty: true,
    images: new Map<string, HTMLImageElement>(),
    applySlide: () => {},
    applyDeck: () => {},
    fitWidthPx: 960,
    settings: seenSettings,
    open: true,
    onExpand: () => {},
    onCollapse: () => {},
    ...overrides,
  }
}

function mount(overrides: Record<string, unknown> = {}, strict = false) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const panel = createElement(AiPanel, panelProps(overrides))
  act(() => root.render(strict ? createElement(StrictMode, null, panel) : panel))
  const entry = { root, container }
  mounted.push(entry)
  return entry
}

function unmount(entry: { root: Root; container: HTMLElement }) {
  act(() => entry.root.unmount())
  entry.container.remove()
  mounted.splice(mounted.indexOf(entry), 1)
}

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
  }
}

const composer = (container: HTMLElement) =>
  container.querySelector<HTMLTextAreaElement>('textarea[data-slides-ai-input]')!
const composerChips = (container: HTMLElement) =>
  [...container.querySelectorAll('.ai-attachments .ai-attachment-card')].map((el) =>
    el.getAttribute('data-tip'),
  )
/** names on the sent message's read-only attachment echo */
const sentChips = (container: HTMLElement) =>
  [...container.querySelectorAll('.ai-msg-attachments .ai-attachment-card')].map((el) =>
    el.getAttribute('title'),
  )

const pressEnter = (container: HTMLElement) =>
  act(() => {
    composer(container).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
  })

beforeAll(() => {
  Element.prototype.scrollTo ??= () => {}
})

beforeEach(() => {
  resetGenerateHandoffForTest()
  agentHarness.options = null
  agentHarness.run.mockReset()
  Object.defineProperty(window, 'projectApi', { configurable: true, value: undefined })
})

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
  vi.restoreAllMocks()
})

describe('generate hand-off in the PPT editor', () => {
  it('connected: the materials are attached the way user files are, and the request runs with them', async () => {
    installBridge(statusMap('ready', 'signed-out'), HANDOFF)
    const { container } = mount()
    await flush()

    expect(bridge.take).toHaveBeenCalledTimes(1)
    // the same validation path as a dropped or picked file
    expect(bridge.addAttachmentPaths).toHaveBeenCalledWith([BRIEF.path, PLAN.path])
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(agentHarness.run.mock.calls[0]![0]).toBe(REQUEST)
    // the message consumed the attachments: they ride on the bubble, the composer is clear
    expect(sentChips(container)).toEqual([BRIEF.name, PLAN.name])
    expect(composerChips(container)).toEqual([])
    expect(composer(container).value).toBe('')
    // reported once, with the attachments the run went out with
    expect(bridge.report).toHaveBeenCalledTimes(1)
    expect(bridge.report).toHaveBeenCalledWith([BRIEF.path, PLAN.path])
  })

  it('not connected: the connect prompt shows, the text and the attachments stay, nothing runs', async () => {
    installBridge(statusMap('signed-out', 'not-installed'), HANDOFF)
    const { container } = mount()
    await flush()

    expect(agentHarness.run).not.toHaveBeenCalled()
    expect(container.querySelector('.ai-sub-prompt')).not.toBeNull()
    expect(composer(container).value).toBe(REQUEST)
    expect(composerChips(container)).toEqual([BRIEF.path, PLAN.path])
    expect(bridge.report).not.toHaveBeenCalled()

    // signing in does not send what was refused (only the user's own send does)
    await bridge.emit(statusMap('ready', 'not-installed'))
    await flush()
    expect(agentHarness.run).not.toHaveBeenCalled()
    expect(composer(container).value).toBe(REQUEST)
    expect(bridge.report).not.toHaveBeenCalled()

    // the user sends what was left: that run is the start
    pressEnter(container)
    await flush()
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(agentHarness.run.mock.calls[0]![0]).toBe(REQUEST)
    expect(sentChips(container)).toEqual([BRIEF.name, PLAN.name])
    expect(bridge.report).toHaveBeenCalledTimes(1)
    expect(bridge.report).toHaveBeenCalledWith([BRIEF.path, PLAN.path])
  })

  it('first connection notice: the request is held with the text and attachments in place, and starts on "Got it"', async () => {
    // a subscription is ready but the notice was never read
    installBridge(statusMap('ready', 'signed-out'), HANDOFF)
    const { container } = mount({ settings: baseSettings })
    await flush()

    expect(agentHarness.run).not.toHaveBeenCalled()
    const notice = container.querySelector('.ai-sub-first')
    expect(notice).not.toBeNull()
    expect(composer(container).value).toBe(REQUEST)
    expect(composerChips(container)).toEqual([BRIEF.path, PLAN.path])
    expect(bridge.report).not.toHaveBeenCalled()

    await act(async () => notice!.querySelector('button')!.click())
    await flush()
    expect(bridge.setAiSettings).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionNoticeSeen: true }),
    )
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(agentHarness.run.mock.calls[0]![0]).toBe(REQUEST)
    expect(sentChips(container)).toEqual([BRIEF.name, PLAN.name])
    expect(bridge.report).toHaveBeenCalledWith([BRIEF.path, PLAN.path])
  })

  it('a status check still running holds the request; it starts once a provider can run', async () => {
    installBridge(statusMap('checking', 'checking'), HANDOFF)
    const { container } = mount()
    await flush()
    expect(agentHarness.run).not.toHaveBeenCalled()
    expect(composer(container).value).toBe(REQUEST)
    expect(composerChips(container)).toEqual([BRIEF.path, PLAN.path])

    await bridge.emit(statusMap('signed-out', 'ready'))
    await flush()
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(bridge.report).toHaveBeenCalledWith([BRIEF.path, PLAN.path])
  })

  it('a remount of the panel takes nothing and starts nothing', async () => {
    installBridge(statusMap('ready', 'signed-out'), HANDOFF)
    const first = mount()
    await flush()
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    unmount(first)

    const { container } = mount()
    await flush()
    expect(bridge.take).toHaveBeenCalledTimes(1)
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(composer(container).value).toBe('')
    expect(composerChips(container)).toEqual([])
  })

  it('a reload (the main process has nothing left for this tab) starts nothing', async () => {
    installBridge(statusMap('ready', 'signed-out'), null)
    const { container } = mount()
    await flush()
    expect(bridge.take).toHaveBeenCalledTimes(1)
    expect(bridge.addAttachmentPaths).not.toHaveBeenCalled()
    expect(agentHarness.run).not.toHaveBeenCalled()
    expect(composer(container).value).toBe('')
    // a tab that took nothing never reports
    expect(bridge.report).not.toHaveBeenCalled()
  })

  it('StrictMode double effects take once and start one run', async () => {
    installBridge(statusMap('ready', 'signed-out'), HANDOFF)
    mount({}, true)
    await flush()
    expect(bridge.take).toHaveBeenCalledTimes(1)
    expect(bridge.addAttachmentPaths).toHaveBeenCalledTimes(1)
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(bridge.report).toHaveBeenCalledTimes(1)
  })

  it('a run with every handed-over material removed is not reported', async () => {
    installBridge(statusMap('signed-out', 'not-installed'), HANDOFF)
    const { container } = mount()
    await flush()
    expect(composerChips(container)).toEqual([BRIEF.path, PLAN.path])

    // the user removes both materials, connects, and sends the text alone
    for (const button of container.querySelectorAll<HTMLButtonElement>(
      '.ai-attachments .ai-attachment-thumb-remove',
    )) {
      act(() => button.click())
    }
    expect(composerChips(container)).toEqual([])
    await bridge.emit(statusMap('ready', 'not-installed'))
    await flush()
    pressEnter(container)
    await flush()
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(bridge.report).not.toHaveBeenCalled()
  })

  it('a collapsed panel opens to show the handed-over request', async () => {
    installBridge(statusMap('signed-out', 'not-installed'), HANDOFF)
    const onExpand = vi.fn()
    mount({ open: false, onExpand })
    await flush()
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('materials the attachment check refuses are named; with none attached nothing runs', async () => {
    installBridge(statusMap('ready', 'signed-out'), HANDOFF)
    bridge.addAttachmentPaths = vi.fn(async () => ({
      accepted: [],
      rejected: ['brief.docx: unreadable', 'plan.xmind: unreadable'],
    }))
    const { container } = mount()
    await flush()
    expect(agentHarness.run).not.toHaveBeenCalled()
    expect(container.querySelector('.ai-attach-notice')?.textContent).toContain('brief.docx')
    expect(composer(container).value).toBe(REQUEST)
    expect(bridge.report).not.toHaveBeenCalled()
  })

  it('deck generation still refuses until every handed-over text material is read', async () => {
    installBridge(statusMap('ready', 'signed-out'), HANDOFF)
    mount()
    await flush()
    expect(agentHarness.run).toHaveBeenCalledTimes(1)

    const result = await agentHarness.options!.skill!.executeTool({
      id: 'c-gen',
      name: 'generate_deck',
      input: { topic: 'Kickoff', approx_pages: 3, context: 'from the brief' },
    })
    expect(result.isError).toBe(true)
    expect(result.output).toContain('brief.docx')
    expect(result.output).toContain('plan.xmind')
    expect(result.output).toContain('read_attachment')
  })

  it('a ribbon preset blocked by "not connected" keeps its existing behaviour: the composer stays empty', async () => {
    installBridge(statusMap('signed-out', 'not-installed'), null)
    const { container } = mount({
      preset: { text: 'Polish this slide', nonce: 1, autoRun: true },
    })
    await flush()
    expect(agentHarness.run).not.toHaveBeenCalled()
    expect(container.querySelector('.ai-sub-prompt')).not.toBeNull()
    expect(composer(container).value).toBe('')
  })
})

describe('the deck a create flow handed over goes into the project (spec 6)', () => {
  const endRun = async (end: { ok: true } | { ok: false; error?: boolean }) => {
    await act(async () => {
      const events = agentHarness.options?.events
      if (end.ok) events?.onDone?.({ text: 'Done', cancelled: false })
      else if (end.error) events?.onError?.('boom')
      else events?.onDone?.({ text: '', cancelled: true })
    })
    await flush()
  }

  it('asks for the project save once the handed-over run ended well, and only once', async () => {
    installBridge(statusMap('ready', 'signed-out'), HANDOFF)
    const onHandedRunDone = vi.fn()
    mount({ onHandedRunDone })
    await flush()
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(onHandedRunDone).not.toHaveBeenCalled()
    await endRun({ ok: true })
    expect(onHandedRunDone).toHaveBeenCalledTimes(1)
    // a later run is the person's own: no second save into the project
    await endRun({ ok: true })
    expect(onHandedRunDone).toHaveBeenCalledTimes(1)
  })

  it('a failed or stopped run leaves the deck untitled', async () => {
    installBridge(statusMap('ready', 'signed-out'), HANDOFF)
    const onHandedRunDone = vi.fn()
    mount({ onHandedRunDone })
    await flush()
    await endRun({ ok: false, error: true })
    expect(onHandedRunDone).not.toHaveBeenCalled()

    resetGenerateHandoffForTest()
    installBridge(statusMap('ready', 'signed-out'), HANDOFF)
    const stopped = vi.fn()
    mount({ onHandedRunDone: stopped })
    await flush()
    await endRun({ ok: false })
    expect(stopped).not.toHaveBeenCalled()
  })

  it('a run nobody handed over never asks', async () => {
    installBridge(statusMap('ready', 'signed-out'), null)
    const onHandedRunDone = vi.fn()
    mount({ onHandedRunDone, preset: { text: 'Polish this slide', nonce: 1, autoRun: true } })
    await flush()
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    await endRun({ ok: true })
    expect(onHandedRunDone).not.toHaveBeenCalled()
  })
})
