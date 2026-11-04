/**
 * Turning skills on and off: initial states per source, merging the saved
 * settings (unknown values fall back), hidden builtins, and which enabled skill
 * wins when two share a name.
 */
import { describe, expect, it } from 'vitest'
import {
  initialUserSkillState,
  normalizeUserSkillSettings,
  pickEnabledUserSkills,
  resolveUserSkillStates,
  type UserSkill,
  type UserSkillSource,
} from '../src/user-skills'

function fake(source: UserSkillSource, name: string, extra: Partial<UserSkill> = {}): UserSkill {
  const plugin = source === 'plugin' ? (extra.plugin ?? 'p') : undefined
  return {
    id: source === 'plugin' ? `plugin:${plugin}:${name}` : `${source}:${name}`,
    source,
    plugin,
    name,
    folderName: name,
    dir: `/skills/${source}/${name}`,
    title: name,
    description: 'd',
    template: undefined,
    templateExists: false,
    hasScripts: false,
    mcpServers: [],
    github: false,
    agentOnly: false,
    files: 1,
    bytes: 10,
    unreadable: undefined,
    ...extra,
  }
}

describe('initial states', () => {
  it('turns on builtin, app and project skills and leaves the other programs off', () => {
    expect(initialUserSkillState('builtin')).toEqual({ enabled: true, invoke: 'auto' })
    expect(initialUserSkillState('app')).toEqual({ enabled: true, invoke: 'auto' })
    expect(initialUserSkillState('project')).toEqual({ enabled: true, invoke: 'auto' })
    expect(initialUserSkillState('user')).toEqual({ enabled: false, invoke: 'auto' })
    expect(initialUserSkillState('plugin')).toEqual({ enabled: false, invoke: 'auto' })
    expect(initialUserSkillState('codex')).toEqual({ enabled: false, invoke: 'auto' })
  })
})

describe('saved settings', () => {
  it('keeps only well-formed values', () => {
    expect(normalizeUserSkillSettings(undefined)).toEqual({ states: {}, hiddenBuiltins: [] })
    expect(normalizeUserSkillSettings('junk')).toEqual({ states: {}, hiddenBuiltins: [] })
    expect(
      normalizeUserSkillSettings({
        states: {
          'user:a': { enabled: true, invoke: 'manual' },
          'user:b': { enabled: 'yes', invoke: 'sometimes' },
          'user:c': 'on',
          'plugin:p:d': { invoke: 'auto', extra: 1 },
        },
        hiddenBuiltins: ['humanizer', 3, null, 'humanizer'],
      }),
    ).toEqual({
      states: {
        'user:a': { enabled: true, invoke: 'manual' },
        'user:b': {},
        'plugin:p:d': { invoke: 'auto' },
      },
      hiddenBuiltins: ['humanizer'],
    })
    expect(normalizeUserSkillSettings({ states: [], hiddenBuiltins: 'x' })).toEqual({
      states: {},
      hiddenBuiltins: [],
    })
  })

  it('merges the saved states over the initial ones', () => {
    const skills = [
      fake('builtin', 'minutes'),
      fake('app', 'mine'),
      fake('user', 'claude-one'),
      fake('user', 'claude-two'),
      fake('plugin', 'hwp', { plugin: 'hwp' }),
      fake('codex', 'agents-one'),
    ]
    const resolved = resolveUserSkillStates(skills, {
      states: {
        'app:mine': { enabled: false },
        'user:claude-one': { enabled: true, invoke: 'manual' },
        'plugin:hwp:hwp': { enabled: true },
        'codex:agents-one': { enabled: 'maybe', invoke: 'never' },
      },
    })
    expect(resolved.map((entry) => [entry.id, entry.enabled, entry.invoke, entry.hidden])).toEqual([
      ['builtin:minutes', true, 'auto', false],
      ['app:mine', false, 'auto', false],
      ['user:claude-one', true, 'manual', false],
      ['user:claude-two', false, 'auto', false],
      ['plugin:hwp:hwp', true, 'auto', false],
      ['codex:agents-one', false, 'auto', false],
    ])
  })

  it('falls back to the initial state when the settings themselves are unknown', () => {
    const resolved = resolveUserSkillStates([fake('app', 'mine'), fake('user', 'x')], 42)
    expect(resolved.map((entry) => entry.enabled)).toEqual([true, false])
  })

  it('hides and turns off a hidden builtin skill', () => {
    const resolved = resolveUserSkillStates(
      [fake('builtin', 'humanizer'), fake('app', 'humanizer')],
      { hiddenBuiltins: ['humanizer'], states: { 'builtin:humanizer': { enabled: true } } },
    )
    expect(resolved.map((entry) => [entry.id, entry.hidden, entry.enabled])).toEqual([
      ['builtin:humanizer', true, false],
      ['app:humanizer', false, true],
    ])
  })

  it('keeps project skills on whatever the settings say', () => {
    const [project] = resolveUserSkillStates([fake('project', 'report')], {
      states: { 'project:report': { enabled: false, invoke: 'manual' } },
    })
    expect(project).toMatchObject({ enabled: true, invoke: 'auto' })
  })

  it('never turns on a skill that cannot be read', () => {
    const [broken] = resolveUserSkillStates(
      [fake('app', 'broken', { unreadable: 'no-frontmatter' })],
      {
        states: { 'app:broken': { enabled: true } },
      },
    )
    expect(broken?.enabled).toBe(false)
  })
})

describe('priority among enabled skills', () => {
  it('ranks project, app, builtin, Claude, Codex, then plugins', () => {
    const skills = resolveUserSkillStates(
      [
        fake('plugin', 'report', { plugin: 'a' }),
        fake('codex', 'report'),
        fake('user', 'report'),
        fake('builtin', 'report'),
        fake('app', 'report'),
        fake('project', 'report'),
      ],
      {
        states: {
          'plugin:a:report': { enabled: true },
          'codex:report': { enabled: true },
          'user:report': { enabled: true },
        },
      },
    )
    const order: string[] = []
    let rest = skills
    for (;;) {
      const picked = pickEnabledUserSkills(rest)
      if (picked.chosen.length === 0) break
      order.push(picked.chosen[0]!.id)
      rest = rest.filter((entry) => entry.id !== picked.chosen[0]!.id)
    }
    expect(order).toEqual([
      'project:report',
      'app:report',
      'builtin:report',
      'user:report',
      'codex:report',
      'plugin:a:report',
    ])
  })

  it('only weighs skills that are on, so a disabled higher source does not hide a lower one', () => {
    const skills = resolveUserSkillStates([fake('app', 'report'), fake('user', 'report')], {
      states: { 'app:report': { enabled: false }, 'user:report': { enabled: true } },
    })
    const picked = pickEnabledUserSkills(skills)
    expect(picked.chosen.map((entry) => entry.id)).toEqual(['user:report'])
    expect(picked.shadowed).toEqual([])
  })

  it('lets the earlier plugin name win between two plugins and reports what was pushed back', () => {
    const skills = resolveUserSkillStates(
      [fake('plugin', 'review', { plugin: 'beta' }), fake('plugin', 'review', { plugin: 'alpha' })],
      {
        states: {
          'plugin:beta:review': { enabled: true },
          'plugin:alpha:review': { enabled: true },
        },
      },
    )
    const picked = pickEnabledUserSkills(skills)
    expect(picked.chosen.map((entry) => entry.id)).toEqual(['plugin:alpha:review'])
    expect(picked.shadowed.map((entry) => [entry.skill.id, entry.by])).toEqual([
      ['plugin:beta:review', 'plugin:alpha:review'],
    ])
  })

  it('compares names without case and keeps different names apart', () => {
    const skills = resolveUserSkillStates(
      [fake('app', 'Report'), fake('builtin', 'report'), fake('app', 'other')],
      {},
    )
    const picked = pickEnabledUserSkills(skills)
    expect(picked.chosen.map((entry) => entry.id).sort()).toEqual(['app:Report', 'app:other'])
    expect(picked.shadowed.map((entry) => entry.skill.id)).toEqual(['builtin:report'])
  })

  it('leaves out hidden and unreadable skills', () => {
    const skills = resolveUserSkillStates(
      [fake('builtin', 'a'), fake('app', 'b', { unreadable: 'too-large' })],
      { hiddenBuiltins: ['a'] },
    )
    expect(pickEnabledUserSkills(skills).chosen).toEqual([])
  })
})
