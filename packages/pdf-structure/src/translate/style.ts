/**
 * How a translation should read: the writing rules both translation
 * instructions carry (the PDF document translation and the EPUB book
 * translation), placed before their structural rules.
 *
 * The rules hold for every target language. Korean gets a few more, written
 * in Korean, because the common failures of Korean translations (sentence
 * endings that change mid-document, translationese) need Korean examples.
 *
 * Nothing here assumes a kind of document: the same rules serve a contract, a
 * report, a notice, a textbook, a novel or a paper.
 */
import { translationLanguageName } from './language'

/** the writing rules for translating into `lang`, as lines of the system prompt */
export function translationStyleLines(lang: string): string[] {
  const name = translationLanguageName(lang)
  const lines = [
    'How to write:',
    `- Write the way a skilled ${name} writer would write this text from scratch. Rebuild each sentence in the word order and structure natural to ${name}; do not follow the source word order or keep constructions that only read as translated.`,
    '- Keep every claim, number, unit, condition, qualifier and hedge (such as "may", "about", "at most", "unless"). Do not summarize, explain, soften, strengthen or add anything.',
    '- Keep citation markers such as [5, 2] or (Smith et al., 2020) and the numbers of figures, tables, equations, sections, clauses and articles as they are.',
    `- Terms: use the term that ${name} texts in the same field actually use. When readers might not recognize that term on its own, add the source term in parentheses the first time it appears in a block, and not again.`,
    `- Keep names of people, organizations, products, models, datasets and standards, and abbreviations, as in the source, unless ${name} has a well-established name for them.`,
    `- Headings: a block that is a heading (a short title, often numbered) becomes a short title: a noun phrase with no sentence ending and no final period. Keep a leading number such as "3.1" or "Article 4". Use the conventional ${name} names for the standard parts of a document (abstract, introduction, conclusion, references, appendix, table of contents, definitions and the like).`,
    `- Captions: translate label words such as "Figure" or "Table" into their usual ${name} form and keep the number.`,
    "- Keep the register and tone of the source: formal stays formal and casual stays casual. In fiction, keep each character's voice in dialogue.",
    '- The text may come from any kind of document (a contract, a report, a notice, a manual, a textbook, a novel, an academic article, …); do not assume one.',
  ]
  if (lang === 'ko') lines.push(...KOREAN_LINES)
  return lines
}

/** the extra rules for Korean (spec 3.2), in Korean */
const KOREAN_LINES = [
  '',
  '한국어로 옮길 때:',
  '- 문장 끝은 원문의 성격에 맞춘다. 논문, 보고서, 계약서, 법령, 책의 본문처럼 딱딱한 글은 "~한다"체로, 안내문, 편지, 말하듯 쓴 글은 "~합니다"체로 쓴다. 한 문서 안에서 섞지 않는다. 소설의 대사는 원문의 말투를 따른다.',
  '- 번역투를 쓰지 않는다. "~에 있어서", "~를 통하여", "~하는 것이 가능하다"(→ "~할 수 있다"), "~되어진다", "~에 의해 ~된다", 없어도 되는 "~들", "~적인"을 잇달아 쓰기, 문장마다 "또한"으로 시작하기, "그것"을 자꾸 쓰기를 피한다.',
  '- 명사로 굳힌 표현은 동사로 푼다. 예: "새 방식의 적용은 속도의 향상을 가져온다" → "새 방식을 적용하면 속도가 빨라진다".',
  '- 능동형으로 쓴다. 수동형은 능동형이 어색할 때만 쓴다.',
  '- 주어는 필요할 때만 쓴다. "우리는", "본 연구는", "당사는"을 문장마다 붙이지 않는다.',
  '- 명사 앞에 길게 늘어진 꾸밈말은 절로 끊고, 말하려는 핵심은 문장 끝에 둔다.',
]
