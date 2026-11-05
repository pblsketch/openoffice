/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import type {
  AiSettings,
  AiSubscriptionStatus,
  SubscriptionStatusMap,
} from '@genoffice/ai-provider/browser'
import { aiSubscriptionText } from '@genoffice/ui'
import type { HomeApi } from '../src/shared/home-api'
import type { SubscriptionApi } from '../src/shared/subscription-api'
import { Home } from '../src/renderer/src/Home'
import { LocaleProvider } from '../src/renderer/src/locale'
import type { SubscriptionConnection } from '../src/renderer/src/subscription-client'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

/** every home call answers with something harmless; the calls this file cares about are named */
function installHome(): void {
  const known: Record<string, unknown> = {
    recents: async () => ({ entries: [], total: 0, totalAll: 0 }),
    starred: async () => ({ entries: [], total: 0, totalAll: 0 }),
    starredGroups: async () => [],
    folderRoots: async () => [],
    kbList: async () => [],
    getAiSettings: async () => defaultAiSettings(),
    aiGetSettings: async () => defaultAiSettings(),
    getAiProviders: () => [],
    getAiMediaProviders: () => [],
    getAiSearchProviders: () => [],
    getTheme: async () => 'system',
    getDocumentTheme: async () => 'follow',
    getDefaultSaveDir: async () => '',
    getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
    getDefaultAppStatus: async () => ({ state: 'unsupported', others: [], manualOnly: false }),
    getAiPanelPrefs: async () => ({ fontSize: 'default', customFontSize: 14, spellcheck: true }),
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '1.0.0',
    getCodexModels: async () => ({ models: [], defaultModel: '' }),
  }
  window.aiOffice = new Proxy(known, {
    get: (target, name: string) =>
      target[name] ?? (name.startsWith('on') ? () => () => undefined : async () => null),
  }) as unknown as HomeApi
}

function installSubscription(map: SubscriptionStatusMap): void {
  window.aiOfficeSubscription = {
    statuses: async () => map,
    recheck: async () => map,
    login: async () => ({ ok: true }),
    install: async () => ({ ok: true }),
    setMeteredAccepted: async () => ({ ok: true, statuses: map }),
    codexImageAvailable: async () => false,
    onChanged: () => () => undefined,
    openInstallHelp: async () => undefined,
  } as SubscriptionApi
}

beforeEach(() => {
  // jsdom has no element scrolling; the ask panel keeps its log scrolled to the end
  Element.prototype.scrollTo = () => undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  installHome()
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete window.aiOfficeSubscription
})

function statuses(
  claude: Partial<AiSubscriptionStatus> & Pick<AiSubscriptionStatus, 'state'>,
  codex: Partial<AiSubscriptionStatus> & Pick<AiSubscriptionStatus, 'state'>,
): SubscriptionStatusMap {
  return {
    'claude-code': { provider: 'claude-code', meteredAccepted: false, ...claude },
    codex: { provider: 'codex', meteredAccepted: false, ...codex },
  }
}

interface RenderOptions {
  noticeDue?: boolean
  onNoticeAcknowledge?: () => void
  aiSettings?: AiSettings | null
  refresh?: () => void
}

async function renderHome(map: SubscriptionStatusMap, options: RenderOptions = {}): Promise<void> {
  installSubscription(map)
  const connection: SubscriptionConnection = {
    statuses: map,
    busy: false,
    failed: {},
    codexImageAvailable: false,
    install: vi.fn(),
    login: vi.fn(),
    switchAccount: vi.fn(),
    logout: vi.fn(),
    recheck: vi.fn(),
    refresh: options.refresh ?? vi.fn(),
    acceptMetered: vi.fn(async () => undefined),
    openInstallHelp: vi.fn(),
  }
  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(Home, {
          connection,
          aiSettings: options.aiSettings === undefined ? defaultAiSettings() : options.aiSettings,
          noticeDue: options.noticeDue ?? false,
          onNoticeAcknowledge: options.onNoticeAcknowledge ?? vi.fn(),
        }),
      ),
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function click(element: Element | null | undefined): Promise<void> {
  expect(element).toBeTruthy()
  await act(async () => {
    ;(element as HTMLElement).click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const entry = (): HTMLButtonElement => host.querySelector<HTMLButtonElement>('.account-btn')!
const entryText = (selector: string): string | null =>
  entry().querySelector(selector)?.textContent ?? null

describe('home settings entry', () => {
  it('names the connected subscription and its state', async () => {
    await renderHome(statuses({ state: 'ready', planName: 'max' }, { state: 'signed-out' }))
    expect(entry().dataset.subscription).toBe('connected')
    expect(entryText('.account-name')).toBe('Claude')
    expect(entryText('.account-sub')).toBe('Connected · max')
  })

  it('lists both when both are connected', async () => {
    await renderHome(statuses({ state: 'ready' }, { state: 'ready' }))
    expect(entryText('.account-name')).toBe('Claude · Codex')
    expect(entryText('.account-sub')).toBe(aiSubscriptionText('en', 'cardReady'))
  })

  it('keeps the cost in sight for an accepted metered login that is selected', async () => {
    const map = statuses({ state: 'signed-out' }, { state: 'metered', meteredAccepted: true })
    await renderHome(map, {
      aiSettings: { ...defaultAiSettings(), provider: 'codex', meteredAccepted: { codex: true } },
    })
    expect(entryText('.account-name')).toBe('Codex')
    expect(entryText('.account-sub')).toBe(aiSubscriptionText('en', 'cardMeteredAccepted'))

    // under auto the metered login does not run, so it is not shown as in use
    await renderHome(map, {
      aiSettings: { ...defaultAiSettings(), meteredAccepted: { codex: true } },
    })
    expect(entry().dataset.subscription).toBe('disconnected')
    expect(entryText('.account-name')).toBe(aiSubscriptionText('en', 'pickerNotConnected'))
  })

  it('names the selected key provider in use over the subscriptions', async () => {
    await renderHome(statuses({ state: 'ready', planName: 'max' }, { state: 'ready' }), {
      aiSettings: {
        ...defaultAiSettings(),
        provider: 'gemini',
        providers: { gemini: { apiKey: 'key', model: 'gemini-3.5-flash-lite' } },
      },
    })
    expect(entry().dataset.subscription).toBe('connected')
    expect(entryText('.account-name')).toBe('Gemini')
    expect(entryText('.account-sub')).toBe('Connected · in use')
  })

  it('shows the selected key provider as needing a connection when its key is missing', async () => {
    await renderHome(statuses({ state: 'ready', planName: 'max' }, { state: 'ready' }), {
      aiSettings: { ...defaultAiSettings(), provider: 'gemini' },
    })
    expect(entry().dataset.subscription).toBe('needs-connection')
    expect(entryText('.account-name')).toBe('Gemini')
    expect(entryText('.account-sub')).toBe('Needs connecting')
    expect(entry().querySelector('.account-avatar')?.classList.contains('logged-in')).toBe(false)
  })

  it('reads the statuses alone while the settings are not read', async () => {
    await renderHome(statuses({ state: 'ready' }, { state: 'ready' }), { aiSettings: null })
    expect(entryText('.account-name')).toBe('Claude · Codex')
  })

  it('invites to connect when nothing is, and waits while still checking', async () => {
    await renderHome(statuses({ state: 'not-installed' }, { state: 'signed-out' }))
    expect(entry().dataset.subscription).toBe('disconnected')
    expect(entryText('.account-name')).toBe(aiSubscriptionText('en', 'pickerNotConnected'))
    expect(entryText('.account-sub')).toBeNull()

    await renderHome(statuses({ state: 'checking' }, { state: 'checking' }))
    expect(entry().dataset.subscription).toBe('checking')
    expect(entryText('.account-name')).toBe(aiSubscriptionText('en', 'cardChecking'))
  })

  it('opens Settings on the AI section and re-reads the connection when it closes', async () => {
    const refresh = vi.fn()
    await renderHome(statuses({ state: 'signed-out' }, { state: 'signed-out' }), { refresh })
    await click(entry())
    const active = host.querySelector('.set-nav-item.active')
    expect(active?.textContent).toContain('AI')
    expect(host.querySelectorAll('.set-sub-cards .ai-sub-card')).toHaveLength(3)

    await click(host.querySelector('.set-close'))
    expect(host.querySelector('.set-sub-cards')).toBeNull()
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('home screen without the removed areas', () => {
  it('has no cloud projects entry, sign-in or credits', async () => {
    await renderHome(statuses({ state: 'ready' }, { state: 'ready' }))
    expect(host.querySelectorAll('.sidebar-nav .nav-item')).toHaveLength(3)
    expect(host.querySelector('.login-hint, .cloud-projects, .nav-external')).toBeNull()
    expect(host.textContent).not.toMatch(/credits|sign in/i)
  })
})

describe('first-connection notice on the home screen', () => {
  const ready = statuses({ state: 'ready' }, { state: 'signed-out' })

  it('does not interrupt the plain home screen', async () => {
    await renderHome(ready, { noticeDue: true })
    expect(host.querySelector('.first-notice')).toBeNull()
  })

  it('comes up in the settings flow and reports its acknowledgement', async () => {
    const onNoticeAcknowledge = vi.fn()
    await renderHome(ready, { noticeDue: true, onNoticeAcknowledge })
    await click(entry())
    const notice = host.querySelector('.first-notice')!
    expect(notice.textContent).toContain(aiSubscriptionText('en', 'noticeSend'))
    await click(notice.querySelector('.ai-sub-btn'))
    expect(onNoticeAcknowledge).toHaveBeenCalledTimes(1)
  })

  it('is still owed after Settings closed, when the connection is only seen then', async () => {
    const map = statuses({ state: 'signed-out' }, { state: 'signed-out' })
    await renderHome(map, { noticeDue: false })
    await click(entry())
    await click(host.querySelector('.set-close'))
    expect(host.querySelector('.first-notice')).toBeNull()
    // the connection made in the dialog arrives with the refresh
    await renderHome(ready, { noticeDue: true })
    expect(host.querySelector('.first-notice')).not.toBeNull()
  })

  it('comes up when the ask panel is opened', async () => {
    await renderHome(ready, { noticeDue: true })
    const ask = Array.from(host.querySelectorAll<HTMLElement>('.sidebar-nav .nav-item')).find(
      (item) => item.textContent?.includes('Ask'),
    )
    await click(ask)
    expect(host.querySelector('.first-notice')).not.toBeNull()
  })
})

describe('ask panel without a connection', () => {
  const openAsk = async (): Promise<void> => {
    const items = host.querySelectorAll<HTMLElement>('.sidebar-nav .nav-item')
    await click(items[2])
  }

  it('says what to connect and leads to Settings → AI', async () => {
    await renderHome(statuses({ state: 'not-installed' }, { state: 'signed-out' }))
    await openAsk()
    const hint = host.querySelector('.kb-ask-login')!
    expect(hint.textContent).toContain(aiSubscriptionText('en', 'connectTitle'))
    await click(hint.querySelector('.kb-ask-login-link'))
    expect(host.querySelector('.set-nav-item.active')?.textContent).toContain('AI')
  })

  it('offers the connect cards, on the live connection, when a question is sent anyway', async () => {
    await renderHome(statuses({ state: 'not-installed' }, { state: 'signed-out' }))
    await openAsk()
    const box = host.querySelector<HTMLTextAreaElement>('.kb-ask textarea')!
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      setValue.call(box, 'What changed?')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click(host.querySelector('.kb-ask .ai-send-btn'))

    // the guide knows each subscription's live state before one is picked
    const badges = Array.from(
      host.querySelectorAll<HTMLElement>('.kb-ask .ai-sub-prompt .ai-sub-guide-path'),
    ).map((el) => [el.dataset.path, el.querySelector('.ai-sub-guide-badge')?.textContent ?? null])
    expect(badges).toEqual([
      ['claude-code', null],
      ['chatgpt', null],
      ['free', null],
    ])
    // the Codex program is a way within the one ChatGPT answer
    await click(host.querySelector('.kb-ask .ai-sub-prompt [data-path="chatgpt"]'))
    await click(host.querySelector('.kb-ask .ai-sub-prompt [data-action="guide-alternate"]'))
    const cards = Array.from(
      host.querySelectorAll<HTMLElement>('.kb-ask .ai-sub-prompt .ai-sub-card'),
    )
    expect(cards.map((card) => card.dataset.state)).toEqual(['signed-out'])
    expect(box.value).toBe('What changed?')
    expect(host.querySelectorAll('.kb-ask-msg')).toHaveLength(0)
  })

  it('says nothing once a subscription can run', async () => {
    await renderHome(statuses({ state: 'ready' }, { state: 'signed-out' }))
    await openAsk()
    expect(host.querySelector('.kb-ask-login')).toBeNull()
  })
})
