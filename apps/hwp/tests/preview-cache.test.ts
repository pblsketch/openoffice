import { describe, expect, it, vi } from 'vitest'
import { LruPages } from '../src/renderer/preview/preview-cache'

function cache(max = 3) {
  const disposed: Array<[number, string]> = []
  const pages = new LruPages<string>(max, (key, value) => disposed.push([key, value]))
  return { pages, disposed }
}

describe('the preview page cache', () => {
  it('keeps the pages it was given, most recently used last', () => {
    const { pages } = cache()
    pages.set(1, 'one')
    pages.set(2, 'two')
    expect(pages.get(1)).toBe('one')
    pages.set(3, 'three')
    pages.set(4, 'four')
    // two was the least recently used and goes
    expect(pages.has(2)).toBe(false)
    expect([pages.has(1), pages.has(3), pages.has(4)]).toEqual([true, true, true])
  })

  it('never evicts a page on the screen', () => {
    const { pages, disposed } = cache(2)
    pages.set(1, 'one')
    pages.set(2, 'two')
    pages.pin([1])
    pages.set(3, 'three')
    expect(pages.has(1)).toBe(true)
    expect(pages.has(3)).toBe(true)
    expect(pages.has(2)).toBe(false)
    expect(disposed).toEqual([[2, 'two']])
  })

  it('disposes a page that is replaced, deleted or cleared', () => {
    const { pages, disposed } = cache()
    pages.set(1, 'one')
    pages.set(1, 'new one')
    pages.set(2, 'two')
    pages.delete(2)
    pages.clear()
    expect(disposed).toEqual([
      [1, 'one'],
      [2, 'two'],
      [1, 'new one'],
    ])
    expect(pages.size).toBe(0)
  })

  it('rejects a cache with no room', () => {
    expect(() => new LruPages(0, () => {})).toThrow()
  })

  it('does not touch anything when an unknown page is deleted', () => {
    const dispose = vi.fn()
    const pages = new LruPages<string>(2, dispose)
    pages.delete(9)
    expect(dispose).not.toHaveBeenCalled()
  })
})
