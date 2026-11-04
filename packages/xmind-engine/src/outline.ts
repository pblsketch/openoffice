/**
 * The map as outline text. This is the one place a map is turned into words:
 * what other readers, the search index, an AI attachment and "export as a
 * markdown outline" all get.
 *
 *     # <sheet title>
 *
 *     - <central topic>
 *       - <branch> [label one, label two] <https://example.com>
 *         > first line of the note
 *         > second line of the note
 *         - <topic below>
 *
 * Every sheet starts with its `# ` line and a blank line; sheets are separated
 * by a blank line, and the text ends with a line break. A topic is a `- ` item,
 * two spaces deeper per level. Labels follow the title in square brackets,
 * a web link in angle brackets, and the note sits right below its topic in
 * `> ` lines. A folded topic is written like an open one.
 *
 * The walk is over the source tree, not the view, so nothing the editor leaves
 * undrawn is missing. Below a topic come, in this order: its note, its
 * branches, and then the items that say what they are:
 *
 * - `(summary)`: a summary topic, with the branches below it
 * - `(callout)`: a callout
 * - `(floating)`: a floating topic
 * - `(other)`: a topic of a kind the engine does not know
 * - `(boundary)`: the title of a boundary around this topic's branches
 * - `(relationship)`: the text on a line that starts at this topic, as
 *   `text -> title of the topic it ends on`
 *
 * Titles, labels and notes are plain text. They are written so that none of
 * them can start a line of its own, and so that `outlineToSheets` reads the
 * same titles, labels, links and notes back:
 *
 * - A title or label of several lines becomes one line: the lines are trimmed
 *   and joined with a space.
 * - In a title or label, `\`, `[`, `]` and a `<` that could open a tag or a
 *   link get a backslash; so does a `,` inside a label.
 * - A topic title that starts like a list item, a heading, a quote, a code
 *   fence, a rule or one of the kind marks above gets a backslash there. A
 *   sheet title that ends in `#` gets one before that `#`.
 * - A note is written as it is, one `> ` line per line (`>` for an empty one),
 *   without the blank lines at its end. Its text is not escaped: it cannot
 *   leave its quote lines, but a program that shows the outline as rendered
 *   markdown must not let raw HTML through, as with any markdown file.
 * - Only a web link (`isWebLink`) is written. Blanks, `<` and `>` inside it are
 *   percent-encoded.
 *
 * With ids (`OUTLINE_READING_OPTIONS`, what an assistant reads) the lines that
 * are not topics name what they are about, so a tool can change it. They are
 * judged on the view (`sheetToView`): a relationship, summary or boundary the
 * editor does not draw is not written at all, and every one it draws is, with
 * or without a title:
 *
 *     - (relationship) {#r1} Start {#t1} -> End {#t2}: text [shape=curved, end=triangle]
 *     - (summary) Title {#s1} [over {#t3}..{#t5}, shape=curly]
 *     - (boundary) {#b1} Title [around {#t3}..{#t5}, fill=none]
 *     - (boundary) {#b2} [around {#t6}]
 *
 * A relationship stands below the topic it starts at, a boundary below the
 * topic that carries it (`around {#id}` alone: around that topic itself). The
 * format set on it follows in square brackets, in the words of
 * `outlineStyleWords`. Without ids none of this is written: the text is the
 * one described above, byte for byte.
 */

import {
  ARROW_SHAPE_PREFIX,
  BOUNDARY_SHAPE_PREFIX,
  BOUNDARY_STYLE_PROPERTIES,
  BRANCH_LINE_CLASS_PREFIX,
  BRANCH_LINE_PROPERTIES,
  classWord,
  RELATIONSHIP_SHAPE_PREFIX,
  RELATIONSHIP_STYLE_PROPERTIES,
  SUMMARY_SHAPE_PREFIX,
  SUMMARY_STYLE_PROPERTIES,
} from './line-style'
import { noteText } from './notes'
import { kindMarkLength, LINE_BREAK, OUTLINE_KIND_MARKS, type OutlineKind } from './outline-marks'
import { isRecord, type XmindSheet, type XmindTopic } from './types'
import { isWebLink, sheetToView, type ViewTopic } from './view'

export { OUTLINE_KIND_MARKS, type OutlineKind } from './outline-marks'

export interface OutlineOptions {
  /** Write every topic's id after it, as ` {#id}`, so a tool can name the topic. */
  ids?: boolean
  /**
   * Fold the topics below this level into one `- (+N more)` line under the
   * topic they hang from. The central topic is level 0, its branches level 1.
   * Nothing is folded when left out.
   */
  foldBelowLevel?: number
  /** Fold only a sheet with more topics than this. Every sheet when left out. */
  foldAboveTopics?: number
  /**
   * Write only the branch below the topic with this id (of any kind), that
   * topic first, as if it were the central topic. With ids, what is drawn is
   * still judged on the whole sheet. Only the heading is written when the
   * sheet has no such topic.
   */
  branch?: string
}

/** A sheet with more topics than this is folded when an assistant reads it. */
export const OUTLINE_FOLD_ABOVE_TOPICS = 300
/** The level below which such a sheet is folded. */
export const OUTLINE_FOLD_BELOW_LEVEL = 3

/** What an assistant reads a map with: ids on every topic, large sheets folded. */
export const OUTLINE_READING_OPTIONS: Readonly<OutlineOptions> = {
  ids: true,
  foldBelowLevel: OUTLINE_FOLD_BELOW_LEVEL,
  foldAboveTopics: OUTLINE_FOLD_ABOVE_TOPICS,
}

/** The outline of every sheet, in file order. Pass a document's `sheets`. */
export function sheetsToOutline(
  sheets: readonly XmindSheet[],
  options: OutlineOptions = {},
): string {
  return sheets.map((sheet) => sheetToOutline(sheet, options)).join('\n')
}

/** The outline of one sheet. With no options: the whole sheet, no ids. */
export function sheetToOutline(sheet: XmindSheet, options: OutlineOptions = {}): string {
  const title = escapeHeading(oneLine(sheet.title))
  const lines = [title === '' ? '#' : `# ${title}`, '']
  const root =
    options.branch === undefined ? sheet.rootTopic : findTopic(sheet.rootTopic, options.branch)
  if (!root) return `${lines.join('\n')}\n`
  const ids = options.ids === true
  const walk: Walk = {
    lines,
    ids,
    foldBelow: foldLevel(root, options),
    relationships: ids ? new Map() : relationshipTexts(sheet),
    marks: ids ? readingMarks(sheet) : null,
  }
  writeTopic(root, 0, null, walk)
  return `${lines.join('\n')}\n`
}

/** How many topics a sheet holds, of every kind, the central topic included. */
export function countSheetTopics(sheet: XmindSheet): number {
  return countTopics(sheet.rootTopic)
}

interface Walk {
  lines: string[]
  ids: boolean
  /** the last level written in full, or null when nothing is folded */
  foldBelow: number | null
  /** the `(relationship)` texts to write below a topic, by the topic's id */
  relationships: Map<string, string[]>
  /** with ids: what is written of the relationships, summaries and boundaries the editor draws */
  marks: ReadingMarks | null
}

/**
 * Recursion is bounded the way the view's is: the structure check refuses
 * trees deeper than MAX_TOPIC_DEPTH, and it counts every kind of child.
 */
function writeTopic(topic: XmindTopic, level: number, kind: OutlineKind | null, walk: Walk): void {
  const indent = '  '.repeat(level)
  const below = `${indent}  `
  const summary = kind === 'summary' ? (walk.marks?.summaries.get(topic.id) ?? '') : ''
  walk.lines.push(`${indent}-${spaced(topicText(topic, kind, walk.ids) + summary)}`)
  for (const line of noteLines(topic.notes)) walk.lines.push(`${below}>${spaced(line)}`)

  if (walk.foldBelow !== null && level >= walk.foldBelow) {
    const hidden = countTopics(topic) - 1
    if (hidden > 0) walk.lines.push(`${below}- (+${hidden} more)`)
  } else {
    for (const child of topicsBelow(topic)) writeTopic(child.topic, level + 1, child.kind, walk)
  }

  // What follows is about this topic, not a topic of its own, so folding the
  // levels below leaves it in.
  if (walk.marks) {
    const about = [
      ...(walk.marks.boundaries.get(topic.id) ?? []),
      ...(walk.marks.relationships.get(topic.id) ?? []),
    ]
    for (const line of about) walk.lines.push(`${below}- ${line}`)
    return
  }
  for (const boundary of records(topic.boundaries)) {
    const title = escapeTitle(oneLine(boundary.title))
    if (title !== '') walk.lines.push(`${below}- ${OUTLINE_KIND_MARKS.boundary} ${title}`)
  }
  for (const text of walk.relationships.get(topic.id) ?? []) {
    walk.lines.push(`${below}- ${OUTLINE_KIND_MARKS.relationship} ${text}`)
  }
}

function spaced(text: string): string {
  return text === '' ? '' : ` ${text}`
}

function topicText(topic: XmindTopic, kind: OutlineKind | null, ids: boolean): string {
  const parts: string[] = []
  if (kind) parts.push(OUTLINE_KIND_MARKS[kind])
  const title = escapeTitle(oneLine(topic.title))
  if (title !== '') parts.push(title)
  const labels = strings(topic.labels)
    .map((label) => escapeLabel(oneLine(label)))
    .filter((label) => label !== '')
  if (labels.length > 0) parts.push(`[${labels.join(', ')}]`)
  if (isWebLink(topic.href)) parts.push(`<${encodeLink(topic.href)}>`)
  if (ids) parts.push(idTag(topic.id))
  return parts.join(' ')
}

/** An id that is not a plain word is written as a JSON string, so it stays one token. */
function idTag(id: string): string {
  return /^[\w.:-]+$/.test(id) ? `{#${id}}` : `{#${JSON.stringify(id)}}`
}

/** The note's lines without the blank ones at its end. */
function noteLines(notes: unknown): string[] {
  const text = noteText(notes)
  if (text === null) return []
  const lines = text.split(LINE_BREAK)
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop()
  return lines
}

const TOPIC_KINDS = [
  ['attached', null],
  ['summary', 'summary'],
  ['callout', 'callout'],
  ['detached', 'floating'],
] as const

const KNOWN_CHILD_KINDS = new Set<string>(TOPIC_KINDS.map(([name]) => name))

interface TopicBelow {
  kind: OutlineKind | null
  topic: XmindTopic
}

/** The topics right below a topic, of every kind, in the order they are written. */
function topicsBelow(topic: XmindTopic): TopicBelow[] {
  const children = topic.children
  if (!isRecord(children)) return []
  const out: TopicBelow[] = []
  for (const [name, kind] of TOPIC_KINDS) {
    for (const child of topicList(children[name])) out.push({ kind, topic: child })
  }
  for (const [name, list] of Object.entries(children)) {
    if (KNOWN_CHILD_KINDS.has(name)) continue
    for (const child of topicList(list)) out.push({ kind: 'other', topic: child })
  }
  return out
}

/** Whatever in a list under `children` has the shape of a topic. */
function topicList(value: unknown): XmindTopic[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is XmindTopic => isRecord(item) && typeof item.id === 'string' && item.id !== '',
  )
}

/** A topic and everything below it, counted without recursion. */
function countTopics(root: XmindTopic): number {
  let count = 0
  const pending = [root]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    count++
    for (const child of topicsBelow(topic)) pending.push(child.topic)
  }
  return count
}

function foldLevel(root: XmindTopic, options: OutlineOptions): number | null {
  const level = options.foldBelowLevel
  if (level === undefined || !Number.isInteger(level) || level < 0) return null
  const above = options.foldAboveTopics
  return above === undefined || countTopics(root) > above ? level : null
}

/**
 * The text of every relationship that has one, under the id of the topic it
 * starts at. A line whose start is not a topic of the sheet is written under
 * the central topic, so its text is not lost. A line without text says nothing
 * and is not written.
 */
function relationshipTexts(sheet: XmindSheet): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const titled = records(sheet.relationships).filter((line) => oneLine(line.title) !== '')
  if (titled.length === 0) return out

  const titles = new Map<string, string>()
  const pending = [sheet.rootTopic]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    titles.set(topic.id, oneLine(topic.title))
    for (const child of topicsBelow(topic)) pending.push(child.topic)
  }
  for (const line of titled) {
    const { end1Id, end2Id } = line
    const from = typeof end1Id === 'string' && titles.has(end1Id) ? end1Id : sheet.rootTopic.id
    const target = typeof end2Id === 'string' ? (titles.get(end2Id) ?? '') : ''
    const text = target === '' ? oneLine(line.title) : `${oneLine(line.title)} -> ${target}`
    const list = out.get(from) ?? []
    list.push(escapeTitle(text))
    out.set(from, list)
  }
  return out
}

/** What is written, with ids, of what the editor draws besides the topics. */
interface ReadingMarks {
  /** the `(boundary)` lines below the topic that carries them, by its id */
  boundaries: Map<string, string[]>
  /** the `(relationship)` lines below the topic they start at, by its id */
  relationships: Map<string, string[]>
  /** what follows the id of a summary topic: its range and its bracket */
  summaries: Map<string, string>
}

/** The lines and marks of the relationships, summaries and boundaries of the sheet's view. */
function readingMarks(sheet: XmindSheet): ReadingMarks {
  const view = sheetToView(sheet, 0)
  const out: ReadingMarks = {
    boundaries: new Map(),
    relationships: new Map(),
    summaries: new Map(),
  }
  const titles = new Map<string, string>()
  const topics = new Map<string, ViewTopic>()
  const pending = [view.root]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    titles.set(topic.id, oneLine(topic.title))
    topics.set(topic.id, topic)
    for (const summary of topic.summaries) {
      titles.set(summary.topicId, oneLine(summary.title))
      const range = `over ${branchRange(topic, summary.start, summary.end)}`
      out.summaries.set(summary.topicId, styleMark(range, 'summary', summary.style))
    }
    pending.push(...topic.children)
  }
  for (const boundary of view.boundaries ?? []) {
    const carrier = topics.get(boundary.topicId)
    if (!carrier) continue
    const range =
      boundary.range === 'master'
        ? idTag(carrier.id)
        : branchRange(carrier, boundary.range.start, boundary.range.end)
    const title = escapeInline(oneLine(boundary.title))
    const text = [OUTLINE_KIND_MARKS.boundary, idTag(boundary.id), ...(title ? [title] : [])]
    const mark = styleMark(`around ${range}`, 'boundary', boundary.style)
    push(out.boundaries, carrier.id, `${text.join(' ')}${mark}`)
  }
  const named = (id: string): string => {
    const title = escapeInline(titles.get(id) ?? '')
    return title === '' ? idTag(id) : `${title} ${idTag(id)}`
  }
  for (const relationship of view.relationships) {
    const ends = `${named(relationship.fromId)} -> ${named(relationship.toId)}`
    const title = escapeInline(oneLine(relationship.title))
    const text = `${OUTLINE_KIND_MARKS.relationship} ${idTag(relationship.id)} ${ends}`
    const mark = styleMark(null, 'relationship', relationship.style)
    push(out.relationships, relationship.fromId, `${text}${title ? `: ${title}` : ''}${mark}`)
  }
  return out
}

/** The first and last of the branches `start`..`end` of a topic, by their ids. */
function branchRange(topic: ViewTopic, start: number, end: number): string {
  const first = topic.children[start]
  const last = topic.children[end]
  return first && last ? `${idTag(first.id)}..${idTag(last.id)}` : ''
}

/** ` [lead, key=value, …]`; nothing when there is neither. */
function styleMark(
  lead: string | null,
  kind: OutlineStyleKind,
  values: Readonly<Record<string, string | undefined>> | undefined,
): string {
  const parts = outlineStyleWords(kind, values).map(([key, word]) => `${key}=${word}`)
  if (lead !== null) parts.unshift(lead)
  return parts.length === 0 ? '' : ` [${parts.join(', ')}]`
}

function push(map: Map<string, string[]>, key: string, line: string): void {
  const list = map.get(key) ?? []
  list.push(line)
  map.set(key, list)
}

/** A topic of any kind with this id, found without recursion. */
function findTopic(root: XmindTopic, id: string): XmindTopic | null {
  const pending = [root]
  for (let topic = pending.pop(); topic; topic = pending.pop()) {
    if (topic.id === id) return topic
    for (const child of topicsBelow(topic)) pending.push(child.topic)
  }
  return null
}

/** What a format belongs to: the line into a branch, a relationship, a summary bracket, a boundary. */
export type OutlineStyleKind = 'branch' | 'relationship' | 'summary' | 'boundary'

const STYLE_KEYS: Readonly<Record<OutlineStyleKind, readonly string[]>> = {
  branch: Object.keys(BRANCH_LINE_PROPERTIES),
  relationship: Object.keys(RELATIONSHIP_STYLE_PROPERTIES),
  summary: Object.keys(SUMMARY_STYLE_PROPERTIES),
  boundary: Object.keys(BOUNDARY_STYLE_PROPERTIES),
}

const SHAPE_PREFIXES: Readonly<Record<OutlineStyleKind, string>> = {
  branch: BRANCH_LINE_CLASS_PREFIX,
  relationship: RELATIONSHIP_SHAPE_PREFIX,
  summary: SUMMARY_SHAPE_PREFIX,
  boundary: BOUNDARY_SHAPE_PREFIX,
}

/** The word a value of another form stands as: the editor keeps it but cannot name it. */
const OTHER_VALUE = 'other'
const SHAPE_WORD = /^[A-Za-z0-9][\w.-]*$/
const HEX_COLOR = /^#[0-9a-f]{6}$/i
const POINTS = /^\s*(\d+(?:\.\d+)?)\s*pt\s*$/i
const OTHER_WIDTH = /^\s*(\d+(?:\.\d+)?(?:px)?)\s*$/i
const PATTERN_WORD = /^[a-z][a-z-]*$/i

/**
 * The values of a format (by the view's names, as the file holds them) in the
 * words an assistant reads and writes, in the order of the format's keys: a
 * shape without its `org.xmind.…` prefix, a width in points as a number, a
 * colour as `#rrggbb`. A value of another form is `other`, so nothing of it
 * can break the line it is written on.
 */
export function outlineStyleWords(
  kind: OutlineStyleKind,
  values: Readonly<Record<string, string | undefined>> | null | undefined,
): Array<[string, string]> {
  const out: Array<[string, string]> = []
  if (!isRecord(values)) return out
  for (const key of STYLE_KEYS[kind]) {
    const value = values[key]
    if (typeof value === 'string') out.push([key, styleWord(kind, key, value)])
  }
  return out
}

function styleWord(kind: OutlineStyleKind, key: string, value: string): string {
  switch (key) {
    case 'shape':
    case 'begin':
    case 'end': {
      const prefix = key === 'shape' ? SHAPE_PREFIXES[kind] : ARROW_SHAPE_PREFIX
      const word = classWord(value, prefix)
      return word !== null && SHAPE_WORD.test(word) ? word : OTHER_VALUE
    }
    case 'color':
      return HEX_COLOR.test(value) ? value.toLowerCase() : OTHER_VALUE
    case 'fill':
      if (value === 'none') return value
      return HEX_COLOR.test(value) ? value.toLowerCase() : OTHER_VALUE
    case 'width':
      return POINTS.exec(value)?.[1] ?? OTHER_WIDTH.exec(value)?.[1] ?? OTHER_VALUE
    default:
      return PATTERN_WORD.test(value) ? value : OTHER_VALUE
  }
}

/**
 * Where a title or label is cut into lines: at more than markdown's own line
 * breaks, so that no reader of the outline sees a title end early.
 */
const TITLE_BREAK = /\r\n|[\n\r\v\f\u0085\u2028\u2029]/

/** A value from the file as one line of text: anything that is not text is empty. */
function oneLine(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .split(TITLE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(' ')
}

const INLINE_SPECIAL = /\\|[[\]]|<(?=[A-Za-z/!?])/g
const LABEL_SPECIAL = /\\|[[\],]|<(?=[A-Za-z/!?])/g

function escapeInline(text: string): string {
  return text.replace(INLINE_SPECIAL, '\\$&')
}

function escapeLabel(text: string): string {
  return text.replace(LABEL_SPECIAL, '\\$&')
}

/** What a list item must not start with, each with the place its backslash goes. */
const BULLET_START = /^[-+*](?=[ \t]|$)/
const ORDERED_START = /^(\d{1,9})(?=[.)](?:[ \t]|$))/
const BLOCK_START = /^(?:#{1,6}(?=[ \t]|$)|>|`{3}|~{3})/
const RULE = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/

/**
 * A topic title as the text of a list item. The reader tests for a rule on the
 * whole line, item marker included, so `--` is escaped as well as `---`.
 */
function escapeTitle(title: string): string {
  const text = escapeInline(title)
  const ordered = ORDERED_START.exec(text)
  if (ordered) return `${ordered[1]}\\${text.slice(ordered[1]!.length)}`
  const startsSomething =
    BULLET_START.test(text) ||
    BLOCK_START.test(text) ||
    RULE.test(`- ${text}`) ||
    RULE.test(text) ||
    kindMarkLength(text) > 0
  return startsSomething ? `\\${text}` : text
}

/** A sheet title as the text of a heading: a `#` run at its end would close the heading. */
function escapeHeading(title: string): string {
  const text = escapeInline(title)
  let start = text.length
  while (start > 0 && text[start - 1] === '#') start--
  if (start === text.length) return text
  const closes = start === 0 || text[start - 1] === ' ' || text[start - 1] === '\t'
  return closes ? `${text.slice(0, start)}\\${text.slice(start)}` : text
}

/** A link as it sits between angle brackets: nothing in it may end the line or the brackets. */
function encodeLink(href: string): string {
  return href.replace(/[\s<>]/g, (char) => encodeURIComponent(char))
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}
