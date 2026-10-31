/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiSubscriptionState, SubscriptionStatusMap } from '@genoffice/ai-provider/browser'
import { LANGS } from '@genoffice/i18n'
import { aiSubscriptionText } from '@genoffice/ui'
import { Onboarding } from '../src/renderer/src/Onboarding'
import { LocaleProvider } from '../src/renderer/src/locale'
import {
  ONBOARDING_CONNECT_STEP,
  ONBOARDING_STEPS,
  isLastOnboardingStep,
  nextOnboardingStep,
  previousOnboardingStep,
} from '../src/renderer/src/onboarding-steps'
import { strings } from '../src/renderer/src/strings'
import type { SubscriptionConnection } from '../src/renderer/src/subscription-client'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function statuses(claude: AiSubscriptionState, codex: AiSubscriptionState): SubscriptionStatusMap {
  return {
    'claude-code': { provider: 'claude-code', state: claude, meteredAccepted: false },
    codex: { provider: 'codex', state: codex, meteredAccepted: false },
  }
}

function connectionOf(
  map: SubscriptionStatusMap,
  extra: Partial<SubscriptionConnection> = {},
): SubscriptionConnection {
  return {
    statuses: map,
    busy: false,
    failed: {},
    codexImageAvailable: false,
    install: vi.fn(),
    login: vi.fn(),
    switchAccount: vi.fn(),
    logout: vi.fn(),
    recheck: vi.fn(),
    refresh: vi.fn(),
    acceptMetered: vi.fn(async () => undefined),
    openInstallHelp: vi.fn(),
    ...extra,
  }
}

interface RenderOptions {
  onDone?: () => Promise<boolean>
  connection?: SubscriptionConnection
  noticeDue?: boolean
  onNoticeAcknowledge?: () => void
}

function renderOnboarding(options: RenderOptions = {}): void {
  act(() => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(Onboarding, {
          onDone: options.onDone ?? vi.fn(async () => true),
          connection: options.connection ?? connectionOf(statuses('not-installed', 'signed-out')),
          noticeDue: options.noticeDue ?? false,
          onNoticeAcknowledge: options.onNoticeAcknowledge ?? vi.fn(),
        }),
      ),
    )
  })
}

async function click(selector: string): Promise<void> {
  const button = host.querySelector<HTMLButtonElement>(selector)
  expect(button, selector).not.toBeNull()
  await act(async () => {
    button!.click()
    // let a finish (persist, then re-enable the buttons) settle
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const activeStep = (): string | null =>
  host.querySelector<HTMLElement>('.onb-slide.active')?.dataset.step ?? null

describe('onboarding steps', () => {
  it('are exactly welcome, connect, done', () => {
    expect(ONBOARDING_STEPS).toEqual(['welcome', 'connect', 'done'])
    expect(ONBOARDING_CONNECT_STEP).toBe(1)
  })

  it('advance one by one and finish after the last, whatever the connection', () => {
    expect(nextOnboardingStep(0)).toBe(1)
    expect(nextOnboardingStep(1)).toBe(2)
    expect(nextOnboardingStep(2)).toBeNull()
    expect(isLastOnboardingStep(1)).toBe(false)
    expect(isLastOnboardingStep(2)).toBe(true)
  })

  it('go back one by one and stop at the first', () => {
    expect(previousOnboardingStep(2)).toBe(1)
    expect(previousOnboardingStep(1)).toBe(0)
    expect(previousOnboardingStep(0)).toBe(0)
  })
})

describe('Onboarding', () => {
  it('shows three steps: welcome first, one dot each', () => {
    renderOnboarding()
    expect(
      Array.from(host.querySelectorAll<HTMLElement>('.onb-slide')).map((el) => el.dataset.step),
    ).toEqual(['welcome', 'connect', 'done'])
    expect(host.querySelectorAll('.onb-dot')).toHaveLength(3)
    expect(activeStep()).toBe('welcome')
  })

  it('describes the product plainly on the welcome step', () => {
    renderOnboarding()
    const step = host.querySelector<HTMLElement>('.onb-slide[data-step="welcome"]')!
    expect(step.querySelector('.onb-subtitle')!.textContent).toBe(strings.en.onbWelcomeSubtitle)
    expect(step.querySelector('.onb-body')!.textContent).toBe(strings.en.onbWelcomeBody)
    // no superlative of its own
    expect(step.textContent).not.toMatch(/\b(first|best|leading|most|only)\b|AI-native/i)
    expect(strings.en.onbWelcomeSubtitle).toBe('An open-source office suite')
  })

  it('can be completed without connecting a subscription', async () => {
    const onDone = vi.fn(async () => true)
    const connection = connectionOf(statuses('not-installed', 'not-installed'))
    renderOnboarding({ onDone, connection })

    await click('.onb-next')
    expect(activeStep()).toBe('connect')
    expect(host.querySelector<HTMLButtonElement>('.onb-next')!.disabled).toBe(false)
    expect(host.textContent).toContain(strings.en.onbConnectSkipNote)

    await click('.onb-next')
    expect(activeStep()).toBe('done')
    expect(host.textContent).toContain(strings.en.onbDoneNotConnected)
    expect(onDone).not.toHaveBeenCalled()

    await click('.onb-next')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(connection.install).not.toHaveBeenCalled()
    expect(connection.login).not.toHaveBeenCalled()
  })

  it('lets Skip and Escape finish from any step', async () => {
    const onDone = vi.fn(async () => true)
    renderOnboarding({ onDone })

    await click('.onb-skip')
    expect(onDone).toHaveBeenCalledTimes(1)

    await click('.onb-next')
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await Promise.resolve()
    })
    expect(onDone).toHaveBeenCalledTimes(2)
  })

  it('asks which AI the user has on the connect step, then walks that one path on the live status', async () => {
    const connection = connectionOf(statuses('not-installed', 'signed-out'))
    renderOnboarding({ connection })
    await click('.onb-next')

    const step = host.querySelector<HTMLElement>('.onb-slide[data-step="connect"]')!
    const cards = () =>
      Array.from(step.querySelectorAll<HTMLElement>('.ai-sub-card')).map((card) => [
        card.dataset.provider,
        card.dataset.state,
      ])
    expect(step.querySelector('.ai-sub-guide-question')!.textContent).toBe(
      aiSubscriptionText('en', 'guideQuestion'),
    )
    expect(
      Array.from(step.querySelectorAll<HTMLElement>('.ai-sub-guide-path')).map(
        (el) => el.dataset.path,
      ),
    ).toEqual(['claude-code', 'chatgpt', 'free'])
    expect(cards()).toEqual([])
    // the ChatGPT answer connects directly: the line about Codex belongs to the Codex way alone
    expect(step.querySelector('.ai-sub-codex')).toBeNull()

    await click('.onb-slide[data-step="connect"] [data-path="claude-code"]')
    expect(cards()).toEqual([['claude-code', 'not-installed']])
    await click(
      '.onb-slide[data-step="connect"] [data-provider="claude-code"] [data-action="install"]',
    )
    expect(connection.install).toHaveBeenCalledWith('claude-code')
    await click('.onb-slide[data-step="connect"] [data-action="guide-back"]')
    await click('.onb-slide[data-step="connect"] [data-path="chatgpt"]')
    await click('.onb-slide[data-step="connect"] [data-action="guide-alternate"]')
    expect(cards()).toEqual([['codex', 'signed-out']])
    expect(step.querySelector('.ai-sub-codex')!.textContent).toBe(
      aiSubscriptionText('en', 'codexNotice'),
    )
    await click('.onb-slide[data-step="connect"] [data-provider="codex"] [data-action="login"]')
    expect(connection.login).toHaveBeenCalledWith('codex')
  })

  it('says a launch could not start, under the card of that path', async () => {
    renderOnboarding({
      connection: connectionOf(statuses('not-installed', 'signed-out'), {
        failed: { codex: 'login' },
      }),
    })
    await click('.onb-next')
    expect(host.querySelector('.onb-connect-failed')).toBeNull()
    await click('.onb-slide[data-step="connect"] [data-path="chatgpt"]')
    await click('.onb-slide[data-step="connect"] [data-action="guide-alternate"]')
    const failed = host.querySelector<HTMLElement>('.onb-connect-failed')!
    expect(failed.dataset.provider).toBe('codex')
    expect(failed.textContent).toBe(strings.en.setSubLoginFailed)
  })

  it('names the connected subscription on the last step', async () => {
    renderOnboarding({ connection: connectionOf(statuses('ready', 'signed-out')) })
    await click('.onb-next')
    await click('.onb-next')
    expect(host.querySelector('.onb-slide.active .onb-subtitle')!.textContent).toBe(
      'AI is connected: Claude.',
    )
  })

  it('offers the free connections on the connect step and names a made one on the last step', async () => {
    const connectFreeAi = vi.fn(async () => ({
      ok: true as const,
      provider: 'gemini' as const,
      model: 'm',
    }))
    vi.stubGlobal('aiOffice', {
      getAiSettings: async () => ({
        providers: {
          openrouter: { apiKey: 'sk-or-v1-x', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
        },
      }),
      onAiSettingsChanged: () => () => {},
      getFreeAiQuota: async () => ({ used: 9, limit: 50, remaining: 41 }),
      connectFreeAi,
    })
    try {
      renderOnboarding()
      await click('.onb-next')
      const step = host.querySelector('.onb-slide.active')!
      // a free connection already made opens the free path by itself
      expect(step.querySelector('.ai-sub-guide-open')!.getAttribute('data-path')).toBe('free')
      // the free cards say what free use means themselves: no line of the guide repeats it
      expect(step.querySelector('.ai-sub-guide-need')).toBeNull()
      expect(
        [...step.querySelectorAll<HTMLElement>('.free-ai-card')].map((el) => [
          el.dataset.provider,
          el.dataset.state,
        ]),
      ).toEqual([
        ['openrouter', 'connected'],
        ['gemini', 'idle'],
      ])
      expect(step.textContent).toContain('41 of 50 free requests left today')
      await click('.onb-next')
      expect(host.querySelector('.onb-slide.active .onb-subtitle')!.textContent).toBe(
        'AI is connected: OpenRouter.',
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('keeps the first-connection notice for the connect step and reports its acknowledgement', async () => {
    const onNoticeAcknowledge = vi.fn()
    const onDone = vi.fn(async () => true)
    renderOnboarding({
      onDone,
      noticeDue: true,
      onNoticeAcknowledge,
      connection: connectionOf(statuses('ready', 'signed-out')),
    })
    expect(host.querySelector('.first-notice')).toBeNull()

    await click('.onb-next')
    const notice = host.querySelector<HTMLElement>('.first-notice')!
    expect(notice.textContent).toContain(aiSubscriptionText('en', 'noticeSend'))
    expect(notice.textContent).toContain(aiSubscriptionText('en', 'noticeTraining'))
    expect(notice.textContent).toContain(aiSubscriptionText('en', 'noticeCodexHistory'))

    // the notice owns the keyboard: the onboarding behind it neither skips nor advances
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
      await Promise.resolve()
    })
    expect(activeStep()).toBe('connect')
    expect(onDone).not.toHaveBeenCalled()

    await click('.first-notice .ai-sub-btn')
    expect(onNoticeAcknowledge).toHaveBeenCalledTimes(1)
  })

  it('carries no credits offer, community call, star hint or statistics notice', async () => {
    renderOnboarding({ connection: connectionOf(statuses('ready', 'ready')) })
    const text = () => host.textContent ?? ''
    for (let step = 0; step < ONBOARDING_STEPS.length; step++) {
      expect(text()).not.toMatch(/credit|github|\bstars?\b|statistic|analytics/i)
      if (step < ONBOARDING_STEPS.length - 1) await click('.onb-next')
    }
    expect(host.querySelector('[role="switch"]')).toBeNull()
    expect(host.querySelector('.onb-offer, .onb-star, .onb-consent, .onb-join')).toBeNull()
  })
})

describe('welcome copy', () => {
  it('exists in every UI language, as a translation', () => {
    expect(LANGS).toHaveLength(21)
    for (const lang of LANGS) {
      const { onbWelcomeSubtitle, onbWelcomeBody } = strings[lang]
      expect(onbWelcomeSubtitle.trim(), lang).not.toBe('')
      expect(onbWelcomeBody.trim(), lang).not.toBe('')
      if (lang === 'en') continue
      expect(onbWelcomeSubtitle, lang).not.toBe(strings.en.onbWelcomeSubtitle)
      expect(onbWelcomeBody, lang).not.toBe(strings.en.onbWelcomeBody)
    }
    expect(new Set(LANGS.map((lang) => strings[lang].onbWelcomeBody)).size).toBe(LANGS.length)
  })

  it.each(LANGS)('names every document kind and both subscriptions in %s', (lang) => {
    const body = strings[lang].onbWelcomeBody
    for (const name of ['Word', 'Excel', 'PowerPoint', 'PDF', 'Markdown', 'HTML']) {
      expect(body, name).toContain(name)
    }
    expect(body).toContain('Claude')
    expect(body).toContain('ChatGPT')
    // the product is named by the title above, and no vendor of the suite is named at all
    expect(`${strings[lang].onbWelcomeSubtitle} ${body}`).not.toMatch(/genoffice/i)
  })
})
