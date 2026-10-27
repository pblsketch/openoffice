/// HTML "spreadsheet" import for the open path. Web systems (Korean school and
/// government exports especially) hand out an HTML table named `.xls`; Excel
/// sniffs the content and opens it, so refusing it looks like a broken file.
/// Values only, like the CSV import: colspan/rowspan become merges and `<br>`
/// becomes a line break; styles and scripts are dropped.

import {
  MAX_CSV_COLS,
  MAX_CSV_ROWS,
  decodeCsvBuffer,
  isNumericCell,
  xlsxBufferFromSheets,
} from './csv-import'

/// A workbook with more cells than this would not be usable in the grid and
/// would hold the main process too long while parsing a mislabelled page.
export const MAX_HTML_CELLS = 1_000_000
export const MAX_HTML_TABLES = 64

const MAX_CELL_CHARACTERS = 32_767
const PROBE_BYTES = 8_192

export interface HtmlTable {
  /// Sheet name declared by Excel's HTML export, when one could be matched.
  readonly name?: string
  readonly rows: readonly (readonly string[])[]
  /// A1 ranges to merge, e.g. "A1:B2".
  readonly merges: readonly string[]
}

interface RawCell {
  readonly text: string
  readonly colspan: number
  readonly rowspan: number
  /// `x:num` carries the unformatted value behind a formatted display string.
  readonly number?: string
}

interface RawTable {
  readonly rows: RawCell[][]
}

interface ParsedTag {
  readonly name: string
  readonly closing: boolean
  readonly selfClosing: boolean
  readonly attributes: ReadonlyMap<string, string>
  readonly end: number
}

/// Decodes enough of the HTML character references to keep Korean and symbol
/// exports readable. Unknown references stay literal rather than disappearing.
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  middot: '\u00b7',
  bull: '\u2022',
  hellip: '\u2026',
  ndash: '\u2013',
  mdash: '\u2014',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  copy: '\u00a9',
  reg: '\u00ae',
  deg: '\u00b0',
  plusmn: '\u00b1',
  times: '\u00d7',
  divide: '\u00f7',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  sect: '\u00a7',
  para: '\u00b6',
}

export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(
    /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (match, body: string) => {
      if (body.startsWith('#')) {
        const hexadecimal = body[1] === 'x' || body[1] === 'X'
        const code = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
        // Surrogates cannot be written directly into an XML text node.
        if (code >= 0xd800 && code <= 0xdfff) return match
        return String.fromCodePoint(code)
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? match
    },
  )
}

/// True when these bytes are a web page rather than an Excel/ODF container.
/// SpreadsheetML 2003 carries a `<Table>` element too, so it is excluded
/// explicitly and left to the workbook converter.
export function looksLikeHtmlWorkbook(head: Uint8Array): boolean {
  if (head.length === 0) return false
  // Real containers are never HTML, even if compressed bytes happen to spell
  // a tag in the first block.
  if (head[0] === 0x50 && head[1] === 0x4b) return false
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return false
  let text: string
  if (head[0] === 0xff && head[1] === 0xfe) {
    text = new TextDecoder('utf-16le').decode(head.subarray(2))
  } else if (head[0] === 0xfe && head[1] === 0xff) {
    text = new TextDecoder('utf-16be').decode(head.subarray(2))
  } else {
    text = new TextDecoder('windows-1252').decode(head)
  }
  const probe = text
    .replace(/^\uFEFF/, '')
    .slice(0, PROBE_BYTES)
    .toLowerCase()
  if (probe.includes('urn:schemas-microsoft-com:office:spreadsheet')) return false
  if (probe.startsWith('<!doctype html') || probe.includes('<html')) return true
  if (probe.includes('urn:schemas-microsoft-com:office:excel')) return true
  return /<table[\s>]/.test(probe) && /<(?:td|th)[\s>]/.test(probe)
}

/// Reads the charset the page declares, then falls back to the CSV sniffing
/// (BOM, strict UTF-8, then the legacy charsets Excel writes).
export function decodeHtmlBuffer(bytes: Uint8Array, preferred?: string): string {
  const bom =
    (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) ||
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff)
  if (!bom) {
    const head = new TextDecoder('windows-1252').decode(bytes.subarray(0, 4_096))
    const declared = /<meta\b[^>]*charset\s*=\s*["']?\s*([a-z0-9._:-]+)/i.exec(head)?.[1]
    if (declared !== undefined) {
      try {
        const decoded = new TextDecoder(declared).decode(bytes)
        // A wrong declaration (a UTF-8 page labelled euc-kr or the reverse)
        // shows up as replacement characters; let the sniffer try instead.
        if (!decoded.includes('\uFFFD')) return decoded
      } catch {
        // an unknown label: let the sniffer decide
      }
    }
  }
  return decodeCsvBuffer(bytes, preferred)
}

function readTag(html: string, start: number): ParsedTag | null {
  // A tag must end within this window; otherwise a malformed run of `<` would
  // make every scan walk to the end of the page.
  const limit = Math.min(html.length, start + 65_536)
  let index = start + 1
  const closing = html[index] === '/'
  if (closing) index += 1
  const first = html[index]
  if (first === undefined || !/[A-Za-z]/.test(first)) return null
  const nameStart = index
  while (index < limit && !/[\s/<>]/.test(html[index]!)) index += 1
  const name = html.slice(nameStart, index).toLowerCase()
  const attributes = new Map<string, string>()
  while (index < limit) {
    while (index < limit && /\s/.test(html[index]!)) index += 1
    const character = html[index]
    if (character === undefined || index >= limit) return null
    if (character === '>') {
      return { name, closing, selfClosing: false, attributes, end: index + 1 }
    }
    if (character === '<') return null
    if (character === '/') {
      if (html[index + 1] === '>') {
        return { name, closing, selfClosing: true, attributes, end: index + 2 }
      }
      index += 1
      continue
    }
    const attributeStart = index
    while (index < limit && !/[\s=/><]/.test(html[index]!)) index += 1
    const attributeName = html.slice(attributeStart, index).toLowerCase()
    while (index < limit && /\s/.test(html[index]!)) index += 1
    let value = ''
    if (html[index] === '=') {
      index += 1
      while (index < limit && /\s/.test(html[index]!)) index += 1
      const quote = html[index]
      if (quote === '"' || quote === "'") {
        const valueStart = index + 1
        index = html.indexOf(quote, valueStart)
        if (index === -1 || index >= limit) return null
        value = html.slice(valueStart, index)
        index += 1
      } else {
        const valueStart = index
        while (index < limit && !/[\s><]/.test(html[index]!)) index += 1
        value = html.slice(valueStart, index)
      }
    }
    if (attributeName !== '') attributes.set(attributeName, decodeHtmlEntities(value))
  }
  return null
}

function spanAttribute(tag: ParsedTag, name: string): number {
  const raw = tag.attributes.get(name)
  if (raw === undefined) return 1
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < 1) return 1
  return Math.min(value, MAX_CSV_COLS)
}

function normalizeCellText(raw: string): string {
  const lines = decodeHtmlEntities(raw)
    .replace(/\u00a0/g, ' ')
    // explicit breaks are \u0000; source line breaks are ordinary whitespace
    .split('\u0000')
    .map((line) => line.replace(/\s+/g, ' ').trim())
  while (lines.length > 0 && lines[0] === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, MAX_CELL_CHARACTERS)
}

const BLOCK_ELEMENTS = new Set([
  'address',
  'article',
  'blockquote',
  'caption',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'ul',
])

/// Parses every top-level table in document order. Nested tables contribute
/// their text to the cell that holds them, as Excel does.
export function parseHtmlTables(html: string): HtmlTable[] {
  const rawTables: RawTable[] = []
  let tableDepth = 0
  let table: RawTable | null = null
  let row: RawCell[] | null = null
  let cell: {
    readonly chunks: string[]
    readonly colspan: number
    readonly rowspan: number
    readonly number?: string
  } | null = null
  let textStart = 0
  let rawCells = 0

  const append = (value: string): void => {
    if (cell !== null) cell.chunks.push(value)
  }
  const finishCell = (): void => {
    if (cell === null) return
    if (row === null) row = []
    rawCells += 1
    if (rawCells > MAX_HTML_CELLS) {
      throw new Error(`HTML import rejected: more than ${MAX_HTML_CELLS} cells`)
    }
    row.push({
      text: normalizeCellText(cell.chunks.join('')),
      colspan: cell.colspan,
      rowspan: cell.rowspan,
      ...(cell.number === undefined ? {} : { number: cell.number }),
    })
    cell = null
  }
  const finishRow = (): void => {
    if (row === null) return
    table?.rows.push(row)
    row = null
  }

  let index = 0
  while (index < html.length) {
    const tagStart = html.indexOf('<', index)
    if (tagStart === -1) break
    if (tagStart > textStart) {
      append(html.slice(textStart, tagStart))
      textStart = tagStart
    }

    if (html.startsWith('<!--', tagStart)) {
      const end = html.indexOf('-->', tagStart + 4)
      index = end === -1 ? html.length : end + 3
      textStart = index
      continue
    }
    if (html.startsWith('<![CDATA[', tagStart)) {
      const end = html.indexOf(']]>', tagStart + 9)
      append(html.slice(tagStart + 9, end === -1 ? html.length : end))
      index = end === -1 ? html.length : end + 3
      textStart = index
      continue
    }
    if (html.startsWith('<!', tagStart) || html.startsWith('<?', tagStart)) {
      const end = html.indexOf('>', tagStart + 2)
      index = end === -1 ? html.length : end + 1
      textStart = index
      continue
    }

    const tag = readTag(html, tagStart)
    if (tag === null) {
      index = tagStart + 1
      continue
    }
    index = tag.end
    textStart = index

    // The content of these is not cell text and may contain tags that would
    // otherwise be mistaken for table structure.
    if (!tag.closing && !tag.selfClosing && (tag.name === 'script' || tag.name === 'style')) {
      const closing = new RegExp(`</${tag.name}(?:\\s[^>]*)?>`, 'ig')
      closing.lastIndex = tag.end
      const match = closing.exec(html)
      index = match === null ? html.length : match.index + match[0].length
      textStart = index
      continue
    }

    switch (tag.name) {
      case 'table':
        if (!tag.closing) {
          if (tableDepth === 0) {
            table = { rows: [] }
            row = null
            cell = null
          } else {
            append(' ')
          }
          tableDepth += 1
        } else if (tableDepth > 0) {
          if (tableDepth === 1) {
            finishCell()
            finishRow()
            if (table !== null) rawTables.push(table)
            table = null
          } else {
            append(' ')
          }
          tableDepth -= 1
        }
        break
      case 'tr':
        if (tableDepth === 1) {
          finishCell()
          finishRow()
          if (!tag.closing) row = []
        } else {
          append(' ')
        }
        break
      case 'td':
      case 'th':
        if (tableDepth === 1) {
          if (tag.closing) {
            finishCell()
          } else {
            finishCell()
            if (row === null) row = []
            const number = tag.attributes.get('x:num')
            cell = {
              chunks: [],
              colspan: spanAttribute(tag, 'colspan'),
              rowspan: spanAttribute(tag, 'rowspan'),
              ...(number === undefined ? {} : { number }),
            }
          }
        } else {
          append(' ')
        }
        break
      case 'br':
        append('\u0000')
        break
      case 'img': {
        const alt = tag.attributes.get('alt')
        if (alt !== undefined && alt.trim() !== '') append(alt.trim())
        break
      }
      default:
        if (BLOCK_ELEMENTS.has(tag.name)) append('\u0000')
    }

    if (rawTables.length > MAX_HTML_TABLES) {
      throw new Error(`HTML import rejected: more than ${MAX_HTML_TABLES} tables`)
    }
  }
  finishCell()
  finishRow()
  if (table !== null) rawTables.push(table)
  if (rawTables.length > MAX_HTML_TABLES) {
    throw new Error(`HTML import rejected: more than ${MAX_HTML_TABLES} tables`)
  }

  const layouts = rawTables
    .map(layoutTable)
    .filter((layout): layout is LayoutTable => layout !== null)
  if (layouts.length === 0) return []

  const names = declaredSheetNames(html)
  const named =
    names.length === layouts.length ? names.map(uniqueSheetName) : layouts.map(() => undefined)
  if (named.some((name) => name === undefined)) {
    const singleName = names.length === 1 ? uniqueSheetName(names[0]!) : undefined
    return [stackTables(layouts, singleName ?? 'Sheet1')]
  }
  return layouts.map((layout, index) => ({
    name: named[index]!,
    rows: layout.rows,
    merges: layout.merges.map(mergeReference),
  }))
}

interface LayoutTable {
  readonly rows: string[][]
  readonly merges: readonly (readonly [number, number, number, number])[]
}

function layoutTable(raw: RawTable): LayoutTable | null {
  const rows: (string[] | undefined)[] = []
  const occupied: (Set<number> | undefined)[] = []
  const merges: [number, number, number, number][] = []
  let occupiedSlots = 0
  let lastRow = -1

  raw.rows.forEach((rawRow, rowIndex) => {
    let column = 0
    for (const value of rawRow) {
      while (occupied[rowIndex]?.has(column) === true) column += 1
      const colspan = value.colspan
      const rowspan = value.rowspan
      if (rowIndex >= MAX_CSV_ROWS || rowIndex + rowspan > MAX_CSV_ROWS) {
        throw new Error(`HTML import rejected: more than ${MAX_CSV_ROWS} rows`)
      }
      if (column >= MAX_CSV_COLS || column + colspan > MAX_CSV_COLS) {
        throw new Error(`HTML import rejected: more than ${MAX_CSV_COLS} columns`)
      }
      const spanArea = colspan * rowspan
      occupiedSlots += spanArea
      if (occupiedSlots > MAX_HTML_CELLS) {
        throw new Error(`HTML import rejected: more than ${MAX_HTML_CELLS} cells`)
      }
      const numeric = value.number
      const text =
        numeric !== undefined && isNumericCell(numeric.trim()) ? numeric.trim() : value.text
      if (text !== '') {
        const target = (rows[rowIndex] ??= [])
        target[column] = text
      }
      for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
        const occupiedRow = (occupied[rowIndex + rowOffset] ??= new Set())
        for (let columnOffset = 0; columnOffset < colspan; columnOffset += 1) {
          occupiedRow.add(column + columnOffset)
        }
      }
      if (colspan > 1 || rowspan > 1) {
        merges.push([rowIndex, column, rowIndex + rowspan - 1, column + colspan - 1])
      }
      lastRow = Math.max(lastRow, rowIndex + rowspan - 1)
      column += colspan
    }
    lastRow = Math.max(lastRow, rowIndex)
  })

  if (lastRow < 0) return null
  const grid: string[][] = []
  for (let rowIndex = 0; rowIndex <= lastRow; rowIndex += 1) {
    const row = rows[rowIndex] ?? []
    // Sparse slots are empty cells. Only pad a row to its own last value:
    // padding every row to the widest one would let one wide merge multiply
    // the grid by the row count.
    for (let column = 0; column < row.length; column += 1) row[column] ??= ''
    grid.push(row)
  }
  return { rows: grid, merges }
}

function stackTables(layouts: readonly LayoutTable[], defaultName: string): HtmlTable {
  const rows: string[][] = []
  const merges: string[] = []
  for (const layout of layouts) {
    if (rows.length > 0) rows.push([])
    const offset = rows.length
    rows.push(...layout.rows.map((row) => [...row]))
    for (const merge of layout.merges) {
      merges.push(mergeReference([merge[0] + offset, merge[1], merge[2] + offset, merge[3]]))
    }
  }
  return { name: defaultName, rows, merges }
}

/// Excel's own HTML export names its worksheets in a conditional comment, so
/// the names are scanned from the raw markup before comments are skipped.
function declaredSheetNames(html: string): string[] {
  const names: string[] = []
  const pattern = /<x:name[^>]*>([\s\S]*?)<\/x:name>/gi
  for (const match of html.matchAll(pattern)) {
    const text = decodeHtmlEntities(match[1] ?? '')
      .replace(/<[^>]*>/g, '')
      .trim()
    if (text !== '') names.push(text)
  }
  return names
}

function uniqueSheetName(name: string): string | undefined {
  const cleaned = name
    .replace(/[\\/?*[\]:]/g, '')
    .replace(/^'+|'+$/g, '')
    .trim()
    .slice(0, 31)
  return cleaned === '' ? undefined : cleaned
}

function mergeReference(range: readonly [number, number, number, number]): string {
  const [top, left, bottom, right] = range
  return `${columnLabel(left)}${top + 1}:${columnLabel(right)}${bottom + 1}`
}

function columnLabel(column: number): string {
  let label = ''
  let remaining = column + 1
  while (remaining > 0) {
    remaining -= 1
    label = String.fromCharCode(65 + (remaining % 26)) + label
    remaining = Math.floor(remaining / 26)
  }
  return label
}

/// Builds the workbook. `name` on a table is used only when the caller mapped
/// the tables to declared worksheet names; otherwise the names are numbered.
export async function htmlTablesToXlsxBuffer(
  tables: readonly HtmlTable[],
  defaultSheetName = 'Sheet1',
): Promise<Buffer> {
  if (tables.length === 0) throw new Error('The HTML page has no tables.')
  const used = new Set<string>()
  const numberedBase = defaultSheetName.replace(/[0-9]+$/, '')
  const worksheets = tables.map((table, index) => {
    const base = table.name ?? (index === 0 ? defaultSheetName : `${numberedBase}${index + 1}`)
    let name = base
    let suffix = 2
    while (used.has(name)) {
      const tail = ` (${suffix})`
      name = `${base.slice(0, 31 - tail.length)}${tail}`
      suffix += 1
    }
    used.add(name)
    return { name, rows: table.rows, merges: table.merges }
  })
  return xlsxBufferFromSheets(worksheets)
}
