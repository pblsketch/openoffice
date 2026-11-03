/**
 * Sentence splitting of translation units (spec 4.1, 4.2, 11.1): the
 * segmenter with the abbreviation list, placeholder pairs that merge the
 * sentences they span, footnote markers and formulas that stay with their
 * sentence, and the exact offsets into the plain source text.
 */
import { describe, expect, it } from 'vitest'
import {
  SENTENCE_ABBREVIATIONS,
  decodeTranslation,
  encodeRuns,
  placeholderTags,
  splitSentences,
  type SentenceSplit,
} from '../src/translate'
import { runsText } from '../src/tree/inline'
import type { InlineRun } from '../src/tree'

const t = (text: string, marks: { bold?: true; italic?: true; href?: string } = {}): InlineRun => ({
  kind: 'text',
  text,
  ...marks,
})
const note = (id: string): InlineRun => ({ kind: 'footnoteRef', id, marker: id })
const math = (latex: string): InlineRun => ({ kind: 'math', latex })
const br: InlineRun = { kind: 'lineBreak' }

/** the sentences of a split as plain text sliced by the returned ends */
function plainSentences(split: SentenceSplit): string[] {
  if (split.kind !== 'sentences') return [split.source.trim()]
  return split.sourceSentenceEnds.map((end, i) =>
    split.source.slice(i === 0 ? 0 : split.sourceSentenceEnds[i - 1], end).trim(),
  )
}

/** the invariants every multi-sentence split must keep */
function checkSplit(runs: InlineRun[], split: SentenceSplit): void {
  const plain = runsText(runs)
  expect(split.source).toBe(plain)
  expect(split.block).toEqual(encodeRuns(runs))
  if (split.kind !== 'sentences') return
  const ends = split.sourceSentenceEnds
  expect(ends.length).toBe(split.sentences.length)
  expect(ends.length).toBeGreaterThanOrEqual(2)
  expect(ends[ends.length - 1]).toBe(plain.length)
  ends.forEach((end, i) => {
    expect(end).toBeGreaterThan(i === 0 ? 0 : ends[i - 1]!)
  })
  // each sentence decodes on its own, and its plain text is the sliced range
  const sliced = plainSentences(split)
  split.sentences.forEach((s, i) => {
    const decoded = decodeTranslation(s, s.text)
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(runsText(decoded.runs).trim()).toBe(sliced[i])
    expect(s.placeholders).toEqual(placeholderTags(s.text))
    expect(s.text).toBe(s.text.trim())
  })
  // the sentences' placeholders together are the block's, in order
  expect(split.sentences.flatMap((s) => s.placeholders)).toEqual(placeholderTags(split.block.text))
  // the encoded sentences cover the block text in order (whitespace aside)
  const strip = (s: string) => s.replace(/\s+/g, '')
  expect(strip(split.sentences.map((s) => s.text).join(''))).toBe(strip(split.block.text))
}

function split(runs: InlineRun[], lang = 'en'): SentenceSplit {
  const result = splitSentences(runs, lang)
  checkSplit(runs, result)
  return result
}

const texts = (s: SentenceSplit): string[] =>
  s.kind === 'sentences' ? s.sentences.map((x) => x.text) : [s.block.text]

describe('splitSentences: segmentation', () => {
  it('does not split after English abbreviations', () => {
    const runs = [
      t(
        'Methods, e.g. sorting, follow Smith et al. Their Fig. 3 and Eq. 2 compare A vs. B. ' +
          'See No. 5, cf. Sec. 4, i.e. the appendix. Dr. Kim and Prof. Lee met, etc. The end.',
      ),
    ]
    const s = split(runs)
    expect(plainSentences(s)).toEqual([
      'Methods, e.g. sorting, follow Smith et al. Their Fig. 3 and Eq. 2 compare A vs. B.',
      'See No. 5, cf. Sec. 4, i.e. the appendix.',
      'Dr. Kim and Prof. Lee met, etc. The end.',
    ])
  })

  it('keeps the abbreviation list as a named constant', () => {
    for (const a of [
      'e.g.',
      'i.e.',
      'et al.',
      'Fig.',
      'Eq.',
      'vs.',
      'cf.',
      'etc.',
      'No.',
      'Sec.',
      'Dr.',
      'Prof.',
    ]) {
      expect(SENTENCE_ABBREVIATIONS).toContain(a)
    }
  })

  it('matches an abbreviation with a capital first letter at a sentence start', () => {
    const s = split([t('See the note. E.g. Smith agrees. Done.')])
    expect(plainSentences(s)).toEqual(['See the note.', 'E.g. Smith agrees.', 'Done.'])
  })

  it('splits after an ordinary word that only looks like an abbreviation', () => {
    const s = split([t('I said no. Then I left.')])
    expect(plainSentences(s)).toEqual(['I said no.', 'Then I left.'])
  })

  it('keeps decimal numbers inside a sentence', () => {
    const s = split([t('The value rose to 3.5 percent in 2.0 years. It then fell.')])
    expect(plainSentences(s)).toEqual([
      'The value rose to 3.5 percent in 2.0 years.',
      'It then fell.',
    ])
  })

  it('keeps closing quotes and parentheses with their sentence', () => {
    const s = split([t('He said "yes." Then he left. (It was late.) Next one!')])
    expect(plainSentences(s)).toEqual([
      'He said "yes."',
      'Then he left.',
      '(It was late.)',
      'Next one!',
    ])
  })

  it('splits Korean sentences', () => {
    const s = split([t('이것은 첫 문장이다. 두 번째 문장입니까? 네!')], 'ko')
    expect(plainSentences(s)).toEqual(['이것은 첫 문장이다.', '두 번째 문장입니까?', '네!'])
  })

  it('splits Chinese and Japanese sentences without spaces', () => {
    const zh = split([t('这是第一句。这是第二句！这是第三句？')], 'zh')
    expect(plainSentences(zh)).toEqual(['这是第一句。', '这是第二句！', '这是第三句？'])
    expect(zh.kind === 'sentences' && zh.sourceSentenceEnds).toEqual([6, 12, 18])
    const ja = split([t('これは文です。次の文です！')], 'ja')
    expect(plainSentences(ja)).toEqual(['これは文です。', '次の文です！'])
  })

  it('handles Thai, which has no spaces between words', () => {
    // no sentence punctuation: one sentence, sent as a paragraph
    const plain = split([t('สวัสดีครับ ผมชื่อสมชาย วันนี้อากาศดีมาก')], 'th')
    expect(plain.kind).toBe('paragraph')
    const marked = split([t('คุณสบายดีไหม? ผมสบายดี!')], 'th')
    expect(plainSentences(marked)).toEqual(['คุณสบายดีไหม?', 'ผมสบายดี!'])
  })

  it('sends a single-sentence block as a paragraph', () => {
    const runs = [t('Just one sentence here.')]
    const s = split(runs)
    expect(s.kind).toBe('paragraph')
    expect(s.block.text).toBe('Just one sentence here.')
    expect('sourceSentenceEnds' in s).toBe(false)
  })

  it('treats a block without text as a paragraph', () => {
    expect(split([]).kind).toBe('paragraph')
    expect(split([t('   ')]).kind).toBe('paragraph')
  })

  it('accepts an unknown or missing language', () => {
    const runs = [t('One. Two.')]
    expect(plainSentences(split(runs, 'zz'))).toEqual(['One.', 'Two.'])
    const s = splitSentences(runs, undefined)
    checkSplit(runs, s)
    expect(plainSentences(s)).toEqual(['One.', 'Two.'])
  })
})

describe('splitSentences: placeholders', () => {
  it('merges the sentences a bold pair spans and splits the others', () => {
    const runs = [
      t('First one. '),
      t('Second starts. Bold goes on', { bold: true }),
      t(' here. Third one.'),
    ]
    const s = split(runs)
    expect(texts(s)).toEqual([
      'First one.',
      '<b>Second starts. Bold goes on</b> here.',
      'Third one.',
    ])
  })

  it('merges every sentence a pair spans across several boundaries', () => {
    const s = split([t('Zero. One '), t('two. Three. Four', { bold: true }), t(' five. Six.')])
    expect(texts(s)).toEqual(['Zero.', 'One <b>two. Three. Four</b> five.', 'Six.'])
  })

  it('merges across an italic pair and a link pair', () => {
    const italic = split([t('A one. '), t('B two. C', { italic: true }), t(' three. D four.')])
    expect(texts(italic)).toEqual(['A one.', '<i>B two. C</i> three.', 'D four.'])
    const link = split([
      t('Start here. Read '),
      t('the guide. It helps', { href: 'https://example.com' }),
      t(' a lot. Done.'),
    ])
    expect(texts(link)).toEqual([
      'Start here.',
      'Read <a1>the guide. It helps</a1> a lot.',
      'Done.',
    ])
    if (link.kind === 'sentences') {
      expect(link.sentences[1]!.links).toEqual(['https://example.com'])
      expect(link.sentences[1]!.placeholders).toEqual(['<a1>', '</a1>'])
      expect(link.sentences[0]!.placeholders).toEqual([])
    }
  })

  it('keeps a pair that closes at a boundary inside its sentence', () => {
    const s = split([
      t('Bold end.', { bold: true }),
      t(' Plain next. '),
      t('Italic start.', { italic: true }),
    ])
    expect(texts(s)).toEqual(['<b>Bold end.</b>', 'Plain next.', '<i>Italic start.</i>'])
    if (s.kind === 'sentences') expect(s.sourceSentenceEnds).toEqual([9, 21, 35])
  })

  it('gives a footnote marker right after a period to the previous sentence', () => {
    const runs = [t('Claim one.'), note('1'), t(' Claim two.'), note('2')]
    const s = split(runs)
    expect(texts(s)).toEqual(['Claim one.<n1/>', 'Claim two.<n2/>'])
    if (s.kind === 'sentences') {
      expect(s.sourceSentenceEnds).toEqual([10, 21])
      expect(s.sentences[0]!.placeholders).toEqual(['<n1/>'])
      expect(s.sentences[1]!.placeholders).toEqual(['<n2/>'])
    }
  })

  it('gives a footnote marker after the space to the previous sentence too', () => {
    const s = split([t('Claim one. '), note('1'), t('Claim two.')])
    expect(texts(s)).toEqual(['Claim one. <n1/>', 'Claim two.'])
  })

  it('keeps a footnote marker inside a sentence where it sits', () => {
    const s = split([t('Some'), note('1'), t(' claim here. Other claim.')])
    expect(texts(s)).toEqual(['Some<n1/> claim here.', 'Other claim.'])
  })

  it('keeps inline math in its sentence, with offsets over the latex', () => {
    const runs = [t('We have '), math('a.b = 1. C'), t(' in general. Next sentence.')]
    const plain = runsText(runs)
    const s = split(runs)
    expect(texts(s)).toEqual(['We have <m1/> in general.', 'Next sentence.'])
    if (s.kind === 'sentences') {
      expect(s.sourceSentenceEnds).toEqual([plain.indexOf(' Next'), plain.length])
      expect(s.sentences[0]!.maths).toEqual([{ kind: 'math', latex: 'a.b = 1. C' }])
    }
  })

  it('does not split after an abbreviation before a formula', () => {
    const s = split([t('See Eq. '), math('x'), t(' for details. Then stop.')])
    expect(texts(s)).toEqual(['See Eq. <m1/> for details.', 'Then stop.'])
  })

  it('keeps a formula with empty LaTeX from making an empty sentence', () => {
    const s = split([t('First here. '), math(''), t(' Second here.')])
    if (s.kind !== 'sentences') throw new Error('expected sentences')
    expect(s.sourceSentenceEnds).toEqual([11, runsText([t('First here.  Second here.')]).length])
  })

  it('maps escaped characters to one source character each', () => {
    const runs = [t('If a < b & c > d, stop. Else go.')]
    const s = split(runs)
    expect(texts(s)).toEqual(['If a &lt; b &amp; c &gt; d, stop.', 'Else go.'])
    if (s.kind === 'sentences') expect(s.sourceSentenceEnds).toEqual([23, 32])
  })

  it('keeps a line break with the sentence before it', () => {
    const runs = [t('Line one.'), br, t('Line two.')]
    const s = split(runs)
    expect(texts(s)).toEqual(['Line one.<br/>', 'Line two.'])
    if (s.kind === 'sentences') expect(s.sourceSentenceEnds).toEqual([9, 19])
  })

  it('does not split at a line break inside a sentence', () => {
    expect(split([t('A line'), br, t('that goes on.')]).kind).toBe('paragraph')
  })

  it('ends the last sentence at the text length even with trailing space', () => {
    const s = split([t('One here.  Two here.  ')])
    if (s.kind !== 'sentences') throw new Error('expected sentences')
    expect(s.sourceSentenceEnds).toEqual([9, 22])
    expect(s.sentences.map((x) => x.text)).toEqual(['One here.', 'Two here.'])
  })

  it('counts astral characters as two code units', () => {
    const runs = [t('Smile 😀 now. Then 𝒳 rest.')]
    const s = split(runs)
    if (s.kind !== 'sentences') throw new Error('expected sentences')
    expect(s.sourceSentenceEnds).toEqual(['Smile 😀 now.'.length, runsText(runs).length])
  })
})

describe('splitSentences: properties', () => {
  const cases: [string, InlineRun[]][] = [
    [
      'mixed',
      [
        t('Intro, see '),
        t('the site', { href: '#page=3' }),
        note('a'),
        t('. Then '),
        t('bold. And', { bold: true }),
        t(' '),
        t('italic', { bold: true, italic: true }),
        t(' end. Value '),
        math('\\pi \\approx 3.14'),
        t(' is known. '),
        br,
        t('Last & <final> one!'),
        note('b'),
      ],
    ],
    ['plain', [t('A b c. D e f? G h i! J k l.')]],
    [
      'cjk-mixed',
      [t('第一句。'), note('1'), t('第二句'), t('强调', { bold: true }), t('。第三句！')],
    ],
  ]
  for (const [name, runs] of cases) {
    it(`ranges and placeholders add up (${name})`, () => {
      const s = split(runs, name === 'cjk-mixed' ? 'zh' : 'en')
      expect(s.kind).toBe('sentences')
    })
  }
})
