/** @vitest-environment jsdom */
import { act, createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProjectFolderHintLine,
  ProjectMemoryConsolidatedLine,
  MEMORY_ALREADY_GONE_MS,
  memoryRemoveOutcome,
  ProjectMemoryEventLine,
  ProjectNoticeLine,
  ProjectNoticeList,
  ProjectToolSummaryLine,
} from '../src/ProjectNotices'

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

const show = (element: ReactElement) => act(() => root.render(element))
const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('button')]
const text = () =>
  host.querySelector('.ai-project-notice-text, .ai-project-event-text')?.textContent

describe('ProjectNoticeLine', () => {
  it('opens the project screen at the changed section from [View]', () => {
    const onView = vi.fn()
    show(
      createElement(ProjectNoticeLine, {
        lang: 'ko',
        notice: { kind: 'instructions-changed', files: ['instructions'] },
        onView,
      }),
    )
    expect(text()).toBe('지침이 바뀌었습니다')
    act(() => buttons()[0]!.click())
    expect(onView).toHaveBeenCalledWith('instructions')
    show(
      createElement(ProjectNoticeLine, { lang: 'ko', notice: { kind: 'memory-changed' }, onView }),
    )
    act(() => buttons()[0]!.click())
    expect(onView).toHaveBeenLastCalledWith('memory')
  })

  it('offers [Tidy up] for long memory', () => {
    const onConsolidate = vi.fn()
    show(
      createElement(ProjectNoticeLine, {
        lang: 'en',
        notice: { kind: 'memory-long', chars: 9000, limit: 8000 },
        onConsolidate,
      }),
    )
    expect(buttons().map((b) => b.textContent)).toEqual(['Tidy up'])
    act(() => buttons()[0]!.click())
    expect(onConsolidate).toHaveBeenCalledTimes(1)
  })

  it('draws no button without a handler, and marks the unwritable folder as a warning', () => {
    show(createElement(ProjectNoticeLine, { lang: 'en', notice: { kind: 'unwritable' } }))
    expect(buttons()).toHaveLength(0)
    expect(host.querySelector('.ai-project-notice')?.classList.contains('warning')).toBe(true)
    expect(host.querySelector('[role="status"]')).not.toBeNull()
  })

  it('adds a close button with onDismiss', () => {
    const onDismiss = vi.fn()
    show(
      createElement(ProjectNoticeLine, {
        lang: 'en',
        notice: { kind: 'sync-folder', service: 'google-drive' },
        onDismiss,
      }),
    )
    expect(text()).toBe(
      'This is a sync folder, so instructions, memory and chats are uploaded to that service too',
    )
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!.click())
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('lists several notices in order and dismisses by index', () => {
    const onDismiss = vi.fn()
    show(
      createElement(ProjectNoticeList, {
        lang: 'en',
        notices: [
          { kind: 'instructions-truncated', chars: 40000, limit: 32000 },
          { kind: 'unwritable' },
        ],
        onDismiss,
      }),
    )
    const lines = [...host.querySelectorAll('.ai-project-notice')]
    expect(lines.map((l) => l.getAttribute('data-notice'))).toEqual([
      'instructions-truncated',
      'unwritable',
    ])
    act(() => lines[1]!.querySelector<HTMLButtonElement>('[aria-label="Dismiss"]')!.click())
    expect(onDismiss).toHaveBeenCalledWith(1)
    show(createElement(ProjectNoticeList, { lang: 'en', notices: [] }))
    expect(host.innerHTML).toBe('')
  })
})

describe('ProjectFolderHintLine', () => {
  it('names the unregistered project folder and offers [Use]', () => {
    const onUse = vi.fn()
    show(
      createElement(ProjectFolderHintLine, {
        lang: 'ko',
        hint: { name: '학급 운영', folderPath: 'D:\\학급 운영' },
        onUse,
      }),
    )
    expect(text()).toBe('이 문서는 ‘학급 운영’ 프로젝트 폴더에 있습니다')
    expect(buttons().map((b) => b.textContent)).toEqual(['사용'])
    act(() => buttons()[0]!.click())
    expect(onUse).toHaveBeenCalledTimes(1)
  })
})

describe('memory and tool lines', () => {
  it('offers [Remove] only for an added entry', () => {
    const onRemove = vi.fn()
    show(
      createElement(ProjectMemoryEventLine, {
        lang: 'ko',
        change: { op: 'add', text: '보고서는 개조식' },
        onRemove,
      }),
    )
    expect(text()).toBe('기억함: 보고서는 개조식')
    act(() => buttons()[0]!.click())
    expect(onRemove).toHaveBeenCalledTimes(1)
    show(
      createElement(ProjectMemoryEventLine, {
        lang: 'ko',
        change: { op: 'replace', old: 'a', new: 'b' },
        onRemove,
      }),
    )
    expect(text()).toBe('기억 고침: b')
    expect(buttons()).toHaveLength(0)
    show(
      createElement(ProjectMemoryEventLine, {
        lang: 'ko',
        change: { op: 'remove', text: 'c' },
        onRemove,
      }),
    )
    expect(text()).toBe('기억 지움: c')
    expect(buttons()).toHaveLength(0)
  })

  it('reads "removed" with nothing to press once the added entry is gone from the memory', () => {
    const onRemove = vi.fn()
    show(
      createElement(ProjectMemoryEventLine, {
        lang: 'ko',
        change: { op: 'add', text: '회비는 2만 원' },
        gone: true,
        onRemove,
      }),
    )
    expect(text()).toBe('기억 지움: 회비는 2만 원')
    expect(buttons()).toHaveLength(0)
  })

  it('says for a moment that a memory was already removed when [Remove] finds it gone', async () => {
    vi.useFakeTimers()
    try {
      show(
        createElement(ProjectMemoryEventLine, {
          lang: 'ko',
          change: { op: 'add', text: '회비는 2만 원' },
          onRemove: async () => 'already-gone' as const,
        }),
      )
      await act(async () => {
        buttons()[0]!.click()
        await Promise.resolve()
      })
      expect(host.textContent).toContain('이미 지운 기억입니다')
      await act(async () => {
        vi.advanceTimersByTime(MEMORY_ALREADY_GONE_MS + 10)
      })
      expect(host.textContent).not.toContain('이미 지운 기억입니다')
    } finally {
      vi.useRealTimers()
    }
  })

  it('turns an edit result into what [Remove] came to', () => {
    expect(memoryRemoveOutcome({ status: 'ok' })).toBe('removed')
    expect(memoryRemoveOutcome({ status: 'refused', reason: 'not-found' })).toBe('already-gone')
    expect(memoryRemoveOutcome({ status: 'refused', reason: 'unwritable' })).toBe('failed')
    expect(memoryRemoveOutcome(null)).toBe('failed')
  })

  it('reports a consolidation with [Undo]', () => {
    const onUndo = vi.fn()
    show(createElement(ProjectMemoryConsolidatedLine, { lang: 'ko', before: 9, after: 4, onUndo }))
    expect(text()).toBe('기억을 정리했습니다(9개 → 4개)')
    expect(buttons().map((b) => b.textContent)).toEqual(['되돌리기'])
    act(() => buttons()[0]!.click())
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('summarizes another editor’s tools in one line that does not expand', () => {
    show(
      createElement(ProjectToolSummaryLine, {
        lang: 'ko',
        editor: 'hwp',
        documentName: '보고서.hwp',
        count: 3,
      }),
    )
    expect(text()).toBe('한글 ‘보고서.hwp’에서 도구 3번 실행')
    expect(buttons()).toHaveLength(0)
  })
})
