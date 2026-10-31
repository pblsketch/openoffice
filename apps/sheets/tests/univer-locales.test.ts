import { LocaleType } from '@univerjs/core'
import { describe, expect, it, vi } from 'vitest'

import {
  applyNumfmtLocale,
  applyUniverLocale,
  insertRowsBelowLocale,
  numberAsTextAlertLocale,
  univerLocaleFor,
} from '../src/renderer/univer-locales'
import { numfmtLocaleFor } from '../src/renderer/i18n/numfmt-locale'

vi.mock('@univerjs/preset-sheets-core', () => ({
  SheetsNumfmtCellContentController: class SheetsNumfmtCellContentController {},
}))

describe('univerLocaleFor', () => {
  it('maps every app language Univer has packs for', () => {
    expect(univerLocaleFor('zh')).toBe(LocaleType.ZH_CN)
    expect(univerLocaleFor('zh-TW')).toBe(LocaleType.ZH_TW)
    expect(univerLocaleFor('ja')).toBe(LocaleType.JA_JP)
    expect(univerLocaleFor('ko')).toBe(LocaleType.KO_KR)
    expect(univerLocaleFor('ar')).toBe(LocaleType.AR_SA)
  })

  it('falls back to English where Univer ships no pack', () => {
    for (const lang of ['en', 'th', 'nl', 'ms', 'he', 'hi']) {
      expect(univerLocaleFor(lang)).toBeNull()
    }
  })

  it('zh packs resolve and localize the DV rule name', async () => {
    const pack = (await import('@univerjs/preset-sheets-data-validation/locales/zh-CN')) as {
      default: Record<string, { list?: { name?: string } }>
    }
    expect(pack.default['sheets-data-validation']?.list?.name).toBe('值必须是列表中的值')
  })
})

describe('numberAsTextAlertLocale', () => {
  it('replaces the "Error" titles and keeps the rest of the namespaces', async () => {
    const core = (await import('@univerjs/preset-sheets-core/locales/en-US')).default as Record<
      string,
      Record<string, unknown>
    >
    const coreUi = core['sheets-ui'] as { info: Record<string, string> }
    const patched = numberAsTextAlertLocale(core)
    const numfmt = patched['sheets-numfmt-ui'] as { info: Record<string, string> }
    const ui = patched['sheets-ui'] as { info: Record<string, string> }
    expect(numfmt.info.error).toBe('Number stored as text')
    expect(ui.info.error).toBe('Number stored as text')
    expect(numfmt.info.forceStringInfo).toMatch(/stored as text/)
    expect(ui.info.forceStringInfo).toBe(numfmt.info.forceStringInfo)
    expect(Object.keys(numfmt).length).toBe(Object.keys(core['sheets-numfmt-ui'] ?? {}).length)
    expect(Object.keys(ui).length).toBe(Object.keys(coreUi).length)
    for (const key of Object.keys(coreUi.info)) {
      expect(ui.info).toHaveProperty(key)
    }
  })

  it('localizes the title from the numfmt pack', async () => {
    const core = (await import('@univerjs/preset-sheets-core/locales/zh-CN')).default as Record<
      string,
      Record<string, unknown>
    >
    const patched = numberAsTextAlertLocale(core)
    const coreNumfmt = core['sheets-numfmt-ui'] as { info: Record<string, string> }
    const title = (patched['sheets-numfmt-ui'] as { info: Record<string, string> }).info.error
    expect(title).not.toBe(coreNumfmt.info.error)
    expect(title).toBe(coreNumfmt.info.forceStringInfo)
    expect((patched['sheets-ui'] as { info: Record<string, string> }).info.error).toBe(title)
  })
})

describe('insertRowsBelowLocale', () => {
  it('rewords the English insert-rows-after entry to "rows below"', async () => {
    const core = (await import('@univerjs/preset-sheets-core/locales/en-US')).default as Record<
      string,
      Record<string, unknown>
    >
    const patched = insertRowsBelowLocale(core)
    const rightClick = (patched['sheets-ui'] as { rightClick: Record<string, string> }).rightClick
    const coreRightClick = (core['sheets-ui'] as { rightClick: Record<string, string> }).rightClick
    expect(rightClick.insertRowsAfterSuffix).toBe('rows below')
    expect(rightClick.insertRowsAboveSuffix).toBe(coreRightClick.insertRowsAboveSuffix)
    expect(Object.keys(rightClick).length).toBe(Object.keys(coreRightClick).length)
  })

  it('composes with the number-as-text patch (both survive the shallow merge)', async () => {
    const core = (await import('@univerjs/preset-sheets-core/locales/en-US')).default as Record<
      string,
      Record<string, unknown>
    >
    const patched = insertRowsBelowLocale(numberAsTextAlertLocale(core))
    const ui = patched['sheets-ui'] as {
      info: Record<string, string>
      rightClick: Record<string, string>
    }
    expect(ui.info.error).toBe('Number stored as text')
    expect(ui.rightClick.insertRowsAfterSuffix).toBe('rows below')
  })

  it('leaves translated packs untouched', async () => {
    const core = (await import('@univerjs/preset-sheets-core/locales/zh-CN')).default as Record<
      string,
      Record<string, unknown>
    >
    const patched = insertRowsBelowLocale(core)
    expect(patched['sheets-ui']).toBe(core['sheets-ui'])
  })
})

describe('numfmt locale', () => {
  it('maps UI languages to numfmt tags, with English for Malay', () => {
    expect(numfmtLocaleFor('ko')).toBe('ko-KR')
    expect(numfmtLocaleFor('zh-TW')).toBe('zh-TW')
    expect(numfmtLocaleFor('he')).toBe('he-IL')
    expect(numfmtLocaleFor('ms')).toBe('en')
    expect(numfmtLocaleFor('not-a-language')).toBe('en')
  })

  function fakeRuntime(setNumfmtLocal: (locale: string) => void) {
    return {
      univer: {
        __getInjector: () => ({
          get: () => ({ setNumfmtLocal }),
        }),
      },
    } as never
  }

  it('passes the UI language to Univer’s number-format controller', () => {
    const seen: string[] = []
    applyNumfmtLocale(
      fakeRuntime((locale) => seen.push(locale)),
      'ko',
    )
    expect(seen).toEqual(['ko-KR'])
  })

  it('still localizes number formats where Univer has no UI pack', async () => {
    const seen: string[] = []
    await applyUniverLocale(
      fakeRuntime((locale) => seen.push(locale)),
      'nl',
    )
    expect(seen).toEqual(['nl-NL'])
  })
})
