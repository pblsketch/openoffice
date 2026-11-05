// @vitest-environment jsdom
/**
 * Fonts that are not on this PC (studio-plugin/pc-fonts.mjs): the editor draws them with
 * other fonts while the file keeps their names, so its font menu and font box mark them and
 * the app tells which of a document's fonts are drawn that way.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type PcFonts = typeof import('../studio-plugin/pc-fonts.mjs')

/**
 * The studio's view of this PC: Malgun Gothic found by its lookup, Cascadia Code a record its
 * lookup does not take under the name the font list shows, 바탕 found by its canvas probe.
 */
const probe = (source: string | null = 'local-font-access') => ({
  resolveLocalFont: (name: string) =>
    ['맑은 고딕', 'Malgun Gothic'].includes(name) ? { family: 'Malgun Gothic' } : null,
  records: () => [
    {
      family: 'Cascadia Code',
      fullName: 'Cascadia Code Regular',
      postscriptName: 'CascadiaCode-Regular',
      displayName: 'Cascadia Code Regular',
      aliases: ['Cascadia Code'],
    },
  ],
  detected: () => new Set(['바탕']),
  state: () => ({ source, count: 1, detectedAt: 1 }),
})

const labels = { tag: 'Not on this PC', hint: 'Drawn with another font; the file keeps the name.' }

let fonts: PcFonts
beforeEach(async () => {
  vi.resetModules()
  fonts = await import('../studio-plugin/pc-fonts.mjs')
})

describe('fontOnPc', () => {
  it('knows nothing before the studio hands over what it knows of the PC', () => {
    expect(fonts.fontOnPc('함초롬바탕')).toBeUndefined()
  })

  it('finds a font by its record or by the canvas probe, under the name as written', () => {
    fonts.installFontPresence(probe())
    expect(fonts.fontOnPc('맑은 고딕')).toBe(true)
    expect(fonts.fontOnPc('  바탕 ')).toBe(true)
    expect(fonts.fontOnPc('함초롬바탕')).toBe(false)
  })

  it("takes any name a record carries, as the studio's own font list shows it", () => {
    fonts.installFontPresence(probe())
    expect(fonts.fontOnPc('Cascadia Code Regular')).toBe(true)
    expect(fonts.fontOnPc('cascadiacode-regular')).toBe(true)
    expect(fonts.fontOnPc('Cascadia Mono')).toBe(false)
  })

  it('knows nothing while the kept records did not come from the PC list', () => {
    fonts.installFontPresence(probe('font-presence-probe'))
    expect(fonts.fontOnPc('함초롬바탕')).toBeUndefined()
    fonts.installFontPresence(probe(null))
    expect(fonts.fontOnPc('함초롬바탕')).toBeUndefined()
  })

  it('leaves generic families and font sets alone', () => {
    fonts.installFontPresence(probe())
    expect(fonts.fontOnPc('serif')).toBeUndefined()
    expect(fonts.fontOnPc('__fontset__한컴 기본')).toBeUndefined()
    expect(fonts.fontOnPc('')).toBeUndefined()
  })
})

describe('missingFonts', () => {
  it('names each missing font once, in the order the document gives them', () => {
    fonts.installFontPresence(probe())
    expect(
      fonts.missingFonts(['함초롬바탕', '맑은 고딕', '함초롬돋움', '함초롬바탕 ', 'serif', 7]),
    ).toEqual(['함초롬바탕', '함초롬돋움'])
  })

  it('names none while that is not known', () => {
    expect(fonts.missingFonts(['함초롬바탕'])).toEqual([])
  })
})

describe('the font menu', () => {
  const entry = (name: string) => {
    const button = document.createElement('button')
    button.textContent = name
    button.title = name
    fonts.markFontOption(button, name)
    return button
  }

  it('marks a missing font with the tag and the hint, and leaves a present one as it was', () => {
    fonts.installFontPresence(probe())
    fonts.setMissingFontLabels(labels)
    const missing = entry('함초롬바탕')
    expect(missing.textContent).toBe('함초롬바탕Not on this PC')
    expect(missing.title).toBe(`함초롬바탕: ${labels.hint}`)
    const present = entry('맑은 고딕')
    expect(present.textContent).toBe('맑은 고딕')
    expect(present.title).toBe('맑은 고딕')
  })

  it('marks nothing before the app gave its words', () => {
    fonts.installFontPresence(probe())
    expect(entry('함초롬바탕').textContent).toBe('함초롬바탕')
  })
})

describe('the font box', () => {
  const box = () => {
    const select = document.createElement('select')
    select.title = '글꼴'
    for (const name of ['함초롬바탕', '맑은 고딕']) select.add(new Option(name, name))
    return select
  }

  it('underlines a missing font whichever way the studio sets it, and gives its tooltip back after', () => {
    fonts.installFontPresence(probe())
    fonts.setMissingFontLabels(labels)
    const select = box()
    fonts.watchFontBox(select)
    select.value = '함초롬바탕'
    expect(select.value).toBe('함초롬바탕')
    expect(select.style.textDecoration).toBe('underline dotted')
    expect(select.title).toBe(`함초롬바탕: ${labels.hint}`)
    select.value = '맑은 고딕'
    expect(select.style.textDecoration).toBe('')
    expect(select.title).toBe('글꼴')
  })

  it('marks the font already shown once the words arrive and once the PC fonts are known', async () => {
    const select = box()
    fonts.watchFontBox(select)
    select.value = '함초롬바탕'
    expect(select.style.textDecoration).toBe('')
    fonts.installFontPresence(probe(null))
    fonts.setMissingFontLabels(labels)
    expect(select.style.textDecoration).toBe('')
    // the start-up look ends with the studio's records from the PC list
    let state: { source: string | null } = { source: null }
    fonts.installFontPresence({ ...probe(), state: () => state })
    const done = fonts.refreshPcFonts({
      queryLocalFonts: async () => {
        state = { source: 'local-font-access' }
        return []
      },
      loadStored: async () => {},
      records: () => [],
      detect: async () => {},
      changed: () => {},
    })
    await done
    await fonts.whenPcFontsSettled()
    expect(select.style.textDecoration).toBe('underline dotted')
  })
})
