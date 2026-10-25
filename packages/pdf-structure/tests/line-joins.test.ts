/**
 * Korean line joins (tree/inline.ts): a line that opens with a particle
 * continues the word above, so the script-aware space rule must not insert
 * one there. Cases come from a real 29-page Korean report converted to EPUB
 * ("별도 의", "학교 에서", "심의 를" …); the negative cases guard the words a
 * particle check must not swallow.
 */
import { describe, expect, it } from 'vitest'
import type { Line, Span } from '../../pdf2docx/src/ir'
import { linesToRuns, runsText } from '../src/tree/inline'

const rect = (x0: number, x1: number) => ({ x0, y0: 0, x1, y1: 10 })

function span(text: string, script: Span['script'] = 'hangul'): Span {
  return {
    text,
    box: rect(0, 400),
    fontSize: 10,
    fontFamily: 'malgun',
    bold: false,
    italic: false,
    color: '000000',
    dir: 'ltr',
    script,
  }
}

function line(text: string, extra: Partial<Line> = {}, script: Span['script'] = 'hangul'): Line {
  return {
    spans: [span(text, script)],
    box: rect(0, 500),
    baseline: 0,
    endsWithHyphen: false,
    ...extra,
  }
}

interface JoinOptions {
  seam?: boolean
  hardBreak?: boolean
  hyphen?: boolean
  script?: Span['script']
}

function join(a: string, b: string, opts: JoinOptions = {}): string {
  const lines = [
    line(a, opts.hyphen ? { endsWithHyphen: true } : {}, opts.script),
    line(b, opts.hardBreak ? { hardBreakBefore: true } : {}, opts.script),
  ]
  const seams = opts.seam ? new Set([1]) : new Set<number>()
  return runsText(linesToRuns(lines, { pageNumberOf: (i) => i + 1 }, seams))
}

describe('Korean line joins', () => {
  // the particle always belongs to the word above
  it.each([
    ['별도', '의 심의 절차', '별도의 심의 절차'],
    ['활동', '과 교육', '활동과 교육'],
    ['학교', '에서 실제', '학교에서 실제'],
    ['성실성만', '으로 급간이', '성실성만으로 급간이'],
    ['심의', '를 거쳐', '심의를 거쳐'],
    ['비율', '을 조정한', '비율을 조정한'],
    ['방안', '을 설정할', '방안을 설정할'],
    ['인정점', '의 기준고사', '인정점의 기준고사'],
    ['위원회', '에게 보냈다', '위원회에게 보냈다'],
    ['계획', '에 따라', '계획에 따라'],
  ])('%s + %s joins', (a, b, expected) => {
    expect(join(a, b)).toBe(expected)
  })

  // a page or column seam is still a line break inside the same word
  it('joins across a page seam', () => {
    expect(join('학교', '에서 실제', { seam: true })).toBe('학교에서 실제')
  })

  // an intentional hard break is never a soft join
  it('keeps an intentional line break', () => {
    expect(join('별도', '의 심의', { hardBreak: true })).toBe('별도\n의 심의')
  })

  it.each([
    // a sentence end is a real gap, not a broken word
    ['한다.', '학생의', '한다. 학생의'],
    // 이/가/도/만/나 stand alone and are not in the particle set
    ['학교', '이곳', '학교 이곳'],
    ['학생', '가 보았다', '학생 가 보았다'],
    ['친구', '도 왔다', '친구 도 왔다'],
    ['한', '만 남았다', '한 만 남았다'],
    // 보다 is an adverb here, not the comparative particle
    ['영역명이', '보다 구체적으로', '영역명이 보다 구체적으로'],
    // a token that merely starts with a particle is a different word
    ['교육과정', '의견을', '교육과정 의견을'],
    // no Hangul on the left (a number, then a counter)
    ['3', '개', '3 개'],
    // no Hangul on the right
    ['별도', 'ABC', '별도 ABC'],
  ])('%s + %s keeps the space', (a, b, expected) => {
    expect(join(a, b)).toBe(expected)
  })

  it('leaves Latin wrapping alone', () => {
    expect(join('value', 'of the', { script: 'latin' })).toBe('value of the')
  })

  it('still repairs a hyphenated word', () => {
    expect(join('co-', 'operate', { hyphen: true, script: 'latin' })).toBe('cooperate')
  })
})
