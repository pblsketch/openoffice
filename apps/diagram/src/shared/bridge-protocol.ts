/**
 * Messages between the editor screen (the host page) and our bridge script
 * inside the draw.io frame, and the rules both sides apply before they read
 * one (spec 6).
 *
 * Two kinds of messages cross the frame boundary:
 * - draw.io's own embed protocol (`proto=json`): JSON strings such as
 *   `{"event":"init"}` from draw.io and `{"action":"load",…}` to it;
 * - ours: plain objects tagged `ieum: 1`. draw.io ignores them (it only reads
 *   strings that parse as JSON), and the host tells them apart by the tag.
 *
 * The host reads a message only when it comes from the draw.io frame's
 * window and the draw.io origin; the bridge only when it comes from its
 * parent window and the parent's origin. Nothing is sent with `*` by us.
 *
 * Everything here is free of Electron and of the DOM types beyond
 * `MessageEvent`, so both sides and the tests share it.
 */
import type { DiagramPrimitive } from '@genoffice/drawio-model'

/** The custom scheme the draw.io files are served from (never `file://`). */
export const DRAWIO_SCHEME = 'drawio-app'
/** The host name of that scheme; the frame's origin is `drawio-app://editor`. */
export const DRAWIO_HOST = 'editor'
export const DRAWIO_ORIGIN = `${DRAWIO_SCHEME}://${DRAWIO_HOST}`

/** Where our own files sit under the draw.io origin; no draw.io file has this name. */
export const BRIDGE_PREFIX = '/__ieum/'
export const BRIDGE_SCRIPT_PATH = `${BRIDGE_PREFIX}bridge.js`

/** A message the event says came from `source` with `origin`. */
export interface MessageLike {
  source: unknown
  origin: string
  data: unknown
}

/** Host side: only the draw.io frame's own window, from the draw.io origin. */
export function isFromDrawioFrame(event: MessageLike, frameWindow: unknown): boolean {
  return frameWindow != null && event.source === frameWindow && event.origin === DRAWIO_ORIGIN
}

/** Bridge side: only the parent window, from the parent's origin. */
export function isFromHost(event: MessageLike, parentWindow: unknown, hostOrigin: string): boolean {
  return (
    parentWindow != null &&
    event.source === parentWindow &&
    hostOrigin !== '' &&
    hostOrigin !== 'null' &&
    event.origin === hostOrigin
  )
}

// ---- our messages ----

export interface PageXml {
  id: string
  name: string
  /** the page's `mxGraphModel` XML, uncompressed */
  xml: string
}

export interface PageInfo {
  id: string
  name: string
  /** the page format the diagram sets, in draw.io units (1/100 inch) */
  pageWidth: number
  pageHeight: number
}

export interface PageSvg {
  svg: string
  /** the drawing's size in draw.io units */
  width: number
  height: number
}

/** What the host asks the bridge, with what each answers. */
export interface BridgeOps {
  /** all pages as model XML, the page on screen and the selected cells */
  readPages: {
    request: Record<string, never>
    reply: { pages: PageXml[]; currentPage: string | null; selected: string[] }
  }
  /** the ids selected on the page on screen */
  selection: { request: Record<string, never>; reply: { ids: string[] } }
  /** pages with their page format */
  pageInfo: {
    request: Record<string, never>
    reply: { pages: PageInfo[]; currentPage: string | null }
  }
  /**
   * Apply primitive changes to the live diagram as ONE undo step. The ids are
   * those the cells really got; a failure takes the whole step back.
   */
  applyPrimitives: { request: { primitives: DiagramPrimitive[] }; reply: { created: string[] } }
  /**
   * Apply a whole tool call as ONE undo step: primitive changes and converted
   * Mermaid drawings, in order, inside one model update. Everything is checked
   * first; a failure anywhere takes the whole step back. `steps` holds the ids
   * each step made; `token` names the step for `undoBatches` (null when
   * nothing changed).
   */
  applyBatch: {
    request: { steps: DiagramApplyStep[] }
    reply: { created: string[]; steps: string[][]; token: string | null }
  }
  /**
   * Convert Mermaid source with draw.io's own converter, the way its Insert ›
   * Mermaid does (an editable group carrying the source). Changes nothing; a
   * text the converter refuses fails with the converter's reason.
   */
  convertMermaid: { request: { text: string }; reply: { xml: string } }
  /**
   * Undo the batches named by `tokens` (newest last), newest first, for as
   * long as each one is the newest step of the undo history. `undone` counts
   * the ones taken back; it stops at the first batch something else covers.
   */
  undoBatches: { request: { tokens: string[] }; reply: { undone: number } }
  /**
   * Convert a Visio drawing (`.vsdx` bytes) with draw.io's own importer.
   * Changes nothing on screen. `xml` is a draw.io file with uncompressed
   * pages; `unconvertedPictures` counts the pictures the importer could not
   * turn into something the editor draws (metafiles it cannot read).
   */
  importVisio: {
    request: { bytes: Uint8Array }
    reply: { xml: string; pages: number; unconvertedPictures: number }
  }
  /** draw.io's dark view on or off */
  setDark: { request: { dark: boolean }; reply: Record<string, never> }
  /** whether serializations compress pages (follows the opened file) */
  setCompressed: { request: { compressed: boolean }; reply: Record<string, never> }
  /**
   * The content as it stood at `revision` (the last `changed` event the host
   * had when it asked for the bytes it saved) is what the file holds; left out,
   * the content now. Later steps stay unsaved.
   */
  markSaved: { request: { revision?: number }; reply: Record<string, never> }
  /** the current content is not what any file holds (a restored copy, a reload) */
  markUnsaved: { request: Record<string, never>; reply: Record<string, never> }
  /**
   * one page as SVG; `theme: 'light'` for every export, PDF and print (light
   * colors only), `'auto'` for draw.io's adaptive `light-dark()` colors
   */
  pageSvg: {
    request: { pageId: string; theme: 'light' | 'auto' }
    reply: PageSvg
  }
  /** one page as the bytes of a PNG file (always light), handed over without a copy */
  pagePng: { request: { pageId: string }; reply: { bytes: Uint8Array } }
  /** one of draw.io's own actions the app menu reaches (undo, zoom, find) */
  runAction: { request: { action: DrawioMenuAction }; reply: Record<string, never> }
}

/**
 * One part of an `applyBatch` call. `mermaid` inserts draw.io's converted
 * Mermaid XML (from `convertMermaid`) on `page` with its top-left corner at
 * x, y, as draw.io's own Insert does (the position snaps to the grid).
 */
export type DiagramApplyStep =
  | { kind: 'primitives'; primitives: DiagramPrimitive[] }
  | { kind: 'mermaid'; page: string; xml: string; x: number; y: number }

/** draw.io actions the app's menu may run. */
export const DRAWIO_MENU_ACTIONS = [
  'undo',
  'redo',
  'zoomIn',
  'zoomOut',
  'resetView',
  'fitWindow',
  'findReplace',
] as const

export type DrawioMenuAction = (typeof DRAWIO_MENU_ACTIONS)[number]

export type BridgeOp = keyof BridgeOps

export interface BridgeRequestMessage<K extends BridgeOp = BridgeOp> {
  ieum: 1
  kind: 'request'
  id: string
  op: K
  args: BridgeOps[K]['request']
}

export type BridgeReplyMessage =
  | { ieum: 1; kind: 'reply'; id: string; ok: true; value: unknown }
  | { ieum: 1; kind: 'reply'; id: string; ok: false; error: string }

/** What the bridge tells the host without being asked. */
export type BridgeEvent =
  /** draw.io's editor object was reached and the bridge is listening */
  | { name: 'ready' }
  /** whether the diagram differs from what was last saved or loaded */
  | { name: 'dirty'; dirty: boolean }
  /** the diagram changed (any undoable step, undo or redo) */
  | { name: 'changed'; revision: number }
  | { name: 'selection'; ids: string[] }
  | { name: 'currentPage'; id: string | null }
  /** an app shortcut pressed inside draw.io */
  | { name: 'shortcut'; key: 'save' | 'saveAs' | 'print' }
  /** a draw.io menu item the app does itself */
  | { name: 'command'; command: BridgeCommand }
  /** a link a person clicked */
  | { name: 'openLink'; url: string }

/** draw.io's menu items that the app carries out instead of draw.io. */
export type BridgeCommand = 'help' | 'print' | 'exportPdf' | 'exportPng' | 'exportSvg' | 'save'

export type BridgeEventMessage = { ieum: 1; kind: 'event' } & BridgeEvent

export type BridgeMessage = BridgeRequestMessage | BridgeReplyMessage | BridgeEventMessage

const BRIDGE_OPS: ReadonlySet<string> = new Set<BridgeOp>([
  'readPages',
  'selection',
  'pageInfo',
  'applyPrimitives',
  'applyBatch',
  'convertMermaid',
  'importVisio',
  'undoBatches',
  'setDark',
  'setCompressed',
  'markSaved',
  'markUnsaved',
  'pageSvg',
  'pagePng',
  'runAction',
])

const EVENT_NAMES: ReadonlySet<string> = new Set([
  'ready',
  'dirty',
  'changed',
  'selection',
  'currentPage',
  'shortcut',
  'command',
  'openLink',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Our message, or null for anything else (draw.io's strings included). */
export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (!isRecord(data) || data.ieum !== 1) return null
  if (data.kind === 'request') {
    if (typeof data.id !== 'string' || typeof data.op !== 'string' || !BRIDGE_OPS.has(data.op)) {
      return null
    }
    if (!isRecord(data.args)) return null
    return data as unknown as BridgeRequestMessage
  }
  if (data.kind === 'reply') {
    if (typeof data.id !== 'string' || typeof data.ok !== 'boolean') return null
    if (data.ok === false && typeof data.error !== 'string') return null
    return data as unknown as BridgeReplyMessage
  }
  if (data.kind === 'event') {
    if (typeof data.name !== 'string' || !EVENT_NAMES.has(data.name)) return null
    return data as unknown as BridgeEventMessage
  }
  return null
}

// ---- draw.io's embed protocol ----

/** An event draw.io posts in the embed protocol (`proto=json`). */
export interface EmbedEvent {
  event: string
  [key: string]: unknown
}

/** draw.io's JSON string, parsed; null for anything else. */
export function parseEmbedEvent(data: unknown): EmbedEvent | null {
  if (typeof data !== 'string' || data.length === 0 || data[0] !== '{') return null
  try {
    const parsed: unknown = JSON.parse(data)
    return isRecord(parsed) && typeof parsed.event === 'string' ? (parsed as EmbedEvent) : null
  } catch {
    return null
  }
}
