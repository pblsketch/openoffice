import { describe, expect, it } from 'vitest'
import {
  chipsAfterListChange,
  filterPickerSkills,
  pickerSkillsOf,
  removeSkillTrigger,
  skillChipRefsOf,
  skillDisplayName,
  skillPickerKeyAction,
  skillTriggerAt,
  withSkillChip,
  SKILL_CHIPS_MAX,
  type SkillPickerItem,
} from '../src/skill-picker-model'

const end = (value: string) => value.length

describe('skillTriggerAt (when the list opens)', () => {
  it('opens on / or $ at the start of the input', () => {
    expect(skillTriggerAt('/', 1)).toEqual({ char: '/', start: 0, end: 1, query: '' })
    expect(skillTriggerAt('$회의', end('$회의'))).toEqual({
      char: '$',
      start: 0,
      end: 3,
      query: '회의',
    })
  })

  it('opens right after whitespace, also at the start of a later line', () => {
    expect(skillTriggerAt('정리해 줘 /가정', end('정리해 줘 /가정'))?.query).toBe('가정')
    expect(skillTriggerAt('first line\n/min', end('first line\n/min'))?.start).toBe(11)
    expect(skillTriggerAt('tab\t$x', end('tab\t$x'))?.char).toBe('$')
  })

  it('does not open in the middle of a word (paths, URLs, amounts)', () => {
    expect(skillTriggerAt('a/b', 3)).toBeNull()
    expect(skillTriggerAt('see https://x.org/a', end('see https://x.org/a'))).toBeNull()
    expect(skillTriggerAt('price 10$', end('price 10$'))).toBeNull()
  })

  it('closes once a space follows the trigger', () => {
    expect(skillTriggerAt('/meet ', end('/meet '))).toBeNull()
    expect(skillTriggerAt('/ ', 2)).toBeNull()
  })

  it('reads only up to the caret', () => {
    expect(skillTriggerAt('/meeting', 3)).toEqual({ char: '/', start: 0, end: 3, query: 'me' })
    expect(skillTriggerAt('/meeting', 0)).toBeNull()
  })

  it('sheets: $ opens only at the very start of the input, / everywhere', () => {
    const sheets = { dollarAtStartOnly: true }
    expect(skillTriggerAt('$', 1, sheets)?.char).toBe('$')
    expect(skillTriggerAt('sum of $A', end('sum of $A'), sheets)).toBeNull()
    expect(skillTriggerAt('=SUM( $A$1', end('=SUM( $A$1'), sheets)).toBeNull()
    expect(skillTriggerAt('sum /x', end('sum /x'), sheets)?.char).toBe('/')
    // other panels open $ after whitespace too
    expect(skillTriggerAt('sum of $A', end('sum of $A'))?.query).toBe('A')
  })

  it('never opens while an input-method composition runs', () => {
    expect(skillTriggerAt('/가', 2, { composing: true })).toBeNull()
  })

  it('ignores a caret outside the text', () => {
    expect(skillTriggerAt('/a', 5)).toBeNull()
    expect(skillTriggerAt('/a', Number.NaN)).toBeNull()
  })

  it('takes the typed trigger out and puts the caret there', () => {
    const value = 'write /min please'
    const trigger = skillTriggerAt(value, 10)!
    expect(removeSkillTrigger(value, trigger)).toEqual({ value: 'write  please', caret: 6 })
  })
})

describe('skillPickerKeyAction (keys go to the open list first)', () => {
  const open = { open: true }
  it('moves, picks and closes while open', () => {
    expect(skillPickerKeyAction({ key: 'ArrowDown', ...open })).toBe('next')
    expect(skillPickerKeyAction({ key: 'ArrowUp', ...open })).toBe('prev')
    expect(skillPickerKeyAction({ key: 'Enter', ...open })).toBe('pick')
    expect(skillPickerKeyAction({ key: 'Tab', ...open })).toBe('pick')
    expect(skillPickerKeyAction({ key: 'Escape', ...open })).toBe('close')
  })

  it('leaves every key alone while closed (Enter sends, Esc stops as before)', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape']) {
      expect(skillPickerKeyAction({ key, open: false })).toBeNull()
    }
  })

  it('leaves keys alone during a composition and Shift+Enter for a new line', () => {
    expect(skillPickerKeyAction({ key: 'Enter', isComposing: true, ...open })).toBeNull()
    expect(skillPickerKeyAction({ key: 'Enter', shiftKey: true, ...open })).toBeNull()
    expect(skillPickerKeyAction({ key: 'a', ...open })).toBeNull()
  })
})

const view = (over: Record<string, unknown>) => ({
  id: 'app:x',
  source: 'app',
  plugin: undefined,
  name: 'x',
  title: 'X',
  description: '',
  enabled: true,
  invoke: 'auto',
  hidden: false,
  hasScripts: false,
  template: undefined,
  templateExists: false,
  agentOnly: false,
  unreadable: undefined,
  github: undefined,
  ...over,
})

describe('pickerSkillsOf (what the list shows)', () => {
  const raw = [
    view({ id: 'app:on', name: 'on', title: '켜진 것' }),
    view({ id: 'app:manual', name: 'manual', invoke: 'manual' }),
    view({ id: 'user:off', source: 'user', name: 'off', enabled: false }),
    view({ id: 'builtin:find-skills', source: 'builtin', name: 'find-skills', agentOnly: true }),
    view({ id: 'builtin:hidden', source: 'builtin', name: 'hidden', hidden: true }),
    view({ id: 'app:broken', name: 'broken', unreadable: 'no-frontmatter' }),
    view({ id: 'user:IeumOffice', source: 'user', name: 'IeumOffice' }),
  ]

  it('lists enabled skills only, including ones used only when called', () => {
    expect(pickerSkillsOf(raw, 'ko').map((s) => s.id)).toEqual(['app:on', 'app:manual'])
  })

  it('shows agent-only skills in the agent window only', () => {
    expect(pickerSkillsOf(raw, 'ko', 'agent').map((s) => s.id)).toContain('builtin:find-skills')
    expect(pickerSkillsOf(raw, 'ko', 'panel').map((s) => s.id)).not.toContain('builtin:find-skills')
  })

  it('shows a builtin by its name, with its description in the UI language', () => {
    const [item] = pickerSkillsOf(
      [
        view({
          id: 'builtin:meeting-minutes',
          source: 'builtin',
          name: 'meeting-minutes',
          title: 'Meeting minutes',
        }),
      ],
      'en',
    )
    expect(item?.title).toBe('meeting-minutes')
    expect(item?.description).toMatch(/decisions and action items/)
    expect(item?.sourceLabel).toBe('Built-in')
  })

  it('shows a skill by its name, and by its title only when the name was made up', () => {
    const items = pickerSkillsOf(
      [
        view({ id: 'app:on', name: 'on', title: '켜진 것' }),
        view({ id: 'app:skill-a1b2c3', name: 'skill-a1b2c3', title: '가정통신문' }),
        view({ id: 'app:skill-d4e5f6', name: 'skill-d4e5f6', title: '' }),
      ],
      'ko',
    )
    expect(items.map((i) => i.title)).toEqual(['on', '가정통신문', 'skill-d4e5f6'])
  })

  it('labels the sources in plain text', () => {
    const items = pickerSkillsOf(
      [
        view({ id: 'app:a', name: 'a' }),
        view({ id: 'app:g', name: 'g', github: { repo: 'o/r' } }),
        view({ id: 'user:u', source: 'user', name: 'u' }),
        view({ id: 'plugin:pk:p', source: 'plugin', plugin: 'pk', name: 'p' }),
        view({ id: 'codex:c', source: 'codex', name: 'c' }),
        view({ id: 'project:j', source: 'project', name: 'j' }),
      ],
      'ko',
      'agent',
    )
    expect(items.map((i) => i.sourceLabel)).toEqual([
      '내 스킬',
      '내 스킬 · 깃허브',
      'Claude 스킬 폴더',
      'Claude 플러그인 · pk',
      'Codex 스킬 폴더',
      '',
    ])
  })

  it('marks a template only when its file is there', () => {
    const items = pickerSkillsOf(
      [
        view({ id: 'app:t', name: 't', template: 'assets/a.docx', templateExists: true }),
        view({ id: 'app:u', name: 'u', template: 'assets/b.docx', templateExists: false }),
      ],
      'ko',
    )
    expect(items.map((i) => i.template)).toEqual([true, false])
  })

  it('reads a malformed answer as no skills', () => {
    expect(pickerSkillsOf(null, 'ko')).toEqual([])
    expect(pickerSkillsOf([null, 3, { id: 'no-colon', name: 'x', source: 'app' }], 'ko')).toEqual(
      [],
    )
  })
})

describe('skillDisplayName', () => {
  it('shows the name', () => {
    expect(skillDisplayName({ name: 'meeting-minutes', title: '회의록 정리' })).toBe(
      'meeting-minutes',
    )
    expect(skillDisplayName({ name: 'humanizer' })).toBe('humanizer')
  })

  it('shows the title of a skill whose name the app made up', () => {
    expect(skillDisplayName({ name: 'skill-a1b2c3', title: '가정통신문' })).toBe('가정통신문')
    expect(skillDisplayName({ name: 'skill-a1b2c3-2', title: ' 가정통신문 ' })).toBe('가정통신문')
  })

  it('keeps a made-up name when there is no title', () => {
    expect(skillDisplayName({ name: 'skill-a1b2c3' })).toBe('skill-a1b2c3')
    expect(skillDisplayName({ name: 'skill-a1b2c3', title: '  ' })).toBe('skill-a1b2c3')
  })

  it('does not take a name that only looks similar as made up', () => {
    expect(skillDisplayName({ name: 'skill-notes', title: '메모' })).toBe('skill-notes')
    expect(skillDisplayName({ name: 'skill-a1b2c3d', title: '메모' })).toBe('skill-a1b2c3d')
    expect(skillDisplayName({ name: 'my-skill-a1b2c3', title: '메모' })).toBe('my-skill-a1b2c3')
  })
})

const item = (id: string, title: string, description = '', name = id): SkillPickerItem => ({
  id,
  source: 'app',
  plugin: undefined,
  name,
  title,
  description,
  sourceLabel: '내 스킬',
  hasScripts: false,
  template: false,
})

describe('filterPickerSkills', () => {
  const items = [
    item('app:a', '회의록 정리', '회의 메모를 정리합니다', 'minutes'),
    item('app:b', '가정통신문', '학부모 안내문', 'letter'),
    item('app:c', 'Copy editing', 'Tighter English', 'copy-editing'),
  ]

  it('finds a part of a Korean title', () => {
    expect(filterPickerSkills(items, '가정').map((i) => i.id)).toEqual(['app:b'])
    expect(filterPickerSkills(items, '통신').map((i) => i.id)).toEqual(['app:b'])
  })

  it('finds by name and description, ignoring case', () => {
    expect(filterPickerSkills(items, 'MINUTES').map((i) => i.id)).toEqual(['app:a'])
    expect(filterPickerSkills(items, 'english').map((i) => i.id)).toEqual(['app:c'])
  })

  it('puts title and name matches before description matches', () => {
    const list = [item('app:d', 'Plain', 'about copy'), item('app:e', 'Copy rules')]
    expect(filterPickerSkills(list, 'copy').map((i) => i.id)).toEqual(['app:e', 'app:d'])
  })

  it('returns everything for an empty query and nothing when nothing matches', () => {
    expect(filterPickerSkills(items, '')).toHaveLength(3)
    expect(filterPickerSkills(items, 'zzz')).toEqual([])
  })
})

describe('chips', () => {
  const a = { id: 'app:a', source: 'app', title: 'A' }
  it('keeps one chip per skill', () => {
    const once = withSkillChip([], a)
    expect(withSkillChip(once, a)).toHaveLength(1)
    expect(withSkillChip(once, { ...a, id: 'user:a' })).toHaveLength(2)
  })

  it('drops a chip whose skill was turned off or removed', () => {
    const chips = [a, { id: 'app:b', source: 'app', title: 'B' }]
    expect(chipsAfterListChange(chips, [item('app:b', 'B2')])).toEqual([
      expect.objectContaining({ id: 'app:b', title: 'B2', missing: false }),
    ])
  })

  it('reads stored chips back, well-formed and bounded', () => {
    const many = Array.from({ length: SKILL_CHIPS_MAX + 5 }, (_, i) => ({
      id: `app:s${i}`,
      source: 'app',
      title: `S${i}`,
    }))
    expect(skillChipRefsOf(many)).toHaveLength(SKILL_CHIPS_MAX)
    expect(skillChipRefsOf([a, a, { id: 'bad' }, null, { id: 'user:x', title: 3 }])).toEqual([
      a,
      { id: 'user:x', source: '', title: 'user:x' },
    ])
    expect(skillChipRefsOf('x')).toEqual([])
  })
})
