import { describe, expect, it, vi } from 'vitest'
import type { Lang } from '@genoffice/i18n'
import type { SkillProposal } from '@genoffice/agent-core'
import { panelUserSkills } from '../src/use-skill-proposals'

const bridge = (views: unknown[]) => ({
  list: vi.fn(async () => views),
  aiRead: vi.fn(async (id: string) => ({
    ok: true,
    skill: { id, name: 'meeting-minutes', title: 'meeting-minutes', body: 'b', files: [] },
  })),
  aiReadFile: vi.fn(async () => ({ ok: true, text: 't' })),
  onChanged: () => () => {},
})

const VIEW = {
  id: 'builtin:meeting-minutes',
  source: 'builtin',
  name: 'meeting-minutes',
  title: 'meeting-minutes',
  description: 'd',
  enabled: true,
  invoke: 'auto',
}

describe('panelUserSkills', () => {
  it('adds nothing in a window without the skills bridge', () => {
    expect(
      panelUserSkills({ lang: () => 'en', messages: () => [], onProposal: () => {}, bridge: null }),
    ).toEqual([])
  })

  it('words the tool rows in the UI language, builtins by their name', async () => {
    let lang: Lang = 'ko'
    const proposals: SkillProposal[] = []
    const [skill] = panelUserSkills({
      lang: () => lang,
      messages: () => [],
      onProposal: (p) => proposals.push(p),
      bridge: bridge([{ ...VIEW, title: 'Meeting minutes' }]),
    })
    await vi.waitFor(() =>
      expect(skill!.systemPrompt).toContain('builtin:meeting-minutes | meeting-minutes'),
    )
    const used = await skill!.executeTool({
      id: 'c1',
      name: 'use_skill',
      input: { id: 'builtin:meeting-minutes' },
    })
    expect(used.summary).toBe('meeting-minutes 스킬을 썼습니다')
    lang = 'en'
    const proposed = await skill!.executeTool({
      id: 'c2',
      name: 'propose_skill',
      input: { name: 'minutes', description: 'd', body: 'b' },
    })
    expect(proposed.summary).toBe('Skill proposal: minutes')
    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({ name: 'minutes', title: '' })
  })

  it('shows a skill with a made-up name by the title it was made with', async () => {
    const view = {
      ...VIEW,
      id: 'app:skill-a1b2c3',
      source: 'app',
      name: 'skill-a1b2c3',
      title: '가정통신문',
    }
    const [skill] = panelUserSkills({
      lang: () => 'ko',
      messages: () => [],
      onProposal: () => {},
      bridge: {
        ...bridge([view]),
        aiRead: vi.fn(async (id: string) => ({
          ok: true,
          skill: { id, name: 'skill-a1b2c3', title: '가정통신문', body: 'b', files: [] },
        })),
      },
    })
    await vi.waitFor(() => expect(skill!.systemPrompt).toContain('app:skill-a1b2c3 | 가정통신문'))
    const used = await skill!.executeTool({
      id: 'c1',
      name: 'use_skill',
      input: { id: 'app:skill-a1b2c3' },
    })
    expect(used.summary).toBe('가정통신문 스킬을 썼습니다')
  })
})
