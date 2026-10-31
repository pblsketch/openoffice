import { describe, expect, it, vi } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import type { ProjectTrustPrompt } from '@genoffice/project-store'
import { createCachedCloudResolver } from '../src/main/projects/cloud-cache'
import {
  PROJECT_DIALOG_STRINGS,
  TRUST_CHATS_SHOWN,
  TRUST_TEXT_SHOWN_CHARS,
  downloadPromptOptions,
  folderPickerOptions,
  projectDialogText,
  shownExcerpt,
  shownText,
  trustChoiceOf,
  trustPromptOptions,
  useExistingPromptOptions,
} from '../src/main/projects/project-dialog-text'

const prompt = (over: Partial<ProjectTrustPrompt> = {}): ProjectTrustPrompt => ({
  projectId: 'p1',
  name: 'Report',
  folderPath: 'C:\\Users\\me\\Report',
  instructions: null,
  memory: null,
  agents: null,
  claude: null,
  foreignChats: [],
  ...over,
})

describe('project dialog texts', () => {
  it('fill every language with the same keys', () => {
    const keys = Object.keys(PROJECT_DIALOG_STRINGS.zh).sort()
    for (const lang of LANGS) {
      const dict = PROJECT_DIALOG_STRINGS[lang] as Record<string, string>
      expect(Object.keys(dict).sort(), lang).toEqual(keys)
      for (const key of keys) expect(dict[key]?.trim(), `${lang}.${key}`).toBeTruthy()
    }
  })

  it('say the download question as the spec words it in Korean', () => {
    expect(downloadPromptOptions('ko', '보고서.hwp').message).toBe(
      '‘보고서.hwp’은 PC에 없어 내려받아야 합니다. 내려받을까요?',
    )
  })
})

describe('the trust prompt (spec 5.10)', () => {
  it('shows each text this install did not write, cut for display', () => {
    const long = 'x'.repeat(TRUST_TEXT_SHOWN_CHARS + 50)
    const options = trustPromptOptions(
      'en',
      prompt({ instructions: long, memory: '- likes tables', agents: 'AGENTS', claude: null }),
    )
    const detail = options.detail ?? ''
    expect(detail).toContain(`${'x'.repeat(TRUST_TEXT_SHOWN_CHARS)}…\n(50 more characters)`)
    expect(detail).not.toContain('x'.repeat(TRUST_TEXT_SHOWN_CHARS + 1))
    expect(detail).toContain('- likes tables')
    expect(detail).toContain('— AGENTS.md —\nAGENTS')
    // a text that fits says nothing about more characters
    expect(detail.match(/more characters/g)).toHaveLength(1)
    expect(detail).not.toContain('CLAUDE.md')
    expect(options.message).toContain('Report')
  })

  it('says how many characters each long file leaves out, in the reader’s language', () => {
    const long = '가'.repeat(TRUST_TEXT_SHOWN_CHARS + 1_234)
    const detail = trustPromptOptions('ko', prompt({ instructions: long, claude: long })).detail
    expect(detail).toContain(`${'가'.repeat(TRUST_TEXT_SHOWN_CHARS)}…\n(1,234자 더 있음)`)
    expect(detail?.match(/1,234자 더 있음/g)).toHaveLength(2)
    expect(detail).toContain(projectDialogText('ko', 'trustViewHint'))
    expect(shownExcerpt('abcdef', 4)).toEqual({ text: 'abcd…', more: 2 })
    expect(shownExcerpt('abc', 4)).toEqual({ text: 'abc', more: 0 })
  })

  it('lists the chats from other PCs by title and counts the rest', () => {
    const chats = Array.from({ length: TRUST_CHATS_SHOWN + 3 }, (_, i) => ({
      id: `c${i}`,
      title: i === 0 ? '' : `Chat ${i}`,
      updatedAt: '2026-10-29T09:00:00.000Z',
    }))
    const detail = trustPromptOptions('en', prompt({ foreignChats: chats })).detail ?? ''
    expect(detail).toContain('Chats written on other PCs')
    expect(detail).toContain('• (untitled)')
    expect(detail).toContain('• Chat 1 (')
    expect(detail).not.toContain(`Chat ${TRUST_CHATS_SHOWN}`)
    expect(detail).toContain('…and 3 more')
  })

  it('offers use / use without / view all / cancel, cancel being the default and the close answer', () => {
    const options = trustPromptOptions('ko', prompt())
    expect(options.buttons).toEqual(['지침까지 사용', '지침 없이 사용', '전체 보기', '취소'])
    expect(options.defaultId).toBe(3)
    expect(options.cancelId).toBe(3)
    expect([0, 1, 2, 3, -1, 9].map(trustChoiceOf)).toEqual([
      'use',
      'without',
      'view',
      null,
      null,
      null,
    ])
  })

  it('cuts by whole characters', () => {
    expect(shownText('가나다라', 2)).toBe('가나…')
    expect(shownText('  ok  ', 5)).toBe('ok')
  })
})

describe('the other dialogs', () => {
  it('make download the first button and cancel the default', () => {
    const options = downloadPromptOptions('en', 'a.docx')
    expect(options.buttons).toEqual(['Download', 'Cancel'])
    expect(options.defaultId).toBe(1)
    expect(options.cancelId).toBe(1)
  })

  it('ask before using an existing folder, say why, and show where it is', () => {
    const options = useExistingPromptOptions('ko', 'D:\\문서\\예산')
    expect(options.message).toBe('‘예산’ 폴더가 이미 있습니다. 그 폴더를 프로젝트로 사용할까요?')
    expect(options.buttons).toEqual(['이 폴더 사용', '취소'])
    expect(useExistingPromptOptions('en', '/home/me/Budget/').message).toContain('“Budget”')
    expect(options.detail).toBe('D:\\문서\\예산')
    expect(options.cancelId).toBe(1)
  })

  it('pick folders only', () => {
    expect(folderPickerOptions('ko', 'parent').title).toBe('새 프로젝트를 만들 곳 고르기')
    for (const purpose of ['add', 'relocate', 'parent'] as const) {
      expect(folderPickerOptions('en', purpose).properties).toContain('openDirectory')
    }
  })
})

describe('the cached "not on this PC" check for the context list', () => {
  it('asks the detector once for paths it has a fresh answer for', async () => {
    let now = 0
    const detect = vi.fn(
      async (paths: readonly string[]) => new Map(paths.map((p) => [p, p === 'b'])),
    )
    const cached = createCachedCloudResolver(detect, { ttlMs: 1000, now: () => now })
    expect([...(await cached(['a', 'b']))]).toEqual([
      ['a', false],
      ['b', true],
    ])
    now = 500
    await cached(['a', 'b', 'c'])
    expect(detect).toHaveBeenLastCalledWith(['c'])
    expect(detect).toHaveBeenCalledTimes(2)
    now = 1500
    await cached(['a'])
    expect(detect).toHaveBeenLastCalledWith(['a'])
  })

  it('does not remember a failed run', async () => {
    const detect = vi
      .fn<(paths: readonly string[]) => Promise<Map<string, boolean>>>()
      .mockRejectedValueOnce(new Error('no detector'))
      .mockResolvedValueOnce(new Map([['a', false]]))
    const cached = createCachedCloudResolver(detect)
    await expect(cached(['a'])).rejects.toThrow('no detector')
    expect(await cached(['a'])).toEqual(new Map([['a', false]]))
  })
})
