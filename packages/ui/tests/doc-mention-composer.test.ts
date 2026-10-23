/** @vitest-environment jsdom */
import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiComposer } from '../src/AiComposer'
import { useComposerSkills } from '../src/use-composer-skills'
import type { AiComposerDocs, DocMentionAttachment } from '../src/use-doc-mention'
import type { AiSkillsBridge } from '../src/skill-picker-model'
import type { DocMentionItem, DocMentionListResult } from '../src/doc-mention-types'

const doc = (name: string, over: Partial<DocMentionItem> = {}): DocMentionItem => ({
  path: `C:\\docs\\${name}`,
  name,
  dir: 'C:\\docs',
  group: 'open',
  state: 'ok',
  ...over,
})

const ITEMS: DocMentionItem[] = [
  doc('옆 보고서.docx', { group: 'pane' }),
  doc('계획서.docx', { group: 'open', path: 'C:\\2학기\\계획서.docx', dir: 'C:\\2학기' }),
  doc('계획 예산.xlsx', { group: 'open', state: 'modified' }),
  doc('새 계획', { group: 'open', path: null, dir: '', state: 'unsaved' }),
  doc('계획 초안.hwpx', { group: 'recent' }),
]

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function stubDocsBridge(list: () => Promise<DocMentionListResult>) {
  const fn = vi.fn(list)
  vi.stubGlobal('aiOfficeDocs', {
    available: async () => true,
    pick: async () => ({ ok: false, reason: 'cancelled' }),
    list: fn,
  })
  return fn
}

const okList = (items: DocMentionItem[] = ITEMS) =>
  stubDocsBridge(async () => ({ ok: true, items }))

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await act(async () => await Promise.resolve())
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

interface Handles {
  sent: string[]
  stops: number
  attach: ReturnType<typeof vi.fn>
  pickMore: ReturnType<typeof vi.fn>
  attachments: () => DocMentionAttachment[]
}

function mount(
  options: {
    busy?: boolean
    docs?: boolean
    accept?: (paths: string[]) => string[]
    more?: () => Promise<string[] | null>
    attachments?: DocMentionAttachment[]
    skills?: AiSkillsBridge
  } = {},
): Handles {
  const handles = { sent: [] as string[], stops: 0 } as unknown as Handles
  const accept = options.accept ?? ((paths: string[]) => paths)
  let current: DocMentionAttachment[] = options.attachments ?? []
  handles.attachments = () => current
  function Panel() {
    const [value, setValue] = useState('')
    const [attachments, setAttachments] = useState<DocMentionAttachment[]>(
      options.attachments ?? [],
    )
    current = attachments
    const skills = useComposerSkills({ lang: 'ko', bridge: options.skills ?? null })
    const attach = vi.fn(async (paths: string[]) => {
      const ok = accept(paths)
      setAttachments((prev) => [
        ...prev,
        ...ok
          .filter((p) => !prev.some((a) => a.path === p))
          .map((p) => ({ path: p, name: p.split(/[\\/]/).pop() ?? p })),
      ])
      return ok
    })
    handles.attach ??= vi.fn()
    handles.attach.mockImplementation(attach)
    handles.pickMore ??= vi.fn(options.more ?? (async () => null))
    const docs: AiComposerDocs | undefined =
      options.docs === false
        ? undefined
        : {
            lang: 'ko',
            attach: (paths) => handles.attach(paths),
            pickMore: () => handles.pickMore(),
            attachments,
          }
    return createElement(AiComposer, {
      value,
      busy: options.busy ?? false,
      placeholder: '',
      hintIdle: '',
      hintBusy: '',
      sendLabel: 'send',
      stopLabel: 'stop',
      onChange: setValue,
      onSend: () => {
        handles.sent.push(value)
        setValue('')
      },
      onStop: () => {
        handles.stops += 1
      },
      skills: skills.composer,
      docs,
    })
  }
  act(() => root.render(createElement(Panel)))
  return handles
}

const textarea = () => host.querySelector('textarea') as HTMLTextAreaElement

function type(text: string, caret = text.length) {
  const ta = textarea()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(ta, text)
    ta.setSelectionRange(caret, caret)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** move the caret without changing the text (React reads it on keyup) */
function moveCaret(at: number) {
  const ta = textarea()
  act(() => {
    ta.focus()
    ta.setSelectionRange(at, at)
    ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }))
  })
}

function key(k: string, init: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  act(() => {
    textarea().dispatchEvent(ev)
  })
  return ev
}

const picker = () => host.querySelector('.ai-doc-mention-picker')
const rowTexts = () =>
  [...host.querySelectorAll('.ai-doc-mention-picker [role="option"]')].map((r) => r.textContent)
const activeRow = () =>
  host.querySelector('.ai-doc-mention-picker [role="option"][aria-selected="true"]')?.textContent

describe('AiComposer with docs: opening', () => {
  it('opens on @ with the groups, greyed reasons and the "Find more…" row last', async () => {
    okList()
    mount()
    type('@')
    await flush()
    expect(picker()).not.toBeNull()
    expect(picker()?.getAttribute('role')).toBe('listbox')
    const groups = [...host.querySelectorAll('.ai-doc-mention-group-label')].map(
      (g) => g.textContent,
    )
    expect(groups).toEqual(['옆 칸', '열린 문서', '최근 문서'])
    const rows = rowTexts()
    expect(rows).toHaveLength(ITEMS.length + 1)
    expect(rows[rows.length - 1]).toBe('더 찾아보기…')
    expect(host.textContent).toContain('저장하면 붙일 수 있어요')
    expect(host.textContent).toContain('저장 안 한 새 문서')
    expect(textarea().getAttribute('aria-expanded')).toBe('true')
    expect(textarea().getAttribute('aria-activedescendant')).toBeTruthy()
  })

  it('stays closed without a docs prop, without a bridge, or when the shell is unavailable', async () => {
    const list = okList()
    mount({ docs: false })
    type('@')
    await flush()
    expect(picker()).toBeNull()
    expect(list).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    act(() => root.unmount())
    root = createRoot(host)
    mount()
    type('@')
    await flush()
    expect(picker()).toBeNull()

    act(() => root.unmount())
    root = createRoot(host)
    stubDocsBridge(async () => ({ ok: false, reason: 'unavailable' }))
    mount()
    type('@')
    await flush()
    expect(picker()).toBeNull()
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('does not open on mail addresses, table refs or formulas', async () => {
    okList()
    mount()
    for (const text of ['a@b.com', '표[@열]', '=@A1']) {
      type(text)
      await flush()
      expect(picker(), text).toBeNull()
    }
  })

  it('fetches once per new @, is closed while fetching, filters across spaces', async () => {
    const answer = deferred<DocMentionListResult>()
    const list = stubDocsBridge(() => answer.promise)
    mount()
    type('@')
    await flush()
    expect(list).toHaveBeenCalledTimes(1)
    expect(picker()).toBeNull()
    act(() => answer.resolve({ ok: true, items: ITEMS }))
    await flush()
    expect(picker()).not.toBeNull()
    type('@계획')
    type('@계획 초')
    await flush()
    expect(list).toHaveBeenCalledTimes(1)
    expect(rowTexts()[0]).toContain('계획 초안.hwpx')
    type('@계획 초zzz')
    await flush()
    expect(picker()).toBeNull()
  })

  it('drops an answer that arrives after the @ changed', async () => {
    const first = deferred<DocMentionListResult>()
    const second = deferred<DocMentionListResult>()
    const answers = [first, second]
    const list = stubDocsBridge(() => answers.shift()!.promise)
    mount()
    type('@')
    await flush()
    // a different base @ further on
    type('@ x @')
    await flush()
    expect(list).toHaveBeenCalledTimes(2)
    act(() => first.resolve({ ok: true, items: [doc('old.docx')] }))
    await flush()
    expect(picker()).toBeNull()
    act(() => second.resolve({ ok: true, items: [doc('new.docx')] }))
    await flush()
    expect(rowTexts()[0]).toContain('new.docx')
    expect(host.textContent).not.toContain('old.docx')
  })

  it('does not open while a composition runs; an open list keeps its filter until it ends', async () => {
    okList()
    mount()
    act(() => {
      textarea().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    })
    type('@계')
    await flush()
    expect(picker()).toBeNull()
    act(() => {
      textarea().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    })
    await flush()
    expect(picker()).not.toBeNull()
    const before = rowTexts()
    act(() => {
      textarea().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    })
    type('@계획 초')
    await flush()
    expect(rowTexts()).toEqual(before)
  })

  it('Esc closes the list without stopping a run; the same @ stays closed, a new one opens', async () => {
    const list = okList()
    const h = mount({ busy: true })
    type('@')
    await flush()
    expect(picker()).not.toBeNull()
    const outer = vi.fn()
    document.addEventListener('keydown', outer)
    key('Escape')
    document.removeEventListener('keydown', outer)
    expect(outer).not.toHaveBeenCalled()
    expect(h.stops).toBe(0)
    expect(picker()).toBeNull()
    type('@계')
    await flush()
    expect(picker()).toBeNull()
    key('Escape')
    expect(h.stops).toBe(1)
    type('@계 @')
    await flush()
    expect(picker()).not.toBeNull()
    expect(list).toHaveBeenCalledTimes(2)
  })
})

describe('AiComposer with docs: composition and the same @', () => {
  const compose = (kind: 'compositionstart' | 'compositionend') =>
    act(() => {
      textarea().dispatchEvent(new CompositionEvent(kind, { bubbles: true }))
    })
  const blur = () =>
    act(() => {
      const ta = textarea()
      ta.focus()
      ta.blur()
    })

  it('an answer that arrives during a composition does not open the list until it ends', async () => {
    const answer = deferred<DocMentionListResult>()
    const list = stubDocsBridge(() => answer.promise)
    mount()
    type('@')
    await flush()
    expect(list).toHaveBeenCalledTimes(1)
    compose('compositionstart')
    act(() => answer.resolve({ ok: true, items: ITEMS }))
    await flush()
    expect(picker()).toBeNull()
    type('@계')
    await flush()
    expect(picker()).toBeNull()
    compose('compositionend')
    await flush()
    expect(picker()).not.toBeNull()
    expect(rowTexts()[0]).toContain('계획서.docx')
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('after Esc, leaving the input and coming back to the same @ keeps it closed', async () => {
    const list = okList()
    mount()
    type('@계')
    await flush()
    key('Escape')
    expect(picker()).toBeNull()
    blur()
    moveCaret(2)
    await flush()
    expect(picker()).toBeNull()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('after Esc, moving the caret before the @ or to another line and back keeps it closed', async () => {
    const list = okList()
    mount()
    type('메모 @계\n다음 줄', '메모 @계'.length)
    await flush()
    expect(picker()).not.toBeNull()
    key('Escape')
    moveCaret(1)
    await flush()
    moveCaret('메모 @계\n다음'.length)
    await flush()
    moveCaret('메모 @계'.length)
    await flush()
    expect(picker()).toBeNull()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('after Esc, edits before the @ do not make it a new @', async () => {
    const list = okList()
    mount()
    type('@계')
    await flush()
    key('Escape')
    type('앞 @계')
    await flush()
    expect(picker()).toBeNull()
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('an @ deleted and typed again is a new @: read again and open', async () => {
    const list = okList()
    mount()
    type('@계')
    await flush()
    key('Escape')
    type('계', 0)
    type('@계')
    await flush()
    expect(picker()).not.toBeNull()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('coming back to an @ that was not dismissed reuses its list', async () => {
    const list = okList()
    mount()
    type('@계\n다음 줄', 2)
    await flush()
    expect(picker()).not.toBeNull()
    blur()
    expect(picker()).toBeNull()
    moveCaret(2)
    await flush()
    expect(picker()).not.toBeNull()
    moveCaret('@계\n다음'.length)
    await flush()
    expect(picker()).toBeNull()
    moveCaret(2)
    await flush()
    expect(picker()).not.toBeNull()
    expect(list).toHaveBeenCalledTimes(1)
  })
})

describe('AiComposer with docs: picking', () => {
  it('↓ skips greyed rows; a greyed row does nothing when clicked', async () => {
    okList()
    const h = mount()
    type('@계획')
    await flush()
    // names starting with 계획: 계획서.docx, 계획 예산.xlsx (modified), 계획 초안.hwpx;
    // then names containing it: 새 계획 (unsaved)
    expect(rowTexts().map((r) => r?.split('C:')[0])).toEqual([
      '계획서.docx',
      '계획 예산.xlsx',
      '계획 초안.hwpx',
      '새 계획저장 안 한 새 문서',
      '더 찾아보기…',
    ])
    expect(activeRow()).toContain('계획서.docx')
    key('ArrowDown')
    expect(activeRow()).toContain('계획 초안.hwpx')
    key('ArrowDown')
    expect(activeRow()).toBe('더 찾아보기…')
    key('ArrowDown')
    expect(activeRow()).toContain('계획서.docx')
    key('ArrowUp')
    key('ArrowUp')
    expect(activeRow()).toContain('계획 초안.hwpx')
    const greyed = [...host.querySelectorAll('.ai-doc-mention-picker [role="option"]')].find((r) =>
      r.textContent?.includes('계획 예산.xlsx'),
    ) as HTMLElement
    expect(greyed.getAttribute('aria-disabled')).toBe('true')
    act(() => greyed.click())
    await flush()
    expect(h.attach).not.toHaveBeenCalled()
    expect(textarea().value).toBe('@계획')
  })

  it('with greyed rows only the list stays open and Enter goes to "Find more…"', async () => {
    okList()
    const h = mount()
    type('@예산')
    await flush()
    expect(picker()).not.toBeNull()
    expect(activeRow()).toBe('더 찾아보기…')
    key('ArrowDown')
    expect(activeRow()).toBe('더 찾아보기…')
    key('Enter')
    await flush()
    expect(h.attach).not.toHaveBeenCalled()
    expect(h.pickMore).toHaveBeenCalledTimes(1)
  })

  it('Enter attaches and puts @name in place of what was typed; the next Enter sends', async () => {
    okList()
    const h = mount()
    type('요약해 줘 @계획')
    await flush()
    key('Enter')
    await flush()
    expect(h.attach).toHaveBeenCalledWith(['C:\\2학기\\계획서.docx'])
    expect(textarea().value).toBe('요약해 줘 @계획서.docx ')
    expect(textarea().selectionStart).toBe('요약해 줘 @계획서.docx '.length)
    expect(picker()).toBeNull()
    key('Enter')
    await flush()
    expect(h.sent).toEqual(['요약해 줘 @계획서.docx '])
  })

  it('clicking a row picks it', async () => {
    okList()
    const h = mount()
    type('@')
    await flush()
    const row = [...host.querySelectorAll('.ai-doc-mention-picker [role="option"]')].find((r) =>
      r.textContent?.includes('옆 보고서.docx'),
    ) as HTMLElement
    act(() => row.click())
    await flush()
    expect(h.attach).toHaveBeenCalledWith(['C:\\docs\\옆 보고서.docx'])
    expect(textarea().value).toBe('@옆 보고서.docx ')
  })

  it('a refused attachment leaves the typed text alone', async () => {
    okList()
    const h = mount({ accept: () => [] })
    type('@계획')
    await flush()
    key('Enter')
    await flush()
    expect(h.attach).toHaveBeenCalledTimes(1)
    expect(textarea().value).toBe('@계획')
  })

  it('picking an attached document again inserts the text and keeps one attachment', async () => {
    okList()
    const h = mount()
    type('@계획')
    await flush()
    key('Enter')
    await flush()
    type('@계획서.docx @계획')
    await flush()
    key('Enter')
    await flush()
    expect(textarea().value).toBe('@계획서.docx @계획서.docx ')
    expect(h.attachments().map((a) => a.path)).toEqual(['C:\\2학기\\계획서.docx'])
  })

  it('adds the folder when the list holds another file of the same name', async () => {
    okList([...ITEMS, doc('계획서.docx', { path: 'C:\\1학기\\계획서.docx', group: 'recent' })])
    mount()
    type('@계획서')
    await flush()
    key('Enter')
    await flush()
    expect(textarea().value).toBe('@계획서.docx(2학기) ')
  })

  it('adds the folder when an attachment shares the name', async () => {
    okList()
    mount({ attachments: [{ path: 'D:\\1학기\\계획서.docx', name: '계획서.docx' }] })
    type('@계획서')
    await flush()
    key('Enter')
    await flush()
    expect(textarea().value).toBe('@계획서.docx(2학기) ')
  })

  it('"Find more…" puts the mentions of every accepted document in place of the query', async () => {
    okList()
    const h = mount({
      more: async () => ['C:\\x\\a.docx', 'C:\\y\\b.hwpx'],
    })
    type('비교 @계')
    await flush()
    key('ArrowUp')
    expect(activeRow()).toBe('더 찾아보기…')
    key('Enter')
    await flush()
    expect(h.pickMore).toHaveBeenCalledTimes(1)
    expect(textarea().value).toBe('비교 @a.docx @b.hwpx ')
  })

  it('"Find more…" cancelled or with nothing accepted leaves the text alone', async () => {
    okList()
    const h = mount({ more: async () => null })
    type('@계')
    await flush()
    key('ArrowUp')
    key('Enter')
    await flush()
    expect(h.pickMore).toHaveBeenCalledTimes(1)
    expect(textarea().value).toBe('@계')
  })
})

describe('AiComposer with docs: a picked mention', () => {
  async function pickPlan() {
    okList()
    const h = mount()
    type('@계획')
    await flush()
    key('Enter')
    await flush()
    expect(textarea().value).toBe('@계획서.docx ')
    return h
  }

  it('a caret moved back into a plain @query reopens the list', async () => {
    okList()
    mount()
    type('@계획 끝')
    await flush()
    expect(picker()).toBeNull()
    moveCaret(3)
    await flush()
    expect(picker()).not.toBeNull()
  })

  it('does not reopen with the caret inside or right after it', async () => {
    await pickPlan()
    moveCaret('@계획서.docx'.length)
    await flush()
    expect(picker()).toBeNull()
    moveCaret(3)
    await flush()
    expect(picker()).toBeNull()
  })

  it('survives edits before it', async () => {
    await pickPlan()
    type('요약 @계획서.docx ', '요약 @계획서.docx'.length)
    await flush()
    expect(picker()).toBeNull()
  })

  it('becomes plain text once one of its characters changes', async () => {
    await pickPlan()
    type('@계획서.doc', '@계획서.doc'.length)
    await flush()
    expect(picker()).not.toBeNull()
    expect(rowTexts()[0]).toContain('계획서.docx')
  })
})

describe('AiComposer: the skill list and the document list', () => {
  function skillsBridge(): AiSkillsBridge {
    return {
      list: vi.fn(async () => [
        {
          id: 'app:minutes',
          source: 'app',
          name: 'minutes',
          title: '회의록 정리',
          description: '',
          enabled: true,
        },
      ]),
      aiRead: vi.fn(async () => ({ ok: false })),
      openSettings: vi.fn(async () => {}),
      onChanged: () => () => {},
    }
  }

  it('opens only one: the trigger nearer the caret wins', async () => {
    okList([...ITEMS, doc('메모 /min.txt')])
    mount({ skills: skillsBridge() })
    await flush()
    // both lists have a match here (the skill by its name); the skill trigger is nearer
    type('@메모 /mi')
    await flush()
    expect(host.querySelector('.ai-skill-picker')).not.toBeNull()
    expect(picker()).toBeNull()
    type('/min @계')
    await flush()
    expect(host.querySelector('.ai-skill-picker')).toBeNull()
    expect(picker()).not.toBeNull()
  })

  it('Enter goes to the skill list while it is the open one', async () => {
    okList([...ITEMS, doc('메모 /min.txt')])
    const h = mount({ skills: skillsBridge() })
    await flush()
    type('@메모 /mi')
    await flush()
    key('Enter')
    await flush()
    expect(h.attach).not.toHaveBeenCalled()
    expect(textarea().value).toBe('@메모 ')
  })
})
