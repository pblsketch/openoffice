/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LANGS } from '@genoffice/i18n'
import { SKILL_SKIPPED_STEPS_SENTENCE } from '@genoffice/agent-core/skill-mcp-refs'
import { SkillChipRow } from '../src/SkillPicker'
import { pickerSkillsOf, skillChipOf } from '../src/skill-picker-model'
import {
  buildSkillRequest,
  skillForRequestOf,
  skillRequestText,
  type SkillForRequest,
} from '../src/skill-send'
import { SKILL_PICKER_STRINGS, skillPickerText } from '../src/strings-skill-picker'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const plain: SkillForRequest = {
  id: 'app:letter',
  title: 'Letter',
  body: 'Write a letter.',
  files: [],
  mcpServers: [],
}
const brief: SkillForRequest = {
  id: 'app:case-brief',
  title: 'Case brief',
  body: 'Check each case with mcp__korean-law__search_decisions.',
  files: [],
  mcpServers: ['korean-law'],
}

describe('the chips the person chose: skipped steps (spec 8)', () => {
  it('ends every skill with the sentence', () => {
    const text = skillRequestText([plain, brief])
    const blocks = text.split('</skill>\n').slice(1)
    expect(blocks).toHaveLength(2)
    for (const after of blocks) expect(after).toMatch(/If any step of this skill cannot be done/)
    expect(text.split(SKILL_SKIPPED_STEPS_SENTENCE)).toHaveLength(3)
    expect(text).not.toContain('Do the work without them.')
  })

  it('names an unusable server before the sentence of its own skill', () => {
    const text = skillRequestText([plain, brief])
    expect(text).toContain(
      '</skill>\nThis skill expects tools from MCP server korean-law, which cannot be used ' +
        `right now.\n${SKILL_SKIPPED_STEPS_SENTENCE}`,
    )
    expect(text.split('MCP server')).toHaveLength(2)
  })

  it('leaves the server out when the dependency says it is usable', () => {
    const text = skillRequestText([brief], { mcpServerUsable: (name) => name === 'korean-law' })
    expect(text).not.toContain('MCP server')
    expect(text).toContain(SKILL_SKIPPED_STEPS_SENTENCE)
    const built = buildSkillRequest([brief], 1_000_000, { mcpServerUsable: () => true })
    expect(built.ok && built.text).toBe(text)
  })

  it('reads the servers from the bridge answer', () => {
    expect(
      skillForRequestOf({
        ok: true,
        skill: { id: 'a:b', body: 'x', files: [], mcpServers: ['law', 1, 'law'] },
      })?.mcpServers,
    ).toEqual(['law'])
    expect(skillForRequestOf({ ok: true, skill: { id: 'a:b', body: 'x' } })?.mcpServers).toEqual([])
  })
})

describe('the list and the chips carry the servers', () => {
  const view = {
    id: 'app:case-brief',
    source: 'app',
    name: 'case-brief',
    title: 'Case brief',
    description: '',
    enabled: true,
    hidden: false,
    agentOnly: false,
    hasScripts: false,
    mcpServers: ['korean-law', 3],
  }

  it('reads them into the row and the chip', () => {
    const [row] = pickerSkillsOf([view], 'ko')
    expect(row!.mcpServers).toEqual(['korean-law'])
    expect(skillChipOf(row!).mcpServers).toEqual(['korean-law'])
    const [older] = pickerSkillsOf([{ ...view, mcpServers: undefined }], 'ko')
    expect(older!.mcpServers).toEqual([])
  })
})

describe('SkillChipRow: MCP server mark', () => {
  let host: HTMLDivElement
  let root: Root
  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  const chip = {
    id: 'app:case-brief',
    source: 'app',
    title: 'Case brief',
    mcpServers: ['korean-law', 'web'],
  }

  function render(props: Record<string, unknown>) {
    act(() => {
      root.render(
        createElement(SkillChipRow, { lang: 'ko', chips: [chip], onRemove: () => {}, ...props }),
      )
    })
    return host.textContent ?? ''
  }

  it('names every server when no usable set is given', () => {
    expect(render({})).toContain(
      skillPickerText('ko', 'mcpServerNeeded', { servers: 'korean-law, web' }),
    )
    expect(render({})).toContain('MCP 서버 필요: korean-law, web')
  })

  it('leaves out the servers that are registered and on', () => {
    const text = render({ usableMcpServers: new Set(['korean-law']) })
    expect(text).toContain('MCP 서버 필요: web')
    expect(text).not.toContain('korean-law,')
    expect(render({ usableMcpServers: new Set(['korean-law', 'web']) })).not.toContain('MCP')
  })

  it('says nothing for a chip that is gone', () => {
    act(() => {
      root.render(
        createElement(SkillChipRow, {
          lang: 'ko',
          chips: [{ ...chip, missing: true }],
          onRemove: () => {},
        }),
      )
    })
    expect(host.textContent).not.toContain('MCP')
  })
})

describe('mcpServerNeeded string', () => {
  it('is in every language with the {servers} placeholder', () => {
    for (const lang of LANGS) {
      expect(SKILL_PICKER_STRINGS[lang].mcpServerNeeded, lang).toContain('{servers}')
      expect(SKILL_PICKER_STRINGS[lang].mcpServerNeeded, lang).toContain('MCP')
    }
  })
})
