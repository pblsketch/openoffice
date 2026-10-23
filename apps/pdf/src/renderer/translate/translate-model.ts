/**
 * Document translation (spec §8), the parts of the screen that are plain
 * functions: which output formats a document and a target language allow,
 * the default output name, language names, and the result report that merges
 * what the stored translation holds (T12 reasons) with what the translated-PDF
 * writer did (T13 report).
 */
import type { Lang } from '@genoffice/i18n'
import type { TranslationReport } from '../../../../../packages/pdf-structure/src/translate/result'
import type {
  OriginalPage,
  WritebackReport,
} from '../../../../../packages/pdf-structure/src/writeback/types'
import type { DocumentTree } from '../../../../../packages/pdf-structure/src/tree/types'
import type { StringKey, TFunc } from '../i18n/locale'

export type TranslationFormat = 'pdf' | 'md' | 'epub'

/** output formats in the order they are offered and written */
export const TRANSLATION_FORMATS: readonly TranslationFormat[] = ['pdf', 'md', 'epub']

/**
 * Target languages the translated-PDF writer cannot lay out (it does no
 * shaping or right-to-left layout; T13 skips such blocks as
 * 'script-unsupported'), so the PDF format is not offered for them.
 */
export const PDF_UNWRITABLE_LANGS: ReadonlySet<string> = new Set(['ar', 'he', 'hi'])

/** why the translated PDF cannot be chosen, or null when it can */
export type PdfFormatBlock = 'encrypted' | 'script' | null

export function pdfFormatBlock(encrypted: boolean, lang: string): PdfFormatBlock {
  if (encrypted) return 'encrypted'
  if (PDF_UNWRITABLE_LANGS.has(lang)) return 'script'
  return null
}

/** the chosen formats that can be written (the PDF drops out when it is blocked) */
export function writableFormats(
  chosen: ReadonlySet<TranslationFormat>,
  block: PdfFormatBlock,
): TranslationFormat[] {
  return TRANSLATION_FORMATS.filter((f) => chosen.has(f) && (f !== 'pdf' || block === null))
}

/** default output name without extension: `<name>.<lang>` (the save dialog adds it) */
export function translationOutputName(fileName: string, lang: string): string {
  const stem = fileName.replace(/\.pdf$/i, '') || 'document'
  return `${stem}.${lang}`
}

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

/** the chosen pages have scanned or picture-only pages: AI page reading comes first */
export function treeHasScannedPages(
  tree: DocumentTree,
  pages: ReadonlySet<number> | null,
): boolean {
  return tree.pages.some(
    (p) => (!pages || pages.has(p.page)) && (p.status === 'scanned' || p.status === 'degraded'),
  )
}

// ── the result report ──

export interface ReportBlock {
  unitKey: string
  page: number
  /** a T12 reason ('placeholder-mismatch', …) or a T13 one ('font-missing', …) */
  reason: string
}

export interface TranslationResultReport {
  lang: string
  /** translation units on the written pages */
  total: number
  /** translated blocks (in the PDF: written into it) */
  translated: number
  /** blocks not tried yet (a stopped translation); they stay in the source language */
  pending: number
  /** blocks tried and kept in the source language, with why */
  untranslated: ReportBlock[]
  /** written blocks that ran past their box (PDF only) */
  overflowed: Array<{ unitKey: string; page: number }>
  /** pages kept exactly as they were (PDF only) */
  originalPages: OriginalPage[]
}

/**
 * One report from the stored translation's report and, when a translated PDF
 * was written, the writer's. A block the writer lists as 'not-translated'
 * takes the translation's own reason, or counts as pending when it was never
 * tried; every other writer reason is the PDF's (no font, page kept, …).
 */
export function mergeTranslationReport(
  translation: TranslationReport | null,
  writer: WritebackReport | null,
): TranslationResultReport | null {
  if (!translation && !writer) return null
  const untranslated = new Map<string, ReportBlock>()
  for (const b of translation?.untranslated ?? []) {
    untranslated.set(b.unitKey, { unitKey: b.unitKey, page: b.page, reason: b.reason })
  }
  if (writer) {
    for (const b of writer.untranslated) {
      if (b.reason === 'not-translated') continue
      if (!untranslated.has(b.unitKey)) {
        untranslated.set(b.unitKey, { unitKey: b.unitKey, page: b.page, reason: b.reason })
      }
    }
  }
  const pendingFromWriter = writer
    ? writer.untranslated.filter(
        (b) => b.reason === 'not-translated' && !untranslated.has(b.unitKey),
      ).length
    : 0
  return {
    lang: writer?.lang ?? translation!.lang,
    total: writer?.total ?? translation!.total,
    translated: writer ? writer.translated : translation!.translated,
    pending: translation ? translation.pending : pendingFromWriter,
    untranslated: [...untranslated.values()].sort((a, b) => a.page - b.page),
    overflowed: (writer?.overflowed ?? []).map((o) => ({ unitKey: o.unitKey, page: o.page })),
    originalPages: [...(writer?.originalPages ?? [])].sort((a, b) => a.page - b.page),
  }
}

/** several reports of one translation (one per written format): the fullest of each part */
export function combineReports(
  reports: ReadonlyArray<TranslationResultReport | null>,
): TranslationResultReport | null {
  const present = reports.filter((r): r is TranslationResultReport => r !== null)
  if (present.length === 0) return null
  // the PDF's report knows the most (written blocks, kept pages); take it as the base
  const base =
    present.find((r) => r.originalPages.length > 0 || r.overflowed.length > 0) ?? present[0]!
  const untranslated = new Map<string, ReportBlock>()
  for (const r of present) for (const b of r.untranslated) untranslated.set(b.unitKey, b)
  return {
    ...base,
    untranslated: [...untranslated.values()].sort((a, b) => a.page - b.page),
  }
}

const REASON_KEYS: Record<string, StringKey> = {
  'placeholder-mismatch': 'trReasonPlaceholder',
  'empty-translation': 'trReasonEmpty',
  'missing-translation': 'trReasonMissing',
  'font-missing': 'trReasonFont',
  'script-unsupported': 'trReasonScript',
  'page-kept': 'trReasonPageKept',
  'text-not-found': 'trReasonTextNotFound',
  'shared-text-object': 'trReasonSharedText',
  'text-in-form': 'trReasonTextInForm',
  'no-position': 'trReasonNoPosition',
  'vertical-text': 'trPageVertical',
}

/** why a block stayed in the source language, in words */
export function untranslatedReasonText(reason: string, t: TFunc): string {
  return t(REASON_KEYS[reason] ?? 'trReasonOther')
}

const PAGE_REASON_KEYS: Record<string, StringKey> = {
  'ocr-unavailable': 'trPageOcr',
  'scanned-no-text': 'trPageScannedNoText',
  'not-editable': 'trPageNotEditable',
  'vertical-text': 'trPageVertical',
  'toc-page': 'trPageToc',
}

const pageList = (pages: Iterable<number>): string =>
  [...new Set(pages)].sort((a, b) => a - b).join(', ')

/** one line per reason: "〈reason〉: pages 3, 5 (4 blocks)" */
export function untranslatedLines(blocks: readonly ReportBlock[], t: TFunc): string[] {
  const byReason = new Map<string, ReportBlock[]>()
  for (const b of blocks) {
    const key = REASON_KEYS[b.reason] ? b.reason : 'other'
    byReason.set(key, [...(byReason.get(key) ?? []), b])
  }
  return [...byReason].map(([reason, list]) =>
    t('trReasonLine', {
      reason: t(REASON_KEYS[reason] ?? 'trReasonOther'),
      pages: pageList(list.map((b) => b.page)),
      count: list.length,
    }),
  )
}

/** one line per kept page: "Page 4: scanned page without Windows OCR" */
export function originalPageLines(pages: readonly OriginalPage[], t: TFunc): string[] {
  return pages.map((p) =>
    t('trPageLine', { page: p.page, reason: t(PAGE_REASON_KEYS[p.reason] ?? 'trReasonOther') }),
  )
}

/** "pages 3, 7" of the overflowed blocks */
export function overflowPages(report: TranslationResultReport): string {
  return pageList(report.overflowed.map((o) => o.page))
}
