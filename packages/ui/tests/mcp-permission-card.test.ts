/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMcpWindowState,
  type McpPermissionAnswer,
  type McpToolsBridgeLike,
  type McpWindowState,
} from '@genoffice/agent-core'
import { McpPermissionCard } from '../src/McpPermissionCard'

function fakeBridge(): McpToolsBridgeLike {
  return {
    list: vi.fn(async () => []),
    call: vi.fn(async () => ({ content: [] })),
    cancel: vi.fn(),
    onChanged: vi.fn(() => () => {}),
    retry: vi.fn(async () => {}),
    openSettings: vi.fn(async () => {}),
  }
}

const flush = async () => {
  for (let i = 0; i < 4; i += 1) await act(async () => await Promise.resolve())
}

const buttons = () => [...host.querySelectorAll('button')]
const button = (label: string) => buttons().find((b) => b.textContent === label)
const card = () => host.querySelector('.ai-mcp-card')

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let state: McpWindowState
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  state = createMcpWindowState(fakeBridge())
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  state.dispose()
  vi.unstubAllGlobals()
})

function render(lang: 'en' | 'ko' = 'en') {
  act(() => root.render(createElement(McpPermissionCard, { lang, state })))
}

/** put a request to the person through the store, as the skill does */
function ask(tool: string, input: Record<string, unknown> = { q: 'cats' }, server = 'search') {
  let answer: McpPermissionAnswer | undefined
  let promise!: Promise<McpPermissionAnswer>
  act(() => {
    promise = state.permissions.ask({ server, tool, exposedName: `mcp__${server}__${tool}`, input })
    void promise.then((a) => (answer = a))
  })
  return { promise, answer: () => answer }
}

describe('McpPermissionCard', () => {
  it('shows nothing while nothing waits', () => {
    render()
    expect(card()).toBeNull()
  })

  it('shows the server, the tool and what would be sent, with focus on Block', async () => {
    render()
    ask('find', { q: 'cats' })
    await flush()
    expect(card()?.textContent).toContain('search')
    expect(card()?.textContent).toContain('find')
    expect(host.querySelector('.ai-mcp-card-input')?.textContent).toContain('"q": "cats"')
    expect(buttons().map((b) => b.textContent)).toEqual([
      'Allow this once',
      'Always allow in this conversation',
      'Block',
    ])
    expect(document.activeElement).toBe(button('Block'))
  })

  it.each([
    ['Allow this once', 'once'],
    ['Always allow in this conversation', 'conversation'],
    ['Block', 'deny'],
  ] as const)('%s answers %s', async (label, expected) => {
    const answer = vi.spyOn(state.permissions, 'answer')
    render()
    const req = ask('find')
    await flush()
    const id = state.permissions.requests()[0]!.id
    act(() => button(label)!.click())
    await flush()
    expect(answer).toHaveBeenCalledWith(id, expected)
    expect(req.answer()).toBe(expected)
    expect(card()).toBeNull()
  })

  it('blocks on Escape', async () => {
    render()
    const req = ask('find')
    await flush()
    act(() => {
      card()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await flush()
    expect(req.answer()).toBe('deny')
  })

  it('shows one request at a time, in order', async () => {
    render()
    const first = ask('find')
    const second = ask('fetch', { url: 'https://example.com' })
    await flush()
    expect(host.querySelectorAll('.ai-mcp-card')).toHaveLength(1)
    expect(card()?.textContent).toContain('find')
    expect(card()?.textContent).not.toContain('fetch')
    act(() => button('Allow this once')!.click())
    await flush()
    expect(first.answer()).toBe('once')
    expect(second.answer()).toBeUndefined()
    expect(card()?.textContent).toContain('fetch')
    expect(document.activeElement).toBe(button('Block'))
  })

  it('cuts a long input and shows the rest on "Show more"', async () => {
    render()
    const long = 'y'.repeat(2500)
    ask('find', { text: long })
    await flush()
    const shown = () => host.querySelector('.ai-mcp-card-input')!.textContent ?? ''
    expect(shown()).not.toContain(long)
    expect(shown().length).toBeLessThan(2100)
    act(() => button('Show more')!.click())
    expect(shown()).toContain(long)
    expect(button('Show more')).toBeUndefined()
  })

  it('says when there is nothing to send', async () => {
    render()
    ask('list', {})
    await flush()
    expect(host.querySelector('.ai-mcp-card-input')?.textContent).toBe('Nothing to send')
  })

  it('blocks everything still waiting when it goes away', async () => {
    const denyAll = vi.spyOn(state.permissions, 'denyAll')
    render()
    const first = ask('find')
    const second = ask('fetch')
    await flush()
    act(() => root.render(createElement('div')))
    await flush()
    expect(denyAll).toHaveBeenCalled()
    expect(first.answer()).toBe('deny')
    expect(second.answer()).toBe('deny')
  })

  it('speaks Korean', async () => {
    render('ko')
    ask('find')
    await flush()
    expect(buttons().map((b) => b.textContent)).toEqual([
      '이번만 허용',
      '이 대화에서 항상 허용',
      '막기',
    ])
    expect(card()?.textContent).toContain('보낼 내용')
  })

  it('renders nothing without an MCP bridge', () => {
    act(() => root.render(createElement(McpPermissionCard, { lang: 'en', state: null })))
    expect(host.innerHTML).toBe('')
  })
})
