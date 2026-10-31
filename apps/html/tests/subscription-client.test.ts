import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { AiSubscriptionState, SubscriptionStatusMap } from '@genoffice/ai-provider/browser'
import {
  useSubscriptionConnection,
  type SubscriptionConnection,
} from '../src/renderer/ai/subscription-client'
import { checkingSubscriptionStatuses } from '../src/shared/subscription-api'

const statusMap = (
  claude: AiSubscriptionState,
  codex: AiSubscriptionState,
): SubscriptionStatusMap => ({
  'claude-code': { provider: 'claude-code', state: claude, meteredAccepted: false },
  codex: { provider: 'codex', state: codex, meteredAccepted: false },
})

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let connection: SubscriptionConnection

function Probe() {
  connection = useSubscriptionConnection()
  return null
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete (window as { htmlApi?: unknown }).htmlApi
  vi.unstubAllGlobals()
})

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mount(htmlApi?: unknown) {
  if (htmlApi) Object.assign(window, { htmlApi })
  act(() => root.render(createElement(Probe)))
  await settle()
}

describe('useSubscriptionConnection', () => {
  it('stays "checking" and never throws when the preload exposes no subscription API', async () => {
    await mount({})
    expect(connection.statuses).toEqual(checkingSubscriptionStatuses())
    act(() => {
      connection.login('claude-code')
      connection.install('codex')
      connection.recheck('codex')
      connection.acceptMetered('codex')
      connection.openInstallHelp('codex')
    })
    await settle()
    expect(connection.statuses).toEqual(checkingSubscriptionStatuses())
    expect(connection.busy).toBe(false)
  })

  it('stays "checking" when no main-process handler answers', async () => {
    const reject = async () => {
      throw new Error("No handler registered for 'ai:subscription-statuses'")
    }
    await mount({
      subscription: {
        statuses: reject,
        recheck: reject,
        login: reject,
        install: reject,
        setMeteredAccepted: reject,
        openInstallHelp: reject,
        onChanged: () => {
          throw new Error('no event source')
        },
      },
    })
    act(() => connection.login('claude-code'))
    await settle()
    expect(connection.statuses).toEqual(checkingSubscriptionStatuses())
    expect(connection.busy).toBe(false)
  })

  it('reads the statuses, follows change events, and unsubscribes on unmount', async () => {
    let push: ((statuses: SubscriptionStatusMap) => void) | null = null
    const off = vi.fn()
    await mount({
      subscription: {
        statuses: async () => statusMap('ready', 'signed-out'),
        onChanged: (handler: (statuses: SubscriptionStatusMap) => void) => {
          push = handler
          return off
        },
      },
    })
    expect(connection.statuses['claude-code'].state).toBe('ready')
    act(() => push?.(statusMap('ready', 'ready')))
    expect(connection.statuses.codex.state).toBe('ready')
    act(() => root.unmount())
    expect(off).toHaveBeenCalledTimes(1)
    root = createRoot(host)
  })

  it('checks again when the window regains focus after a sign-in was started', async () => {
    let current = statusMap('signed-out', 'not-installed')
    const recheck = vi.fn(async () => current)
    const login = vi.fn(async () => ({ ok: true }))
    await mount({
      subscription: {
        statuses: async () => current,
        recheck,
        login,
        onChanged: () => () => undefined,
      },
    })
    // nothing was started yet: focus alone does not start a check
    act(() => window.dispatchEvent(new Event('focus')))
    await settle()
    expect(recheck).not.toHaveBeenCalled()

    act(() => connection.login('claude-code'))
    await settle()
    expect(login).toHaveBeenCalledWith('claude-code')

    // the sign-in happens in the vendor's own window; coming back picks up its result
    current = statusMap('ready', 'not-installed')
    act(() => window.dispatchEvent(new Event('focus')))
    await settle()
    expect(recheck).toHaveBeenCalledWith(['claude-code'])
    expect(connection.statuses['claude-code'].state).toBe('ready')

    // settled: later focus events do not keep checking
    recheck.mockClear()
    act(() => window.dispatchEvent(new Event('focus')))
    await settle()
    expect(recheck).not.toHaveBeenCalled()
  })

  it('re-reads the status when a sign-in finds no program', async () => {
    const recheck = vi.fn(async () => statusMap('not-installed', 'not-installed'))
    await mount({
      subscription: {
        statuses: async () => statusMap('signed-out', 'not-installed'),
        recheck,
        login: async () => ({ ok: false, reason: 'not-installed' }),
        onChanged: () => () => undefined,
      },
    })
    act(() => connection.login('claude-code'))
    await settle()
    expect(recheck).toHaveBeenCalledWith(['claude-code'])
    expect(connection.statuses['claude-code'].state).toBe('not-installed')
  })

  it('applies the statuses answered by "use anyway"', async () => {
    const accepted: SubscriptionStatusMap = {
      ...statusMap('not-installed', 'metered'),
      codex: { provider: 'codex', state: 'metered', meteredAccepted: true },
    }
    const setMeteredAccepted = vi.fn(async () => ({ ok: true, statuses: accepted }))
    await mount({
      subscription: {
        statuses: async () => statusMap('not-installed', 'metered'),
        setMeteredAccepted,
        onChanged: () => () => undefined,
      },
    })
    act(() => {
      void connection.acceptMetered('codex')
    })
    await settle()
    expect(setMeteredAccepted).toHaveBeenCalledWith('codex', true)
    expect(connection.statuses.codex.meteredAccepted).toBe(true)
  })
})
