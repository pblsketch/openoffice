/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { AiSubscriptionState, SubscriptionStatusMap } from '@genoffice/ai-provider/browser'
import {
  useSubscriptionConnection,
  type SubscriptionApiLike,
  type SubscriptionConnection,
  type UseSubscriptionConnectionOptions,
} from '../src/use-subscription-connection'

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

function Probe({ options }: { options: UseSubscriptionConnectionOptions }) {
  connection = useSubscriptionConnection(options)
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
  vi.unstubAllGlobals()
})

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function mount(options: UseSubscriptionConnectionOptions) {
  act(() => root.render(createElement(Probe, { options })))
  await settle()
}

describe('shared subscription connection', () => {
  it('stays checking and never throws without a bridge', async () => {
    await mount({ api: () => undefined })
    expect(connection.statuses['claude-code'].state).toBe('checking')
    act(() => {
      connection.login('claude-code')
      connection.install('codex')
      connection.recheck('codex')
      void connection.acceptMetered('codex')
      connection.openInstallHelp('codex')
      connection.logout('codex')
    })
    await settle()
    expect(connection.busy).toBe(false)
  })

  it('reads the statuses and follows the change events', async () => {
    let push: ((statuses: SubscriptionStatusMap) => void) | null = null
    const off = vi.fn()
    const api: SubscriptionApiLike = {
      statuses: async () => statusMap('ready', 'signed-out'),
      recheck: async () => statusMap('ready', 'signed-out'),
      login: async () => ({ ok: true }),
      install: async () => ({ ok: true }),
      update: async () => ({ ok: true }),
      cancelLogin: async () => ({ ok: true }),
      setMeteredAccepted: async () => ({ ok: true }),
      onChanged: (handler) => {
        push = handler
        return off
      },
    }
    await mount({ api: () => api })
    expect(connection.statuses['claude-code'].state).toBe('ready')
    act(() => push?.(statusMap('ready', 'ready')))
    expect(connection.statuses.codex.state).toBe('ready')
    act(() => root.unmount())
    expect(off).toHaveBeenCalledTimes(1)
    root = createRoot(host)
  })

  it('rechecks a provider after a sign-in and again on focus', async () => {
    let current = statusMap('signed-out', 'not-installed')
    const recheck = vi.fn(async () => current)
    const login = vi.fn(async () => ({ ok: true }))
    const api = {
      statuses: async () => current,
      recheck,
      login,
      onChanged: () => () => undefined,
    } as unknown as SubscriptionApiLike
    await mount({ api: () => api })
    act(() => connection.login('claude-code'))
    await settle()
    expect(login).toHaveBeenCalledWith('claude-code')

    current = statusMap('ready', 'not-installed')
    act(() => window.dispatchEvent(new Event('focus')))
    await settle()
    expect(recheck).toHaveBeenCalledWith(['claude-code'])
    expect(connection.statuses['claude-code'].state).toBe('ready')

    recheck.mockClear()
    act(() => window.dispatchEvent(new Event('focus')))
    await settle()
    expect(recheck).not.toHaveBeenCalled()
  })

  it('rechecks after a launch that found no program and remembers the failure', async () => {
    const recheck = vi.fn(async () => statusMap('not-installed', 'not-installed'))
    const api = {
      statuses: async () => statusMap('signed-out', 'not-installed'),
      recheck,
      login: async () => ({ ok: false, reason: 'not-installed' }),
      onChanged: () => () => undefined,
    } as unknown as SubscriptionApiLike
    await mount({ api: () => api })
    act(() => connection.login('claude-code'))
    await settle()
    expect(connection.failed['claude-code']).toBe('login')
    expect(recheck).toHaveBeenCalledWith(['claude-code'])
  })

  it('opening help falls back to a browser page when the bridge cannot', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const api = {
      statuses: async () => statusMap('signed-out', 'signed-out'),
      recheck: async () => statusMap('signed-out', 'signed-out'),
      onChanged: () => () => undefined,
    } as unknown as SubscriptionApiLike
    await mount({ api: () => api, help: 'auto' })
    act(() => connection.openInstallHelp('claude-code'))
    act(() => connection.openConnectHelp('codex'))
    expect(open).toHaveBeenCalledTimes(2)
    expect(String(open.mock.calls[0]![0])).toContain('claude')
  })

  it('uses the bridge’s help handlers when it has them, and reads the Codex image answer', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const openInstallHelp = vi.fn(async () => undefined)
    const openConnectHelp = vi.fn(async () => undefined)
    const api = {
      statuses: async () => statusMap('signed-out', 'signed-out'),
      recheck: async () => statusMap('signed-out', 'signed-out'),
      onChanged: () => () => undefined,
      openInstallHelp,
      openConnectHelp,
      codexImageAvailable: async () => true,
    } as unknown as SubscriptionApiLike
    await mount({ api: () => api, help: 'api', readCodexImageAvailable: true })
    act(() => connection.openInstallHelp('claude-code'))
    act(() => connection.openConnectHelp(null))
    expect(openInstallHelp).toHaveBeenCalledWith('claude-code')
    expect(openConnectHelp).toHaveBeenCalledWith(null)
    expect(open).not.toHaveBeenCalled()
    expect(connection.codexImageAvailable).toBe(true)
  })

  it('runs a check on mount only when asked, and refresh can be a plain status read', async () => {
    let reads = 0
    const recheck = vi.fn(async () => statusMap('ready', 'signed-out'))
    const api = {
      statuses: async () => {
        reads++
        return statusMap('ready', 'signed-out')
      },
      recheck,
      onChanged: () => () => undefined,
    } as unknown as SubscriptionApiLike
    await mount({ api: () => api, checkOnMount: true, refreshMode: 'statuses' })
    expect(recheck).toHaveBeenCalledTimes(1)
    const before = reads
    act(() => connection.refresh())
    await settle()
    expect(reads).toBeGreaterThan(before)
    expect(recheck).toHaveBeenCalledTimes(1)
  })

  it('applies the statuses answered by "use anyway"', async () => {
    const accepted: SubscriptionStatusMap = {
      ...statusMap('not-installed', 'metered'),
      codex: { provider: 'codex', state: 'metered', meteredAccepted: true },
    }
    const api = {
      statuses: async () => statusMap('not-installed', 'metered'),
      recheck: async () => statusMap('not-installed', 'metered'),
      setMeteredAccepted: async () => ({ ok: true, statuses: accepted }),
      onChanged: () => () => undefined,
    } as unknown as SubscriptionApiLike
    await mount({ api: () => api })
    await act(async () => {
      await connection.acceptMetered('codex')
    })
    expect(connection.statuses.codex.meteredAccepted).toBe(true)
  })
})
