import { describe, expect, it, vi } from 'vitest'
import {
  buildSkillRequest,
  readSkillsForRequest,
  skillForRequestOf,
  skillRequestText,
  SKILL_SEND_MAX_CHARS,
  type SkillForRequest,
} from '../src/skill-send'

const minutes: SkillForRequest = {
  id: 'app:minutes',
  title: '회의록 "정리"',
  body: '---\nnot front matter, the body itself\n---\n결정 사항을 먼저 적는다.\n!`rm -rf /`',
  files: ['references/form.md', 'notes.txt'],
  mcpServers: [],
}

describe('skillRequestText (what a request gets for its chips)', () => {
  it('adds nothing for no skills', () => {
    expect(skillRequestText([])).toBe('')
  })

  it('carries each skill: identifier, title, body and its text files', () => {
    const text = skillRequestText([
      minutes,
      { id: 'user:b', title: 'B', body: 'Do B.', files: [], mcpServers: [] },
    ])
    expect(text).toContain('<skill id="app:minutes" title="회의록 &quot;정리&quot;">')
    expect(text).toContain('결정 사항을 먼저 적는다.')
    expect(text).toContain("Text files in this skill's folder: references/form.md, notes.txt")
    expect(text).toContain('<skill id="user:b" title="B">\nDo B.\n</skill>')
    expect(text.indexOf('app:minutes')).toBeLessThan(text.indexOf('user:b'))
  })

  it('sends a command marker as plain text and says scripts do not run', () => {
    const text = skillRequestText([minutes])
    expect(text).toContain('!`rm -rf /`')
    expect(text).toContain('scripts are not run')
  })
})

describe('buildSkillRequest (total cap)', () => {
  const big = (chars: number): SkillForRequest => ({
    id: 'app:big',
    title: 'Big',
    body: 'x'.repeat(chars),
    files: [],
    mcpServers: [],
  })

  it('caps the total at 150,000 characters by default', () => {
    expect(SKILL_SEND_MAX_CHARS).toBe(150_000)
    expect(buildSkillRequest([big(1000)]).ok).toBe(true)
    const over = buildSkillRequest([big(100_000), { ...big(60_000), id: 'app:big2' }])
    expect(over).toEqual({ ok: false, reason: 'too-large', chars: expect.any(Number) })
  })

  it('takes another cap', () => {
    const text = skillRequestText([big(10)])
    expect(buildSkillRequest([big(10)], text.length).ok).toBe(true)
    expect(buildSkillRequest([big(10)], text.length - 1).ok).toBe(false)
  })
})

describe('readSkillsForRequest', () => {
  it('reads the current contents of every skill once and names the refused ones', async () => {
    const aiRead = vi.fn(async (id: string) => {
      if (id === 'app:a') {
        return { ok: true, skill: { id, name: 'a', title: 'A', body: 'Body A', files: ['f.md'] } }
      }
      if (id === 'app:off') return { ok: false, reason: 'disabled' }
      throw new Error('gone')
    })
    const out = await readSkillsForRequest({ aiRead }, ['app:a', 'app:off', 'app:a', 'app:gone'])
    expect(aiRead).toHaveBeenCalledTimes(3)
    expect(out.skills).toEqual([
      { id: 'app:a', title: 'A', body: 'Body A', files: ['f.md'], mcpServers: [] },
    ])
    expect(out.missing).toEqual(['app:off', 'app:gone'])
  })

  it('reads a malformed answer as a refusal', () => {
    expect(skillForRequestOf({ ok: true })).toBeUndefined()
    expect(skillForRequestOf({ ok: true, skill: { id: 'a:b' } })).toBeUndefined()
    expect(
      skillForRequestOf({ ok: true, skill: { id: 'a:b', body: '', files: [1, 'x'] } }),
    ).toEqual({ id: 'a:b', title: 'a:b', body: '', files: ['x'], mcpServers: [] })
  })
})
