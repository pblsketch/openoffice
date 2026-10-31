/** @vitest-environment jsdom */
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentMessage } from '@genoffice/agent-core'
import type { ProjectFolderApi } from '@genoffice/project-store'
import {
  useProjectPanel,
  type ProjectPanel,
  type ProjectPanelOptions,
} from '../src/use-project-panel'
import type { ProjectChatEntry } from '../src/use-project-chat'
import { chatMessage, fakeProjectBridge, flush } from './project-fake-bridge'

/**
 * The shared project parts of an editor's AI panel: what shows with and
 * without a project, other windows' messages shown at once, and the lines
 * that say why something the person asked for did not happen.
 */

let host: HTMLDivElement
let root: Root
let panel: ProjectPanel | null = null

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  Element.prototype.scrollIntoView = () => undefined
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  panel = null
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function fakeLoop() {
  const loop = {
    busy: false,
    history: [] as AgentMessage[],
    appendHistory: vi.fn((messages: readonly AgentMessage[]) => {
      loop.history.push(...messages)
      return messages.length
    }),
  }
  return loop
}

function Harness(props: ProjectPanelOptions): ReactNode {
  const parts = useProjectPanel(props)
  panel = parts
  return createElement(
    'div',
    null,
    createElement('header', { className: 'menu' }, parts.chatMenu),
    createElement('section', { className: 'lines' }, parts.hint, parts.notices),
    createElement('footer', { className: 'below' }, parts.picker),
  )
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(flush)
}

function render(bridge: ProjectFolderApi | null, over: Partial<ProjectPanelOptions> = {}) {
  const loop = fakeLoop()
  const options: ProjectPanelOptions = {
    editor: 'docs',
    lang: 'en',
    busy: false,
    loop: () => loop,
    onOpen: vi.fn(),
    onRemoteMessages: vi.fn(),
    onNewChat: vi.fn(),
    consolidation: () => null,
    bridge,
    legacyApi: null,
    ...over,
  }
  act(() => root.render(createElement(Harness, options)))
  return {
    options,
    loop,
    rerender: (next: Partial<ProjectPanelOptions>) => {
      Object.assign(options, next)
      act(() => root.render(createElement(Harness, { ...options })))
    },
  }
}

const P1 = { projectId: 'p1', initialChatId: null }

const problemLine = () => host.querySelector<HTMLElement>('[data-problem]')

function addFolderFromPicker() {
  act(() => host.querySelector<HTMLButtonElement>('.ai-project-chip')!.click())
  const row = [...host.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (r) => r.textContent === 'Add folder',
  )!
  act(() => row.click())
}

describe('useProjectPanel', () => {
  it('without the bridge every part is empty and a send carries nothing (spec 7.6)', async () => {
    render(null)
    await settle()
    expect(host.querySelector('.ai-project-chip')).toBeNull()
    expect(host.querySelector('.ai-project-chat-button')).toBeNull()
    expect(host.querySelector('.ai-project-notices')).toBeNull()
    expect(await panel!.prepareSend()).toEqual({ status: 'none' })
    expect(panel!.messageParts({})).toBeNull()
  })

  it('with no project chosen shows only the chip, and a send carries nothing', async () => {
    const fake = fakeProjectBridge()
    render(fake.bridge)
    await settle()
    expect(host.querySelector('.below .ai-project-chip')).not.toBeNull()
    expect(host.querySelector('.ai-project-chat-button')).toBeNull()
    expect(host.querySelector('.ai-project-notices')).toBeNull()
    expect(await panel!.prepareSend()).toEqual({ status: 'none' })
    expect(fake.bridge.readContext).not.toHaveBeenCalled()
  })

  it('shows another window’s message at once, even while a reply runs (spec 5.3.3)', async () => {
    const fake = fakeProjectBridge({ selection: P1 })
    const { options, loop, rerender } = render(fake.bridge)
    await settle()
    expect(host.querySelector('.menu .ai-project-chat-button')).not.toBeNull()
    rerender({ busy: true })
    loop.busy = true
    const chatId = panel!.chat.chat?.kind === 'project' ? panel!.chat.chat.chatId : ''
    act(() => {
      fake.emitAppended({ projectId: 'p1', chatId, message: chatMessage({ seq: 7, text: 'hi' }) })
      fake.emitAppended({
        projectId: 'p1',
        chatId,
        message: chatMessage({ seq: 8, role: 'assistant', text: 'hello' }),
      })
    })
    const calls = vi.mocked(options.onRemoteMessages).mock.calls
    expect(calls.map(([entries, running]) => [entries.map((e) => e.text), running])).toEqual([
      [['hi'], true],
      [['hello'], true],
    ])
    // the model gets them only once the reply ended
    expect(loop.appendHistory).not.toHaveBeenCalled()
    loop.busy = false
    rerender({ busy: false })
    panel!.finishSend()
    await settle()
    expect(loop.history).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ])
  })

  it('says why a folder was refused, and clears it once a project is chosen', async () => {
    const fake = fakeProjectBridge()
    fake.bridge.addFolder.mockResolvedValueOnce({ status: 'refused', reason: 'user-home' })
    render(fake.bridge)
    await settle()
    addFolderFromPicker()
    await settle()
    expect(problemLine()?.getAttribute('data-problem')).toBe('refused')
    expect(problemLine()?.getAttribute('role')).toBe('alert')
    expect(problemLine()?.textContent).toContain('whole user folder')
    // a failing call says so too
    fake.bridge.addFolder.mockRejectedValueOnce(new Error('ipc'))
    addFolderFromPicker()
    await settle()
    expect(problemLine()?.getAttribute('data-problem')).toBe('action-failed')
    // dismissable
    act(() => problemLine()!.querySelector<HTMLButtonElement>('button')!.click())
    expect(problemLine()).toBeNull()
  })

  it('says a send went without the project when its folder is gone (spec 5.4)', async () => {
    const fake = fakeProjectBridge({ selection: P1 })
    fake.bridge.readContext.mockResolvedValueOnce({ status: 'missing' } as never)
    render(fake.bridge)
    await settle()
    let prepared
    await act(async () => {
      prepared = await panel!.prepareSend()
    })
    expect(prepared).toEqual({ status: 'missing' })
    expect(problemLine()?.getAttribute('data-problem')).toBe('context')
    expect(problemLine()?.textContent).toContain('went without the project’s context')
    panel!.finishSend()
    // the next send that finds the folder clears it
    await act(async () => {
      await panel!.prepareSend()
    })
    expect(problemLine()).toBeNull()
  })

  it('shows the unwritable line when the context says the folder cannot be written', async () => {
    const fake = fakeProjectBridge({ selection: P1 })
    fake.state.context = { ...fake.state.context, notices: [{ kind: 'unwritable' }] }
    render(fake.bridge)
    await settle()
    await act(async () => {
      await panel!.prepareSend()
    })
    expect(host.querySelectorAll('[data-notice="unwritable"]')).toHaveLength(1)
    expect(panel!.chat.unwritable).toBe(true)
  })

  it('draws the other editor’s tools and the memory lines of a message', async () => {
    const fake = fakeProjectBridge({ selection: P1 })
    render(fake.bridge)
    await settle()
    const other: ProjectChatEntry['otherEditorTools'] = {
      editor: 'hwp',
      fileRef: 'C:/work/report.hwp',
      count: 3,
    }
    act(() =>
      root.render(
        createElement(
          'div',
          { className: 'parts' },
          panel!.messageParts({ otherEditorTools: other }),
        ),
      ),
    )
    expect(host.querySelector('.ai-project-tool-summary')?.textContent).toContain('report.hwp')
  })
})
