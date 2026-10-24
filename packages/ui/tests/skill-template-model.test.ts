/**
 * The template flow's plain rules (spec 5.6, 5.7): which chip's template a
 * request uses, what a new tab takes over, and how an editor's document is
 * named when it goes along as a template.
 */
import { describe, expect, it } from 'vitest'
import { LANGS, type Lang } from '@genoffice/i18n'
import {
  chipRefForSkill,
  handedRequestOf,
  isTemplateMissing,
  previewEndedOf,
  previewOpenResultOf,
  previewOriginalOf,
  templateChoice,
  templateDocumentOf,
  templateOpenResultOf,
} from '../src/skill-template-model'
import { SKILL_TEMPLATE_STRINGS, type SkillTemplateStringKey } from '../src/strings-skill-template'
import type { SkillChipView } from '../src/skill-picker-model'

const chip = (id: string, title: string, extra: Partial<SkillChipView> = {}): SkillChipView => ({
  id,
  source: 'app',
  title,
  ...extra,
})

describe('which template a request uses', () => {
  it('uses the only template', () => {
    const letter = chip('app:letter', 'Letter', { template: true })
    expect(templateChoice({ skill: letter, chips: [chip('app:tone', 'Tone'), letter] })).toEqual({
      skill: letter,
      several: false,
    })
  })

  it('uses the first of two templates and says so', () => {
    const report = chip('app:report', 'Report', { template: true })
    const letter = chip('app:letter', 'Letter', { template: true })
    const choice = templateChoice({ skill: letter, chips: [report, chip('app:x', 'X'), letter] })
    expect(choice.skill.id).toBe('app:report')
    expect(choice.several).toBe(true)
  })

  it('counts a template whose file is gone (it is the one that cannot be opened)', () => {
    const gone = chip('app:gone', 'Gone', { templateMissing: true })
    const letter = chip('app:letter', 'Letter', { template: true })
    const choice = templateChoice({ skill: letter, chips: [gone, letter] })
    expect(choice.skill.id).toBe('app:gone')
    expect(choice.several).toBe(true)
  })

  it('tells a missing template from other failures', () => {
    expect(isTemplateMissing('no-template')).toBe(true)
    expect(isTemplateMissing('not-found')).toBe(true)
    expect(isTemplateMissing('failed')).toBe(false)
    expect(templateOpenResultOf({ ok: true, tabId: 't3' })).toEqual({ ok: true, tabId: 't3' })
    expect(templateOpenResultOf({ ok: false, reason: 'no-template' })).toEqual({
      ok: false,
      reason: 'no-template',
    })
    expect(templateOpenResultOf(null)).toEqual({ ok: false, reason: 'failed' })
  })

  it('makes the chip of a skill the model used, titled by the skill name', () => {
    expect(chipRefForSkill({ id: 'app:letter', name: 'letter', title: 'Letter' })).toEqual({
      id: 'app:letter',
      source: 'app',
      title: 'letter',
    })
    expect(chipRefForSkill({ id: 'plugin:p:x', name: 'x', title: 'X' }).source).toBe('plugin')
  })

  it('titles a builtin chip by its name and a made-up name by its title', () => {
    expect(
      chipRefForSkill({ id: 'builtin:humanizer', name: 'humanizer', title: 'Humanizer' }),
    ).toEqual({ id: 'builtin:humanizer', source: 'builtin', title: 'humanizer' })
    expect(
      chipRefForSkill({ id: 'app:skill-a1b2c3', name: 'skill-a1b2c3', title: '가정통신문' }).title,
    ).toBe('가정통신문')
  })
})

describe('what a new tab takes over', () => {
  const preview = {
    previewId: 'p1',
    title: 'Report',
    fileName: 'report.docx',
    originalRedacted: false,
    proposal: { key: 'k1', title: 'Report', name: 'report', description: 'd', body: 'b' },
    draft: { title: 'My report', invoke: 'manual', withTemplate: false, extra: 1 },
  }

  it('reads a request with its chips for its own editor only', () => {
    const raw = {
      id: 'h1',
      mode: 'skill',
      target: 'hwp',
      text: 'for Friday',
      chips: [{ id: 'app:letter', source: 'app', title: 'Letter' }, { bad: true }],
      createdAt: 1,
    }
    expect(handedRequestOf(raw, 'hwp')).toEqual({
      id: 'h1',
      text: 'for Friday',
      chips: [{ id: 'app:letter', source: 'app', title: 'Letter' }],
    })
    expect(handedRequestOf(raw, 'docs')).toBeNull()
    expect(handedRequestOf({ ...raw, mode: 'ai' }, 'hwp')).toBeNull()
    expect(handedRequestOf(null, 'hwp')).toBeNull()
  })

  it('carries the pending proposal of a preview, wanting its template', () => {
    const taken = handedRequestOf(
      { id: 'h2', mode: 'skill', target: 'docs', text: 'clear', chips: [], preview },
      'docs',
    )
    expect(taken?.preview).toEqual({
      previewId: 'p1',
      title: 'Report',
      fileName: 'report.docx',
      originalRedacted: false,
      proposal: {
        key: 'k1',
        title: 'Report',
        name: 'report',
        description: 'd',
        body: 'b',
        wantsTemplate: true,
        target: undefined,
      },
      draft: { title: 'My report', invoke: 'manual' },
    })
  })

  it('treats an unknown redaction answer as redacted', () => {
    const { originalRedacted: _dropped, ...rest } = preview
    const taken = handedRequestOf(
      { id: 'h3', mode: 'skill', target: 'docs', text: '', chips: [], preview: rest },
      'docs',
    )
    expect(taken?.preview?.originalRedacted).toBe(true)
  })

  it('reads the shell answers of a preview', () => {
    expect(previewOpenResultOf({ ok: true, tabId: 't1', previewId: 'p' })).toEqual({
      ok: true,
      tabId: 't1',
      previewId: 'p',
    })
    expect(previewOpenResultOf({ ok: true, tabId: 't1' }).ok).toBe(false)
    const bytes = new Uint8Array([1])
    expect(previewOriginalOf({ ok: true, bytes, fileName: 'a.docx' })).toEqual({
      bytes,
      fileName: 'a.docx',
    })
    expect(previewOriginalOf({ ok: false })).toBeNull()
    expect(previewEndedOf({ previewId: 'p', outcome: 'saved', skillId: 'app:x' })).toEqual({
      previewId: 'p',
      outcome: 'saved',
      skillId: 'app:x',
    })
    expect(previewEndedOf({ previewId: 'p', outcome: 'maybe' })).toBeNull()
  })
})

describe("an editor's document as a template", () => {
  const bytes = async () => new Uint8Array([1])

  it('is named by its file and keeps its format', () => {
    const doc = templateDocumentOf({
      filePath: 'C:\\work\\가정통신문.hwpx',
      extensions: ['hwp', 'hwpx'],
      defaultExtension: 'hwp',
      untitledTitle: () => 'Untitled',
      bytes,
    })
    expect(doc?.fileName).toBe('가정통신문.hwpx')
    expect(doc?.title).toBe('가정통신문')
  })

  it('names a new document by its title, read when asked', () => {
    let title = 'Untitled'
    const doc = templateDocumentOf({
      filePath: null,
      extensions: ['md', 'markdown', 'txt'],
      defaultExtension: 'md',
      untitledTitle: () => title,
      bytes,
    })
    title = 'Weekly notes'
    expect(doc?.fileName).toBe('Weekly notes.md')
    expect(doc?.title).toBe('Weekly notes')
  })

  it('refuses a file of another format', () => {
    expect(
      templateDocumentOf({
        filePath: '/a/settings.json',
        extensions: ['md', 'markdown', 'txt'],
        defaultExtension: 'md',
        untitledTitle: () => '',
        bytes,
      }),
    ).toBeNull()
  })

  it('names the bytes a save writes (a .csv workbook goes as .xlsx)', () => {
    const doc = templateDocumentOf({
      filePath: '/a/list.csv',
      extensions: ['xlsx', 'xlsm', 'xls', 'csv', 'tsv'],
      defaultExtension: 'xlsx',
      savedExtension: (ext) => (ext === 'xlsm' ? 'xlsm' : 'xlsx'),
      untitledTitle: () => '',
      bytes,
    })
    expect(doc?.fileName).toBe('list.xlsx')
  })

  it('has nothing to block in an editor that recognizes no marks', async () => {
    const doc = templateDocumentOf({
      filePath: '/a/b.docx',
      extensions: ['docx', 'odt'],
      defaultExtension: 'docx',
      untitledTitle: () => '',
      bytes,
    })
    expect(await doc?.redacted()).toBe(false)
  })
})

describe('SKILL_TEMPLATE_STRINGS', () => {
  const KEYS = Object.keys(SKILL_TEMPLATE_STRINGS.zh) as SkillTemplateStringKey[]
  const NON_LATIN: readonly Lang[] = ['zh', 'ja', 'ko', 'th', 'ru', 'ar', 'he', 'hi', 'zh-TW']
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

  it('has every key, non-empty, with the same placeholders, in all 21 languages', () => {
    expect(Object.keys(SKILL_TEMPLATE_STRINGS).sort()).toEqual([...LANGS].sort())
    for (const lang of LANGS) {
      const dict = SKILL_TEMPLATE_STRINGS[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual([...KEYS].sort())
      for (const key of KEYS) {
        expect(dict[key]?.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
        expect(placeholders(dict[key]!), `${lang}.${key}`).toEqual(
          placeholders(SKILL_TEMPLATE_STRINGS.zh[key]),
        )
      }
    }
  })

  it('is translated in non-Latin-script languages and names no AI company', () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        const text = SKILL_TEMPLATE_STRINGS[lang][key]
        if (NON_LATIN.includes(lang))
          expect(text, `${lang}.${key}`).not.toBe(SKILL_TEMPLATE_STRINGS.en[key])
        expect(text, `${lang}.${key}`).not.toMatch(/claude|anthropic|openai|chatgpt|codex/i)
      }
    }
  })

  it('says the spec sentences in Korean', () => {
    const ko = SKILL_TEMPLATE_STRINGS.ko
    expect(ko.takenOver).toBe('새 탭에서 양식으로 작업합니다')
    expect(ko.goToTab).toBe('탭으로 가기')
    expect(ko.firstTemplateOnly).toBe('양식은 {title}의 것을 씁니다')
    expect(ko.templateMissing).toBe('{title} 스킬의 양식 파일이 없습니다')
    expect(ko.openWithTemplate).toBe('이 양식으로 새 문서 열기')
    expect(ko.previewTabTitle).toBe('양식 미리보기 - {title}')
    expect(ko.previewContinues).toBe('양식 미리보기 탭에서 이어집니다')
    expect(ko.saveThisTab).toBe('이 탭을 양식으로 저장')
    expect(ko.clearRequest).toContain('채워진 값(이름, 날짜, 개인정보, 이번에만 쓰인 내용)')
  })
})
