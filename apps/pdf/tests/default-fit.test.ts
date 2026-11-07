import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIT_KEY,
  MAX_SCALE,
  loadDefaultView,
  openingView,
  saveDefaultView,
} from '../src/renderer/view-config'

const memoryStorage = () => {
  const mem = new Map<string, string>()
  return {
    mem,
    storage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    },
  }
}

describe('default view for a PDF without a saved view', () => {
  it('starts on fit width, the old behaviour', () => {
    const { storage } = memoryStorage()
    expect(loadDefaultView(storage)).toBe('width')
  })

  it.each(['width', 'page', 'actual'] as const)('remembers %s across a reload', (view) => {
    const { mem, storage } = memoryStorage()
    saveDefaultView(view, storage)
    expect(mem.get(DEFAULT_FIT_KEY)).toBe(view)
    expect(loadDefaultView(storage)).toBe(view)
  })

  it('reads a fit page choice stored by an earlier version', () => {
    const { mem, storage } = memoryStorage()
    mem.set(DEFAULT_FIT_KEY, 'page')
    expect(loadDefaultView(storage)).toBe('page')
  })

  it('falls back to fit width for an unknown stored value', () => {
    const { mem, storage } = memoryStorage()
    mem.set(DEFAULT_FIT_KEY, 'book')
    expect(loadDefaultView(storage)).toBe('width')
  })

  it('opens a file with no saved position in the default view', () => {
    expect(openingView(null, 'width')).toEqual({ fitMode: 'width' })
    expect(openingView(null, 'page')).toEqual({ fitMode: 'page' })
    expect(openingView(null, 'actual')).toEqual({ fitMode: null, scale: 1 })
  })

  it.each(['width', 'page', 'actual'] as const)(
    'keeps a saved fit mode or custom zoom over the %s default',
    (fallback) => {
      expect(openingView({ fitMode: 'page', scale: 0.7 }, fallback)).toEqual({ fitMode: 'page' })
      expect(openingView({ fitMode: 'width', scale: 1.4 }, fallback)).toEqual({ fitMode: 'width' })
      expect(openingView({ fitMode: null, scale: 1.5 }, fallback)).toEqual({
        fitMode: null,
        scale: 1.5,
      })
    },
  )

  it('keeps a saved custom zoom inside the zoom range', () => {
    expect(openingView({ fitMode: null, scale: 40 }, 'actual')).toEqual({
      fitMode: null,
      scale: MAX_SCALE,
    })
  })

  it('keeps working when storage is unavailable', () => {
    const storage = {
      getItem: (): string | null => {
        throw new Error('denied')
      },
      setItem: (): void => {
        throw new Error('denied')
      },
    }
    expect(loadDefaultView(storage)).toBe('width')
    expect(() => saveDefaultView('actual', storage)).not.toThrow()
  })
})
