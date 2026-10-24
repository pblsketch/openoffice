/**
 * Block text notation shared by the AI tools and book translation.
 *
 * Bold is `<b>…</b>`, italic `<i>…</i>`, a line break `<br/>`. Every other
 * inline element becomes a placeholder numbered in order within the block:
 * `<xN>…</xN>` when it has content, `<xN/>` when it has none. `&`, `<` and `>`
 * in text are written `&amp;`, `&lt;`, `&gt;`. Decoding puts every placeholder
 * back as its original markup, character for character.
 *
 * Only attribute-less `strong`/`b`, `em`/`i` and `br` become `<b>`, `<i>` and
 * `<br/>`; with attributes they are placeholders like any other element, so
 * nothing they carry is lost. Elements with neither text nor child elements,
 * and opaque elements (svg, math, …), are empty placeholders restored verbatim.
 */
import { OPAQUE_ELEMENTS, type ChapterBlock, type OpenChapter } from './blocks'
import type { XmlDocument, XmlElement, XmlNode } from './xml-positions'

export interface PlaceholderSource {
  /** Placeholder number, from 1. */
  n: number
  /** Qualified tag name of the original element. */
  tag: string
  /** Written `<xN/>`: the element had no text and no child elements, or is opaque. */
  empty: boolean
  /** Original start tag, verbatim. */
  startTag: string
  /** Original end tag, verbatim. */
  endTag: string
  /** Whole original element, verbatim. */
  outer: string
}

export interface MarkSource {
  startTag: string
  endTag: string
}

/** What decoding needs to restore a block's original markup. */
export interface NotationContext {
  placeholders: PlaceholderSource[]
  /** Original bold elements, in reading order. */
  bold: MarkSource[]
  /** Original italic elements, in reading order. */
  italic: MarkSource[]
  /** Original line break elements, verbatim, in reading order. */
  breaks: string[]
}

export interface BlockNotation {
  text: string
  context: NotationContext
}

export interface NotationOptions {
  /** Leave out ruby readings (`rt`, `rp`), keeping the base text. */
  dropRuby?: boolean
}

export type NotationResult = { ok: true; xhtml: string } | { ok: false; error: string }

/** @internal Parsed notation. `orig` points into the context's original marks. */
export type NotationNode =
  | { t: 'text'; v: string }
  | { t: 'b' | 'i'; orig: number | null; c: NotationNode[] }
  | { t: 'br'; orig: number | null }
  | { t: 'x'; n: number; c: NotationNode[] | null }

const BOLD = new Set(['strong', 'b'])
const ITALIC = new Set(['em', 'i'])
const RUBY_READINGS = new Set(['rt', 'rp'])

export function escapeNotationText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Characters XML 1.0 does not allow, including unpaired surrogates.
const XML_DISALLOWED =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

function escapeXmlText(text: string): string {
  return escapeNotationText(text.replace(XML_DISALLOWED, ''))
}

function hasContent(el: XmlElement): boolean {
  return el.children.some((c) => c.type === 'text' || c.type === 'element')
}

interface EncodeState {
  doc: XmlDocument
  dropRuby: boolean
  context: NotationContext
}

function pushText(out: NotationNode[], v: string): void {
  const last = out[out.length - 1]
  if (last && last.t === 'text') last.v += v
  else out.push({ t: 'text', v })
}

function encodeNodes(nodes: readonly XmlNode[], state: EncodeState): NotationNode[] {
  const out: NotationNode[] = []
  const { source } = state.doc
  for (const node of nodes) {
    if (node.type === 'text') {
      pushText(out, node.value)
      continue
    }
    if (node.type !== 'element') continue
    if (state.dropRuby && RUBY_READINGS.has(node.local)) continue
    const plain = node.attributes.length === 0
    const startTag = source.slice(node.start, node.startTagEnd)
    const endTag = source.slice(node.endTagStart, node.end)
    const outer = source.slice(node.start, node.end)
    if (plain && node.local === 'br' && !hasContent(node)) {
      out.push({ t: 'br', orig: state.context.breaks.push(outer) - 1 })
      continue
    }
    const empty = OPAQUE_ELEMENTS.has(node.local) || !hasContent(node)
    if (!empty && plain && (BOLD.has(node.local) || ITALIC.has(node.local))) {
      const list = BOLD.has(node.local) ? state.context.bold : state.context.italic
      const orig = list.push({ startTag, endTag }) - 1
      out.push({ t: BOLD.has(node.local) ? 'b' : 'i', orig, c: encodeNodes(node.children, state) })
      continue
    }
    const n = state.context.placeholders.length + 1
    state.context.placeholders.push({ n, tag: node.name, empty, startTag, endTag, outer })
    out.push({ t: 'x', n, c: empty ? null : encodeNodes(node.children, state) })
  }
  return out
}

/** @internal Encodes a block into a notation tree and its context. */
export function encodeBlock(
  map: OpenChapter,
  block: ChapterBlock,
  options: NotationOptions = {},
): { tree: NotationNode[]; context: NotationContext } {
  const context: NotationContext = { placeholders: [], bold: [], italic: [], breaks: [] }
  const tree = encodeNodes(block.element.children, {
    doc: map.doc,
    dropRuby: options.dropRuby === true,
    context,
  })
  return { tree, context }
}

/** @internal */
export function serializeNotation(tree: readonly NotationNode[]): string {
  let out = ''
  for (const node of tree) {
    switch (node.t) {
      case 'text':
        out += escapeNotationText(node.v)
        break
      case 'br':
        out += '<br/>'
        break
      case 'b':
      case 'i':
        out += `<${node.t}>${serializeNotation(node.c)}</${node.t}>`
        break
      case 'x':
        out +=
          node.c === null
            ? `<x${node.n}/>`
            : `<x${node.n}>${serializeNotation(node.c)}</x${node.n}>`
    }
  }
  return out
}

/** The block's text in the notation. */
export function blockNotation(
  map: OpenChapter,
  block: ChapterBlock,
  options: NotationOptions = {},
): BlockNotation {
  const { tree, context } = encodeBlock(map, block, options)
  return { text: serializeNotation(tree), context }
}

/** @internal Plain text of a notation tree. */
export function notationPlainText(tree: readonly NotationNode[]): string {
  let out = ''
  for (const node of tree) {
    if (node.t === 'text') out += node.v
    else if (node.t === 'b' || node.t === 'i') out += notationPlainText(node.c)
    else if (node.t === 'x' && node.c) out += notationPlainText(node.c)
  }
  return out
}

/**
 * The block's plain text: the characters that edit offsets (split, line break,
 * bold/italic ranges) count. Ruby readings are included; the content of opaque
 * elements, comments and line breaks are not.
 */
export function blockPlainText(map: OpenChapter, block: ChapterBlock): string {
  return notationPlainText(encodeBlock(map, block).tree)
}

// ---------------------------------------------------------------------------
// Parsing

type ParseResult = { ok: true; tree: NotationNode[] } | { ok: false; error: string }

const TAG_PATTERNS: {
  re: RegExp
  kind: 'br' | 'open' | 'close' | 'xempty' | 'xopen' | 'xclose'
}[] = [
  { re: /<br\s*\/?>/y, kind: 'br' },
  { re: /<(b|i)>/y, kind: 'open' },
  { re: /<\/(b|i)>/y, kind: 'close' },
  { re: /<x([1-9][0-9]*)\s*\/>/y, kind: 'xempty' },
  { re: /<x([1-9][0-9]*)>/y, kind: 'xopen' },
  { re: /<\/x([1-9][0-9]*)>/y, kind: 'xclose' },
]

const LOOKS_LIKE_TAG = /<\/?[A-Za-z]/y
const ENTITY = /&(amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);/y
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntity(ref: string): string | null {
  if (!ref.startsWith('#')) return NAMED[ref]!
  const code = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
  if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return null
  return String.fromCodePoint(code)
}

type Frame = { node: NotationNode & { c: NotationNode[] }; close: string }

function parseNotation(text: string, allowPlaceholders: boolean): ParseResult {
  const root: NotationNode[] = []
  const stack: Frame[] = []
  const children = (): NotationNode[] => (stack.length ? stack[stack.length - 1]!.node.c : root)
  let i = 0
  let pending = ''
  const flush = (): void => {
    if (pending) pushText(children(), pending)
    pending = ''
  }
  while (i < text.length) {
    const ch = text[i]
    if (ch === '&') {
      ENTITY.lastIndex = i
      const m = ENTITY.exec(text)
      const value = m ? decodeEntity(m[1]!) : null
      if (m && value !== null) {
        pending += value
        i += m[0].length
      } else {
        pending += '&'
        i += 1
      }
      continue
    }
    if (ch !== '<') {
      const next = text.slice(i).search(/[<&]/)
      const end = next < 0 ? text.length : i + next
      pending += text.slice(i, end)
      i = end
      continue
    }
    let matched = false
    for (const { re, kind } of TAG_PATTERNS) {
      re.lastIndex = i
      const m = re.exec(text)
      if (!m) continue
      matched = true
      flush()
      i += m[0].length
      if (!allowPlaceholders && kind.startsWith('x')) {
        return { ok: false, error: `placeholder ${m[0]} is not allowed in a new block` }
      }
      if (kind === 'br') {
        children().push({ t: 'br', orig: null })
      } else if (kind === 'open') {
        const node = { t: m[1] as 'b' | 'i', orig: null, c: [] as NotationNode[] }
        children().push(node)
        stack.push({ node, close: m[1]! })
      } else if (kind === 'xopen') {
        const node = { t: 'x' as const, n: Number(m[1]), c: [] as NotationNode[] }
        children().push(node)
        stack.push({ node, close: `x${m[1]}` })
      } else if (kind === 'xempty') {
        children().push({ t: 'x', n: Number(m[1]), c: null })
      } else {
        const name = kind === 'close' ? m[1]! : `x${m[1]}`
        const top = stack.pop()
        if (!top) return { ok: false, error: `closing </${name}> has no opening tag` }
        if (top.close !== name) {
          return { ok: false, error: `</${name}> closes <${top.close}>; tags must nest` }
        }
      }
      break
    }
    if (matched) continue
    LOOKS_LIKE_TAG.lastIndex = i
    if (LOOKS_LIKE_TAG.test(text)) {
      const tag = /^<[^>]*>?/.exec(text.slice(i))![0]
      return { ok: false, error: `unknown tag ${tag}` }
    }
    pending += '<'
    i += 1
  }
  flush()
  if (stack.length) return { ok: false, error: `<${stack[stack.length - 1]!.close}> is not closed` }
  return { ok: true, tree: root }
}

function collect(tree: readonly NotationNode[], t: NotationNode['t'], out: NotationNode[] = []) {
  for (const node of tree) {
    if (node.t === t) out.push(node)
    if ((node.t === 'b' || node.t === 'i' || node.t === 'x') && node.c) collect(node.c, t, out)
  }
  return out
}

function checkTree(tree: readonly NotationNode[], context: NotationContext): string | null {
  const seen = new Set<number>()
  for (const node of collect(tree, 'x')) {
    if (node.t !== 'x') continue
    const source = context.placeholders[node.n - 1]
    if (!source) return `placeholder x${node.n} does not exist in this block`
    if (seen.has(node.n)) return `placeholder x${node.n} appears more than once`
    seen.add(node.n)
    if (source.empty && node.c !== null)
      return `placeholder x${node.n} must be written <x${node.n}/>`
    if (!source.empty && node.c === null) {
      return `placeholder x${node.n} must be written <x${node.n}>…</x${node.n}>`
    }
  }
  const missing = context.placeholders.filter((p) => !seen.has(p.n)).map((p) => `x${p.n}`)
  if (missing.length) return `placeholders missing: ${missing.join(', ')}`
  return null
}

/** Checks that the placeholders match the block's: same kinds, same count, paired and nested. */
export function checkNotation(
  text: string,
  context: NotationContext,
): { ok: true } | { ok: false; error: string } {
  const parsed = parseNotation(text, true)
  if (!parsed.ok) return parsed
  const problem = checkTree(parsed.tree, context)
  return problem ? { ok: false, error: problem } : { ok: true }
}

/** Gives bold, italic and line breaks their original markup when their number is unchanged. */
function assignOriginals(tree: NotationNode[], context: NotationContext): void {
  const assign = (t: 'b' | 'i' | 'br', count: number): void => {
    const nodes = collect(tree, t)
    if (nodes.length !== count) return
    nodes.forEach((node, index) => {
      ;(node as { orig: number | null }).orig = index
    })
  }
  assign('b', context.bold.length)
  assign('i', context.italic.length)
  assign('br', context.breaks.length)
}

/** @internal Writes a checked notation tree as inner XHTML. */
export function notationTreeToXhtml(
  tree: readonly NotationNode[],
  context: NotationContext,
): string {
  let out = ''
  for (const node of tree) {
    switch (node.t) {
      case 'text':
        out += escapeXmlText(node.v)
        break
      case 'br':
        out += node.orig === null ? '<br/>' : context.breaks[node.orig]!
        break
      case 'b':
      case 'i': {
        const originals = node.t === 'b' ? context.bold : context.italic
        const mark =
          node.orig === null
            ? node.t === 'b'
              ? { startTag: '<strong>', endTag: '</strong>' }
              : { startTag: '<em>', endTag: '</em>' }
            : originals[node.orig]!
        out += mark.startTag + notationTreeToXhtml(node.c, context) + mark.endTag
        break
      }
      case 'x': {
        const source = context.placeholders[node.n - 1]!
        out +=
          node.c === null
            ? source.outer
            : source.startTag + notationTreeToXhtml(node.c, context) + source.endTag
      }
    }
  }
  return out
}

/** @internal Parses and checks a notation into a tree with originals assigned. */
export function parseBlockNotation(
  text: string,
  context: NotationContext,
): { ok: true; tree: NotationNode[] } | { ok: false; error: string } {
  const parsed = parseNotation(text, true)
  if (!parsed.ok) return parsed
  const problem = checkTree(parsed.tree, context)
  if (problem) return { ok: false, error: problem }
  assignOriginals(parsed.tree, context)
  return parsed
}

/**
 * Turns notation for an existing block back into inner XHTML. Placeholders
 * must match the block's (see checkNotation); new bold and italic become
 * `strong` and `em`.
 */
export function notationToXhtml(text: string, context: NotationContext): NotationResult {
  const parsed = parseBlockNotation(text, context)
  if (!parsed.ok) return parsed
  return { ok: true, xhtml: notationTreeToXhtml(parsed.tree, context) }
}

const EMPTY_CONTEXT: NotationContext = { placeholders: [], bold: [], italic: [], breaks: [] }

/** Turns notation for a new block into inner XHTML: only `strong`, `em` and `br`, no placeholders. */
export function newBlockNotationToXhtml(text: string): NotationResult {
  const parsed = parseNotation(text, false)
  if (!parsed.ok) return parsed
  return { ok: true, xhtml: notationTreeToXhtml(parsed.tree, EMPTY_CONTEXT) }
}
