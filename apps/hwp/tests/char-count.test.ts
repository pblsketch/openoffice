/**
 * The status bar's character count (studio-plugin/char-count.mjs, issue #295): the words it
 * shows, where it sits in the studio's status bar, and when it counts. Counting a long document
 * takes a while, so a key press only puts the count off; it runs once typing rests, after a
 * pause that follows how long the last count took.
 */
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAR_COUNT_ID,
  PAUSE_PER_COUNT,
  SELECTION_PAUSE_MS,
  TOTAL_PAUSE_MS,
  charCountItem,
  charCountText,
  charCounter,
  checkCharCountLabels,
  countCollector,
} from '../studio-plugin/char-count.mjs'

const KO = {
  total: '글자 {total}',
  selected: '글자 {selected} / {total}',
  hint: '공백 제외: 전체 {totalNoSpace}',
  hintSelected:
    '공백 포함: 고른 글자 {selected} / 전체 {total}. 공백 제외: 고른 글자 {selectedNoSpace} / 전체 {totalNoSpace}',
  locale: 'ko',
}

describe('the words of the count', () => {
  it('shows the document alone, or the block and the document', () => {
    const labels = checkCharCountLabels(KO)!
    expect(charCountText(labels, { chars: 12345, charsNoSpace: 10000 }, null)).toEqual({
      text: '글자 12,345',
      title: '공백 제외: 전체 10,000',
    })
    expect(
      charCountText(labels, { chars: 12345, charsNoSpace: 10000 }, { chars: 12, charsNoSpace: 9 }),
    ).toEqual({
      text: '글자 12 / 12,345',
      title: '공백 포함: 고른 글자 12 / 전체 12,345. 공백 제외: 고른 글자 9 / 전체 10,000',
    })
  })

  it('writes the numbers in the app language', () => {
    const labels = checkCharCountLabels({ ...KO, total: '{total}', locale: 'de' })!
    expect(charCountText(labels, { chars: 1234567, charsNoSpace: 0 }, null).text).toBe('1.234.567')
  })

  it('refuses labels it cannot show', () => {
    expect(checkCharCountLabels(null)).toBeNull()
    expect(checkCharCountLabels({ ...KO, hint: ' ' })).toBeNull()
    expect(checkCharCountLabels({ ...KO, hintSelected: undefined })).toBeNull()
    expect(checkCharCountLabels({ total: 'a', selected: 'b' })).toBeNull()
  })
})

describe('the count of a selection', () => {
  it('adds up the runs the selection walk hands it, as 문서 정보 counts', () => {
    const texts = ['가 나 다', 'abc\tdef', '']
    const box = { length: (k: number) => texts[k].length, text: (k: number) => texts[k] }
    const out = countCollector()
    out.add(box, 0, 2, Infinity) // '나 다'
    out.add(box, 1, 0, 7)
    out.add(box, 2, 0, Infinity) // nothing there
    expect(out.counts()).toEqual({ chars: 10, charsNoSpace: 8, runs: 2 })
    // a whole novel selected is counted whole
    expect(out.tooLong()).toBe(false)
  })

  it("cuts a run by the engine's characters, an emoji or 𠀀 being one", () => {
    // 웃음😀😀😀 끝𠀀말: nine characters to the engine, thirteen units in a JavaScript string
    const text = '웃음😀😀😀 끝𠀀말'
    const box = { length: () => [...text].length, text: () => text }
    const whole = countCollector()
    whole.add(box, 0, 0, Infinity)
    expect(whole.counts()).toEqual({ chars: 9, charsNoSpace: 8, runs: 1 })
    const tail = countCollector()
    tail.add(box, 0, 6, 9) // 끝𠀀말
    expect(tail.counts()).toEqual({ chars: 3, charsNoSpace: 3, runs: 1 })
  })
})

describe('the status bar item', () => {
  const page = () =>
    new JSDOM(
      '<footer id="status-bar"><button id="sb-page"></button><span class="stb-divider"></span>' +
        '<span id="sb-mode">삽입</span><span id="sb-message"></span></footer>',
    ).window.document

  it('sits right after the insert/overwrite mode, with a divider before it, once', () => {
    const doc = page()
    const item = charCountItem(doc)!
    expect(item.id).toBe(CHAR_COUNT_ID)
    expect(item.className).toBe('stb-item')
    const mode = doc.getElementById('sb-mode')!
    expect(mode.nextElementSibling?.className).toBe('stb-divider')
    expect(mode.nextElementSibling?.nextElementSibling).toBe(item)
    expect(charCountItem(doc)).toBe(item)
    expect(doc.querySelectorAll(`#${CHAR_COUNT_ID}`)).toHaveLength(1)
  })

  it('is not made where the studio has no status bar', () => {
    expect(charCountItem(new JSDOM('<body></body>').window.document)).toBeNull()
  })
})

describe('when it counts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function counter(costs: { total?: number; selection?: number } = {}) {
    let clock = 0
    const readTotal = vi.fn(() => {
      clock += costs.total ?? 0
      return { chars: 10, charsNoSpace: 8 }
    })
    let selection: { chars: number; charsNoSpace: number } | null = null
    const readSelection = vi.fn(() => {
      clock += costs.selection ?? 0
      return selection
    })
    const render = vi.fn()
    const count = charCounter({ readTotal, readSelection, render, now: () => clock, idle: null })
    return {
      count,
      readTotal,
      readSelection,
      render,
      select: (value: typeof selection) => {
        selection = value
      },
    }
  }

  it('counts once the page is free after it is put up', () => {
    const { count, readTotal, readSelection, render } = counter()
    count.start()
    expect(readTotal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(readTotal).toHaveBeenCalledTimes(1)
    expect(readSelection).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenLastCalledWith({ chars: 10, charsNoSpace: 8 }, null)
  })

  it('does not count the document for each key while typing, only when it rests', () => {
    const { count, readTotal } = counter()
    count.start()
    vi.advanceTimersByTime(0)
    readTotal.mockClear()
    for (let key = 0; key < 50; key += 1) {
      count.documentChanged()
      vi.advanceTimersByTime(TOTAL_PAUSE_MS / 2)
    }
    expect(readTotal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(TOTAL_PAUSE_MS)
    expect(readTotal).toHaveBeenCalledTimes(1)
  })

  it('counts the block once the selection rests', () => {
    const { count, readSelection, render, select } = counter()
    count.start()
    vi.advanceTimersByTime(0)
    readSelection.mockClear()
    select({ chars: 3, charsNoSpace: 2 })
    for (let move = 0; move < 20; move += 1) {
      count.selectionChanged()
      vi.advanceTimersByTime(SELECTION_PAUSE_MS - 1)
    }
    expect(readSelection).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(readSelection).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenLastCalledWith(
      { chars: 10, charsNoSpace: 8 },
      { chars: 3, charsNoSpace: 2 },
    )
  })

  it('waits longer after a count that took long, and still counts the whole document', () => {
    const slow = 400
    const { count, readTotal } = counter({ total: slow })
    count.start()
    vi.advanceTimersByTime(0)
    readTotal.mockClear()
    count.documentChanged()
    vi.advanceTimersByTime(slow * PAUSE_PER_COUNT - 1)
    expect(readTotal).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(readTotal).toHaveBeenCalledTimes(1)
  })

  it('waits for an idle moment once the pause is over, and counts whole then', () => {
    const readTotal = vi.fn(() => ({ chars: 10, charsNoSpace: 8 }))
    const readSelection = vi.fn(() => null)
    const idled: (() => void)[] = []
    const cancelled: number[] = []
    const count = charCounter({
      readTotal,
      readSelection,
      render: vi.fn(),
      idle: {
        request: (fn: () => void) => idled.push(fn),
        cancel: (id: number) => cancelled.push(id),
      },
    })
    count.start()
    vi.advanceTimersByTime(0)
    expect(readTotal).not.toHaveBeenCalled()
    expect(idled).toHaveLength(2)
    idled[0]()
    expect(readTotal).toHaveBeenCalledTimes(1)
    // an edit while a count waits for idle time puts it off again
    count.documentChanged()
    vi.advanceTimersByTime(TOTAL_PAUSE_MS)
    expect(idled).toHaveLength(4)
    count.documentChanged()
    expect(cancelled.length).toBeGreaterThan(0)
  })

  it('takes no event its own count raises for an edit', () => {
    const events = { raise: () => {} }
    // the count runs a command of the editor, which may tell of a change itself
    const readTotal = vi.fn(() => {
      events.raise()
      return { chars: 10, charsNoSpace: 8 }
    })
    const count = charCounter({
      readTotal,
      readSelection: () => null,
      render: vi.fn(),
      idle: null,
    })
    events.raise = () => {
      count.documentChanged()
      count.selectionChanged()
    }
    count.start()
    vi.advanceTimersByTime(0)
    expect(readTotal).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(TOTAL_PAUSE_MS * 20)
    expect(readTotal).toHaveBeenCalledTimes(1)
  })

  it('counts both again when another document is opened in the editor', () => {
    const { count, readTotal, readSelection } = counter()
    count.start()
    vi.advanceTimersByTime(0)
    readTotal.mockClear()
    readSelection.mockClear()
    count.documentSwapped()
    vi.advanceTimersByTime(0)
    expect(readTotal).toHaveBeenCalledTimes(1)
    expect(readSelection).toHaveBeenCalledTimes(1)
  })

  it('keeps the last numbers when a count fails, and stops for good', () => {
    const { count, readTotal, render } = counter()
    count.start()
    vi.advanceTimersByTime(0)
    readTotal.mockImplementation(() => {
      throw new Error('no document')
    })
    count.documentChanged()
    vi.advanceTimersByTime(TOTAL_PAUSE_MS)
    expect(render).toHaveBeenLastCalledWith({ chars: 10, charsNoSpace: 8 }, null)
    render.mockClear()
    count.stop()
    count.documentChanged()
    vi.advanceTimersByTime(TOTAL_PAUSE_MS * 10)
    expect(render).not.toHaveBeenCalled()
  })
})
