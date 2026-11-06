/**
 * The one reading of subscription IPC answers every renderer shares: a missing
 * handler, an older main or a half-filled object must read as "still checking"
 * or as a plain failure, never as a connection.
 */
import { describe, expect, it } from 'vitest'
import * as browser from '../src/browser'
import * as root from '../src/index'
import {
  checkingSubscriptionStatuses,
  isSubscriptionProviderId,
  subscriptionLaunchResultOf,
  subscriptionMeteredResultOf,
  subscriptionStatusMapOf,
} from '../src/subscription/contract'

const CHECKING = {
  'claude-code': { provider: 'claude-code', state: 'checking', meteredAccepted: false },
  chatgpt: { provider: 'chatgpt', state: 'checking', meteredAccepted: false },
  codex: { provider: 'codex', state: 'checking', meteredAccepted: false },
}

/** an answer that names the two CLIs alone: they are being checked, ChatGPT is not there */
const ANSWERED_WITHOUT_CHATGPT = {
  ...CHECKING,
  chatgpt: { provider: 'chatgpt', state: 'signed-out', meteredAccepted: false },
}

describe('checkingSubscriptionStatuses', () => {
  it('lists both providers as checking, a fresh object every time', () => {
    expect(checkingSubscriptionStatuses()).toEqual(CHECKING)
    expect(checkingSubscriptionStatuses()).not.toBe(checkingSubscriptionStatuses())
  })
})

describe('isSubscriptionProviderId', () => {
  it('accepts the two subscription providers only', () => {
    expect(isSubscriptionProviderId('claude-code')).toBe(true)
    expect(isSubscriptionProviderId('codex')).toBe(true)
    for (const value of [
      'auto',
      'openai',
      'retired-provider',
      '',
      'Codex',
      null,
      undefined,
      1,
      {},
    ]) {
      expect(isSubscriptionProviderId(value)).toBe(false)
    }
  })
})

describe('subscriptionStatusMapOf', () => {
  it('reads anything that is not an object as both providers checking', () => {
    for (const answer of [undefined, null, 'ready', 3, true, [], () => undefined]) {
      expect(subscriptionStatusMapOf(answer)).toEqual(CHECKING)
    }
  })

  it('keeps a well-formed status and fills in a missing provider', () => {
    const map = subscriptionStatusMapOf({
      'claude-code': {
        provider: 'claude-code',
        state: 'ready',
        meteredAccepted: false,
        plan: 'max',
        version: '2.1.287',
      },
    })
    expect(map['claude-code']).toEqual({
      provider: 'claude-code',
      state: 'ready',
      meteredAccepted: false,
      plan: 'max',
      version: '2.1.287',
    })
    expect(map.codex).toEqual(CHECKING.codex)
  })

  it('passes the program path on a needs-update error alone, and only a full path on one line', () => {
    const read = (fields: Record<string, unknown>): unknown =>
      subscriptionStatusMapOf({
        'claude-code': { provider: 'claude-code', meteredAccepted: false, ...fields },
      })['claude-code'].programPath
    const outdated = { state: 'error', error: 'needs-update: old', version: '2.1.114' }
    const windows = 'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\claude.exe'
    const share = '\\\\wsl$\\Ubuntu\\claude'
    expect(read({ ...outdated, programPath: windows })).toBe(windows)
    expect(read({ ...outdated, programPath: '/home/me/.local/bin/claude' })).toBe(
      '/home/me/.local/bin/claude',
    )
    expect(read({ ...outdated, programPath: share })).toBe(share)
    for (const programPath of ['claude.exe', 'bin\\claude', '', 3, null, `${windows}\nsecond`]) {
      expect(read({ ...outdated, programPath }), String(programPath)).toBeUndefined()
    }
    expect(read({ state: 'error', error: 'failed: spawn', programPath: windows })).toBeUndefined()
    expect(read({ state: 'ready', programPath: windows })).toBeUndefined()
  })

  it('reads an entry with an unknown or missing state as checking', () => {
    const map = subscriptionStatusMapOf({
      'claude-code': { provider: 'claude-code', state: 'connected', meteredAccepted: true },
      codex: { provider: 'codex', meteredAccepted: true },
    })
    expect(map).toEqual(ANSWERED_WITHOUT_CHATGPT)
  })

  it('reads an entry that is not an object as checking', () => {
    expect(subscriptionStatusMapOf({ 'claude-code': 'ready', codex: ['ready'] })).toEqual(
      ANSWERED_WITHOUT_CHATGPT,
    )
    expect(subscriptionStatusMapOf({ chatgpt: 'ready' }).chatgpt.state).toBe('checking')
  })

  it('keeps why a sign-in failed only as fixed names on an unfinished sign-out', () => {
    const read = (fields: Record<string, unknown>) =>
      subscriptionStatusMapOf({
        chatgpt: { provider: 'chatgpt', meteredAccepted: false, ...fields },
      }).chatgpt.loginFailure
    const unfinished = { state: 'signed-out', loginUnfinished: true }
    expect(
      read({
        ...unfinished,
        loginFailure: {
          reason: 'denied',
          step: 'token-refused',
          httpStatus: 400,
          oauthError: 'invalid_grant',
          token: 'secret',
        },
      }),
    ).toEqual({
      reason: 'denied',
      step: 'token-refused',
      httpStatus: 400,
      oauthError: 'invalid_grant',
    })
    // a step, a status or a code of another shape is left behind; an unknown reason drops it all
    expect(
      read({
        ...unfinished,
        loginFailure: {
          reason: 'no-plan',
          step: 'something else',
          httpStatus: 4000,
          oauthError: 'The code was used: abc',
        },
      }),
    ).toEqual({ reason: 'no-plan' })
    expect(read({ ...unfinished, loginFailure: { reason: 'cancelled' } })).toBeUndefined()
    expect(read({ ...unfinished, loginFailure: 'no-plan' })).toBeUndefined()
    // it belongs to a sign-in that ended without one, and nowhere else
    expect(read({ state: 'signed-out', loginFailure: { reason: 'no-plan' } })).toBeUndefined()
    expect(
      read({ state: 'ready', loginUnfinished: true, loginFailure: { reason: 'no-plan' } }),
    ).toBeUndefined()
  })

  it('reads an answer without a ChatGPT status as one from an app without that connection', () => {
    expect(subscriptionStatusMapOf({}).chatgpt.state).toBe('signed-out')
    // no answer at all is still "checking", for every provider
    expect(subscriptionStatusMapOf(undefined)).toEqual(CHECKING)
  })

  it('names each entry after its key, whatever the entry claims', () => {
    const map = subscriptionStatusMapOf({
      codex: { provider: 'claude-code', state: 'ready', meteredAccepted: false },
    })
    expect(map.codex.provider).toBe('codex')
  })

  it('counts a metered login as accepted only on a literal true', () => {
    const statusWith = (meteredAccepted: unknown): unknown => ({
      codex: { provider: 'codex', state: 'metered', meteredAccepted },
    })
    expect(subscriptionStatusMapOf(statusWith(true)).codex.meteredAccepted).toBe(true)
    for (const value of ['true', 1, {}, undefined, null]) {
      expect(subscriptionStatusMapOf(statusWith(value)).codex.meteredAccepted).toBe(false)
    }
  })

  it('ignores keys that are not subscription providers', () => {
    const map = subscriptionStatusMapOf({
      openai: { provider: 'openai', state: 'ready', meteredAccepted: false },
    })
    expect(Object.keys(map).sort()).toEqual(['chatgpt', 'claude-code', 'codex'])
  })
})

describe('subscriptionLaunchResultOf', () => {
  it('is a success only on a literal ok: true, and carries nothing else then', () => {
    expect(subscriptionLaunchResultOf({ ok: true, error: 'x', installUrl: 'y' })).toEqual({
      ok: true,
    })
    expect(subscriptionLaunchResultOf({ ok: 'true' })).toEqual({ ok: false, reason: 'failed' })
    expect(subscriptionLaunchResultOf({ ok: 1 })).toEqual({ ok: false, reason: 'failed' })
  })

  it('reads anything unreadable as a plain failure', () => {
    for (const answer of [undefined, null, 'ok', 0, [], {}]) {
      expect(subscriptionLaunchResultOf(answer)).toEqual({ ok: false, reason: 'failed' })
    }
  })

  it('keeps a known reason and replaces an unknown one', () => {
    for (const reason of ['not-installed', 'unsupported', 'failed', 'invalid']) {
      expect(subscriptionLaunchResultOf({ ok: false, reason })).toEqual({ ok: false, reason })
    }
    expect(subscriptionLaunchResultOf({ ok: false, reason: 'ENOENT' })).toEqual({
      ok: false,
      reason: 'failed',
    })
  })

  it('never passes the spawn error text on', () => {
    const result = subscriptionLaunchResultOf({
      ok: false,
      reason: 'failed',
      error: 'spawn C:\\Users\\someone\\AppData\\Roaming\\npm\\codex.cmd ENOENT',
    })
    expect(result).toEqual({ ok: false, reason: 'failed' })
    expect(JSON.stringify(result)).not.toContain('someone')
  })

  it('keeps the install page only when it is a string', () => {
    expect(
      subscriptionLaunchResultOf({
        ok: false,
        reason: 'unsupported',
        installUrl: 'https://developers.openai.com/codex/cli',
      }),
    ).toEqual({
      ok: false,
      reason: 'unsupported',
      installUrl: 'https://developers.openai.com/codex/cli',
    })
    expect(subscriptionLaunchResultOf({ ok: false, reason: 'unsupported', installUrl: 7 })).toEqual(
      { ok: false, reason: 'unsupported' },
    )
  })
})

describe('subscriptionMeteredResultOf', () => {
  it('is accepted only on a literal ok: true and always carries a full status map', () => {
    expect(subscriptionMeteredResultOf(undefined)).toEqual({ ok: false, statuses: CHECKING })
    expect(subscriptionMeteredResultOf({ ok: 'yes', statuses: null })).toEqual({
      ok: false,
      statuses: CHECKING,
    })
    const result = subscriptionMeteredResultOf({
      ok: true,
      statuses: { codex: { provider: 'codex', state: 'metered', meteredAccepted: true } },
    })
    expect(result.ok).toBe(true)
    expect(result.statuses.codex).toEqual({
      provider: 'codex',
      state: 'metered',
      meteredAccepted: true,
    })
    expect(result.statuses['claude-code']).toEqual(CHECKING['claude-code'])
  })
})

describe('entry points', () => {
  it('the root and browser entries expose the same readers', () => {
    for (const name of [
      'checkingSubscriptionStatuses',
      'isSubscriptionProviderId',
      'subscriptionStatusMapOf',
      'subscriptionLaunchResultOf',
      'subscriptionMeteredResultOf',
    ] as const) {
      expect(typeof browser[name]).toBe('function')
      expect(root[name]).toBe(browser[name])
    }
  })
})
