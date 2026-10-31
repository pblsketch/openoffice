/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LegacyDocumentChat, ProjectChatListItem } from '@genoffice/project-store'
import { ProjectChatMenu, type ProjectChatMenuProps } from '../src/ProjectChatMenu'

const NOW = Date.parse('2026-10-29T12:00:00.000Z')

const chat = (over: Partial<ProjectChatListItem> & { id: string }): ProjectChatListItem => ({
  title: over.id,
  updatedAt: '2026-10-01T00:00:00.000Z',
  lastEditor: 'docs',
  foreign: false,
  ...over,
})

const CHATS: ProjectChatListItem[] = [
  chat({ id: 'a', title: 'Outline', updatedAt: '2026-10-20T00:00:00.000Z', lastEditor: 'hwp' }),
  chat({ id: 'b', title: 'Budget', updatedAt: '2026-10-29T11:30:00.000Z', lastEditor: 'sheets' }),
  chat({ id: 'c', title: 'Notes', updatedAt: '2026-10-28T12:00:00.000Z', foreign: true }),
]

const LEGACY: LegacyDocumentChat = {
  projectId: 'p0',
  chatId: 'old',
  updatedAt: '2026-09-01T00:00:00.000Z',
  approxCount: 3,
}

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
})

function render(over: Partial<ProjectChatMenuProps> = {}) {
  const props: ProjectChatMenuProps = {
    lang: 'en',
    chats: CHATS,
    currentChatId: 'a',
    legacy: LEGACY,
    now: NOW,
    onSelect: vi.fn(),
    onNewChat: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onSelectLegacy: vi.fn(),
    ...over,
  }
  act(() => root.render(createElement(ProjectChatMenu, props)))
  return props
}

const button = () => host.querySelector<HTMLButtonElement>('.ai-project-chat-button')!
const search = () => host.querySelector<HTMLInputElement>('.ai-project-search')
const rows = () => [...host.querySelectorAll<HTMLElement>('[role="option"]')]
const rowTexts = () => rows().map((r) => r.querySelector('.ai-project-row-name')?.textContent)
const activeText = () =>
  host.querySelector('[role="option"][aria-selected="true"] .ai-project-row-name')?.textContent

function setInput(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function key(target: Element, k: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  })
}

describe('ProjectChatMenu', () => {
  it('titles the button with the open chat', () => {
    render()
    expect(button().textContent).toBe('Outline')
    expect(button().getAttribute('aria-label')).toBe('Chat: Outline')
    render({ currentChatId: null })
    expect(button().textContent).toBe('New chat')
    render({ legacyActive: true })
    expect(button().textContent).toBe('Earlier chat of this document')
  })

  it('lists [New chat], the chats newest first, then the earlier document chat', () => {
    render()
    act(() => button().click())
    expect(document.activeElement).toBe(search())
    expect(rowTexts()).toEqual([
      'New chat',
      'Budget',
      'Notes',
      'Outline',
      'Earlier chat of this document',
    ])
    // the open chat is highlighted first
    expect(activeText()).toBe('Outline')
  })

  it('shows when, the last editor and the other-PC mark', () => {
    render()
    act(() => button().click())
    const budget = rows()[1]!
    expect(budget.querySelector('.ai-project-row-time')?.textContent).toMatch(/30 min/)
    expect(budget.querySelector('.ai-project-row-icon')?.getAttribute('title')).toBe(
      'Last used in: Sheets',
    )
    expect(budget.textContent).not.toContain('Other PC')
    const notes = rows()[2]!
    expect(notes.textContent).toContain('Other PC')
    expect(notes.querySelector('.ai-project-row-time')?.textContent).toMatch(/yesterday/i)
  })

  it('leaves the earlier chat out when the document has none', () => {
    render({ legacy: null })
    act(() => button().click())
    expect(rowTexts()).not.toContain('Earlier chat of this document')
  })

  it('filters by title and says when nothing matches', () => {
    render()
    act(() => button().click())
    setInput(search()!, 'bud')
    expect(rowTexts()).toEqual(['New chat', 'Budget', 'Earlier chat of this document'])
    setInput(search()!, 'zzz')
    expect(host.querySelector('.ai-project-empty')?.textContent).toBe('No matching chats')
  })

  it('chooses with the keyboard and the mouse', () => {
    const props = render()
    act(() => button().click())
    key(search()!, 'Home')
    expect(activeText()).toBe('New chat')
    key(search()!, 'ArrowDown')
    key(search()!, 'Enter')
    expect(props.onSelect).toHaveBeenCalledWith('b')
    act(() => button().click())
    act(() => rows()[0]!.click())
    expect(props.onNewChat).toHaveBeenCalledTimes(1)
    act(() => button().click())
    act(() => rows()[rows().length - 1]!.click())
    expect(props.onSelectLegacy).toHaveBeenCalledTimes(1)
  })

  it('renames a chat in place, committing only a changed, non-empty title', () => {
    const props = render()
    act(() => button().click())
    const outline = rows().find((r) => r.textContent?.includes('Outline'))!
    act(() => outline.querySelector<HTMLButtonElement>('[aria-label="Rename"]')!.click())
    const input = host.querySelector<HTMLInputElement>('.ai-project-rename')!
    expect(input.value).toBe('Outline')
    setInput(input, '   ')
    key(input, 'Enter')
    expect(props.onRename).not.toHaveBeenCalled()
    act(() =>
      rows()
        .find((r) => r.textContent?.includes('Outline'))!
        .querySelector<HTMLButtonElement>('[aria-label="Rename"]')!
        .click(),
    )
    const again = host.querySelector<HTMLInputElement>('.ai-project-rename')!
    setInput(again, 'Report outline')
    key(again, 'Enter')
    expect(props.onRename).toHaveBeenCalledWith('a', 'Report outline')
    expect(props.onSelect).not.toHaveBeenCalled()
    // the menu stays open after renaming
    expect(search()).not.toBeNull()
  })

  it('deletes a chat only after the row asks, without opening it', () => {
    const props = render()
    act(() => button().click())
    const notes = () => rows().find((r) => r.textContent?.includes('Notes'))!
    act(() => notes().querySelector<HTMLButtonElement>('[aria-label="Delete"]')!.click())
    // the row asks first; nothing is deleted yet
    expect(props.onDelete).not.toHaveBeenCalled()
    expect(notes().textContent).toContain('Notes')
    const confirm = notes().querySelector<HTMLButtonElement>('.ai-project-confirm-delete')!
    expect(document.activeElement).toBe(confirm)
    act(() => confirm.click())
    expect(props.onDelete).toHaveBeenCalledWith('c')
    expect(props.onSelect).not.toHaveBeenCalled()
    // the menu stays open, the row is back to normal
    expect(host.querySelector('.ai-project-confirm-delete')).toBeNull()
    expect(search()).not.toBeNull()
  })

  it('keeps the chat when the ask is cancelled or Esc is pressed', () => {
    const props = render()
    act(() => button().click())
    const outline = () => rows().find((r) => r.textContent?.includes('Outline'))!
    act(() => outline().querySelector<HTMLButtonElement>('[aria-label="Delete"]')!.click())
    const cancel = [...outline().querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === 'Cancel',
    )!
    act(() => cancel.click())
    expect(host.querySelector('.ai-project-confirm-delete')).toBeNull()
    act(() => outline().querySelector<HTMLButtonElement>('[aria-label="Delete"]')!.click())
    key(host.querySelector('.ai-project-confirm-delete')!, 'Escape')
    expect(host.querySelector('.ai-project-confirm-delete')).toBeNull()
    // Esc on the ask closes the ask, not the menu
    expect(search()).not.toBeNull()
    expect(props.onDelete).not.toHaveBeenCalled()
  })

  it('closes on Esc', () => {
    render()
    act(() => button().click())
    key(search()!, 'Escape')
    expect(search()).toBeNull()
    expect(document.activeElement).toBe(button())
  })
})
