/**
 * What each inline element of an editable block is to the engine, and the
 * block's text as the screen holds it.
 *
 * The engine writes a block's content in the block notation (spec §7): bold
 * `<b>`, italic `<i>`, line break `<br/>`, every other inline element a
 * numbered placeholder `<xN>…</xN>` or `<xN/>`. `inlineRoleTree` walks the
 * block in the chapter source exactly as the engine's encoder does, so the
 * numbers match the engine's. `pairRoles` lays that tree over the drawn
 * block in the frame, element by element, and remembers the role of each
 * drawn element.
 *
 * After the user typed, `domNotation` reads the drawn block back into the
 * notation. Placeholders keep their numbers, so the engine puts back every
 * original inline element (`span`, `a`, `ruby`…) with its tags and
 * attributes as written; the only new markup it can make is `strong`, `em`
 * and `br`. A placeholder the browser removed with its text (a whole link
 * deleted) is put back, empty, where the caret is: its tags and its `id`
 * stay in the book.
 *
 * Offsets are plain-text offsets as the engine counts them: the text of the
 * block with ruby readings, without line breaks and without the content of
 * opaque elements (svg, math…).
 */
import type { ChapterBlock, XmlElement, XmlNode } from '@genoffice/epub-engine'
import { OPAQUE_ELEMENTS, escapeNotationText } from './engine'

export type InlineRole =
  | { kind: 'br' }
  | { kind: 'mark'; mark: 'b' | 'i' }
  /** a placeholder: `empty` is written `<xN/>`, `opaque` content is not block text */
  | { kind: 'x'; n: number; empty: boolean; opaque: boolean }

export interface RoleNode {
  role: InlineRole
  el: XmlElement
  children: RoleNode[]
}

export interface PlaceholderInfo {
  n: number
  empty: boolean
}

export interface RoleTree {
  nodes: RoleNode[]
  placeholders: PlaceholderInfo[]
  /** the block holds a CDATA section (the drawing copy does not carry it as text) */
  cdata: boolean
}

/** Drawn element → its role. Elements the browser made have none. */
export type RoleMap = Map<Element, InlineRole>

const BOLD = new Set(['strong', 'b'])
const ITALIC = new Set(['em', 'i'])

function hasContent(el: XmlElement): boolean {
  return el.children.some((c) => c.type === 'text' || c.type === 'element')
}

/** The roles of a block's inline elements, numbered as the engine numbers its placeholders. */
export function inlineRoleTree(block: ChapterBlock): RoleTree {
  const placeholders: PlaceholderInfo[] = []
  let cdata = false
  const walk = (children: readonly XmlNode[]): RoleNode[] => {
    const out: RoleNode[] = []
    for (const node of children) {
      if (node.type === 'text') {
        if (node.cdata) cdata = true
        continue
      }
      if (node.type !== 'element') continue
      const plain = node.attributes.length === 0
      if (plain && node.local === 'br' && !hasContent(node)) {
        out.push({ role: { kind: 'br' }, el: node, children: [] })
        continue
      }
      const opaque = OPAQUE_ELEMENTS.has(node.local)
      const empty = opaque || !hasContent(node)
      if (!empty && plain && (BOLD.has(node.local) || ITALIC.has(node.local))) {
        const mark = BOLD.has(node.local) ? 'b' : 'i'
        out.push({ role: { kind: 'mark', mark }, el: node, children: walk(node.children) })
        continue
      }
      const n = placeholders.length + 1
      placeholders.push({ n, empty })
      out.push({
        role: { kind: 'x', n, empty, opaque },
        el: node,
        children: empty ? [] : walk(node.children),
      })
    }
    return out
  }
  const nodes = walk(block.element.children)
  return { nodes, placeholders, cdata }
}

function sameName(dom: Element, xml: XmlElement): boolean {
  const name = dom.localName.toLowerCase()
  return name === xml.local.toLowerCase() || name === xml.name.toLowerCase()
}

/**
 * Lays the role tree over the drawn block. False when the drawn elements do
 * not follow the source one for one (the copy was cleaned or re-nested
 * there): such a block is not edited.
 */
export function pairRoles(nodes: readonly RoleNode[], dom: Element, roles: RoleMap): boolean {
  const kids = Array.from(dom.children)
  if (kids.length !== nodes.length) return false
  for (let i = 0; i < kids.length; i++) {
    const el = kids[i]!
    const node = nodes[i]!
    if (!sameName(el, node.el)) return false
    roles.set(el, node.role)
    const descend = node.role.kind === 'mark' || (node.role.kind === 'x' && !node.role.empty)
    if (descend && !pairRoles(node.children, el, roles)) return false
  }
  return true
}

/** The content of an opaque placeholder is not block text. */
function opaque(el: Element, roles: RoleMap): boolean {
  const role = roles.get(el)
  return role?.kind === 'x' && role.opaque
}

const TEXT_NODE = 3
const ELEMENT_NODE = 1

/** The plain text of a drawn block, counted as the engine counts it. */
export function domPlainText(block: Element, roles: RoleMap): string {
  let out = ''
  const visit = (node: Node): void => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === TEXT_NODE) out += (child as Text).data
      else if (child.nodeType === ELEMENT_NODE && !opaque(child as Element, roles)) visit(child)
    }
  }
  visit(block)
  return out
}

/** The plain-text offset of a boundary point (`node`, `offset`) inside a drawn block. */
export function offsetAt(block: Element, roles: RoleMap, node: Node, offset: number): number {
  if (node !== block && !block.contains(node)) return 0
  let count = 0
  // true once the point is reached
  const walk = (parent: Node): boolean => {
    let index = 0
    for (let child = parent.firstChild; child; child = child.nextSibling, index++) {
      if (parent === node && index === offset) return true
      if (child.nodeType === TEXT_NODE) {
        const len = (child as Text).data.length
        if (child === node) {
          count += Math.min(offset, len)
          return true
        }
        count += len
      } else if (child.nodeType === ELEMENT_NODE) {
        const skipped = opaque(child as Element, roles)
        if (child.contains(node)) return skipped || walk(child)
        if (!skipped) walk(child)
      }
    }
    return parent === node
  }
  walk(block)
  return count
}

/**
 * The boundary point `offset` plain characters into a drawn block. With
 * `after`, a point after a line break or element edge is preferred to one
 * before it (the caret after Shift+Enter).
 */
export function pointAt(
  block: Element,
  roles: RoleMap,
  offset: number,
  after = false,
): { node: Node; offset: number } {
  let count = 0
  let candidate: { node: Node; offset: number } | null = null
  let result: { node: Node; offset: number } | null = null
  const visit = (parent: Node): void => {
    for (let child = parent.firstChild; child && !result; child = child.nextSibling) {
      if (child.nodeType === TEXT_NODE) {
        const len = (child as Text).data.length
        if (!after && offset <= count + len) {
          result = { node: child, offset: offset - count }
          return
        }
        if (after && offset < count + len) {
          result = { node: child, offset: offset - count }
          return
        }
        if (after && offset === count + len) candidate = { node: child, offset: len }
        count += len
      } else if (child.nodeType === ELEMENT_NODE) {
        const el = child as Element
        if (opaque(el, roles)) continue
        if (el.localName.toLowerCase() === 'br') {
          if (after && count === offset) {
            const index = Array.prototype.indexOf.call(parent.childNodes, child) as number
            candidate = { node: parent, offset: index + 1 }
          }
          continue
        }
        visit(el)
      }
    }
  }
  visit(block)
  return result ?? candidate ?? { node: block, offset: block.childNodes.length }
}

/** A `br` the browser added at the very end of a block to hold an empty line. */
function trailingFiller(el: Element, block: Element): boolean {
  let node: Node | null = el
  while (node && node !== block) {
    for (let next = node.nextSibling; next; next = next.nextSibling) {
      if (next.nodeType === TEXT_NODE ? (next as Text).data !== '' : next.nodeType === ELEMENT_NODE)
        return false
    }
    node = node.parentNode
  }
  return true
}

export interface DomNotationOptions {
  /** where missing placeholders go back (the caret); the block's end when null */
  caret?: { node: Node; offset: number } | null
  /** the block had no no-break space: the ones the browser typed for spaces become spaces */
  nbspToSpace?: boolean
}

/** The drawn block, read back into the block notation the engine decodes. */
export function domNotation(
  block: Element,
  roles: RoleMap,
  placeholders: readonly PlaceholderInfo[],
  options: DomNotationOptions = {},
): string {
  const caret = options.caret && block.contains(options.caret.node) ? options.caret : null
  const present = new Set<number>()
  const collect = (parent: Element): void => {
    for (const el of Array.from(parent.children)) {
      const role = roles.get(el)
      if (role?.kind === 'x') {
        present.add(role.n)
        if (role.opaque) continue
      }
      collect(el)
    }
  }
  collect(block)
  const missing = placeholders.filter((p) => !present.has(p.n))
  const text = (value: string): string =>
    escapeNotationText(options.nbspToSpace ? value.replace(/\u00a0/g, ' ') : value)

  let out = ''
  let missingDone = false
  const putMissing = (): void => {
    if (missingDone) return
    missingDone = true
    for (const p of missing) out += p.empty ? `<x${p.n}/>` : `<x${p.n}></x${p.n}>`
  }
  const emitted = new Set<number>()

  const visit = (parent: Node): void => {
    let index = 0
    for (let child = parent.firstChild; child; child = child.nextSibling, index++) {
      if (caret && caret.node === parent && caret.offset === index) putMissing()
      if (child.nodeType === TEXT_NODE) {
        const data = (child as Text).data
        if (caret && caret.node === child) {
          out += text(data.slice(0, caret.offset))
          putMissing()
          out += text(data.slice(caret.offset))
        } else {
          out += text(data)
        }
      } else if (child.nodeType === ELEMENT_NODE) {
        element(child as Element)
      }
    }
    if (caret && caret.node === parent && caret.offset >= index) putMissing()
  }

  const element = (el: Element): void => {
    const role = roles.get(el)
    if (role?.kind === 'br') {
      out += '<br/>'
      return
    }
    if (role?.kind === 'mark') {
      out += `<${role.mark}>`
      visit(el)
      out += `</${role.mark}>`
      return
    }
    if (role?.kind === 'x' && !emitted.has(role.n)) {
      emitted.add(role.n)
      if (role.empty) {
        out += `<x${role.n}/>`
        // text typed into an empty element follows it
        if (!role.opaque) visit(el)
        return
      }
      out += `<x${role.n}>`
      visit(el)
      out += `</x${role.n}>`
      return
    }
    // made by the browser (or a copy of an element already written)
    const name = el.localName.toLowerCase()
    if (name === 'br') {
      if (!trailingFiller(el, block)) out += '<br/>'
      return
    }
    if (BOLD.has(name) || ITALIC.has(name)) {
      const mark = BOLD.has(name) ? 'b' : 'i'
      out += `<${mark}>`
      visit(el)
      out += `</${mark}>`
      return
    }
    visit(el)
  }

  visit(block)
  putMissing()
  return out
}
