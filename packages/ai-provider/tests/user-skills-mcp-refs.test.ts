/**
 * The MCP servers a skill refers to (spec 8): list values of the front matter
 * and the servers read along with a skill folder.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSkillMd, readUserSkillFolder, renderSkillMd } from '../src/user-skills'

describe('parseSkillMd: lists', () => {
  it('reads a block list under a top-level key', () => {
    const parsed = parseSkillMd(
      '---\nname: a\ndescription: d\nallowed-tools:\n  - Read\n  - "mcp__law__search"\n  # a comment\n  - mcp__web__fetch # why\n---\nbody',
    )!
    expect(parsed.lists['allowed-tools']).toEqual(['Read', 'mcp__law__search', 'mcp__web__fetch'])
    expect(parsed.fields['allowed-tools']).toBeUndefined()
    expect(parsed.description).toBe('d')
  })

  it('reads a block list written at the key indent', () => {
    const parsed = parseSkillMd('---\nname: a\nallowed-tools:\n- Read\n- mcp__law__get\n---\n')!
    expect(parsed.lists['allowed-tools']).toEqual(['Read', 'mcp__law__get'])
    expect(parsed.name).toBe('a')
  })

  it('reads a flow list, quotes and all', () => {
    const parsed = parseSkillMd(
      '---\nname: a\nallowed-tools: [Read, \'mcp__law__search\', "mcp__web__fetch"]\n---\n',
    )!
    expect(parsed.lists['allowed-tools']).toEqual(['Read', 'mcp__law__search', 'mcp__web__fetch'])
  })

  it('keeps a string value a field, and leaves out lists of maps', () => {
    const parsed = parseSkillMd(
      '---\nname: a\nallowed-tools: Read, mcp__law__search\nthings:\n  - key: value\n---\n',
    )!
    expect(parsed.fields['allowed-tools']).toBe('Read, mcp__law__search')
    expect(parsed.lists['allowed-tools']).toBeUndefined()
    expect(parsed.lists.things).toBeUndefined()
  })

  it('keeps a list as written when the app rewrites the file', () => {
    const base = '---\nname: a\ndescription: d\nallowed-tools:\n  - mcp__law__search\n---\nbody'
    const again = renderSkillMd({ name: 'a', description: 'new', body: 'body' }, base)
    expect(parseSkillMd(again)!.lists['allowed-tools']).toEqual(['mcp__law__search'])
  })
})

const roots: string[] = []
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function skillDir(skillMd: string): string {
  const base = mkdtempSync(join(tmpdir(), 'user-skills-mcp-'))
  roots.push(base)
  const dir = join(base, 'case-brief')
  mkdirSync(dir)
  writeFileSync(join(dir, 'SKILL.md'), skillMd)
  return dir
}

describe('readUserSkillFolder: mcpServers', () => {
  it('lists the servers of allowed-tools and the body, once each', async () => {
    const dir = skillDir(
      '---\nname: case-brief\ndescription: Drafts a brief.\nallowed-tools:\n  - Read\n  - mcp__korean-law__search_decisions\n---\n' +
        'Check every case with mcp__korean-law__get_decision_text, then mcp__web__fetch.\n',
    )
    const read = await readUserSkillFolder(dir, { source: 'app' })
    expect(read?.mcpServers).toEqual(['korean-law', 'web'])
  })

  it('reads a string allowed-tools too', async () => {
    const dir = skillDir(
      '---\nname: case-brief\ndescription: d\nallowed-tools: Read mcp__law__search\n---\nbody\n',
    )
    expect((await readUserSkillFolder(dir, { source: 'app' }))?.mcpServers).toEqual(['law'])
  })

  it('is empty for a skill that names no MCP tool', async () => {
    const dir = skillDir('---\nname: case-brief\ndescription: d\n---\nWrite it.\n')
    expect((await readUserSkillFolder(dir, { source: 'app' }))?.mcpServers).toEqual([])
  })
})
