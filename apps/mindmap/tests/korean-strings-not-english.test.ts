import { describe, expect, it } from 'vitest'
import { strings } from '../src/renderer/i18n/strings'

// Korean values that are rightly the same as the English: product, font and format names.
const SAME_IN_KOREAN = new Set<string>([])

describe('Korean strings', () => {
  it('has no English text left in place of a translation', () => {
    const en: Record<string, string> = strings.en
    const ko: Record<string, string> = strings.ko
    const english = Object.keys(en).filter(
      (key) =>
        !SAME_IN_KOREAN.has(key) &&
        ko[key] === en[key] &&
        /[A-Za-z]{3,}/.test(en[key]!.replace(/\{\w+\}/g, '')),
    )
    expect(english).toEqual([])
  })
})
