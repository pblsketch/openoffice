/**
 * The slides op stream on the wire (co-editing, decision 0073). A transaction
 * the executor applied here is rewritten so another PC's executor applies it
 * to the same slides and elements:
 *
 * - Slides go by their durable id ("s_<n>", from the part path), stamped on
 *   each record at apply time, never by index.
 * - Elements go by the cNvPr form ("e_<cNvPr id>"). Parse-time ids come from a
 *   per-process counter and durable GUIDs are minted at random whenever an
 *   element's bytes are rewritten, so neither names the same element on two
 *   PCs. The cNvPr id lives in the bytes, new elements take the next free one
 *   alike everywhere, and the executor already resolves it as an element ref.
 *
 * Section ops cannot travel (sections get random ids) and refs that would
 * resolve to another element (a duplicate cNvPr id ahead of the target) make
 * the whole transaction unshareable; the caller then re-bases or resyncs.
 */
import {
  elementCNvPrId,
  elementDurableId,
  ensureBuiltinLayout,
  groupChildDurableId,
  matchesElementRef,
  parseMasterPart,
  slideDurableId,
  type OpenedPptx,
  type SlideElement,
} from '@genoffice/pptx-engine'
import type { Op, OpRecord } from '@genoffice/pptx-ops'
import { DECK_KEY, type SlidesWireOp, type SlidesWireSource } from '../shared/collab'

interface Spot {
  slideId: string
  /** "e_<cNvPr id>", null for an element without one */
  ref: string | null
  /** an element earlier in the same list answers to the same ref */
  shadowed: boolean
  /** the element's own durable id, for refs that name it that way */
  durable: string | null
}

/** every element of the deck (group children included) by parse-time id */
export type ElementIndex = Map<string, Spot>

const CNVPR_REF = /^e_\d+$/

export const SECTION_OPS = new Set([
  'setSections',
  'addSection',
  'renameSection',
  'removeSection',
  'moveSection',
])

/** ops that change one element's content or geometry, keyed by the elements they name */
const ELEMENT_OPS = new Set([
  'setTransform',
  'setConnectorEndpoints',
  'flipElements',
  'setPictureSrcRect',
  'setRedaction',
  'setPictureOpacity',
  'setShapeGeometry',
  'setShapeAdjust',
  'setShapeCustomGeometry',
  'setTextAnchor',
  'setTextBodyProps',
  'setEffects',
  'setLink',
  'setImageFill',
  'setFill',
  'setStroke',
  'setText',
  'setFont',
  'setParagraphFormat',
  'setTableCell',
  'tableMerge',
  'tableStructure',
  'setTableRowHeight',
  'setTableCellAnchor',
  'setTableColWidth',
  'setTableStyle',
  'setChart',
  'replacePicture',
  'setModel3dView',
  'alignElements',
  'distributeElements',
])

/** ops that change a slide's element list or its timeline: new ids depend on their order */
const LIST_OPS = new Set([
  'deleteElement',
  'groupElements',
  'ungroupElement',
  'reorderElement',
  'addElement',
  'addPicture',
  'addTable',
  'addChart',
  'addSmartArt',
  'addMedia',
  'addModel3d',
  'pasteElements',
  'addConnector',
  'setAnimations',
  'addAnimation',
  'removeAnimation',
  'reorderAnimation',
  'clearNarration',
])

/** slide-wide edits that may rewrite any element on the slide */
const BROAD_OPS = new Set(['setBackground', 'setSlideLayout'])
const NOTE_OPS = new Set(['setNotes', 'addComment', 'deleteComment'])
const PROP_OPS = new Set(['setHidden', 'setTransition', 'setAdvanceTime'])

export function indexElements(opened: OpenedPptx): ElementIndex {
  const out: ElementIndex = new Map()
  for (const slide of opened.deck.slides) {
    const slideId = slideDurableId(slide)
    const walk = (list: SlideElement[], group: SlideElement | null): void => {
      const seen = new Set<string>()
      for (const el of list) {
        const ref = elementCNvPrId(el)
        out.set(el.id, {
          slideId,
          ref,
          shadowed: ref !== null && seen.has(ref),
          durable: group ? groupChildDurableId(group, el) : elementDurableId(el),
        })
        if (ref) seen.add(ref)
        if (el.type === 'group') walk(el.children, el)
      }
    }
    walk(slide.elements, null)
  }
  return out
}

/** plain data only: what lib0's writeAny (the session's wire format) carries intact */
export function isWireSafe(value: unknown, depth = 0): boolean {
  if (depth > 64) return false
  if (value === null || value === undefined) return true
  const kind = typeof value
  if (kind === 'string' || kind === 'boolean') return true
  if (kind === 'number') return true
  if (kind !== 'object') return false
  if (value instanceof Uint8Array) return true
  if (Array.isArray(value)) return value.every((item) => isWireSafe(item, depth + 1))
  const proto = Object.getPrototypeOf(value) as unknown
  if (proto !== Object.prototype && proto !== null) return false
  return Object.values(value as Record<string, unknown>).every((item) =>
    isWireSafe(item, depth + 1),
  )
}

/**
 * Rewrite an applied transaction for the wire. `pre` is the element index
 * taken before the transaction ran (deleted elements are only found there),
 * `opened` the deck after it. Null when it cannot be shared as ops.
 */
export function toWireOp(
  records: OpRecord[],
  source: SlidesWireSource,
  pre: ElementIndex,
  opened: OpenedPptx,
  builtinLayouts?: ReadonlyMap<string, string>,
): SlidesWireOp | null {
  let post: ElementIndex | null = null
  const postIndex = (): ElementIndex => (post ??= indexElements(opened))
  const parts = new Map<string, SlideElement[]>()

  const elementRef = (raw: unknown, slideId?: string): string | null => {
    if (typeof raw !== 'string' || !raw) return null
    const spot = postIndex().get(raw) ?? pre.get(raw)
    if (spot) return spot.shadowed ? null : spot.ref
    if (CNVPR_REF.test(raw)) return raw
    // a durable GUID ref: find the element it names, then send its cNvPr form
    for (const index of [postIndex(), pre]) {
      for (const s of index.values()) {
        if (s.durable === raw && (!slideId || s.slideId === slideId)) {
          return s.shadowed ? null : s.ref
        }
      }
    }
    return null
  }

  const partRef = (part: string, raw: string): string | null => {
    if (CNVPR_REF.test(raw)) return raw
    let elements = parts.get(part)
    if (!elements) {
      elements = parseMasterPart(opened.archive, part)?.elements ?? []
      parts.set(part, elements)
    }
    const el = elements.find((x) => matchesElementRef(x, raw))
    return el ? elementCNvPrId(el) : null
  }

  const ops: Op[] = []
  const keys = new Set<string>()
  const layouts: Array<[string, string]> = []
  for (const rec of records) {
    const op = rec.op
    if (SECTION_OPS.has(op.op)) return null
    const slideId = rec.slideId
    const out: Op = { ...op }
    const named: string[] = []
    const ref = (raw: unknown): string | null => {
      const r = elementRef(raw, slideId)
      if (r) named.push(r)
      return r
    }
    if (op.target) {
      const target = { ...op.target }
      if (target.slide !== undefined && slideId) target.slide = slideId
      if (target.el !== undefined) {
        const r = target.part ? partRef(target.part, String(target.el)) : ref(target.el)
        if (!r) return null
        target.el = r
      }
      out.target = target
    }
    if (op.group !== undefined) {
      const r = ref(op.group)
      if (!r) return null
      out.group = r
    }
    if (Array.isArray(op.els)) {
      const els = op.els.map((id) => ref(id))
      if (els.some((r) => !r)) return null
      out.els = els
    }
    if (op.op === 'addConnector') {
      for (const field of ['from', 'to'] as const) {
        const r = ref(op[field])
        if (!r) return null
        out[field] = r
      }
    }
    if (op.op === 'setConnectorEndpoints') {
      for (const field of ['start', 'end'] as const) {
        const end = op[field] as { targetId?: unknown } | null | undefined
        if (!end) continue
        const r = ref(end.targetId)
        if (!r) return null
        out[field] = { ...end, targetId: r }
      }
    }
    if (op.op === 'setAnimations' && Array.isArray(op.items)) {
      const items: unknown[] = []
      for (const item of op.items as Array<Record<string, unknown>>) {
        const r = ref(item.sourceId)
        if (!r) return null
        items.push({ ...item, sourceId: r })
      }
      out.items = items
    }
    if (op.op === 'findReplace' && op.elementId !== undefined) {
      // the engine matches this one by parse-time id only: carry the slide along
      const spot = postIndex().get(String(op.elementId)) ?? pre.get(String(op.elementId))
      if (!spot?.ref || spot.shadowed) return null
      out.elementId = `${spot.slideId}#${spot.ref}`
    }
    if (typeof op.layoutPath === 'string') {
      const key = builtinLayouts?.get(op.layoutPath)
      if (key) layouts.push([op.layoutPath, key])
    }
    ops.push(out)
    for (const key of keysOf(out, slideId, named)) keys.add(key)
  }
  if (!isWireSafe(ops)) return null
  return {
    source,
    ops,
    ...(layouts.length ? { layouts } : {}),
    check: createdCheck(records, opened, postIndex()),
    keys: [...keys],
  }
}

function keysOf(op: Op, slideId: string | undefined, named: string[]): string[] {
  if (op.target?.part) return [DECK_KEY]
  const slide = slideId ?? (typeof op.target?.slide === 'string' ? op.target.slide : undefined)
  if (!slide) return [DECK_KEY]
  const elementKeys = named.map((ref) => `e|${slide}|${ref}`)
  if (op.op === 'insertEquation' && op.box !== undefined) return [`s|${slide}`]
  if (ELEMENT_OPS.has(op.op) || op.op === 'insertEquation') {
    return elementKeys.length ? elementKeys : [`s|${slide}`]
  }
  if (LIST_OPS.has(op.op)) return [`s|${slide}`, ...elementKeys]
  if (BROAD_OPS.has(op.op)) return [`b|${slide}`]
  if (NOTE_OPS.has(op.op)) return [`n|${slide}`]
  if (PROP_OPS.has(op.op)) return [`t|${slide}`]
  return [DECK_KEY]
}

/**
 * The slides and elements a transaction created, as "s_<n>" and
 * "s_<n>/e_<cNvPr id>". Two peers that apply the same transaction to the same
 * deck get the same string; a different one means they numbered something
 * differently and one of them starts over from the host's bytes.
 */
export function createdCheck(
  records: OpRecord[],
  opened: OpenedPptx,
  index: ElementIndex = indexElements(opened),
): string {
  const out: string[] = []
  for (const rec of records) {
    for (const id of rec.created ?? []) {
      if (id.startsWith('s_')) {
        out.push(id)
        continue
      }
      const spot = index.get(id)
      out.push(spot ? `${spot.slideId}/${spot.ref ?? '?'}` : '?')
    }
  }
  return out.join(',')
}

/**
 * Turn a wire op back into ops this deck's executor applies: inject the
 * built-in layouts it needs (at whatever path this package gives them) and
 * resolve the refs the engine only matches by parse-time id. Null when a
 * layout cannot be injected.
 */
export function fromWireOp(wire: SlidesWireOp, opened: OpenedPptx): Op[] | null {
  const moved = new Map<string, string>()
  for (const [path, key] of wire.layouts ?? []) {
    const local = ensureBuiltinLayout(opened.archive, opened.deck.size, key)
    if (!local) return null
    if (local !== path) moved.set(path, local)
  }
  return wire.ops.map((raw) => {
    let op = raw
    if (typeof op.layoutPath === 'string' && moved.has(op.layoutPath)) {
      op = { ...op, layoutPath: moved.get(op.layoutPath) }
    }
    if (op.op === 'findReplace' && typeof op.elementId === 'string' && op.elementId.includes('#')) {
      const [slideId, ref] = op.elementId.split('#') as [string, string]
      const slide = opened.deck.slides.find((s) => slideDurableId(s) === slideId)
      const el = slide?.elements.find((x) => matchesElementRef(x, ref))
      // unresolved: the op reports "not found" and the caller resyncs
      op = { ...op, elementId: el?.id ?? ref }
    }
    return op
  })
}
