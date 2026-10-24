/**
 * Book translation (spec §8), the parts of the screen that are plain
 * functions: language names, the chapter list of the window, which units a
 * choice of chapters sends, the default result names, the remembered chapter
 * choice of a job, the resume offer and the lines of the result report.
 */
import type { Lang } from '@genoffice/i18n'
import type {
  EpubSkippedChapter,
  EpubTranslationOutputKind,
  EpubTranslationReport,
  EpubTranslationUnit,
} from '@genoffice/epub-engine'
import type { JobProgress, JobStatus } from '@genoffice/pdf-structure/store'
import { defaultResultName } from '../../shared/asset-url'
import type { EpubBookSummary } from '../../shared/ipc'
import type { StringKey, TFunc } from '../i18n/locale'
import { EPUB_METADATA_PAGE } from './engine'

/** the result kinds in the order they are offered and written */
export const RESULT_KINDS: readonly EpubTranslationOutputKind[] = ['translated', 'bilingual']

/** each language's name in itself, when the platform cannot name it */
const AUTONYMS: Record<Lang, string> = {
  zh: '简体中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  th: 'ไทย',
  id: 'Bahasa Indonesia',
  ru: 'Русский',
  ar: 'العربية',
  pt: 'Português',
  it: 'Italiano',
  pl: 'Polski',
  cs: 'Čeština',
  nl: 'Nederlands',
  ms: 'Bahasa Melayu',
  he: 'עברית',
  hi: 'हिन्दी',
  'zh-TW': '繁體中文',
  vi: 'Tiếng Việt',
}

/** a target language as the user reads it, in the UI language */
export function languageName(code: string, uiLang: string): string {
  // the two Chinese targets differ by script, which the platform names by region
  if (code === 'zh' || code === 'zh-TW') return AUTONYMS[code]
  try {
    const name = new Intl.DisplayNames([uiLang], { type: 'language' }).of(code)
    if (name && name !== code) return name
  } catch {
    // no display names on this platform
  }
  return (AUTONYMS as Record<string, string>)[code] ?? code
}

const primary = (tag: string): string => tag.toLowerCase().split(/[-_]/)[0]!

/** the target is the book's own language (same primary subtag) */
export function sameLanguage(bookLanguage: string | undefined, target: string): boolean {
  return bookLanguage !== undefined && primary(bookLanguage) === primary(target)
}

// ── the chapter list ──

/** why a chapter cannot be chosen; its text stays as it is in the results */
export type ChapterBlock = EpubSkippedChapter['reason']

export interface ChapterRow {
  /** spine index */
  index: number
  /** the contents title, or "Chapter n" */
  title: string
  /** blocks to translate in the chapter */
  units: number
  /** set when the chapter cannot be chosen */
  blocked: ChapterBlock | null
}

/** the first contents title of each spine item */
export function chapterTitles(book: EpubBookSummary): Map<number, string> {
  const names = new Map<number, string>()
  for (const entry of book.toc.entries) {
    if (entry.spineIndex !== null && !names.has(entry.spineIndex) && entry.title.trim()) {
      names.set(entry.spineIndex, entry.title.trim())
    }
  }
  return names
}

/** the window's chapter list: spine order, contents titles, blocked chapters marked */
export function chapterRows(
  book: EpubBookSummary,
  units: readonly EpubTranslationUnit[],
  skipped: readonly EpubSkippedChapter[],
  t: TFunc,
): ChapterRow[] {
  const titles = chapterTitles(book)
  const counts = new Map<number, number>()
  for (const unit of units) {
    if (unit.page !== EPUB_METADATA_PAGE) counts.set(unit.page, (counts.get(unit.page) ?? 0) + 1)
  }
  const blocked = new Map(skipped.map((s) => [s.index, s.reason]))
  return book.spine.map((item) => ({
    index: item.index,
    title: titles.get(item.index) ?? t('chapterLabel', { n: item.index + 1 }),
    units: counts.get(item.index) ?? 0,
    blocked: blocked.get(item.index) ?? null,
  }))
}

/** the chapters chosen by default: every one that can be chosen, or the ones asked for */
export function initialChapters(
  rows: readonly ChapterRow[],
  asked: readonly number[] | null,
): Set<number> {
  const open = rows.filter((r) => r.blocked === null).map((r) => r.index)
  if (!asked || asked.length === 0) return new Set(open)
  const wanted = new Set(asked)
  const picked = open.filter((i) => wanted.has(i))
  return new Set(picked.length > 0 ? picked : open)
}

/** the units a choice sends: the title and contents, and the chosen chapters' blocks */
export function unitsForChapters(
  units: readonly EpubTranslationUnit[],
  chosen: ReadonlySet<number>,
): EpubTranslationUnit[] {
  return units.filter((u) => u.page === EPUB_METADATA_PAGE || chosen.has(u.page))
}

/**
 * The chapters to name in a request: undefined when every chapter that can be
 * chosen is chosen (the result books then treat the book as a whole), else the
 * chosen spine indices in order.
 */
export function chosenChapters(
  rows: readonly ChapterRow[],
  chosen: ReadonlySet<number>,
): number[] | undefined {
  const open = rows.filter((r) => r.blocked === null)
  if (open.every((r) => chosen.has(r.index))) return undefined
  return open.filter((r) => chosen.has(r.index)).map((r) => r.index)
}

/** the suggested file name of a result next to the book */
export function resultName(
  sourcePath: string,
  lang: string,
  kind: EpubTranslationOutputKind,
): string {
  return defaultResultName(sourcePath, lang, kind)
}

export const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path

// ── the chapter choice of a job, for the resume offer ──

const CHOICE_PREFIX = 'genoffice-epub-translate-chapters'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Remember the chapters a translation was started with (spine indices only, no
 * book text), so "Continue" brings them back; null forgets (every chapter).
 */
export function rememberChapters(
  docHash: string,
  lang: string,
  chapters: readonly number[] | undefined,
): void {
  try {
    const key = `${CHOICE_PREFIX}:${docHash}:${lang}`
    if (chapters) storage()?.setItem(key, JSON.stringify([...chapters]))
    else storage()?.removeItem(key)
  } catch {
    // a full or missing storage only costs the resume offer its chapter list
  }
}

/** the remembered chapters, or null when there are none or they are unreadable */
export function recallChapters(docHash: string, lang: string): number[] | null {
  try {
    const raw = storage()?.getItem(`${CHOICE_PREFIX}:${docHash}:${lang}`)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const chapters = parsed.filter((i): i is number => Number.isSafeInteger(i) && i >= 0)
    return chapters.length > 0 ? chapters : null
  } catch {
    return null
  }
}

// ── the resume offer ──

/** whole percent done, 0 when nothing is known */
export function jobPercent(progress: JobProgress | undefined): number {
  if (!progress || progress.total <= 0) return 0
  return Math.max(0, Math.min(100, Math.floor((progress.done / progress.total) * 100)))
}

/** the unfinished translation to offer when the book opens: a stopped one with its language */
export function resumableTranslation(jobs: readonly JobStatus[]): JobStatus | null {
  return jobs.find((j) => j.kind === 'translate' && j.state === 'stopped' && !!j.lang) ?? null
}

// ── the result report ──

const REASON_KEYS: Record<string, StringKey> = {
  'not-translated': 'btReasonPending',
  'placeholder-mismatch': 'btReasonPlaceholder',
  'empty-translation': 'btReasonEmpty',
  'missing-translation': 'btReasonMissing',
}

const CHAPTER_REASON_KEYS: Record<string, StringKey> = {
  'not-chosen': 'btReasonNotChosen',
  broken: 'btReasonBroken',
  'fixed-layout': 'btReasonFixed',
}

/** "〈chapter〉: 3 blocks (reason)", one line per chapter and reason, in book order */
export function untranslatedLines(
  report: EpubTranslationReport,
  chapterName: (index: number) => string,
  t: TFunc,
): string[] {
  const groups = new Map<string, { chapter: number; reason: string; count: number }>()
  for (const b of report.untranslatedBlocks) {
    const reason = REASON_KEYS[b.reason] ? b.reason : 'other'
    const key = `${b.chapter}\n${reason}`
    const group = groups.get(key)
    if (group) group.count++
    else groups.set(key, { chapter: b.chapter, reason, count: 1 })
  }
  return [...groups.values()]
    .sort((a, b) => a.chapter - b.chapter)
    .map((g) =>
      t('btReportBlocksLine', {
        chapter: chapterName(g.chapter),
        count: g.count,
        reason: t(REASON_KEYS[g.reason] ?? 'btReasonOther'),
      }),
    )
}

/** "〈chapter〉: reason", one line per chapter kept in the original */
export function originalChapterLines(
  report: EpubTranslationReport,
  chapterName: (index: number) => string,
  t: TFunc,
): string[] {
  return report.originalChapters.map((c) =>
    t('btReportChapterLine', {
      chapter: chapterName(c.chapter),
      reason: t(CHAPTER_REASON_KEYS[c.reason] ?? 'btReasonOther'),
    }),
  )
}

/** one report for the results of one translation: the fullest of each part */
export function combineReports(
  reports: ReadonlyArray<EpubTranslationReport>,
): EpubTranslationReport | null {
  if (reports.length === 0) return null
  const base = reports.reduce((a, b) => (b.translatedBlocks > a.translatedBlocks ? b : a))
  return base
}
