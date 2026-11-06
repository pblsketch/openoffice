/**
 * The ChatGPT provider behind the shared subscription channels (decision
 * 0081): its login is the app's own browser sign-in, its logout forgets the
 * app's tokens, and it has no program to install or update. The vendor CLIs
 * are never looked for here: the detector is a stand-in.
 */
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ChatGptConnection,
  ChatGptSignInOptions,
  ChatGptSignInResult,
} from '../src/chatgpt/connection'
import { chatGptConnection, setChatGptConnection } from '../src/chatgpt/connection'
import { detectChatGptConnection } from '../src/chatgpt/status'
import { defaultAiSettings } from '../src/providers'
import { subscriptionStatusMapOf } from '../src/subscription/contract'
import { createSubscriptionIpcDeps } from '../src/subscription/ipc'
import type { SubscriptionDetector } from '../src/subscription/status'

function fakeConnection() {
  let signedIn = false
  let pending: ((result: ChatGptSignInResult) => void) | null = null
  const listeners = new Set<() => void>()
  const seen: ChatGptSignInOptions[] = []
  const connection: ChatGptConnection = {
    state: async () => ({ signedIn, ...(signedIn ? { account: 'someone@example.com' } : {}) }),
    signIn: (options) => {
      seen.push(options)
      return new Promise((resolve) => {
        pending = resolve
        options.signal?.addEventListener('abort', () => resolve({ ok: false, reason: 'cancelled' }))
      })
    },
    signOut: async () => {
      signedIn = false
      for (const listener of listeners) listener()
    },
    accessToken: async () => 'token',
    dropSession: async () => undefined,
    onChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  return {
    connection,
    seen,
    finish(ok: boolean, failure: ChatGptSignInResult = { ok: false, reason: 'denied' }) {
      signedIn = ok
      pending?.(ok ? { ok: true } : failure)
      if (ok) for (const listener of listeners) listener()
    },
  }
}

function setup(chatGptSignIn = true) {
  const fake = fakeConnection()
  const detect: SubscriptionDetector = async (provider) =>
    provider === 'chatgpt'
      ? detectChatGptConnection(fake.connection)
      : { provider, state: 'not-installed' }
  const opened: string[] = []
  const deps = createSubscriptionIpcDeps({
    getSettings: () => defaultAiSettings(),
    setMeteredAccepted: () => undefined,
    dataDir: 'unused',
    detect,
    listModels: async () => undefined,
    chatGptConnection: fake.connection,
    ...(chatGptSignIn
      ? {
          chatGptSignIn: {
            openBrowser: async (url: string) => {
              opened.push(url)
              return true
            },
            pages: () => ({
              done: { lang: 'en', title: 'ok', body: 'ok' },
              failed: { lang: 'en', title: 'no', body: 'no' },
            }),
          },
        }
      : {}),
  })
  return { deps, fake, opened }
}

/** wait until the status service has caught up, however loaded the machine is */
async function until(done: () => boolean): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!done()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the status')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

afterEach(() => setChatGptConnection(null))

// the status service answers in microseconds, but a loaded test run can stall the event loop
describe('the ChatGPT provider on the subscription channels', { timeout: 20_000 }, () => {
  it('registers the connection for the bridge and the status check', () => {
    const { fake } = setup()
    expect(chatGptConnection()).toBe(fake.connection)
  })

  it('signs in in the browser, shows it under way, then reports ready', async () => {
    const { deps, fake } = setup()
    expect(await deps.launchLogin('chatgpt')).toEqual({ ok: true })
    expect(deps.service.getStatuses().chatgpt.signingIn).toBe('browser')
    // a second press while it runs starts nothing new
    expect(await deps.launchLogin('chatgpt', 'window')).toEqual({ ok: true })
    expect(fake.seen).toHaveLength(1)
    fake.finish(true)
    await until(() => deps.service.getStatuses().chatgpt.state === 'ready')
    const status = deps.service.getStatuses().chatgpt
    expect(status.state).toBe('ready')
    expect(status.signingIn).toBeUndefined()
    expect(status.account).toBe('someone@example.com')
  })

  it('marks a sign-in that did not work as unfinished', async () => {
    const { deps, fake } = setup()
    await deps.launchLogin('chatgpt')
    fake.finish(false)
    await until(() => deps.service.getStatuses().chatgpt.loginUnfinished === true)
    const status = deps.service.getStatuses().chatgpt
    expect(status.state).toBe('signed-out')
    expect(status.loginUnfinished).toBe(true)
  })

  it('keeps why the sign-in failed on the status, through the channel, until a new one starts', async () => {
    const { deps, fake } = setup()
    await deps.launchLogin('chatgpt')
    fake.finish(false, { ok: false, reason: 'no-plan', step: 'scope-missing' })
    await until(() => deps.service.getStatuses().chatgpt.loginUnfinished === true)
    const status = subscriptionStatusMapOf(deps.service.getStatuses()).chatgpt
    expect(status.state).toBe('signed-out')
    expect(status.loginFailure).toEqual({ reason: 'no-plan', step: 'scope-missing' })

    await deps.launchLogin('chatgpt')
    expect(deps.service.getStatuses().chatgpt.loginFailure).toBeUndefined()
    fake.finish(false, {
      ok: false,
      reason: 'denied',
      step: 'token-refused',
      httpStatus: 400,
      oauthError: 'invalid_request',
    })
    await until(() => deps.service.getStatuses().chatgpt.loginFailure?.reason === 'denied')
    expect(subscriptionStatusMapOf(deps.service.getStatuses()).chatgpt.loginFailure).toEqual({
      reason: 'denied',
      step: 'token-refused',
      httpStatus: 400,
      oauthError: 'invalid_request',
    })
  })

  // a cancelled sign-in leaves no mark of its own, so only the new login can clear the last one
  it('drops the last failure when a new sign-in is cancelled', async () => {
    const { deps, fake } = setup()
    await deps.launchLogin('chatgpt')
    fake.finish(false, { ok: false, reason: 'no-plan', step: 'scope-missing' })
    await until(() => deps.service.getStatuses().chatgpt.loginUnfinished === true)
    await deps.launchLogin('chatgpt')
    expect(await deps.cancelLogin('chatgpt')).toEqual({ ok: true })
    await until(() => deps.service.getStatuses().chatgpt.signingIn === undefined)
    await deps.service.check(['chatgpt'], { fresh: true })
    const status = subscriptionStatusMapOf(deps.service.getStatuses()).chatgpt
    expect(status.state).toBe('signed-out')
    expect(status.loginUnfinished).toBeUndefined()
    expect(status.loginFailure).toBeUndefined()
  })

  it('drops the last failure when a new sign-in connects', async () => {
    const { deps, fake } = setup()
    await deps.launchLogin('chatgpt')
    fake.finish(false, {
      ok: false,
      reason: 'denied',
      step: 'callback-error',
      oauthError: 'access_denied',
    })
    await until(() => deps.service.getStatuses().chatgpt.loginUnfinished === true)
    await deps.launchLogin('chatgpt')
    fake.finish(true)
    await until(() => deps.service.getStatuses().chatgpt.state === 'ready')
    const status = deps.service.getStatuses().chatgpt
    expect(status.loginUnfinished).toBeUndefined()
    expect(status.loginFailure).toBeUndefined()
  })

  it('cancels a sign-in under way', async () => {
    const { deps, fake } = setup()
    await deps.launchLogin('chatgpt')
    expect(await deps.cancelLogin('chatgpt')).toEqual({ ok: true })
    await until(() => deps.service.getStatuses().chatgpt.state === 'signed-out')
    expect(fake.seen[0]?.signal?.aborted).toBe(true)
    const status = deps.service.getStatuses().chatgpt
    expect(status.signingIn).toBeUndefined()
    expect(status.loginUnfinished).toBeUndefined()
  })

  it('answers unsupported when the app gave no way to open the browser', async () => {
    const { deps } = setup(false)
    expect(await deps.launchLogin('chatgpt')).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('logs out by forgetting the app tokens, and has nothing to install or update', async () => {
    const { deps, fake } = setup()
    await deps.launchLogin('chatgpt')
    fake.finish(true)
    await until(() => deps.service.getStatuses().chatgpt.state === 'ready')
    expect(await deps.launchLogout('chatgpt')).toEqual({ ok: true })
    await until(() => deps.service.getStatuses().chatgpt.state === 'signed-out')
    expect(deps.service.getStatuses().chatgpt.state).toBe('signed-out')
    expect(await deps.launchInstall('chatgpt')).toEqual({ ok: false, reason: 'invalid' })
    expect(await deps.launchUpdate('chatgpt')).toEqual({ ok: false, reason: 'invalid' })
  })
})
