/**
 * The source tree: `content.json` as parsed, kept whole.
 *
 * These types describe the file, not what the editor shows. Everything the
 * engine does not model stays in the tree exactly as it was read and goes back
 * out on save, so every level carries an index signature and nothing here is a
 * closed shape.
 *
 * Only what the structure check guarantees is typed precisely: a sheet has a
 * central topic, every topic has a string id, and the lists under `children`
 * hold topics. Every other key is typed `unknown` on purpose: the file is
 * untrusted, and a `title` may be a number. Read those through the view
 * (`sheetToView`) or narrow them yourself; writing them needs no cast.
 */

/** One topic of the map, with whatever else the file put on it. */
export interface XmindTopic {
  id: string
  children?: XmindTopicChildren
  title?: unknown
  /** `[{ text, "fo:…": value }]`: the title in parts with a text format of their own (see `text-style.ts`) */
  attributedTitle?: unknown
  /** `'folded'` when the branch is collapsed */
  branch?: unknown
  labels?: unknown
  /** `{ plain: { content }, realHTML: { content } }` */
  notes?: unknown
  href?: unknown
  /** `[{ markerId }]` */
  markers?: unknown
  /** `{ src, width, height }` */
  image?: unknown
  /** the width the user gave the topic's box, in pixels */
  customWidth?: unknown
  /** `{ id, properties }`: what was set on this topic directly */
  style?: unknown
  /** the arrangement of this topic's branches */
  structureClass?: unknown
  /** `[{ id, range, topicId }]`, ranges over `children.attached` */
  summaries?: unknown
  /** `[{ id, range, title }]`, ranges over `children.attached` */
  boundaries?: unknown
  [key: string]: unknown
}

/**
 * The topics below a topic, by kind. `attached` are the branches the editor
 * shows; floating topics, summary topics and callouts are kept but not shown as
 * branches. A kind the engine has never seen is kept too.
 */
export interface XmindTopicChildren {
  attached?: XmindTopic[]
  detached?: XmindTopic[]
  summary?: XmindTopic[]
  callout?: XmindTopic[]
  [kind: string]: unknown
}

/** One sheet: one map. */
export interface XmindSheet {
  rootTopic: XmindTopic
  id?: unknown
  title?: unknown
  /** `[{ id, end1Id, end2Id, title }]` */
  relationships?: unknown
  /** The sheet's theme, in the properties the format defines. Absent on a sheet without one. */
  theme?: unknown
  [key: string]: unknown
}

/** A value that is a JSON object rather than an array, a primitive or null. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
