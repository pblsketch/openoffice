import { isHangulOnlyFont, isOutsideRecommendedFont } from './fonts'
import { numberingOf, type NumberingKind, type NumberingToken } from './numbering'
import { ADMINISTRATION_RULES } from './rules/administration-ko'
import type { RuleId, RuleLimits, RuleSet, Severity } from './rule-set'
import type { Anchor, CharShapeUse, DocumentProfile, ParagraphInfo, TableInfo } from './profile'

export type Place = {
  anchor: Anchor
  /** short Korean label shown next to the finding ("표 3", "휴먼명조") */
  label: string
}

export type Finding = {
  id: RuleId
  severity: Severity
  title: string
  why: string
  /** places found, which may be more than `places.length` when the list is capped */
  count: number
  places: Place[]
  /** short evidence, already in Korean, when a count alone does not say enough */
  detail?: string
}

export type AuditResult = {
  ruleSet: { id: string; version: number }
  findings: Finding[]
  /** rules that fired, per severity */
  counts: Record<Severity, number>
  /** places those rules found, per severity */
  places: Record<Severity, number>
  /** the profile covered only part of the document */
  truncated: boolean
}

export type AuditOptions = {
  /** per-rule override of the rule set's default on/off (the panel's switches) */
  rules?: Partial<Record<RuleId, boolean>>
}

/** A finding keeps its count even when the list of places is capped. */
const MAX_PLACES = 200

const SEVERITY_ORDER: Record<Severity, number> = { violation: 0, check: 1, suggestion: 2 }

/** How each rung is written, for the one-line evidence beside a numbering finding. */
const KIND_SAMPLE: Record<NumberingKind, string> = {
  roman: 'Ⅰ.',
  arabic: '1.',
  hangul: '가.',
  'arabic-paren': '1)',
  'hangul-paren': '가)',
  'arabic-round': '(1)',
  'hangul-round': '(가)',
  'circled-arabic': '①',
  'circled-hangul': '㉮',
}

type Pending = { finding: Finding; order: number }

/**
 * Turn what an editor read from a document into findings. Pure: the same profile always
 * gives the same result, with no editor and no AI involved.
 */
export function audit(
  profile: DocumentProfile,
  ruleSet: RuleSet = ADMINISTRATION_RULES,
  options: AuditOptions = {},
): AuditResult {
  const byId = new Map(ruleSet.rules.map((rule, order) => [rule.id, { rule, order }]))
  const on = (id: RuleId) => options.rules?.[id] ?? byId.get(id)?.rule.enabled ?? false
  const pending: Pending[] = []

  const add = (
    id: RuleId,
    places: Place[],
    extra: { count?: number; detail?: string } = {},
  ): void => {
    const entry = byId.get(id)
    if (!entry) return
    const count = extra.count ?? places.length
    if (count === 0) return
    pending.push({
      order: entry.order,
      finding: {
        id,
        severity: entry.rule.severity,
        title: entry.rule.title,
        why: entry.rule.why,
        count,
        places: places.slice(0, MAX_PLACES),
        ...(extra.detail ? { detail: extra.detail } : {}),
      },
    })
  }

  const body = profile.paragraphs
    .filter((paragraph) => paragraph.path === undefined)
    .sort((a, b) => (a.section ?? 0) - (b.section ?? 0) || a.index - b.index)

  checkFonts(profile, on, add)
  checkTables(profile, ruleSet.limits, on, add)
  checkPictures(profile, on, add)
  checkBlankRuns(body, ruleSet.limits, on, add)
  checkNumbering(body, on, add)

  pending.sort(
    (a, b) =>
      SEVERITY_ORDER[a.finding.severity] - SEVERITY_ORDER[b.finding.severity] || a.order - b.order,
  )

  const counts: Record<Severity, number> = { violation: 0, check: 0, suggestion: 0 }
  const places: Record<Severity, number> = { violation: 0, check: 0, suggestion: 0 }
  for (const { finding } of pending) {
    counts[finding.severity] += 1
    places[finding.severity] += finding.count
  }

  return {
    ruleSet: { id: ruleSet.id, version: ruleSet.version },
    findings: pending.map((entry) => entry.finding),
    counts,
    places,
    truncated: profile.truncated === true,
  }
}

type Add = (id: RuleId, places: Place[], extra?: { count?: number; detail?: string }) => void

function checkFonts(profile: DocumentProfile, on: (id: RuleId) => boolean, add: Add): void {
  const used = profile.charShapes.filter((shape) => shape.uses > 0)

  if (on('font.hangul-only')) {
    const hits = used.filter((shape) => shape.fonts.some(isHangulOnlyFont))
    add(
      'font.hangul-only',
      placesOfShapes(hits, (shape) => shape.fonts.find(isHangulOnlyFont) ?? ''),
      {
        count: hits.length,
        detail: nameList(hits.flatMap((shape) => shape.fonts.filter(isHangulOnlyFont))),
      },
    )
  }

  if (on('font.outside-recommended')) {
    // Only the Hangul slot: a document may pair 함초롬바탕 with Arial for Latin text, and
    // the guideline is about the Korean font. A font already reported as Korean-word-
    // processor-only is not reported twice.
    const hits = used.filter(
      (shape) =>
        !shape.fonts.some(isHangulOnlyFont) && isOutsideRecommendedFont(shape.fonts[0] ?? ''),
    )
    add(
      'font.outside-recommended',
      placesOfShapes(hits, (shape) => shape.fonts[0] ?? ''),
      { count: hits.length, detail: nameList(hits.map((shape) => shape.fonts[0] ?? '')) },
    )
  }
}

/**
 * A document-wide finding can only be jumped to when the editor recorded where the shape
 * first appears; the count still includes the shapes it did not. Shapes that name the same
 * font are one place: a list of five "휴먼명조" buttons is no use to anyone.
 */
function placesOfShapes(
  shapes: readonly CharShapeUse[],
  labelOf: (shape: CharShapeUse) => string,
): Place[] {
  const places: Place[] = []
  const seen = new Set<string>()
  for (const shape of shapes) {
    if (!shape.first) continue
    const label = labelOf(shape)
    if (seen.has(label)) continue
    seen.add(label)
    places.push({ anchor: shape.first, label })
  }
  return places
}

function checkTables(
  profile: DocumentProfile,
  limits: RuleLimits,
  on: (id: RuleId) => boolean,
  add: Add,
): void {
  if (on('table.nested')) {
    const hits = profile.tables.filter((table) => table.nested === true)
    add(
      'table.nested',
      hits.map((table) => ({ anchor: table.anchor, label: tableLabel(table) })),
    )
  }

  if (on('table.deep-merge')) {
    const places: Place[] = []
    for (const table of profile.tables) {
      const report = mergeReport(table, limits)
      if (!report) continue
      const bodyMerge = report.bodyMerges > 0
      const heavy = report.share >= limits.mergedShare
      if (!bodyMerge && !heavy) continue
      // say which of the two made it fire: a table at 28% is not "mostly merged", and
      // a label that only shows the percentage would look wrong
      const reason = bodyMerge
        ? `본문 세로 병합 ${report.bodyMerges}`
        : `병합 ${Math.round(report.share * 100)}%`
      places.push({ anchor: table.anchor, label: `${tableLabel(table)} (${reason})` })
    }
    add('table.deep-merge', places)
  }

  if (on('table.no-caption')) {
    // A table inside a cell is part of that cell's content, not a titled element of its
    // own; a one-row table is a header band, not a data table that needs a title.
    const hits = profile.tables.filter(
      (table) => table.nested !== true && table.rows >= 2 && table.titleAbove.trim() === '',
    )
    add(
      'table.no-caption',
      hits.map((table) => ({ anchor: table.anchor, label: tableLabel(table) })),
    )
  }

  if (on('table.decorative')) {
    // A one-cell table with text in it is how a title gets a box; one without text is a
    // spacer or a layout column, and asking it for a title is noise.
    const hits = profile.tables.filter(
      (table) =>
        table.rows === 1 && table.cols === 1 && (table.cells?.[0]?.text ?? '').trim() !== '',
    )
    add(
      'table.decorative',
      hits.map((table) => ({ anchor: table.anchor, label: tableLabel(table) })),
      { detail: nameList(hits.map((table) => shorten(table.cells?.[0]?.text ?? '', 24))) },
    )
  }
}

/** Numbers behind a table's merge shape, or null when the cells were not read. */
function mergeReport(
  table: TableInfo,
  limits: RuleLimits,
): { share: number; bodyMerges: number } | null {
  if (!table.cells || table.cells.length === 0) return null
  const slots = table.rows * table.cols
  if (slots <= 0) return null
  let covered = 0
  let bodyMerges = 0
  for (const cell of table.cells) {
    const rowSpan = Math.max(1, cell.rowSpan ?? 1)
    const colSpan = Math.max(1, cell.colSpan ?? 1)
    if (rowSpan * colSpan <= 1) continue
    covered += rowSpan * colSpan - 1
    // A vertical merge reaching into the body is what breaks row-by-row reading;
    // merged header cells are the normal case and are not counted.
    if (cell.row > 0 && rowSpan >= limits.mergedRowSpan) bodyMerges += 1
  }
  return { share: Math.min(1, covered / slots), bodyMerges }
}

function checkPictures(profile: DocumentProfile, on: (id: RuleId) => boolean, add: Add): void {
  if (!on('figure.no-caption')) return
  const hits = profile.pictures.filter((picture) => picture.titleAbove.trim() === '')
  add(
    'figure.no-caption',
    hits.map((picture) => ({ anchor: picture.anchor, label: `그림 ${picture.index + 1}` })),
  )
}

function checkBlankRuns(
  body: readonly ParagraphInfo[],
  limits: RuleLimits,
  on: (id: RuleId) => boolean,
  add: Add,
): void {
  if (!on('blank.run')) return
  const places: Place[] = []
  let run = 0
  let start: ParagraphInfo | null = null
  let counted = false
  for (const paragraph of body) {
    if (paragraph.text.trim() !== '') {
      run = 0
      counted = false
      continue
    }
    run += 1
    if (run === 1) start = paragraph
    if (run >= limits.blankRun && !counted) {
      counted = true
      if (start)
        places.push({
          anchor: { section: start.section, para: start.index },
          label: `${start.index + 1}번째 문단`,
        })
    }
  }
  add('blank.run', places, { detail: `${limits.blankRun}줄 이상` })
}

function checkNumbering(
  body: readonly ParagraphInfo[],
  on: (id: RuleId) => boolean,
  add: Add,
): void {
  const order = on('numbering.order')
  const mixed = on('numbering.mixed')
  if (!order && !mixed) return

  const numbered: { paragraph: ParagraphInfo; token: NumberingToken }[] = []
  for (const paragraph of body) {
    const token = numberingOf(paragraph.text)
    if (token) numbered.push({ paragraph, token })
  }

  if (order) {
    const places: Place[] = []
    let detail: string | undefined
    for (let i = 1; i < numbered.length; i += 1) {
      const previous = numbered[i - 1].token
      const current = numbered[i].token
      // Circled numbers are used as bullets under any level (Ⅲ. 다음에 ①), so a jump
      // into or out of them is not a skipped rung. Measured: the only two hits on 18
      // real reports were exactly this.
      if (isBulletKind(previous.kind) || isBulletKind(current.kind)) continue
      if (current.rank <= previous.rank + 1) continue
      places.push({
        anchor: { section: numbered[i].paragraph.section, para: numbered[i].paragraph.index },
        label: shorten(numbered[i].paragraph.text, 24),
      })
      detail ??= `${KIND_SAMPLE[previous.kind]} 다음에 ${KIND_SAMPLE[current.kind]}`
    }
    add('numbering.order', places, detail ? { detail } : {})
  }

  if (mixed) {
    const stack: NumberingKind[] = []
    const seen = new Map<number, Set<NumberingKind>>()
    const offender = new Map<number, Place>()
    for (const { paragraph, token } of numbered) {
      // as in the order check: a bullet is not a rung of the ladder
      if (isBulletKind(token.kind)) continue
      const at = stack.indexOf(token.kind)
      if (at >= 0) stack.length = at + 1
      else stack.push(token.kind)
      const level = stack.length - 1
      let kinds = seen.get(level)
      if (!kinds) {
        kinds = new Set()
        seen.set(level, kinds)
      }
      if (kinds.has(token.kind)) continue
      if (kinds.size > 0 && !offender.has(level)) {
        offender.set(level, {
          anchor: { section: paragraph.section, para: paragraph.index },
          label: shorten(paragraph.text, 24),
        })
      }
      kinds.add(token.kind)
    }
    add('numbering.mixed', [...offender.values()])
  }
}

/** ① and ㉮ are used as bullets under any level, so they are not rungs of the ladder. */
function isBulletKind(kind: NumberingKind): boolean {
  return kind === 'circled-arabic' || kind === 'circled-hangul'
}

function tableLabel(table: TableInfo): string {
  return `표 ${table.index + 1}`
}

/** Distinct names, first few, for a finding's evidence line. */
function nameList(names: readonly string[]): string {
  const unique = [...new Set(names.map((name) => name.trim()).filter((name) => name !== ''))]
  if (unique.length <= 4) return unique.join(', ')
  return `${unique.slice(0, 4).join(', ')} 외 ${unique.length - 4}`
}

function shorten(text: string, max: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length <= max ? one : `${one.slice(0, max)}…`
}
