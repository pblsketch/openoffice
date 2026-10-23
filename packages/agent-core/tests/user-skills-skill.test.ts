import { describe, expect, it, vi } from 'vitest'
import {
  AUTO_SKILLS_MAX,
  AUTO_SKILL_DESCRIPTION_MAX,
  PROPOSE_SKILL_TOOL,
  READ_SKILL_FILE_TOOL,
  USE_SKILL_TOOL,
  attachedSkillIdsOf,
  autoSkillsSection,
  createBridgedUserSkillsSkill,
  createUserSkillsSkill,
  proposedTitleOf,
  userSkillEntriesOf,
  type SkillProposal,
  type UserSkillEntry,
  type UserSkillsDeps,
} from '../src/user-skills-skill'
import { composeSkills } from '../src/skill'
import type { AgentMessage, AgentToolCall } from '../src/types'

function entry(over: Partial<UserSkillEntry> & { id: string }): UserSkillEntry {
  const name = over.name ?? over.id.split(':').at(-1)!
  return {
    source: over.id.split(':')[0]!,
    name,
    title: name,
    description: `About ${name}`,
    enabled: true,
    invoke: 'auto',
    agentOnly: false,
    hidden: false,
    unreadable: false,
    shadowedBy: undefined,
    owned: over.id.startsWith('app:'),
    ...over,
  }
}

const LIST: UserSkillEntry[] = [
  entry({ id: 'app:home-letter', title: 'Home letter', description: 'Writes a home letter.' }),
  entry({ id: 'builtin:meeting-notes', title: 'Meeting notes' }),
  entry({ id: 'builtin:find-skills', agentOnly: true }),
  entry({ id: 'user:off-one', enabled: false }),
  entry({ id: 'user:manual-one', invoke: 'manual' }),
  entry({ id: 'codex:hidden-one', hidden: true }),
  entry({ id: 'user:broken', unreadable: true }),
  entry({ id: 'user:home-letter', shadowedBy: 'app:home-letter' }),
]

function call(name: string, input: Record<string, unknown>, id = 'call-1'): AgentToolCall {
  return { id, name, input }
}

function makeDeps(over: Partial<UserSkillsDeps> = {}) {
  const proposals: SkillProposal[] = []
  const reads: string[] = []
  const fileReads: Array<[string, string]> = []
  const deps: UserSkillsDeps = {
    list: () => LIST,
    read: async (id) => {
      reads.push(id)
      return {
        ok: true,
        skill: {
          id,
          name: id.split(':')[1]!,
          title: 'Home letter',
          body: 'Write in the school tone.',
          files: ['reference/tone.md'],
          template: undefined,
          hasScripts: false,
        },
      }
    },
    readFile: async (id, path) => {
      fileReads.push([id, path])
      return { ok: true, text: 'file text' }
    },
    onProposal: (p) => proposals.push(p),
    ...over,
  }
  return { deps, proposals, reads, fileReads }
}

describe('autoSkillsSection', () => {
  it('lists enabled, auto, panel skills that won their name, with their ids', () => {
    const text = autoSkillsSection(LIST)
    expect(text).toContain('app:home-letter | Home letter | Writes a home letter.')
    expect(text).toContain('builtin:meeting-notes')
    for (const left of [
      'builtin:find-skills',
      'user:off-one',
      'user:manual-one',
      'codex:hidden-one',
      'user:broken',
      'user:home-letter',
    ]) {
      expect(text).not.toContain(left)
    }
  })

  it('leaves out the skills already attached to this request', () => {
    const text = autoSkillsSection(LIST, { attached: ['app:home-letter'] })
    expect(text).not.toContain('app:home-letter')
    expect(text).toContain('builtin:meeting-notes')
  })

  it('is empty when no skill is used on its own', () => {
    expect(autoSkillsSection([LIST[2]!, LIST[3]!])).toBe('')
  })

  it('cuts each description at the limit', () => {
    const long = 'x'.repeat(AUTO_SKILL_DESCRIPTION_MAX + 50)
    const text = autoSkillsSection([entry({ id: 'app:long', description: long })])
    expect(text).toContain(`${'x'.repeat(AUTO_SKILL_DESCRIPTION_MAX)}…`)
    expect(text).not.toContain('x'.repeat(AUTO_SKILL_DESCRIPTION_MAX + 1))
  })

  it('keeps names only past the skill limit, then drops the rest', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      entry({ id: `app:s${i}`, title: `Skill ${i}`, description: `desc ${i}` }),
    )
    const text = autoSkillsSection(many, { max: 5, namesMax: 4 })
    expect(text).toContain('app:s4 | Skill 4 | desc 4')
    expect(text).toContain('app:s5 | Skill 5')
    expect(text).not.toContain('desc 5')
    expect(text).toContain('app:s8 | Skill 8')
    expect(text).not.toContain('app:s9')
    expect(text).toMatch(/3 more skills/)
  })

  it('defaults to 100 skills with descriptions', () => {
    expect(AUTO_SKILLS_MAX).toBe(100)
    expect(AUTO_SKILL_DESCRIPTION_MAX).toBe(300)
    const many = Array.from({ length: 101 }, (_, i) => entry({ id: `app:s${i}` }))
    const text = autoSkillsSection(many)
    expect(text).toContain('app:s99 | s99 | About s99')
    expect(text).toContain('app:s100 | s100')
    expect(text).not.toContain('About s100')
  })
})

describe('attachedSkillIdsOf', () => {
  it('reads the ids of the skill blocks a request carries', () => {
    const text =
      'Do it\n\n<skill id="app:home-letter" title="A &quot;b&quot;">\nbody\n</skill>\n\n' +
      '<skill id="plugin:x:y&amp;z" title="t">\nb\n</skill>'
    expect(attachedSkillIdsOf(text)).toEqual(['app:home-letter', 'plugin:x:y&z'])
    expect(attachedSkillIdsOf('no skills')).toEqual([])
  })
})

describe('createUserSkillsSkill', () => {
  it('offers the three tools and lists the auto skills in its prompt', () => {
    const { deps } = makeDeps()
    const skill = createUserSkillsSkill(deps)
    expect(skill.tools.map((t) => t.name)).toEqual([
      USE_SKILL_TOOL,
      READ_SKILL_FILE_TOOL,
      PROPOSE_SKILL_TOOL,
    ])
    expect(skill.systemPrompt).toContain('app:home-letter')
    expect(skill.systemPrompt).toContain(PROPOSE_SKILL_TOOL)
  })

  it('carries the guidance on what a new skill keeps in the propose_skill description', () => {
    const { deps } = makeDeps()
    const tool = createUserSkillsSkill(deps).tools.find((t) => t.name === PROPOSE_SKILL_TOOL)!
    expect(tool.description).toMatch(/order|steps/i)
    expect(tool.description).toMatch(/tone/i)
    expect(tool.description).toMatch(/values given each time/i)
    expect(tool.description).toMatch(/never saves|does not save/i)
  })

  it('leaves out of the prompt the skills the last user message attached', () => {
    const messages: AgentMessage[] = [
      { role: 'user', text: 'old <skill id="builtin:meeting-notes" title="M">x</skill>' },
      { role: 'assistant', text: 'ok' },
      { role: 'user', text: 'now\n\n<skill id="app:home-letter" title="H">\nb\n</skill>' },
    ]
    const { deps } = makeDeps({ messages: () => messages })
    const prompt = createUserSkillsSkill(deps).systemPrompt
    expect(prompt).not.toContain('app:home-letter |')
    expect(prompt).toContain('builtin:meeting-notes')
  })

  it('use_skill returns the body, the file list and whether a template is there', async () => {
    const used: string[] = []
    const { deps, reads } = makeDeps({
      onUsed: (skill) => used.push(skill.id),
      labels: { used: (title) => `${title} skill used`, proposed: (t) => t },
    })
    const result = await createUserSkillsSkill(deps).executeTool(
      call(USE_SKILL_TOOL, { id: 'app:home-letter' }),
    )
    expect(result.isError).toBeFalsy()
    expect(reads).toEqual(['app:home-letter'])
    expect(result.output).toContain('Write in the school tone.')
    expect(result.output).toContain('reference/tone.md')
    expect(result.output).toMatch(/template document: none/i)
    expect(result.summary).toBe('Home letter skill used')
    expect(used).toEqual(['app:home-letter'])
  })

  it('use_skill names the template and says scripts do not run', async () => {
    const { deps } = makeDeps({
      read: async (id) => ({
        ok: true,
        skill: {
          id,
          name: 'home-letter',
          title: 'Home letter',
          body: 'b',
          files: [],
          template: 'assets/form.hwpx',
          hasScripts: true,
        },
      }),
    })
    const result = await createUserSkillsSkill(deps).executeTool(
      call(USE_SKILL_TOOL, { id: 'app:home-letter' }),
    )
    expect(result.output).toContain('assets/form.hwpx')
    expect(result.output).toMatch(/scripts .*not run/i)
  })

  it.each([
    ['user:off-one', /turned off/i],
    ['codex:hidden-one', /turned off/i],
    ['builtin:find-skills', /agent window/i],
    ['user:broken', /cannot be read/i],
    ['app:nope', /no skill/i],
  ])('use_skill refuses %s before asking the bridge', async (id, message) => {
    const { deps, reads } = makeDeps()
    const result = await createUserSkillsSkill(deps).executeTool(call(USE_SKILL_TOOL, { id }))
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(message)
    expect(reads).toEqual([])
  })

  it('use_skill passes on a refusal of the bridge', async () => {
    const { deps } = makeDeps({ read: async () => ({ ok: false, reason: 'disabled' }) })
    const result = await createUserSkillsSkill(deps).executeTool(
      call(USE_SKILL_TOOL, { id: 'app:home-letter' }),
    )
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/turned off/i)
  })

  it('use_skill of a skill the request already carries does not read it again', async () => {
    const { deps, reads } = makeDeps({
      messages: () => [{ role: 'user', text: 'x <skill id="app:home-letter" title="H">b</skill>' }],
    })
    const result = await createUserSkillsSkill(deps).executeTool(
      call(USE_SKILL_TOOL, { id: 'app:home-letter' }),
    )
    expect(result.isError).toBeFalsy()
    expect(result.output).toMatch(/already/i)
    expect(reads).toEqual([])
  })

  it('read_skill_file reads a text file of an enabled skill', async () => {
    const { deps, fileReads } = makeDeps()
    const result = await createUserSkillsSkill(deps).executeTool(
      call(READ_SKILL_FILE_TOOL, { id: 'app:home-letter', path: 'reference/tone.md' }),
    )
    expect(result.isError).toBeFalsy()
    expect(result.output).toContain('file text')
    expect(fileReads).toEqual([['app:home-letter', 'reference/tone.md']])
  })

  it.each([
    ['../other/SKILL.md', /inside the skill/i],
    ['/etc/passwd.txt', /inside the skill/i],
    ['C:/Windows/win.txt', /inside the skill/i],
    ['a/../../b.md', /inside the skill/i],
    ['scripts/run.py', /text files/i],
    ['assets/form.hwpx', /text files/i],
  ])('read_skill_file refuses %s without asking the bridge', async (path, message) => {
    const { deps, fileReads } = makeDeps()
    const result = await createUserSkillsSkill(deps).executeTool(
      call(READ_SKILL_FILE_TOOL, { id: 'app:home-letter', path }),
    )
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(message)
    expect(fileReads).toEqual([])
  })

  it.each([
    ['user:off-one', /turned off/i],
    ['builtin:find-skills', /agent window/i],
  ])('read_skill_file refuses the skill %s', async (id, message) => {
    const { deps, fileReads } = makeDeps()
    const result = await createUserSkillsSkill(deps).executeTool(
      call(READ_SKILL_FILE_TOOL, { id, path: 'notes.md' }),
    )
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(message)
    expect(fileReads).toEqual([])
  })

  it.each([
    ['too-large', /too large/i],
    ['outside', /inside the skill/i],
    ['not-text', /text files/i],
    ['not-found', /no file|not found/i],
  ])('read_skill_file passes on the bridge refusal %s', async (reason, message) => {
    const { deps } = makeDeps({ readFile: async () => ({ ok: false, reason }) })
    const result = await createUserSkillsSkill(deps).executeTool(
      call(READ_SKILL_FILE_TOOL, { id: 'app:home-letter', path: 'big.md' }),
    )
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(message)
  })

  it('propose_skill hands the proposal over and writes nothing', async () => {
    const read = vi.fn()
    const readFile = vi.fn()
    const { deps, proposals } = makeDeps({ read, readFile })
    const result = await createUserSkillsSkill(deps).executeTool(
      call(
        PROPOSE_SKILL_TOOL,
        {
          title: ' Minutes ',
          name: 'minutes',
          description: 'Writes minutes in our format.',
          body: '1. Date\n2. Decisions',
          wantsTemplate: true,
        },
        'call-42',
      ),
    )
    expect(result.isError).toBeFalsy()
    expect(result.mutated).toBeFalsy()
    expect(result.output).toMatch(/card/i)
    expect(result.output).toMatch(/not saved|nothing is saved/i)
    // the result and the tool row name the proposal by its name
    expect(proposedTitleOf(result.output)).toBe('minutes')
    expect(result.summary).toBe('Skill proposal: minutes')
    expect(proposedTitleOf('other')).toBe('')
    expect(proposals).toEqual([
      {
        key: 'call-42',
        title: 'Minutes',
        name: 'minutes',
        description: 'Writes minutes in our format.',
        body: '1. Date\n2. Decisions',
        wantsTemplate: true,
        target: undefined,
      },
    ])
    expect(read).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
  })

  it('propose_skill points at the skill it changes, with whether it is the person’s own', async () => {
    const { deps, proposals } = makeDeps()
    const skill = createUserSkillsSkill(deps)
    await skill.executeTool(
      call(PROPOSE_SKILL_TOOL, {
        title: 'Meeting notes',
        description: 'd',
        body: 'b',
        targetId: 'builtin:meeting-notes',
      }),
    )
    await skill.executeTool(
      call(PROPOSE_SKILL_TOOL, {
        title: 'Home letter',
        description: 'd',
        body: 'b',
        targetId: 'app:home-letter',
      }),
    )
    expect(proposals.map((p) => p.target)).toEqual([
      {
        id: 'builtin:meeting-notes',
        name: 'meeting-notes',
        title: 'Meeting notes',
        owned: false,
        source: 'builtin',
      },
      {
        id: 'app:home-letter',
        name: 'home-letter',
        title: 'Home letter',
        owned: true,
        source: 'app',
      },
    ])
    expect(proposals.map((p) => p.name)).toEqual(['', ''])
    expect(proposals.map((p) => p.wantsTemplate)).toEqual([false, false])
  })

  it('propose_skill asks for a name, not a title', () => {
    const { deps } = makeDeps()
    const tool = createUserSkillsSkill(deps).tools.find((t) => t.name === PROPOSE_SKILL_TOOL)!
    const schema = tool.inputSchema as { properties: Record<string, unknown>; required: string[] }
    expect(schema.properties).not.toHaveProperty('title')
    expect(schema.properties).toHaveProperty('name')
    expect(schema.required).toEqual(['name', 'description', 'body'])
  })

  it('propose_skill takes a name without a title', async () => {
    const { deps, proposals } = makeDeps()
    const result = await createUserSkillsSkill(deps).executeTool(
      call(PROPOSE_SKILL_TOOL, { name: ' minutes ', description: 'd', body: 'b' }),
    )
    expect(result.isError).toBeFalsy()
    expect(proposedTitleOf(result.output)).toBe('minutes')
    expect(result.summary).toBe('Skill proposal: minutes')
    expect(proposals).toEqual([expect.objectContaining({ title: '', name: 'minutes' })])
  })

  it('propose_skill still takes a title without a name (older prompts)', async () => {
    const { deps, proposals } = makeDeps()
    const result = await createUserSkillsSkill(deps).executeTool(
      call(PROPOSE_SKILL_TOOL, { title: 'Minutes', description: 'd', body: 'b' }),
    )
    expect(result.isError).toBeFalsy()
    expect(proposedTitleOf(result.output)).toBe('Minutes')
    expect(result.summary).toBe('Skill proposal: Minutes')
    expect(proposals).toEqual([expect.objectContaining({ title: 'Minutes', name: '' })])
  })

  it.each([
    [{ description: 'd', body: 'b' }, /name must not be empty/],
    [{ title: ' ', name: '  ', description: 'd', body: 'b' }, /name must not be empty/],
    [{ title: 't', description: 'd', body: '  ' }, /body/i],
    [{ title: 't', description: 'd', body: 'b', targetId: 'app:nope' }, /no skill/i],
    [{ title: 't', description: 'd', body: 'b', targetId: 'builtin:find-skills' }, /agent/i],
    [{ title: 't', description: 'd', body: 'b', targetId: 'user:broken' }, /cannot be read/i],
  ])('propose_skill refuses %j', async (input, message) => {
    const { deps, proposals } = makeDeps()
    const result = await createUserSkillsSkill(deps).executeTool(call(PROPOSE_SKILL_TOOL, input))
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(message)
    expect(proposals).toEqual([])
  })

  it('composes with other skills without a tool name clash', () => {
    const { deps } = makeDeps()
    const composed = composeSkills('x', '', [createUserSkillsSkill(deps)])
    expect(composed.tools).toHaveLength(3)
  })
})

describe('userSkillEntriesOf', () => {
  it('keeps well-formed views and reads their states', () => {
    const entries = userSkillEntriesOf([
      {
        id: 'app:a',
        source: 'app',
        name: 'a',
        title: 'A',
        description: 'd',
        enabled: true,
        invoke: 'manual',
        agentOnly: false,
        hidden: false,
        unreadable: undefined,
        shadowedBy: undefined,
        owned: true,
      },
      { id: 'no-colon', name: 'x' },
      null,
      'text',
      { id: 'user:genoffice', source: 'user', name: 'GenOffice', enabled: true },
    ])
    expect(entries).toEqual([
      {
        id: 'app:a',
        source: 'app',
        name: 'a',
        title: 'A',
        description: 'd',
        enabled: true,
        invoke: 'manual',
        agentOnly: false,
        hidden: false,
        unreadable: false,
        shadowedBy: undefined,
        owned: true,
      },
    ])
    expect(userSkillEntriesOf('nope')).toEqual([])
  })
})

describe('createBridgedUserSkillsSkill', () => {
  it('reads the list from the bridge, again on a change, and asks the bridge for text', async () => {
    let changed: (() => void) | undefined
    let views: unknown[] = [
      { id: 'app:a', source: 'app', name: 'a', title: 'A', description: 'd', enabled: true },
    ]
    const bridge = {
      list: vi.fn(async () => views),
      aiRead: vi.fn(async (id: string) => ({
        ok: true,
        skill: { id, name: 'a', title: 'A', body: 'body', files: [], hasScripts: false },
      })),
      aiReadFile: vi.fn(async () => ({ ok: false, reason: 'too-large' })),
      onChanged: (listener: () => void) => {
        changed = listener
        return () => (changed = undefined)
      },
    }
    const skill = createBridgedUserSkillsSkill(bridge, { onProposal: () => {} })
    await vi.waitFor(() => expect(skill.systemPrompt).toContain('app:a | A | d'))
    views = []
    changed?.()
    await vi.waitFor(() => expect(skill.systemPrompt).not.toContain('app:a'))
    views = [{ id: 'app:a', source: 'app', name: 'a', title: 'A', description: 'd', enabled: true }]
    changed?.()
    await vi.waitFor(() => expect(skill.systemPrompt).toContain('app:a'))
    const used = await skill.executeTool(call(USE_SKILL_TOOL, { id: 'app:a' }))
    expect(used.output).toContain('body')
    expect(bridge.aiRead).toHaveBeenCalledWith('app:a')
    const file = await skill.executeTool(call(READ_SKILL_FILE_TOOL, { id: 'app:a', path: 'x.md' }))
    expect(file.isError).toBe(true)
    expect(file.output).toMatch(/too large/i)
    skill.dispose()
    expect(changed).toBeUndefined()
  })

  it('reads the list again once before refusing a skill it does not know yet', async () => {
    // a skill added in Settings while the change notice is still on its way (spec 9.2)
    let views: unknown[] = []
    const bridge = {
      list: vi.fn(async () => views),
      aiRead: vi.fn(async (id: string) => ({
        ok: true,
        skill: { id, name: 'new', title: 'New', body: 'fresh body', files: [], hasScripts: false },
      })),
      aiReadFile: vi.fn(async () => ({ ok: true, text: 'file text' })),
      onChanged: () => () => {},
    }
    const skill = createBridgedUserSkillsSkill(bridge, { onProposal: () => {} })
    await vi.waitFor(() => expect(bridge.list).toHaveBeenCalledTimes(1))
    views = [
      { id: 'app:new', source: 'app', name: 'new', title: 'New', description: 'd', enabled: true },
    ]
    const used = await skill.executeTool(call(USE_SKILL_TOOL, { id: 'app:new' }))
    expect(used.isError).toBeFalsy()
    expect(used.output).toContain('fresh body')
    expect(bridge.list).toHaveBeenCalledTimes(2)
    const file = await skill.executeTool(
      call(READ_SKILL_FILE_TOOL, { id: 'app:new', path: 'x.md' }),
    )
    expect(file.output).toContain('file text')
    // known now: no further list read
    expect(bridge.list).toHaveBeenCalledTimes(2)
    // still unknown after one more read: refused, with one read per call
    const missing = await skill.executeTool(call(USE_SKILL_TOOL, { id: 'app:gone' }))
    expect(missing.isError).toBe(true)
    expect(bridge.list).toHaveBeenCalledTimes(3)
    const missingFile = await skill.executeTool(
      call(READ_SKILL_FILE_TOOL, { id: 'app:gone', path: 'x.md' }),
    )
    expect(missingFile.isError).toBe(true)
    expect(bridge.list).toHaveBeenCalledTimes(4)
    expect(bridge.aiRead).toHaveBeenCalledTimes(1)
  })

  it('treats a malformed bridge answer as a failure', async () => {
    const bridge = {
      list: async () => [
        { id: 'app:a', source: 'app', name: 'a', title: 'A', description: 'd', enabled: true },
      ],
      aiRead: async () => 'garbage',
      aiReadFile: async () => {
        throw new Error('gone')
      },
      onChanged: () => () => {},
    }
    const skill = createBridgedUserSkillsSkill(bridge, { onProposal: () => {} })
    await vi.waitFor(() => expect(skill.systemPrompt).toContain('app:a'))
    const used = await skill.executeTool(call(USE_SKILL_TOOL, { id: 'app:a' }))
    expect(used.isError).toBe(true)
    const file = await skill.executeTool(call(READ_SKILL_FILE_TOOL, { id: 'app:a', path: 'x.md' }))
    expect(file.isError).toBe(true)
  })
})
