import { describe, expect, it } from 'vitest'
import type { Lang } from '@genoffice/i18n'
import type {
  LegacyDocumentChat,
  ProjectChatListItem,
  ProjectListItem,
  ProjectNotice,
} from '@genoffice/project-store'
import {
  projectChatMenuItems,
  projectChatRows,
  projectChatTitle,
  projectChipText,
  projectConsolidatedText,
  projectCreateLocation,
  projectEditorLabel,
  projectMatchesQuery,
  projectMemoryEventText,
  projectNoticeView,
  projectPickerAction,
  projectPickerInitialIndex,
  projectPickerItems,
  projectRelativeTime,
  projectToolSummaryText,
  placeRemoteEntries,
  projectAddProblem,
  projectPrepareProblem,
  projectProblemText,
  stepIndex,
  type ProjectPickerItem,
} from '../src/project-panel-model'

const project = (over: Partial<ProjectListItem> & { id: string }): ProjectListItem => ({
  name: over.id,
  path: `C:\\Work\\${over.id}`,
  pinned: false,
  lastUsedAt: '2026-10-01T00:00:00.000Z',
  missing: false,
  unwritable: false,
  syncFolder: false,
  ...over,
})

const PROJECTS: ProjectListItem[] = [
  project({ id: 'old', name: 'Old report', lastUsedAt: '2026-09-01T00:00:00.000Z' }),
  project({ id: 'pinB', name: 'Budget', pinned: true, lastUsedAt: '2026-10-20T00:00:00.000Z' }),
  project({ id: 'new', name: 'Newest', lastUsedAt: '2026-10-28T00:00:00.000Z' }),
  project({ id: 'pinA', name: 'Archive', pinned: true, lastUsedAt: '2026-08-01T00:00:00.000Z' }),
  project({ id: 'mid', name: '보고서 2026', lastUsedAt: '2026-10-10T00:00:00.000Z' }),
]

const describeItem = (item: ProjectPickerItem): string =>
  item.kind === 'project' ? `${item.group}:${item.project.id}` : item.kind

describe('projectPickerItems', () => {
  it('lists pinned by name, then recent by last use, then the fixed rows', () => {
    expect(projectPickerItems(PROJECTS, '').map(describeItem)).toEqual([
      'pinned:pinA',
      'pinned:pinB',
      'recent:new',
      'recent:mid',
      'recent:old',
      'new',
      'add-folder',
      'none',
    ])
  })

  it('filters by name and by folder path, case-insensitively', () => {
    expect(projectPickerItems(PROJECTS, 'BUD').map(describeItem)).toEqual([
      'pinned:pinB',
      'new',
      'add-folder',
      'none',
    ])
    expect(projectPickerItems(PROJECTS, 'work\\old').map(describeItem)).toEqual([
      'recent:old',
      'new',
      'add-folder',
      'none',
    ])
  })

  it('matches decomposed (macOS) Korean names against composed search text', () => {
    const nfd = project({ id: 'nfd', name: '보고서'.normalize('NFD') })
    expect(projectMatchesQuery(nfd, '보고')).toBe(true)
  })

  it('puts a create row and "create somewhere else" on top only when nothing matches', () => {
    const items = projectPickerItems(PROJECTS, '  Field trip  ')
    expect(items.map(describeItem)).toEqual([
      'create',
      'create-elsewhere',
      'new',
      'add-folder',
      'none',
    ])
    expect(items[0]).toEqual({ kind: 'create', name: 'Field trip' })
    expect(items[1]).toEqual({ kind: 'create-elsewhere', name: 'Field trip' })
    expect(projectPickerItems(PROJECTS, 'Budget')[0]?.kind).not.toBe('create')
    expect(projectPickerItems([], '   ').some((i) => i.kind === 'create')).toBe(false)
  })

  it('shows a project listed twice once', () => {
    const items = projectPickerItems([PROJECTS[0]!, PROJECTS[0]!], '')
    expect(items.filter((i) => i.kind === 'project')).toHaveLength(1)
  })
})

describe('projectCreateLocation', () => {
  it('writes the default save folder and the name with that folder’s separator', () => {
    expect(projectCreateLocation('C:\\Users\\me\\Documents\\IeumOffice', ' 현장학습 ')).toBe(
      'C:\\Users\\me\\Documents\\IeumOffice\\현장학습',
    )
    expect(projectCreateLocation('C:\\Work\\', 'Trip')).toBe('C:\\Work\\Trip')
    expect(projectCreateLocation('D:\\', 'Trip')).toBe('D:\\Trip')
    expect(projectCreateLocation('/Users/me/Documents/IeumOffice', 'Trip')).toBe(
      '/Users/me/Documents/IeumOffice/Trip',
    )
    expect(projectCreateLocation('/home/me/', 'Trip')).toBe('/home/me/Trip')
  })

  it('says nothing while the default folder is not known', () => {
    expect(projectCreateLocation(undefined, 'Trip')).toBe('')
    expect(projectCreateLocation('  ', 'Trip')).toBe('')
  })
})

describe('projectPickerAction', () => {
  it('asks to relocate a missing folder instead of choosing it', () => {
    const missing = project({ id: 'gone', missing: true })
    expect(projectPickerAction({ kind: 'project', project: missing, group: 'recent' })).toEqual({
      type: 'relocate',
      projectId: 'gone',
    })
    expect(
      projectPickerAction({ kind: 'project', project: PROJECTS[0]!, group: 'recent' }),
    ).toEqual({ type: 'select', projectId: 'old' })
  })

  it('maps the fixed rows', () => {
    expect(projectPickerAction({ kind: 'create', name: 'X' })).toEqual({
      type: 'create',
      name: 'X',
      otherPlace: false,
    })
    expect(projectPickerAction({ kind: 'create-elsewhere', name: 'X' })).toEqual({
      type: 'create',
      name: 'X',
      otherPlace: true,
    })
    // "+ New project" never creates without a name: it asks for one first
    expect(projectPickerAction({ kind: 'new' })).toEqual({ type: 'ask-name' })
    expect(projectPickerAction({ kind: 'new' }, '   ')).toEqual({ type: 'ask-name' })
    expect(projectPickerAction({ kind: 'new' }, ' Trip ')).toEqual({
      type: 'create',
      name: 'Trip',
      otherPlace: false,
    })
    expect(projectPickerAction({ kind: 'add-folder' })).toEqual({ type: 'add-folder' })
    expect(projectPickerAction({ kind: 'none' })).toEqual({ type: 'select', projectId: null })
  })
})

describe('keyboard helpers', () => {
  it('starts on the chosen project, or on "No project" when none is chosen', () => {
    const items = projectPickerItems(PROJECTS, '')
    expect(describeItem(items[projectPickerInitialIndex(items, 'mid')]!)).toBe('recent:mid')
    expect(describeItem(items[projectPickerInitialIndex(items, null)]!)).toBe('none')
    expect(projectPickerInitialIndex(items, 'unknown')).toBe(0)
  })

  it('wraps ↑/↓ and jumps with Home/End', () => {
    expect(stepIndex(0, 3, 'ArrowUp')).toBe(2)
    expect(stepIndex(2, 3, 'ArrowDown')).toBe(0)
    expect(stepIndex(1, 3, 'Home')).toBe(0)
    expect(stepIndex(1, 3, 'End')).toBe(2)
    expect(stepIndex(0, 0, 'ArrowDown')).toBe(0)
  })
})

describe('projectChipText', () => {
  it('names the chosen project, "No project", or a fallback while the list is not loaded', () => {
    expect(projectChipText('ko', PROJECTS, 'mid')).toBe('보고서 2026')
    expect(projectChipText('ko', PROJECTS, null)).toBe('프로젝트 없이')
    expect(projectChipText('en', [], 'mid')).toBe('Project')
  })
})

const chat = (over: Partial<ProjectChatListItem> & { id: string }): ProjectChatListItem => ({
  title: over.id,
  updatedAt: '2026-10-01T00:00:00.000Z',
  lastEditor: 'docs',
  foreign: false,
  ...over,
})

const CHATS: ProjectChatListItem[] = [
  chat({ id: 'a', title: 'Outline', updatedAt: '2026-10-02T00:00:00.000Z' }),
  chat({ id: 'b', title: 'Budget table', updatedAt: '2026-10-28T09:00:00.000Z' }),
  chat({ id: 'c', title: 'Budget notes', updatedAt: '2026-10-15T00:00:00.000Z', foreign: true }),
]

const LEGACY: LegacyDocumentChat = {
  projectId: 'default',
  chatId: 'legacy-1',
  updatedAt: '2026-09-01T00:00:00.000Z',
  approxCount: 12,
}

describe('chat menu', () => {
  it('orders chats newest first and filters by title', () => {
    expect(projectChatRows(CHATS, '').map((c) => c.id)).toEqual(['b', 'c', 'a'])
    expect(projectChatRows(CHATS, 'budget').map((c) => c.id)).toEqual(['b', 'c'])
  })

  it('puts [New chat] first and the earlier document chat last', () => {
    const items = projectChatMenuItems(CHATS, '', LEGACY)
    expect(items.map((i) => (i.kind === 'chat' ? i.chat.id : i.kind))).toEqual([
      'new',
      'b',
      'c',
      'a',
      'legacy',
    ])
    expect(projectChatMenuItems(CHATS, '', null).some((i) => i.kind === 'legacy')).toBe(false)
  })

  it('titles the button with the open chat, a new chat, or the earlier chat', () => {
    expect(projectChatTitle('en', CHATS, 'a')).toBe('Outline')
    expect(projectChatTitle('ko', CHATS, null)).toBe('새 대화')
    expect(projectChatTitle('ko', CHATS, 'zzz', { currentTitle: '첫 질문' })).toBe('첫 질문')
    expect(projectChatTitle('ko', [chat({ id: 'x', title: ' ' })], 'x')).toBe('제목 없음')
    expect(projectChatTitle('ko', CHATS, 'a', { legacyActive: true })).toBe('이 문서의 이전 대화')
  })

  it('says when a chat was used, relative to now', () => {
    const now = Date.parse('2026-10-29T12:00:00.000Z')
    expect(projectRelativeTime('2026-10-29T11:59:50.000Z', now, 'en')).toMatch(/now/i)
    expect(projectRelativeTime('2026-10-29T11:55:00.000Z', now, 'en')).toMatch(/5 min/)
    expect(projectRelativeTime('2026-10-28T12:00:00.000Z', now, 'en')).toMatch(/yesterday/i)
    expect(projectRelativeTime('2026-03-01T12:00:00.000Z', now, 'en')).toMatch(/Mar/)
    expect(projectRelativeTime('2025-03-01T12:00:00.000Z', now, 'en')).toMatch(/2025/)
    expect(projectRelativeTime('not a time', now, 'en')).toBe('')
  })

  it('names every editor', () => {
    expect(projectEditorLabel('ko', 'hwp')).toBe('한글')
    expect(projectEditorLabel('en', 'hwp')).toBe('HWP')
    expect(projectEditorLabel('ko', 'home')).toBe('홈')
  })
})

describe('notice and event text', () => {
  const NOTICES: ProjectNotice[] = [
    { kind: 'instructions-changed', files: ['instructions', 'agents'] },
    { kind: 'memory-changed' },
    { kind: 'memory-long', chars: 9000, limit: 8000 },
    { kind: 'instructions-truncated', chars: 40000, limit: 32000 },
    { kind: 'unwritable' },
    { kind: 'sync-folder', service: 'onedrive' },
  ]

  it('picks the sentence and the button for each notice kind', () => {
    const views = NOTICES.map((n) => projectNoticeView('ko', n))
    expect(views.map((v) => v.text)).toEqual([
      '지침이 바뀌었습니다',
      '기억이 바뀌었습니다',
      '기억이 길어졌습니다',
      '지침이 길어 뒤쪽이 빠졌습니다',
      '이 폴더에 쓸 수 없어 대화·기억이 저장되지 않습니다',
      '이 폴더는 동기화 폴더라 지침·기억·대화도 그 서비스로 올라갑니다',
    ])
    expect(views.map((v) => v.action)).toEqual([
      { type: 'view', section: 'instructions' },
      { type: 'view', section: 'memory' },
      { type: 'consolidate' },
      undefined,
      undefined,
      undefined,
    ])
    expect(views.map((v) => v.tone)).toEqual(['info', 'info', 'info', 'info', 'warning', 'info'])
  })

  it('never names the sync service', () => {
    for (const service of ['onedrive', 'google-drive'] as const) {
      const text = projectNoticeView('en', { kind: 'sync-folder', service }).text
      expect(text).not.toMatch(/OneDrive|Google/i)
    }
  })

  it('falls back to English for a language it does not know', () => {
    expect(projectNoticeView('xx' as Lang, { kind: 'memory-changed' }).text).toBe(
      'The memory changed',
    )
  })

  it('says the memory lines', () => {
    expect(projectMemoryEventText('ko', { op: 'add', text: '개조식으로 쓴다' })).toBe(
      '기억함: 개조식으로 쓴다',
    )
    expect(projectMemoryEventText('ko', { op: 'replace', old: 'a', new: 'b' })).toBe('기억 고침: b')
    expect(projectMemoryEventText('ko', { op: 'remove', text: 'c' })).toBe('기억 지움: c')
    expect(projectConsolidatedText('ko', 12, 7)).toBe('기억을 정리했습니다(12개 → 7개)')
  })

  it('summarizes another editor’s tool records in one line', () => {
    expect(
      projectToolSummaryText('ko', { editor: 'hwp', documentName: '보고서.hwp', count: 3 }),
    ).toBe('한글 ‘보고서.hwp’에서 도구 3번 실행')
    expect(projectToolSummaryText('ko', { editor: 'home', count: 2 })).toBe('홈에서 도구 2번 실행')
    expect(
      projectToolSummaryText('en', { editor: 'sheets', documentName: 'a.xlsx', count: 1 }),
    ).toBe('Ran a tool once in Sheets “a.xlsx”')
    expect(projectToolSummaryText('en', { editor: 'docs', documentName: '  ', count: 4 })).toBe(
      'Ran tools 4 times in Docs',
    )
  })
})

describe('problem lines', () => {
  it('says why a folder was refused, and nothing for one that went through or a closed dialog', () => {
    expect(projectAddProblem({ status: 'refused', reason: 'drive-root' })).toEqual({
      kind: 'refused',
      reason: 'drive-root',
    })
    expect(projectAddProblem({ status: 'cancelled', stage: 'dialog' })).toBeNull()
    expect(projectAddProblem({ status: 'cancelled', stage: 'trust' })).toBeNull()
    expect(projectAddProblem({ status: 'created', project: project({ id: 'p1' }) })).toBeNull()
    expect(projectAddProblem({ status: 'invalid-name' })).toEqual({ kind: 'invalid-name' })
    expect(projectAddProblem({ status: 'unwritable' })).toEqual({ kind: 'create-unwritable' })
    expect(projectAddProblem({ status: 'exists', folderPath: 'C:/Work/A' })).toEqual({
      kind: 'exists',
      folderPath: 'C:/Work/A',
    })
  })

  it('has a sentence for every refusal in every reason', () => {
    const reasons = [
      'drive-root',
      'user-home',
      'protected',
      'contains-protected',
      'not-a-folder',
      'different-project',
    ] as const
    const texts = reasons.map((reason) => projectProblemText('en', { kind: 'refused', reason }))
    expect(new Set(texts).size).toBe(reasons.length)
    expect(projectProblemText('ko', { kind: 'refused', reason: 'drive-root' })).toContain(
      '드라이브 전체',
    )
    expect(projectProblemText('en', { kind: 'exists', folderPath: 'C:/Work/A' })).toContain(
      'C:/Work/A',
    )
  })

  it('says a send went without the project when its context was not there', () => {
    expect(projectPrepareProblem({ status: 'none' })).toBeNull()
    expect(projectPrepareProblem({ status: 'missing' })).toEqual({
      kind: 'context',
      status: 'missing',
    })
    expect(projectPrepareProblem({ status: 'failed', error: 'x' })).toEqual({
      kind: 'context',
      status: 'failed',
    })
    const missing = projectProblemText('ko', { kind: 'context', status: 'missing' })
    expect(missing).toContain('이번 요청에는 프로젝트 내용을 넣지 못했습니다')
    expect(projectProblemText('en', { kind: 'context', status: 'unknown' })).not.toBe(
      projectProblemText('en', { kind: 'context', status: 'failed' }),
    )
  })
})

describe('placeRemoteEntries', () => {
  type E = { role: 'user' | 'assistant'; text: string; streaming?: boolean }
  const q: E = { role: 'user', text: 'q' }
  const a: E = { role: 'assistant', text: 'a' }
  const r1: E = { role: 'user', text: 'r1' }
  const r2: E = { role: 'assistant', text: 'r2' }

  it('appends when no reply of this panel is on its way', () => {
    expect(placeRemoteEntries([q, a], [r1, r2], false)).toEqual([q, a, r1, r2])
    expect(placeRemoteEntries([], [r1], false)).toEqual([r1])
  })

  it('puts them in front of the question and reply in flight, which stay last', () => {
    const live: E = { role: 'assistant', text: '', streaming: true }
    const ask: E = { role: 'user', text: 'ask' }
    expect(placeRemoteEntries([q, a, ask, live], [r1, r2], false)).toEqual([
      q,
      a,
      r1,
      r2,
      ask,
      live,
    ])
    // the running flag alone is enough, and later ones keep their order
    const once = placeRemoteEntries([ask, a], [r1], true)
    expect(placeRemoteEntries(once, [r2], true)).toEqual([r1, r2, ask, a])
  })
})
