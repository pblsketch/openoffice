import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  defaultAiSettings,
  type AiSettings,
  type AiStreamChunk,
  type AiStreamRequest,
  type AiSubscriptionProviderId,
  type AiSubscriptionState,
} from '@genoffice/ai-provider'
import type { SubscriptionStatusMap } from '@genoffice/ai-provider/browser'
import { aiRunErrorText, aiSubscriptionText } from '@genoffice/ui'
import { AiPanel, type HtmlAiDeps } from '../src/renderer/ai/AiPanel'
import { buildParseMap, type ParseMap } from '../src/renderer/document/parse-map'
import { aiStrings } from '../src/renderer/i18n/strings-ai'

/**
 * The panel end to end, against a scripted main process: what the user sees
 * when nothing is connected, the first time a subscription is used, and when a
 * run is stopped by its connection. The provider itself is never reached — the
 * stream channel is the fake below.
 */

// the panel's own language outside a LocaleProvider is the app default
const LANG = 'zh'
const DOC = '<!doctype html><html><head><title>T</title></head><body><h1>Hello</h1></body></html>'

const statusMap = (
  claude: AiSubscriptionState,
  codex: AiSubscriptionState,
): SubscriptionStatusMap => ({
  'claude-code': { provider: 'claude-code', state: claude, meteredAccepted: false },
  codex: { provider: 'codex', state: codex, meteredAccepted: false },
})

type Reply = (request: AiStreamRequest, nth: number) => Array<Partial<AiStreamChunk>>

function fakeMain(opts: { settings: AiSettings; statuses: SubscriptionStatusMap; reply?: Reply }) {
  let settings = opts.settings
  let statuses = opts.statuses
  const settingsListeners = new Set<() => void>()
  const statusListeners = new Set<(next: SubscriptionStatusMap) => void>()
  let streamListener: ((chunk: AiStreamChunk) => void) | null = null
  const requests: AiStreamRequest[] = []
  const saved: AiSettings[] = []
  const subscription = {
    statuses: vi.fn(async () => statuses),
    recheck: vi.fn(async () => statuses),
    login: vi.fn(async (_provider: AiSubscriptionProviderId) => ({ ok: true })),
    install: vi.fn(async (_provider: AiSubscriptionProviderId) => ({ ok: true })),
    setMeteredAccepted: vi.fn(async () => ({ ok: true, statuses })),
    onChanged: (listener: (next: SubscriptionStatusMap) => void) => {
      statusListeners.add(listener)
      return () => statusListeners.delete(listener)
    },
    openInstallHelp: vi.fn(async () => undefined),
  }
  const htmlApi = {
    getAiSettings: async () => settings,
    setAiSettings: async (next: AiSettings) => {
      settings = next
      saved.push(next)
      for (const listener of settingsListeners) listener()
    },
    onAiSettingsChanged: (handler: () => void) => {
      settingsListeners.add(handler)
      return () => settingsListeners.delete(handler)
    },
    openAiModelSettings: vi.fn(async () => undefined),
    setAiPanelPrefs: vi.fn(async () => ({})),
    subscription,
    onAiStream: (listener: (chunk: AiStreamChunk) => void) => {
      streamListener = listener
      return () => {
        streamListener = null
      }
    },
    aiStream: async (request: AiStreamRequest) => {
      requests.push(request)
      const chunks = opts.reply?.(request, requests.length) ?? [
        { type: 'delta', text: 'ok' },
        { type: 'done' },
      ]
      for (const chunk of chunks) {
        streamListener?.({ requestId: request.requestId, ...chunk } as AiStreamChunk)
      }
    },
    aiStreamCancel: async () => undefined,
  }
  return {
    htmlApi,
    subscription,
    requests,
    saved,
    /** the main process reports a status change */
    setStatuses: (next: SubscriptionStatusMap) => {
      statuses = next
      for (const listener of statusListeners) listener(next)
    },
    /** what is stored changes behind the panel's back (no change event reaches it) */
    storeSilently: (next: AiSettings) => {
      settings = next
    },
  }
}

function fakeDeps(): HtmlAiDeps {
  let map: ParseMap | null = null
  return {
    access: {
      getText: () => DOC,
      getVersion: () => 1,
      getMap: () => (map ??= buildParseMap(DOC, 1, null)),
      getLastManualVersion: () => 0,
      getFilePath: () => null,
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

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  // jsdom has no layout: the chat's stick-to-bottom scroll has nothing to do here
  Element.prototype.scrollTo = () => undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete (window as { htmlApi?: unknown }).htmlApi
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  vi.unstubAllGlobals()
})

/** records what the panel scrolls into view (jsdom implements no scrolling of its own) */
function watchScrollIntoView(): Element[] {
  const scrolled: Element[] = []
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this)
  }
  return scrolled
}

/** let the panel's promise chains (settings read, status read, stream chunks) settle */
async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mountPanel(main: ReturnType<typeof fakeMain>) {
  Object.assign(window, { htmlApi: main.htmlApi })
  act(() =>
    root.render(
      createElement(AiPanel, {
        deps: fakeDeps(),
        filePath: null,
        editQueue: [],
        onQueueEditInstruction: () => undefined,
        onQueueRemove: () => undefined,
        onQueueClear: () => undefined,
        onQueueFocus: () => undefined,
        onQueueConsume: () => undefined,
        onCollapse: () => undefined,
      }),
    ),
  )
  await settle()
}

const composer = () => host.querySelector<HTMLTextAreaElement>('.ai-input-box textarea')!

/** type a message and press Enter: while a reply runs, that queues it */
async function typeAndEnter(text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(composer(), text)
    composer().dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => {
    composer().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
  })
  await settle()
}

async function sendMessage(text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(composer(), text)
    composer().dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => host.querySelector<HTMLButtonElement>('.ai-send-btn')!.click())
  await settle()
}

const ready = (patch: Partial<AiSettings> = {}): AiSettings => ({
  ...defaultAiSettings(),
  subscriptionNoticeSeen: true,
  ...patch,
})

describe('AI panel without a connection', () => {
  it('shows the connect prompt with both cards and sends nothing', async () => {
    const scrolled = watchScrollIntoView()
    const main = fakeMain({ settings: ready(), statuses: statusMap('signed-out', 'not-installed') })
    await mountPanel(main)
    const prompt = host.querySelector('.ai-sub-prompt')
    expect(prompt).not.toBeNull()
    // which AI the user has comes first; each answer leads to its own card
    expect(prompt!.querySelectorAll('.ai-sub-guide-path')).toHaveLength(3)
    expect(scrolled).toEqual([])

    await sendMessage('make it blue')
    expect(main.requests).toHaveLength(0)
    // the request is not lost: it stays in the composer, and no error bubble appears
    expect(composer().value).toBe('make it blue')
    expect(host.querySelector('.ai-msg-error')).toBeNull()
    // the refused send points at the prompt
    expect(scrolled).toContain(host.querySelector('.ai-sub-prompt'))
  })

  it('does not send the refused request once a subscription connects', async () => {
    const main = fakeMain({ settings: ready(), statuses: statusMap('signed-out', 'not-installed') })
    await mountPanel(main)
    await sendMessage('make it blue')

    act(() => main.setStatuses(statusMap('ready', 'not-installed')))
    await settle()
    // minutes may have passed at the sign-in page: the run must be asked for again
    expect(main.requests).toHaveLength(0)
    expect(composer().value).toBe('make it blue')
    expect(host.querySelector('.ai-sub-prompt')).toBeNull()
  })

  it('wires the card actions to the subscription bridge', async () => {
    const main = fakeMain({ settings: ready(), statuses: statusMap('signed-out', 'not-installed') })
    await mountPanel(main)
    const card = (provider: string) =>
      host.querySelector(`.ai-sub-card[data-provider="${provider}"]`)!
    const pick = (selector: string) =>
      act(() => host.querySelector<HTMLButtonElement>(selector)!.click())
    pick('[data-path="claude-code"]')
    act(() =>
      card('claude-code').querySelector<HTMLButtonElement>('[data-action="login"]')!.click(),
    )
    await settle()
    expect(main.subscription.login).toHaveBeenCalledWith('claude-code')
    pick('[data-action="guide-back"]')
    // the Codex program is a way within the one ChatGPT answer
    pick('[data-path="chatgpt"]')
    pick('[data-action="guide-alternate"]')
    act(() => card('codex').querySelector<HTMLButtonElement>('[data-action="install"]')!.click())
    await settle()
    expect(main.subscription.install).toHaveBeenCalledWith('codex')
  })

  it('holds a send made while the statuses are still being checked, and starts it once a provider can run', async () => {
    const main = fakeMain({ settings: ready(), statuses: statusMap('checking', 'checking') })
    await mountPanel(main)
    // nobody is waiting on the check yet: no prompt flashes up
    expect(host.querySelector('.ai-sub-prompt')).toBeNull()

    await sendMessage('make it blue')
    // held: not sent, not dropped; the cards show the check the request waits for
    expect(main.requests).toHaveLength(0)
    expect(composer().value).toBe('make it blue')
    expect(host.querySelector('.ai-sub-prompt')).not.toBeNull()
    expect(host.querySelector('.ai-msg-error')).toBeNull()

    act(() => main.setStatuses(statusMap('signed-out', 'ready')))
    await settle()
    expect(main.requests).toHaveLength(1)
    expect(composer().value).toBe('')
    expect(host.querySelector('.ai-sub-prompt')).toBeNull()
  })

  it('a send held during the status check falls to the connect prompt when the answer is "not connected"', async () => {
    const scrolled = watchScrollIntoView()
    const main = fakeMain({ settings: ready(), statuses: statusMap('checking', 'checking') })
    await mountPanel(main)
    await sendMessage('make it blue')

    act(() => main.setStatuses(statusMap('signed-out', 'not-installed')))
    await settle()
    expect(main.requests).toHaveLength(0)
    const prompt = host.querySelector('.ai-sub-prompt')
    expect(prompt).not.toBeNull()
    expect(scrolled).toContain(prompt)
    expect(composer().value).toBe('make it blue')

    // and nothing starts by itself after the sign-in
    act(() => main.setStatuses(statusMap('ready', 'not-installed')))
    await settle()
    expect(main.requests).toHaveLength(0)
  })

  it('shows the blocked notice when the main process refuses a run after all', async () => {
    // the panel saw a ready subscription; the main process, which decides again, did not
    const main = fakeMain({
      settings: ready(),
      statuses: statusMap('ready', 'not-installed'),
      reply: () => [{ type: 'error', errorCode: 'not-connected' }],
    })
    await mountPanel(main)
    await sendMessage('make it blue')
    expect(main.requests).toHaveLength(1)
    // the answer is the blocked notice with the shared wording, not a raw error line
    const notice = host.querySelector('.ai-sub-blocked')
    expect(notice).not.toBeNull()
    expect(notice!.textContent).toContain(aiRunErrorText(LANG, { kind: 'not-connected' }))
  })
})

describe('AI panel on a first subscription use', () => {
  it('holds the request until the notice is acknowledged, then remembers it', async () => {
    const main = fakeMain({
      settings: ready({ subscriptionNoticeSeen: false }),
      statuses: statusMap('ready', 'not-installed'),
    })
    await mountPanel(main)
    expect(host.querySelector('.ai-sub-first')).not.toBeNull()
    expect(host.querySelector('.ai-sub-prompt')).toBeNull()
    // Codex keeps a diagnostic log the app cannot read or prevent: the notice says so here too
    expect(host.querySelector('.ai-sub-first')!.textContent).toContain(
      aiSubscriptionText(LANG, 'noticeCodexHistory'),
    )

    await sendMessage('make it blue')
    expect(main.requests).toHaveLength(0)
    expect(composer().value).toBe('make it blue')

    act(() => host.querySelector<HTMLButtonElement>('.ai-sub-first button')!.click())
    await settle()
    expect(main.saved.at(-1)?.subscriptionNoticeSeen).toBe(true)
    expect(host.querySelector('.ai-sub-first')).toBeNull()

    // the held request went out by itself: no second press of send
    expect(main.requests).toHaveLength(1)
    expect(composer().value).toBe('')
  })

  it('sends nothing and keeps the text when the notice goes away without an acknowledgement', async () => {
    const main = fakeMain({
      settings: ready({ subscriptionNoticeSeen: false }),
      statuses: statusMap('ready', 'not-installed'),
    })
    await mountPanel(main)
    await sendMessage('make it blue')

    // the user picks a filled-in key provider instead of answering the notice
    const base = defaultAiSettings()
    await act(async () =>
      main.htmlApi.setAiSettings({
        ...base,
        provider: 'openai',
        providers: { ...base.providers, openai: { apiKey: 'sk-test', model: 'gpt-test' } },
      }),
    )
    await settle()
    expect(host.querySelector('.ai-sub-first')).toBeNull()
    expect(main.requests).toHaveLength(0)
    expect(composer().value).toBe('make it blue')
  })

  it('writes the acknowledgement onto the settings stored now, not onto the panel copy', async () => {
    const main = fakeMain({
      settings: ready({ subscriptionNoticeSeen: false }),
      statuses: statusMap('ready', 'not-installed'),
    })
    await mountPanel(main)
    // the settings page stored a key after this panel read its copy
    const base = defaultAiSettings()
    main.storeSilently({
      ...base,
      providers: { ...base.providers, openai: { apiKey: 'stored-later', model: 'gpt-later' } },
    })

    act(() => host.querySelector<HTMLButtonElement>('.ai-sub-first button')!.click())
    await settle()
    expect(main.saved).toHaveLength(1)
    expect(main.saved[0]!.subscriptionNoticeSeen).toBe(true)
    expect(main.saved[0]!.providers.openai).toEqual({ apiKey: 'stored-later', model: 'gpt-later' })
  })
})

describe('AI panel when a run is blocked', () => {
  it('shows the reason and continues on the other subscription only when asked', async () => {
    const resetsAt = Date.now() + 2 * 60 * 60 * 1000
    const main = fakeMain({
      settings: ready(),
      statuses: statusMap('ready', 'ready'),
      reply: (_request, nth) =>
        nth === 1
          ? [
              {
                type: 'error',
                error: 'raw CLI text',
                errorCode: 'rate-limit',
                errorProvider: 'claude-code',
                errorResetsAt: resetsAt,
              },
            ]
          : [{ type: 'delta', text: 'done on the other one' }, { type: 'done' }],
    })
    await mountPanel(main)
    await sendMessage('make it blue')

    // one request, stopped: nothing switched on its own
    expect(main.requests).toHaveLength(1)
    expect(main.saved).toHaveLength(0)
    const notice = host.querySelector('.ai-sub-blocked')!
    expect(notice.getAttribute('data-kind')).toBe('rate-limit')
    expect(notice.textContent).toContain(
      aiRunErrorText(LANG, { kind: 'rate-limit', provider: 'claude-code', resetsAt }),
    )
    expect(notice.textContent).not.toContain('raw CLI text')

    const button = notice.querySelector<HTMLButtonElement>('[data-action="continue-with"]')!
    expect(button.getAttribute('data-provider')).toBe('codex')
    act(() => button.click())
    await settle()

    // the selection is stored (so the model picker shows it) and the same request runs again
    expect(main.saved.at(-1)?.provider).toBe('codex')
    expect(main.requests).toHaveLength(2)
    expect(main.requests[1]!.settings.provider).toBe('codex')
    const sent = (request: AiStreamRequest) =>
      request.messages.filter((m) => m.role === 'user').at(-1)?.text
    expect(sent(main.requests[1]!)).toContain('make it blue')
    // the offer belonged to the run that had just stopped: the older reply keeps its reason only
    expect(host.querySelector('.ai-sub-blocked')).not.toBeNull()
    expect(host.querySelector('[data-action="continue-with"]')).toBeNull()
    expect(host.textContent).toContain('done on the other one')
  })

  it('offers to continue on the most recent blocked reply only', async () => {
    const main = fakeMain({
      settings: ready(),
      statuses: statusMap('ready', 'ready'),
      reply: () => [{ type: 'error', errorCode: 'rate-limit', errorProvider: 'claude-code' }],
    })
    await mountPanel(main)
    await sendMessage('make it blue')
    expect(host.querySelectorAll('[data-action="continue-with"]')).toHaveLength(1)

    await sendMessage('try once more')
    expect(main.requests).toHaveLength(2)
    const blocked = [...host.querySelectorAll('.ai-sub-blocked')]
    expect(blocked).toHaveLength(2)
    expect(blocked[0]!.querySelector('[data-action="continue-with"]')).toBeNull()
    expect(blocked[1]!.querySelector('[data-action="continue-with"]')).not.toBeNull()
  })

  it('pauses the message queue, so the next message does not run into the same wall', async () => {
    let fail: (() => void) | null = null
    const main = fakeMain({ settings: ready(), statuses: statusMap('ready', 'ready') })
    // the first turn stays in flight until the test fails it
    const aiStream = main.htmlApi.aiStream
    let listener: ((chunk: AiStreamChunk) => void) | null = null
    const onAiStream = main.htmlApi.onAiStream
    main.htmlApi.onAiStream = (next) => {
      listener = next
      return onAiStream(next)
    }
    main.htmlApi.aiStream = async (request) => {
      if (main.requests.length > 0) return aiStream(request)
      main.requests.push(request)
      fail = () =>
        listener?.({
          requestId: request.requestId,
          type: 'error',
          errorCode: 'rate-limit',
          errorProvider: 'claude-code',
        } as AiStreamChunk)
    }
    await mountPanel(main)
    await sendMessage('make it blue')
    expect(main.requests).toHaveLength(1)
    // typed while the reply runs: it waits in the queue
    await typeAndEnter('then make it bold')
    expect(host.querySelector('.ai-queue-strip')).not.toBeNull()

    act(() => fail!())
    await settle()
    expect(host.querySelector('.ai-sub-blocked')).not.toBeNull()
    expect(main.requests).toHaveLength(1)
    expect(host.querySelector('.ai-queue-strip')?.getAttribute('data-paused')).toBe('true')
  })

  it('stops the run where the brief writer was blocked, without a retry or another turn', async () => {
    const main = fakeMain({
      settings: ready(),
      statuses: statusMap('ready', 'ready'),
      reply: (_request, nth) =>
        nth === 1
          ? [
              {
                type: 'tool-call',
                toolCall: { id: 'c1', name: 'plan_page', input: { mode: 'redesign' } },
              },
              { type: 'done' },
            ]
          : [
              {
                type: 'error',
                error: 'raw',
                errorCode: 'signed-out',
                errorProvider: 'claude-code',
              },
            ],
    })
    await mountPanel(main)
    await sendMessage('rebuild the whole page')

    // the chat turn, then exactly one brief-writer request: no second attempt, no turn after it
    expect(main.requests).toHaveLength(2)
    expect(main.requests[1]!.tools ?? []).toHaveLength(0)
    const notice = host.querySelector('.ai-sub-blocked')!
    expect(notice.getAttribute('data-kind')).toBe('signed-out')
    expect(notice.textContent).toContain(
      aiRunErrorText(LANG, { kind: 'signed-out', provider: 'claude-code' }),
    )
    expect(
      notice.querySelector('[data-action="continue-with"]')!.getAttribute('data-provider'),
    ).toBe('codex')
    // the composer is usable again
    expect(host.querySelector('.ai-stop-btn')).toBeNull()
  })

  it('keeps an ordinary failure as a plain error line', async () => {
    const main = fakeMain({
      settings: ready(),
      statuses: statusMap('ready', 'ready'),
      reply: () => [{ type: 'error', errorCode: 'network' }],
    })
    await mountPanel(main)
    await sendMessage('make it blue')
    expect(host.querySelector('.ai-sub-blocked')).toBeNull()
    expect(host.querySelector('.ai-msg-error')).not.toBeNull()
  })
})

describe('AI panel during a turn', () => {
  it('shows subscription usage from 80% and the input-truncated notice', async () => {
    const resetsAt = Date.now() + 60 * 60 * 1000
    const main = fakeMain({
      settings: ready(),
      statuses: statusMap('ready', 'ready'),
      reply: () => [
        { type: 'input-truncated' },
        {
          type: 'subscription-usage',
          subscriptionUsage: [
            { provider: 'claude-code', window: 'five_hour', utilization: 0.83, resetsAt },
            { provider: 'claude-code', window: 'seven_day', utilization: 0.4, resetsAt },
          ],
        },
        { type: 'delta', text: 'ok' },
        { type: 'done' },
      ],
    })
    await mountPanel(main)
    expect(host.querySelector('.ai-subscription-usage')).toBeNull()
    await sendMessage('make it blue')

    const usage = host.querySelectorAll('.ai-subscription-usage-item')
    expect(usage).toHaveLength(1)
    expect(usage[0]!.getAttribute('data-window')).toBe('five_hour')
    expect(usage[0]!.textContent).toContain('83')
    expect(host.querySelector('.ai-sub-truncated')).not.toBeNull()
  })

  it('names no vendor in the panel header', async () => {
    const main = fakeMain({ settings: ready(), statuses: statusMap('ready', 'ready') })
    await mountPanel(main)
    // the shared AI entry label, the same in all six editors
    const label = aiSubscriptionText(LANG, 'aiAssistant')
    expect(host.querySelector('.ai-panel-title')!.textContent).toBe(label)
    expect(host.querySelector('.ai-panel-resizer')!.getAttribute('aria-label')).toBe(label)
    expect(label).not.toMatch(/Claude|Codex/)
  })
})

describe('AI panel while a card waits on the person', () => {
  const zh = aiStrings.zh
  const BRIEF = {
    core_hook: 'Q3 grew 40% while costs fell',
    style: {
      name: 'Boardroom navy',
      tone: 'executive',
      palette: {
        primary: '#1e3a5f',
        accent: '#c9a227',
        bg: '#ffffff',
        surface: '#f4f6fa',
        text: '#1f2328',
      },
      typography: { heading: 'Inter', body: 'Inter', scale: 'regular' },
      tokens: { radius: '6px', spacing: '8px', shadow: 'none' },
      layout: 'single column 760px',
      density: 'regular',
      docx_friendly: true,
    },
    sections: [
      { title: 'Highlights', type: 'summary', brief: 'three KPIs', layout: 'stats_row' },
      { title: 'Revenue', type: 'data', brief: 'table by region' },
    ],
    meta: { title: 'Q3 Review', language: 'en', audience: 'board' },
  }
  const toolCall = (
    name: string,
    input: Record<string, unknown>,
  ): Array<Partial<AiStreamChunk>> => [
    { type: 'tool-call', toolCall: { id: `c-${name}`, name, input } },
    { type: 'done' },
  ]
  const liveReply = () => [...host.querySelectorAll('.ai-msg-assistant')].at(-1)!
  const groupLabels = () =>
    [...host.querySelectorAll('.ai-work-group-label')].map((el) => el.textContent)

  it('shows the brief as waiting for the person, with no clock, until they confirm', async () => {
    const main = fakeMain({
      settings: ready(),
      statuses: statusMap('ready', 'ready'),
      // the chat turn calls plan_page, the brief writer answers, the turn after the confirm stays open
      reply: (_request, nth) =>
        nth === 1
          ? toolCall('plan_page', { mode: 'redesign' })
          : nth === 2
            ? [{ type: 'delta', text: JSON.stringify(BRIEF) }, { type: 'done' }]
            : [],
    })
    await mountPanel(main)
    await sendMessage('rebuild the whole page')

    expect(host.querySelector('.brief-card')).not.toBeNull()
    expect(liveReply().querySelector('.ai-clarify-chip')?.textContent).toContain(
      zh.aiWaitingConfirm,
    )
    expect(liveReply().querySelector('.ai-typing')).toBeNull()
    expect(host.querySelector('.ai-typing-elapsed')).toBeNull()
    expect(groupLabels()).toEqual([zh.aiWaitingConfirm])
    const step = host.querySelector('.ai-step-title')!.textContent!
    expect(step).toContain(zh.aiWaitingConfirm)
    expect(step).toContain(zh.briefGenerate)
    expect(step).not.toContain(zh.aiDraftingBrief)

    const generate = [...host.querySelectorAll<HTMLButtonElement>('.brief-btn.primary')].find(
      (b) => b.textContent === zh.briefGenerate,
    )!
    act(() => generate.click())
    await settle()

    // the run goes on: the working indicator is back and nothing says it waits any more
    expect(host.querySelector('.brief-card')).toBeNull()
    expect(main.requests).toHaveLength(3)
    expect(host.querySelector('.ai-clarify-chip')).toBeNull()
    expect(liveReply().querySelector('.ai-typing')).not.toBeNull()
    expect(groupLabels()).not.toContain(zh.aiWaitingConfirm)
  })

  it('shows the questionnaire as waiting for answers until it is skipped', async () => {
    const main = fakeMain({
      settings: ready(),
      statuses: statusMap('ready', 'ready'),
      reply: (_request, nth) =>
        nth === 1
          ? toolCall('ask_clarification', {
              questions: [{ id: 'q1', label: 'Who is it for?', options: ['Kids', 'Adults'] }],
            })
          : [],
    })
    await mountPanel(main)
    await sendMessage('a landing page')

    expect(liveReply().querySelector('.ai-clarify-chip')?.textContent).toContain(zh.aiWaitingAnswer)
    expect(liveReply().querySelector('.ai-typing')).toBeNull()
    expect(groupLabels()).toEqual([zh.aiWaitingAnswer])
    expect(host.querySelector('.ai-step-title')!.textContent).toBe(zh.aiWaitClarifyStep)

    act(() => host.querySelector<HTMLButtonElement>('.ai-clarify-skip')!.click())
    await settle()

    expect(main.requests).toHaveLength(2)
    expect(host.querySelector('.ai-clarify-chip')).toBeNull()
    expect(liveReply().querySelector('.ai-typing')).not.toBeNull()
  })

  it('shows a page that stopped early as waiting for the keep-or-discard choice', async () => {
    const main = fakeMain({
      settings: ready(),
      statuses: statusMap('ready', 'ready'),
      reply: (_request, nth) =>
        nth === 1
          ? toolCall('write_document', { plan: 'one heading' })
          : nth === 2
            ? // the page ends before </html>: the keep-or-discard card
              [{ type: 'delta', text: '<!doctype html><html><body><h1>Hi' }, { type: 'done' }]
            : [],
    })
    await mountPanel(main)
    await sendMessage('write the page')

    expect(host.querySelector('.ai-partial-card')).not.toBeNull()
    expect(liveReply().querySelector('.ai-clarify-chip')?.textContent).toContain(zh.aiWaitingChoice)
    expect(liveReply().querySelector('.ai-typing')).toBeNull()
    expect(groupLabels()).toEqual([zh.aiWaitingChoice])
    const step = host.querySelector('.ai-step-title')!.textContent!
    expect(step).toContain(zh.aiPartialAdopt)
    expect(step).toContain(zh.aiPartialDiscard)

    act(() => host.querySelector<HTMLButtonElement>('.ai-partial-card .brief-btn.primary')!.click())
    await settle()

    expect(host.querySelector('.ai-partial-card')).toBeNull()
    expect(host.querySelector('.ai-clarify-chip')).toBeNull()
    expect(liveReply().querySelector('.ai-typing')).not.toBeNull()
  })
})
