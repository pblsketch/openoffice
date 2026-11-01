import { describe, expect, it } from 'vitest'
import {
  USE_SKILL_TOOL,
  createUserSkillsSkill,
  skillTextAnswerOf,
  type UserSkillEntry,
  type UserSkillText,
  type UserSkillsDeps,
} from '../src/user-skills-skill'
import { SKILL_SKIPPED_STEPS_SENTENCE } from '../src/skill-mcp-refs'

const ENTRY: UserSkillEntry = {
  id: 'app:case-brief',
  source: 'app',
  name: 'case-brief',
  title: 'Case brief',
  description: 'Drafts a brief and checks the cases.',
  enabled: true,
  invoke: 'auto',
  agentOnly: false,
  hidden: false,
  unreadable: false,
  shadowedBy: undefined,
  owned: true,
}

function deps(skill: Partial<UserSkillText>, over: Partial<UserSkillsDeps> = {}): UserSkillsDeps {
  return {
    list: () => [ENTRY],
    read: async (id) => ({
      ok: true,
      skill: {
        id,
        name: 'case-brief',
        title: 'Case brief',
        body: 'Draft the brief.',
        files: [],
        template: undefined,
        hasScripts: false,
        mcpServers: [],
        ...skill,
      },
    }),
    readFile: async () => ({ ok: false, reason: 'not-found' }),
    onProposal: () => undefined,
    ...over,
  }
}

async function use(d: UserSkillsDeps): Promise<string> {
  const result = await createUserSkillsSkill(d).executeTool({
    id: 'c1',
    name: USE_SKILL_TOOL,
    input: { id: ENTRY.id },
  })
  expect(result.isError).toBeFalsy()
  return result.output
}

describe('use_skill: skipped steps (spec 8)', () => {
  it('ends every skill with the sentence, scripts or not', async () => {
    const plain = await use(deps({}))
    expect(plain.endsWith(SKILL_SKIPPED_STEPS_SENTENCE)).toBe(true)
    expect(plain).not.toContain('MCP server')

    const scripts = await use(deps({ hasScripts: true }))
    expect(scripts).toMatch(/scripts are not run here/)
    expect(scripts).not.toContain('Do the work without them.')
    expect(scripts.endsWith(SKILL_SKIPPED_STEPS_SENTENCE)).toBe(true)
  })

  it('names a referenced server nobody says is usable, before the sentence', async () => {
    const output = await use(deps({ mcpServers: ['korean-law'] }))
    expect(output).toContain(
      'This skill expects tools from MCP server korean-law, which cannot be used right now.\n' +
        SKILL_SKIPPED_STEPS_SENTENCE,
    )
  })

  it('leaves out a server the dependency says is usable', async () => {
    const output = await use(
      deps(
        { mcpServers: ['korean-law', 'web'] },
        { mcpServerUsable: (name) => name === 'korean-law' },
      ),
    )
    expect(output).not.toContain('MCP server korean-law')
    expect(output).toContain('MCP server web, which cannot be used right now.')
  })

  it('reads the servers out of the bridge answer', () => {
    const answer = skillTextAnswerOf({
      ok: true,
      skill: { id: 'a:b', body: 'x', mcpServers: ['law', 7, '', 'law', 'web'] },
    })
    expect(answer.ok && answer.skill.mcpServers).toEqual(['law', 'web'])
    const older = skillTextAnswerOf({ ok: true, skill: { id: 'a:b', body: 'x' } })
    expect(older.ok && older.skill.mcpServers).toEqual([])
  })
})
