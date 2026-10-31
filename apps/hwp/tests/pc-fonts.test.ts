/**
 * The PC's fonts in the Hangul editor's font lists from the start (studio-plugin/pc-fonts.mjs):
 * the editor looks at the PC when it starts and detects anew only when the list changed.
 */
import { describe, expect, it, vi } from 'vitest'
import { refreshPcFonts, sameFaces } from '../studio-plugin/pc-fonts.mjs'

type Face = { family: string; fullName: string; postscriptName: string }
type Kept = Face & { aliases?: string[]; detectionSource?: string }

const malgun: Face = {
  family: 'Malgun Gothic',
  fullName: 'Malgun Gothic',
  postscriptName: 'MalgunGothicRegular',
}
const nanum: Face = {
  family: 'NanumGothic',
  fullName: 'NanumGothic',
  postscriptName: 'NanumGothic',
}

/** A record as the studio keeps it: the names it read from the file merged in. */
const kept = (face: Face, extra: Partial<Kept> = {}): Kept => ({
  ...face,
  aliases: [face.family, face.fullName, face.postscriptName, '맑은 고딕'],
  detectionSource: 'local-font-access',
  ...extra,
})

function studio(listed: Face[], records: Kept[], over: Record<string, unknown> = {}) {
  let current = records
  const calls: string[] = []
  const deps = {
    queryLocalFonts: vi.fn(async () => {
      calls.push('query')
      return listed
    }),
    loadStored: vi.fn(async () => {
      calls.push('stored')
    }),
    records: () => current,
    detect: vi.fn(async () => {
      calls.push('detect')
      current = listed.map((face) => kept(face))
    }),
    changed: vi.fn(() => calls.push('changed')),
    ...over,
  }
  return { deps, calls }
}

describe('sameFaces', () => {
  it('holds when every listed face is kept, under any of the names a record carries', () => {
    const record = kept(malgun, { postscriptName: 'malgungothicregular' })
    expect(sameFaces([malgun], [record])).toBe(true)
    // the enumeration gave a name the record keeps among its aliases only
    expect(sameFaces([{ ...malgun, postscriptName: '맑은 고딕' }], [kept(malgun)])).toBe(true)
  })

  it('fails for a font installed or removed since, even when the count stays', () => {
    expect(sameFaces([malgun, nanum], [kept(malgun)])).toBe(false)
    expect(sameFaces([malgun], [kept(malgun), kept(nanum)])).toBe(false)
    const gulim = { family: 'Gulim', fullName: 'Gulim', postscriptName: 'Gulim' }
    expect(sameFaces([malgun, gulim], [kept(malgun), kept(nanum)])).toBe(false)
  })

  it('leaves out the names the studio found by trying them, which the list never has', () => {
    const probed = kept(nanum, { detectionSource: 'font-presence-probe' })
    expect(sameFaces([malgun], [kept(malgun), probed])).toBe(true)
  })

  it('compares names as the studio does: case, spacing and Unicode form aside', () => {
    expect(
      sameFaces([{ ...malgun, postscriptName: ' MALGUNGOTHICREGULAR ' }], [kept(malgun)]),
    ).toBe(true)
    const spaced = { ...malgun, fullName: 'Malgun   Gothic', postscriptName: '' }
    expect(sameFaces([spaced], [kept(malgun)])).toBe(true)
    // a face without a PostScript name goes by its full name
    expect(
      sameFaces([{ ...nanum, postscriptName: '' }], [kept({ ...nanum, postscriptName: '' })]),
    ).toBe(true)
  })
})

describe('refreshPcFonts', () => {
  it('detects and tells the font lists on a first run, when nothing was kept', async () => {
    const { deps, calls } = studio([malgun, nanum], [])
    expect(await refreshPcFonts(deps)).toBe(true)
    expect(calls).toEqual(['stored', 'query', 'detect', 'changed'])
  })

  it('keeps the stored list, without reading the font files again, when the PC has the same fonts', async () => {
    const { deps, calls } = studio([malgun, nanum], [kept(malgun), kept(nanum)])
    expect(await refreshPcFonts(deps)).toBe(false)
    expect(calls).toEqual(['stored', 'query'])
  })

  it('detects anew when a font was installed since', async () => {
    const { deps } = studio([malgun, nanum], [kept(malgun)])
    expect(await refreshPcFonts(deps)).toBe(true)
    expect(deps.detect).toHaveBeenCalledTimes(1)
    expect(deps.changed).toHaveBeenCalledTimes(1)
  })

  it('leaves the kept list when the PC refuses or the runtime cannot list fonts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const refused = studio([], [kept(malgun)], {
      queryLocalFonts: vi.fn(async () => {
        throw new DOMException('Permission denied', 'NotAllowedError')
      }),
    })
    expect(await refreshPcFonts(refused.deps)).toBe(false)
    expect(refused.deps.detect).not.toHaveBeenCalled()
    expect(refused.deps.changed).not.toHaveBeenCalled()

    const empty = studio([], [kept(malgun)])
    expect(await refreshPcFonts(empty.deps)).toBe(false)
    expect(empty.deps.detect).not.toHaveBeenCalled()

    const none = studio([malgun], [], { queryLocalFonts: undefined })
    expect(await refreshPcFonts(none.deps)).toBe(false)
    expect(none.calls).toEqual([])
    warn.mockRestore()
  })

  it('waits until a tab opened behind another is shown', async () => {
    let state = 'hidden'
    const listeners = new Set<() => void>()
    const document = {
      get visibilityState() {
        return state
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }
    const { deps, calls } = studio([malgun], [], { document })
    const done = refreshPcFonts(deps)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toEqual([])
    state = 'visible'
    for (const listener of [...listeners]) listener()
    expect(await done).toBe(true)
    expect(listeners.size).toBe(0)
  })
})
