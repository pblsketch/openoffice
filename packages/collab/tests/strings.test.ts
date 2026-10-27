import { describe, expect, it } from 'vitest'
import { LANGS, type Lang } from '@genoffice/i18n'
import { COLLAB_STRINGS, collabText, type CollabStringKey } from '../src/strings'

const KEYS = Object.keys(COLLAB_STRINGS.zh) as CollabStringKey[]
const NON_LATIN: readonly Lang[] = ['zh', 'ja', 'ko', 'th', 'ru', 'ar', 'he', 'hi', 'zh-TW']
/** "PIN" is the word itself in several scripts */
const SAME_AS_ENGLISH_OK: readonly CollabStringKey[] = ['pinLabel']

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('COLLAB_STRINGS', () => {
  it('has every key, non-empty, in all 21 languages', () => {
    expect(Object.keys(COLLAB_STRINGS).sort()).toEqual([...LANGS].sort())
    for (const lang of LANGS) {
      const dict = COLLAB_STRINGS[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual([...KEYS].sort())
      for (const key of KEYS) expect(dict[key]?.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
    }
  })

  it('keeps the same placeholders as the key-defining language', () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        expect(placeholders(COLLAB_STRINGS[lang][key]), `${lang}.${key}`).toEqual(
          placeholders(COLLAB_STRINGS.zh[key]),
        )
      }
    }
  })

  it('is translated, not copied from English, in non-Latin-script languages', () => {
    for (const lang of NON_LATIN) {
      for (const key of KEYS) {
        if (SAME_AS_ENGLISH_OK.includes(key)) continue
        expect(COLLAB_STRINGS[lang][key], `${lang}.${key}`).not.toBe(COLLAB_STRINGS.en[key])
      }
    }
  })

  it('fills placeholders and leaves unknown ones alone', () => {
    expect(collabText('en', 'foundBy', { name: 'Mina' })).toBe('shared by Mina')
    expect(collabText('ko', 'statusHosting', { count: 3 })).toBe('공유 중 · 3명')
    expect(collabText('en', 'foundBy')).toBe('shared by {name}')
  })
})
