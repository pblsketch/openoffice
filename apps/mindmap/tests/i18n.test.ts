// @vitest-environment node
/**
 * The dictionaries: 21 languages, one key set, real translations. A missing
 * key is a type error already (each shard is checked against `zh`); these
 * tests catch what the types cannot.
 */
import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import {
  ARROW_SHAPES,
  BOUNDARY_SHAPES,
  BRANCH_LINE_SHAPES,
  LINE_PATTERNS,
  RELATIONSHIP_SHAPES,
  SUMMARY_SHAPES,
  THEME_BAND_IDS,
  THEME_SKELETON_IDS,
  THEME_VARIANT_IDS,
} from '@genoffice/xmind-engine'
import { strings } from '../src/renderer/i18n/strings'
import { mapStrings } from '../src/renderer/i18n/map-strings'
import { BAND_NAME, SKELETON_NAME, VARIANT_NAME } from '../src/renderer/components/ThemePanel'
import {
  ARROW_NAME,
  BOUNDARY_SHAPE_NAME,
  BRANCH_SHAPE_NAME,
  PATTERN_NAME,
  RELATIONSHIP_SHAPE_NAME,
  SUMMARY_SHAPE_NAME,
} from '../src/renderer/components/FormatPanel'

const placeholders = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort()
const keys = Object.keys(strings.zh) as (keyof typeof strings.zh)[]

describe('the editor dictionaries', () => {
  it('cover all 21 languages with the same keys and no empty text', () => {
    expect(Object.keys(strings).sort()).toEqual([...LANGS].sort())
    for (const lang of LANGS) {
      expect(Object.keys(strings[lang]).sort(), lang).toEqual([...keys].sort())
      for (const key of keys) expect(strings[lang][key].trim(), `${lang}.${key}`).not.toBe('')
    }
  })

  it('keep the same placeholders in every language', () => {
    for (const lang of LANGS) {
      for (const key of keys) {
        expect(placeholders(strings[lang][key]), `${lang}.${key}`).toEqual(
          placeholders(strings.en[key]),
        )
      }
    }
  })

  it('are translated: a language with its own script does not carry the English sentence', () => {
    const ownScript: (keyof typeof strings)[] = [
      'zh',
      'zh-TW',
      'ja',
      'ko',
      'th',
      'ru',
      'ar',
      'he',
      'hi',
    ]
    for (const lang of ownScript) {
      for (const key of keys) {
        const english = strings.en[key]
        // short technical words (OK, a bare placeholder) may coincide; sentences may not
        if (english.length < 8) continue
        expect(strings[lang][key], `${lang}.${key}`).not.toBe(english)
      }
    }
  })

  it('name no other product: the file format is not a product name of this editor', () => {
    for (const lang of LANGS) {
      for (const key of keys) {
        expect(strings[lang][key], `${lang}.${key}`).not.toMatch(/xmind/i)
        expect(strings[lang][key], `${lang}.${key}`).not.toMatch(/IeumOffice|이음오피스/)
      }
    }
  })

  it('name every shape, band and ground of a theme in every language, each differently', () => {
    expect(Object.keys(SKELETON_NAME).sort()).toEqual([...THEME_SKELETON_IDS].sort())
    expect(Object.keys(BAND_NAME).sort()).toEqual([...THEME_BAND_IDS].sort())
    expect(Object.keys(VARIANT_NAME).sort()).toEqual([...THEME_VARIANT_IDS].sort())
    for (const lang of LANGS) {
      for (const names of [SKELETON_NAME, BAND_NAME, VARIANT_NAME]) {
        const shown = Object.values(names).map((key) => strings[lang][key])
        expect(new Set(shown).size, `${lang}: ${shown.join(', ')}`).toBe(shown.length)
        // short names for a small panel
        for (const name of shown) expect(name.length, `${lang}: ${name}`).toBeLessThanOrEqual(20)
      }
    }
  })

  it('name the markers and a picture that is not shown in every language', () => {
    for (const lang of LANGS) {
      const { decoration } = mapStrings(lang)
      expect(decoration.priority, lang).toHaveLength(9)
      expect(decoration.progress, lang).toHaveLength(9)
      expect(new Set(decoration.priority).size, lang).toBe(9)
      expect(new Set(decoration.progress).size, lang).toBe(9)
      expect(decoration.priority[0], lang).toContain('1')
      expect(decoration.progress[4], lang).toContain('50')
      expect(decoration.progress[8], lang).toContain('100')
      for (const text of [
        ...decoration.priority,
        ...decoration.progress,
        decoration.flag,
        decoration.star,
        decoration.otherMarker,
        decoration.pictureNotShown,
      ]) {
        expect(text.trim(), lang).not.toBe('')
        expect(text, lang).not.toMatch(/\{\w+\}/)
      }
    }
  })

  it('name every shape, end and line style of the format panel in every language, each differently', () => {
    const groups = [
      [BRANCH_SHAPE_NAME, BRANCH_LINE_SHAPES],
      [RELATIONSHIP_SHAPE_NAME, RELATIONSHIP_SHAPES],
      [ARROW_NAME, ARROW_SHAPES],
      [SUMMARY_SHAPE_NAME, SUMMARY_SHAPES],
      [BOUNDARY_SHAPE_NAME, BOUNDARY_SHAPES],
      [PATTERN_NAME, LINE_PATTERNS],
    ] as const
    for (const [names, values] of groups) {
      expect(Object.keys(names).sort()).toEqual([...values].sort())
    }
    for (const lang of LANGS) {
      for (const [names] of groups) {
        const shown = Object.values(names).map((key) => strings[lang][key])
        expect(new Set(shown).size, `${lang}: ${shown.join(', ')}`).toBe(shown.length)
        for (const name of shown) expect(name.length, `${lang}: ${name}`).toBeLessThanOrEqual(30)
      }
      // a thickness keeps its number
      expect(strings[lang].lineWidthPoints, lang).toContain('{n}')
      // "add boundary" is an entry of the map's own menu too
      expect(mapStrings(lang).menuAddBoundary, lang).toBe(strings[lang].tbBoundary)
    }
  })

  it('name the two sides of the text | line switch in every language, short and differently', () => {
    for (const lang of LANGS) {
      const sides = [strings[lang].formatTextSection, strings[lang].formatLineSection]
      expect(sides[0], lang).not.toBe(sides[1])
      // two buttons side by side in a narrow panel
      for (const side of sides) expect(side.length, `${lang}: ${side}`).toBeLessThanOrEqual(12)
    }
  })

  it('give the map its own menu in every language, all twelve entries', () => {
    for (const lang of LANGS) {
      const menu = mapStrings(lang).menu
      expect(Object.keys(menu).sort(), lang).toEqual(
        [
          'addChild',
          'addParent',
          'addSibling',
          'cancelFocus',
          'clickTips',
          'focus',
          'link',
          'linkBidirectional',
          'moveDown',
          'moveUp',
          'removeNode',
          'summary',
        ].sort(),
      )
      for (const text of Object.values(menu)) expect(text.trim(), lang).not.toBe('')
      if (lang !== 'en') expect(menu.addChild, lang).not.toBe(mapStrings('en').menu.addChild)
    }
  })
})
