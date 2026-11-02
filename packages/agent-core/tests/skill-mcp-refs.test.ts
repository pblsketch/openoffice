import { describe, expect, it } from 'vitest'
import {
  SKILL_SKIPPED_STEPS_SENTENCE,
  mcpServersInAllowedTools,
  mcpServersInText,
  mcpServersOfSkill,
  skillStepsNote,
  unusableMcpServers,
} from '../src/skill-mcp-refs'
import * as root from '../src/index'

describe('SKILL_SKIPPED_STEPS_SENTENCE', () => {
  it('asks the model to name the steps it could not do', () => {
    expect(SKILL_SKIPPED_STEPS_SENTENCE).toMatch(/cannot be done here/)
    expect(SKILL_SKIPPED_STEPS_SENTENCE).toMatch(/running scripts/)
    expect(SKILL_SKIPPED_STEPS_SENTENCE).toMatch(/missing or failed/)
    expect(SKILL_SKIPPED_STEPS_SENTENCE).toMatch(/Do not write as if that step was done\.$/)
  })

  it('is exported from the package root for the agent window', () => {
    expect(root.SKILL_SKIPPED_STEPS_SENTENCE).toBe(SKILL_SKIPPED_STEPS_SENTENCE)
    expect(root.mcpServersOfSkill).toBe(mcpServersOfSkill)
  })
})

describe('mcpServersInText', () => {
  it('finds the server of every mcp__<server>__<tool> in a body, once each, in order', () => {
    const body = [
      'Check each case with `mcp__korean-law__search_decisions`.',
      'Then read it with mcp__korean-law__get_decision_text and',
      'look up the statute (mcp__plugin_moai-legal_korean-law__search_law).',
      'Any tool works: mcp__notes.v2__*.',
    ].join('\n')
    expect(mcpServersInText(body)).toEqual([
      'korean-law',
      'plugin_moai-legal_korean-law',
      'notes.v2',
    ])
  })

  it('needs the tool part and a word boundary before mcp__', () => {
    expect(mcpServersInText('mcp__lonely and xmcp__a__b and mcp____b')).toEqual([])
    expect(mcpServersInText('')).toEqual([])
  })
})

describe('mcpServersInAllowedTools', () => {
  it('reads a YAML list', () => {
    expect(
      mcpServersInAllowedTools(['Read', 'mcp__law__search', 'mcp__law__get', 'mcp__drive']),
    ).toEqual(['law', 'drive'])
  })

  it('reads a comma or space separated string', () => {
    expect(mcpServersInAllowedTools('Read, Grep, mcp__law__search,mcp__cal__list')).toEqual([
      'law',
      'cal',
    ])
    expect(mcpServersInAllowedTools('Read mcp__law__search  "mcp__web__fetch"')).toEqual([
      'law',
      'web',
    ])
  })

  it('takes a server alone (all its tools) only here', () => {
    expect(mcpServersInAllowedTools('mcp__github')).toEqual(['github'])
  })

  it('is empty without the key', () => {
    expect(mcpServersInAllowedTools(undefined)).toEqual([])
    expect(mcpServersInAllowedTools('')).toEqual([])
    expect(mcpServersInAllowedTools([])).toEqual([])
  })
})

describe('mcpServersOfSkill', () => {
  it('joins the front matter and the body without repeats', () => {
    expect(
      mcpServersOfSkill('Use mcp__law__search and mcp__web__fetch.', ['mcp__law__get', 'Read']),
    ).toEqual(['law', 'web'])
    expect(mcpServersOfSkill('Use mcp__web__fetch.', 'mcp__law__get mcp__web__fetch')).toEqual([
      'law',
      'web',
    ])
  })

  it('is empty for a skill that names no MCP tool', () => {
    expect(mcpServersOfSkill('Write a letter.', undefined)).toEqual([])
  })
})

describe('unusableMcpServers', () => {
  it('treats every server as unusable when nobody says otherwise', () => {
    expect(unusableMcpServers(['law', 'web'])).toEqual(['law', 'web'])
    expect(unusableMcpServers(['law', 'web'], undefined)).toEqual(['law', 'web'])
  })

  it('leaves out the servers that can be used now', () => {
    expect(unusableMcpServers(['law', 'web'], (name) => name === 'web')).toEqual(['law'])
  })

  it('takes a throwing check as unusable', () => {
    expect(
      unusableMcpServers(['law'], () => {
        throw new Error('no registry')
      }),
    ).toEqual(['law'])
  })
})

describe('skillStepsNote', () => {
  it('is the sentence alone for a skill without MCP references', () => {
    expect(skillStepsNote([])).toBe(SKILL_SKIPPED_STEPS_SENTENCE)
  })

  it('puts a line per unusable server before the sentence', () => {
    const note = skillStepsNote(['law', 'web'], (name) => name === 'web')
    expect(note).toBe(
      'This skill expects tools from MCP server law, which cannot be used right now.\n' +
        SKILL_SKIPPED_STEPS_SENTENCE,
    )
  })

  it('names every referenced server when no check is given', () => {
    const note = skillStepsNote(['law', 'web'])
    expect(note).toContain('MCP server law,')
    expect(note).toContain('MCP server web,')
    expect(note.endsWith(SKILL_SKIPPED_STEPS_SENTENCE)).toBe(true)
  })
})
