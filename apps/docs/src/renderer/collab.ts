/**
 * Co-editing in the Word editor (decision 0073). The body is shared through
 * the TipTap binding; what a docx keeps beside it stays with the host
 * (collab-gate.ts says what that switches off).
 *
 * Every block carries the docxIndex of the file it came from, and a save
 * patches that file by those indexes. A guest therefore opens exactly the
 * host's baseline (the last saved file), so its parse and the shared body
 * agree, and whenever a host save re-bases the body onto the file it just
 * wrote, the new baseline goes to everyone. A guest's copy can then be saved
 * as its own document once the session ends.
 */
import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import {
  parseLazyMediaUrl,
  readPageColor,
  readSectionSettings,
  readSections,
  type ParsedDocFull,
} from '@genoffice/docx-engine'
import {
  useCollab,
  type CollabController,
  type CollabDocument,
  type CollabSession,
  type CollabShareBlock,
} from '@genoffice/collab'
import { bindTiptap, clearCollabHistory, isRemoteTransaction } from '@genoffice/collab/tiptap'
import { isCollabGuest, setCollabGate } from './collab-gate'
import { isDocDirty, resetCrossDocEditState } from './doc-dirty'
import { hfVariantsFromParsed, isOdtDoc } from './doc-state'
import { docStyleCss } from './doc-style-css'
import { fetchDocBytes } from './doc-bytes'
import { annotationsFromParsed } from './editor/ink'
import { inlineToRuns, type PmNode } from './editor/convert'
import { setLazyMediaHashes } from './editor/extensions'
import { applyDocLayoutSettings, type FileActionContext } from './file-actions'
import { setDocFontTable } from './line-metrics'
import { parseDocxOffThread } from './parse-off-thread'
import { waitForFullContent } from './phased-content'

/** host → guests: the file the shared body's docxIndexes now point into */
const BASELINE = 'docs:baseline'
/** guest → host: the whole document behind a lazily opened file's pictures */
const MEDIA = 'docs:media'
/** blocks someone else may have typed into, which an undo of mine must keep */
const PROTECTED_BLOCKS = [
  'docParagraph',
  'docHeading',
  'docListItem',
  'docTableCell',
  'docTableHeader',
]

export interface DocsCollabOptions {
  /** the file actions' view of the App, fresh per call */
  ctx: () => FileActionContext
  /** a document is on screen in full (a phased open has landed its tail) */
  ready: boolean
  /** the document's baseline; a host save that re-based the body replaces it */
  parsed: ParsedDocFull | null
  /** state outside React changed (dirty flag): render again */
  refresh: () => void
}

export interface DocsCollab {
  collab: CollabController
  /** whether an editor change marks the document changed */
  dirtiesDocument: (tr: Transaction) => boolean
}

const markedAtom = (node: PmNode): boolean => node.type !== 'text' && !!node.marks?.length

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined)
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined)
  return (
    ka.length === kb.length &&
    ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  )
}

/**
 * Marks on inline atoms (footnote references, pictures, formulas, line breaks)
 * do not survive the shared fragment: y-tiptap keeps marks on text only. True
 * when dropping them would change the runs a save writes, so the document
 * would change the moment it is shared.
 */
export function atomMarksLost(doc: ProseMirrorNode): boolean {
  let lost = false
  doc.descendants((node) => {
    if (lost || !node.isTextblock) return !lost
    const content = (node.toJSON() as PmNode).content ?? []
    if (content.some(markedAtom)) {
      const kept = content.map((child) => {
        if (!markedAtom(child)) return child
        const { marks: _dropped, ...rest } = child
        return rest
      })
      lost = !sameValue(inlineToRuns(content), inlineToRuns(kept))
    }
    return false
  })
  return lost
}

/** the name the guests' copy is written under; its extension picks the editor */
export function sharedFileName(fileName: string): string {
  return /\.docx$/i.test(fileName) ? fileName : `${fileName.replace(/\.[^.\\/]*$/, '')}.docx`
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * A guest takes a new baseline without touching the shared body: the parsed
 * file and everything derived from it, as saveOnce re-bases after a save
 * (file-actions.ts). Guests cannot edit any of this state during a session.
 */
export function adoptBaseline(ctx: FileActionContext, parsed: ParsedDocFull): void {
  const { editor } = ctx
  if (!editor) return
  setLazyMediaHashes(parsed.extras.lazyMediaHashes)
  setDocFontTable(parsed.fontTable)
  editor.storage.listNumbering.styles = parsed.styles
  editor.storage.listNumbering.docDefaults = parsed.docDefaults
  editor.storage.listNumbering.defs = parsed.numbering
  applyDocLayoutSettings(editor, parsed)
  ctx.setDocCss(docStyleCss(parsed))
  ctx.setDoc((prev) => (prev ? { ...prev, parsed } : prev))
  ctx.setSection(readSectionSettings(parsed))
  ctx.setSections(readSections(parsed))
  ctx.setSectionDirty(false)
  ctx.setPageColor(readPageColor(parsed))
  ctx.setPageColorDirty(false)
  ctx.setHeader(
    parsed.headerText || parsed.headerHasPageNumber || parsed.headerParas?.length
      ? {
          text: parsed.headerText ?? '',
          pageNumber: parsed.headerHasPageNumber,
          paras: parsed.headerParas ?? undefined,
        }
      : null,
  )
  ctx.setHeaderDirty(false)
  ctx.setFooter(
    parsed.footerText || parsed.footerHasPageNumber || parsed.footerParas?.length
      ? {
          text: parsed.footerText ?? '',
          pageNumber: parsed.footerHasPageNumber,
          paras: parsed.footerParas ?? undefined,
        }
      : null,
  )
  ctx.setFooterDirty(false)
  ctx.setHfVariants(hfVariantsFromParsed(parsed))
  ctx.setHfVariantsDirty([])
  resetCrossDocEditState(ctx)
  ctx.setTitlePg(parsed.titlePg ?? false)
  ctx.setTitlePgDirty(false)
  ctx.setEvenOddHf(parsed.evenAndOddHeaders ?? false)
  ctx.setEvenOddHfDirty(false)
  ctx.setMirrorMargins(parsed.mirrorMargins ?? false)
  ctx.setMirrorMarginsDirty(false)
  ctx.setComments(parsed.comments)
  ctx.setCommentsDirty(false)
  ctx.setWatermark(parsed.watermarkText ?? null)
  ctx.setWatermarkDirty(false)
  ctx.setWatermarkStyle(null)
  ctx.setWatermarkPicture(null)
  ctx.setInkAnnotations(annotationsFromParsed(parsed.inks))
  ctx.setInksDirty(false)
  ctx.setFootnotes(parsed.footnotes)
  ctx.setEndnotes(parsed.endnotes)
  ctx.setNotesDirty(false)
  ctx.setSources(parsed.sources)
  ctx.setSourcesDirty(false)
  ctx.setZoteroDocumentData(parsed.zoteroDocumentData)
  ctx.setZoteroDocumentDataDirty(false)
  ctx.setThemeFonts(parsed.themeFonts ?? null)
  ctx.setThemeFontsDirty(false)
  ctx.setThemeColors(parsed.themeColors ?? null)
  ctx.setThemeColorsDirty(false)
  ctx.setProtection(parsed.protection)
  ctx.setProtectionDirty(false)
  ctx.setWriteProtection(parsed.writeProtection)
  ctx.setWriteProtectionDirty(false)
  ctx.setRemovePersonalInfo(parsed.removePersonalInfo)
  ctx.setRemovePersonalInfoDirty(false)
}

/** pictures that failed before this tab could serve them (body, headers, footers): load them again */
function reloadPictures(root: ParentNode): void {
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src')
    if (!src || !parseLazyMediaUrl(src)) continue
    img.removeAttribute('src')
    img.setAttribute('src', src)
  }
}

/** what a bound session and the hook share */
export interface DocsLink {
  ctx: () => FileActionContext
  session: CollabSession | null
  /** host: the baseline the guests have, or are about to get */
  sent: ParsedDocFull | null
}

export function docsShareBlock(ctx: FileActionContext): CollabShareBlock | null {
  const { doc, editor } = ctx
  if (!doc || !editor) return 'unsupported'
  if (doc.encrypted) return 'encrypted'
  // the ODT guard refuses edits it did not make itself, remote ones included
  if (isOdtDoc(doc)) return 'unsupported'
  // guests open the last saved file: the body must still be that file
  if (isDocDirty(ctx) || ctx.saveIncompleteRef.current || ctx.saveInFlightRef.current) {
    return 'save-first'
  }
  if (atomMarksLost(editor.state.doc)) return 'unsupported'
  return null
}

export async function describeDocs(ctx: () => FileActionContext): Promise<CollabDocument | null> {
  // a phased open must have landed: the shared body is the whole document
  await waitForFullContent()
  const { doc } = ctx()
  // the tail may hold what the first check could not see yet
  if (!doc || docsShareBlock(ctx())) return null
  const name = sharedFileName(doc.fileName)
  return { title: name, fileName: name, base: doc.parsed.internal.originalBytes.slice() }
}

/** whether an editor change marks the document changed */
export function dirtiesDocument(tr: Transaction): boolean {
  if (isCollabGuest()) return false
  // the first render of the shared state puts back the same content
  return !(isRemoteTransaction(tr) && tr.before.eq(tr.doc))
}

/** host: a save re-based the body on the file it wrote; everyone gets that file */
export function shareBaseline(link: DocsLink, parsed: ParsedDocFull | null): void {
  const session = link.session
  if (!session || session.role !== 'host' || !parsed || parsed === link.sent) return
  link.sent = parsed
  session.send(BASELINE, parsed.internal.originalBytes.slice())
}

function hostSide(
  session: CollabSession,
  link: DocsLink,
  parsed: ParsedDocFull,
): Array<() => void> {
  link.sent = parsed
  const offs = [
    // a guest who joins after a re-base still opened the file shared at the start
    session.onPeerJoin((peerId) => {
      const current = link.ctx().doc?.parsed
      if (current && current !== parsed) {
        session.send(BASELINE, current.internal.originalBytes.slice(), peerId)
      }
    }),
  ]
  if (parsed.extras.lazyMediaHashes.length > 0) {
    offs.push(
      session.handle(MEDIA, async () => {
        const current = link.ctx().doc?.parsed
        if (!current) throw new Error('no document')
        const full = await window.desktop.materializeDocx(
          toArrayBuffer(current.internal.originalBytes),
        )
        if (!full) throw new Error('pictures unavailable')
        return fetchDocBytes(full.dataUrl)
      }),
    )
  }
  return offs
}

function guestSide(session: CollabSession, link: DocsLink, editor: Editor): Array<() => void> {
  let generation = 0
  return [
    session.on(BASELINE, (payload) => {
      if (!(payload instanceof Uint8Array)) return
      // undoing an edit made before the re-base would bring back stale indexes
      clearCollabHistory(editor)
      const current = ++generation
      void parseDocxOffThread(new Uint8Array(payload), { owned: true }).then(
        (parsed) => {
          if (current === generation && link.session === session) adoptBaseline(link.ctx(), parsed)
        },
        (err) => console.error('[collab] could not read the shared baseline:', err),
      )
    }),
  ]
}

/** the copy names the host's pictures by the host's file, which this PC has never seen */
async function fetchSharedPictures(session: CollabSession, link: DocsLink, hashes: string[]) {
  try {
    const bytes = await session.request(MEDIA, null)
    if (!(bytes instanceof Uint8Array) || link.session !== session) return
    if (await window.desktop.collabServeMedia?.(hashes, toArrayBuffer(bytes))) {
      reloadPictures(document)
    }
  } catch (err) {
    console.warn('[collab] the shared pictures are unavailable:', err)
  }
}

/** wire the editor to a session; the returned function unwires it */
export function bindDocs(session: CollabSession, link: DocsLink): () => void {
  const ctx = link.ctx()
  const { editor, doc } = ctx
  if (!editor || !doc) throw new Error('no document to share')
  const guest = session.role === 'guest'
  const gate = () =>
    setCollabGate({ role: session.role, othersIn: session.peers().some((peer) => !peer.self) })
  gate()
  const offs = [session.onPeersChanged(gate)]
  if (guest) {
    // the host's copy: nothing here is this person's own change
    ctx.dirtyRef.current = false
    void window.desktop.collabGuest?.(true)
    offs.push(...guestSide(session, link, editor))
  } else {
    offs.push(...hostSide(session, link, doc.parsed))
  }
  const unbind = bindTiptap(editor, session, { protectedNodes: PROTECTED_BLOCKS })
  link.session = session
  const hashes = doc.parsed.extras.lazyMediaHashes
  if (guest && hashes.length > 0) void fetchSharedPictures(session, link, [...hashes])
  return () => {
    for (const off of offs) off()
    unbind()
    if (link.session === session) link.session = null
    setCollabGate(null)
    if (guest) void window.desktop.collabGuest?.(false)
  }
}

export function useDocsCollab(options: DocsCollabOptions): DocsCollab {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const linkRef = useRef<DocsLink | null>(null)
  linkRef.current ??= { ctx: () => optionsRef.current.ctx(), session: null, sent: null }
  const link = linkRef.current

  const collab = useCollab({
    kind: 'docs',
    ready: options.ready,
    shareBlock: () => docsShareBlock(link.ctx()),
    describe: () => describeDocs(link.ctx),
    bind: (session) => bindDocs(session, link),
    onEnded: (role) => {
      if (role !== 'guest') return
      // the copy is now this person's own unsaved document
      link.ctx().dirtyRef.current = true
      optionsRef.current.refresh()
    },
  })

  useEffect(() => shareBaseline(link, options.parsed), [link, options.parsed])

  return { collab, dirtiesDocument }
}
