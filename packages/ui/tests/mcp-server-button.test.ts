/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMcpWindowState,
  type McpServerView,
  type McpToolsBridgeLike,
  type McpWindowState,
} from '@genoffice/agent-core'
import { McpServerButton } from '../src/McpServerButton'

type RawServer = Partial<McpServerView> & { name: string }

function fakeBridge(servers: RawServer[]) {
  let listener: (() => void) | null = null
  let current = servers
  const bridge = {
    list: vi.fn(async () =>
      current.map((s) => ({ status: 'connected', newToolCount: 0, tools: [], ...s })),
    ),
    call: vi.fn(async () => ({ content: [] })),
    cancel: vi.fn(),
    onChanged: vi.fn((l: () => void) => {
      listener = l
      return () => (listener = null)
    }),
    retry: vi.fn(async () => {}),
    openSettings: vi.fn(async () => {}),
  } satisfies McpToolsBridgeLike
  return {
    bridge,
    /** the shell says the list changed */
    change(next: RawServer[]) {
      current = next
      listener?.()
    },
  }
}

const flush = async () => {
  for (let i = 0; i < 4; i += 1) await act(async () => await Promise.resolve())
}

const trigger = () => host.querySelector<HTMLButtonElement>('.ai-mcp-server-btn')
const pop = () => document.querySelector<HTMLElement>('.ai-mcp-pop')
const row = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('.ai-mcp-row')].find(
    (r) => r.querySelector('.ai-mcp-row-name')?.textContent === name,
  )
const rowButton = (name: string, label: string) =>
  [...(row(name)?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label)

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let state: McpWindowState | null = null
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  state?.dispose()
  state = null
  vi.unstubAllGlobals()
})

async function render(servers: RawServer[], lang: 'en' | 'ko' = 'en') {
  const fake = fakeBridge(servers)
  state = createMcpWindowState(fake.bridge)
  act(() => root.render(createElement(McpServerButton, { lang, state })))
  await flush()
  return fake
}

const open = () => act(() => trigger()!.click())

describe('McpServerButton', () => {
  it('is hidden with no servers, or only servers turned off in Settings', async () => {
    await render([])
    expect(trigger()).toBeNull()
    await render([{ name: 'a', status: 'disabled' }])
    expect(trigger()).toBeNull()
  })

  it('is hidden without an MCP bridge', () => {
    act(() => root.render(createElement(McpServerButton, { lang: 'en', state: null })))
    expect(host.innerHTML).toBe('')
  })

  it('appears when a server is turned on in Settings', async () => {
    const fake = await render([{ name: 'a', status: 'disabled' }])
    fake.change([{ name: 'a', status: 'connected' }])
    await flush()
    expect(trigger()).not.toBeNull()
    expect(trigger()!.getAttribute('aria-label')).toBe('Connected servers')
  })

  it('lists each server with its status and new tools', async () => {
    await render([
      { name: 'search', status: 'connected', newToolCount: 3 },
      { name: 'files', status: 'connecting' },
      { name: 'old', status: 'disabled' },
    ])
    open()
    expect(pop()).not.toBeNull()
    expect(trigger()!.getAttribute('aria-expanded')).toBe('true')
    expect(row('search')?.textContent).toContain('Connected')
    expect(row('search')?.textContent).toContain('New tools: 3')
    expect(row('files')?.textContent).toContain('Connecting')
    expect(row('files')?.textContent).not.toContain('New tools')
    expect(row('old')?.textContent).toContain('Off')
  })

  it('turns a server off and on for this conversation only', async () => {
    await render([{ name: 'search', status: 'connected' }])
    const set = vi.spyOn(state!, 'setServerOffInChat')
    open()
    const box = () => row('search')!.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(box().checked).toBe(true)
    expect(box().getAttribute('aria-label')).toBe('Use search in this conversation')
    act(() => box().click())
    expect(set).toHaveBeenLastCalledWith('search', true)
    expect(state!.serversOffInChat().has('search')).toBe(true)
    expect(box().checked).toBe(false)
    // off here reads as off in this conversation, never "connected" (P8)
    expect(row('search')?.textContent).toContain('Off in this conversation')
    expect(row('search')?.textContent).not.toContain('Connected')
    act(() => box().click())
    expect(set).toHaveBeenLastCalledWith('search', false)
    expect(box().checked).toBe(true)
  })

  it('cannot turn on here a server that is off in Settings', async () => {
    await render([
      { name: 'search', status: 'connected' },
      { name: 'old', status: 'disabled' },
    ])
    open()
    const box = row('old')!.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(box.disabled).toBe(true)
    expect(box.checked).toBe(false)
  })

  it('offers to turn on in Settings a server that is off there (P8)', async () => {
    const fake = await render([
      { name: 'search', status: 'connected' },
      { name: 'old', status: 'disabled' },
    ])
    open()
    act(() => rowButton('old', 'Turn on in Settings')!.click())
    expect(fake.bridge.openSettings).toHaveBeenLastCalledWith('old')
  })

  it('sends a never-checked server to Settings to check it (B1)', async () => {
    const fake = await render([{ name: 'fresh', status: 'unchecked' }], 'ko')
    open()
    expect(row('fresh')?.textContent).toContain('확인 전')
    expect(row('fresh')?.textContent).not.toContain('연결됨')
    act(() => rowButton('fresh', '설정에서 연결 확인')!.click())
    expect(fake.bridge.openSettings).toHaveBeenLastCalledWith('fresh')
  })

  it('says a server approved before but not reached yet is ready, not connected (B1)', async () => {
    await render([{ name: 'dict', status: 'ready' }], 'ko')
    open()
    expect(row('dict')?.textContent).toContain('준비됨')
    expect(row('dict')?.querySelectorAll('button')).toHaveLength(0)
  })

  it('offers the action that fits each status', async () => {
    const fake = await render([
      { name: 'cal', status: 'login-required' },
      { name: 'docs', status: 'review-required', review: ['tools'] },
      { name: 'web', status: 'failed', failReason: 'unreachable' },
      { name: 'ok', status: 'connected' },
    ])
    open()
    expect(row('cal')?.textContent).toContain('Needs a new sign-in')
    expect(row('docs')?.textContent).toContain('Needs review')
    expect(row('web')?.textContent).toContain('Could not connect · Could not reach the server')
    expect(row('ok')?.querySelectorAll('button')).toHaveLength(0)

    act(() => rowButton('web', 'Try again')!.click())
    expect(fake.bridge.retry).toHaveBeenCalledWith('web')

    act(() => rowButton('cal', 'Sign in again')!.click())
    expect(fake.bridge.openSettings).toHaveBeenLastCalledWith('cal')
    // Settings opens in another view; the list closes
    expect(pop()).toBeNull()

    open()
    act(() => rowButton('docs', 'Go review')!.click())
    expect(fake.bridge.openSettings).toHaveBeenLastCalledWith('docs')
  })

  it('closes on Escape and gives focus back to the button', async () => {
    await render([{ name: 'search', status: 'connected' }])
    open()
    act(() => {
      pop()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(pop()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('speaks Korean', async () => {
    await render(
      [
        { name: 'cal', status: 'login-required', newToolCount: 2 },
        { name: 'web', status: 'failed', failReason: 'runtime-missing' },
      ],
      'ko',
    )
    expect(trigger()!.getAttribute('aria-label')).toBe('연결한 서버')
    open()
    expect(row('cal')?.textContent).toContain('다시 로그인 필요')
    expect(row('cal')?.textContent).toContain('새 도구 2개')
    expect(rowButton('cal', '다시 로그인')).toBeDefined()
    expect(row('web')?.textContent).toContain('연결 못 함 · 실행 환경 없음')
    expect(rowButton('web', '다시 시도')).toBeDefined()
  })
})
