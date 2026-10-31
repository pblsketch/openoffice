/**
 * The AI panel under the subscription contract: what a send does while nothing
 * is connected, the first-connection notice, a run blocked mid-way and its
 * "continue with" button, the usage line and the truncation notice. The main
 * process is replaced by a fake preload bridge, so no provider is ever reached.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IpcStreamChunk } from '@genoffice/agent-core'
import {
  normalizeAiSettings,
  type AiSettings,
  type AiSubscriptionState,
  type SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import { aiRunErrorText, aiSubscriptionText } from '@genoffice/ui'
import { AiPanel } from '../src/renderer/ai/AiPanel'
import { LocaleProvider } from '../src/renderer/i18n/locale'
import { strings } from '../src/renderer/i18n/strings'
import type { PdfAppDeps } from '../src/renderer/ai/tools'

interface StreamStart {
  requestId: string
  settings: AiSettings
  tools: Array<{ name: string }>
}

const statusesOf = (
  claude: AiSubscriptionState,
  codex: AiSubscriptionState,
): SubscriptionStatusMap => ({
  'claude-code': {
    provider: 'claude-code',
    state: claude,
    meteredAccepted: false,
    ...(claude === 'ready' ? { loginMethod: 'subscription' as const } : {}),
  },
  codex: {
    provider: 'codex',
    state: codex,
    meteredAccepted: false,
    ...(codex === 'ready' ? { loginMethod: 'subscription' as const } : {}),
  },
})

/** the fake main process behind window.pdfApi */
function fakeBridge(initial: { settings: AiSettings; statuses: SubscriptionStatusMap }) {
  const state = {
    settings: initial.settings,
    statuses: initial.statuses,
    imageGeneration: false,
    starts: [] as StreamStart[],
    saved: [] as AiSettings[],
  }
  const settingsListeners = new Set<() => void>()
  const statusListeners = new Set<(statuses: SubscriptionStatusMap) => void>()
  let streamListener: ((chunk: IpcStreamChunk) => void) | null = null
  const subscription = {
    statuses: vi.fn(async () => state.statuses),
    recheck: vi.fn(async () => state.statuses),
    login: vi.fn(async () => ({ ok: true })),
    install: vi.fn(async () => ({ ok: true })),
    setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses: state.statuses })),
    onChanged: (handler: (statuses: SubscriptionStatusMap) => void) => {
      statusListeners.add(handler)
      return () => statusListeners.delete(handler)
    },
    openInstallHelp: vi.fn(async () => {}),
  }
  const api = {
    getAiSettings: vi.fn(async () => state.settings),
    setAiSettings: vi.fn(async (next: AiSettings) => {
      state.settings = next
      state.saved.push(next)
      for (const listener of settingsListeners) listener()
    }),
    onAiSettingsChanged: (handler: () => void) => {
      settingsListeners.add(handler)
      return () => settingsListeners.delete(handler)
    },
    openAiModelSettings: vi.fn(async () => {}),
    onLanguageChanged: () => () => {},
    setAiPanelPrefs: vi.fn(async () => ({})),
    openSourcePath: vi.fn(async () => {}),
    subscription,
    imageGenerationAvailable: vi.fn(async () => state.imageGeneration),
    aiStream: vi.fn(async (request: StreamStart) => {
      state.starts.push(request)
    }),
    aiStreamCancel: vi.fn(async () => {}),
    onAiStream: (listener: (chunk: IpcStreamChunk) => void) => {
      streamListener = listener
      return () => {
        streamListener = null
      }
    },
  }
  return {
    api,
    state,
    subscription,
    /** a chunk of the turn that started last */
    push: (chunk: Omit<IpcStreamChunk, 'requestId'>) =>
      streamListener?.({ requestId: state.starts.at(-1)!.requestId, ...chunk }),
    setStatuses: (next: SubscriptionStatusMap) => {
      state.statuses = next
      for (const listener of statusListeners) listener(next)
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
let bridge: ReturnType<typeof fakeBridge>

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  // jsdom lays nothing out: the panel's scroll-to-bottom has nothing to do
  Element.prototype.scrollTo = () => {}
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  root = null
  container = null
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  vi.unstubAllGlobals()
})

/** let pending promises (IPC answers, the agent loop's awaits) settle inside act */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  })

async function renderPanel(initial: {
  settings?: Partial<AiSettings>
  statuses: SubscriptionStatusMap
}) {
  bridge = fakeBridge({
    settings: { ...normalizeAiSettings({}), ...initial.settings },
    statuses: initial.statuses,
  })
  vi.stubGlobal('pdfApi', bridge.api)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(AiPanel, { api: APP_DEPS, onCollapse: () => {} }),
      ),
    )
  })
  await settle()
  return container
}

const click = async (element: Element | null | undefined) => {
  expect(element).toBeTruthy()
  await act(async () => {
    ;(element as HTMLElement).click()
  })
  await settle()
}

/** records what the panel scrolls into view (jsdom implements no scrolling of its own) */
function watchScrollIntoView(): Element[] {
  const scrolled: Element[] = []
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this)
  }
  return scrolled
}

/** type into the composer the way React sees a user typing, then press Enter */
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

/** the "Summarize" quick action of the empty panel: a one-click request */
const quickAction = (panel: HTMLElement) => panel.querySelector('.ai-quick-btn')
const composerText = (panel: HTMLElement) =>
  (panel.querySelector('.ai-composer textarea') as HTMLTextAreaElement).value

describe('AI panel: not connected', () => {
  it('shows the connect prompt instead of sending, and keeps the request in the composer', async () => {
    const scrolled = watchScrollIntoView()
    const panel = await renderPanel({ statuses: statusesOf('signed-out', 'not-installed') })
    // the way to connect is on screen before anything is asked, without drawing attention
    expect(panel.querySelector('.ai-sub-prompt')).not.toBeNull()
    expect(scrolled).toEqual([])

    await click(quickAction(panel))

    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(panel.querySelector('.ai-msg')).toBeNull()
    expect(composerText(panel)).toBe(strings.en.aiQuickSummaryPrompt)
    const prompt = panel.querySelector('.ai-sub-prompt')
    expect(prompt?.getAttribute('data-reason')).toBe('no-subscription')
    // which AI the user has comes first; each answer leads to its own card
    expect(prompt?.querySelectorAll('.ai-sub-guide-path')).toHaveLength(3)
    // the refused send points at it
    expect(scrolled).toContain(prompt)
  })

  it('does not send the refused request once a subscription connects', async () => {
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('signed-out', 'signed-out'),
    })
    await click(quickAction(panel))
    await act(async () => bridge.setStatuses(statusesOf('ready', 'signed-out')))
    await settle()
    // minutes may have passed at the sign-in page: the run must be asked for again
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(composerText(panel)).toBe(strings.en.aiQuickSummaryPrompt)
  })

  it('wires the connect cards to the subscription bridge', async () => {
    const panel = await renderPanel({ statuses: statusesOf('signed-out', 'not-installed') })
    await click(quickAction(panel))

    await click(panel.querySelector('[data-path="claude-code"]'))
    await click(panel.querySelector('[data-provider="claude-code"] [data-action="login"]'))
    expect(bridge.subscription.login).toHaveBeenCalledWith('claude-code')
    await click(panel.querySelector('[data-action="guide-back"]'))
    // the Codex program is a way within the one ChatGPT answer
    await click(panel.querySelector('[data-path="chatgpt"]'))
    await click(panel.querySelector('[data-action="guide-alternate"]'))
    await click(panel.querySelector('[data-provider="codex"] [data-action="install"]'))
    expect(bridge.subscription.install).toHaveBeenCalledWith('codex')
    await click(panel.querySelector('[data-provider="codex"] [data-action="install-help"]'))
    expect(bridge.subscription.openInstallHelp).toHaveBeenCalledWith('codex')
  })

  it('drops the prompt once a subscription connects, and then sends', async () => {
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('signed-out', 'signed-out'),
    })
    await click(quickAction(panel))
    expect(panel.querySelector('.ai-sub-prompt')).not.toBeNull()

    await act(async () => bridge.setStatuses(statusesOf('ready', 'signed-out')))
    await settle()
    expect(panel.querySelector('.ai-sub-prompt')).toBeNull()

    await click(panel.querySelector('.ai-send-btn'))
    expect(bridge.state.starts).toHaveLength(1)
    await act(async () => bridge.push({ type: 'done' }))
  })

  it('never falls back to a filled-in key provider on its own', async () => {
    const base = normalizeAiSettings({})
    const panel = await renderPanel({
      settings: {
        providers: {
          ...base.providers,
          openai: { ...base.providers.openai, apiKey: 'sk-test', model: 'gpt-test' },
        },
      },
      statuses: statusesOf('signed-out', 'signed-out'),
    })
    await click(quickAction(panel))
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(panel.querySelector('.ai-sub-prompt')).not.toBeNull()
  })

  it('points a selected key provider that is not filled in to Settings', async () => {
    const panel = await renderPanel({
      settings: { provider: 'openai' },
      statuses: statusesOf('ready', 'ready'),
    })
    await click(quickAction(panel))
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    await click(panel.querySelector('.ai-sub-prompt [data-action="open-settings"]'))
    expect(bridge.api.openAiModelSettings).toHaveBeenCalled()
  })
})

describe('AI panel: a send while the connection is still being checked', () => {
  it('holds the request and starts it by itself once a provider can run', async () => {
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('checking', 'checking'),
    })
    // nobody is waiting on the check yet: no prompt flashes up
    expect(panel.querySelector('.ai-sub-prompt')).toBeNull()

    await click(quickAction(panel))
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(composerText(panel)).toBe(strings.en.aiQuickSummaryPrompt)
    expect(panel.querySelector('.ai-msg-error')).toBeNull()

    await act(async () => bridge.setStatuses(statusesOf('signed-out', 'ready')))
    await settle()
    expect(bridge.state.starts).toHaveLength(1)
    expect(composerText(panel)).toBe('')
    expect(panel.querySelector('.ai-msg-user')?.textContent).toContain(
      strings.en.aiQuickSummaryPrompt,
    )
    await act(async () => bridge.push({ type: 'done' }))
  })

  it('falls to the connect prompt when the answer is "not connected", and sends nothing later', async () => {
    const scrolled = watchScrollIntoView()
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('checking', 'checking'),
    })
    await click(quickAction(panel))

    await act(async () => bridge.setStatuses(statusesOf('signed-out', 'not-installed')))
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    const prompt = panel.querySelector('.ai-sub-prompt')
    expect(prompt).not.toBeNull()
    expect(scrolled).toContain(prompt)
    expect(composerText(panel)).toBe(strings.en.aiQuickSummaryPrompt)

    await act(async () => bridge.setStatuses(statusesOf('ready', 'not-installed')))
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
  })

  it('moves behind the first-connection notice when the answer is a first-time subscription', async () => {
    const panel = await renderPanel({ statuses: statusesOf('checking', 'checking') })
    await click(quickAction(panel))
    await act(async () => bridge.setStatuses(statusesOf('ready', 'signed-out')))
    await settle()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()

    await click(panel.querySelector('.ai-sub-first button'))
    expect(bridge.state.starts).toHaveLength(1)
    await act(async () => bridge.push({ type: 'done' }))
  })
})

describe('AI panel: first-connection notice', () => {
  it('holds the first subscription request until the notice is acknowledged', async () => {
    const panel = await renderPanel({ statuses: statusesOf('ready', 'signed-out') })
    await click(quickAction(panel))

    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    const notice = panel.querySelector('.ai-sub-first')
    expect(notice).not.toBeNull()
    // Codex keeps a diagnostic log the app cannot read or prevent: the notice says so here too
    expect(notice!.textContent).toContain(aiSubscriptionText('en', 'noticeCodexHistory'))
    // AI page reading and translation send page images and whole documents (spec §11)
    expect(notice!.textContent).toContain(aiSubscriptionText('en', 'noticePdfWholeDocument'))

    await click(notice!.querySelector('button'))

    expect(bridge.state.saved.at(-1)?.subscriptionNoticeSeen).toBe(true)
    expect(panel.querySelector('.ai-sub-first')).toBeNull()
    expect(bridge.state.starts).toHaveLength(1)
    expect(composerText(panel)).toBe('')
    await act(async () => bridge.push({ type: 'done' }))
  })

  it('sends nothing and keeps the text when the notice goes away without an acknowledgement', async () => {
    const base = normalizeAiSettings({})
    const panel = await renderPanel({ statuses: statusesOf('ready', 'signed-out') })
    await click(quickAction(panel))
    expect(panel.querySelector('.ai-sub-first')).not.toBeNull()

    // the user picks a filled-in key provider instead of answering the notice
    await act(async () =>
      bridge.api.setAiSettings({
        ...base,
        pdfSendNoticeSeen: 1,
        provider: 'openai',
        providers: {
          ...base.providers,
          openai: { ...base.providers.openai, apiKey: 'sk-test', model: 'gpt-test' },
        },
      }),
    )
    await settle()
    expect(panel.querySelector('.ai-sub-first')).toBeNull()
    expect(bridge.api.aiStream).not.toHaveBeenCalled()
    expect(composerText(panel)).toBe(strings.en.aiQuickSummaryPrompt)
    expect(bridge.state.saved.every((saved) => saved.subscriptionNoticeSeen !== true)).toBe(true)
  })

  it('writes the acknowledgement onto the settings stored now, not onto the panel copy', async () => {
    const base = normalizeAiSettings({})
    const panel = await renderPanel({ statuses: statusesOf('ready', 'signed-out') })
    await click(quickAction(panel))
    // the settings page stored a key after this panel read its copy (no change event reached it)
    bridge.state.settings = {
      ...base,
      providers: {
        ...base.providers,
        openai: { ...base.providers.openai, apiKey: 'stored-later', model: 'gpt-later' },
      },
    }

    await click(panel.querySelector('.ai-sub-first button'))

    const saved = bridge.state.saved.at(-1)!
    expect(saved.subscriptionNoticeSeen).toBe(true)
    expect(saved.providers.openai.apiKey).toBe('stored-later')
    expect(bridge.state.starts).toHaveLength(1)
    await act(async () => bridge.push({ type: 'done' }))
  })

  it('does not show the notice again once it was acknowledged', async () => {
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('ready', 'signed-out'),
    })
    await click(quickAction(panel))
    expect(panel.querySelector('.ai-sub-first')).toBeNull()
    expect(bridge.state.starts).toHaveLength(1)
    await act(async () => bridge.push({ type: 'done' }))
  })
})

describe('AI panel: blocked run', () => {
  async function blockedOnClaude(codex: AiSubscriptionState) {
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('ready', codex),
    })
    await click(quickAction(panel))
    expect(bridge.state.starts).toHaveLength(1)
    const resetsAt = Date.now() + 2 * 60 * 60 * 1000
    await act(async () =>
      bridge.push({
        type: 'error',
        error: 'limit',
        errorCode: 'rate-limit',
        errorProvider: 'claude-code',
        errorResetsAt: resetsAt,
      }),
    )
    await settle()
    return { panel, resetsAt }
  }

  it('shows why the run stopped, with the reset time, and offers the other subscription', async () => {
    const { panel, resetsAt } = await blockedOnClaude('ready')
    const notice = panel.querySelector('.ai-sub-blocked')
    expect(notice?.getAttribute('data-kind')).toBe('rate-limit')
    expect(notice?.textContent).toContain(
      aiRunErrorText('en', { kind: 'rate-limit', provider: 'claude-code', resetsAt }),
    )
    const button = notice?.querySelector('[data-action="continue-with"]')
    expect(button?.getAttribute('data-provider')).toBe('codex')
    // nothing switched on its own
    expect(bridge.state.saved).toHaveLength(0)
    expect(bridge.state.starts).toHaveLength(1)
  })

  it('continues on the other subscription: stores the selection and reruns the request', async () => {
    const { panel } = await blockedOnClaude('ready')
    await click(panel.querySelector('.ai-sub-blocked [data-action="continue-with"]'))

    expect(bridge.state.saved.at(-1)?.provider).toBe('codex')
    expect(bridge.state.starts).toHaveLength(2)
    expect(bridge.state.starts[1]!.settings.provider).toBe('codex')
    const userMessages = [...panel.querySelectorAll('.ai-msg-user')]
    expect(userMessages).toHaveLength(2)
    expect(userMessages[1]!.textContent).toContain(strings.en.aiQuickSummaryPrompt)
    await act(async () => bridge.push({ type: 'done' }))
  })

  it('offers to continue on the most recent blocked reply only', async () => {
    const { panel } = await blockedOnClaude('ready')
    expect(panel.querySelectorAll('[data-action="continue-with"]')).toHaveLength(1)

    // asked again, the run stops the same way: only this reply still offers to continue
    await typeAndEnter(panel, 'Try once more')
    expect(bridge.state.starts).toHaveLength(2)
    await act(async () =>
      bridge.push({ type: 'error', errorCode: 'rate-limit', errorProvider: 'claude-code' }),
    )
    await settle()
    const blocked = [...panel.querySelectorAll('.ai-sub-blocked')]
    expect(blocked).toHaveLength(2)
    expect(blocked[0]!.querySelector('[data-action="continue-with"]')).toBeNull()
    expect(blocked[1]!.querySelector('[data-action="continue-with"]')).not.toBeNull()
  })

  it('pauses the message queue, so the next message does not run into the same wall', async () => {
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('ready', 'ready'),
    })
    await click(quickAction(panel))
    // typed while the reply runs: it waits in the queue
    await typeAndEnter(panel, 'And then translate it')
    expect(panel.querySelector('.ai-queue-strip')).not.toBeNull()

    await act(async () =>
      bridge.push({ type: 'error', errorCode: 'rate-limit', errorProvider: 'claude-code' }),
    )
    await settle()
    expect(panel.querySelector('.ai-sub-blocked')).not.toBeNull()
    expect(bridge.state.starts).toHaveLength(1)
    expect(panel.querySelector('.ai-queue-strip')?.getAttribute('data-paused')).toBe('true')
  })

  it('offers no continue button when no other subscription can run', async () => {
    const { panel } = await blockedOnClaude('signed-out')
    const notice = panel.querySelector('.ai-sub-blocked')
    expect(notice).not.toBeNull()
    expect(notice!.querySelector('[data-action="continue-with"]')).toBeNull()
  })

  it('looks at the blocked provider again and offers to reconnect when it is gone', async () => {
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('ready', 'not-installed'),
    })
    await click(quickAction(panel))
    // the login expired while the status still said ready
    bridge.state.statuses = statusesOf('signed-out', 'not-installed')
    await act(async () =>
      bridge.push({ type: 'error', errorCode: 'signed-out', errorProvider: 'claude-code' }),
    )
    await settle()

    expect(bridge.subscription.recheck).toHaveBeenCalledWith(['claude-code'])
    expect(panel.querySelector('.ai-sub-blocked')?.getAttribute('data-kind')).toBe('signed-out')
    // the way back in: Claude's path, now on the sign-in step
    await click(panel.querySelector('.ai-sub-prompt [data-path="claude-code"]'))
    expect(
      panel.querySelector('.ai-sub-prompt [data-provider="claude-code"] [data-action="login"]'),
    ).not.toBeNull()
  })

  it('keeps the plain error line for a failure that is not about the connection', async () => {
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('ready', 'ready'),
    })
    await click(quickAction(panel))
    await act(async () => bridge.push({ type: 'error', error: 'raw', errorCode: 'network' }))
    await settle()
    expect(panel.querySelector('.ai-sub-blocked')).toBeNull()
    expect(panel.querySelector('.ai-msg-error')?.textContent).toContain(strings.en.aiNetworkError)
  })
})

describe('AI panel: usage, truncation and image generation', () => {
  it('shows the usage line from the threshold up, for the provider in use only', async () => {
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('ready', 'ready'),
    })
    await click(quickAction(panel))
    const resetsAt = Date.now() + 60 * 60 * 1000
    await act(async () =>
      bridge.push({
        type: 'subscription-usage',
        subscriptionUsage: [
          { provider: 'claude-code', window: 'five_hour', utilization: 0.5, resetsAt },
          { provider: 'codex', window: 'five_hour', utilization: 0.95, resetsAt },
        ],
      }),
    )
    expect(panel.querySelector('.ai-subscription-usage')).toBeNull()

    await act(async () =>
      bridge.push({
        type: 'subscription-usage',
        subscriptionUsage: [
          { provider: 'claude-code', window: 'five_hour', utilization: 0.83, resetsAt },
        ],
      }),
    )
    const items = [...panel.querySelectorAll('.ai-subscription-usage-item')]
    expect(items.map((item) => item.getAttribute('data-provider'))).toEqual(['claude-code'])
    expect(items[0]!.textContent).toContain('83%')
    await act(async () => bridge.push({ type: 'done' }))
  })

  it('tells the user when the input was cut, until dismissed or the next request', async () => {
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('ready', 'ready'),
    })
    await click(quickAction(panel))
    expect(panel.querySelector('.ai-sub-truncated')).toBeNull()
    await act(async () => bridge.push({ type: 'input-truncated' }))
    expect(panel.querySelector('.ai-sub-truncated')).not.toBeNull()
    await act(async () => bridge.push({ type: 'done' }))
    await settle()
    expect(panel.querySelector('.ai-sub-truncated')).not.toBeNull()
    await click(panel.querySelector('.ai-sub-truncated button'))
    expect(panel.querySelector('.ai-sub-truncated')).toBeNull()
  })

  it('offers generate_image to the model only while the host reports it available', async () => {
    const panel = await renderPanel({
      settings: { subscriptionNoticeSeen: true, pdfSendNoticeSeen: 1 },
      statuses: statusesOf('ready', 'ready'),
    })
    await click(quickAction(panel))
    const names = (start: StreamStart) => start.tools.map((tool) => tool.name)
    expect(names(bridge.state.starts[0]!)).not.toContain('generate_image')
    expect(names(bridge.state.starts[0]!)).toContain('image_search')
    await act(async () => bridge.push({ type: 'done' }))
    await settle()

    // a connection change makes the panel ask again
    bridge.state.imageGeneration = true
    await act(async () => bridge.setStatuses(statusesOf('ready', 'ready')))
    await settle()
    await click(typedRequest(panel, 'draw a kite'))
    expect(bridge.state.starts).toHaveLength(2)
    expect(names(bridge.state.starts[1]!)).toContain('generate_image')
    await act(async () => bridge.push({ type: 'done' }))
  })
})

/** after a first exchange the quick actions are gone: type a request and return the send button */
function typedRequest(panel: HTMLElement, text: string): Element {
  const textarea = panel.querySelector('.ai-composer textarea') as HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  act(() => {
    setter.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  return panel.querySelector('.ai-send-btn')!
}
