import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANGS, type Lang } from '@genoffice/i18n'
import {
  BUILTIN_SKILL_NAMES,
  BUILTIN_SKILL_STRINGS,
  builtinSkillDesc,
  isBuiltinSkillName,
  type BuiltinSkillStringKey,
} from '../src/strings-builtin-skills'

const KEYS = Object.keys(BUILTIN_SKILL_STRINGS.zh) as BuiltinSkillStringKey[]

/** Languages written in another script: a value equal to the English one is an untranslated copy */
const NON_LATIN: readonly Lang[] = ['zh', 'ja', 'ko', 'th', 'ru', 'ar', 'he', 'hi', 'zh-TW']

const MANIFEST = join(__dirname, '../../../apps/shell/resources/builtin-skills/builtin-skills.json')

describe('BUILTIN_SKILL_STRINGS', () => {
  it('covers all 21 ui languages', () => {
    expect(LANGS).toHaveLength(21)
    expect(Object.keys(BUILTIN_SKILL_STRINGS).sort()).toEqual([...LANGS].sort())
  })

  it('has only a description key (no title key) for every built-in skill', () => {
    const expected = BUILTIN_SKILL_NAMES.map((name) => `builtinSkillDesc.${name}`)
    expect([...KEYS].sort()).toEqual(expected.sort())
  })

  it('has every key, non-empty, in every language', () => {
    for (const lang of LANGS) {
      const dict = BUILTIN_SKILL_STRINGS[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual([...KEYS].sort())
      for (const key of KEYS) {
        expect(dict[key]?.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('is translated, not copied from English, in every non-Latin-script language', () => {
    for (const lang of NON_LATIN) {
      for (const key of KEYS) {
        expect(BUILTIN_SKILL_STRINGS[lang][key], `${lang}.${key}`).not.toBe(
          BUILTIN_SKILL_STRINGS.en[key],
        )
      }
    }
  })

  it('names no vendor product in any description', () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        expect(BUILTIN_SKILL_STRINGS[lang][key], `${lang}.${key}`).not.toMatch(
          /claude|anthropic|openai|chatgpt|codex/i,
        )
      }
    }
  })

  it('resolves descriptions through the accessor', () => {
    expect(builtinSkillDesc('ko', 'humanizer')).toBe(
      '글에서 AI가 쓴 티가 나는 표현을 찾아 내용은 그대로 두고 자연스럽게 고칩니다.',
    )
    expect(builtinSkillDesc('en', 'find-skills')).toMatch(/agent window/)
    expect(isBuiltinSkillName('humanizer')).toBe(true)
    expect(isBuiltinSkillName('docx')).toBe(false)
  })

  it('does not limit humanizer to English text, while copy-editing still says English', () => {
    expect(builtinSkillDesc('en', 'humanizer')).toBe(
      'Finds phrasing that sounds AI-written and makes it natural without changing what it says.',
    )
    expect(builtinSkillDesc('en', 'humanizer')).not.toMatch(/english/i)
    expect(builtinSkillDesc('ko', 'humanizer')).not.toMatch(/영어/)
    expect(builtinSkillDesc('en', 'copy-editing')).toMatch(/English/)
    expect(builtinSkillDesc('ko', 'copy-editing')).toMatch(/영어/)
  })

  it('lists the same skills as the shipped builtin-skills.json', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { name: string }[]
    expect(manifest.map((e) => e.name).sort()).toEqual([...BUILTIN_SKILL_NAMES].sort())
  })
})
