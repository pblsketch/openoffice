/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectListItem } from '@genoffice/project-store'
import { ProjectPicker, type ProjectPickerProps } from '../src/ProjectPicker'

const project = (over: Partial<ProjectListItem> & { id: string }): ProjectListItem => ({
  name: over.id,
  path: `C:\\Work\\${over.id}`,
  pinned: false,
  lastUsedAt: '2026-10-01T00:00:00.000Z',
  missing: false,
  unwritable: false,
  syncFolder: false,
  ...over,
})

const PROJECTS: ProjectListItem[] = [
  project({ id: 'recentOld', name: 'Old', lastUsedAt: '2026-09-01T00:00:00.000Z' }),
  project({ id: 'pinned', name: 'Pinned one', pinned: true }),
  project({ id: 'recentNew', name: 'New', lastUsedAt: '2026-10-28T00:00:00.000Z' }),
  project({ id: 'gone', name: 'Gone', missing: true, lastUsedAt: '2026-08-01T00:00:00.000Z' }),
]

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

function render(over: Partial<ProjectPickerProps> = {}) {
  const props: ProjectPickerProps = {
    lang: 'en',
    projects: PROJECTS,
    selectedId: null,
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onAddFolder: vi.fn(),
    onRelocate: vi.fn(),
    onSetPinned: vi.fn(),
    onOpenInFileManager: vi.fn(),
    onRemoveFromList: vi.fn(),
    onOpen: vi.fn(),
    ...over,
  }
  act(() => root.render(createElement(ProjectPicker, props)))
  return props
}

const chip = () => host.querySelector<HTMLButtonElement>('.ai-project-chip')!
const search = () => host.querySelector<HTMLInputElement>('.ai-project-search')
const rows = () => [...host.querySelectorAll<HTMLElement>('[role="option"]')]
const rowTexts = () => rows().map((r) => r.querySelector('.ai-project-row-name')?.textContent)
const activeText = () =>
  host.querySelector('[role="option"][aria-selected="true"] .ai-project-row-name')?.textContent

function openList() {
  act(() => chip().click())
}

function key(target: Element, k: string) {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

function type(text: string) {
  const input = search()!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('ProjectPicker', () => {
  it('shows "No project" on the chip and the chosen project’s name', () => {
    render()
    expect(chip().textContent).toBe('No project')
    expect(chip().getAttribute('aria-label')).toBe('Project: No project')
    render({ selectedId: 'recentNew' })
    expect(chip().textContent).toBe('New')
  })

  it('opens with pinned, then recent rows, then the fixed rows, focusing the search field', () => {
    const props = render()
    openList()
    expect(props.onOpen).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(search())
    expect(rowTexts()).toEqual([
      'Pinned one',
      'New',
      'Old',
      'Gone',
      'New project',
      'Add folder',
      'No project',
    ])
    const groups = [...host.querySelectorAll('[role="group"]')].map((g) =>
      g.getAttribute('aria-label'),
    )
    expect(groups).toEqual(['Pinned', 'Recent'])
    // nothing chosen: the highlight starts on "No project"
    expect(activeText()).toBe('No project')
  })

  it('filters on typing and offers to create a project when nothing matches', () => {
    const props = render()
    openList()
    type('old')
    expect(rowTexts()).toEqual(['Old', 'New project', 'Add folder', 'No project'])
    type('Field trip')
    expect(rowTexts()[0]).toBe('Create project “Field trip”')
    expect(rowTexts()[1]).toBe('Create somewhere else…')
    expect(activeText()).toBe('Create project “Field trip”')
    key(search()!, 'Enter')
    expect(props.onCreate).toHaveBeenCalledWith('Field trip', { otherPlace: false })
    expect(search()).toBeNull()
  })

  it('shows where a new project goes and offers another place', () => {
    const props = render({ lang: 'ko', defaultParentFolder: 'D:/Docs/IeumOffice' })
    openList()
    type('현장학습')
    const createRow = rows()[0]!
    expect(createRow.querySelector('.ai-project-row-path')?.textContent).toBe(
      '만들 곳: D:/Docs/IeumOffice/현장학습',
    )
    expect(rowTexts()[1]).toBe('다른 곳에 만들기…')
    key(search()!, 'ArrowDown')
    key(search()!, 'Enter')
    // the renderer names no place: main asks for the parent folder itself
    expect(props.onCreate).toHaveBeenCalledWith('현장학습', { otherPlace: true })
  })

  it('leaves the location out while the default folder is not known', () => {
    render()
    openList()
    type('Field trip')
    expect(rows()[0]!.querySelector('.ai-project-row-path')).toBeNull()
  })

  it('asks for a name when "+ New project" is chosen with nothing typed', () => {
    const props = render({ lang: 'ko' })
    openList()
    const newRow = () => rows().find((r) => r.textContent === '새 프로젝트')!
    act(() => newRow().click())
    expect(props.onCreate).not.toHaveBeenCalled()
    // the list stays open with the focus in the search field and the hint
    expect(document.activeElement).toBe(search())
    expect(search()!.placeholder).toBe('새 프로젝트 이름을 입력하세요')
    const hint = host.querySelector('.ai-project-hint')
    expect(hint?.textContent).toBe('새 프로젝트 이름을 입력하세요')
    expect(search()!.getAttribute('aria-describedby')).toBe(hint?.id)
    type('예산')
    expect(host.querySelector('.ai-project-hint')).toBeNull()
    key(search()!, 'Enter')
    expect(props.onCreate).toHaveBeenCalledWith('예산', { otherPlace: false })
  })

  it('takes the typed text as the name for "+ New project"', () => {
    const props = render()
    openList()
    type('old')
    act(() =>
      rows()
        .find((r) => r.textContent === 'New project')!
        .click(),
    )
    expect(props.onCreate).toHaveBeenCalledWith('old', { otherPlace: false })
  })

  it('moves with ↑/↓ and chooses with Enter', () => {
    const props = render({ selectedId: 'pinned' })
    openList()
    expect(activeText()).toBe('Pinned one')
    key(search()!, 'ArrowDown')
    expect(activeText()).toBe('New')
    key(search()!, 'ArrowUp')
    key(search()!, 'ArrowUp')
    // wraps from the top to "No project"
    expect(activeText()).toBe('No project')
    key(search()!, 'ArrowDown')
    key(search()!, 'ArrowDown')
    key(search()!, 'Enter')
    expect(props.onSelect).toHaveBeenCalledWith('recentNew')
    expect(document.activeElement).toBe(chip())
  })

  it('points the search field at the highlighted row for screen readers', () => {
    render()
    openList()
    const id = search()!.getAttribute('aria-activedescendant')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)?.getAttribute('aria-selected')).toBe('true')
    expect(search()!.getAttribute('aria-controls')).toBe(host.querySelector('[role="listbox"]')!.id)
  })

  it('dims a missing folder and asks to relocate it instead of choosing it', () => {
    const props = render()
    openList()
    const gone = rows().find((r) => r.textContent?.includes('Gone'))!
    expect(gone.classList.contains('is-missing')).toBe(true)
    expect(gone.textContent).toContain('Folder missing')
    // no "open folder" for a folder that is gone
    expect(gone.querySelector('[aria-label="Open folder"]')).toBeNull()
    act(() => gone.click())
    expect(props.onRelocate).toHaveBeenCalledWith('gone')
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('runs the hover actions without choosing the row', () => {
    const props = render()
    openList()
    const pinnedRow = rows().find((r) => r.textContent?.includes('Pinned one'))!
    act(() => pinnedRow.querySelector<HTMLButtonElement>('[aria-label="Unpin"]')!.click())
    expect(props.onSetPinned).toHaveBeenCalledWith('pinned', false)
    const newRow = rows().find((r) => r.textContent?.startsWith('New') && r.title.includes('New'))!
    act(() => newRow.querySelector<HTMLButtonElement>('[aria-label="Pin"]')!.click())
    expect(props.onSetPinned).toHaveBeenCalledWith('recentNew', true)
    act(() => newRow.querySelector<HTMLButtonElement>('[aria-label="Open folder"]')!.click())
    expect(props.onOpenInFileManager).toHaveBeenCalledWith('recentNew')
    act(() => newRow.querySelector<HTMLButtonElement>('[aria-label="Remove from list"]')!.click())
    expect(props.onRemoveFromList).toHaveBeenCalledWith('recentNew')
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('maps the fixed rows to their callbacks', () => {
    const props = render({ selectedId: 'pinned' })
    openList()
    act(() =>
      rows()
        .find((r) => r.textContent === 'Add folder')!
        .click(),
    )
    expect(props.onAddFolder).toHaveBeenCalledTimes(1)
    openList()
    act(() =>
      rows()
        .find((r) => r.textContent === 'No project')!
        .click(),
    )
    expect(props.onSelect).toHaveBeenCalledWith(null)
  })

  it('closes on Esc without letting the key reach the panel', () => {
    const panelKeys = vi.fn()
    const props = render()
    // the panel around the picker listens for Esc to stop a run
    act(() =>
      root.render(
        createElement('div', { onKeyDown: panelKeys }, createElement(ProjectPicker, props)),
      ),
    )
    openList()
    const event = key(search()!, 'Escape')
    expect(event.defaultPrevented).toBe(true)
    expect(search()).toBeNull()
    expect(panelKeys).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(chip())
  })

  it('shows the list in Korean', () => {
    render({ lang: 'ko', projects: [] })
    openList()
    expect(host.querySelector('.ai-project-empty')?.textContent).toBe('아직 프로젝트가 없습니다')
    expect(rowTexts()).toEqual(['새 프로젝트', '폴더 추가', '프로젝트 없이'])
  })
})
