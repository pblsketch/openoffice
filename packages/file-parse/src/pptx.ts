import JSZip from 'jszip'
import { assertZipInflatesWithinLimits, assertZipWithinLimits } from '@genoffice/docx-engine'
import { resolveTarget } from './opc'
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { redactPptxPartXml } from './pptx-redaction'

// Text fidelity: no trim (xml:space="preserve" runs carry the spaces between words),
// no numeric coercion of tag values (otherwise <a:t>02139</a:t> becomes a number and loses characters).
// preserveOrder keeps <a:br> and <a:fld> in sequence with the <a:r> runs around them; grouped by
// tag name they lose that position, and a deck's soft breaks and field text land in the wrong place.
const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: false,
  parseTagValue: false,
  preserveOrder: true,
  removeNSPrefix: true,
})

const notesParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: false,
  parseTagValue: false,
  preserveOrder: true,
  removeNSPrefix: true,
})

function stripNamespacePrefix(name: string): string {
  const separator = name.indexOf(':')
  return separator < 0 ? name : name.slice(separator + 1)
}

const manifestParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
  removeNSPrefix: false,
  transformTagName: stripNamespacePrefix,
  attributeValueProcessor: (_name, value) => value.trim(),
})

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function relationshipId(node: Record<string, unknown>): string {
  const qualified = Object.entries(node).find(([key]) => /^@_[^:]+:id$/.test(key))
  return String(qualified?.[1] ?? node['@_id'] ?? '')
}

function slideNumber(path: string): number {
  const m = /slide(\d+)\.xml$/.exec(path)
  return m ? Number(m[1]) : 0
}

async function presentationSlideEntries(zip: JSZip): Promise<(string | null)[] | null> {
  const presXml = await zipText(zip, 'ppt/presentation.xml')
  if (presXml === undefined) return null
  const pres = manifestParser.parse(presXml) as {
    presentation?: {
      sldIdLst?: { sldId?: Record<string, string> | Record<string, string>[] }
    }
  }
  const slideIds = asArray(pres.presentation?.sldIdLst?.sldId)

  const rels = new Map<string, { target: string; type: string; external: boolean }>()
  const relsXml = await zipText(zip, 'ppt/_rels/presentation.xml.rels')
  if (relsXml) {
    const doc = manifestParser.parse(relsXml) as {
      Relationships?: { Relationship?: Record<string, string> | Record<string, string>[] }
    }
    for (const rel of asArray(doc.Relationships?.Relationship)) {
      const id = String(rel['@_Id'] ?? '')
      if (!id) continue
      rels.set(id, {
        target: String(rel['@_Target'] ?? ''),
        type: String(rel['@_Type'] ?? ''),
        external: String(rel['@_TargetMode'] ?? '').toLowerCase() === 'external',
      })
    }
  }

  const entries: (string | null)[] = []
  for (const sldId of slideIds) {
    const rel = rels.get(relationshipId(sldId))
    entries.push(
      rel && !rel.external && rel.target && rel.type.endsWith('/slide')
        ? resolveTarget('ppt/presentation.xml', rel.target)
        : null,
    )
  }
  return entries
}

function legacySlidePaths(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b))
}

async function zipText(zip: JSZip, path: string): Promise<string | undefined> {
  const file = zip.files[path]
  return file ? file.async('text') : undefined
}

const NOTES_SLIDE_REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide'
const COMMENT_AUTHOR_PATHS = ['ppt/commentAuthors.xml', 'ppt/authors.xml']

/** 2006 (`.../relationships/comments`) and Office 365 (`.../2018/10/relationships/comments`). */
function isCommentsRelationship(type: string): boolean {
  return /\/comments$/i.test(type)
}

/** the .rels part that belongs to a package part */
function relsPathFor(partPath: string): string {
  const slash = partPath.lastIndexOf('/')
  return `${partPath.slice(0, slash)}/_rels/${partPath.slice(slash + 1)}.rels`
}

async function notesXmlForSlide(zip: JSZip, slidePath: string): Promise<string | undefined> {
  const relsXml = await zipText(zip, relsPathFor(slidePath))
  if (!relsXml) return undefined
  const doc = manifestParser.parse(relsXml) as {
    Relationships?: { Relationship?: Record<string, string> | Record<string, string>[] }
  }
  for (const rel of asArray(doc.Relationships?.Relationship)) {
    if (String(rel['@_Type'] ?? '') !== NOTES_SLIDE_REL) continue
    if (String(rel['@_TargetMode'] ?? '').toLowerCase() === 'external') continue
    const target = String(rel['@_Target'] ?? '')
    return target ? zipText(zip, resolveTarget(slidePath, target)) : undefined
  }
  return undefined
}

/** body placeholder only: the notes page's slide-number field would read as a stray digit */
function notesParagraphs(notesXml: string): string[] {
  const out: string[] = []
  type Node = Record<string, unknown>
  const child = (nodes: Node[], name: string): Node[] =>
    (nodes.find((node) => Array.isArray(node[name]))?.[name] as Node[] | undefined) ?? []
  const tree = notesParser.parse(notesXml) as Node[]
  const shapes = child(child(child(tree, 'notes'), 'cSld'), 'spTree')
  const walkShapes = (nodes: Node[]): void => {
    for (const shape of nodes) {
      if (Array.isArray(shape.grpSp)) walkShapes(shape.grpSp as Node[])
      if (Array.isArray(shape.AlternateContent))
        walkShapes(mcBranch(shape.AlternateContent) as Node[])
      if (!Array.isArray(shape.sp)) continue
      const children = shape.sp as Node[]
      const properties = child(child(children, 'nvSpPr'), 'nvPr')
      const placeholder = properties.find((node) => Array.isArray(node.ph))
      const attributes = placeholder?.[':@'] as Record<string, string> | undefined
      if (attributes?.['@_type'] !== 'body') continue
      collectParagraphs(child(children, 'txBody'), out)
    }
  }
  walkShapes(shapes)
  return out
}

const commentParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  parseTagValue: false,
  removeNSPrefix: true,
  isArray: (_name, jPath) =>
    jPath === 'cmLst.cm' ||
    jPath === 'cmLst.cm.replyLst.reply' ||
    jPath === 'cmAuthorLst.cmAuthor' ||
    jPath === 'authorLst.author',
})

/**
 * A comments/author part is optional decoration on a deck. Missing, malformed or
 * unreadable parts just mean there is nothing to add, never a failed attachment.
 */
function parseCommentPart(xml: string | undefined): unknown {
  if (xml === undefined) return undefined
  try {
    if (XMLValidator.validate(xml) !== true) return undefined
    return commentParser.parse(xml)
  } catch {
    return undefined
  }
}

interface SlideCommentLine {
  author: string
  dt: string
  text: string
}

function commentRunText(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (typeof node === 'object' && typeof (node as { '#text'?: unknown })['#text'] === 'string') {
    return (node as { '#text': string })['#text']
  }
  return ''
}

function collectGroupedRuns(node: unknown, texts: string[]): void {
  if (node == null) return
  if (Array.isArray(node)) {
    for (const item of node) collectGroupedRuns(item, texts)
    return
  }
  if (typeof node !== 'object') return
  const rec = node as Record<string, unknown>
  if ('t' in rec) {
    for (const item of asArray(rec.t)) texts.push(commentRunText(item))
  }
  if ('br' in rec) texts.push('\n')
  if ('tab' in rec) texts.push('\t')
  for (const [key, value] of Object.entries(rec)) {
    if (key === 't' || key === 'br' || key === 'tab' || key.startsWith('@_') || key === '#text')
      continue
    collectGroupedRuns(value, texts)
  }
}

function collectGroupedParagraphs(node: unknown, paras: string[]): void {
  if (node == null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectGroupedParagraphs(item, paras)
    return
  }
  const rec = node as Record<string, unknown>
  if ('p' in rec) {
    for (const paragraph of asArray(rec.p)) {
      const texts: string[] = []
      collectGroupedRuns(paragraph, texts)
      const line = texts.join('')
      if (line.trim()) paras.push(line)
    }
  }
  for (const [key, value] of Object.entries(rec)) {
    if (key === 'p' || key.startsWith('@_')) continue
    collectGroupedParagraphs(value, paras)
  }
}

function commentBodyText(node: Record<string, unknown>): string {
  const rawText = node['text']
  if (typeof rawText === 'string') return rawText
  if (
    rawText &&
    typeof rawText === 'object' &&
    typeof (rawText as { '#text'?: unknown })['#text'] === 'string'
  ) {
    return (rawText as { '#text': string })['#text']
  }
  if (node.txBody !== undefined) {
    const paras: string[] = []
    collectGroupedParagraphs(node.txBody, paras)
    return paras.join('\n')
  }
  return ''
}

function commentTimestamp(node: Record<string, unknown>): string {
  if (typeof node['@_dt'] === 'string' && node['@_dt']) return node['@_dt']
  if (typeof node['@_created'] === 'string') return node['@_created']
  return ''
}

function pushComment(out: SlideCommentLine[], entry: unknown, authors: Map<string, string>): void {
  if (entry === null || typeof entry !== 'object') return
  const node = entry as Record<string, unknown>
  const authorId = node['@_authorId'] === undefined ? '' : String(node['@_authorId'])
  const known = authorId ? authors.get(authorId) : undefined
  out.push({
    author: known && known.trim() ? known : 'Unknown author',
    dt: commentTimestamp(node),
    text: commentBodyText(node),
  })
}

function addAuthors(authors: Map<string, string>, doc: unknown): void {
  if (doc === null || typeof doc !== 'object') return
  const rec = doc as Record<string, unknown>
  for (const list of [rec.cmAuthorLst, rec.authorLst]) {
    if (list === null || typeof list !== 'object') continue
    const entries =
      (list as Record<string, unknown>).cmAuthor ?? (list as Record<string, unknown>).author
    for (const entry of asArray(entries)) {
      if (entry === null || typeof entry !== 'object') continue
      const node = entry as Record<string, unknown>
      const id = node['@_id']
      const name = node['@_name']
      if (id === undefined || id === null || typeof name !== 'string') continue
      const key = String(id)
      if (key && name.trim()) authors.set(key, name)
    }
  }
}

/** author table shared by every comments part; a missing table leaves ids unresolved */
async function commentAuthors(zip: JSZip): Promise<Map<string, string>> {
  const authors = new Map<string, string>()
  for (const path of COMMENT_AUTHOR_PATHS) {
    let xml: string | undefined
    try {
      xml = await zipText(zip, path)
    } catch {
      continue
    }
    addAuthors(authors, parseCommentPart(xml))
  }
  return authors
}

async function commentsXmlForSlide(zip: JSZip, slidePath: string): Promise<string | undefined> {
  try {
    const relsXml = await zipText(zip, relsPathFor(slidePath))
    if (!relsXml) return undefined
    const doc = manifestParser.parse(relsXml) as {
      Relationships?: { Relationship?: Record<string, string> | Record<string, string>[] }
    }
    for (const rel of asArray(doc.Relationships?.Relationship)) {
      if (!isCommentsRelationship(String(rel['@_Type'] ?? ''))) continue
      if (String(rel['@_TargetMode'] ?? '').toLowerCase() === 'external') continue
      const target = String(rel['@_Target'] ?? '')
      return target ? await zipText(zip, resolveTarget(slidePath, target)) : undefined
    }
    return undefined
  } catch {
    return undefined
  }
}

async function slideCommentsForSlide(
  zip: JSZip,
  slidePath: string,
  authors: Map<string, string>,
): Promise<SlideCommentLine[]> {
  const doc = parseCommentPart(await commentsXmlForSlide(zip, slidePath)) as
    { cmLst?: { cm?: unknown } } | undefined
  const out: SlideCommentLine[] = []
  for (const entry of asArray(doc?.cmLst?.cm)) {
    pushComment(out, entry, authors)
    if (entry === null || typeof entry !== 'object') continue
    const replyLst = (entry as Record<string, unknown>).replyLst
    if (replyLst === null || typeof replyLst !== 'object') continue
    for (const reply of asArray((replyLst as Record<string, unknown>).reply)) {
      pushComment(out, reply, authors)
    }
  }
  return out
}

function commentLines(comments: SlideCommentLine[]): string[] {
  if (comments.length === 0) return []
  return [
    '### Comments',
    ...comments.map((c) =>
      c.dt ? `- ${c.author} (${c.dt}): ${c.text}` : `- ${c.author}: ${c.text}`,
    ),
  ]
}

/**
 * One compatibility branch of an mc:AlternateContent element: the Fallback when the
 * producer wrote one, else the first Choice. Reading both branches would duplicate
 * every run and every picture the element carries. The parser strips namespace
 * prefixes, so the branches arrive as AlternateContent / Choice / Fallback.
 */
function mcBranch(value: readonly unknown[]): readonly unknown[] {
  let choice: readonly unknown[] | undefined
  for (const entry of value) {
    if (entry == null || typeof entry !== 'object') continue
    for (const [key, branch] of Object.entries(entry)) {
      if (key === 'Fallback') return Array.isArray(branch) ? branch : []
      if (key === 'Choice' && !choice && Array.isArray(branch)) choice = branch
    }
  }
  return choice ?? []
}

/**
 * One paragraph's text in document order. Only #text directly under a:t counts: untrimmed, the
 * whitespace laying out any other element is a value too. <a:br> is a soft line break, <a:tab>
 * is a tab stop between runs, and <a:fld> (slide number, date) contributes its own a:t where it sits.
 */
function collectText(nodes: readonly unknown[], out: string[], isText = false): void {
  for (const node of nodes) {
    if (node == null || typeof node !== 'object') continue
    for (const [key, value] of Object.entries(node)) {
      if (key === '#text') {
        if (isText) out.push(String(value))
      } else if (key === 'br') {
        out.push('\n')
      } else if (key === 'tab') {
        out.push('\t')
      } else if (Array.isArray(value)) {
        if (key === 'AlternateContent') collectText(mcBranch(value), out)
        else collectText(value, out, key === 't')
      }
    }
  }
}

/** walk the slide tree; each a:p paragraph becomes one output entry (a:br splits it further) */
function collectParagraphs(nodes: readonly unknown[], out: string[]): void {
  for (const node of nodes) {
    if (node == null || typeof node !== 'object') continue
    for (const [key, value] of Object.entries(node)) {
      if (!Array.isArray(value)) continue
      if (key === 'p') {
        const texts: string[] = []
        collectText(value, texts)
        const line = texts.join('')
        if (line.trim()) out.push(line)
      } else {
        collectParagraphs(key === 'AlternateContent' ? mcBranch(value) : value, out)
      }
    }
  }
}

function countPictures(nodes: readonly unknown[]): number {
  let count = 0
  for (const node of nodes) {
    if (node == null || typeof node !== 'object') continue
    for (const [key, value] of Object.entries(node)) {
      if (key === 'pic') count += 1
      else if (Array.isArray(value))
        count += countPictures(key === 'AlternateContent' ? mcBranch(value) : value)
    }
  }
  return count
}

/**
 * A slide whose only content is pictures yields no a:t text. Without a marker the model
 * (and the user reading the attachment chip) takes the bare "## Slide N" heading for a slide
 * that was read, when its figures never reached anyone.
 */
interface SlideSection {
  section: string
  hasText: boolean
  pictures: number
}

function slideSection(
  heading: string,
  xml: string,
  notesXml?: string,
  comments: SlideCommentLine[] = [],
): SlideSection {
  // withheld runs become their {{label}} marker before anything reads the part;
  // a mark that cannot be processed throws, so the deck fails instead of leaking
  xml = redactPptxPartXml(xml)
  if (notesXml) notesXml = redactPptxPartXml(notesXml)
  const tree = parser.parse(xml)
  const paras: string[] = []
  collectParagraphs(tree, paras)
  const notes = notesXml ? notesParagraphs(notesXml) : []
  const extras = [...(notes.length > 0 ? ['### Notes', ...notes] : []), ...commentLines(comments)]
  if (paras.length > 0)
    return {
      section: [heading, ...paras, ...extras].join('\n'),
      hasText: true,
      pictures: 0,
    }
  const pictures = countPictures(tree)
  const note = `[picture-only slide: ${pictures} image${pictures === 1 ? '' : 's'}, no extractable text]`
  const lines = [heading, ...(pictures > 0 ? [note] : []), ...extras]
  return { section: lines.join('\n'), hasText: notes.length > 0 || comments.length > 0, pictures }
}

function joinSections(sections: SlideSection[]): string {
  const body = sections.map((s) => s.section).join('\n\n')
  if (sections.some((s) => s.hasText) || !sections.some((s) => s.pictures > 0)) return body
  const n = sections.length
  return `[No extractable text: none of the ${n} slide${n === 1 ? '' : 's'} carries text; the content is in embedded images, which this extraction does not read.]\n\n${body}`
}

/** extract slide text from a pptx: one "## Slide N" section per slide, a line per paragraph */
export async function pptxToText(bytes: Uint8Array): Promise<string> {
  // The declared-size pass below is advisory; this metered gate is the one that
  // holds when a part lies about its size (GH #759).
  await assertZipInflatesWithinLimits(bytes)
  const zip = await JSZip.loadAsync(bytes)
  assertZipWithinLimits(zip)
  const slideEntries = await presentationSlideEntries(zip)
  const authors = await commentAuthors(zip)
  const sections: SlideSection[] = []
  if (slideEntries) {
    for (const [index, path] of slideEntries.entries()) {
      if (path === null) continue
      const xml = await zipText(zip, path)
      if (!xml) continue
      sections.push(
        slideSection(
          `## Slide ${index + 1}`,
          xml,
          await notesXmlForSlide(zip, path),
          await slideCommentsForSlide(zip, path, authors),
        ),
      )
    }
    return joinSections(sections)
  }
  for (const path of legacySlidePaths(zip)) {
    const xml = await zipText(zip, path)
    if (!xml) continue
    sections.push(
      slideSection(
        `## Slide ${slideNumber(path)}`,
        xml,
        await notesXmlForSlide(zip, path),
        await slideCommentsForSlide(zip, path, authors),
      ),
    )
  }
  return joinSections(sections)
}
