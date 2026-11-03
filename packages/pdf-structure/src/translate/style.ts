/**
 * How a translation should read: the writing rules both translation
 * instructions carry (the PDF document translation and the EPUB book
 * translation), placed before their structural rules. An easy explanation
 * (the second translation mode) carries `easyStyleLines` in their place.
 *
 * The rules hold for every target language. Korean gets a few more, written
 * in Korean, because the common failures of Korean translations (sentence
 * endings that change mid-document, translationese) need Korean examples.
 *
 * Nothing here assumes a kind of document: the same rules serve a contract, a
 * report, a notice, a textbook, a novel or a paper.
 */
import { translationLanguageName } from './language'

/**
 * How long one entry of an easy explanation may get, as a multiple of its
 * source sentence (a block sent as one text: of the block). The instruction
 * states the number; change it here.
 */
export const EASY_LENGTH_FACTOR = 2

/** the writing rules for translating into `lang`, as lines of the system prompt */
export function translationStyleLines(lang: string): string[] {
  const name = translationLanguageName(lang)
  const lines = [
    'How the translation should read:',
    `- Phrase it the way a skilled ${name} writer would phrase this text from scratch. Rebuild each sentence in the word order and structure natural to ${name}; do not follow the source word order or keep constructions that only read as translated.`,
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

/**
 * The writing rules of an easy explanation into `lang`: a translation for
 * readers who need plain text (children, older readers, people learning the
 * language). They replace `translationStyleLines`; the structural rules
 * (placeholders, blocks, sentence entries, document text as data, the answer
 * shape) stay those of the plain instruction. Korean adds rules in Korean,
 * the polite "-seumnida" sentence ending first.
 */
export function easyStyleLines(lang: string): string[] {
  const name = translationLanguageName(lang)
  const lines = [
    'How the easy version should read:',
    '- Accuracy comes first. Make the words and the sentences easier, never the facts. Keep every claim, number, unit, condition, qualifier and hedge (such as "may", "about", "at most", "unless") and every name. Do not state anything more surely or more widely than the source does. Add no facts from outside the text and no opinions.',
    `- Use everyday ${name} words and short sentences. Turn each source sentence into one or two short sentences, three at most.`,
    '- Explain hard words. The first time a technical term or a hard word appears in a block, explain it briefly in plain words, in parentheses or in a short clause. Do not explain it again in that block.',
    '- When the reader cannot follow without it, add a short note on the reason ("why") or the assumption the source passes over without saying. Add nothing else.',
    '- Turn abstract wording into concrete wording: say who does what, and what happens.',
    `- Keep names of people, organizations, places, products and standards, and abbreviations, as in the source, unless ${name} has a well-established name for them. The first time one appears, say briefly what it is.`,
    '- Headings: a block that is a heading (a short title, often numbered) becomes a short, plain title: a noun phrase with no sentence ending and no final period. Keep a leading number such as "3.1" or "Article 4".',
    '- Keep reference marks and the numbers of figures, tables, sections, clauses and articles as they are.',
    '- No filler: do not open sentences with phrases such as "in simple terms" or "that is", ask the reader no questions, and use no emoji and no exclamation marks.',
    `- Make an easy version even when the source is already in ${name}: say it again in plainer ${name}.`,
    `- Keep the easy version of one source sentence within about ${EASY_LENGTH_FACTOR} times that sentence's length.`,
    '- The text may come from any kind of document (a contract, a report, a notice, a manual, a textbook, a novel, an academic article, …); do not assume one.',
  ]
  if (lang === 'ko') lines.push(...KOREAN_EASY_LINES)
  return lines
}

/** the extra rules of a Korean easy explanation, in Korean */
const KOREAN_EASY_LINES = [
  '',
  '한국어로 쉽게 풀어 쓸 때:',
  '- 문장 끝은 모두 "~습니다"체로 쓴다. 원문이 딱딱한 글이어도 그렇다. 제목만 문장 끝 없이 이름 꼴로 쓴다.',
  '- 어려운 한자어 대신 쉬운 우리말을 쓴다. 예: "상이하다" → "다르다", "증가하다" → "늘어나다".',
  '- 번역투와 딱딱한 표현을 쓰지 않는다. "~에 있어서", "~를 통하여", "~되어진다", "~에 의해 ~된다" 대신 "누가 무엇을 한다"로 쓴다.',
  '- 명사로 굳힌 표현은 동사로 푼다. 예: "새 방식의 적용은 속도의 향상을 가져온다" → "새 방식을 쓰면 더 빨라집니다".',
]
