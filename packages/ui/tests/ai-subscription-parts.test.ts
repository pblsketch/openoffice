/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultAiSettings,
  selectAiProvider,
  type AiSettings,
  type AiSubscriptionProviderId,
  type AiSubscriptionState,
  type AiSubscriptionStatus,
  type AiSubscriptionStatuses,
} from '@genoffice/ai-provider'
import { AiBlockedNotice } from '../src/AiBlockedNotice'
import { AiModelPicker, aiModelPopoverStyle, type AiModelPickerBridge } from '../src/AiModelPicker'
import { AiConnectPrompt, AiSubscriptionCard } from '../src/AiSubscriptionCard'
import {
  AiCodexNotice,
  AiFirstConnectionNotice,
  AiInputTruncatedNotice,
  AiMeteredWarning,
} from '../src/AiSubscriptionNotices'
import { AiSubscriptionUsageLine } from '../src/AiSubscriptionUsageLine'
import { AI_SIGNING_IN_STALLED_MS, formatAiResetTime } from '../src/ai-subscription'
import { AI_SUBSCRIPTION_STRINGS } from '../src/strings-ai-subscription'

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

const en = AI_SUBSCRIPTION_STRINGS.en

const status = (
  provider: AiSubscriptionProviderId,
  state: AiSubscriptionState,
  extra: Partial<AiSubscriptionStatus> = {},
): AiSubscriptionStatus => ({ provider, state, meteredAccepted: false, ...extra })

function cardActions() {
  return {
    onInstall: vi.fn(),
    onLogin: vi.fn(),
    onRecheck: vi.fn(),
    onAcceptMetered: vi.fn(),
    onOpenInstallHelp: vi.fn(),
  }
}

const actionsShown = () =>
  [...host.querySelectorAll<HTMLElement>('[data-action]')].map((el) => el.dataset.action)
const click = (selector: string) =>
  act(() => host.querySelector<HTMLButtonElement>(selector)!.click())

describe('AiSubscriptionCard', () => {
  const render = (s: AiSubscriptionStatus, actions = cardActions()) => {
    act(() => root.render(createElement(AiSubscriptionCard, { status: s, lang: 'en', ...actions })))
    return actions
  }
  const statusText = () => host.querySelector('.ai-sub-card-status')!.textContent
  const notes = () => [...host.querySelectorAll('.ai-sub-note')].map((el) => el.textContent)

  it('checking: says so and offers nothing', () => {
    render(status('claude-code', 'checking'))
    expect(host.querySelector('.ai-sub-card-name')!.textContent).toBe('Claude')
    expect(statusText()).toBe(en.cardChecking)
    expect(actionsShown()).toEqual([])
  })

  it('not-installed: install button, the terminal note, and the official instructions', () => {
    const actions = render(status('codex', 'not-installed'))
    expect(host.querySelector('.ai-sub-card-name')!.textContent).toBe('Codex')
    expect(statusText()).toBe(en.cardNotInstalled)
    expect(notes()).toEqual([
      "OpenAI's official install command runs in a new terminal window.",
      en.installReturnNote,
    ])
    expect(actionsShown()).toEqual(['install', 'install-help'])
    click('[data-action="install"]')
    expect(actions.onInstall).toHaveBeenCalledExactlyOnceWith('codex')
    click('[data-action="install-help"]')
    expect(actions.onOpenInstallHelp).toHaveBeenCalledExactlyOnceWith('codex')
  })

  it('signed-out: login button', () => {
    const actions = render(status('claude-code', 'signed-out'))
    expect(statusText()).toBe(en.cardSignedOut)
    expect(notes()).toEqual([
      'A browser opens when you press it. Sign in with your Anthropic account and press Allow; the connection finishes by itself.',
      "The sign-in page that opens is Anthropic's own.",
    ])
    expect(actionsShown()).toEqual(['login'])
    click('[data-action="login"]')
    expect(actions.onLogin).toHaveBeenCalledExactlyOnceWith('claude-code')
  })

  it('ready: connected, with the plan name when given', () => {
    render(status('claude-code', 'ready'))
    expect(statusText()).toBe('Connected')
    expect(actionsShown()).toEqual([])
    render(status('claude-code', 'ready', { planName: 'max' }))
    expect(statusText()).toBe('Connected · max')
    expect(host.querySelector('.ai-sub-card')!.getAttribute('data-tone')).toBe('ok')
  })

  it('metered: cost warning, what it means, and "use anyway"', () => {
    const actions = render(status('codex', 'metered'))
    expect(statusText()).toBe(en.cardMetered)
    expect(notes()).toEqual([en.meteredWarning, en.meteredMeaning])
    expect(actionsShown()).toEqual(['accept-metered'])
    const button = host.querySelector<HTMLButtonElement>('[data-action="accept-metered"]')!
    expect(button.textContent).toBe('Use anyway')
    // paying is never the highlighted default
    expect(button.classList.contains('primary')).toBe(false)
    click('[data-action="accept-metered"]')
    expect(actions.onAcceptMetered).toHaveBeenCalledExactlyOnceWith('codex')
  })

  it('metered and accepted: keeps the warning, drops the choice', () => {
    render(status('codex', 'metered', { meteredAccepted: true }))
    expect(statusText()).toBe(en.cardMeteredAccepted)
    expect(notes()).toEqual([en.meteredWarning])
    expect(actionsShown()).toEqual([])
  })

  it('error: says what went wrong in our own words, with a re-check button', () => {
    const actions = render(
      status('claude-code', 'error', {
        error: 'needs-update: The Claude Code program is too old',
      }),
    )
    expect(statusText()).toBe(en.cardError)
    expect(host.querySelector('.ai-sub-detail')!.textContent).toBe(
      'The Claude program on this PC is too old. Update it, then check again.',
    )
    expect(actionsShown()).toEqual(['recheck'])
    click('[data-action="recheck"]')
    expect(actions.onRecheck).toHaveBeenCalledExactlyOnceWith('claude-code')
  })

  it('error: a Claude below the floor is told which version it has and how to update', () => {
    for (const lang of ['en', 'ko'] as const) {
      const props = {
        status: status('claude-code', 'error', {
          version: '2.1.237',
          error:
            'needs-update: Claude Code 2.1.237 is too old; version 2.1.248 or newer is required',
        }),
        lang,
      }
      act(() => root.render(createElement(AiSubscriptionCard, { ...props, ...cardActions() })))
      expect(host.querySelector('.ai-sub-detail')!.textContent).toBe(
        {
          en: 'The Claude program on this PC (2.1.237) is too old; 2.1.248 or newer is needed. Run claude update in a terminal, then check again.',
          ko: '이 PC의 Claude 프로그램(2.1.237)이 오래되었습니다. 2.1.248 이상이 필요합니다. 터미널에서 claude update를 실행한 뒤 다시 확인하세요.',
        }[lang],
      )
      expect(host.textContent).not.toMatch(/needs-update|newer is required/)
    }
  })

  it('error: a Claude below the floor shows the file the app runs, left to right', () => {
    const path = 'C:\\Users\\me\\AppData\\Roaming\\npm\\claude.exe'
    for (const lang of ['en', 'ko'] as const) {
      const props = {
        status: status('claude-code', 'error', {
          version: '2.1.114',
          error:
            'needs-update: Claude Code 2.1.114 is too old; version 2.1.248 or newer is required',
          programPath: path,
        }),
        lang,
      }
      act(() => root.render(createElement(AiSubscriptionCard, { ...props, ...cardActions() })))
      const value = host.querySelector('.ai-sub-path-value')!
      expect(value.textContent).toBe(path)
      expect(value.getAttribute('dir')).toBe('ltr')
      const labels = [...host.querySelectorAll('.ai-sub-path-label')].map((p) => p.textContent)
      expect(labels).toEqual(
        {
          en: [
            'The file this app runs:',
            'Updating Claude inside WSL (Ubuntu) or in another folder does not change this file. Run claude update in Windows PowerShell.',
          ],
          ko: [
            '이 앱이 실행하는 파일:',
            'WSL(Ubuntu)이나 다른 폴더에 설치된 Claude를 업데이트해도 이 파일은 바뀌지 않습니다. Windows PowerShell에서 claude update를 실행하세요.',
          ],
        }[lang],
      )
    }
  })

  it("error: a Codex too old shows the file it ran, without Claude's WSL hint", () => {
    const path =
      'C:\\Users\\me\\AppData\\Local\\Microsoft\\WinGet\\Packages\\OpenAI.Codex_x\\codex.exe'
    render(
      status('codex', 'error', {
        version: '0.1.0',
        error: 'needs-update: too old',
        programPath: path,
      }),
    )
    expect(host.querySelector('.ai-sub-path-value')!.textContent).toBe(path)
    expect(
      [...host.querySelectorAll('.ai-sub-path-label')].map((label) => label.textContent),
    ).toEqual([en.cardErrNeedsUpdatePath])
  })

  it('error: one sentence per kind, naming the provider, never the raw detail', () => {
    const cases = [
      {
        error: 'needs-update: The Codex program is too old',
        raw: 'The Codex program is too old',
        en: 'The Codex program on this PC is too old. Update it, then check again.',
        ko: '이 PC의 Codex 프로그램 버전이 낮습니다. 업데이트한 뒤 다시 확인하세요.',
      },
      {
        error: 'timeout: The status check did not answer in 20000 ms',
        raw: '20000',
        en: 'The Codex program did not answer in time. Check again in a moment.',
        ko: 'Codex 프로그램이 제때 응답하지 않았습니다. 잠시 뒤 다시 확인하세요.',
      },
      {
        error: 'failed: spawn C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd ENOENT',
        raw: 'ENOENT',
        en: 'Something went wrong while checking Codex. Check again.',
        ko: 'Codex 연결을 확인하는 중에 문제가 생겼습니다. 다시 확인해 보세요.',
      },
    ]
    for (const c of cases) {
      for (const lang of ['en', 'ko'] as const) {
        const props = { status: status('codex', 'error', { error: c.error }), lang }
        act(() => root.render(createElement(AiSubscriptionCard, { ...props, ...cardActions() })))
        expect(host.querySelector('.ai-sub-detail')!.textContent).toBe(c[lang])
        expect(host.textContent).not.toContain(c.raw)
        expect(host.textContent).not.toMatch(/needs-update|timeout:|failed:|spawn|AppData/)
        expect(actionsShown()).toEqual(['recheck'])
      }
    }
  })

  it('error: a status text of an unknown shape is still not shown', () => {
    render(status('claude-code', 'error', { error: 'Error: EACCES C:\\Program Files\\claude.exe' }))
    expect(host.querySelector('.ai-sub-detail')!.textContent).toBe(
      'Something went wrong while checking Claude. Check again.',
    )
    expect(host.textContent).not.toContain('EACCES')
  })

  it('marks the provider with the neutral AI glyph, never a vendor logo', () => {
    render(status('codex', 'ready'))
    expect(host.querySelectorAll('.ai-sub-card-mark svg')).toHaveLength(1)
    expect(host.querySelector('.gs-provider-logo')).toBeNull()
  })

  it('a browser sign-in under way: says where, and the link to the window signs in again', () => {
    const actions = render(status('claude-code', 'signed-out', { signingIn: 'browser' }))
    expect(statusText()).toBe(en.cardSigningIn)
    expect(notes()).toEqual([
      'Sign in to your Anthropic account in the browser that opened and allow access. It connects by itself when you are done.',
    ])
    expect(actionsShown()).toEqual(['login-window'])
    const link = host.querySelector<HTMLButtonElement>('[data-action="login-window"]')!
    expect(link.className).toBe('ai-sub-link')
    click('[data-action="login-window"]')
    expect(actions.onLogin).toHaveBeenCalledExactlyOnceWith('claude-code')
  })

  it('a browser sign-in that goes on too long offers the window as a button, and says why', () => {
    vi.useFakeTimers()
    try {
      const actions = render(status('claude-code', 'signed-out', { signingIn: 'browser' }))
      expect(host.querySelector('[data-action="login-window"]')!.className).toBe('ai-sub-link')
      act(() => vi.advanceTimersByTime(AI_SIGNING_IN_STALLED_MS))
      expect(notes()).toHaveLength(2)
      expect(notes()[1]).toBe(en.signingInStalledNote)
      const button = host.querySelector<HTMLButtonElement>('[data-action="login-window"]')!
      expect(button.className).toBe('ai-sub-btn primary')
      expect(button.textContent).toBe(en.actionLoginWindowOpen)
      click('[data-action="login-window"]')
      expect(actions.onLogin).toHaveBeenCalledExactlyOnceWith('claude-code')
    } finally {
      vi.useRealTimers()
    }
  })

  it('a sign-in under way can be called off when the host can end it', () => {
    const onCancelLogin = vi.fn()
    render(status('codex', 'signed-out', { signingIn: 'window' }), {
      ...cardActions(),
      onCancelLogin,
    })
    expect(actionsShown()).toEqual(['cancel-login'])
    expect(host.querySelector('[data-action="cancel-login"]')!.className).toBe('ai-sub-link')
    click('[data-action="cancel-login"]')
    expect(onCancelLogin).toHaveBeenCalledExactlyOnceWith('codex')
  })

  it('a program below the floor offers the official update first', () => {
    const onUpdate = vi.fn()
    const actions = render(
      status('codex', 'error', { version: '0.1.0', error: 'needs-update: too old' }),
      { ...cardActions(), onUpdate },
    )
    expect(actionsShown()).toEqual(['update', 'recheck'])
    expect(notes()).toEqual([
      "OpenAI's official update runs in a new window when you press it. When it has finished there, come back here.",
    ])
    const button = host.querySelector<HTMLButtonElement>('[data-action="update"]')!
    expect(button.className).toBe('ai-sub-btn primary')
    expect(button.textContent).toBe(en.actionUpdate)
    click('[data-action="update"]')
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('codex')
    expect(actions.onRecheck).not.toHaveBeenCalled()
  })

  it('the window open for a code: says what to do there, nothing to press', () => {
    render(status('codex', 'signed-out', { signingIn: 'window' }))
    expect(statusText()).toBe(en.cardSigningIn)
    expect(notes()).toEqual([
      'Follow the guide at the top of the sign-in window that just opened. Sign in on the OpenAI page that opened in your browser: the window then closes and you are connected. A sign-in page that was open before no longer works; close it.',
    ])
    expect(actionsShown()).toEqual([])
  })

  it('keeps the buttons inert while an action is in flight', () => {
    const actions = cardActions()
    act(() =>
      root.render(
        createElement(AiSubscriptionCard, {
          status: status('codex', 'not-installed'),
          lang: 'en',
          disabled: true,
          ...actions,
        }),
      ),
    )
    expect(host.querySelector<HTMLButtonElement>('[data-action="install"]')!.disabled).toBe(true)
    // reading the instructions is always possible
    expect(host.querySelector<HTMLButtonElement>('[data-action="install-help"]')!.disabled).toBe(
      false,
    )
  })

  it('renders in the ui language', () => {
    act(() =>
      root.render(
        createElement(AiSubscriptionCard, {
          status: status('codex', 'metered'),
          lang: 'ko',
          ...cardActions(),
        }),
      ),
    )
    expect(host.querySelector('[data-action="accept-metered"]')!.textContent).toBe('그래도 사용')
    expect(notes()[0]).toBe('구독이 아니라 쓴 만큼 요금이 나갑니다.')
  })

  describe('the account and its actions (Settings only)', () => {
    const signedIn = status('claude-code', 'ready', {
      planName: 'max',
      account: 'user@example.com',
    })
    const accountActions = () => ({ onSwitchAccount: vi.fn(), onLogout: vi.fn() })
    const accountLine = () => host.querySelector('.ai-sub-account')?.textContent

    it('shows neither on a card that was not asked to: an AI panel never names the account', () => {
      render(signedIn)
      expect(accountLine()).toBeUndefined()
      expect(statusText()).toBe('Connected · max')
      expect(actionsShown()).toEqual([])
      expect(host.textContent).not.toContain('user@example.com')
    })

    it('shows the account next to the plan name when asked', () => {
      act(() =>
        root.render(
          createElement(AiSubscriptionCard, {
            status: signedIn,
            lang: 'en',
            showAccount: true,
            ...cardActions(),
          }),
        ),
      )
      expect(accountLine()).toBe('user@example.com · max')
      expect(statusText()).toBe('Connected')
      // showing the account alone offers no action
      expect(actionsShown()).toEqual([])

      act(() =>
        root.render(
          createElement(AiSubscriptionCard, {
            status: status('codex', 'metered', { account: 'user@example.com' }),
            lang: 'en',
            showAccount: true,
            ...cardActions(),
          }),
        ),
      )
      expect(accountLine()).toBe('user@example.com')
    })

    it('offers the two account actions when their handlers are given, neither as the primary button', () => {
      const actions = { ...cardActions(), ...accountActions() }
      act(() =>
        root.render(
          createElement(AiSubscriptionCard, {
            status: signedIn,
            lang: 'en',
            showAccount: true,
            ...actions,
          }),
        ),
      )
      expect(actionsShown()).toEqual(['switch-account', 'logout'])
      const switchButton = host.querySelector<HTMLButtonElement>('[data-action="switch-account"]')!
      const logoutButton = host.querySelector<HTMLButtonElement>('[data-action="logout"]')!
      expect(switchButton.textContent).toBe('Sign in with another account')
      expect(logoutButton.textContent).toBe('Sign out')
      expect(switchButton.classList.contains('primary')).toBe(false)
      expect(logoutButton.classList.contains('primary')).toBe(false)
      click('[data-action="switch-account"]')
      expect(actions.onSwitchAccount).toHaveBeenCalledExactlyOnceWith('claude-code')
      click('[data-action="logout"]')
      expect(actions.onLogout).toHaveBeenCalledExactlyOnceWith('claude-code')
      // the card itself runs nothing else: asking first is the caller's part
      expect(actions.onLogin).not.toHaveBeenCalled()
    })

    it('words them in Korean', () => {
      act(() =>
        root.render(
          createElement(AiSubscriptionCard, {
            status: signedIn,
            lang: 'ko',
            ...cardActions(),
            ...accountActions(),
          }),
        ),
      )
      expect(host.querySelector('[data-action="switch-account"]')!.textContent).toBe(
        '다른 계정으로 로그인',
      )
      expect(host.querySelector('[data-action="logout"]')!.textContent).toBe('로그아웃')
    })

    it('keeps the account actions inert while an action is in flight', () => {
      act(() =>
        root.render(
          createElement(AiSubscriptionCard, {
            status: signedIn,
            lang: 'en',
            disabled: true,
            ...cardActions(),
            ...accountActions(),
          }),
        ),
      )
      expect(host.querySelector<HTMLButtonElement>('[data-action="logout"]')!.disabled).toBe(true)
    })

    it('a compact card shows neither, whatever it is given', () => {
      act(() =>
        root.render(
          createElement(AiSubscriptionCard, {
            status: signedIn,
            lang: 'en',
            compact: true,
            showAccount: true,
            ...cardActions(),
            ...accountActions(),
          }),
        ),
      )
      expect(accountLine()).toBeUndefined()
      expect(actionsShown()).toEqual([])
      expect(host.textContent).not.toContain('user@example.com')
    })
  })
})

describe('AiConnectPrompt', () => {
  const render = (
    settings: AiSettings,
    statuses: AiSubscriptionStatuses,
    extra: {
      onOpenSettings?: () => void
      onOpenConnectHelp?: (path: 'claude-code' | 'codex' | 'free' | null) => void
    } = {},
  ) => {
    const actions = cardActions()
    act(() =>
      root.render(
        createElement(AiConnectPrompt, {
          choice: selectAiProvider(settings, statuses),
          statuses,
          lang: 'en',
          ...actions,
          ...extra,
        }),
      ),
    )
    return actions
  }
  const cards = () =>
    [...host.querySelectorAll<HTMLElement>('.ai-sub-card')].map((el) => [
      el.dataset.provider,
      el.dataset.state,
    ])

  it('renders nothing once a provider can run', () => {
    render(defaultAiSettings(), {
      'claude-code': status('claude-code', 'signed-out'),
      codex: status('codex', 'ready'),
    })
    expect(host.innerHTML).toBe('')
  })

  const paths = () =>
    [...host.querySelectorAll<HTMLElement>('.ai-sub-guide-path')].map((el) => [
      el.dataset.path,
      el.querySelector('.ai-sub-guide-badge')?.textContent ?? null,
    ])
  const steps = () =>
    [...host.querySelectorAll<HTMLElement>('.ai-sub-guide-step')].map(
      (el) =>
        `${el.dataset.step}${el.dataset.done ? ':done' : ''}${el.getAttribute('aria-current') ? ':current' : ''}`,
    )

  it('asks which AI the user has before showing any card', () => {
    render(defaultAiSettings(), {
      'claude-code': status('claude-code', 'signed-out'),
      codex: status('codex', 'not-installed'),
    })
    expect(host.querySelector('.ai-sub-prompt-title')!.textContent).toBe(en.connectTitle)
    expect(host.querySelector('.ai-sub-prompt-body')!.textContent).toBe(en.connectBody)
    expect(host.querySelector('.ai-sub-guide-question')!.textContent).toBe(en.guideQuestion)
    // what is already there shows next to each answer
    expect(paths()).toEqual([
      ['claude-code', en.guideBadgeInstalled],
      ['codex', null],
      ['free', null],
    ])
    expect(host.textContent).toContain(en.guidePathCodexTitle)
    expect(cards()).toEqual([])
  })

  it('lays open the path picked: its need, its steps and its one card', () => {
    const actions = render(defaultAiSettings(), {
      'claude-code': status('claude-code', 'signed-out'),
      codex: status('codex', 'not-installed'),
    })
    click('[data-path="claude-code"]')
    expect(host.querySelector('.ai-sub-guide-need')!.textContent).toBe(en.guidePathClaudeBody)
    expect(steps()).toEqual(['install:done', 'login:current', 'ready'])
    expect(cards()).toEqual([['claude-code', 'signed-out']])
    click('[data-provider="claude-code"] [data-action="login"]')
    expect(actions.onLogin).toHaveBeenCalledExactlyOnceWith('claude-code')
    // another way: back to the question, then the other subscription
    click('[data-action="guide-back"]')
    expect(cards()).toEqual([])
    click('[data-path="codex"]')
    expect(steps()).toEqual(['install:current', 'login', 'ready'])
    click('[data-provider="codex"] [data-action="install"]')
    expect(actions.onInstall).toHaveBeenCalledExactlyOnceWith('codex')
  })

  it('a sign-in under way opens its own path, and "another way" still asks again', () => {
    render(defaultAiSettings(), {
      'claude-code': status('claude-code', 'not-installed'),
      codex: status('codex', 'signed-out', { signingIn: 'browser' }),
    })
    expect(cards()).toEqual([['codex', 'signed-out']])
    expect(steps()).toEqual(['install:done', 'login:current', 'ready'])
    click('[data-action="guide-back"]')
    expect(host.querySelector('.ai-sub-guide-question')).not.toBeNull()
    expect(paths()[1]).toEqual(['codex', en.cardSigningIn])
  })

  it('the free path points to the free connections in Settings', () => {
    const onOpenSettings = vi.fn()
    render(
      defaultAiSettings(),
      {
        'claude-code': status('claude-code', 'not-installed'),
        codex: status('codex', 'signed-out'),
      },
      { onOpenSettings },
    )
    click('[data-path="free"]')
    expect(host.querySelector('.ai-sub-guide-need')!.textContent).toBe(en.guidePathFreeBody)
    expect(cards()).toEqual([])
    click('[data-action="connect-free"]')
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('copies what a helper needs, and nothing personal', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(defaultAiSettings(), {
      'claude-code': status('claude-code', 'error', {
        version: '2.1.10',
        error: 'needs-update: C:\\Users\\me\\claude.exe is too old',
      }),
      codex: status('codex', 'metered', { account: 'me@example.com', version: '0.30.0' }),
    })
    expect(host.querySelector('.ai-sub-guide-info .ai-sub-note')!.textContent).toBe(
      en.guideInfoHint,
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-action="copy-info"]')!.click(),
    )
    const text = writeText.mock.calls[0]![0]
    expect(text).toContain('claude-code: state=error error=needs-update version=2.1.10')
    expect(text).toContain('codex: state=metered version=0.30.0 accepted=false')
    expect(text).not.toContain('me@example.com')
    expect(text).not.toContain('Users')
    expect(host.querySelector('[data-action="copy-info"]')!.textContent).toBe(en.copyInfoDone)
  })

  it('links to the step-by-step help at the path the guide shows, while nothing is connected', () => {
    const onOpenConnectHelp = vi.fn()
    const statuses: AiSubscriptionStatuses = {
      'claude-code': status('claude-code', 'not-installed'),
      codex: status('codex', 'signed-out'),
    }
    render(defaultAiSettings(), statuses, { onOpenConnectHelp })
    expect(host.querySelector('[data-action="connect-help"]')!.textContent).toBe(
      en.actionConnectHelp,
    )
    click('[data-action="connect-help"]')
    expect(onOpenConnectHelp).toHaveBeenLastCalledWith(null)
    click('[data-path="codex"]')
    click('[data-action="connect-help"]')
    expect(onOpenConnectHelp).toHaveBeenLastCalledWith('codex')
    // a host that cannot open it gets no link
    render(defaultAiSettings(), statuses)
    expect(host.querySelector('[data-action="connect-help"]')).toBeNull()
  })

  it('offers no free way in for a selected provider that cannot run, or without a settings page', () => {
    render(
      { ...defaultAiSettings(), provider: 'codex' },
      { codex: status('codex', 'signed-out') },
      { onOpenSettings: vi.fn() },
    )
    expect(host.querySelector('[data-action="connect-free"]')).toBeNull()
    render(defaultAiSettings(), { codex: status('codex', 'signed-out') })
    expect(host.querySelector('[data-action="connect-free"]')).toBeNull()
  })

  it('shows a provider that has not reported yet as checking', () => {
    render(defaultAiSettings(), {})
    expect(paths()).toEqual([
      ['claude-code', null],
      ['codex', null],
      ['free', null],
    ])
    click('[data-path="codex"]')
    expect(cards()).toEqual([['codex', 'checking']])
    // no step is the current one until the state is known
    expect(steps()).toEqual(['install', 'login', 'ready'])
  })

  it('shows only the selected subscription when that one cannot run', () => {
    render(
      { ...defaultAiSettings(), provider: 'codex' },
      { 'claude-code': status('claude-code', 'ready'), codex: status('codex', 'metered') },
    )
    expect(host.querySelector('.ai-sub-prompt-title')!.textContent).toBe(
      'The Codex connection cannot be used right now',
    )
    expect(cards()).toEqual([['codex', 'metered']])
    expect(actionsShown()).toEqual(['accept-metered'])
  })

  it('never names the account and never offers the account actions', () => {
    const statuses = {
      codex: status('codex', 'metered', { account: 'user@example.com' }),
    }
    act(() =>
      root.render(
        createElement(AiConnectPrompt, {
          choice: selectAiProvider({ ...defaultAiSettings(), provider: 'codex' }, statuses),
          statuses,
          lang: 'en',
          ...cardActions(),
          // even a caller that passes them along does not get them in a panel
          ...({ showAccount: true, onLogout: vi.fn(), onSwitchAccount: vi.fn() } as object),
        }),
      ),
    )
    expect(cards()).toEqual([['codex', 'metered']])
    expect(actionsShown()).toEqual(['accept-metered'])
    expect(host.textContent).not.toContain('user@example.com')
  })

  it('sends an unfinished key provider to the settings page', () => {
    const onOpenSettings = vi.fn()
    render({ ...defaultAiSettings(), provider: 'gemini' }, {}, { onOpenSettings })
    expect(host.querySelector('.ai-sub-prompt-body')!.textContent).toBe(
      'The Gemini setup is not finished. Complete it in Settings, or choose another AI.',
    )
    expect(cards()).toEqual([])
    click('[data-action="open-settings"]')
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })
})

describe('AiConnectPrompt attention', () => {
  const notConnected = { 'claude-code': status('claude-code', 'signed-out') }
  const prompt = (statuses: AiSubscriptionStatuses, attention?: number) =>
    createElement(AiConnectPrompt, {
      choice: selectAiProvider(defaultAiSettings(), statuses),
      statuses,
      lang: 'en',
      attention,
      ...cardActions(),
    })
  let scrolled: Element[]
  beforeEach(() => {
    scrolled = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this)
    }
  })
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it('stays where it is until a send was answered by it', () => {
    act(() => root.render(prompt(notConnected)))
    act(() => root.render(prompt(notConnected, 0)))
    expect(scrolled).toEqual([])
  })

  it('scrolls itself into view each time a send was answered by it', () => {
    act(() => root.render(prompt(notConnected, 0)))
    act(() => root.render(prompt(notConnected, 1)))
    expect(scrolled).toEqual([host.querySelector('.ai-sub-prompt')])
    // an unrelated re-render does not scroll again
    act(() => root.render(prompt(notConnected, 1)))
    expect(scrolled).toHaveLength(1)
    act(() => root.render(prompt(notConnected, 2)))
    expect(scrolled).toHaveLength(2)
  })

  it('scrolls when it appears for a send made just before', () => {
    const ready = { 'claude-code': status('claude-code', 'ready') }
    act(() => root.render(prompt(ready, 1)))
    expect(host.querySelector('.ai-sub-prompt')).toBeNull()
    expect(scrolled).toEqual([])
    act(() => root.render(prompt(notConnected, 1)))
    expect(scrolled).toEqual([host.querySelector('.ai-sub-prompt')])
  })

  it('does not fail where the host cannot scroll', () => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    expect(() => act(() => root.render(prompt(notConnected, 1)))).not.toThrow()
  })
})

describe('AiBlockedNotice', () => {
  const now = new Date(2026, 9, 13, 12, 0).getTime()
  const resetsAt = new Date(2026, 9, 13, 17, 10).getTime()
  const both: AiSubscriptionStatuses = {
    'claude-code': status('claude-code', 'ready'),
    codex: status('codex', 'ready'),
  }
  const render = (props: Partial<Parameters<typeof AiBlockedNotice>[0]>) => {
    const onContinueWith = vi.fn()
    act(() =>
      root.render(
        createElement(AiBlockedNotice, {
          kind: 'rate-limit',
          settings: defaultAiSettings(),
          statuses: {},
          lang: 'en',
          onContinueWith,
          ...props,
        }),
      ),
    )
    return onContinueWith
  }
  const reason = () => host.querySelector('.ai-sub-blocked-reason')?.textContent
  const button = () => host.querySelector<HTMLButtonElement>('[data-action="continue-with"]')

  it('gives the reason with the reset time and offers the other ready subscription', () => {
    vi.spyOn(Date, 'now').mockReturnValue(now)
    const onContinueWith = render({ provider: 'claude-code', resetsAt, statuses: both })
    expect(reason()).toBe(
      `The Claude subscription limit has been used up. It resets at ${formatAiResetTime('en', resetsAt, now)}.`,
    )
    expect(button()!.textContent).toBe('Continue with Codex')
    expect(host.querySelector('[data-note="continueMeteredNote"]')).toBeNull()
    click('[data-action="continue-with"]')
    expect(onContinueWith).toHaveBeenCalledExactlyOnceWith('codex')
  })

  it('adds a cost note when the only other connection is an accepted metered login', () => {
    const settings = defaultAiSettings()
    settings.meteredAccepted = { codex: true }
    const onContinueWith = render({
      kind: 'signed-out',
      provider: 'claude-code',
      settings,
      statuses: {
        'claude-code': status('claude-code', 'signed-out'),
        codex: status('codex', 'metered', { meteredAccepted: true }),
      },
    })
    expect(reason()).toBe(en.errSignedOut.replace('{provider}', 'Claude'))
    expect(button()!.textContent).toBe('Continue with Codex')
    expect(host.querySelector('[data-note="continueMeteredNote"]')!.textContent).toBe(
      'The Codex connection is not a subscription: continuing is charged by usage.',
    )
    click('[data-action="continue-with"]')
    expect(onContinueWith).toHaveBeenCalledExactlyOnceWith('codex')
  })

  it('offers no button when only key providers could take over', () => {
    const settings = defaultAiSettings()
    settings.providers.anthropic = { apiKey: 'k', model: 'claude-next' }
    settings.providers.openai = { apiKey: 'k', model: 'gpt-x' }
    render({
      provider: 'claude-code',
      settings,
      statuses: { 'claude-code': status('claude-code', 'ready') },
    })
    expect(reason()).toBe('The Claude subscription limit has been used up.')
    expect(button()).toBeNull()
    expect(host.textContent).not.toMatch(/Continue with/)
  })

  it('offers no button for a metered login the user has not accepted', () => {
    render({
      provider: 'claude-code',
      statuses: {
        'claude-code': status('claude-code', 'ready'),
        codex: status('codex', 'metered'),
      },
    })
    expect(button()).toBeNull()
  })

  it('words each blocking kind', () => {
    const cases = [
      ['not-installed', 'codex', en.errNotInstalled.replace('{provider}', 'Codex')],
      ['needs-update', 'codex', en.errNeedsUpdate.replace('{provider}', 'Codex')],
      ['metered-not-accepted', 'codex', en.errMeteredNotAccepted.replace('{provider}', 'Codex')],
      ['unsafe-tools', undefined, en.errUnsafeTools.replace('{provider}', 'Claude')],
      ['not-connected', undefined, en.errNotConnected],
    ] as const
    for (const [kind, provider, text] of cases) {
      render({ kind, provider })
      expect(reason(), kind).toBe(text)
      expect(host.querySelector('.ai-sub-blocked')!.getAttribute('data-kind')).toBe(kind)
    }
  })

  it('treats a tool-carrying Claude start as blocked on Claude', () => {
    render({ kind: 'unsafe-tools', statuses: both })
    expect(button()!.dataset.provider).toBe('codex')
  })

  it('shows the carried message for a transient failure, without a switch button', () => {
    render({ kind: 'network', message: 'Network error', provider: 'claude-code', statuses: both })
    expect(reason()).toBe('Network error')
    expect(button()).toBeNull()
  })
})

describe('AiSubscriptionUsageLine', () => {
  const now = new Date(2026, 9, 13, 12, 0).getTime()
  const resetsAt = new Date(2026, 9, 13, 17, 10).getTime()
  const time = formatAiResetTime('en', resetsAt, now)

  it('renders nothing below the threshold', () => {
    act(() =>
      root.render(
        createElement(AiSubscriptionUsageLine, {
          usage: [{ provider: 'claude-code', window: 'five_hour', utilization: 0.5, resetsAt }],
          lang: 'en',
          now,
        }),
      ),
    )
    expect(host.innerHTML).toBe('')
  })

  it('shows "N% used · resets at <time>" for each window over it', () => {
    act(() =>
      root.render(
        createElement(AiSubscriptionUsageLine, {
          usage: [
            { provider: 'claude-code', window: 'five_hour', utilization: 0.86, resetsAt },
            { provider: 'claude-code', window: 'seven_day', utilization: 0.08, resetsAt },
          ],
          lang: 'en',
          now,
        }),
      ),
    )
    const items = [...host.querySelectorAll<HTMLElement>('.ai-subscription-usage-item')]
    expect(items.map((el) => el.textContent)).toEqual([`86% used · resets at ${time}`])
    expect(items[0]!.title).toBe('Claude · 5-hour limit')
  })

  it('follows a tuned threshold', () => {
    act(() =>
      root.render(
        createElement(AiSubscriptionUsageLine, {
          usage: [{ provider: 'codex', window: 'seven_day', utilization: 0.5, resetsAt }],
          lang: 'en',
          threshold: 0.4,
          now,
        }),
      ),
    )
    expect(host.querySelector('.ai-subscription-usage-item')!.textContent).toBe(
      `50% used · resets at ${time}`,
    )
  })
})

describe('notices', () => {
  const lines = () =>
    [...host.querySelectorAll('.ai-sub-first-list li')].map((el) => el.textContent)

  it('first connection: where content goes and who decides about training', () => {
    act(() => root.render(createElement(AiFirstConnectionNotice, { lang: 'en' })))
    expect(host.querySelector('.ai-sub-first-title')!.textContent).toBe(en.noticeTitle)
    expect(lines()).toEqual([en.noticeSend, en.noticeTraining])
    expect(host.querySelector('button')).toBeNull()
  })

  it('first connection: adds the Codex history sentence only when asked to', () => {
    const onAcknowledge = vi.fn()
    act(() =>
      root.render(
        createElement(AiFirstConnectionNotice, {
          lang: 'en',
          codexKeepsHistory: true,
          onAcknowledge,
        }),
      ),
    )
    expect(lines()).toEqual([en.noticeSend, en.noticeTraining, en.noticeCodexHistory])
    click('button')
    expect(onAcknowledge).toHaveBeenCalledOnce()
  })

  it('first connection: adds the PDF whole-document sentence only when asked to', () => {
    act(() =>
      root.render(
        createElement(AiFirstConnectionNotice, {
          lang: 'en',
          codexKeepsHistory: true,
          sendsWholeDocument: true,
        }),
      ),
    )
    expect(lines()).toEqual([
      en.noticeSend,
      en.noticeTraining,
      en.noticePdfWholeDocument,
      en.noticeCodexHistory,
    ])
  })

  it('Codex: the one line about OpenAI’s recommendation', () => {
    act(() => root.render(createElement(AiCodexNotice, { lang: 'en' })))
    expect(host.textContent).toBe(
      'Using a Codex subscription inside an app is not a method officially recommended by OpenAI.',
    )
    act(() => root.render(createElement(AiCodexNotice, { lang: 'ko' })))
    expect(host.textContent).toBe(
      '앱에서 Codex 구독을 쓰는 것은 OpenAI가 공식 권장하는 방식이 아닙니다.',
    )
  })

  it('metered: the cost warning, with its meaning on request', () => {
    act(() => root.render(createElement(AiMeteredWarning, { lang: 'en' })))
    expect(host.textContent).toBe(en.meteredWarning)
    act(() => root.render(createElement(AiMeteredWarning, { lang: 'en', explain: true })))
    expect(host.textContent).toBe(`${en.meteredWarning} ${en.meteredMeaning}`)
  })

  it('truncated input: says so and can be dismissed', () => {
    const onDismiss = vi.fn()
    act(() => root.render(createElement(AiInputTruncatedNotice, { lang: 'en', onDismiss })))
    expect(host.querySelector('.ai-sub-notice-text')!.textContent).toBe(en.truncatedNotice)
    click('button')
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})

describe('aiModelPopoverStyle', () => {
  const viewport = { width: 1024, height: 768 }

  it('opens below a chip near the top of a confirmation dialog', () => {
    const style = aiModelPopoverStyle({ left: 300, top: 120, bottom: 144 }, viewport)
    expect(style).toMatchObject({ left: 300, top: 150, maxHeight: 420 })
    expect(style.bottom).toBeUndefined()
  })

  it('opens above a chip at the bottom of the composer', () => {
    const style = aiModelPopoverStyle({ left: 300, top: 700, bottom: 724 }, viewport)
    expect(style).toMatchObject({ left: 300, bottom: 74, maxHeight: 420 })
    expect(style.top).toBeUndefined()
  })

  it('keeps the list inside the window and shortens it on a low viewport', () => {
    const clamped = aiModelPopoverStyle({ left: 900, top: 120, bottom: 144 }, viewport)
    expect(clamped.left).toBe(756)
    const low = aiModelPopoverStyle({ left: 10, top: 10, bottom: 34 }, { width: 1024, height: 200 })
    expect(low).toMatchObject({ top: 40, maxHeight: 158 })
  })
})

describe('AiModelPicker under the subscription contract', () => {
  const ready: AiSubscriptionStatuses = {
    'claude-code': status('claude-code', 'ready'),
    codex: status('codex', 'ready'),
  }
  async function mount(
    settings: AiSettings,
    subscriptionStatuses?: AiSubscriptionStatuses,
    showLabel = false,
  ) {
    const setSettings = vi.fn<(next: AiSettings) => Promise<void>>(async () => {})
    const bridge: AiModelPickerBridge = {
      getSettings: async () => settings,
      setSettings,
    }
    await act(async () => {
      root.render(
        createElement(AiModelPicker, { bridge, lang: 'en', subscriptionStatuses, showLabel }),
      )
    })
    return setSettings
  }
  const chip = () => host.querySelector('.ai-model-chip-text')!.textContent
  const heads = () =>
    [...host.querySelectorAll('.ai-model-group-head')].map((el) =>
      [...el.querySelectorAll(':scope > span')].map((span) => span.textContent).filter(Boolean),
    )
  const open = () => click('.ai-model-chip')

  it('shows a visible model label when a confirmation dialog asks for one', async () => {
    await mount(defaultAiSettings(), ready, true)
    expect(host.querySelector('.ai-model-picker-label')?.textContent).toBe('Model')
    expect(host.querySelector('.ai-model-chip')?.getAttribute('aria-label')).toContain('Model:')
  })

  it('shows what the automatic selection resolves to and lists subscriptions first', async () => {
    const settings = defaultAiSettings()
    settings.providers.anthropic = { apiKey: 'k', model: 'claude-next' }
    settings.providers['claude-code'] = { apiKey: '', model: 'sonnet' }
    await mount(settings, ready)
    expect(chip()).toBe('Automatic · Claude')
    open()
    const auto = host.querySelector('.ai-model-auto')!
    expect(auto.textContent).toBe('Automatic · Claude')
    // the automatic entry is the selection, whatever model the provider under it has stored
    expect(
      [...host.querySelectorAll('.ai-model-item[aria-selected="true"]')].map(
        (el) => el.textContent,
      ),
    ).toEqual(['Automatic · Claude'])
    // the same vendor's subscription and API key are told apart in text
    expect(heads()).toEqual([['Claude', 'Subscription'], ['Codex', 'Subscription'], ['Claude']])
    // subscription groups carry the neutral mark; only the key provider keeps its own
    const marks = [...host.querySelectorAll('.ai-model-group-head .gs-provider-logo')]
    expect(marks.map((el) => el.querySelector('svg')!.getAttribute('viewBox'))).toHaveLength(3)
    expect(marks[0]!.innerHTML).toBe(marks[1]!.innerHTML)
    expect(marks[2]!.innerHTML).not.toBe(marks[0]!.innerHTML)
  })

  it('picking a model yields the provider selection and the model', async () => {
    const setSettings = await mount(defaultAiSettings(), ready)
    open()
    const rows = [...host.querySelectorAll<HTMLButtonElement>('.ai-model-item')]
    expect(rows.map((el) => el.textContent)).toEqual([
      'Automatic · Claude',
      'Default model',
      'opus',
      'sonnet',
      'haiku',
      'Default model',
    ])
    await act(async () => rows[3]!.click())
    expect(setSettings).toHaveBeenCalledOnce()
    const saved = setSettings.mock.calls[0]![0]
    expect(saved.provider).toBe('claude-code')
    expect(saved.providers['claude-code'].model).toBe('sonnet')
    expect(chip()).toBe('sonnet')
  })

  it('writes a pick onto the settings stored now, not onto the copy it last read', async () => {
    const read = defaultAiSettings()
    // the settings page stored a key and the acknowledged notice after the picker read its copy
    const stored = defaultAiSettings()
    stored.providers.openai = { apiKey: 'stored-later', model: 'gpt-later' }
    stored.subscriptionNoticeSeen = true
    let current = read
    const setSettings = vi.fn<(next: AiSettings) => Promise<void>>(async () => {})
    const bridge: AiModelPickerBridge = { getSettings: async () => current, setSettings }
    await act(async () => {
      root.render(createElement(AiModelPicker, { bridge, lang: 'en', subscriptionStatuses: ready }))
    })
    current = stored
    open()
    const rows = [...host.querySelectorAll<HTMLButtonElement>('.ai-model-item')]
    await act(async () => rows[3]!.click())

    expect(setSettings).toHaveBeenCalledOnce()
    const saved = setSettings.mock.calls[0]![0]
    expect(saved.provider).toBe('claude-code')
    expect(saved.providers['claude-code'].model).toBe('sonnet')
    expect(saved.providers.openai).toEqual({ apiKey: 'stored-later', model: 'gpt-later' })
    expect(saved.subscriptionNoticeSeen).toBe(true)
    expect(chip()).toBe('sonnet')
  })

  it('still shows and writes a pick when the stored settings cannot be read', async () => {
    let fail = false
    const setSettings = vi.fn<(next: AiSettings) => Promise<void>>(async () => {})
    const bridge: AiModelPickerBridge = {
      getSettings: async () => {
        if (fail) throw new Error('no handler')
        return defaultAiSettings()
      },
      setSettings,
    }
    await act(async () => {
      root.render(createElement(AiModelPicker, { bridge, lang: 'en', subscriptionStatuses: ready }))
    })
    fail = true
    open()
    const rows = [...host.querySelectorAll<HTMLButtonElement>('.ai-model-item')]
    await act(async () => rows[3]!.click())
    expect(setSettings).toHaveBeenCalledOnce()
    expect(setSettings.mock.calls[0]![0].provider).toBe('claude-code')
    expect(chip()).toBe('sonnet')
  })

  it('marks an accepted metered login as paid, in the list and on the chip', async () => {
    const settings = defaultAiSettings()
    settings.provider = 'claude-code'
    settings.meteredAccepted = { 'claude-code': true }
    await mount(settings, {
      'claude-code': status('claude-code', 'metered', { meteredAccepted: true }),
    })
    expect(chip()).toBe('Claude')
    expect(host.querySelector('.ai-model-chip .ai-model-cost')!.textContent).toBe('Paid')
    open()
    expect(heads()).toEqual([['Claude', 'Paid']])
    expect(host.querySelector('.ai-model-auto')).toBeNull()
  })

  it('says to connect while the selection cannot run', async () => {
    await mount(defaultAiSettings(), { 'claude-code': status('claude-code', 'signed-out') })
    expect(chip()).toBe('Connect AI')
    open()
    expect(host.querySelectorAll('.ai-model-item:not(.ai-model-manage)')).toHaveLength(0)
  })

  describe('with the model list the CLI gave', () => {
    const listed: AiSubscriptionStatuses = {
      'claude-code': status('claude-code', 'ready', {
        models: [
          { id: '', label: 'Default (recommended)', resolved: 'claude-opus-5-5', isDefault: true },
          { id: 'opus', label: 'Opus 5.5', resolved: 'claude-opus-5-5' },
          { id: 'fable', label: 'Fable 5.1', resolved: 'claude-fable-5-1' },
        ],
      }),
      codex: status('codex', 'ready', {
        models: [
          { id: 'gpt-next-codex', label: 'GPT-Next-Codex', isDefault: true },
          { id: 'gpt-next', label: 'GPT-Next', resolved: 'gpt-next-2026-09-01' },
        ],
      }),
    }
    async function mountIn(lang: 'en' | 'ko', settings: AiSettings) {
      const setSettings = vi.fn<(next: AiSettings) => Promise<void>>(async () => {})
      const bridge: AiModelPickerBridge = { getSettings: async () => settings, setSettings }
      await act(async () => {
        root.render(createElement(AiModelPicker, { bridge, lang, subscriptionStatuses: listed }))
      })
      return setSettings
    }
    const picked = (provider: 'claude-code' | 'codex', model: string): AiSettings => {
      const settings = defaultAiSettings()
      settings.provider = provider
      settings.providers[provider] = { ...settings.providers[provider], model }
      return settings
    }
    /** each row as [name, concrete id]; the id is absent on a row that shows none */
    const rows = () =>
      [...host.querySelectorAll<HTMLElement>('.ai-model-item:not(.ai-model-manage)')].map((row) => {
        const id = row.querySelector('.ai-model-item-id')?.textContent
        const text = row.querySelector('.ai-model-item-text')!
        const name = [...text.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent)
          .join('')
          .trim()
        return id === undefined ? [name] : [name, id]
      })
    const tip = () => host.querySelector('.ai-model-chip')!.getAttribute('data-tip')

    it('lists each model by its display name with the concrete id beside it', async () => {
      await mountIn('en', defaultAiSettings())
      open()
      expect(rows()).toEqual([
        ['Automatic · Claude · Opus 5.5'],
        ['Default model · Opus 5.5', 'claude-opus-5-5'],
        ['Opus 5.5', 'claude-opus-5-5'],
        ['Fable 5.1', 'claude-fable-5-1'],
        ['Default model · GPT-Next-Codex', 'gpt-next-codex'],
        ['GPT-Next-Codex', 'gpt-next-codex'],
        ['GPT-Next', 'gpt-next-2026-09-01'],
      ])
      // the options keep their role, and the quieter id is part of the same option
      const options = [...host.querySelectorAll('.ai-model-pop [role="option"]')]
      expect(options).toHaveLength(7)
      expect(options[2]!.textContent).toBe('Opus 5.5 claude-opus-5-5')
    })

    it('shows the concrete model on the chip under the automatic selection', async () => {
      await mountIn('en', defaultAiSettings())
      // the footer is narrow: the chip names the model, the tooltip adds the provider and the id
      expect(chip()).toBe('Automatic · Opus 5.5')
      expect(tip()).toContain('Automatic · Claude · Opus 5.5')
      expect(tip()).toContain('claude-opus-5-5')
      await mountIn('ko', defaultAiSettings())
      expect(chip()).toBe('자동 · Opus 5.5')
      expect(tip()).toContain('자동 · Claude · Opus 5.5')
      // the model the provider under "automatic" has stored is the one named
      await mountIn('en', { ...picked('claude-code', 'fable'), provider: 'auto' })
      expect(chip()).toBe('Automatic · Fable 5.1')
    })

    it('shows the provider and the concrete model on the chip for an explicit selection', async () => {
      await mountIn('en', picked('claude-code', 'opus'))
      expect(chip()).toBe('Claude · Opus 5.5')
      expect(tip()).toContain('claude-opus-5-5')
      await mountIn('ko', picked('claude-code', ''))
      expect(chip()).toBe('Claude · Opus 5.5')
      await mountIn('ko', picked('codex', 'gpt-next'))
      expect(chip()).toBe('Codex · GPT-Next')
      expect(tip()).toContain('gpt-next-2026-09-01')
      // the whole text is in the tooltip, for a chip too narrow to show it
      expect(tip()).toContain('Codex · GPT-Next')
    })

    it('words the default entry in the ui language', async () => {
      await mountIn('ko', picked('claude-code', ''))
      open()
      expect(rows().slice(0, 2)).toEqual([
        ['자동 · Claude · Opus 5.5'],
        ['기본 모델 · Opus 5.5', 'claude-opus-5-5'],
      ])
    })

    it('still shows a stored selection the CLI does not list, by its id', async () => {
      await mountIn('en', picked('claude-code', 'claude-old-3'))
      expect(chip()).toBe('Claude · claude-old-3')
      open()
      expect(rows().slice(1, 4)).toEqual([
        ['Default model · Opus 5.5', 'claude-opus-5-5'],
        ['claude-old-3'],
        ['Opus 5.5', 'claude-opus-5-5'],
      ])
      const selected = [...host.querySelectorAll('.ai-model-item[aria-selected="true"]')]
      expect(selected.map((row) => row.textContent)).toEqual(['claude-old-3'])
    })

    it('stores the value the CLI takes, never the display name', async () => {
      const setSettings = await mountIn('en', defaultAiSettings())
      open()
      const fable = [...host.querySelectorAll<HTMLButtonElement>('.ai-model-item')].find((row) =>
        row.textContent!.startsWith('Fable 5.1'),
      )!
      await act(async () => fable.click())
      const saved = setSettings.mock.calls[0]![0]
      expect(saved.provider).toBe('claude-code')
      expect(saved.providers['claude-code'].model).toBe('fable')
      expect(JSON.stringify(saved)).not.toContain('Fable 5.1')
      expect(chip()).toBe('Claude · Fable 5.1')
    })

    it('stores the empty selection for the default entry', async () => {
      const setSettings = await mountIn('en', picked('claude-code', 'fable'))
      open()
      const entry = [...host.querySelectorAll<HTMLButtonElement>('.ai-model-item')].find((row) =>
        row.textContent!.startsWith('Default model · Opus 5.5'),
      )!
      await act(async () => entry.click())
      expect(setSettings.mock.calls[0]![0].providers['claude-code'].model).toBe('')
    })
  })

  describe('the Codex line', () => {
    const codexLine = () => [...host.querySelectorAll('.ai-sub-codex')].map((el) => el.textContent)

    it('is shown with the Codex subscription group, in that group', async () => {
      await mount(defaultAiSettings(), ready)
      // nothing is said before the list is open
      expect(codexLine()).toEqual([])
      open()
      expect(codexLine()).toEqual([en.codexNotice])
      const note = host.querySelector('.ai-sub-codex')!
      expect(note.classList.contains('compact')).toBe(true)
      const group = note.closest('.ai-model-group')!
      expect(group.querySelector('.ai-model-group-head')!.textContent).toContain('Codex')
      // it is a line of text, not something to pick
      expect(note.closest('.ai-model-item')).toBeNull()
      expect(note.getAttribute('role')).toBe('note')
    })

    it('follows the UI language', async () => {
      const bridge: AiModelPickerBridge = {
        getSettings: async () => defaultAiSettings(),
        setSettings: async () => {},
      }
      await act(async () => {
        root.render(
          createElement(AiModelPicker, { bridge, lang: 'ko', subscriptionStatuses: ready }),
        )
      })
      open()
      expect(codexLine()).toEqual([AI_SUBSCRIPTION_STRINGS.ko.codexNotice])
    })

    it('is shown for an accepted metered Codex login too', async () => {
      const settings = defaultAiSettings()
      settings.meteredAccepted = { codex: true }
      await mount(settings, { codex: status('codex', 'metered', { meteredAccepted: true }) })
      open()
      expect(heads()).toEqual([['Codex', 'Paid']])
      expect(codexLine()).toEqual([en.codexNotice])
    })

    it('is absent while Codex is not listed', async () => {
      await mount(defaultAiSettings(), {
        'claude-code': status('claude-code', 'ready'),
        codex: status('codex', 'signed-out'),
      })
      open()
      expect(heads()).toEqual([['Claude', 'Subscription']])
      expect(codexLine()).toEqual([])
    })

    it('is not shown for a key provider that merely carries the name', async () => {
      const settings = defaultAiSettings()
      settings.provider = 'custom'
      settings.customEndpoints = [
        { id: 'ep1', name: 'Codex', baseUrl: 'http://localhost:1234/v1', apiKey: '', model: 'm1' },
      ]
      settings.customEndpoint = 'ep1'
      await mount(settings, { 'claude-code': status('claude-code', 'ready') })
      open()
      expect(heads().flat()).toContain('Codex')
      expect(codexLine()).toEqual([])
    })

    it('is absent without subscription statuses, which list no subscription group', async () => {
      const settings = defaultAiSettings()
      settings.provider = 'codex'
      settings.providers.codex = { apiKey: '', model: 'gpt-next' }
      await mount(settings)
      open()
      expect(heads()).toEqual([])
      expect(codexLine()).toEqual([])
    })
  })

  it('lists only the key providers without subscription statuses', async () => {
    const settings = defaultAiSettings()
    settings.provider = 'anthropic'
    settings.providers.anthropic = { apiKey: 'k', model: 'claude-next' }
    const setSettings = await mount(settings)
    expect(chip()).toBe('claude-next')
    open()
    expect(heads()).toEqual([['Claude']])
    expect(host.querySelector('.ai-model-auto')).toBeNull()
    const rows = [...host.querySelectorAll<HTMLButtonElement>('.ai-model-item')]
    await act(async () => rows[1]!.click())
    expect(setSettings.mock.calls[0]![0].provider).toBe('anthropic')
  })
})
