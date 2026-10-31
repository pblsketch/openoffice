import { describe, expect, it, vi } from 'vitest'

import { createSystemFontSource, type SystemFontEnv } from '../src/system-fonts'

type Doc = NonNullable<SystemFontEnv['document']>

function fakeDocument(visible: boolean) {
  let state: DocumentVisibilityState = visible ? 'visible' : 'hidden'
  const listeners = new Set<() => void>()
  const doc = {
    get visibilityState() {
      return state
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  } as unknown as Doc
  return {
    doc,
    listeners,
    show() {
      state = 'visible'
      for (const listener of [...listeners]) listener()
    },
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe('createSystemFontSource', () => {
  it('starts on preload, without waiting for a picker to open', async () => {
    const query = vi.fn(async () => [{ family: 'Malgun Gothic' }, { family: 'Arial' }])
    const source = createSystemFontSource(async () => [], {
      queryLocalFonts: query,
      document: fakeDocument(true).doc,
    })
    source.preload()
    await settle()
    expect(query).toHaveBeenCalledTimes(1)
    expect(source.get().families).toEqual(['Arial', 'Malgun Gothic'])
  })

  it('lists the families before the main process answers with the Korean names', async () => {
    const info = deferred<Array<[string, { ko: string; hangul: boolean }]>>()
    const source = createSystemFontSource(() => info.promise, {
      queryLocalFonts: async () => [{ family: 'NanumGothic' }],
    })
    const seen: string[][] = []
    source.subscribe(() => seen.push([...source.get().families]))
    source.load()
    await settle()
    expect(source.get().families).toEqual(['NanumGothic'])
    expect(source.get().info.size).toBe(0)
    info.resolve([['NanumGothic', { ko: '나눔고딕', hangul: true }]])
    await settle()
    expect(source.get().info.get('NanumGothic')?.ko).toBe('나눔고딕')
    expect(seen).toEqual([['NanumGothic'], ['NanumGothic']])
  })

  it('waits for a hidden page to be shown, since the enumeration refuses a hidden page', async () => {
    const query = vi.fn(async () => [{ family: 'Arial' }])
    const page = fakeDocument(false)
    const source = createSystemFontSource(async () => [], {
      queryLocalFonts: query,
      document: page.doc,
    })
    source.preload()
    await settle()
    expect(query).not.toHaveBeenCalled()
    page.show()
    await settle()
    expect(query).toHaveBeenCalledTimes(1)
    expect(page.listeners.size).toBe(0)
    expect(source.get().families).toEqual(['Arial'])
  })

  it('tries again on the next open after a refused or empty enumeration', async () => {
    const query = vi
      .fn<() => Promise<{ family: string }[]>>()
      .mockRejectedValueOnce(new DOMException('User activation is required', 'SecurityError'))
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ family: 'Arial' }])
    const source = createSystemFontSource(async () => [], { queryLocalFonts: query })
    source.preload()
    await settle()
    expect(source.get().families).toEqual([])
    source.load()
    await settle()
    expect(source.get().families).toEqual([])
    source.load()
    await settle()
    expect(source.get().families).toEqual(['Arial'])
    source.load()
    await settle()
    expect(query).toHaveBeenCalledTimes(3)
  })

  it('runs one enumeration at a time and preloads once', async () => {
    const list = deferred<{ family: string }[]>()
    const query = vi.fn(() => list.promise)
    const source = createSystemFontSource(async () => [], { queryLocalFonts: query })
    source.preload()
    source.preload()
    source.load()
    list.resolve([{ family: 'Arial' }])
    await settle()
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('still asks for the info of an empty enumeration and keeps the list working without it', async () => {
    const familyInfo = vi.fn(async (families: readonly string[]) =>
      families.length === 0
        ? ([['Pretendard', { hangul: true }]] as Array<[string, { hangul: boolean }]>)
        : Promise.reject(new Error('main process gone')),
    )
    const empty = createSystemFontSource(familyInfo, { queryLocalFonts: undefined })
    empty.load()
    await settle()
    expect(familyInfo).toHaveBeenCalledWith([])
    expect(empty.get().info.get('Pretendard')?.hangul).toBe(true)

    const failing = createSystemFontSource(familyInfo, {
      queryLocalFonts: async () => [{ family: 'Arial' }],
    })
    failing.load()
    await settle()
    expect(failing.get().families).toEqual(['Arial'])
  })

  it('runs the start-up load when the page is idle', async () => {
    const idle: Array<() => void> = []
    const query = vi.fn(async () => [{ family: 'Arial' }])
    const source = createSystemFontSource(async () => [], {
      queryLocalFonts: query,
      whenIdle: (run) => idle.push(run),
    })
    source.preload()
    await settle()
    expect(query).not.toHaveBeenCalled()
    idle.forEach((run) => run())
    await settle()
    expect(source.get().families).toEqual(['Arial'])
  })
})
