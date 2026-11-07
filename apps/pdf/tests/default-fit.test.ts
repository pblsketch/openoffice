import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIT_KEY,
  MAX_SCALE,
  loadDefaultView,
  openingView,
  saveDefaultView,
} from '../src/renderer/view-config'
import { VIEW_STATE_KEY, loadViewState, saveViewState } from '../src/renderer/view-state'

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

  it('opens a file with no chosen zoom in the default view', () => {
    expect(openingView(null, 'width')).toEqual({ fitMode: 'width' })
    expect(openingView(null, 'page')).toEqual({ fitMode: 'page' })
    expect(openingView(null, 'actual')).toEqual({ fitMode: null, scale: 1 })
  })

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

describe('how a PDF opens once 100% is the default', () => {
  const opensAt = (path: string, records: Record<string, unknown>) => {
    const { storage } = memoryStorage()
    storage.setItem(VIEW_STATE_KEY, JSON.stringify(records))
    const saved = loadViewState(path, storage)
    return { page: saved?.page ?? 1, view: openingView(saved?.chosenZoom ?? null, 'actual') }
  }

  it('opens a file never opened before at 100%', () => {
    expect(opensAt('/new.pdf', {})).toEqual({ page: 1, view: { fitMode: null, scale: 1 } })
  })

  it('opens a file an older build saved at fit width at 100%, on the same page', () => {
    const records = { '/seen.pdf': { page: 4, frac: 0.3, scale: 1.03, fitMode: 'width', at: 1 } }
    expect(opensAt('/seen.pdf', records)).toEqual({ page: 4, view: { fitMode: null, scale: 1 } })
  })

  it('keeps a custom zoom an older build saved', () => {
    const records = { '/seen.pdf': { page: 4, frac: 0.3, scale: 1.5, fitMode: null, at: 1 } }
    expect(opensAt('/seen.pdf', records)).toEqual({ page: 4, view: { fitMode: null, scale: 1.5 } })
  })

  it.each([
    [{ fitMode: 'width' as const }, { fitMode: 'width' }],
    [{ fitMode: 'page' as const }, { fitMode: 'page' }],
    [
      { fitMode: null, scale: 2 },
      { fitMode: null, scale: 2 },
    ],
  ])('keeps the zoom the person chose for the file: %o', (zoom, expected) => {
    const { storage } = memoryStorage()
    saveViewState('/chosen.pdf', { page: 2, frac: 0, chosenZoom: zoom }, storage)
    const saved = loadViewState('/chosen.pdf', storage)
    expect(openingView(saved?.chosenZoom ?? null, 'actual')).toEqual(expected)
  })

  it('opens a file whose zoom was never chosen in the default after it was saved', () => {
    const { storage } = memoryStorage()
    saveViewState('/plain.pdf', { page: 6, frac: 0.5, chosenZoom: null }, storage)
    const saved = loadViewState('/plain.pdf', storage)
    expect(saved?.page).toBe(6)
    expect(openingView(saved?.chosenZoom ?? null, 'page')).toEqual({ fitMode: 'page' })
  })
})
