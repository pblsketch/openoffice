import { describe, expect, it } from 'vitest'
import {
  ADMINISTRATION_RULES,
  audit,
  type DocumentProfile,
  type RuleId,
  type TableCell,
} from '../src/index'

function profile(patch: Partial<DocumentProfile> = {}): DocumentProfile {
  return {
    format: 'hwpx',
    charShapes: [],
    paragraphs: [],
    tables: [],
    pictures: [],
    ...patch,
  }
}

function table(patch: Partial<DocumentProfile['tables'][number]> = {}) {
  return {
    index: 0,
    anchor: { para: 0 },
    rows: 2,
    cols: 2,
    titleAbove: '표 1 개요',
    ...patch,
  }
}

function grid(rows: number, cols: number): TableCell[] {
  const cells: TableCell[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) cells.push({ row, col })
  }
  return cells
}

function idsOf(result: ReturnType<typeof audit>): RuleId[] {
  return result.findings.map((finding) => finding.id)
}

describe('audit', () => {
  it('finds nothing in a plain document', () => {
    const result = audit(
      profile({
        charShapes: [{ id: '0', fonts: ['함초롬바탕'], uses: 4 }],
        paragraphs: [{ index: 0, text: '1. 추진 배경' }],
        tables: [table({ cells: grid(2, 2) })],
        pictures: [{ index: 0, anchor: { para: 1 }, titleAbove: '그림 1 구성도' }],
      }),
    )
    expect(result.findings).toEqual([])
    expect(result.counts).toEqual({ violation: 0, check: 0, suggestion: 0 })
  })

  it('reports a font only the Korean word processor ships', () => {
    const result = audit(
      profile({
        charShapes: [
          { id: '0', fonts: ['휴먼명조', 'Arial'], uses: 12, first: { para: 2 } },
          { id: '1', fonts: ['함초롬바탕'], uses: 40 },
        ],
      }),
    )
    const finding = result.findings.find((entry) => entry.id === 'font.hangul-only')
    expect(finding?.severity).toBe('violation')
    expect(finding?.count).toBe(1)
    expect(finding?.places).toEqual([{ anchor: { para: 2 }, label: '휴먼명조' }])
    expect(finding?.detail).toBe('휴먼명조')
    expect(result.counts.violation).toBe(1)
    expect(result.places.violation).toBe(1)
  })

  it('counts a font finding even when the editor could not say where it is', () => {
    const result = audit(profile({ charShapes: [{ id: '0', fonts: ['HY신명조'], uses: 3 }] }))
    const finding = result.findings.find((entry) => entry.id === 'font.hangul-only')
    expect(finding?.count).toBe(1)
    expect(finding?.places).toEqual([])
  })

  it('lists one place per font, not one per shape', () => {
    const result = audit(
      profile({
        charShapes: [
          { id: '0', fonts: ['휴먼명조'], uses: 2, first: { para: 1 } },
          { id: '1', fonts: ['휴먼명조'], uses: 5, first: { para: 7 } },
          { id: '2', fonts: ['HY견명조'], uses: 1, first: { para: 3 } },
        ],
      }),
    )
    const finding = result.findings.find((entry) => entry.id === 'font.hangul-only')
    expect(finding?.count).toBe(3)
    expect(finding?.places.map((place) => place.label)).toEqual(['휴먼명조', 'HY견명조'])
    expect(finding?.places[0].anchor.para).toBe(1)
  })

  it('leaves the outside-recommended check off until it is asked for', () => {
    const doc = profile({ charShapes: [{ id: '0', fonts: ['신명조'], uses: 1 }] })
    expect(idsOf(audit(doc))).not.toContain('font.outside-recommended')

    const result = audit(doc, ADMINISTRATION_RULES, {
      rules: { 'font.outside-recommended': true },
    })
    expect(idsOf(result)).toContain('font.outside-recommended')
    expect(result.findings[0].severity).toBe('suggestion')
  })

  it('does not report a banned font twice', () => {
    const result = audit(
      profile({ charShapes: [{ id: '0', fonts: ['휴먼명조'], uses: 1 }] }),
      ADMINISTRATION_RULES,
      { rules: { 'font.outside-recommended': true } },
    )
    expect(idsOf(result)).toEqual(['font.hangul-only'])
  })

  it('treats the recommended fonts as fine however they are spaced', () => {
    const result = audit(
      profile({
        charShapes: [
          { id: '0', fonts: ['맑은 고딕'], uses: 1 },
          { id: '1', fonts: ['함초롬돋움'], uses: 1 },
        ],
      }),
      ADMINISTRATION_RULES,
      { rules: { 'font.outside-recommended': true } },
    )
    expect(result.findings).toEqual([])
  })

  it('reports a table inside a table', () => {
    const result = audit(profile({ tables: [table({ index: 2, nested: true })] }))
    const finding = result.findings.find((entry) => entry.id === 'table.nested')
    expect(finding?.severity).toBe('violation')
    expect(finding?.places[0].label).toBe('표 3')
  })

  it('reports a vertical merge that reaches into the body', () => {
    const cells = grid(3, 3).filter((cell) => !(cell.row === 2 && cell.col === 0))
    cells.push({ row: 1, col: 0, rowSpan: 2 })
    const result = audit(profile({ tables: [table({ rows: 3, cols: 3, cells })] }))
    const finding = result.findings.find((entry) => entry.id === 'table.deep-merge')
    expect(finding?.count).toBe(1)
    // the reason is the body merge, not the share, and the label says so
    expect(finding?.places[0].label).toBe('표 1 (본문 세로 병합 1)')
  })

  it('reports a table whose cells are mostly merged', () => {
    const cells: TableCell[] = [
      { row: 0, col: 0, colSpan: 2 },
      { row: 1, col: 0, colSpan: 2 },
    ]
    const result = audit(profile({ tables: [table({ cells })] }))
    const finding = result.findings.find((entry) => entry.id === 'table.deep-merge')
    expect(finding?.places[0].label).toBe('표 1 (병합 50%)')
  })

  it('allows a merged header row', () => {
    const cells: TableCell[] = [
      { row: 0, col: 0, colSpan: 2 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]
    const result = audit(profile({ tables: [table({ cells })] }))
    expect(idsOf(result)).not.toContain('table.deep-merge')
  })

  it('skips the merge check when the cells were not read', () => {
    const result = audit(profile({ tables: [table()] }))
    expect(idsOf(result)).not.toContain('table.deep-merge')
  })

  it('reports a table with no title above it', () => {
    const result = audit(
      profile({
        tables: [table({ index: 0, titleAbove: '' }), table({ index: 1, titleAbove: '  ' })],
      }),
      ADMINISTRATION_RULES,
      { rules: { 'table.no-caption': true } },
    )
    const finding = result.findings.find((entry) => entry.id === 'table.no-caption')
    expect(finding?.count).toBe(2)
    expect(finding?.places.map((place) => place.label)).toEqual(['표 1', '표 2'])
  })

  it('leaves a one-row table alone: it is a header band, not a data table', () => {
    const result = audit(
      profile({ tables: [table({ rows: 1, cols: 3, titleAbove: '' })] }),
      ADMINISTRATION_RULES,
      { rules: { 'table.no-caption': true } },
    )
    expect(idsOf(result)).not.toContain('table.no-caption')
  })

  it('does not ask a table inside a cell for a title', () => {
    const result = audit(
      profile({ tables: [table({ nested: true, titleAbove: '' })] }),
      ADMINISTRATION_RULES,
      { rules: { 'table.no-caption': true } },
    )
    expect(idsOf(result)).not.toContain('table.no-caption')
  })

  it('reports a one-cell table that holds text: a title put in a box', () => {
    const result = audit(
      profile({
        tables: [table({ rows: 1, cols: 1, cells: [{ row: 0, col: 0, text: '추진 배경' }] })],
      }),
    )
    const finding = result.findings.find((entry) => entry.id === 'table.decorative')
    expect(finding?.detail).toBe('추진 배경')
  })

  it('leaves an empty one-cell table alone: it is a spacer', () => {
    const result = audit(
      profile({ tables: [table({ rows: 1, cols: 1, cells: [{ row: 0, col: 0, text: ' ' }] })] }),
    )
    expect(idsOf(result)).not.toContain('table.decorative')
  })

  it('reports a picture with no title above it', () => {
    const result = audit(
      profile({ pictures: [{ index: 0, anchor: { para: 5 }, titleAbove: '' }] }),
      ADMINISTRATION_RULES,
      { rules: { 'figure.no-caption': true } },
    )
    const finding = result.findings.find((entry) => entry.id === 'figure.no-caption')
    expect(finding?.places[0]).toEqual({ anchor: { para: 5 }, label: '그림 1' })
  })

  it('counts a run of empty paragraphs once, and only when asked', () => {
    const doc = profile({
      paragraphs: [
        { index: 0, text: '본문' },
        { index: 1, text: '' },
        { index: 2, text: ' ' },
        { index: 3, text: '' },
        { index: 4, text: '' },
        { index: 5, text: ' ' },
        { index: 6, text: '본문' },
        { index: 7, text: '' },
        { index: 8, text: '' },
      ],
    })
    expect(idsOf(audit(doc))).not.toContain('blank.run')

    const result = audit(doc, ADMINISTRATION_RULES, { rules: { 'blank.run': true } })
    const finding = result.findings.find((entry) => entry.id === 'blank.run')
    expect(finding?.count).toBe(1)
    expect(finding?.places[0].anchor.para).toBe(1)
  })

  it('ignores empty paragraphs inside table cells', () => {
    const doc = profile({
      paragraphs: [
        { index: 0, text: '' },
        { index: 1, text: '', path: [{ controlIndex: 0, cellIndex: 0 }] },
        { index: 2, text: '', path: [{ controlIndex: 0, cellIndex: 0 }] },
        { index: 3, text: '', path: [{ controlIndex: 0, cellIndex: 0 }] },
      ],
    })
    const result = audit(doc, ADMINISTRATION_RULES, { rules: { 'blank.run': true } })
    expect(idsOf(result)).not.toContain('blank.run')
  })

  it('reports a numbering step that was skipped', () => {
    const doc = profile({
      paragraphs: [
        { index: 0, text: '1. 추진 배경' },
        { index: 1, text: '(1) 세부 내용' },
      ],
    })
    expect(idsOf(audit(doc))).not.toContain('numbering.order')

    const result = audit(doc, ADMINISTRATION_RULES, { rules: { 'numbering.order': true } })
    const finding = result.findings.find((entry) => entry.id === 'numbering.order')
    expect(finding?.count).toBe(1)
    expect(finding?.detail).toBe('1. 다음에 (1)')
  })

  it('accepts a ladder that goes back up a rung', () => {
    const doc = profile({
      paragraphs: [
        { index: 0, text: '1. 하나' },
        { index: 1, text: '가. 둘' },
        { index: 2, text: '1. 다시' },
        { index: 3, text: '가. 다시 아래' },
      ],
    })
    const result = audit(doc, ADMINISTRATION_RULES, { rules: { 'numbering.order': true } })
    expect(idsOf(result)).not.toContain('numbering.order')
  })

  it('does not call a jump into circled numbers a skipped step', () => {
    // Ⅲ. 다음에 ①: the circles are bullets under the section, not a missing eight rungs
    const doc = profile({
      paragraphs: [
        { index: 0, text: 'Ⅲ. 세부 내용' },
        { index: 1, text: '① 공공성 (Public Interest)' },
      ],
    })
    const result = audit(doc, ADMINISTRATION_RULES, { rules: { 'numbering.order': true } })
    expect(idsOf(result)).not.toContain('numbering.order')
  })

  it('reports two numbering kinds at one depth', () => {
    const doc = profile({
      paragraphs: [
        { index: 0, text: '1. 하나' },
        { index: 1, text: '가. 둘' },
        { index: 2, text: '1. 다시' },
        { index: 3, text: '가) 섞임' },
      ],
    })
    const result = audit(doc, ADMINISTRATION_RULES, { rules: { 'numbering.mixed': true } })
    const finding = result.findings.find((entry) => entry.id === 'numbering.mixed')
    expect(finding?.count).toBe(1)
    expect(finding?.places[0].anchor.para).toBe(3)
  })

  it('sorts findings by severity, then by the rule set order', () => {
    const result = audit(
      profile({
        charShapes: [{ id: '0', fonts: ['휴먼명조'], uses: 1 }],
        tables: [table({ nested: true }), table({ index: 1, titleAbove: '' })],
      }),
      ADMINISTRATION_RULES,
      { rules: { 'table.no-caption': true } },
    )
    expect(idsOf(result)).toEqual(['font.hangul-only', 'table.nested', 'table.no-caption'])
  })

  it('says so when the profile covered only part of the document', () => {
    expect(audit(profile({ truncated: true })).truncated).toBe(true)
  })

  it('reports nothing for a rule turned off by an override', () => {
    const result = audit(profile({ tables: [table({ nested: true })] }), ADMINISTRATION_RULES, {
      rules: { 'table.nested': false },
    })
    expect(idsOf(result)).not.toContain('table.nested')
  })
})
