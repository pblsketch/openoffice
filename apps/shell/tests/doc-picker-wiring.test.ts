import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { docPickerStrings, docPickerText } from '../src/renderer/src/i18n/strings-doc-picker'
import { DOC_PICK_MAX } from '../src/renderer/src/doc-picker/DocPickerWindow'

/**
 * The "Attach from GenOffice documents" window: every string exists in all 21
 * languages, the product name is written as the GenOffice token and localized
 * at output, the tick is capped, and the page deals in ids only.
 */

const src = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('doc-picker strings', () => {
  const keys = Object.keys(docPickerStrings.zh).sort()

  it('fills every key in all 21 languages', () => {
    expect(LANGS).toHaveLength(21)
    for (const lang of LANGS) {
      const dict = docPickerStrings[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual(keys)
      for (const key of keys) expect(dict[key].trim(), `${lang}.${key}`).not.toBe('')
    }
  })

  it('keeps the {n} placeholder in the selected-count line of every language', () => {
    for (const lang of LANGS) {
      const dict = docPickerStrings[lang] as Record<string, string>
      expect(dict.docPickSelected, lang).toContain('{n}')
    }
  })

  it('writes the product name as the GenOffice token, localized at output', () => {
    for (const lang of LANGS) {
      const dict = docPickerStrings[lang] as Record<string, string>
      for (const value of Object.values(dict)) expect(value, lang).not.toMatch(/IeumOffice/)
    }
    expect(docPickerText('ko', 'docPickTitle')).toContain('이음오피스')
    expect(docPickerText('en', 'docPickTitle')).toContain('IeumOffice')
  })
})

describe('the document picker page', () => {
  const page = src('../src/renderer/src/doc-picker/DocPickerWindow.tsx')

  it('caps the tick at the plan’s 20 documents', () => {
    expect(DOC_PICK_MAX).toBe(20)
  })

  it('deals in ids only, never a path', () => {
    expect(page).not.toMatch(/\.path\b|item\.path|d\.path/)
    expect(page).not.toMatch(/from 'electron'/)
  })

  it('reaches the shell only through list, choose and cancel', () => {
    expect(page).toMatch(/api\s*\.list\(\)/)
    expect(page).toMatch(/api\s*\.choose\(\[\.\.\.selected\]\)/)
    expect(page).toMatch(/api\s*\.cancel\(\)/)
  })
})
