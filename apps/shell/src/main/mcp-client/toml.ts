/**
 * A small TOML reader for pasted Codex settings (`[mcp_servers.<name>]`,
 * user MCP spec 12.3). No package in the workspace reads TOML, and the
 * pasted text needs only part of the language: tables and arrays of tables,
 * dotted and quoted keys, the four string forms, booleans, numbers, arrays
 * and inline tables. Dates are kept as their text. Throws `TomlError` on
 * text it cannot read; it is lenient about redefined tables.
 *
 * Every member is created with `defineProperty`-like semantics, so a key
 * named `__proto__` stays an ordinary member.
 */

export class TomlError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`${message} (line ${line})`)
    this.name = 'TomlError'
  }
}

type Table = Record<string, unknown>

const isTable = (v: unknown): v is Table => typeof v === 'object' && v !== null && !Array.isArray(v)

function setMember(table: Table, key: string, value: unknown): void {
  Object.defineProperty(table, key, { value, enumerable: true, writable: true, configurable: true })
}
const own = (table: Table, key: string) => Object.prototype.hasOwnProperty.call(table, key)

const BARE_KEY = /[A-Za-z0-9_-]/
const NUMBER =
  /^[+-]?(?:0x[0-9A-Fa-f_]+|0o[0-7_]+|0b[01_]+|inf|nan|[0-9][0-9_]*(?:\.[0-9_]+)?(?:[eE][+-]?[0-9_]+)?)/
const DATE =
  /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:\d{2})?)?|^\d{2}:\d{2}:\d{2}(?:\.\d+)?/

class Reader {
  private pos = 0
  constructor(private readonly text: string) {}

  private get line(): number {
    return this.text.slice(0, this.pos).split('\n').length
  }
  private fail(message: string): never {
    throw new TomlError(message, this.line)
  }
  private peek(offset = 0): string {
    return this.text[this.pos + offset] ?? ''
  }
  private startsWith(s: string): boolean {
    return this.text.startsWith(s, this.pos)
  }
  private eof(): boolean {
    return this.pos >= this.text.length
  }

  /** spaces and tabs */
  private skipSpace(): void {
    while (this.peek() === ' ' || this.peek() === '\t') this.pos++
  }
  private skipComment(): void {
    if (this.peek() !== '#') return
    while (!this.eof() && this.peek() !== '\n') this.pos++
  }
  /** spaces, comments and line breaks (between array members) */
  private skipBlank(): void {
    for (;;) {
      this.skipSpace()
      this.skipComment()
      if (this.peek() === '\n' || this.peek() === '\r') this.pos++
      else return
    }
  }
  /** the rest of a line after a key/value pair or a table header */
  private endLine(): void {
    this.skipSpace()
    this.skipComment()
    if (this.eof()) return
    if (this.startsWith('\r\n')) this.pos += 2
    else if (this.peek() === '\n') this.pos++
    else this.fail('expected the end of the line')
  }

  parse(): Table {
    const root: Table = {}
    let current = root
    for (;;) {
      this.skipBlank()
      if (this.eof()) return root
      if (this.peek() === '[') {
        current = this.header(root)
      } else {
        this.pair(current)
      }
      this.endLine()
    }
  }

  private header(root: Table): Table {
    const array = this.startsWith('[[')
    this.pos += array ? 2 : 1
    this.skipSpace()
    const path = this.key()
    this.skipSpace()
    if (!this.startsWith(array ? ']]' : ']')) this.fail('unclosed table header')
    this.pos += array ? 2 : 1
    let table = root
    path.forEach((part, i) => {
      const last = i === path.length - 1
      if (last && array) {
        const existing = own(table, part) ? table[part] : undefined
        const list = Array.isArray(existing) ? existing : []
        if (!Array.isArray(existing)) setMember(table, part, list)
        const next: Table = {}
        list.push(next)
        table = next
        return
      }
      table = this.descend(table, part)
    })
    return table
  }

  /** the sub-table under `part`, made when missing; the last element of an array of tables */
  private descend(table: Table, part: string): Table {
    const existing = own(table, part) ? table[part] : undefined
    if (existing === undefined) {
      const next: Table = {}
      setMember(table, part, next)
      return next
    }
    if (isTable(existing)) return existing
    if (Array.isArray(existing) && isTable(existing[existing.length - 1])) {
      return existing[existing.length - 1] as Table
    }
    return this.fail(`"${part}" is already a value`)
  }

  private pair(table: Table): void {
    const path = this.key()
    this.skipSpace()
    if (this.peek() !== '=') this.fail('expected "="')
    this.pos++
    this.skipSpace()
    const value = this.value()
    let target = table
    for (const part of path.slice(0, -1)) target = this.descend(target, part)
    setMember(target, path[path.length - 1], value)
  }

  /** a dotted key: bare or quoted parts */
  private key(): string[] {
    const parts: string[] = []
    for (;;) {
      this.skipSpace()
      const c = this.peek()
      if (c === '"') parts.push(this.basicString())
      else if (c === "'") parts.push(this.literalString())
      else {
        const start = this.pos
        while (BARE_KEY.test(this.peek())) this.pos++
        if (this.pos === start) this.fail('expected a key')
        parts.push(this.text.slice(start, this.pos))
      }
      this.skipSpace()
      if (this.peek() !== '.') return parts
      this.pos++
    }
  }

  private value(): unknown {
    const c = this.peek()
    if (this.startsWith('"""')) return this.multiBasicString()
    if (this.startsWith("'''")) return this.multiLiteralString()
    if (c === '"') return this.basicString()
    if (c === "'") return this.literalString()
    if (c === '[') return this.array()
    if (c === '{') return this.inlineTable()
    if (this.startsWith('true')) {
      this.pos += 4
      return true
    }
    if (this.startsWith('false')) {
      this.pos += 5
      return false
    }
    const rest = this.text.slice(this.pos)
    const date = rest.match(DATE)
    if (date) {
      this.pos += date[0].length
      return date[0]
    }
    const num = rest.match(NUMBER)
    if (num) {
      this.pos += num[0].length
      return numberOf(num[0])
    }
    return this.fail('expected a value')
  }

  private array(): unknown[] {
    this.pos++
    const items: unknown[] = []
    for (;;) {
      this.skipBlank()
      if (this.peek() === ']') {
        this.pos++
        return items
      }
      if (this.eof()) this.fail('unclosed array')
      items.push(this.value())
      this.skipBlank()
      if (this.peek() === ',') this.pos++
      else if (this.peek() !== ']') this.fail('expected "," or "]"')
    }
  }

  private inlineTable(): Table {
    this.pos++
    const table: Table = {}
    for (;;) {
      this.skipBlank()
      if (this.peek() === '}') {
        this.pos++
        return table
      }
      if (this.eof()) this.fail('unclosed inline table')
      this.pair(table)
      this.skipBlank()
      if (this.peek() === ',') this.pos++
      else if (this.peek() !== '}') this.fail('expected "," or "}"')
    }
  }

  private basicString(): string {
    this.pos++
    let out = ''
    for (;;) {
      const c = this.peek()
      if (c === '' || c === '\n') this.fail('unterminated string')
      this.pos++
      if (c === '"') return out
      out += c === '\\' ? this.escape() : c
    }
  }

  private multiBasicString(): string {
    this.pos += 3
    if (this.startsWith('\r\n')) this.pos += 2
    else if (this.peek() === '\n') this.pos++
    let out = ''
    for (;;) {
      if (this.eof()) this.fail('unterminated string')
      if (this.startsWith('"""')) {
        // up to two quotes may sit right before the closing three
        let extra = 0
        while (extra < 2 && this.peek(3 + extra) === '"') extra++
        out += '"'.repeat(extra)
        this.pos += 3 + extra
        return out
      }
      const c = this.peek()
      this.pos++
      if (c !== '\\') {
        out += c
        continue
      }
      // a backslash at the end of a line trims the break and the leading space after it
      const after = this.text.slice(this.pos).match(/^[ \t]*\r?\n/)
      if (after) {
        this.pos += after[0].length
        while (/[ \t\r\n]/.test(this.peek()) && this.peek() !== '') this.pos++
        continue
      }
      out += this.escape()
    }
  }

  private literalString(): string {
    this.pos++
    const end = this.text.indexOf("'", this.pos)
    const newline = this.text.indexOf('\n', this.pos)
    if (end < 0 || (newline >= 0 && newline < end)) this.fail('unterminated string')
    const out = this.text.slice(this.pos, end)
    this.pos = end + 1
    return out
  }

  private multiLiteralString(): string {
    this.pos += 3
    if (this.startsWith('\r\n')) this.pos += 2
    else if (this.peek() === '\n') this.pos++
    const end = this.text.indexOf("'''", this.pos)
    if (end < 0) this.fail('unterminated string')
    let extra = 0
    while (extra < 2 && this.text[end + 3 + extra] === "'") extra++
    const out = this.text.slice(this.pos, end + extra)
    this.pos = end + 3 + extra
    return out
  }

  /** the character after a backslash */
  private escape(): string {
    const c = this.peek()
    this.pos++
    switch (c) {
      case 'b':
        return '\b'
      case 't':
        return '\t'
      case 'n':
        return '\n'
      case 'f':
        return '\f'
      case 'r':
        return '\r'
      case 'e':
        return '\x1b'
      case '"':
        return '"'
      case '\\':
        return '\\'
      case 'u':
      case 'U': {
        const size = c === 'u' ? 4 : 8
        const hex = this.text.slice(this.pos, this.pos + size)
        if (!/^[0-9A-Fa-f]+$/.test(hex) || hex.length !== size) this.fail('bad unicode escape')
        const code = parseInt(hex, 16)
        if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) this.fail('bad unicode escape')
        this.pos += size
        return String.fromCodePoint(code)
      }
      default:
        return this.fail('bad escape')
    }
  }
}

function numberOf(token: string): number {
  const t = token.replace(/_/g, '')
  const sign = t.startsWith('-') ? -1 : 1
  const body = t.replace(/^[+-]/, '')
  if (body === 'inf') return sign * Infinity
  if (body === 'nan') return NaN
  if (/^0[xob]/.test(body)) return sign * Number(body)
  return Number(t)
}

/** The tables of a TOML text; throws `TomlError` when it cannot be read */
export function parseToml(text: string): Record<string, unknown> {
  return new Reader(text.replace(/^\uFEFF/, '')).parse()
}
