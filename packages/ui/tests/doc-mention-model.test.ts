import { describe, expect, it } from 'vitest'
import {
  DOC_MENTION_QUERY_MAX,
  docFileName,
  docMentionFirstRow,
  docMentionLabel,
  docMentionListOf,
  docMentionStepRow,
  docMentionTriggerAt,
  filterDocMentions,
  insertDocMentions,
  isDocMentionPickable,
  relocateDocMentions,
  type DocMentionSpan,
} from '../src/doc-mention-model'
import type { DocMentionItem } from '../src/doc-mention-types'

const end = (value: string) => value.length

const doc = (name: string, over: Partial<DocMentionItem> = {}): DocMentionItem => ({
  path: `C:\\docs\\${name}`,
  name,
  dir: 'C:\\docs',
  group: 'open',
  state: 'ok',
  ...over,
})

describe('docMentionTriggerAt (when the list opens)', () => {
  it('opens on @ at the start of the input or right after whitespace', () => {
    expect(docMentionTriggerAt('@', 1)).toEqual({ start: 0, end: 1, query: '' })
    expect(docMentionTriggerAt('요약 @계획', end('요약 @계획'))).toEqual({
      start: 3,
      end: 6,
      query: '계획',
    })
    expect(docMentionTriggerAt('tab\t@x', end('tab\t@x'))?.start).toBe(4)
  })

  it('does not open on an @ inside a word: mail, table refs, formulas', () => {
    expect(docMentionTriggerAt('a@b.com', end('a@b.com'))).toBeNull()
    expect(docMentionTriggerAt('a@b', 2)).toBeNull()
    expect(docMentionTriggerAt('표[@열]', end('표[@열]'))).toBeNull()
    expect(docMentionTriggerAt('표[@열', end('표[@열'))).toBeNull()
    expect(docMentionTriggerAt('=@A1', end('=@A1'))).toBeNull()
  })

  it('skips an @ that does not qualify and looks further back', () => {
    expect(docMentionTriggerAt('x @foo a@b', end('x @foo a@b'))).toEqual({
      start: 2,
      end: 10,
      query: 'foo a@b',
    })
  })

  it('reads the same line only', () => {
    expect(docMentionTriggerAt('first\n@min', end('first\n@min'))).toEqual({
      start: 6,
      end: 10,
      query: 'min',
    })
    expect(docMentionTriggerAt('@abc\nxyz', end('@abc\nxyz'))).toBeNull()
    expect(docMentionTriggerAt('@abc\r\nxyz', end('@abc\r\nxyz'))).toBeNull()
  })

  it('keeps spaces in what was typed', () => {
    expect(docMentionTriggerAt('@2학기 계획', end('@2학기 계획'))?.query).toBe('2학기 계획')
    expect(docMentionTriggerAt('@ ', 2)?.query).toBe(' ')
  })

  it('reads only up to the caret', () => {
    expect(docMentionTriggerAt('@meeting', 3)).toEqual({ start: 0, end: 3, query: 'me' })
    expect(docMentionTriggerAt('@meeting', 0)).toBeNull()
  })

  it('has no trigger once the typed text runs past the longest query (80 by default)', () => {
    expect(DOC_MENTION_QUERY_MAX).toBe(80)
    const at80 = `@${'x'.repeat(80)}`
    const at81 = `@${'x'.repeat(81)}`
    expect(docMentionTriggerAt(at80, end(at80))?.query).toHaveLength(80)
    expect(docMentionTriggerAt(at81, end(at81))).toBeNull()
    expect(docMentionTriggerAt('@abcd', 5, { maxQuery: 3 })).toBeNull()
    expect(docMentionTriggerAt('@abc', 4, { maxQuery: 3 })?.query).toBe('abc')
  })

  it('never opens while an input-method composition runs', () => {
    expect(docMentionTriggerAt('@계', 2, { composing: true })).toBeNull()
  })

  it('never opens inside or right after a picked mention', () => {
    const value = '@계획서.docx '
    const mentions: DocMentionSpan[] = [{ start: 0, text: '@계획서.docx' }]
    expect(docMentionTriggerAt(value, end(value), { mentions })).toBeNull()
    expect(docMentionTriggerAt(value, 9, { mentions })).toBeNull()
    expect(docMentionTriggerAt(value, 3, { mentions })).toBeNull()
    // a new @ typed after it opens
    expect(docMentionTriggerAt(`${value}@`, end(value) + 1, { mentions })).toEqual({
      start: 10,
      end: 11,
      query: '',
    })
  })

  it('an @ inside a picked mention is skipped while looking back', () => {
    const value = 'x @a @b.docx z'
    const mentions: DocMentionSpan[] = [{ start: 5, text: '@b.docx' }]
    expect(docMentionTriggerAt(value, end(value), { mentions })?.start).toBe(2)
  })
})

describe('relocateDocMentions (picked mentions follow the text)', () => {
  const spans: DocMentionSpan[] = [{ start: 0, text: '@a.docx' }]

  it('shifts with edits before it and stays with edits after it', () => {
    expect(relocateDocMentions('@a.docx hi', 'Ok @a.docx hi', spans)).toEqual([
      { start: 3, text: '@a.docx' },
    ])
    expect(relocateDocMentions('@a.docx hi', '@a.docx hello', spans)).toEqual(spans)
    expect(relocateDocMentions('@a.docx hi', 'z@a.docx hi', spans)).toEqual([
      { start: 1, text: '@a.docx' },
    ])
  })

  it('drops a mention once one of its characters changes', () => {
    expect(relocateDocMentions('@a.docx hi', '@a.dox hi', spans)).toEqual([])
    expect(relocateDocMentions('@a.docx hi', '@a.docX hi', spans)).toEqual([])
    expect(relocateDocMentions('@a.docx hi', '', spans)).toEqual([])
  })

  it('keeps the others when one of several is edited', () => {
    const two: DocMentionSpan[] = [
      { start: 0, text: '@a.docx' },
      { start: 8, text: '@b.docx' },
    ]
    expect(relocateDocMentions('@a.docx @b.docx ', '@a.docx @b.dcx ', two)).toEqual([
      { start: 0, text: '@a.docx' },
    ])
    expect(relocateDocMentions('@a.docx @b.docx ', '@a.dcx @b.docx ', two)).toEqual([
      { start: 7, text: '@b.docx' },
    ])
  })
})

describe('docMentionListOf (the shell answer)', () => {
  it('keeps well-formed items of an ok answer', () => {
    const good = doc('a.docx')
    expect(docMentionListOf({ ok: true, items: [good, { name: 3 }, null] })).toEqual([good])
  })

  it('keeps the project files group', () => {
    const file = doc('회의록.hwpx', { group: 'project' })
    expect(docMentionListOf({ ok: true, items: [file] })).toEqual([file])
  })

  it('reads no list from a refusal or junk', () => {
    expect(docMentionListOf({ ok: false, reason: 'unavailable' })).toBeNull()
    expect(docMentionListOf(undefined)).toBeNull()
    expect(docMentionListOf({ ok: true })).toBeNull()
  })
})

describe('filterDocMentions (what the list shows)', () => {
  const items = [
    doc('보고서 계획.docx', { group: 'pane' }),
    doc('계획서.docx', { group: 'open' }),
    doc('예산.xlsx', { group: 'open', state: 'modified' }),
    doc('새 문서', { group: 'open', path: null, dir: '', state: 'unsaved' }),
    doc('계획 초안.hwpx', { group: 'recent' }),
    doc('Report.PPTX', { group: 'recent' }),
  ]

  it('lists everything in group order for an empty query', () => {
    expect(filterDocMentions(items, '').map((i) => i.name)).toEqual(items.map((i) => i.name))
  })

  it('puts names that start with the query first, then names that contain it, in group order', () => {
    expect(filterDocMentions(items, '계획').map((i) => i.name)).toEqual([
      '계획서.docx',
      '계획 초안.hwpx',
      '보고서 계획.docx',
    ])
  })

  it('keeps pane → open → recent within a rank whatever the input order', () => {
    const shuffled = [doc('x2', { group: 'recent' }), doc('x1', { group: 'pane' })]
    expect(filterDocMentions(shuffled, 'x').map((i) => i.name)).toEqual(['x1', 'x2'])
  })

  it('puts the project files after open documents and before recent ones', () => {
    const shuffled = [
      doc('계획 c', { group: 'recent' }),
      doc('계획 b', { group: 'project' }),
      doc('계획 a', { group: 'open' }),
      doc('옛 계획', { group: 'recent' }),
      doc('새 계획', { group: 'project' }),
    ]
    expect(filterDocMentions(shuffled, '계획').map((i) => i.name)).toEqual([
      '계획 a',
      '계획 b',
      '계획 c',
      '새 계획',
      '옛 계획',
    ])
    expect(filterDocMentions(shuffled, '새').map((i) => i.group)).toEqual(['project'])
  })

  it('matches the file name only, case-folded, spaces included', () => {
    expect(filterDocMentions(items, 'report').map((i) => i.name)).toEqual(['Report.PPTX'])
    expect(filterDocMentions(items, 'REPORT.p').map((i) => i.name)).toEqual(['Report.PPTX'])
    expect(filterDocMentions(items, '계획 초').map((i) => i.name)).toEqual(['계획 초안.hwpx'])
    expect(filterDocMentions(items, 'docs')).toEqual([])
  })

  it('counts greyed rows as matches', () => {
    expect(filterDocMentions(items, '예산').map((i) => i.state)).toEqual(['modified'])
    expect(filterDocMentions(items, '새').map((i) => i.state)).toEqual(['unsaved'])
  })

  it('has no rows when nothing matches', () => {
    expect(filterDocMentions(items, 'zzz')).toEqual([])
  })
})

describe('rows and keys', () => {
  const rows = [
    doc('a', { state: 'ok' }),
    doc('b', { state: 'modified' }),
    doc('c', { state: 'ok' }),
    doc('d', { state: 'unsaved', path: null }),
  ]

  it('only saved, unchanged documents can be picked', () => {
    expect(rows.map(isDocMentionPickable)).toEqual([true, false, true, false])
  })

  it('↑/↓ skip greyed rows and wrap through the "Find more…" row', () => {
    expect(docMentionFirstRow(rows)).toBe(0)
    expect(docMentionStepRow(rows, 0, 1)).toBe(2)
    expect(docMentionStepRow(rows, 2, 1)).toBe(4)
    expect(docMentionStepRow(rows, 4, 1)).toBe(0)
    expect(docMentionStepRow(rows, 0, -1)).toBe(4)
    expect(docMentionStepRow(rows, 4, -1)).toBe(2)
  })

  it('with greyed rows only, the "Find more…" row is the one to pick', () => {
    const greyed = [doc('b', { state: 'modified' })]
    expect(docMentionFirstRow(greyed)).toBe(1)
    expect(docMentionStepRow(greyed, 1, 1)).toBe(1)
    expect(docMentionStepRow(greyed, 1, -1)).toBe(1)
  })
})

describe('the inserted text', () => {
  it('reads a file name from either separator', () => {
    expect(docFileName('C:\\a\\b\\계획서.docx')).toBe('계획서.docx')
    expect(docFileName('/home/u/a.docx')).toBe('a.docx')
    expect(docFileName('a.docx')).toBe('a.docx')
  })

  it('is @name when no other document shares the name', () => {
    const picked = { path: 'C:\\2학기\\계획서.docx', name: '계획서.docx' }
    expect(docMentionLabel(picked, [picked, { path: 'C:\\x\\다른.docx', name: '다른.docx' }])).toBe(
      '@계획서.docx',
    )
  })

  it('adds the folder when another path shares the name, case-insensitively', () => {
    const picked = { path: 'C:\\2학기\\계획서.docx', name: '계획서.docx' }
    expect(docMentionLabel(picked, [{ path: 'C:\\1학기\\계획서.docx', name: '계획서.docx' }])).toBe(
      '@계획서.docx(2학기)',
    )
    const latin = { path: '/home/u/term2/Plan.docx', name: 'Plan.docx' }
    expect(docMentionLabel(latin, [{ path: '/home/u/term1/plan.DOCX', name: 'plan.DOCX' }])).toBe(
      '@Plan.docx(term2)',
    )
  })

  it('the same path is not another document', () => {
    const picked = { path: 'C:\\2학기\\계획서.docx', name: '계획서.docx' }
    expect(docMentionLabel(picked, [{ path: 'c:/2학기/계획서.docx', name: '계획서.docx' }])).toBe(
      '@계획서.docx',
    )
  })

  it('has no parentheses when the folder label is empty', () => {
    const picked = {
      path: 'C:\\Temp\\ieumoffice-drive-attach\\r4nd\\계획서.docx',
      name: '계획서.docx',
    }
    expect(docMentionLabel(picked, [{ path: 'C:\\1학기\\계획서.docx', name: '계획서.docx' }])).toBe(
      '@계획서.docx',
    )
  })

  it('replaces the typed @query with the mention and a space, caret after it', () => {
    const value = '요약 @계획 please'
    const next = insertDocMentions(
      value,
      { start: 3, end: 6 },
      [{ path: 'C:\\x\\2학기 계획서.docx', name: '2학기 계획서.docx' }],
      [],
    )
    expect(next.value).toBe('요약 @2학기 계획서.docx  please')
    expect(next.caret).toBe('요약 @2학기 계획서.docx '.length)
    expect(next.spans).toEqual([{ start: 3, text: '@2학기 계획서.docx' }])
  })

  it('several picks sharing a name each get their folder', () => {
    const next = insertDocMentions(
      '@',
      { start: 0, end: 1 },
      [
        { path: 'C:\\1학기\\계획서.docx', name: '계획서.docx' },
        { path: 'C:\\2학기\\계획서.docx', name: '계획서.docx' },
      ],
      [],
    )
    expect(next.value).toBe('@계획서.docx(1학기) @계획서.docx(2학기) ')
  })

  it('joins several with single spaces and remembers each', () => {
    const next = insertDocMentions(
      '@',
      { start: 0, end: 1 },
      [
        { path: 'C:\\x\\a.docx', name: 'a.docx' },
        { path: 'C:\\x\\b.docx', name: 'b.docx' },
      ],
      [],
    )
    expect(next.value).toBe('@a.docx @b.docx ')
    expect(next.caret).toBe(16)
    expect(next.spans).toEqual([
      { start: 0, text: '@a.docx' },
      { start: 8, text: '@b.docx' },
    ])
  })
})
