/**
 * SKILL.md front matter, read and written without a YAML library. Only what
 * skills use is understood: top-level `key: value` lines, plain, quoted and
 * block (`|`, `>`) scalars, one level of `key: value` under a map key such
 * as `metadata`, and top-level lists of scalars (`- item` lines or `[a, b]`).
 * Anything else is kept as written when the app rewrites a file.
 */
import { IEUM_TEMPLATE_KEY, IEUM_TITLE_KEY } from './constants'

export interface ParsedSkillMd {
  name: string | undefined
  description: string | undefined
  /** the one-level `metadata` map, scalar values only */
  metadata: Record<string, string>
  /** every top-level key with a scalar value */
  fields: Record<string, string>
  /** every top-level key whose value is a list of scalars, such as `allowed-tools` */
  lists: Record<string, string[]>
  /** everything after the closing `---` line, as written */
  body: string
}

interface Line {
  text: string
  indent: number
  blank: boolean
}

/** One top-level key with the lines that belong to it */
interface Block {
  /** `undefined` for comments and other lines before the first key */
  key: string | undefined
  /** what follows `key:` on the key line */
  inline: string
  /** the lines after the key line, until the next top-level key */
  children: Line[]
  /** the key line and its children, as written */
  raw: string[]
}

const KEY_LINE = /^([ \t]*)((?!- )(?!-$)[^\s#'"][^:]*?)[ \t]*:(?:[ \t]+(.*)|[ \t]*)$/

function toLine(text: string): Line {
  const indent = text.length - text.trimStart().length
  return { text, indent, blank: text.trim() === '' }
}

/** Front matter lines and the body, or `undefined` when the file has no front matter */
function splitFrontmatter(text: string): { lines: string[]; body: string } | undefined {
  const source = text.startsWith('\ufeff') ? text.slice(1) : text
  const open = /^---[ \t]*\r?\n/.exec(source)
  if (!open) return undefined
  const lines: string[] = []
  let at = open[0].length
  while (at <= source.length) {
    const end = source.indexOf('\n', at)
    const lineEnd = end === -1 ? source.length : end
    const line = source.slice(at, lineEnd).replace(/\r$/, '')
    if (/^---[ \t]*$/.test(line)) {
      return { lines, body: end === -1 ? '' : source.slice(end + 1) }
    }
    if (end === -1) return undefined
    lines.push(line)
    at = end + 1
  }
  return undefined
}

function blocksOf(lines: string[]): Block[] {
  const blocks: Block[] = []
  let current: Block | undefined
  for (const text of lines) {
    const match = text.startsWith(' ') || text.startsWith('\t') ? null : KEY_LINE.exec(text)
    if (match) {
      current = { key: match[2], inline: match[3] ?? '', children: [], raw: [text] }
      blocks.push(current)
      continue
    }
    if (!current) {
      current = { key: undefined, inline: '', children: [], raw: [] }
      blocks.push(current)
    }
    current.raw.push(text)
    if (current.key !== undefined) current.children.push(toLine(text))
  }
  return blocks
}

function stripComment(value: string): string {
  if (value.startsWith('#')) return ''
  const at = value.search(/[ \t]#/)
  return (at === -1 ? value : value.slice(0, at)).trimEnd()
}

const ESCAPES: Record<string, string> = {
  '0': '\0',
  a: '\x07',
  b: '\b',
  t: '\t',
  '\t': '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  e: '\x1b',
  ' ': ' ',
  '"': '"',
  '/': '/',
  '\\': '\\',
  N: String.fromCharCode(0x85),
  _: String.fromCharCode(0xa0),
  L: String.fromCharCode(0x2028),
  P: String.fromCharCode(0x2029),
}

/** Characters YAML cannot hold unquoted: C0 controls, DEL, NEL and the Unicode line breaks */
function hasBreakOrControl(value: string, allowTabAndNewline: boolean): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (allowTabAndNewline && (code === 0x09 || code === 0x0a)) continue
    if (code < 0x20 || code === 0x7f || code === 0x85 || code === 0x2028 || code === 0x2029) {
      return true
    }
  }
  return false
}

function readDoubleQuoted(text: string): string | undefined {
  let out = ''
  for (let i = 1; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '"') return out
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = text[i + 1]
    if (next === undefined) return undefined
    const width = next === 'x' ? 2 : next === 'u' ? 4 : next === 'U' ? 8 : 0
    if (width) {
      const hex = text.slice(i + 2, i + 2 + width)
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== width) return undefined
      out += String.fromCodePoint(parseInt(hex, 16))
      i += 1 + width
      continue
    }
    out += ESCAPES[next] ?? next
    i += 1
  }
  return undefined
}

function readSingleQuoted(text: string): string | undefined {
  let out = ''
  for (let i = 1; i < text.length; i++) {
    const ch = text[i]!
    if (ch === "'") {
      if (text[i + 1] === "'") {
        out += "'"
        i += 1
        continue
      }
      return out
    }
    out += ch
  }
  return undefined
}

/** Join lines the way YAML folds flow scalars: a break is a space, an empty line a newline */
function foldFlow(parts: string[]): string {
  let out = ''
  let empties = 0
  let started = false
  for (const part of parts) {
    if (part === '') {
      empties++
      continue
    }
    if (started) out += empties ? '\n'.repeat(empties) : ' '
    out += part
    started = true
    empties = 0
  }
  return out
}

function readBlockScalar(header: string, children: Line[], parentIndent: number): string {
  const match = /^([|>])([+-]?)([1-9]?)([+-]?)/.exec(header)
  const folded = match?.[1] === '>'
  const chomp = match?.[2] || match?.[4] || ''
  const explicit = match?.[3] ? parentIndent + Number(match[3]) : undefined
  const first = children.find((line) => !line.blank)
  const indent = explicit ?? first?.indent ?? parentIndent + 1
  const content: string[] = []
  for (const line of children) {
    if (line.blank) {
      content.push(line.text.length > indent ? line.text.slice(indent) : '')
      continue
    }
    if (line.indent < indent) break
    content.push(line.text.slice(indent))
  }
  let trailing = 0
  while (content.length && content[content.length - 1]!.trim() === '') {
    content.pop()
    trailing++
  }
  let body: string
  if (!folded) {
    body = content.join('\n')
  } else {
    body = ''
    let empties = 0
    let started = false
    let lastMore = false
    for (const line of content) {
      if (line === '') {
        empties++
        continue
      }
      const more = line.startsWith(' ') || line.startsWith('\t')
      if (!started) body += '\n'.repeat(empties)
      else if (empties === 0 && !more && !lastMore) body += ' '
      else if (!more && !lastMore) body += '\n'.repeat(empties)
      else body += '\n'.repeat(empties + 1)
      body += line
      started = true
      empties = 0
      lastMore = more
    }
  }
  if (content.length === 0) return chomp === '+' ? '\n'.repeat(trailing) : ''
  if (chomp === '-') return body
  if (chomp === '+') return `${body}\n${'\n'.repeat(trailing)}`
  return `${body}\n`
}

/**
 * The scalar value of a key: what follows the colon and the lines under it.
 * `undefined` when the value is a map, a list, or not readable.
 */
function readScalar(inline: string, children: Line[], parentIndent: number): string | undefined {
  const value = inline.trim()
  if (value.startsWith('|') || value.startsWith('>')) {
    return readBlockScalar(value, children, parentIndent)
  }
  const more = children.filter((line) => line.indent > parentIndent || line.blank)
  if (value.startsWith('"') || value.startsWith("'")) {
    const joined = foldFlow([value, ...more.map((line) => line.text.trim())])
    return value.startsWith('"') ? readDoubleQuoted(joined) : readSingleQuoted(joined)
  }
  if (value.startsWith('[') || value.startsWith('{')) return undefined
  const head = stripComment(value)
  const rest: string[] = []
  for (const line of more) {
    const text = line.text.trim()
    if (text.startsWith('#')) break
    if (!line.blank && (text.startsWith('- ') || text === '-' || KEY_LINE.test(text))) {
      return undefined
    }
    rest.push(line.blank ? '' : stripComment(text))
  }
  while (rest.length && rest[rest.length - 1] === '') rest.pop()
  if (head === '' && rest.length === 0) return ''
  return foldFlow([head, ...rest]).trim()
}

/** One item of a list: a plain or quoted scalar; `undefined` for a map, a list or a block */
function readListItem(raw: string): string | undefined {
  const text = raw.trim()
  if (text.startsWith('"')) return readDoubleQuoted(text)
  if (text.startsWith("'")) return readSingleQuoted(text)
  if (/^[[{|>]/.test(text) || text === '-' || text.startsWith('- ') || KEY_LINE.test(text)) {
    return undefined
  }
  return stripComment(text).trim()
}

/** The items of a flow list such as `[a, "b, c", 'd']`; `undefined` when it is not one */
function readFlowList(text: string): string[] | undefined {
  const value = text.trim()
  if (!value.startsWith('[') || !value.endsWith(']')) return undefined
  const inner = value.slice(1, -1)
  const parts: string[] = []
  let current = ''
  let quote: string | undefined
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!
    if (quote) {
      current += ch
      if (ch === '\\' && quote === '"' && i + 1 < inner.length) current += inner[++i]!
      else if (ch === quote) quote = undefined
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    if (ch === ',') {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (quote) return undefined
  parts.push(current)
  const items: string[] = []
  for (const part of parts) {
    if (part.trim() === '') continue
    const item = readListItem(part)
    if (item === undefined) return undefined
    items.push(item)
  }
  return items
}

/**
 * The items of a list value: `- item` lines (at the key's indent or deeper) or
 * a flow list. `undefined` when the value is not a list of scalars.
 */
function readList(inline: string, children: Line[]): string[] | undefined {
  const value = stripComment(inline.trim())
  if (value.startsWith('[')) {
    const rest = children.filter((line) => !line.blank).map((line) => line.text.trim())
    return readFlowList([value, ...rest].join(' '))
  }
  if (value !== '') return undefined
  const raws: string[] = []
  let dashIndent = -1
  for (const line of children) {
    const text = line.text.trim()
    if (line.blank || text.startsWith('#')) continue
    if (text === '-' || text.startsWith('- ')) {
      if (dashIndent === -1) dashIndent = line.indent
      if (line.indent === dashIndent) {
        raws.push(text.slice(1).trim())
        continue
      }
    }
    // a plain item going on over more lines
    if (raws.length === 0 || line.indent <= dashIndent) return undefined
    raws[raws.length - 1] += ` ${text}`
  }
  if (raws.length === 0) return undefined
  const items: string[] = []
  for (const raw of raws) {
    const item = readListItem(raw)
    if (item === undefined) return undefined
    items.push(item)
  }
  return items
}

interface MapEntry {
  key: string
  inline: string
  children: Line[]
  raw: string[]
}

/** The one-level map under a key, or `undefined` when the value is not a block map */
function readMap(
  block: Block,
): { indent: number; entries: MapEntry[]; lead: string[] } | undefined {
  if (stripComment(block.inline.trim()) !== '') return undefined
  const first = block.children.find((line) => !line.blank && !line.text.trim().startsWith('#'))
  if (!first || first.indent === 0) return { indent: 2, entries: [], lead: [] }
  const entries: MapEntry[] = []
  const lead: string[] = []
  for (const line of block.children) {
    const match = line.indent === first.indent ? KEY_LINE.exec(line.text) : null
    if (match) {
      entries.push({ key: match[2]!, inline: match[3] ?? '', children: [], raw: [line.text] })
      continue
    }
    const last = entries[entries.length - 1]
    if (!last) {
      if (!line.blank && !line.text.trim().startsWith('#')) return undefined
      lead.push(line.text)
      continue
    }
    last.raw.push(line.text)
    last.children.push(line)
  }
  return { indent: first.indent, entries, lead }
}

/**
 * Read a SKILL.md. Returns `undefined` when the file does not start with a
 * `---` line or the block is never closed.
 */
export function parseSkillMd(text: string): ParsedSkillMd | undefined {
  const split = splitFrontmatter(text)
  if (!split) return undefined
  const fields: Record<string, string> = {}
  const lists: Record<string, string[]> = {}
  const metadata: Record<string, string> = {}
  for (const block of blocksOf(split.lines)) {
    if (block.key === undefined) continue
    if (block.key === 'metadata') {
      const map = readMap(block)
      for (const entry of map?.entries ?? []) {
        const value = readScalar(entry.inline, entry.children, map!.indent)
        if (value !== undefined) metadata[entry.key] = value
      }
      continue
    }
    // a list first: lines `- item` at the key's indent read as an empty scalar
    const list = readList(block.inline, block.children)
    if (list) {
      lists[block.key] = list
      continue
    }
    const value = readScalar(block.inline, block.children, 0)
    if (value !== undefined) fields[block.key] = value
  }
  return {
    name: fields.name,
    description: fields.description,
    metadata,
    fields,
    lists,
    body: split.body,
  }
}

const PLAIN_UNSAFE_START = /^[\s\-?:,[\]{}#&*!|>'"%@`]/
const PLAIN_RESERVED = /^(?:true|false|yes|no|on|off|y|n|null|~)$/i

function plainSafe(value: string): boolean {
  return (
    value !== '' &&
    value === value.trim() &&
    !PLAIN_UNSAFE_START.test(value) &&
    !PLAIN_RESERVED.test(value) &&
    !/^[-+]?(?:\d|\.\d)/.test(value) &&
    !value.includes(': ') &&
    !value.includes(' #') &&
    !value.endsWith(':') &&
    !hasBreakOrControl(value, false)
  )
}

/** The text after `key:` for a value written at `indent` (lines of a literal block included) */
function writeScalar(value: string, indent: number): string[] {
  if (plainSafe(value)) return [` ${value}`]
  const lines = value.split('\n')
  const firstText = lines.find((line) => line !== '')
  const literal =
    value.includes('\n') &&
    firstText !== undefined &&
    !/^[ \t]/.test(firstText) &&
    !value.includes('\r') &&
    lines.every((line) => line === '' || line.trim() !== '') &&
    !hasBreakOrControl(value, true)
  if (!literal) return [` ${JSON.stringify(value)}`]
  let trailing = 0
  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop()
    trailing++
  }
  const chomp = trailing === 0 ? '-' : trailing === 1 ? '' : '+'
  const pad = ' '.repeat(indent + 2)
  const out = [` |${chomp}`, ...lines.map((line) => (line === '' ? '' : `${pad}${line}`))]
  if (trailing > 1) for (let i = 1; i < trailing; i++) out.push('')
  return out
}

function keyValue(key: string, value: string | boolean, indent: number): string[] {
  const written = typeof value === 'boolean' ? [` ${value}`] : writeScalar(value, indent)
  return [`${' '.repeat(indent)}${key}:${written[0]}`, ...written.slice(1)]
}

export interface SkillMdInput {
  name: string
  description: string
  /** `metadata.ieum-title`; left out when undefined */
  title?: string | undefined
  /** `metadata.ieum-template`; left out when undefined */
  template?: string | undefined
  body: string
  /** other top-level keys to set, such as `disable-model-invocation` */
  fields?: Record<string, string | boolean> | undefined
}

/**
 * Write a SKILL.md in the standard shape: `name`, `description`, and this
 * app's values under `metadata`. With `base` (the file being rewritten), its
 * other keys and other metadata entries stay as they were written, in place.
 */
export function renderSkillMd(input: SkillMdInput, base?: string): string {
  const ieum: Array<[string, string]> = []
  if (input.title !== undefined) ieum.push([IEUM_TITLE_KEY, input.title])
  if (input.template !== undefined) ieum.push([IEUM_TEMPLATE_KEY, input.template])
  const fields = new Map<string, string | boolean>([
    ['name', input.name],
    ['description', input.description],
    ...Object.entries(input.fields ?? {}),
  ])

  const metadataLines = (block: Block | undefined): string[] => {
    const map = block ? readMap(block) : undefined
    if (block && !map) {
      // a metadata value this reader does not understand: keep it unless app values must go in
      if (ieum.length === 0) return block.raw
    }
    const indent = map?.indent ?? 2
    const pending = new Map(ieum)
    const lines: string[] = [...(map?.lead ?? [])]
    let kept = 0
    for (const entry of map?.entries ?? []) {
      if (entry.key === IEUM_TITLE_KEY || entry.key === IEUM_TEMPLATE_KEY) {
        const value = pending.get(entry.key)
        pending.delete(entry.key)
        if (value === undefined) continue
        lines.push(...keyValue(entry.key, value, indent))
      } else {
        lines.push(...entry.raw)
      }
      kept++
    }
    for (const [key, value] of pending) {
      lines.push(...keyValue(key, value, indent))
      kept++
    }
    return kept === 0 ? [] : ['metadata:', ...lines]
  }

  const out: string[] = []
  const written = new Set<string>()
  let metadataWritten = false
  const blocks = base ? blocksOf(splitFrontmatter(base)?.lines ?? []) : []
  for (const block of blocks) {
    if (block.key === undefined) {
      out.push(...block.raw)
      continue
    }
    if (block.key === 'metadata') {
      if (!metadataWritten) out.push(...metadataLines(block))
      metadataWritten = true
      continue
    }
    const value = fields.get(block.key)
    if (value === undefined) {
      out.push(...block.raw)
      continue
    }
    if (!written.has(block.key)) out.push(...keyValue(block.key, value, 0))
    written.add(block.key)
  }
  const missing = [...fields].filter(([key]) => !written.has(key))
  const head = missing.filter(([key]) => key === 'name' || key === 'description')
  const tail = missing.filter(([key]) => key !== 'name' && key !== 'description')
  for (const [key, value] of head) out.push(...keyValue(key, value, 0))
  if (!metadataWritten) out.push(...metadataLines(undefined))
  for (const [key, value] of tail) out.push(...keyValue(key, value, 0))
  return `---\n${out.join('\n')}\n---\n${input.body}`
}
