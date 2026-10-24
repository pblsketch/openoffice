/**
 * A crash-recovery copy holds what a save would write, and a save first writes
 * the live style pokes and the panel's open drafts. The copy computes that
 * source without committing anything (committing would cut into the user's
 * typing in the panel).
 */
import { describe, expect, it } from 'vitest'
import { buildParseMap } from '../src/renderer/document/parse-map'
import { withPendingEdits } from '../src/renderer/document/pending-edits'

const SOURCE = '<div><p>Hello</p><img src="a.png"></div>'

function sidOf(tag: string): number {
  const entry = buildParseMap(SOURCE, 1).elements.find((e) => e.tag === tag)
  if (!entry) throw new Error(`no <${tag}>`)
  return entry.sid
}

describe('the source with pending edits', () => {
  it('is the text itself when nothing is pending', () => {
    expect(withPendingEdits(SOURCE, buildParseMap(SOURCE, 1), [[], []])).toBe(SOURCE)
  })

  it('applies live styles and panel drafts one batch after another', () => {
    const map = buildParseMap(SOURCE, 1)
    const p = sidOf('p')
    const img = sidOf('img')
    const out = withPendingEdits(SOURCE, map, [
      [{ op: 'set_style', sid: p, styles: { color: 'red' } }],
      [{ op: 'set_attr', sid: img, name: 'alt', value: 'A cat' }],
      [{ op: 'set_text_node', sid: p, index: 0, text: 'Hi' }],
    ])
    expect(out).toMatch(/<p style="color:\s*red;?">Hi<\/p>/)
    expect(out).toContain('alt="A cat"')
  })

  it('skips a batch that no longer applies and keeps the others', () => {
    const map = buildParseMap(SOURCE, 1)
    const out = withPendingEdits(SOURCE, map, [
      [{ op: 'set_style', sid: 9999, styles: { color: 'red' } }],
      [{ op: 'set_text_node', sid: sidOf('p'), index: 0, text: 'Hi' }],
    ])
    expect(out).toBe('<div><p>Hi</p><img src="a.png"></div>')
  })
})
