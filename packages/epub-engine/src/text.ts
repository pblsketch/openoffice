/**
 * Plain text of a chapter in reading order, for attachments and the MCP
 * `read` tool. Headings are prefixed with `#` by level, blocks are separated
 * by a blank line, `br` is a line break and table cells are tab-separated.
 * A chapter that is not well-formed XML is read with an HTML parser instead.
 */
import { parse } from 'parse5'
import { parseXml, type XmlElement, type XmlNode } from './xml-positions'

type TextNode =
  { kind: 'element'; name: string; children: TextNode[] } | { kind: 'text'; value: string }

const SKIP = new Set(['head', 'script', 'style', 'template', 'rt', 'rp', 'svg', 'math', 'noscript'])

const BLOCKS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'caption',
  'dd',
  'details',
  'dialog',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'header',
  'hgroup',
  'hr',
  'legend',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'tr',
  'ul',
])

const HEADING = /^h([1-6])$/

function fromXml(node: XmlNode): TextNode | null {
  if (node.type === 'text') return { kind: 'text', value: node.value }
  if (node.type !== 'element') return null
  return { kind: 'element', name: node.local, children: xmlChildren(node) }
}

function xmlChildren(el: XmlElement): TextNode[] {
  return el.children.map(fromXml).filter((n): n is TextNode => n !== null)
}

interface Parse5Node {
  nodeName: string
  value?: string
  childNodes?: Parse5Node[]
  content?: Parse5Node
}

function fromParse5(node: Parse5Node): TextNode | null {
  if (node.nodeName === '#text') return { kind: 'text', value: node.value ?? '' }
  if (node.nodeName.startsWith('#')) return null
  return {
    kind: 'element',
    name: node.nodeName,
    children: (node.childNodes ?? []).map(fromParse5).filter((n): n is TextNode => n !== null),
  }
}

function findBody(nodes: TextNode[]): TextNode[] | null {
  for (const node of nodes) {
    if (node.kind !== 'element') continue
    if (node.name === 'body') return node.children
    const inner = findBody(node.children)
    if (inner) return inner
  }
  return null
}

class TextCollector {
  readonly blocks: string[] = []
  private current = ''
  private pre = 0

  flush(prefix = ''): void {
    const lines = this.current.split('\n')
    const text = (this.pre > 0 ? lines : lines.map((line) => line.replace(/^ +| +$/g, '')))
      .join('\n')
      .replace(/^\n+|\n+$/g, '')
    this.current = ''
    if (text.trim()) this.blocks.push(prefix + text)
  }

  walk(nodes: readonly TextNode[]): void {
    for (const node of nodes) {
      if (node.kind === 'text') {
        this.current += this.pre > 0 ? node.value : node.value.replace(/[ \t\n\r\f]+/g, ' ')
        continue
      }
      const { name } = node
      if (SKIP.has(name)) continue
      if (name === 'br') {
        this.current += '\n'
        continue
      }
      if (name === 'td' || name === 'th') {
        if (this.current.trim()) this.current += '\t'
        this.walk(node.children)
        continue
      }
      const heading = HEADING.exec(name)
      if (heading) {
        this.flush()
        this.walk(node.children)
        this.flush(`${'#'.repeat(Number(heading[1]))} `)
        continue
      }
      if (!BLOCKS.has(name)) {
        this.walk(node.children)
        continue
      }
      this.flush()
      if (name === 'pre') this.pre++
      this.walk(node.children)
      this.flush()
      if (name === 'pre') this.pre--
    }
  }
}

/** The chapter's text in reading order, headings as `#` lines. */
export function extractChapterText(source: string): string {
  const parsed = parseXml(source)
  let roots: TextNode[]
  if (parsed.ok) {
    const root = fromXml(parsed.doc.root)
    roots = root ? [root] : []
  } else {
    const doc = parse(source) as unknown as Parse5Node
    roots = (doc.childNodes ?? []).map(fromParse5).filter((n): n is TextNode => n !== null)
  }
  const collector = new TextCollector()
  collector.walk(findBody(roots) ?? roots)
  collector.flush()
  return collector.blocks.join('\n\n')
}
