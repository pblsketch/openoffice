import { describe, expect, it } from 'vitest'
import { LANGS, type Lang } from '@genoffice/i18n'
import {
  PROJECT_PANEL_STRINGS,
  projectPanelText,
  type ProjectPanelStringKey,
} from '../src/strings-project-panel'

const KEYS = Object.keys(PROJECT_PANEL_STRINGS.zh) as ProjectPanelStringKey[]
const NON_LATIN: readonly Lang[] = ['zh', 'ja', 'ko', 'th', 'ru', 'ar', 'he', 'hi', 'zh-TW']
/** Format names that read the same in every script */
const SAME_EVERYWHERE = new Set<ProjectPanelStringKey>([
  'editorPdf',
  'editorMarkdown',
  'editorHtml',
  'editorHwp',
  'editorEpub',
])

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()

describe('PROJECT_PANEL_STRINGS', () => {
  it('has every key, non-empty, in all 21 languages', () => {
    expect(LANGS).toHaveLength(21)
    expect(Object.keys(PROJECT_PANEL_STRINGS).sort()).toEqual([...LANGS].sort())
    for (const lang of LANGS) {
      const dict = PROJECT_PANEL_STRINGS[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual([...KEYS].sort())
      for (const key of KEYS) expect(dict[key]?.trim().length, `${lang}.${key}`).toBeGreaterThan(0)
    }
  })

  it('keeps the same placeholders in every language', () => {
    for (const key of KEYS) {
      const expected = placeholders(PROJECT_PANEL_STRINGS.zh[key])
      for (const lang of LANGS) {
        expect(placeholders(PROJECT_PANEL_STRINGS[lang][key]), `${lang}.${key}`).toEqual(expected)
      }
    }
  })

  it('is translated, not copied from English, in non-Latin-script languages', () => {
    for (const lang of NON_LATIN) {
      for (const key of KEYS) {
        if (SAME_EVERYWHERE.has(key)) continue
        expect(PROJECT_PANEL_STRINGS[lang][key], `${lang}.${key}`).not.toBe(
          PROJECT_PANEL_STRINGS.en[key],
        )
      }
    }
  })

  it('names no other company, service or file manager, and not the product', () => {
    for (const lang of LANGS) {
      for (const key of KEYS) {
        expect(PROJECT_PANEL_STRINGS[lang][key], `${lang}.${key}`).not.toMatch(
          /OneDrive|Google|Microsoft|Windows|Apple|Finder|Explorer|Claude|Codex|ChatGPT|OpenAI|Hancom|GenOffice|IeumOffice|이음오피스/i,
        )
      }
    }
  })

  it('says the spec sentences in Korean', () => {
    expect(projectPanelText('ko', 'noProject')).toBe('프로젝트 없이')
    expect(projectPanelText('ko', 'groupPinned')).toBe('고정됨')
    expect(projectPanelText('ko', 'groupRecent')).toBe('최근')
    expect(projectPanelText('ko', 'newProject')).toBe('새 프로젝트')
    expect(projectPanelText('ko', 'addFolder')).toBe('폴더 추가')
    expect(projectPanelText('ko', 'folderMissing')).toBe('폴더 없음')
    expect(projectPanelText('ko', 'createNamed', { name: '현장학습' })).toBe(
      '‘현장학습’ 새 프로젝트 만들기',
    )
    expect(
      projectPanelText('ko', 'createLocation', { path: 'D:\\문서\\IeumOffice\\현장학습' }),
    ).toBe('만들 곳: D:\\문서\\IeumOffice\\현장학습')
    expect(projectPanelText('ko', 'createElsewhere')).toBe('다른 곳에 만들기…')
    expect(projectPanelText('ko', 'newProjectNameHint')).toBe('새 프로젝트 이름을 입력하세요')
    expect(projectPanelText('ko', 'removeFromList')).toBe('목록에서 빼기')
    expect(projectPanelText('ko', 'newChat')).toBe('새 대화')
    expect(projectPanelText('ko', 'otherPc')).toBe('다른 PC')
    expect(projectPanelText('ko', 'legacyChat')).toBe('이 문서의 이전 대화')
    expect(projectPanelText('ko', 'folderHint', { name: '학급 운영' })).toBe(
      '이 문서는 ‘학급 운영’ 프로젝트 폴더에 있습니다',
    )
    expect(projectPanelText('ko', 'useFolder')).toBe('사용')
    expect(projectPanelText('ko', 'view')).toBe('보기')
    expect(projectPanelText('ko', 'consolidate')).toBe('정리하기')
    expect(projectPanelText('ko', 'removeMemory')).toBe('지우기')
    expect(projectPanelText('ko', 'undo')).toBe('되돌리기')
  })
})
