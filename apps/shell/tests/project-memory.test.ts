import { describe, expect, it } from 'vitest'
import {
  applyMemoryOp,
  buildMemoryText,
  memoryBackupName,
  memoryEntries,
  memoryHeader,
} from '../src/main/projects/memory'

/** `memory.md` text operations (spec 3, 5.6) */

const HEADER = memoryHeader('en')
const today = '2026-10-29'

describe('memoryHeader', () => {
  it('is one HTML comment line naming the product', () => {
    expect(memoryHeader('ko')).toMatch(/^<!-- .+ -->$/)
    expect(memoryHeader('ko')).toContain('이음오피스')
    expect(HEADER).toMatch(/^<!-- .+ -->$/)
    expect(HEADER).toContain('IeumOffice')
  })
})

describe('memoryEntries', () => {
  it('lists "- " lines and leaves out the header and other lines', () => {
    const text = `${HEADER}\n- one (2026-10-01)\n\nnote\n- two\n`
    expect(memoryEntries(text)).toEqual(['one (2026-10-01)', 'two'])
  })
})

describe('applyMemoryOp', () => {
  it('starts a missing file with the header and a dated entry', () => {
    const result = applyMemoryOp(
      null,
      { op: 'add', text: 'Reports use bullet points' },
      {
        today,
        header: HEADER,
      },
    )
    expect(result).toEqual({
      ok: true,
      text: `${HEADER}\n- Reports use bullet points (2026-10-29)\n`,
      change: { op: 'add', text: 'Reports use bullet points (2026-10-29)' },
    })
  })

  it('keeps an existing header and every other line', () => {
    const before = '<!-- my own header -->\n- a (2026-01-01)\n\n## kept\n'
    const result = applyMemoryOp(before, { op: 'add', text: '- b' }, { today, header: HEADER })
    expect(result.ok && result.text).toBe(
      '<!-- my own header -->\n- a (2026-01-01)\n\n## kept\n- b (2026-10-29)\n',
    )
  })

  it('keeps a date the text already carries', () => {
    const result = applyMemoryOp(
      null,
      { op: 'add', text: 'x (2026-09-09)' },
      {
        today,
        header: HEADER,
      },
    )
    expect(result.ok && result.text).toBe(`${HEADER}\n- x (2026-09-09)\n`)
  })

  it('does not add the same entry twice', () => {
    const before = `${HEADER}\n- same (2026-01-01)\n`
    const result = applyMemoryOp(before, { op: 'add', text: 'same' }, { today, header: HEADER })
    expect(result.ok && result.text).toBe(before)
  })

  it('refuses empty and multi-line text', () => {
    for (const text of ['', '   ', 'a\nb', '- ']) {
      expect(applyMemoryOp(null, { op: 'add', text }, { today, header: HEADER })).toEqual({
        ok: false,
        reason: 'invalid',
      })
    }
  })

  it('replaces an entry named by its text, with or without its date', () => {
    const before = `${HEADER}\n- old fact (2026-01-01)\n- other (2026-01-02)\n`
    for (const old of ['old fact', 'old fact (2026-01-01)', '- old fact']) {
      const result = applyMemoryOp(
        before,
        { op: 'replace', old, new: 'new fact' },
        {
          today,
          header: HEADER,
        },
      )
      expect(result.ok && result.text).toBe(
        `${HEADER}\n- new fact (2026-10-29)\n- other (2026-01-02)\n`,
      )
    }
  })

  it('removes an entry and reports a missing one', () => {
    const before = `${HEADER}\n- a (2026-01-01)\n- b (2026-01-02)\n`
    const removed = applyMemoryOp(before, { op: 'remove', text: 'a' }, { today, header: HEADER })
    expect(removed.ok && removed.text).toBe(`${HEADER}\n- b (2026-01-02)\n`)
    expect(applyMemoryOp(before, { op: 'remove', text: 'zzz' }, { today, header: HEADER })).toEqual(
      { ok: false, reason: 'not-found' },
    )
    expect(
      applyMemoryOp(before, { op: 'replace', old: 'zzz', new: 'q' }, { today, header: HEADER }),
    ).toEqual({ ok: false, reason: 'not-found' })
  })

  it('keeps Windows line endings readable', () => {
    const before = `${HEADER}\r\n- a (2026-01-01)\r\n`
    const result = applyMemoryOp(before, { op: 'remove', text: 'a' }, { today, header: HEADER })
    expect(result.ok && memoryEntries(result.text)).toEqual([])
  })
})

describe('buildMemoryText and backups', () => {
  it('writes consolidated entries under the header', () => {
    expect(buildMemoryText(['- a (2026-01-01)', 'b'], HEADER, today)).toBe(
      `${HEADER}\n- a (2026-01-01)\n- b (2026-10-29)\n`,
    )
    expect(buildMemoryText([' ', ''], HEADER, today)).toBe(`${HEADER}\n`)
    expect(buildMemoryText(['x\ny (2026-01-01)'], HEADER, today)).toBe(
      `${HEADER}\n- x (2026-10-29)\n- y (2026-01-01)\n`,
    )
  })

  it('names a backup by local time', () => {
    expect(memoryBackupName(new Date(2026, 9, 29, 8, 5, 9))).toBe('memory.20261029-080509.bak.md')
  })
})
