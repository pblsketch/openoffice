import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const agentHarness = vi.hoisted(() => ({
  events: null as null | {
    onToolExecuted?: (event: {
      call: { id: string; name: string; input: unknown }
      execution: { summary: string; output?: string; isError?: boolean; mutated?: boolean }
    }) => void
    onDone?: (result: { text: string; cancelled: boolean; turnLimit: boolean }) => void
    onError?: (error: string) => void
  },
  run: vi.fn(),
  cancel: vi.fn(),
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

      constructor(options: { events?: typeof agentHarness.events }) {
        agentHarness.events = options.events ?? null
      }

      run(...args: unknown[]) {
        agentHarness.run(...args)
      }

      cancel() {
        agentHarness.cancel()
      }

      reset() {
        agentHarness.reset()
      }

      restore(...args: unknown[]) {
        agentHarness.restore(...args)
      }
    },
  }
})

// The loop is mocked, so nothing streams: the transport only hands over its hooks, which is
// how a test reports the structured cause of a failed turn the way the real transport does.
const transportHarness = vi.hoisted(() => ({
  hooks: null as null | {
    onStreamError?: (error: {
      kind?: string
      provider?: string
      resetsAt?: number
      message: string
    }) => void
  },
}))

vi.mock('../src/renderer/ai/transport', () => ({
  createElectronTransport: (_getSettings: unknown, hooks: typeof transportHarness.hooks) => {
    transportHarness.hooks = hooks
    return {}
  },
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

import { AI_SUBSCRIPTION_STRINGS } from '@genoffice/ui'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import { AI_PROVIDERS, type AiSettings, type AttachmentMeta } from '../src/shared/ipc'

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

const mountedRoots: Array<{ root: Root; container: HTMLElement }> = []

function mount(element: React.ReactElement): { root: Root; container: HTMLElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(element))
  mountedRoots.push({ root, container })
  return { root, container }
}

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

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function installSlidesApi(): void {
  Object.defineProperty(window, 'slidesApi', {
    configurable: true,
    value: {
      beginHistoryBatch: vi.fn(async () => false),
      endHistoryBatch: vi.fn(async () => null),
      aiLogRunFailure: vi.fn(async () => undefined),
    },
  })
}

beforeAll(() => {
  Element.prototype.scrollTo ??= () => {}
})

beforeEach(() => {
  agentHarness.events = null
  agentHarness.run.mockReset()
  agentHarness.cancel.mockReset()
  agentHarness.reset.mockReset()
  agentHarness.restore.mockReset()
  installSlidesApi()
  Object.defineProperty(window, 'projectApi', { configurable: true, value: undefined })
  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: { readAttachmentImage: vi.fn(async () => ({ ok: false })) },
  })
})

afterEach(() => {
  for (const { root, container } of mountedRoots.splice(0)) {
    act(() => root.unmount())
    container.remove()
  }
  vi.restoreAllMocks()
})

describe('AiPanel agent run lifecycle (slides)', () => {
  it('persists a successful tool-only run so reopening can restore the completed turn', async () => {
    const appendChat = vi.fn(async () => undefined)
    Object.defineProperty(window, 'projectApi', {
      configurable: true,
      value: {
        resolveChat: vi.fn(async () => ({ projectId: 'default', chatId: 'deck-chat' })),
        loadChat: vi.fn(async () => []),
        appendChat,
        rebindChat: vi.fn(async () => ({ projectId: 'default', chatId: 'deck-chat' })),
      },
    })

    mount(createElement(AiPanel, panelProps({ currentFilePath: '/tmp/deck.pptx' })))
    await flushEffects()
    appendChat.mockClear()

    expect(agentHarness.events).not.toBeNull()
    act(() => {
      agentHarness.events!.onToolExecuted?.({
        call: { id: 'tool-1', name: 'apply_ops', input: { op: 'set_fill' } },
        execution: { summary: 'Changed the title fill', output: 'ok', mutated: true },
      })
      agentHarness.events!.onDone?.({ text: '', cancelled: false, turnLimit: false })
    })
    await flushEffects()

    expect(appendChat).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'default',
        chatId: 'deck-chat',
        role: 'assistant',
        text: '',
        tools: [
          expect.objectContaining({
            name: 'apply_ops',
            summary: 'Changed the title fill',
            output: 'ok',
          }),
        ],
      }),
    )
  })

  it('keeps readable images and continues the run when another attachment read rejects', async () => {
    const readAttachmentImage = vi.fn(async (path: string) => {
      if (path.endsWith('good.png')) return { ok: true, base64: 'AAAA', mime: 'image/png' }
      throw new Error('attachment bridge unavailable')
    })
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: { readAttachmentImage },
    })
    const attachments: AttachmentMeta[] = [
      { path: '/tmp/good.png', name: 'good.png', ext: 'png', sizeBytes: 128 },
      { path: '/tmp/bad.png', name: 'bad.png', ext: 'png', sizeBytes: 128 },
    ]

    mount(
      createElement(
        AiPanel,
        panelProps({
          preset: {
            text: 'Polish this slide',
            nonce: 1,
            autoRun: true,
            attachments,
          },
        }),
      ),
    )
    await flushEffects()

    expect(readAttachmentImage).toHaveBeenCalledWith('/tmp/good.png')
    expect(readAttachmentImage).toHaveBeenCalledWith('/tmp/bad.png')
    expect(agentHarness.run).toHaveBeenCalledWith('Polish this slide', [
      { base64: 'AAAA', mime: 'image/png' },
    ])
  })
})

describe('AiPanel subscription gate (slides)', () => {
  type State = 'checking' | 'not-installed' | 'signed-out' | 'ready' | 'metered' | 'error'
  const statusMap = (claude: State, codex: State) => ({
    'claude-code': { provider: 'claude-code', state: claude, meteredAccepted: false },
    codex: { provider: 'codex', state: codex, meteredAccepted: false },
  })
  const autoSettings: AiSettings = { ...settings, provider: 'auto' }
  const preset = { text: 'Polish this slide', nonce: 1, autoRun: true }

  /**
   * the bridge with a subscription API answering `statuses`, a settings writer to watch, and
   * `emit` to report a status change the way the main process does
   */
  function installSubscription(statuses: ReturnType<typeof statusMap>) {
    const setAiSettings = vi.fn<(next: AiSettings) => Promise<undefined>>(async () => undefined)
    const api = window.slidesApi as unknown as Record<string, unknown>
    api.setAiSettings = setAiSettings
    let current = statuses
    let changed: ((next: ReturnType<typeof statusMap>) => void) | null = null
    api.aiSubscription = {
      statuses: vi.fn(async () => current),
      recheck: vi.fn(async () => current),
      login: vi.fn(async () => ({ ok: true })),
      install: vi.fn(async () => ({ ok: true })),
      setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses: current })),
      onChanged: vi.fn((handler: (next: ReturnType<typeof statusMap>) => void) => {
        changed = handler
        return () => {}
      }),
    }
    const emit = async (next: ReturnType<typeof statusMap>) => {
      current = next
      await act(async () => changed?.(next))
    }
    return { setAiSettings, emit }
  }

  const composer = (container: HTMLElement) =>
    container.querySelector<HTMLTextAreaElement>('textarea[data-slides-ai-input]')!

  /** type into the composer the way React sees a user typing */
  function type(container: HTMLElement, text: string) {
    const input = composer(container)
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => {
      setValue.call(input, text)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  const pressEnter = (container: HTMLElement) =>
    act(() => {
      composer(container).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
    })

  /** the turn in flight fails the way the transport reports it: the cause, then the text */
  async function failRun(cause: { kind: string; provider?: string; message: string }) {
    await act(async () => {
      transportHarness.hooks!.onStreamError!(cause)
      agentHarness.events!.onError!(cause.message)
    })
    await flushEffects()
  }

  const seenSettings: AiSettings = { ...autoSettings, subscriptionNoticeSeen: true }

  it('nothing connected → the connect prompt replaces the run, and no error line is shown', async () => {
    installSubscription(statusMap('signed-out', 'not-installed'))
    const { container } = mount(
      createElement(AiPanel, panelProps({ settings: autoSettings, preset })),
    )
    await flushEffects()

    expect(agentHarness.run).not.toHaveBeenCalled()
    expect(container.querySelector('.ai-sub-prompt')).not.toBeNull()
    // which AI the user has comes first; each answer leads to its own card
    expect(container.querySelectorAll('.ai-sub-guide-path')).toHaveLength(3)
    expect(container.querySelector('.ai-msg-error')).toBeNull()
    expect(container.querySelector('.ai-sub-first')).toBeNull()
  })

  it('a request made while the status check is running starts once a provider is ready', async () => {
    // the notice was read earlier, so nothing but the status check stands in front of the run
    installSubscription(statusMap('ready', 'signed-out'))
    const seen: AiSettings = { ...autoSettings, subscriptionNoticeSeen: true }
    const { container } = mount(createElement(AiPanel, panelProps({ settings: seen, preset })))
    await flushEffects()

    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(agentHarness.run).toHaveBeenCalledWith('Polish this slide', [])
    expect(container.querySelector('.ai-sub-prompt')).toBeNull()
  })

  it('first use of a subscription → the notice comes first; acknowledging saves it and starts the request', async () => {
    const { setAiSettings } = installSubscription(statusMap('ready', 'signed-out'))
    const { container } = mount(
      createElement(AiPanel, panelProps({ settings: autoSettings, preset })),
    )
    await flushEffects()

    expect(agentHarness.run).not.toHaveBeenCalled()
    const notice = container.querySelector('.ai-sub-first')
    expect(notice).not.toBeNull()
    expect(container.querySelector('.ai-sub-prompt')).toBeNull()

    await act(async () => {
      notice!.querySelector('button')!.click()
    })
    await flushEffects()

    expect(setAiSettings).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'auto', subscriptionNoticeSeen: true }),
    )
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(agentHarness.run).toHaveBeenCalledWith('Polish this slide', [])
    expect(container.querySelector('.ai-sub-first')).toBeNull()
  })

  it('rule 1: a send during the status check is held, and falls to the connect prompt when the answer is "not connected"', async () => {
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this)
    }
    try {
      const { emit } = installSubscription(statusMap('checking', 'checking'))
      const { container } = mount(createElement(AiPanel, panelProps({ settings: seenSettings })))
      await flushEffects()
      // no request yet: the check runs without a prompt flashing up
      expect(container.querySelector('.ai-sub-prompt')).toBeNull()

      type(container, 'Make it shorter')
      pressEnter(container)
      await flushEffects()
      // held: not sent, not dropped, and the composer still shows the text
      expect(agentHarness.run).not.toHaveBeenCalled()
      expect(composer(container).value).toBe('Make it shorter')
      expect(container.querySelector('.ai-msg-error')).toBeNull()

      await emit(statusMap('signed-out', 'not-installed'))
      await flushEffects()
      expect(agentHarness.run).not.toHaveBeenCalled()
      const prompt = container.querySelector('.ai-sub-prompt')
      expect(prompt).not.toBeNull()
      expect(scrolled).toContain(prompt)
      expect(composer(container).value).toBe('Make it shorter')

      // rule 2: signing in later does not send what was refused
      await emit(statusMap('ready', 'not-installed'))
      await flushEffects()
      expect(agentHarness.run).not.toHaveBeenCalled()
      expect(composer(container).value).toBe('Make it shorter')
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  it('rule 1: a send held during the status check starts by itself once a provider can run', async () => {
    const { emit } = installSubscription(statusMap('checking', 'checking'))
    const { container } = mount(createElement(AiPanel, panelProps({ settings: seenSettings })))
    await flushEffects()
    type(container, 'Make it shorter')
    pressEnter(container)
    await flushEffects()
    expect(agentHarness.run).not.toHaveBeenCalled()

    await emit(statusMap('signed-out', 'ready'))
    await flushEffects()
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(agentHarness.run).toHaveBeenCalledWith('Make it shorter', [])
    expect(composer(container).value).toBe('')
  })

  it('rule 2: not connected → nothing is sent, the composer keeps its text, the prompt is scrolled to', async () => {
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this)
    }
    try {
      installSubscription(statusMap('signed-out', 'not-installed'))
      const { container } = mount(createElement(AiPanel, panelProps({ settings: seenSettings })))
      await flushEffects()
      expect(scrolled).toEqual([])

      type(container, 'Make it shorter')
      pressEnter(container)
      await flushEffects()
      expect(agentHarness.run).not.toHaveBeenCalled()
      expect(composer(container).value).toBe('Make it shorter')
      expect(scrolled).toContain(container.querySelector('.ai-sub-prompt'))
      expect(container.querySelector('.ai-msg-error')).toBeNull()
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  it('rule 3: the notice going away without an acknowledgement sends nothing and keeps the text', async () => {
    const { setAiSettings } = installSubscription(statusMap('ready', 'signed-out'))
    const { root, container } = mount(
      createElement(AiPanel, panelProps({ settings: autoSettings })),
    )
    await flushEffects()
    type(container, 'Make it shorter')
    pressEnter(container)
    await flushEffects()
    expect(agentHarness.run).not.toHaveBeenCalled()
    expect(container.querySelector('.ai-sub-first')).not.toBeNull()
    expect(composer(container).value).toBe('Make it shorter')

    // the user picks the filled-in key provider instead of answering the notice
    act(() => root.render(createElement(AiPanel, panelProps({ settings }))))
    await flushEffects()
    expect(container.querySelector('.ai-sub-first')).toBeNull()
    expect(agentHarness.run).not.toHaveBeenCalled()
    expect(setAiSettings).not.toHaveBeenCalled()
    expect(composer(container).value).toBe('Make it shorter')
  })

  it('rule 4: a blocked run shows the blocked notice, pauses the queue, and continues on the other provider', async () => {
    const { setAiSettings } = installSubscription(statusMap('ready', 'ready'))
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {
        readAttachmentImage: vi.fn(async () => ({ ok: true, base64: 'AAAA', mime: 'image/png' })),
      },
    })
    const attachments: AttachmentMeta[] = [
      { path: '/tmp/brief.png', name: 'brief.png', ext: 'png', sizeBytes: 128 },
    ]
    const { container } = mount(
      createElement(
        AiPanel,
        panelProps({
          settings: seenSettings,
          preset: { text: 'Polish this slide', nonce: 1, autoRun: true, attachments },
        }),
      ),
    )
    await flushEffects()
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(agentHarness.run.mock.calls[0]).toEqual([
      'Polish this slide',
      [{ base64: 'AAAA', mime: 'image/png' }],
    ])

    // a second message typed while the reply runs waits in the queue
    type(container, 'Then translate it')
    pressEnter(container)
    await flushEffects()
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.ai-queue-strip')).not.toBeNull()
    expect(container.querySelector('.ai-queue-strip')!.getAttribute('data-paused')).toBeNull()

    await failRun({ kind: 'rate-limit', provider: 'claude-code', message: 'limit used up' })
    const blocked = container.querySelector('.ai-sub-blocked')
    expect(blocked).not.toBeNull()
    expect(blocked!.getAttribute('data-kind')).toBe('rate-limit')
    expect(container.querySelector('.ai-msg-error')).toBeNull()
    // the queued message did not run into the same wall
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.ai-queue-strip')!.getAttribute('data-paused')).toBe('true')

    const continueButton = blocked!.querySelector<HTMLButtonElement>(
      '[data-action="continue-with"]',
    )!
    expect(continueButton.getAttribute('data-provider')).toBe('codex')
    await act(async () => continueButton.click())
    await flushEffects()
    // the selection is stored (the model picker reads it from there) before the rerun
    expect(setAiSettings).toHaveBeenCalledTimes(1)
    expect(setAiSettings.mock.calls[0]![0].provider).toBe('codex')
    // the last user message runs again with its attachment, not the queued one
    expect(agentHarness.run).toHaveBeenCalledTimes(2)
    expect(agentHarness.run.mock.calls[1]).toEqual([
      'Polish this slide',
      [{ base64: 'AAAA', mime: 'image/png' }],
    ])
    expect(container.querySelector('.ai-queue-strip')!.getAttribute('data-paused')).toBe('true')
  })

  it('rule 4: "continue with" is offered on the most recent blocked reply only', async () => {
    installSubscription(statusMap('ready', 'ready'))
    const { root, container } = mount(
      createElement(
        AiPanel,
        panelProps({
          settings: seenSettings,
          preset: { text: 'Polish this slide', nonce: 1, autoRun: true },
        }),
      ),
    )
    await flushEffects()
    await failRun({ kind: 'rate-limit', provider: 'claude-code', message: 'limit used up' })
    expect(container.querySelectorAll('[data-action="continue-with"]')).toHaveLength(1)

    // a second request fails the same way: only its reply still offers to continue
    act(() =>
      root.render(
        createElement(
          AiPanel,
          panelProps({
            settings: seenSettings,
            preset: { text: 'Try once more', nonce: 2, autoRun: true },
          }),
        ),
      ),
    )
    await flushEffects()
    expect(agentHarness.run).toHaveBeenCalledTimes(2)
    await failRun({ kind: 'rate-limit', provider: 'claude-code', message: 'limit used up' })
    expect(container.querySelectorAll('.ai-sub-blocked')).toHaveLength(2)
    const offers = container.querySelectorAll('[data-action="continue-with"]')
    expect(offers).toHaveLength(1)
    const lastBlocked = [...container.querySelectorAll('.ai-sub-blocked')].at(-1)!
    expect(lastBlocked.contains(offers[0]!)).toBe(true)
  })

  it('rule 5: the acknowledgement is written onto the settings stored now, not onto the panel copy', async () => {
    const { setAiSettings } = installSubscription(statusMap('ready', 'signed-out'))
    // the settings page filled in a key provider after this panel got its copy
    const stored: AiSettings = {
      ...autoSettings,
      providers: {
        ...autoSettings.providers,
        openai: { apiKey: 'stored-later', model: 'stored-model' },
      },
    }
    ;(window.slidesApi as unknown as Record<string, unknown>).getAiSettings = vi.fn(
      async () => stored,
    )
    const { container } = mount(
      createElement(AiPanel, panelProps({ settings: autoSettings, preset })),
    )
    await flushEffects()
    await act(async () => {
      container.querySelector('.ai-sub-first')!.querySelector('button')!.click()
    })
    await flushEffects()

    expect(setAiSettings).toHaveBeenCalledTimes(1)
    expect(setAiSettings.mock.calls[0]![0]).toEqual({
      ...stored,
      subscriptionNoticeSeen: true,
      subscriptionNoticeVersion: 2,
    })
    expect(agentHarness.run).toHaveBeenCalledTimes(1)
  })
})

describe('AI entry label (slides)', () => {
  it('the panel title and its resizer label are the shared "AI Assistant" label', async () => {
    const { container } = mount(createElement(AiPanel, panelProps()))
    await flushEffects()
    // the panel renders in the module language of the test run; the label comes from the
    // shared dictionary, not from a slides key
    const title = container.querySelector('.ai-panel-title')!.textContent
    expect(Object.values(AI_SUBSCRIPTION_STRINGS).map((d) => d.aiAssistant)).toContain(title)
    expect(container.querySelector('.ai-panel-resizer')!.getAttribute('aria-label')).toBe(title)
  })
})
