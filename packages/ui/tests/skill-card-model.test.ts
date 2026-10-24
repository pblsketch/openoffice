import { describe, expect, it } from 'vitest'
import { attachedSkillIdsOf, type SkillProposal } from '@genoffice/agent-core'
import {
  initialSkillCardDraft,
  isSkillCardSavedMessage,
  readStoredSkillCards,
  skillCardMode,
  skillCardNameVerdict,
  skillCardSaveBlock,
  skillCardSaveFailureKey,
  skillCardSaveInput,
  skillCardSaveResultOf,
  skillCardSavedRecord,
  skillNameCheckOf,
} from '../src/skill-card-model'
import { skillRequestText } from '../src/skill-send'

const NEW: SkillProposal = {
  key: 'k1',
  title: 'Minutes',
  name: 'minutes',
  description: 'Writes minutes.',
  body: '1. Date',
  wantsTemplate: false,
  target: undefined,
}
const OWN: SkillProposal = {
  ...NEW,
  key: 'k2',
  name: '',
  target: { id: 'app:minutes', name: 'minutes', title: 'Minutes', owned: true, source: 'app' },
}
const OTHER: SkillProposal = {
  ...NEW,
  key: 'k3',
  name: '',
  target: {
    id: 'builtin:Meeting_Notes',
    name: 'Meeting_Notes',
    title: 'Meeting notes',
    owned: false,
    source: 'builtin',
  },
}

describe('the card mode and its starting fields', () => {
  it('tells a new skill, a change of my own, and a copy apart', () => {
    expect(skillCardMode(NEW)).toBe('new')
    expect(skillCardMode(OWN)).toBe('edit-own')
    expect(skillCardMode(OTHER)).toBe('copy')
  })

  it('starts as "on its own", with the template box as the model asked', () => {
    expect(initialSkillCardDraft(NEW)).toEqual({
      title: 'Minutes',
      name: 'minutes',
      description: 'Writes minutes.',
      body: '1. Date',
      invoke: 'auto',
      withTemplate: false,
    })
    expect(initialSkillCardDraft({ ...NEW, wantsTemplate: true }).withTemplate).toBe(true)
    // a change without a name keeps the changed skill's name
    expect(initialSkillCardDraft(OTHER).name).toBe('Meeting_Notes')
  })
})

describe('when Save is blocked', () => {
  const draft = initialSkillCardDraft(NEW)

  it.each([
    [{ description: '' }, 'blockDescription'],
    [{ body: '\n' }, 'blockBody'],
  ])('blocks %j', (patch, key) => {
    expect(skillCardSaveBlock({ ...draft, ...patch }, null)).toBe(key)
  })

  it('allows Save with an empty title: lists show the name', () => {
    expect(skillCardSaveBlock({ ...draft, title: '' }, null)).toBeNull()
    expect(skillCardSaveBlock({ ...draft, title: '  ' }, null)).toBeNull()
    expect(skillCardSaveInput({ ...draft, title: '' }, NEW)).toMatchObject({
      title: '',
      name: 'minutes',
    })
  })

  it('blocks on the name rule, and while the name is being checked', () => {
    expect(skillCardNameVerdict('new', NEW, '', { ok: true }).blocked).toBe('nameEmpty')
    expect(skillCardNameVerdict('new', NEW, 'x', 'checking').blocked).toBe('nameChecking')
    expect(
      skillCardNameVerdict('new', NEW, 'Bad Name', { ok: false, problem: 'characters' }).blocked,
    ).toBe('nameCharacters')
    expect(
      skillCardNameVerdict('new', NEW, '-x', { ok: false, problem: 'hyphen-edge' }).blocked,
    ).toBe('nameHyphenEdge')
    expect(skillCardSaveBlock(draft, 'nameCharacters')).toBe('nameCharacters')
    expect(skillCardSaveBlock(draft, null)).toBeNull()
  })

  it('refuses a used name for a new skill, replaces it for a copy', () => {
    const taken = { ok: false as const, problem: 'taken' as const }
    expect(skillCardNameVerdict('new', NEW, 'minutes', taken)).toEqual({
      blocked: 'nameTaken',
      overwrite: false,
      notice: null,
    })
    expect(skillCardNameVerdict('copy', OTHER, 'meeting-notes', taken)).toEqual({
      blocked: null,
      overwrite: true,
      notice: 'nameTakenReplace',
    })
  })

  it('keeps the changed skill’s own name whatever the strict rule says', () => {
    const bad = { ok: false as const, problem: 'characters' as const }
    expect(skillCardNameVerdict('copy', OTHER, 'Meeting_Notes', bad).blocked).toBeNull()
    expect(skillCardNameVerdict('copy', OTHER, 'Other_Name', bad).blocked).toBe('nameCharacters')
  })
})

describe('what Save hands to the shell', () => {
  it('a new skill: the fields and when it is used, no target', () => {
    const draft = { ...initialSkillCardDraft(NEW), invoke: 'manual' as const, title: ' Minutes ' }
    expect(skillCardSaveInput(draft, NEW)).toEqual({
      title: 'Minutes',
      name: 'minutes',
      description: 'Writes minutes.',
      body: '1. Date',
      invoke: 'manual',
    })
  })

  it('a change of my own skill names it', () => {
    expect(skillCardSaveInput(initialSkillCardDraft(OWN), OWN)).toMatchObject({
      targetId: 'app:minutes',
      name: 'minutes',
    })
  })

  it('a copy names the original and may replace my skill of the same name', () => {
    const input = skillCardSaveInput(initialSkillCardDraft(OTHER), OTHER, { overwrite: true })
    expect(input).toMatchObject({ targetId: 'builtin:Meeting_Notes', overwrite: true })
  })

  it('carries a template only when one is given', () => {
    const draft = initialSkillCardDraft(NEW)
    expect(skillCardSaveInput(draft, NEW)).not.toHaveProperty('template')
    expect(
      skillCardSaveInput(draft, NEW, {
        template: { bytes: new Uint8Array([1]), fileName: 'b.docx' },
      }).template,
    ).toEqual({ bytes: new Uint8Array([1]), fileName: 'b.docx' })
  })

  it('reads the answers that cross the bridge', () => {
    expect(skillCardSaveResultOf({ ok: true, id: 'app:minutes' })).toEqual({
      ok: true,
      id: 'app:minutes',
    })
    expect(skillCardSaveResultOf({ ok: false, reason: 'bad-name', problem: 'reserved' })).toEqual({
      ok: false,
      reason: 'bad-name',
      problem: 'reserved',
    })
    expect(skillCardSaveResultOf(null)).toEqual({ ok: false, reason: 'failed' })
    expect(skillNameCheckOf({ ok: true })).toEqual({ ok: true })
    expect(skillNameCheckOf({ ok: false, problem: 'taken' })).toEqual({
      ok: false,
      problem: 'taken',
    })
    expect(skillNameCheckOf('x')).toEqual({ ok: false, problem: 'empty' })
    expect(skillCardSaveFailureKey('bad-name', 'reserved')).toBe('nameReserved')
    expect(skillCardSaveFailureKey('name-taken')).toBe('nameTaken')
    expect(skillCardSaveFailureKey('trash-failed')).toBe('trashFailed')
    expect(skillCardSaveFailureKey('failed')).toBe('saveFailed')
    // the shell no longer refuses an empty title; an old answer falls to the default
    expect(skillCardSaveFailureKey('empty-title')).toBe('saveFailed')
  })
})

describe('cards in a stored conversation', () => {
  const proposalRecord = (title: string) => ({
    name: 'propose_skill',
    summary: `Skill proposal: ${title}`,
    input: JSON.stringify({ title, description: 'd', body: 'b' }),
    output: 'The skill card is shown',
  })

  it('reads every proposal back as unsaved, and a saved record marks its card saved', () => {
    const messages = [
      { role: 'user' as const, text: 'save this as a skill' },
      { role: 'assistant' as const, text: 'Here is the card.', tools: [proposalRecord('A')] },
      { role: 'user' as const, text: 'another one' },
      {
        role: 'assistant' as const,
        text: 'Two cards.',
        tools: [proposalRecord('B'), { ...proposalRecord('C'), isError: true }],
      },
      { role: 'assistant' as const, text: '', tools: [skillCardSavedRecord('A', 'app:a')] },
    ]
    const read = readStoredSkillCards(messages, 'p')
    expect(read.messages).toHaveLength(4)
    expect(read.messages.some(isSkillCardSavedMessage)).toBe(false)
    expect(read.messages[1]!.skillProposals).toEqual(['p-1-0'])
    expect(read.messages[3]!.skillProposals).toEqual(['p-3-0'])
    expect(read.messages[0]!.skillProposals).toBeUndefined()
    expect(read.proposals).toEqual([
      { key: 'p-1-0', title: 'A', status: 'saved' },
      { key: 'p-3-0', title: 'B', status: 'unsaved' },
    ])
  })

  it('a record kept without its input names the card by the tool result', () => {
    const read = readStoredSkillCards([
      {
        role: 'assistant' as const,
        text: 'x',
        tools: [
          {
            name: 'propose_skill',
            summary: 's',
            output: `Skill card shown: ${JSON.stringify('Say "hi"')}\nThe skill card is shown`,
          },
        ],
      },
    ])
    expect(read.proposals).toEqual([{ key: 'stored-0-0', title: 'Say "hi"', status: 'unsaved' }])
  })

  it('a proposal given only a name is read back by its name and matched to its saved record', () => {
    const named = {
      name: 'propose_skill',
      summary: 'Skill proposal: minutes',
      input: JSON.stringify({ name: 'minutes', description: 'd', body: 'b' }),
      output: `Skill card shown: ${JSON.stringify('minutes')}\nThe skill card is shown`,
    }
    const read = readStoredSkillCards([
      { role: 'assistant' as const, text: 'x', tools: [named] },
      { role: 'assistant' as const, text: '', tools: [skillCardSavedRecord('minutes', 'app:m')] },
    ])
    expect(read.proposals).toEqual([{ key: 'stored-0-0', title: 'minutes', status: 'saved' }])
  })

  it('a record the store cut off still shows, as an untitled card', () => {
    const cut = { ...proposalRecord('A'), input: '{"title":"A","bo' }
    const read = readStoredSkillCards([
      { role: 'assistant' as const, text: 'x', tools: [cut] },
      { role: 'assistant' as const, text: '', tools: [skillCardSavedRecord('A', 'app:a')] },
    ])
    expect(read.proposals).toEqual([{ key: 'stored-0-0', title: '', status: 'saved' }])
  })

  it('a saved record is told apart from a turn that only ran tools', () => {
    expect(
      isSkillCardSavedMessage({
        role: 'assistant',
        text: '',
        tools: [skillCardSavedRecord('A', 'app:a')],
      }),
    ).toBe(true)
    expect(
      isSkillCardSavedMessage({ role: 'assistant', text: '', tools: [proposalRecord('A')] }),
    ).toBe(false)
    expect(isSkillCardSavedMessage({ role: 'assistant', text: '' })).toBe(false)
  })
})

describe('the skills attached to a request', () => {
  it('reads back the ids skillRequestText writes', () => {
    const text = skillRequestText([
      { id: 'app:home-letter', title: 'Say "hi" <now>', body: 'b', files: [] },
      { id: 'plugin:a&b:c', title: 't', body: 'b', files: ['x.md'] },
    ])
    expect(attachedSkillIdsOf(`question${text}`)).toEqual(['app:home-letter', 'plugin:a&b:c'])
  })
})
