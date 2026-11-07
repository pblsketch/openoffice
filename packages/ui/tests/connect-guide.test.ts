import { describe, expect, it } from 'vitest'
import type {
  AiSubscriptionProviderId,
  AiSubscriptionState,
  AiSubscriptionStatus,
} from '@genoffice/ai-provider'
import {
  aiConnectAlternatePath,
  aiConnectGuideView,
  aiConnectInfoText,
  aiConnectPathText,
  aiConnectStepsView,
} from '../src/connect-guide'

const status = (
  provider: AiSubscriptionProviderId,
  state: AiSubscriptionState,
  extra: Partial<AiSubscriptionStatus> = {},
): AiSubscriptionStatus => ({ provider, state, meteredAccepted: false, ...extra })

describe('aiConnectGuideView', () => {
  it('asks while nothing is under way or working, and names what is already there', () => {
    const view = aiConnectGuideView(
      {
        'claude-code': status('claude-code', 'signed-out'),
        codex: status('codex', 'error', { error: 'needs-update: too old' }),
      },
      null,
    )
    expect(view.open).toBeNull()
    expect(view.options).toEqual([
      {
        path: 'claude-code',
        titleKey: 'guidePathClaudeTitle',
        bodyKey: 'guidePathClaudeBody',
        badgeKey: 'guideBadgeInstalled',
      },
      // one ChatGPT answer: it connects directly, and a Codex that needs work is no badge of it
      { path: 'chatgpt', titleKey: 'guidePathCodexTitle', bodyKey: 'guidePathChatGptBody' },
      { path: 'free', titleKey: 'guidePathFreeTitle', bodyKey: 'guidePathFreeBody' },
    ])
  })

  it('shows on the ChatGPT answer a connection made either way', () => {
    const answer = (statuses: Parameters<typeof aiConnectGuideView>[0]) =>
      aiConnectGuideView(statuses, 'ask').options.find((option) => option.path === 'chatgpt')
    expect(answer({ codex: status('codex', 'ready') })?.badgeKey).toBe('guideBadgeReady')
    expect(answer({ chatgpt: status('chatgpt', 'ready') })?.badgeKey).toBe('guideBadgeReady')
    expect(
      answer({ chatgpt: status('chatgpt', 'signed-out', { signingIn: 'browser' as const }) })
        ?.badgeKey,
    ).toBe('cardSigningIn')
    expect(answer({ chatgpt: status('chatgpt', 'signed-out') })?.badgeKey).toBeUndefined()
  })

  it('opens the Codex way when Codex already works, and offers each as the other way', () => {
    expect(aiConnectGuideView({ codex: status('codex', 'ready') }, null).open).toBe('codex')
    expect(aiConnectAlternatePath('chatgpt')).toBe('codex')
    expect(aiConnectAlternatePath('codex')).toBe('chatgpt')
    expect(aiConnectAlternatePath('claude-code')).toBeNull()
    expect(aiConnectPathText('codex').bodyKey).toBe('guidePathCodexBody')
  })

  it('has no install step for ChatGPT reached directly', () => {
    const steps = aiConnectStepsView(status('chatgpt', 'signed-out'))
    expect(steps.steps.map((step) => step.id)).toEqual(['login', 'ready'])
    expect(steps.current).toBe('login')
    expect(aiConnectStepsView(status('chatgpt', 'ready')).steps.every((step) => step.done)).toBe(
      true,
    )
  })

  it('opens by itself a sign-in under way, then a connection that works, then a free one', () => {
    const signingIn = {
      'claude-code': status('claude-code', 'ready'),
      codex: status('codex', 'signed-out', { signingIn: 'window' as const }),
    }
    expect(aiConnectGuideView(signingIn, null).open).toBe('codex')
    expect(aiConnectGuideView({ codex: status('codex', 'ready') }, null, true).open).toBe('codex')
    const free = aiConnectGuideView({ codex: status('codex', 'not-installed') }, null, true)
    expect(free.open).toBe('free')
    expect(free.options[2]!.badgeKey).toBe('guideBadgeReady')
  })

  it('the user’s own choice wins, and "ask" brings the question back over anything', () => {
    const statuses = { codex: status('codex', 'signed-out', { signingIn: 'browser' as const }) }
    expect(aiConnectGuideView(statuses, 'free').open).toBe('free')
    expect(aiConnectGuideView(statuses, 'ask').open).toBeNull()
  })
})

describe('aiConnectStepsView', () => {
  const at = (s: AiSubscriptionStatus) => {
    const view = aiConnectStepsView(s)
    return [view.current, view.steps.filter((step) => step.done).map((step) => step.id)]
  }

  it('places each state on install → sign in → connected', () => {
    expect(at(status('codex', 'checking'))).toEqual([null, []])
    expect(at(status('codex', 'not-installed'))).toEqual(['install', []])
    expect(at(status('codex', 'signed-out'))).toEqual(['login', ['install']])
    expect(at(status('codex', 'signed-out', { signingIn: 'browser' }))).toEqual([
      'login',
      ['install'],
    ])
    expect(at(status('codex', 'metered'))).toEqual(['login', ['install']])
    expect(at(status('codex', 'ready'))).toEqual(['ready', ['install', 'login', 'ready']])
  })

  it('a program turned off in this app is on no step, and its answer says so', () => {
    expect(at(status('claude-code', 'off'))).toEqual([null, []])
    const view = aiConnectGuideView({ 'claude-code': status('claude-code', 'off') }, null)
    expect(view.options[0]!.badgeKey).toBe('guideBadgeOff')
  })

  it('a program to update is back on the install step; another failure found the program', () => {
    expect(at(status('codex', 'error', { error: 'needs-update: too old' }))).toEqual([
      'install',
      [],
    ])
    expect(at(status('codex', 'error', { error: 'timeout: no answer' }))).toEqual([
      'login',
      ['install'],
    ])
  })
})

describe('aiConnectInfoText', () => {
  it('lists each provider, then the system and the app, on one line each', () => {
    expect(
      aiConnectInfoText(
        {
          'claude-code': status('claude-code', 'signed-out', {
            version: '2.1.250',
            signingIn: 'browser',
          }),
        },
        { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0)\n Electron/38' },
      ),
    ).toBe(
      [
        'claude-code: state=signed-out version=2.1.250 signing-in=browser',
        'chatgpt: state=signed-out',
        'codex: state=checking',
        'platform: Win32',
        'app: Mozilla/5.0 (Windows NT 10.0) Electron/38',
      ].join('\n'),
    )
  })

  it('says at which step the ChatGPT sign-in failed, in fixed names', () => {
    const text = aiConnectInfoText({
      chatgpt: status('chatgpt', 'signed-out', {
        loginUnfinished: true,
        loginFailure: {
          reason: 'denied',
          step: 'token-refused',
          httpStatus: 400,
          oauthError: 'invalid_grant',
        },
      }),
    })
    expect(text.split('\n')[1]).toBe(
      'chatgpt: state=signed-out login-failed=denied step=token-refused http=400 oauth-error=invalid_grant',
    )
    expect(
      aiConnectInfoText({
        chatgpt: status('chatgpt', 'signed-out', {
          loginUnfinished: true,
          loginFailure: { reason: 'no-plan', step: 'scope-missing' },
        }),
      }).split('\n')[1],
    ).toBe('chatgpt: state=signed-out login-failed=no-plan step=scope-missing')
  })

  it('reads the sign-in failure again, leaving out values of another shape', () => {
    const text = aiConnectInfoText({
      chatgpt: status('chatgpt', 'signed-out', {
        loginUnfinished: true,
        loginFailure: {
          reason: 'denied',
          step: 'callback-error token=abc' as never,
          httpStatus: 1e9,
          oauthError: 'code abc-123 was used',
        },
      }),
    })
    expect(text.split('\n')[1]).toBe('chatgpt: state=signed-out login-failed=denied')
    expect(
      aiConnectInfoText({
        chatgpt: status('chatgpt', 'signed-out', {
          loginUnfinished: true,
          loginFailure: { reason: 'something' as never },
        }),
      }).split('\n')[1],
    ).toBe('chatgpt: state=signed-out')
  })

  it('leaves out the account, the error text and a version that is not one', () => {
    const text = aiConnectInfoText({
      'claude-code': status('claude-code', 'ready', {
        account: 'me@example.com',
        planName: 'max',
        version: 'C:\\Users\\me\\claude.exe',
      }),
      codex: status('codex', 'error', { error: 'failed: spawn C:\\Users\\me\\codex.exe ENOENT' }),
    })
    expect(text).toBe(
      [
        'claude-code: state=ready',
        'chatgpt: state=signed-out',
        'codex: state=error error=failed',
      ].join('\n'),
    )
  })
})
