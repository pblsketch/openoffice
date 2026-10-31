import { describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { strings } from '../src/renderer/i18n/strings'

describe('hwp renderer strings', () => {
  it('has every UI language', () => {
    expect(Object.keys(strings).sort()).toEqual([...LANGS].sort())
  })

  it('keeps the {name} placeholder of the backup notice in every language', () => {
    for (const lang of LANGS) {
      expect(strings[lang].backupKept, lang).toContain('{name}')
    }
  })

  it('keeps the page and total placeholders of the preview in every language', () => {
    for (const lang of LANGS) {
      expect(strings[lang].previewPageOf, lang).toContain('{page}')
      expect(strings[lang].previewPageOf, lang).toContain('{total}')
    }
  })

  it('translates rather than copies English outside English', () => {
    for (const lang of LANGS) {
      if (lang === 'en') continue
      expect(strings[lang].saveFailed, lang).not.toBe(strings.en.saveFailed)
      expect(strings[lang].aiEmptyBody, lang).not.toBe(strings.en.aiEmptyBody)
      expect(strings[lang].aiRevertRefused, lang).not.toBe(strings.en.aiRevertRefused)
      expect(strings[lang].checkTitle, lang).not.toBe(strings.en.checkTitle)
    }
  })

  it('keeps the placeholders of the AI panel labels in every language', () => {
    const placeholders = {
      aiToolFind: ['{text}', '{count}'],
      aiToolReadUrl: ['{host}', '{n}'],
      aiToolReadUrlFail: ['{host}'],
      aiToolFields: ['{count}'],
      aiToolFill: ['{name}'],
      aiToolNotDone: ['{what}'],
      aiToolInsert: ['{count}'],
      aiToolDelete: ['{text}'],
      aiToolTable: ['{rows}', '{cols}'],
      aiToolFormat: ['{text}'],
      aiToolTables: ['{count}'],
      aiToolReadTable: ['{table}'],
      aiToolFillCells: ['{table}', '{count}'],
      aiTableName: ['{table}'],
      aiScopeSelection: ['{words}'],
      aiSumImageAttachment: ['{name}'],
      aiSumReadAttachmentName: ['{name}'],
      aiImageReadFail: ['{name}'],
      aiTooManyImages: ['{max}'],
      aiTableRowsAdded: ['{count}'],
      aiTableColsAdded: ['{count}'],
      aiTableRowsRemoved: ['{count}'],
      aiTableColsRemoved: ['{count}'],
      aiFmtOff: ['{name}'],
      aiChangesTitle: ['{count}'],
      aiWorkedSteps: ['{n}'],
      checkMorePlaces: ['{count}'],
      checkReplaceWith: ['{font}'],
    } as const
    for (const lang of LANGS) {
      for (const [key, tokens] of Object.entries(placeholders)) {
        for (const token of tokens) {
          expect(strings[lang][key as keyof typeof placeholders], `${lang}.${key}`).toContain(token)
        }
      }
    }
  })
})
