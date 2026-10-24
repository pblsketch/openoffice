import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FIT_KEY,
  loadDefaultFit,
  openingFitMode,
  saveDefaultFit,
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

describe('default fit for a PDF without a saved view', () => {
  it('starts on fit width, the old behaviour', () => {
    const { storage } = memoryStorage()
    expect(loadDefaultFit(storage)).toBe('width')
  })

  it('remembers fit page', () => {
    const { mem, storage } = memoryStorage()
    saveDefaultFit('page', storage)
    expect(mem.get(DEFAULT_FIT_KEY)).toBe('page')
    expect(loadDefaultFit(storage)).toBe('page')
  })

  it('falls back to fit width for an unknown stored value', () => {
    const { mem, storage } = memoryStorage()
    mem.set(DEFAULT_FIT_KEY, 'book')
    expect(loadDefaultFit(storage)).toBe('width')
  })

  it('keeps a saved fit mode or custom zoom over the default', () => {
    expect(openingFitMode({ fitMode: 'page' }, 'width')).toBe('page')
    expect(openingFitMode({ fitMode: 'width' }, 'page')).toBe('width')
    expect(openingFitMode({ fitMode: null }, 'page')).toBeNull()
  })

  it('uses the default for a file with no saved position', () => {
    expect(openingFitMode(null, 'page')).toBe('page')
    expect(openingFitMode(null, 'width')).toBe('width')
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
    expect(loadDefaultFit(storage)).toBe('width')
    expect(() => saveDefaultFit('page', storage)).not.toThrow()
  })
})
