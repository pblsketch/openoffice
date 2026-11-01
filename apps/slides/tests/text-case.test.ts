import { describe, expect, it } from 'vitest'
import type { ShapeRenderNode } from '@genoffice/pptx-render'
import { caseChangedParagraphs, changeCase } from '../src/renderer/text-case'

describe('changeCase', () => {
  it('handles the five PowerPoint modes', () => {
    const s = 'hello WORLD. second sentence!\nnew line'
    expect(changeCase(s, 'sentence')).toBe('Hello world. Second sentence!\nNew line')
    expect(changeCase(s, 'lower')).toBe('hello world. second sentence!\nnew line')
    expect(changeCase(s, 'upper')).toBe('HELLO WORLD. SECOND SENTENCE!\nNEW LINE')
    expect(changeCase(s, 'title')).toBe('Hello World. Second Sentence!\nNew Line')
    expect(changeCase('Hello World', 'toggle')).toBe('hELLO wORLD')
  })

  it('never changes the length (case mappings that grow are left alone)', () => {
    expect(changeCase('straße', 'upper')).toBe('STRAßE')
    expect(changeCase('İstanbul', 'lower')).toBe('İstanbul')
    for (const mode of ['sentence', 'lower', 'upper', 'title', 'toggle'] as const) {
      expect(changeCase('ßİ 한글 abc', mode)).toHaveLength('ßİ 한글 abc'.length)
    }
  })

  it('leaves scripts without case untouched', () => {
    expect(changeCase('한글 텍스트', 'upper')).toBe('한글 텍스트')
  })

  it('starts words after hyphens and brackets in title case', () => {
    expect(changeCase('well-known (fact)', 'title')).toBe('Well-Known (Fact)')
  })
})

function run(text: string, srcRunIdx: number, extra: Record<string, unknown> = {}) {
  return {
    text,
    srcRunIdx,
    x: 0,
    baselineY: 0,
    fontFamily: 'A',
    fontSizePx: 10,
    color: '#000000',
    bold: false,
    italic: false,
    underline: false,
    widthPx: 1,
    ...extra,
  }
}

function node(lines: unknown[]): ShapeRenderNode {
  return {
    id: 'n',
    type: 'shape',
    sourceId: 's',
    box: { x: 0, y: 0, w: 1, h: 1, rotationDeg: 0 },
    fill: { kind: 'none' },
    text: { lines },
  } as unknown as ShapeRenderNode
}

describe('caseChangedParagraphs', () => {
  it('merges layout fragments back into source runs and restores wrap-swallowed spaces', () => {
    const paras = caseChangedParagraphs(
      node([
        {
          paraStart: true,
          trailingSpace: true,
          runs: [run('•', 0, { isBullet: true }), run('hello', 0), run('big', 1)],
        },
        { paraStart: false, runs: [run('world', 1)] },
        { paraStart: true, runs: [run('next', 0)] },
      ]),
      'upper',
    )
    expect(paras).toEqual([
      {
        srcPara: 0,
        runs: [
          { text: 'HELLO', srcRun: 0 },
          { text: 'BIG WORLD', srcRun: 1 },
        ],
      },
      { srcPara: 1, runs: [{ text: 'NEXT', srcRun: 0 }] },
    ])
  })

  it('keeps soft breaks as their own runs', () => {
    const paras = caseChangedParagraphs(
      node([
        { paraStart: true, softBreakAfter: 1, runs: [run('one', 0)] },
        { paraStart: false, runs: [run('two', 2)] },
      ]),
      'title',
    )
    expect(paras![0]!.runs).toEqual([
      { text: 'One', srcRun: 0 },
      { text: '\n', srcRun: 1 },
      { text: 'Two', srcRun: 2 },
    ])
  })

  it('reads a sentence across runs', () => {
    const paras = caseChangedParagraphs(
      node([{ paraStart: true, runs: [run('THE ', 0), run('END. AND', 1)] }]),
      'sentence',
    )
    expect(paras![0]!.runs.map((r) => r.text)).toEqual(['The ', 'end. And'])
  })

  it('returns null when nothing would change', () => {
    expect(
      caseChangedParagraphs(node([{ paraStart: true, runs: [run('ABC', 0)] }]), 'upper'),
    ).toBeNull()
    expect(caseChangedParagraphs(node([]), 'upper')).toBeNull()
  })
})
