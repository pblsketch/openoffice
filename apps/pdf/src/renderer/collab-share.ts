/**
 * The PDF editor's shared state in a co-editing session (decision 0073).
 * Every pending edit already lives in the EditSnapshot buckets; during a
 * session each bucket is mirrored into a Y.Map keyed by item id (field name,
 * widget id or page for the keyed buckets), so peers exchange whole items and
 * the last writer of an item wins. Nothing here touches the file: the host's
 * normal save writes what its buckets hold, as it would without a session.
 *
 * - A value travels as {e, r, v}: the file epoch it is addressed in (a host
 *   save renumbers pages and objects), a rank that keeps lists in the same
 *   order on every peer, and the item itself.
 * - A host save starts a new epoch. Guests reload the saved file and show only
 *   items of the epoch they are on; the host re-tags what is still pending and
 *   carries what a guest did before it saw the save into the new file's pages.
 *   Page-keyed buckets (turns, deletions, order) carry the epoch in their keys,
 *   so even a late removal names the page it meant.
 * - Undo is per person: a step remembers the values it wrote and takes back
 *   only those still in place, so nobody else's edit is ever undone.
 */
import type { Doc, Map as YMap, Transaction } from 'yjs'
import type { Bucket } from './edit-ops'
import type { EditSnapshot, SavedSnapshot } from './edit-state'

export interface Env {
  /** the file epoch the value is addressed in */
  e: number
  /** list buckets: position among the bucket's items */
  r?: number
  v: unknown
}

type Kind = 'list' | 'keyed' | 'rotations' | 'deleted' | 'order' | 'single'

const KIND = {
  markups: 'list',
  annotDeletes: 'list',
  noteEdits: 'list',
  drawings: 'list',
  textEdits: 'list',
  textInserts: 'list',
  imageEdits: 'list',
  stampCfg: 'single',
  formEdits: 'keyed',
  formFields: 'list',
  formWidgetEdits: 'keyed',
  blankPages: 'list',
  rotations: 'rotations',
  deleted: 'deleted',
  order: 'order',
  metadata: 'single',
} as const satisfies Record<Bucket, Kind>

/** every bucket, blank pages before the page order that lists them */
export const SHARED_BUCKETS = Object.keys(KIND) as Bucket[]

const SINGLE_KEY = 'value'
const HISTORY_DEPTH = 50

const isPaged = (bucket: Bucket) =>
  KIND[bucket] === 'rotations' || KIND[bucket] === 'deleted' || KIND[bucket] === 'order'

/** a page-keyed bucket's key: `<epoch>:<page>`, or `<epoch>:order` */
const pagedKey = (bucket: Bucket, epoch: number, page?: number) =>
  `${epoch}:${KIND[bucket] === 'order' ? 'order' : page}`

/** the epoch and page a page-keyed bucket's key names; null for a key it does not use */
function parseKey(bucket: Bucket, key: string): { epoch: number; page: number } | null {
  const m = /^(\d+):(\d+|order)$/.exec(key)
  if (!m || (m[2] === 'order') !== (KIND[bucket] === 'order')) return null
  return { epoch: Number(m[1]), page: m[2] === 'order' ? -1 : Number(m[2]) }
}

/** our own writes: already in the buckets, not to be applied again */
export const LOCAL_ORIGIN = Symbol('pdf-collab-local')
const SYNC_ORIGIN = Symbol('pdf-collab-sync')
const UNDO_ORIGIN = Symbol('pdf-collab-undo')
const FIXUP_ORIGIN = Symbol('pdf-collab-fixup')

type Item = { id: string } & Record<string, unknown>
type Patch = Map<string, { r?: number; v: unknown } | null>

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'
const isPage = (p: unknown): p is number => typeof p === 'number' && Number.isInteger(p) && p >= 0

/** the page an item of a list bucket sits on */
export function pageOf(bucket: Bucket, v: unknown): unknown {
  if (!isObject(v)) return undefined
  if (bucket === 'markups') return v.pageIndex
  if (bucket === 'annotDeletes' || bucket === 'noteEdits')
    return (v.annot as Item | undefined)?.pageIndex
  return (v.input as Item | undefined)?.pageIndex
}

function withPage(bucket: Bucket, v: Item, page: number): Item {
  if (bucket === 'markups') return { ...v, pageIndex: page }
  const field = bucket === 'annotDeletes' || bucket === 'noteEdits' ? 'annot' : 'input'
  return { ...v, [field]: { ...(v[field] as Item), pageIndex: page } }
}

/** an item moved through a page map; undefined when its page is gone */
export function remapItem(
  bucket: Bucket,
  v: unknown,
  map: (page: number) => number | undefined,
): unknown {
  const page = pageOf(bucket, v)
  if (!isPage(page)) return undefined
  const next = map(page)
  if (next === undefined) return undefined
  return next === page ? v : withPage(bucket, v as Item, next)
}

/** what another peer sent is something this bucket can hold (a broken value is ignored) */
export function acceptable(bucket: Bucket, key: string, v: unknown): boolean {
  switch (KIND[bucket]) {
    case 'list':
      return isObject(v) && v.id === key && isPage(pageOf(bucket, v))
    case 'keyed':
      return isObject(v) && (bucket === 'formEdits' ? v.name : v.widgetId) === key
    case 'rotations':
      return !!parseKey(bucket, key) && (v === 90 || v === 180 || v === 270)
    case 'deleted':
      return !!parseKey(bucket, key) && v === true
    case 'order':
      return !!parseKey(bucket, key) && Array.isArray(v) && v.every(isPage)
    case 'single':
      return isObject(v)
  }
}

/** a bucket's value as key → value, page keys in `epoch` */
export function entriesOf(bucket: Bucket, value: unknown, epoch: number): Map<string, unknown> {
  switch (KIND[bucket]) {
    case 'list':
      return new Map((value as Item[]).map((item) => [item.id, item]))
    case 'keyed':
      return new Map(value as Map<string, unknown>)
    case 'rotations':
      return new Map(
        [...(value as Map<number, number>)].map(([p, d]) => [pagedKey(bucket, epoch, p), d]),
      )
    case 'deleted':
      return new Map([...(value as Set<number>)].map((p) => [pagedKey(bucket, epoch, p), true]))
    case 'order':
      return value === null ? new Map() : new Map([[pagedKey(bucket, epoch), value]])
    case 'single':
      return value === null ? new Map() : new Map([[SINGLE_KEY, value]])
  }
}

function emptyOf(bucket: Bucket): unknown {
  switch (KIND[bucket]) {
    case 'list':
      return []
    case 'keyed':
    case 'rotations':
      return new Map()
    case 'deleted':
      return new Set()
    case 'order':
    case 'single':
      return null
  }
}

/** list order: by rank, then key, the same on every peer */
const sortsAfter = (rank: number, key: string, otherRank: number, otherKey: string) =>
  rank > otherRank || (rank === otherRank && key > otherKey)

/** a bucket with some keys replaced (null removes one); new list items go in by rank */
export function patchBucket(
  bucket: Bucket,
  prev: unknown,
  patch: Patch,
  rankOf: (key: string) => number,
): unknown {
  if (patch.size === 0) return prev
  switch (KIND[bucket]) {
    case 'list': {
      const list = prev as Item[]
      const had = new Set(list.map((item) => item.id))
      const out: Item[] = []
      for (const item of list) {
        const change = patch.get(item.id)
        if (change === undefined) out.push(item)
        else if (change !== null) out.push(change.v as Item)
      }
      for (const [key, change] of patch) {
        if (change === null || had.has(key)) continue
        const rank = change.r ?? Infinity
        let at = out.length
        while (at > 0 && sortsAfter(rankOf(out[at - 1]!.id), out[at - 1]!.id, rank, key)) at--
        out.splice(at, 0, change.v as Item)
      }
      return out
    }
    case 'keyed': {
      const next = new Map(prev as Map<string, unknown>)
      for (const [key, change] of patch) {
        if (change) next.set(key, change.v)
        else next.delete(key)
      }
      return next
    }
    case 'rotations': {
      const next = new Map(prev as Map<number, number>)
      for (const [key, change] of patch) {
        const page = parseKey(bucket, key)?.page
        if (page === undefined) continue
        if (change) next.set(page, change.v as number)
        else next.delete(page)
      }
      return next
    }
    case 'deleted': {
      const next = new Set(prev as Set<number>)
      for (const [key, change] of patch) {
        const page = parseKey(bucket, key)?.page
        if (page === undefined) continue
        if (change) next.add(page)
        else next.delete(page)
      }
      return next
    }
    case 'order': {
      // one key per epoch, and only this epoch's reaches a patch
      const [change] = [...patch.values()]
      return change === undefined ? prev : change === null ? null : change.v
    }
    case 'single': {
      const change = patch.get(SINGLE_KEY)
      return change === undefined ? prev : change === null ? null : change.v
    }
  }
}

/** every page index the document has now: the file's pages and the pending blank ones */
export function existingPages(snapshot: EditSnapshot, realPages: number): number[] {
  const pages = new Set<number>()
  for (let p = 0; p < realPages; p++) pages.add(p)
  for (const blank of snapshot.blankPages) pages.add(blank.input.pageIndex)
  return [...pages].sort((a, b) => a - b)
}

/**
 * A page order every page is in exactly once. Two people reordering and
 * adding pages at the same time can leave one order without the other's new
 * page, or with a page that is gone; the save needs a complete one.
 */
export function normalizeOrder(order: number[] | null, pages: number[]): number[] | null {
  if (!order) return order
  const exists = new Set(pages)
  const seen = new Set<number>()
  const out: number[] = []
  for (const p of order) {
    if (exists.has(p) && !seen.has(p)) {
      seen.add(p)
      out.push(p)
    }
  }
  for (const p of pages) if (!seen.has(p)) out.push(p)
  return out.length === order.length && out.every((p, i) => p === order[i]) ? order : out
}

/**
 * Pending blank pages numbered right after the file's pages again. A blank
 * page one person inserted and then undid leaves a gap, and two inserted at
 * the same moment share a number; the save refuses either. Everything on a
 * renumbered page moves with it. Null when the numbering is already right.
 */
export function repairBlankPages(
  snapshot: EditSnapshot,
  realPages: number,
): Partial<EditSnapshot> | null {
  const sorted = [...snapshot.blankPages].sort((a, b) => a.input.pageIndex - b.input.pageIndex)
  if (sorted.every((b, k) => b.input.pageIndex === realPages + k)) return null
  const byId = new Map<string, number>()
  const pageMap = new Map<number, number>()
  sorted.forEach((b, k) => {
    byId.set(b.id, realPages + k)
    if (!pageMap.has(b.input.pageIndex)) pageMap.set(b.input.pageIndex, realPages + k)
  })
  const map = (p: number) => (p < realPages ? p : (pageMap.get(p) ?? p))
  const out: Partial<EditSnapshot> = {
    blankPages: snapshot.blankPages.map((b) => {
      const pageIndex = byId.get(b.id)!
      return pageIndex === b.input.pageIndex ? b : { ...b, input: { ...b.input, pageIndex } }
    }),
  }
  const lists = SHARED_BUCKETS.filter((b) => KIND[b] === 'list' && b !== 'blankPages')
  for (const bucket of lists) {
    const items = snapshot[bucket] as unknown as Item[]
    const moved = items.map((item) => (remapItem(bucket, item, map) ?? item) as Item)
    if (moved.some((item, i) => item !== items[i])) Object.assign(out, { [bucket]: moved })
  }
  out.rotations = new Map([...snapshot.rotations].map(([p, d]) => [map(p), d]))
  out.deleted = new Set([...snapshot.deleted].map(map))
  out.order = snapshot.order ? snapshot.order.map(map) : null
  return out
}

/** the item keys a save wrote, per list bucket */
function savedKeysOf(saved: SavedSnapshot): Set<string> {
  const ids: Array<[Bucket, Set<string>]> = [
    ['markups', saved.markupIds],
    ['annotDeletes', saved.annotDeleteIds],
    ['noteEdits', saved.noteEditIds],
    ['drawings', saved.drawingIds],
    ['textEdits', saved.textEditIds],
    ['textInserts', saved.textInsertIds],
    ['imageEdits', saved.imageEditIds],
    ['formFields', saved.formFieldIds],
    ['blankPages', saved.blankPageIds],
  ]
  return new Set(ids.flatMap(([bucket, set]) => [...set].map((id) => `${bucket}:${id}`)))
}

/**
 * A guest's reload after the host saved: the post-save reload of the editor
 * subtracts what it is told the save wrote, which for a guest is everything
 * it has pending (the host saved the same state); the shared state then
 * says what is still pending.
 */
export function savedSnapshotOf(
  snapshot: EditSnapshot,
  pageMap: Map<number, number>,
): SavedSnapshot {
  const ids = (items: Array<{ id: string }>) => new Set(items.map((item) => item.id))
  return {
    markupIds: ids(snapshot.markups),
    annotDeleteIds: ids(snapshot.annotDeletes),
    noteEditIds: ids(snapshot.noteEdits),
    noteEditWritten: new Map(snapshot.noteEdits.map((e) => [e.annot.objNum, e.contents])),
    drawingIds: ids(snapshot.drawings),
    textEditIds: ids(snapshot.textEdits),
    textInsertIds: ids(snapshot.textInserts),
    imageEditIds: ids(snapshot.imageEdits),
    stampCfg: snapshot.stampCfg,
    formEdits: snapshot.formEdits,
    formFieldIds: ids(snapshot.formFields),
    formWidgetEdits: snapshot.formWidgetEdits,
    blankPageIds: ids(snapshot.blankPages),
    rotations: snapshot.rotations,
    metadata: snapshot.metadata,
    pageMap,
  }
}

function envOf(raw: unknown): Env | undefined {
  return isObject(raw) && typeof raw.e === 'number' && 'v' in raw
    ? (raw as unknown as Env)
    : undefined
}

/** the editor as the shared state sees it */
export interface ShareHost {
  read(): EditSnapshot
  /** set a bucket without an undo step or any other side effect */
  write<K extends Bucket>(bucket: K, fn: (prev: EditSnapshot[K]) => EditSnapshot[K]): void
  /** pages in the open file; pending blank pages are numbered after them */
  realPages(): number
}

/** what one host save did, for edits made before a guest saw it */
interface SaveRecord {
  /** previous epoch's page → page in the saved file */
  pageMap: Map<number, number>
  /** `<bucket>:<id>` of the items it wrote */
  keys: Set<string>
  /** turns it baked into pages, by previous epoch's page */
  rotations: Map<number, number>
  /** note contents it wrote, by object number */
  notes: Map<number, string>
}

/** a guest's way to show a newer saved file */
export interface FollowSteps {
  /** write the file into this copy; false when that failed */
  replace(): Promise<boolean>
  /** the editor's post-save reload, subtracting `saved` */
  reload(saved: SavedSnapshot): Promise<void>
}

interface Change {
  bucket: Bucket
  key: string
  before: Env | undefined
  after: Env | undefined
}

export class EditShare {
  private readonly maps = new Map<Bucket, YMap<unknown>>()
  private readonly bucketOf = new Map<unknown, Bucket>()
  /** what the buckets hold, as last written to or read from the shared state */
  private readonly baseline = new Map<Bucket, Map<string, Env>>()
  /** bucket values the last diff looked at */
  private readonly seen = new Map<Bucket, unknown>()
  private readonly meta: YMap<unknown>
  private clock = 0
  private epochNow = 0
  /** host: the newest saved file announced to guests */
  private announced = 0
  /** guest: the newest saved file on its way into this copy */
  private waitingFor = 0
  /** guest: loading a newer file (it reads everything after); host: reloading its save (changes wait) */
  private reloading = false
  /** host: saved and reloaded, until the editor has rendered the reload */
  private settling = false
  private retag = false
  /** host: per epoch, what the save that started it did to the previous epoch's pages and items */
  private readonly saves = new Map<number, SaveRecord>()
  /** host: pages a guest added before it saw the last save, `<epoch>:<page>` → page now */
  private readonly latePages = new Map<string, number>()
  /** host: late blank pages numbered in the carry under way */
  private lateAdded = 0
  /** host: changes that came in while it was reloading its own save */
  private deferred: Array<[Bucket, string]> = []
  private undoStack: Change[][] = []
  private redoStack: Change[][] = []
  private lastCoalesce: string | null = null
  private ended = false

  constructor(
    private readonly doc: Doc,
    readonly role: 'host' | 'guest',
    private readonly host: ShareHost,
    private readonly onHistory: () => void = () => {},
  ) {
    for (const bucket of SHARED_BUCKETS) {
      const map = doc.getMap<unknown>(`pdf.${bucket}`)
      this.maps.set(bucket, map)
      this.bucketOf.set(map, bucket)
      this.baseline.set(bucket, new Map())
    }
    this.meta = doc.getMap<unknown>('pdf.meta')
    doc.on('afterTransaction', this.onTransaction)
  }

  /** the file epoch this peer's edits are addressed in */
  get epoch(): number {
    return this.epochNow
  }

  /** host: the newest saved file guests are told about */
  get fileEpoch(): number {
    return this.announced
  }

  /** guest: the newest saved file this copy is loading or waiting for */
  get pending(): number {
    return this.waitingFor
  }

  get disposed(): boolean {
    return this.ended
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** host: put its pending edits into the shared state; guest: take the host's */
  start(): void {
    if (this.role === 'host') {
      this.doc.transact(() => this.meta.set('epoch', 0), SYNC_ORIGIN)
      this.sync()
      return
    }
    const epoch = this.meta.get('epoch')
    // the host saved since sharing: its file arrives next, the copy waits for it
    if (typeof epoch === 'number' && epoch > 0) this.reloading = true
    else this.pull()
  }

  /** this person changed the buckets: share it as one undo step */
  local(coalesceKey?: string): void {
    const changes = this.diff(LOCAL_ORIGIN)
    if (changes.length > 0) this.record(changes, coalesceKey)
  }

  /** share bucket changes that are not an edit of their own (a reload, a validation result) */
  sync(): void {
    if (this.reloading) return
    for (const change of this.diff(SYNC_ORIGIN)) this.rebase(change)
  }

  undo(): boolean {
    return this.step(this.undoStack, this.redoStack)
  }

  redo(): boolean {
    return this.step(this.redoStack, this.undoStack)
  }

  /**
   * Host: a save wrote the file; guests are told the next epoch. Others'
   * changes wait until the editor shows the reloaded file (`settle`): its
   * buckets are mid-reload until then.
   */
  announce(): number {
    this.announced = Math.max(this.announced, this.epochNow) + 1
    const epoch = this.announced
    this.reloading = true
    this.doc.transact(() => this.meta.set('epoch', epoch), SYNC_ORIGIN)
    return epoch
  }

  /** host: the post-save reload subtracted what the save wrote; edits are now addressed in the new file */
  saved(saved: SavedSnapshot): void {
    if (this.role !== 'host' || this.ended) return
    const epoch = Math.max(this.announced, this.epochNow + 1)
    this.announced = epoch
    this.epochNow = epoch
    this.saves.set(epoch, {
      pageMap: saved.pageMap,
      keys: savedKeysOf(saved),
      rotations: saved.rotations,
      notes: saved.noteEditWritten,
    })
    this.latePages.clear()
    this.reloading = true
    this.settling = true
    this.clearHistory()
  }

  /** host: the editor rendered its reload; what is pending moves to the new epoch, waiting changes come in */
  settle(): void {
    if (!this.settling || this.ended) return
    this.settling = false
    this.reloading = false
    this.retag = true
    const deferred = this.deferred
    this.deferred = []
    if (deferred.length > 0) this.apply(grouped(deferred))
  }

  /** guest: a newer saved file arrived; false when this copy already has it or a newer one */
  beginReload(epoch: number): boolean {
    if (this.role !== 'guest' || this.ended || epoch <= Math.max(this.epochNow, this.waitingFor)) {
      return false
    }
    this.waitingFor = epoch
    this.reloading = true
    return true
  }

  /**
   * Guest: show the file the host saved at `epoch`. The copy is rewritten,
   * the editor's post-save reload subtracts what this guest had pending (the
   * host saved that state), and the shared state of the new epoch comes in.
   */
  async follow(epoch: number, pageMap: Map<number, number>, steps: FollowSteps): Promise<void> {
    // a newer file is already queued behind this one
    if (this.ended || epoch < this.waitingFor) return
    if (!(await steps.replace())) throw new Error('the saved file could not be written to the copy')
    if (this.ended) return
    await steps.reload(savedSnapshotOf(this.host.read(), pageMap))
    this.endReload(epoch)
  }

  /** guest: the copy now shows the file of `epoch` */
  endReload(epoch: number): void {
    if (this.ended) return
    this.epochNow = Math.max(this.epochNow, epoch)
    if (this.epochNow < this.waitingFor) return
    this.reloading = false
    this.clearHistory()
    this.pull()
  }

  dispose(): void {
    this.ended = true
    this.doc.off('afterTransaction', this.onTransaction)
    this.undoStack = []
    this.redoStack = []
  }

  private readonly onTransaction = (tr: Transaction): void => {
    if (this.ended || tr.origin === LOCAL_ORIGIN || tr.origin === SYNC_ORIGIN) return
    const changed = new Map<Bucket, Set<string>>()
    tr.changed.forEach((keys, type) => {
      const bucket = this.bucketOf.get(type)
      if (!bucket) return
      const named = new Set<string>()
      keys.forEach((key) => {
        if (typeof key === 'string') named.add(key)
      })
      if (named.size > 0) changed.set(bucket, named)
    })
    if (changed.size === 0) return
    if (!this.reloading) this.apply(changed, tr.origin === FIXUP_ORIGIN)
    // a guest loading a newer file reads everything once it is shown
    else if (this.role === 'host') {
      for (const [bucket, keys] of changed)
        for (const key of keys) this.deferred.push([bucket, key])
    }
  }

  /** take changed values into the buckets; `fixup`: the host's own carrying of late edits */
  private apply(changed: Map<Bucket, Set<string>>, fixup = false): void {
    const late: Array<[Bucket, string, Env | undefined]> = []
    for (const bucket of SHARED_BUCKETS) {
      const keys = changed.get(bucket)
      if (!keys) continue
      const map = this.maps.get(bucket)!
      const base = this.baseline.get(bucket)!
      const patch: Patch = new Map()
      for (const key of keys) {
        const paged = isPaged(bucket) ? parseKey(bucket, key) : undefined
        if (paged === null) continue
        const env = envOf(map.get(key))
        const epoch = paged ? paged.epoch : env?.e
        if (epoch !== undefined && epoch !== this.epochNow) {
          if (this.role === 'host' && !fixup) {
            if (epoch < this.epochNow) late.push([bucket, key, env])
            else this.deferred.push([bucket, key])
          } else if (this.role === 'guest' && !paged) {
            // a guest shows nothing of another epoch: the host moves it into this one
            base.delete(key)
            patch.set(key, null)
          }
          continue
        }
        if (!env || env.e !== this.epochNow || !acceptable(bucket, key, env.v)) {
          base.delete(key)
          patch.set(key, null)
          continue
        }
        base.set(key, env)
        patch.set(key, { r: env.r, v: env.v })
        if (env.r !== undefined) this.clock = Math.max(this.clock, env.r)
      }
      this.writeBucket(bucket, patch)
    }
    this.normalize()
    if (late.length > 0) this.carryLate(late)
  }

  /** guest: the buckets become exactly the shared state of this epoch */
  private pull(): void {
    for (const bucket of SHARED_BUCKETS) {
      const base = this.baseline.get(bucket)!
      base.clear()
      const patch: Patch = new Map()
      this.maps.get(bucket)!.forEach((raw, key) => {
        const env = envOf(raw)
        if (!env || env.e !== this.epochNow || !acceptable(bucket, key, env.v)) return
        if (isPaged(bucket) && parseKey(bucket, key)?.epoch !== this.epochNow) return
        base.set(key, env)
        patch.set(key, { r: env.r, v: env.v })
        if (env.r !== undefined) this.clock = Math.max(this.clock, env.r)
      })
      const value = patchBucket(
        bucket,
        emptyOf(bucket),
        patch,
        (key) => base.get(key)?.r ?? Infinity,
      )
      this.host.write(bucket, () => value as never)
    }
    this.normalize()
  }

  private writeBucket(bucket: Bucket, patch: Patch): void {
    if (patch.size === 0) return
    const base = this.baseline.get(bucket)!
    this.host.write(
      bucket,
      (prev) => patchBucket(bucket, prev, patch, (key) => base.get(key)?.r ?? Infinity) as never,
    )
  }

  /**
   * After others' changes: the host renumbers blank pages that collided or
   * left a gap, and every peer completes a page order that lost or gained
   * pages. The host's next sync shares what it fixed; a guest only shows it.
   */
  private normalize(): void {
    const real = this.host.realPages()
    if (this.role === 'host') {
      const repaired = repairBlankPages(this.host.read(), real)
      if (repaired) {
        for (const [bucket, value] of Object.entries(repaired)) {
          this.host.write(bucket as Bucket, () => value as never)
        }
      }
    }
    const snapshot = this.host.read()
    const order = normalizeOrder(snapshot.order, existingPages(snapshot, real))
    if (order === snapshot.order) return
    this.host.write('order', () => order)
    if (this.role === 'guest') {
      const base = this.baseline.get('order')!
      const key = pagedKey('order', this.epochNow)
      const env = base.get(key)
      if (env) base.set(key, { ...env, v: order })
    }
  }

  /**
   * Host: what guests did before they saw the last save, moved into this
   * epoch's pages. A new page comes first, then what sits on it, then the
   * order that lists it. Only an item the save just wrote, or one on a page
   * the save removed, cannot follow.
   */
  private carryLate(late: Array<[Bucket, string, Env | undefined]>): void {
    if (this.ended) return
    const stage = (bucket: Bucket) => (bucket === 'blankPages' ? 0 : bucket === 'order' ? 2 : 1)
    const items = [...late].sort((a, b) => stage(a[0]) - stage(b[0]))
    this.lateAdded = 0
    this.doc.transact(() => {
      for (const [bucket, key, env] of items) {
        const map = this.maps.get(bucket)!
        // replaced since: that change is handled on its own
        if (map.get(key) !== env) continue
        if (isPaged(bucket)) this.carryPaged(bucket, key, env, map)
        else if (env) this.carryItem(bucket, key, env, map)
      }
    }, FIXUP_ORIGIN)
  }

  private carryItem(bucket: Bucket, key: string, env: Env, map: YMap<unknown>): void {
    const carried = this.carry(bucket, key, env)
    if (carried !== undefined) {
      map.set(key, { ...env, e: this.epochNow, v: carried })
      return
    }
    // it cannot follow: the shared state keeps what the host has, if anything
    const mine = entriesOf(bucket, this.host.read()[bucket], this.epochNow).get(key)
    const rank = this.baseline.get(bucket)!.get(key)?.r
    if (mine === undefined) map.delete(key)
    else if (rank === undefined) map.set(key, { e: this.epochNow, v: mine })
    else map.set(key, { e: this.epochNow, r: rank, v: mine })
  }

  /** a late turn, page deletion or order: its key names a page of the old file */
  private carryPaged(bucket: Bucket, key: string, env: Env | undefined, map: YMap<unknown>): void {
    const from = parseKey(bucket, key)!
    if (env) map.delete(key)
    if (env && !acceptable(bucket, key, env.v)) return
    if (KIND[bucket] === 'order') {
      const target = pagedKey(bucket, this.epochNow)
      if (!env) {
        map.delete(target)
        return
      }
      const order = (env.v as number[]).flatMap((p) => {
        const moved = this.carryPage(p, from.epoch)
        return moved ? [moved.page] : []
      })
      map.set(target, { e: this.epochNow, v: order })
      return
    }
    const moved = this.carryPage(from.page, from.epoch)
    if (!moved) return
    const target = pagedKey(bucket, this.epochNow, moved.page)
    if (KIND[bucket] === 'rotations') {
      // the turn the save baked in is part of the page now; a removed turn means none
      const turn = (env?.v as number | undefined) ?? 0
      const left = (((turn - moved.baked) % 360) + 360) % 360
      if (left === 0) map.delete(target)
      else map.set(target, { e: this.epochNow, v: left })
    } else if (env) map.set(target, { e: this.epochNow, v: true })
    else map.delete(target)
  }

  /** a page of epoch `from` in this epoch, with the turn the saves since baked into it */
  private carryPage(page: number, from: number): { page: number; baked: number } | undefined {
    const late = this.latePages.get(`${from}:${page}`)
    if (late !== undefined) return { page: late, baked: 0 }
    let p = page
    let baked = 0
    for (let epoch = from + 1; epoch <= this.epochNow; epoch++) {
      const save = this.saves.get(epoch)
      baked += save?.rotations.get(p) ?? 0
      const next = save?.pageMap.get(p)
      if (next === undefined) return undefined
      p = next
    }
    return { page: p, baked }
  }

  /** a late item in this epoch's terms; undefined when it cannot follow the save */
  private carry(bucket: Bucket, key: string, env: Env): unknown {
    if (!acceptable(bucket, key, env.v)) return undefined
    for (let epoch = env.e + 1; epoch <= this.epochNow; epoch++) {
      // that item is in the file now; a late change to it would add it again
      if (this.saves.get(epoch)?.keys.has(`${bucket}:${key}`)) return undefined
    }
    if (KIND[bucket] !== 'list') return env.v
    if (bucket === 'blankPages') return this.carryBlank(env)
    const moved = this.carryPage(pageOf(bucket, env.v) as number, env.e)
    if (!moved) return undefined
    const item = remapItem(bucket, env.v, () => moved.page) as Item
    if (bucket !== 'noteEdits') return item
    // the save rewrote that note: it is matched by what the file says now
    const annot = item.annot as Item
    let written: string | undefined
    for (let epoch = env.e + 1; epoch <= this.epochNow; epoch++) {
      written = this.saves.get(epoch)?.notes.get(annot.objNum as number) ?? written
    }
    if (written === undefined) return item
    if (item.contents === written) return undefined
    return { ...item, annot: { ...annot, contents: written } }
  }

  /** a page a guest added late goes after the host's pending ones */
  private carryBlank(env: Env): unknown {
    const blank = env.v as Item & { input: { pageIndex: number } }
    const from = `${env.e}:${blank.input.pageIndex}`
    const blanks = this.host.read().blankPages
    const page =
      blanks.find((b) => b.id === blank.id)?.input.pageIndex ??
      this.latePages.get(from) ??
      this.host.realPages() + blanks.length + this.lateAdded++
    this.latePages.set(from, page)
    return page === blank.input.pageIndex ? blank : withPage('blankPages', blank, page)
  }

  /** the buckets against what the shared state holds; differences are written with `origin` */
  private diff(origin: symbol): Change[] {
    if (this.ended) return []
    const snapshot = this.host.read()
    const changes: Change[] = []
    for (const bucket of SHARED_BUCKETS) {
      const value = snapshot[bucket]
      if (!this.retag && this.seen.get(bucket) === value) continue
      this.seen.set(bucket, value)
      const base = this.baseline.get(bucket)!
      const local = entriesOf(bucket, value, this.epochNow)
      const ranked = KIND[bucket] === 'list'
      for (const [key, v] of local) {
        const before = base.get(key)
        if (before && before.v === v && before.e === this.epochNow) continue
        const after: Env = ranked
          ? { e: this.epochNow, r: before?.r ?? ++this.clock, v }
          : { e: this.epochNow, v }
        changes.push({ bucket, key, before, after })
      }
      for (const [key, before] of base) {
        if (!local.has(key)) changes.push({ bucket, key, before, after: undefined })
      }
    }
    this.retag = false
    if (changes.length === 0) return changes
    this.doc.transact(() => {
      for (const { bucket, key, after } of changes) {
        const map = this.maps.get(bucket)!
        const base = this.baseline.get(bucket)!
        if (after) {
          map.set(key, after)
          base.set(key, after)
        } else {
          map.delete(key)
          base.delete(key)
        }
      }
    }, origin)
    return changes
  }

  private record(changes: Change[], coalesceKey?: string): void {
    const top = this.undoStack[this.undoStack.length - 1]
    // consecutive input on the same form field is one step, as in the editor's own undo
    if (coalesceKey && coalesceKey === this.lastCoalesce && top) {
      for (const change of changes) {
        const same = top.find((c) => c.bucket === change.bucket && c.key === change.key)
        if (same) same.after = change.after
        else top.push(change)
      }
    } else {
      this.undoStack = [...this.undoStack.slice(-(HISTORY_DEPTH - 1)), changes]
    }
    this.lastCoalesce = coalesceKey ?? null
    this.redoStack = []
    this.onHistory()
  }

  /** a value this person wrote was replaced by the editor itself (a validation result): undo follows it */
  private rebase(change: Change): void {
    if (change.before === undefined) return
    for (const step of [...this.undoStack, ...this.redoStack]) {
      for (const c of step) {
        if (c.bucket === change.bucket && c.key === change.key && c.after === change.before) {
          c.after = change.after
        }
      }
    }
  }

  /** take back the newest step whose values are still in place; anything someone else changed since stays */
  private step(from: Change[][], to: Change[][]): boolean {
    let done: Change[] = []
    while (from.length > 0 && done.length === 0) {
      const step = from.pop()!
      done = []
      this.doc.transact(() => {
        for (let i = step.length - 1; i >= 0; i--) {
          const { bucket, key, before, after } = step[i]!
          const map = this.maps.get(bucket)!
          if (map.get(key) !== after) continue
          if (before === undefined) map.delete(key)
          else map.set(key, before)
          done.unshift({ bucket, key, before: after, after: before })
        }
      }, UNDO_ORIGIN)
    }
    if (done.length > 0) to.push(done)
    this.lastCoalesce = null
    this.onHistory()
    return done.length > 0
  }

  private clearHistory(): void {
    this.undoStack = []
    this.redoStack = []
    this.lastCoalesce = null
    this.onHistory()
  }
}

function grouped(items: Array<[Bucket, string]>): Map<Bucket, Set<string>> {
  const out = new Map<Bucket, Set<string>>()
  for (const [bucket, key] of items) {
    const keys = out.get(bucket) ?? new Set<string>()
    keys.add(key)
    out.set(bucket, keys)
  }
  return out
}
