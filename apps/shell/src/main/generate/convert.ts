/**
 * Conversions without AI (8.6): one material of a fixed type becomes a new
 * document, with no AI and no plan usage anywhere on the way.
 *
 * | source        | result                         | content                                   |
 * | ------------- | ------------------------------ | ----------------------------------------- |
 * | a map         | a markdown document            | the map's outline text (4.8)              |
 * | a map         | a PPT skeleton                 | first sheet: central topic = title slide, |
 * |               |                                | one slide per main branch, its topics as  |
 * |               |                                | indented bullets (the outline → slides    |
 * |               |                                | code the MCP tool uses)                   |
 * | markdown text | a map                          | the text read as an outline (4.9)         |
 *
 * The source is read ONLY through `parseFileToText`: a withheld span in a
 * markdown file comes back as its `{{label}}` marker, a map comes back as its
 * outline text, and a mark the reader cannot process fails the read — then
 * nothing is converted and the reason is shown. Nothing here reads the source
 * any other way, except `markdownRedactionNotice`, which compares the file's
 * own text with what the reader hands back only to tell whether the notice is
 * due (a yes/no; the text stays here).
 *
 * No Electron: the window module wires it, the tests run it as is.
 */
import { readFile, stat } from 'node:fs/promises'
import { parseFileToText, type ParsedFile } from '@genoffice/file-parse'
import {
  createXmindDocumentFromOutline,
  OUTLINE_KIND_MARKS,
  outlineToSheets,
  type XmindTopic,
} from '@genoffice/xmind-engine'
import { createBlankPptx, openPptx, savePptx } from '@genoffice/pptx-engine'
import { runTxn, type Op } from '@genoffice/pptx-ops'
import { CONVERT_TARGETS, type ConvertKind, type ConvertProblem } from '../../shared/generate-api'
import { MAX_OUTLINE_SLIDES, outlineToOps, parsePptxOutline } from '../mcp/pptx-outline'

/** What a conversion hands to the new tab. */
export type ConvertedContent =
  /** markdown text for a new markdown tab */
  | { kind: 'mindmap-to-markdown'; target: 'markdown'; markdown: string }
  /** a whole new deck (blank deck + the outline's ops), for a new slides tab */
  | { kind: 'mindmap-to-slides'; target: 'slides'; deck: Uint8Array; slideCount: number }
  /** outline text the map editor reads into a new map (the engine's reader) */
  | { kind: 'markdown-to-mindmap'; target: 'mindmap'; outline: string }

/** What "make" opens for a conversion: the content, and where it came from. */
export interface ConvertedDocument {
  /** unique per press of "make" */
  id: string
  content: ConvertedContent
  /** the one material read */
  sources: string[]
  createdAt: number
}

export type ConvertResult =
  { ok: true; content: ConvertedContent } | { ok: false; problem: ConvertProblem }

export interface ConvertOptions {
  /** the "untitled" text in the user's language, for an outline without a title */
  untitled: string
  /** the reader; tests inject one. Always `parseFileToText` in the app */
  parse?: (path: string) => Promise<ParsedFile>
}

/** `parseFileToText`'s message for a mark it could not process (RedactionMarkError) */
const REDACTION_FAILURE = /^Redaction marks in this file could not be processed/

/** Read the source through the redaction-aware reader; never a partial read. */
async function readSource(
  path: string,
  parse: (path: string) => Promise<ParsedFile>,
): Promise<{ ok: true; text: string } | { ok: false; problem: ConvertProblem }> {
  let parsed: ParsedFile
  try {
    parsed = await parse(path)
  } catch {
    return { ok: false, problem: 'unreadable' }
  }
  if (!parsed.ok) {
    return {
      ok: false,
      problem: REDACTION_FAILURE.test(parsed.error ?? '') ? 'redaction' : 'unreadable',
    }
  }
  if (parsed.kind !== 'text' || typeof parsed.text !== 'string') {
    return { ok: false, problem: 'unreadable' }
  }
  return { ok: true, text: parsed.text }
}

/** Run one conversion. Nothing opens here; the caller opens the new tab with the content. */
export async function convertSource(
  kind: ConvertKind,
  path: string,
  options: ConvertOptions,
): Promise<ConvertResult> {
  const read = await readSource(path, options.parse ?? parseFileToText)
  if (!read.ok) return read
  try {
    switch (kind) {
      case 'mindmap-to-markdown':
        return {
          ok: true,
          content: { kind, target: CONVERT_TARGETS[kind], markdown: read.text },
        }
      case 'mindmap-to-slides': {
        const slides = mapOutlineToSlides(read.text, options.untitled)
        if (slides.length > MAX_OUTLINE_SLIDES) return { ok: false, problem: 'too-many-slides' }
        const deck = await buildDeck(outlineToOps(slides))
        return {
          ok: true,
          content: { kind, target: CONVERT_TARGETS[kind], deck, slideCount: slides.length },
        }
      }
      case 'markdown-to-mindmap':
        // the map editor builds the map from this text; building it here first
        // means a text the engine cannot take never opens a tab
        await createXmindDocumentFromOutline(read.text, { untitled: options.untitled })
        return { ok: true, content: { kind, target: CONVERT_TARGETS[kind], outline: read.text } }
    }
  } catch {
    return { ok: false, problem: 'failed' }
  }
  return { ok: false, problem: 'failed' }
}

// ---- map → PPT skeleton ----

/** The item marks of the outline that are not topics: boundary titles and relationship texts. */
const NOT_TOPIC_MARKS = [OUTLINE_KIND_MARKS.boundary, OUTLINE_KIND_MARKS.relationship]

/**
 * The outline as the map editor's outline text (4.8), back into a tree with
 * the engine's reader, so titles come back unescaped and without labels,
 * links or notes. Boundary titles and relationship texts are left out first:
 * they say something about topics but are none. A topic whose title starts
 * like a mark is written escaped and is not caught by this.
 */
function firstSheetRoot(outline: string, untitled: string): XmindTopic {
  const lines = outline.split('\n')
  const kept = lines.filter((line) => {
    const item = /^[ ]*- (.*)$/.exec(line)
    return !item || !NOT_TOPIC_MARKS.some((mark) => item[1]!.startsWith(`${mark} `))
  })
  return outlineToSheets(kept.join('\n'), { untitled })[0]!.rootTopic
}

function titleOf(topic: XmindTopic): string {
  return typeof topic.title === 'string' ? topic.title.replace(/\s+/g, ' ').trim() : ''
}

function attached(topic: XmindTopic): XmindTopic[] {
  const list = topic.children?.attached
  return Array.isArray(list) ? list : []
}

/**
 * The slides of the map's first sheet, in the form the outline → slides parser
 * reads: `# ` starts a slide (the central topic, then each main branch) and
 * `- ` lines two spaces deeper per level are its bullets.
 */
export function mapOutlineToSlidesMarkdown(outline: string, untitled: string): string {
  const root = firstSheetRoot(outline, untitled)
  const lines = [`# ${titleOf(root)}`]
  for (const branch of attached(root)) {
    lines.push('', `# ${titleOf(branch)}`)
    // depth-first without recursion; the engine bounds the depth anyway
    const pending: Array<{ topic: XmindTopic; level: number }> = attached(branch)
      .map((topic) => ({ topic, level: 0 }))
      .reverse()
    for (let next = pending.pop(); next; next = pending.pop()) {
      lines.push(`${'  '.repeat(next.level)}- ${titleOf(next.topic)}`)
      const below = attached(next.topic)
      for (let i = below.length - 1; i >= 0; i--) {
        pending.push({ topic: below[i]!, level: next.level + 1 })
      }
    }
  }
  return `${lines.join('\n')}\n`
}

/** The slides the existing outline parser makes of the map's first sheet. */
export function mapOutlineToSlides(outline: string, untitled: string) {
  return parsePptxOutline('markdown', mapOutlineToSlidesMarkdown(outline, untitled))
}

/**
 * A new deck: the blank deck with the ops applied one at a time (the executor
 * checks a batch against the deck before it, so a slide added earlier in the
 * list would not exist yet for later ops), the way the command-line `create`
 * builds one. Throws when an op does not apply.
 */
export async function buildDeck(ops: Op[]): Promise<Uint8Array> {
  const opened = await openPptx(await createBlankPptx())
  for (const op of ops) {
    const result = runTxn(opened, { ops: [op], isolation: 'atomic' })
    if (!result.applied) throw new Error(result.failures?.[0]?.error ?? `${op.op} did not apply`)
  }
  return savePptx(opened)
}

// ---- the notice for a markdown source with withheld spans ----

const FATAL_UTF8 = new TextDecoder('utf-8', { fatal: true })
const WINDOWS_1252 = new TextDecoder('windows-1252')

/** The file's own text, decoded the way the reader decodes a text file. */
function decodeText(bytes: Uint8Array): string | null {
  // UTF-32BE (00 00 FE FF) is not UTF-16BE (FE FF) and must not fall through
  // to UTF-8 / windows-1252. UTF-32LE is the UTF-16LE BOM plus two NULs.
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff) return null
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    if (bytes[2] === 0 && bytes[3] === 0) return null
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const payload = bom ? bytes.subarray(3) : bytes
  try {
    return FATAL_UTF8.decode(payload)
  } catch {
    return WINDOWS_1252.decode(payload)
  }
}

/** yes/no answers by path + size + mtime; never text */
const noticeCache = new Map<string, boolean>()
const NOTICE_CACHE_MAX = 32

export interface NoticeDeps {
  parse?: (path: string) => Promise<ParsedFile>
  readBytes?: (path: string) => Promise<Uint8Array>
  stat?: (path: string) => Promise<{ size: number; mtimeMs: number }>
}

/**
 * Whether converting this markdown file carries withheld spans over as their
 * labels (8.6's notice): the reader's text differs from the file's own text.
 * The mark parsing is the reader's; this only compares. False when the file
 * cannot be read at all (it is then not offered as material).
 */
export async function markdownRedactionNotice(
  path: string,
  deps: NoticeDeps = {},
): Promise<boolean> {
  let key: string | null = null
  if (!deps.parse && !deps.readBytes) {
    try {
      const st = await (deps.stat ?? stat)(path)
      key = `${path}|${st.size}|${st.mtimeMs}`
    } catch {
      return false
    }
    const cached = noticeCache.get(key)
    if (cached !== undefined) return cached
  }
  let parsed: ParsedFile
  let own: string | null
  try {
    parsed = await (deps.parse ?? parseFileToText)(path)
    own = decodeText(await (deps.readBytes ?? readFile)(path))
  } catch {
    return false
  }
  if (!parsed.ok || typeof parsed.text !== 'string' || own === null) return false
  const notice = parsed.text !== own
  if (key) {
    noticeCache.set(key, notice)
    if (noticeCache.size > NOTICE_CACHE_MAX) {
      const oldest = noticeCache.keys().next().value
      if (oldest !== undefined) noticeCache.delete(oldest)
    }
  }
  return notice
}
