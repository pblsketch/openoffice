/** @vitest-environment jsdom */
/**
 * The chat panel's side of the send gate: what it draws for "not connected"
 * and for the first-connection notice, which blocked reply offers to continue,
 * and what happens to the message queue. The gate itself (hold, start, drop,
 * settings writes) is the hook every editor shares and is tested in
 * @genoffice/ui; App.tsx hands its answers to the panel as `subscription`.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeAiSettings,
  type AiSettings,
  type AiSubscriptionState,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider/browser'
import { AI_SUBSCRIPTION_STRINGS, aiSendGate, aiConnectPromptChoice } from '@genoffice/ui'
import {
  AiChatPanel,
  type AiChatMessage,
  type AiPanelSubscription,
} from '../src/renderer/ai/AiChatPanel'

const statuses = (
  claude: AiSubscriptionState,
  codex: AiSubscriptionState,
): AiSubscriptionStatuses => ({
  'claude-code': { provider: 'claude-code', state: claude, meteredAccepted: false },
  codex: { provider: 'codex', state: codex, meteredAccepted: false },
})

const settings = (fields: Record<string, unknown> = {}): AiSettings =>
  normalizeAiSettings({ providers: {}, subscriptionNoticeSeen: true, ...fields })

/** the panel's `subscription` prop as App.tsx builds it from the shared send gate */
function subscriptionOf(
  stored: AiSettings,
  known: AiSubscriptionStatuses,
  patch: Partial<AiPanelSubscription> = {},
): AiPanelSubscription {
  const gate = aiSendGate(stored, known)
  return {
    settings: stored,
    statuses: known,
    connectChoice: aiConnectPromptChoice(gate, false),
    connectAttention: 0,
    noticeDue: gate.kind === 'notice',
    admitQueued: (pause) => {
      if (gate.kind === 'connect') pause()
      return gate.kind === 'run'
    },
    busy: false,
    actions: {
      onInstall: vi.fn(),
      onLogin: vi.fn(),
      onRecheck: vi.fn(),
      onAcceptMetered: vi.fn(),
      onOpenInstallHelp: vi.fn(),
    },
    refresh: vi.fn(),
    usage: [],
    inputTruncated: false,
    onDismissTruncated: vi.fn(),
    onAcknowledgeNotice: vi.fn(),
    onContinueWith: vi.fn(),
    ...patch,
  }
}

const user = (text: string): AiChatMessage => ({ role: 'user', text, tools: [], undelivered: true })
const blockedReply = (): AiChatMessage => ({
  role: 'assistant',
  text: 'limit',
  tools: [],
  isError: true,
  blocked: { kind: 'rate-limit', provider: 'claude-code' },
})

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Element.prototype.scrollTo = () => undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  vi.unstubAllGlobals()
})

interface PanelState {
  chat: readonly AiChatMessage[]
  prompt: string
  aiBusy: boolean
  subscription: AiPanelSubscription
}

function panel(initial: PanelState) {
  const state = { ...initial }
  const onSend = vi.fn()
  const onSendQueued = vi.fn(() => true)
  const onPromptChange = vi.fn((next: string) => {
    state.prompt = next
  })
  const render = () =>
    act(() =>
      root.render(
        createElement(AiChatPanel, {
          isOpen: true,
          hasContent: true,
          chat: state.chat,
          attachments: [],
          attachNotice: null,
          onPickAttachments: () => undefined,
          onAddAttachmentPaths: () => undefined,
          onAddPastedImage: () => undefined,
          onRemoveAttachment: () => undefined,
          prompt: state.prompt,
          preview: null,
          aiBusy: state.aiBusy,
          subscription: state.subscription,
          onPromptChange,
          onSend,
          onSendQueued,
          onStop: () => undefined,
          onNewChat: () => undefined,
          onUndo: () => undefined,
          scopeRange: null,
          scopeColumns: null,
          scopeLocked: false,
          onScopeDismiss: () => undefined,
          onCitation: () => undefined,
          onExpand: () => undefined,
          onCollapse: () => undefined,
        }),
      ),
    )
  render()
  return {
    onSend,
    onSendQueued,
    set: (patch: Partial<PanelState>) => {
      Object.assign(state, patch)
      render()
    },
  }
}

const pressEnter = () =>
  act(() => {
    host
      .querySelector('textarea')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
  })

describe('sheets AI panel: not connected', () => {
  it('shows the connect prompt and scrolls to it each time a send was answered by it', () => {
    const scrolled: Element[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this)
    }
    const stored = settings()
    const known = statuses('signed-out', 'not-installed')
    const p = panel({
      chat: [],
      prompt: 'sum column B',
      aiBusy: false,
      subscription: subscriptionOf(stored, known),
    })
    const prompt = host.querySelector('.ai-sub-prompt')
    expect(prompt?.getAttribute('data-reason')).toBe('no-subscription')
    // which AI the user has comes first; each answer leads to its own card
    expect(prompt?.querySelectorAll('.ai-sub-guide-path')).toHaveLength(3)
    expect(scrolled).toEqual([])

    // App.tsx refused the send and counted it
    p.set({ subscription: subscriptionOf(stored, known, { connectAttention: 1 }) })
    expect(scrolled).toEqual([host.querySelector('.ai-sub-prompt')])
    // the draft is still in the composer
    expect(host.querySelector('textarea')!.value).toBe('sum column B')
  })

  it('hands every send to the send gate instead of deciding by itself', () => {
    const p = panel({
      chat: [],
      prompt: 'sum column B',
      aiBusy: false,
      subscription: subscriptionOf(settings(), statuses('signed-out', 'not-installed')),
    })
    pressEnter()
    // App.tsx's handleSend asks the shared gate; the panel never drops a send on its own
    expect(p.onSend).toHaveBeenCalledOnce()
  })
})

describe('sheets AI panel: first-connection notice', () => {
  it('is shown while the gate says so and acknowledges through the gate', () => {
    const subscription = subscriptionOf(
      settings({ subscriptionNoticeSeen: false }),
      statuses('ready', 'signed-out'),
    )
    panel({ chat: [], prompt: '', aiBusy: false, subscription })
    const notice = host.querySelector('.ai-sub-first')
    expect(notice).not.toBeNull()
    expect(host.querySelector('.ai-sub-prompt')).toBeNull()
    act(() => notice!.querySelector('button')!.click())
    expect(subscription.onAcknowledgeNotice).toHaveBeenCalledOnce()
  })
})

describe('sheets AI panel: blocked run', () => {
  const both = statuses('ready', 'ready')

  it('offers to continue on the most recent blocked reply only', () => {
    const subscription = subscriptionOf(settings(), both)
    panel({
      chat: [user('first'), blockedReply(), user('second'), blockedReply()],
      prompt: '',
      aiBusy: false,
      subscription,
    })
    const blocked = [...host.querySelectorAll('.ai-sub-blocked')]
    expect(blocked).toHaveLength(2)
    expect(blocked[0]!.querySelector('[data-action="continue-with"]')).toBeNull()
    const offer = blocked[1]!.querySelector<HTMLButtonElement>('[data-action="continue-with"]')!
    expect(offer.getAttribute('data-provider')).toBe('codex')
    act(() => offer.click())
    // App.tsx stores the selection and reruns the message that reply answered
    expect(subscription.onContinueWith).toHaveBeenCalledExactlyOnceWith('codex', 3)
  })

  it('offers nothing while a run is in flight', () => {
    panel({
      chat: [user('first'), blockedReply()],
      prompt: '',
      aiBusy: true,
      subscription: subscriptionOf(settings(), both),
    })
    expect(host.querySelector('.ai-sub-blocked')).not.toBeNull()
    expect(host.querySelector('[data-action="continue-with"]')).toBeNull()
  })

  it('pauses the message queue, so the next message does not run into the same wall', () => {
    const subscription = subscriptionOf(settings(), both)
    const running: AiChatMessage = { role: 'assistant', text: '', tools: [], streaming: true }
    const p = panel({
      chat: [user('first'), running],
      prompt: 'then sort it',
      aiBusy: true,
      subscription,
    })
    // typed while the reply runs: it waits in the queue
    pressEnter()
    expect(host.querySelector('.ai-queue-strip')).not.toBeNull()

    // the run stops on its connection; the reply and the settle land in one commit
    p.set({ chat: [user('first'), blockedReply()], aiBusy: false })
    expect(p.onSendQueued).not.toHaveBeenCalled()
    expect(host.querySelector('.ai-queue-strip')?.getAttribute('data-paused')).toBe('true')
  })
})

describe('sheets AI panel: message queue in front of the gate', () => {
  const queueOne = (subscription: AiPanelSubscription) => {
    const running: AiChatMessage = { role: 'assistant', text: '', tools: [], streaming: true }
    const done: AiChatMessage = { role: 'assistant', text: 'done', tools: [] }
    const p = panel({
      chat: [user('first'), running],
      prompt: 'then sort it',
      aiBusy: true,
      subscription,
    })
    pressEnter()
    p.set({ chat: [user('first'), done], aiBusy: false })
    return p
  }

  it('starts the queued message while a provider can run', () => {
    const p = queueOne(subscriptionOf(settings(), statuses('ready', 'ready')))
    // no skill chips: the queued message carries an empty skill use
    expect(p.onSendQueued).toHaveBeenCalledExactlyOnceWith('then sort it', [], {
      text: '',
      chips: [],
    })
  })

  it('pauses the queue in front of "not connected": nothing starts by itself after a sign-in', () => {
    const p = queueOne(subscriptionOf(settings(), statuses('signed-out', 'signed-out')))
    expect(p.onSendQueued).not.toHaveBeenCalled()
    expect(host.querySelector('.ai-queue-strip')?.getAttribute('data-paused')).toBe('true')
    p.set({ subscription: subscriptionOf(settings(), statuses('ready', 'signed-out')) })
    expect(p.onSendQueued).not.toHaveBeenCalled()
  })

  it('keeps the queued message waiting, unpaused, in front of the first-connection notice', () => {
    const p = queueOne(
      subscriptionOf(settings({ subscriptionNoticeSeen: false }), statuses('ready', 'signed-out')),
    )
    expect(p.onSendQueued).not.toHaveBeenCalled()
    expect(host.querySelector('.ai-queue-strip')?.getAttribute('data-paused')).toBeNull()
  })
})

describe('sheets AI entry label', () => {
  it('uses the shared "AI Assistant" label for the panel title and its resizer', () => {
    panel({
      chat: [],
      prompt: '',
      aiBusy: false,
      subscription: subscriptionOf(settings(), statuses('ready', 'ready')),
    })
    const title = host.querySelector('.ai-panel-title')!.textContent
    expect(Object.values(AI_SUBSCRIPTION_STRINGS).map((d) => d.aiAssistant)).toContain(title)
    expect(host.querySelector('.ai-panel-resizer')!.getAttribute('aria-label')).toBe(title)
  })
})
