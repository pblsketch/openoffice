/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultAiSettings,
  type AiSettings,
  type AiSubscriptionProviderId,
  type AiSubscriptionState,
  type AiSubscriptionStatus,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider'
import { useAiSendGate, type AiSendGateController } from '../src/use-ai-send-gate'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const status = (
  provider: AiSubscriptionProviderId,
  state: AiSubscriptionState,
  extra: Partial<AiSubscriptionStatus> = {},
): AiSubscriptionStatus => ({ provider, state, meteredAccepted: false, ...extra })

const statuses = (
  claude: AiSubscriptionState,
  codex: AiSubscriptionState,
): AiSubscriptionStatuses => ({
  'claude-code': status('claude-code', claude),
  // the direct ChatGPT connection answers at once and is signed out here
  chatgpt: status('chatgpt', 'signed-out'),
  codex: status('codex', codex),
})

const CHECKING = statuses('checking', 'checking')
const READY = statuses('ready', 'signed-out')
const SIGNED_OUT = statuses('signed-out', 'signed-out')

const fresh = (patch: Partial<AiSettings> = {}): AiSettings => ({
  ...defaultAiSettings(),
  ...patch,
})
const seen = (patch: Partial<AiSettings> = {}) => fresh({ subscriptionNoticeSeen: true, ...patch })

/**
 * A panel reduced to its gate: `send` is the panel's send path (ask the gate,
 * then run), `sent` what actually went out, and the settings live in a store
 * the test can change behind the panel's back.
 */
function panel(initial: {
  settings: AiSettings | null
  statuses: AiSubscriptionStatuses | null
  acknowledgeNoticeExtra?: (settings: AiSettings) => AiSettings
}) {
  const state = { ...initial }
  const store = { stored: initial.settings ?? fresh(), writes: [] as AiSettings[] }
  const sent: string[] = []
  const notConnected = vi.fn()
  let ctl!: AiSendGateController<string>
  const send = (text: string) => {
    if (ctl.admit(text)) sent.push(text)
  }
  function Probe(props: { settings: AiSettings | null; statuses: AiSubscriptionStatuses | null }) {
    ctl = useAiSendGate<string>({
      settings: props.settings,
      statuses: props.statuses,
      store: {
        getSettings: async () => store.stored,
        setSettings: async (next) => {
          store.stored = next
          store.writes.push(next)
        },
      },
      start: send,
      onNotConnected: notConnected,
      acknowledgeNoticeExtra: initial.acknowledgeNoticeExtra,
    })
    return null
  }
  const render = () => act(() => root.render(createElement(Probe, { ...state })))
  render()
  return {
    get ctl() {
      return ctl
    },
    sent,
    store,
    notConnected,
    send: (text: string) => act(() => send(text)),
    set: (patch: Partial<typeof state>) => {
      Object.assign(state, patch)
      render()
    },
    /** let a settings write (read, then write) finish */
    settle: () => act(async () => {}),
  }
}

describe('rule 1: a send while the statuses are still being checked', () => {
  it('is held, not sent and not dropped, and starts as soon as a provider can run', () => {
    const p = panel({ settings: seen(), statuses: CHECKING })
    p.send('hello')
    expect(p.sent).toEqual([])
    expect(p.ctl.gate.kind).toBe('checking')
    // the connect cards show the check in progress while the request waits
    expect(p.ctl.connectChoice?.reason).toBe('no-subscription')
    p.set({ statuses: READY })
    expect(p.sent).toEqual(['hello'])
    expect(p.ctl.connectChoice).toBeNull()
  })

  it('is held while the settings have not been read either', () => {
    const p = panel({ settings: null, statuses: null })
    p.send('hello')
    expect(p.sent).toEqual([])
    p.set({ statuses: READY })
    expect(p.sent).toEqual([])
    p.set({ settings: seen() })
    expect(p.sent).toEqual(['hello'])
  })

  it('starts once only, however often the statuses are reported again', () => {
    const p = panel({ settings: seen(), statuses: CHECKING })
    p.send('hello')
    p.set({ statuses: READY })
    p.set({ statuses: statuses('ready', 'ready') })
    p.set({ statuses: CHECKING })
    p.set({ statuses: READY })
    expect(p.sent).toEqual(['hello'])
  })

  it('falls to "not connected" when that is the answer: nothing is sent, now or later', () => {
    const p = panel({ settings: seen(), statuses: CHECKING })
    p.send('hello')
    p.set({ statuses: SIGNED_OUT })
    expect(p.sent).toEqual([])
    expect(p.ctl.connectChoice?.reason).toBe('no-subscription')
    // the prompt is pointed at once the answer is in
    expect(p.ctl.connectAttention).toBe(1)
    // minutes later the user has signed in: the old request does not start by itself
    p.set({ statuses: READY })
    expect(p.sent).toEqual([])
  })

  it('moves behind the first-connection notice when the answer is a first-time subscription', async () => {
    const p = panel({ settings: fresh(), statuses: CHECKING })
    p.send('hello')
    p.set({ statuses: READY })
    expect(p.sent).toEqual([])
    expect(p.ctl.noticeDue).toBe(true)
    act(() => p.ctl.acknowledgeNotice())
    await p.settle()
    expect(p.sent).toEqual(['hello'])
  })

  it('keeps the connect cards out of sight during a check nobody is waiting on', () => {
    const p = panel({ settings: seen(), statuses: CHECKING })
    expect(p.ctl.connectChoice).toBeNull()
  })
})

describe('rule 2: a send while not connected', () => {
  it('sends nothing, shows the connect prompt and points at it', () => {
    const p = panel({ settings: seen(), statuses: SIGNED_OUT })
    // the prompt is there before any send
    expect(p.ctl.connectChoice?.reason).toBe('no-subscription')
    expect(p.ctl.connectAttention).toBe(0)
    p.send('hello')
    expect(p.sent).toEqual([])
    expect(p.ctl.connectAttention).toBe(1)
    expect(p.notConnected).toHaveBeenCalledOnce()
    p.send('hello')
    expect(p.ctl.connectAttention).toBe(2)
  })

  it('does not send the refused request after a sign-in', () => {
    const p = panel({ settings: seen(), statuses: SIGNED_OUT })
    p.send('hello')
    p.set({ statuses: READY })
    expect(p.sent).toEqual([])
    // asked again, it goes out
    p.send('hello')
    expect(p.sent).toEqual(['hello'])
  })

  it('a selected key provider that is not filled in is refused the same way', () => {
    const p = panel({ settings: seen({ provider: 'openai' }), statuses: READY })
    p.send('hello')
    expect(p.sent).toEqual([])
    expect(p.ctl.connectChoice?.reason).toBe('not-configured')
  })
})

describe('rule 3: the first use of a subscription', () => {
  it('shows the notice and holds the request', () => {
    const p = panel({ settings: fresh(), statuses: READY })
    expect(p.ctl.noticeDue).toBe(true)
    p.send('hello')
    expect(p.sent).toEqual([])
    expect(p.ctl.noticeDue).toBe(true)
    expect(p.store.writes).toEqual([])
  })

  it('acknowledging saves subscriptionNoticeSeen and starts the held request by itself', async () => {
    const p = panel({ settings: fresh(), statuses: READY })
    p.send('hello')
    act(() => p.ctl.acknowledgeNotice())
    // the notice is gone at once, before the write is back
    expect(p.ctl.noticeDue).toBe(false)
    await p.settle()
    expect(p.store.writes).toHaveLength(1)
    expect(p.store.writes[0]!.subscriptionNoticeSeen).toBe(true)
    expect(p.sent).toEqual(['hello'])
  })

  it('acknowledging with nothing held only saves', async () => {
    const p = panel({ settings: fresh(), statuses: READY })
    act(() => p.ctl.acknowledgeNotice())
    await p.settle()
    expect(p.store.writes).toHaveLength(1)
    expect(p.sent).toEqual([])
    p.send('hello')
    expect(p.sent).toEqual(['hello'])
  })

  it('the PDF editor saves its own sentence in the same acknowledgement', async () => {
    const p = panel({
      settings: fresh(),
      statuses: READY,
      acknowledgeNoticeExtra: (latest) => ({ ...latest, pdfSendNoticeSeen: 1 }),
    })
    act(() => p.ctl.acknowledgeNotice())
    await p.settle()
    expect(p.store.writes[0]).toMatchObject({
      subscriptionNoticeSeen: true,
      subscriptionNoticeVersion: 2,
      pdfSendNoticeSeen: 1,
    })
  })

  it('the notice going away without an acknowledgement sends nothing', () => {
    const settings = fresh()
    const p = panel({ settings, statuses: READY })
    p.send('hello')
    // the user picks a filled-in key provider instead of answering the notice
    const keyed = fresh({ provider: 'openai' })
    keyed.providers.openai = { apiKey: 'k', model: 'm' }
    p.set({ settings: keyed })
    expect(p.ctl.gate.kind).toBe('run')
    expect(p.sent).toEqual([])
    expect(p.store.writes).toEqual([])
  })

  it('the notice acknowledged elsewhere does not start what was held here', () => {
    const p = panel({ settings: fresh(), statuses: READY })
    p.send('hello')
    p.set({ settings: seen() })
    expect(p.ctl.noticeDue).toBe(false)
    expect(p.sent).toEqual([])
  })

  it('a reset (new chat) forgets the held request', async () => {
    const p = panel({ settings: fresh(), statuses: READY })
    p.send('hello')
    act(() => p.ctl.reset())
    act(() => p.ctl.acknowledgeNotice())
    await p.settle()
    expect(p.sent).toEqual([])
  })

  it('a key provider is never asked', () => {
    const keyed = fresh({ provider: 'openai' })
    keyed.providers.openai = { apiKey: 'k', model: 'm' }
    const p = panel({ settings: keyed, statuses: READY })
    expect(p.ctl.noticeDue).toBe(false)
    p.send('hello')
    expect(p.sent).toEqual(['hello'])
  })
})

describe('rule 4: continuing a blocked run on another provider', () => {
  it('stores that provider as the selection, then reruns', async () => {
    const p = panel({ settings: seen(), statuses: statuses('ready', 'ready') })
    const order: string[] = []
    const rerun = vi.fn(() => {
      order.push(`rerun on ${p.store.stored.provider}`)
    })
    act(() => p.ctl.continueWith('codex', rerun))
    // the panel shows the new selection at once
    expect(p.ctl.settings?.provider).toBe('codex')
    await p.settle()
    expect(p.store.writes.map((s) => s.provider)).toEqual(['codex'])
    expect(rerun).toHaveBeenCalledOnce()
    // the selection was stored before the rerun asked the main process to run
    expect(order).toEqual(['rerun on codex'])
  })

  it('a queued message waits in front of a check or the notice without pausing the queue', () => {
    const pause = vi.fn()
    const checking = panel({ settings: seen(), statuses: CHECKING })
    expect(checking.ctl.admitQueued(pause)).toBe(false)
    act(() => root.unmount())
    root = createRoot(host)
    const notice = panel({ settings: fresh(), statuses: READY })
    expect(notice.ctl.admitQueued(pause)).toBe(false)
    expect(pause).not.toHaveBeenCalled()
  })

  it('a queued message in front of "not connected" pauses the queue', () => {
    const pause = vi.fn()
    const p = panel({ settings: seen(), statuses: SIGNED_OUT })
    let admitted = true
    act(() => {
      admitted = p.ctl.admitQueued(pause)
    })
    expect(admitted).toBe(false)
    expect(pause).toHaveBeenCalledOnce()
    expect(p.ctl.connectAttention).toBe(1)
  })

  it('a queued message goes out while a provider can run', () => {
    const pause = vi.fn()
    const p = panel({ settings: seen(), statuses: READY })
    expect(p.ctl.admitQueued(pause)).toBe(true)
    expect(pause).not.toHaveBeenCalled()
  })
})

describe('rule 5: settings writes land on the latest stored settings', () => {
  it('acknowledging keeps what another window stored in the meantime', async () => {
    const p = panel({ settings: fresh(), statuses: READY })
    // the settings page stored a key and a model after this panel read its copy
    const elsewhere = fresh()
    elsewhere.providers.openai = { apiKey: 'k', model: 'm' }
    elsewhere.meteredAccepted = { codex: true }
    p.store.stored = elsewhere
    act(() => p.ctl.acknowledgeNotice())
    await p.settle()
    expect(p.store.writes).toEqual([
      { ...elsewhere, subscriptionNoticeSeen: true, subscriptionNoticeVersion: 2 },
    ])
    // and the panel goes on with what was written, not with its old copy
    expect(p.ctl.settings?.providers.openai).toEqual({ apiKey: 'k', model: 'm' })
  })

  it('"continue with" keeps what another window stored in the meantime', async () => {
    const p = panel({ settings: seen(), statuses: statuses('ready', 'ready') })
    const elsewhere = seen()
    elsewhere.providers.codex = { apiKey: '', model: 'gpt-next' }
    elsewhere.providers.openai = { apiKey: 'k', model: 'm' }
    p.store.stored = elsewhere
    act(() => p.ctl.continueWith('codex', () => {}))
    await p.settle()
    expect(p.store.writes).toHaveLength(1)
    const written = p.store.writes[0]!
    expect(written.provider).toBe('codex')
    expect(written.providers.codex.model).toBe('gpt-next')
    expect(written.providers.openai).toEqual({ apiKey: 'k', model: 'm' })
  })

  it('hands the written settings to an app that keeps its own copy', async () => {
    const onSettingsSaved = vi.fn()
    let ctl!: AiSendGateController<string>
    const stored = fresh()
    function Probe() {
      ctl = useAiSendGate<string>({
        settings: stored,
        statuses: READY,
        store: { getSettings: async () => stored, setSettings: async () => {} },
        start: () => {},
        onSettingsSaved,
      })
      return null
    }
    act(() => root.render(createElement(Probe)))
    act(() => ctl.acknowledgeNotice())
    await act(async () => {})
    expect(onSettingsSaved).toHaveBeenCalledExactlyOnceWith({
      ...stored,
      subscriptionNoticeSeen: true,
      subscriptionNoticeVersion: 2,
    })
  })

  it('a change saved here gives way once the app has read the settings again', async () => {
    const p = panel({ settings: fresh(), statuses: READY })
    act(() => p.ctl.acknowledgeNotice())
    await p.settle()
    expect(p.ctl.settings?.subscriptionNoticeSeen).toBe(true)
    // the app re-read the file: its copy is the truth again
    const reread = seen({ provider: 'codex' })
    p.set({ settings: reread })
    expect(p.ctl.settings).toBe(reread)
  })

  it('nothing runs or re-renders after the panel is gone', async () => {
    const p = panel({ settings: fresh(), statuses: READY })
    p.send('hello')
    act(() => p.ctl.acknowledgeNotice())
    act(() => root.unmount())
    root = createRoot(host)
    await p.settle()
    expect(p.sent).toEqual([])
  })
})
