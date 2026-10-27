/**
 * Co-editing in the PDF editor (decision 0073). The pending edits are shared
 * through EditShare (collab-share.ts); this file wires it to a session: the
 * host's saves as new file epochs, a guest's copy following them, where the
 * others are on the pages, and what a session refuses.
 *
 * Only the host saves. A guest's copy is the file as the host last saved it
 * plus the shared pending edits; when the session ends it becomes the guest's
 * own unsaved document.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from 'react'
import {
  collabText,
  useCollab,
  type CollabController,
  type CollabSession,
  type CollabShareBlock,
} from '@genoffice/collab'
import type { Lang } from '@genoffice/i18n'
import { pdfRectToCss, quadToRect, type PageGeom } from './annotations'
import type { Bucket } from './edit-ops'
import type { EditSnapshot, SavedSnapshot } from './edit-state'
import { EditShare } from './collab-share'

/** a saved file for guests: the host saved (or a guest joined after a save) */
const FILE_TOPIC = 'pdf:file'
const PRESENCE_FIELD = 'pdf'

/** each bucket's ref mirror and state setter, written together like the editor's own writers */
export type CollabBuckets = {
  [K in Bucket]: readonly [{ current: EditSnapshot[K] }, Dispatch<SetStateAction<EditSnapshot[K]>>]
}

interface FileMessage {
  epoch: number
  bytes: Uint8Array
  /** where the previous epoch's pages went (original index → index in the saved file) */
  pageMap: Array<[number, number]>
}

interface PdfPresence {
  /** the file epoch the page indices belong to */
  e: number
  /** original index of the page in view */
  page: number
  /** selected text: quads in PDF space per original page */
  sel: Array<[number, number[][]]> | null
}

export interface PeerMark {
  clientId: number
  name: string
  /** CSS color of the person's palette entry */
  color: string
  /** the person is looking at this page */
  here: boolean
  quads: number[][]
}

export interface PdfCollabOptions {
  lang: Lang
  /** a document is on screen */
  ready: boolean
  filePath: string
  fileName: string
  shareBlock: () => CollabShareBlock | null
  buckets: CollabBuckets
  snapshot: () => EditSnapshot
  /** pages in the open file */
  realPages: () => number
  /** original index of the page in view (-1 when none) */
  page: number
  selection: Map<number, number[][]> | null
  /** guest: read the copy again after the host saved; `saved` is what to subtract */
  reload: (saved: SavedSnapshot) => Promise<void>
  /** the editor's own snapshot undo must not cross into or out of a session */
  clearHistory: () => void
  /** after this person's undo or redo in a session */
  undone: () => void
  /** the guest's copy is now this person's unsaved document */
  markChanged: () => void
  notice: (text: string) => void
}

export interface PdfCollab {
  collab: CollabController
  /** this tab is a guest in a live session */
  guest: boolean
  /** hosting: autosave would send the whole file to every guest and reload them each time */
  pausesAutosave: boolean
  /** the buckets took a local edit (the end of applyEditOps) */
  edited(coalesceKey?: string): void
  /** session undo/redo; false outside a session, where the editor's own history applies */
  undo(): boolean
  redo(): boolean
  canUndo(own: boolean): boolean
  canRedo(own: boolean): boolean
  /** host: a save wrote the file; guests get it before the editor reloads */
  announceSave(pageMap: Map<number, number>): Promise<void>
  /** host: the post-save reload ran */
  saved(snapshot: SavedSnapshot): void
  /** guest: refuse a save (toast for a manual one); true when refused */
  refuseSave(auto: boolean): boolean
  /** refuse a feature during a session ('guest': only for a guest); the message, or null when allowed */
  refuse(scope: 'guest' | 'session'): string | null
  /** others' marks on one page (screen only) */
  marksOn(origIdx: number): PeerMark[]
}

function fileMessageOf(raw: unknown): FileMessage | null {
  const m = raw as Partial<FileMessage> | null
  if (!m || typeof m.epoch !== 'number' || !(m.bytes instanceof Uint8Array)) return null
  const pageMap = Array.isArray(m.pageMap)
    ? m.pageMap.filter(
        (pair): pair is [number, number] =>
          Array.isArray(pair) && Number.isInteger(pair[0]) && Number.isInteger(pair[1]),
      )
    : []
  return { epoch: m.epoch, bytes: m.bytes, pageMap }
}

function presenceOf(raw: unknown): PdfPresence | null {
  const p = raw as Partial<PdfPresence> | null
  if (!p || typeof p.e !== 'number' || !Number.isInteger(p.page)) return null
  const sel = Array.isArray(p.sel)
    ? p.sel.filter(
        (entry): entry is [number, number[][]] =>
          Array.isArray(entry) &&
          Number.isInteger(entry[0]) &&
          Array.isArray(entry[1]) &&
          entry[1].every((q) => Array.isArray(q) && q.length === 8 && q.every(Number.isFinite)),
      )
    : null
  return { e: p.e, page: p.page as number, sel }
}

/** others' marks per page, from their presence in this file epoch */
export function peerMarksByPage(
  presences: Array<{ clientId: number; user: { name: string; color: string }; value: unknown }>,
  epoch: number,
): Map<number, PeerMark[]> {
  const out = new Map<number, PeerMark[]>()
  const markOf = (page: number, clientId: number, user: { name: string; color: string }) => {
    const marks = out.get(page) ?? []
    out.set(page, marks)
    let mark = marks.find((m) => m.clientId === clientId)
    if (!mark) {
      mark = { clientId, name: user.name, color: user.color, here: false, quads: [] }
      marks.push(mark)
    }
    return mark
  }
  for (const { clientId, user, value } of presences) {
    const presence = presenceOf(value)
    if (!presence || presence.e !== epoch) continue
    if (presence.page >= 0) markOf(presence.page, clientId, user).here = true
    for (const [page, quads] of presence.sel ?? [])
      markOf(page, clientId, user).quads.push(...quads)
  }
  return out
}

export function usePdfCollab(options: PdfCollabOptions): PdfCollab {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const shareRef = useRef<EditShare | null>(null)
  const sessionRef = useRef<CollabSession | null>(null)
  const [history, setHistory] = useState({ canUndo: false, canRedo: false })
  // the host's post-save reload is in the buckets once a render after it has run
  const renders = useRef(0)
  renders.current += 1
  const settleAfter = useRef<number | null>(null)
  /** host: guests were told about the save now reloading */
  const announced = useRef(false)

  const readFile = async () =>
    new Uint8Array(await window.pdfApi.readFile(optionsRef.current.filePath))

  /** guest: write the host's saved file into this copy and show it */
  const follow = async (session: CollabSession, share: EditShare, file: FileMessage) => {
    try {
      await share.follow(file.epoch, new Map(file.pageMap), {
        replace: async () =>
          (await window.pdfApi.replaceCollabCopy?.(optionsRef.current.filePath, file.bytes)) ===
          true,
        reload: (saved) => optionsRef.current.reload(saved),
      })
    } catch (err) {
      // a copy that cannot follow the host's file would show others' edits in the wrong places
      console.error('[pdf] leaving the session, the shared file could not be shown:', err)
      await session.leave()
    }
  }

  const bind = (session: CollabSession) => {
    const guest = session.role === 'guest'
    const share = new EditShare(
      session.doc,
      session.role,
      {
        read: () => optionsRef.current.snapshot(),
        write: (bucket, fn) => {
          const [ref, set] = optionsRef.current.buckets[bucket]
          ref.current = fn(ref.current)
          set(fn)
        },
        realPages: () => optionsRef.current.realPages(),
      },
      () => setHistory({ canUndo: share.canUndo, canRedo: share.canRedo }),
    )
    optionsRef.current.clearHistory()
    announced.current = false
    if (guest) window.pdfApi.setCollabGuest?.(true)
    share.start()
    const offs: Array<() => void> = []
    if (guest) {
      let queue = Promise.resolve()
      offs.push(
        session.on(FILE_TOPIC, (payload) => {
          const file = fileMessageOf(payload)
          if (!file || !share.beginReload(file.epoch)) return
          queue = queue.then(() => follow(session, share, file))
        }),
      )
    } else {
      // a guest who joins after a save opened the file as it was when sharing began
      offs.push(
        session.onPeerJoin((peerId) => {
          const epoch = share.fileEpoch
          if (epoch === 0) return
          void readFile()
            .then((bytes) => session.send(FILE_TOPIC, { epoch, bytes, pageMap: [] }, peerId))
            .catch((err: unknown) => console.error('[pdf] could not send the saved file:', err))
        }),
      )
    }
    shareRef.current = share
    sessionRef.current = session
    return () => {
      for (const off of offs) off()
      share.dispose()
      if (shareRef.current === share) shareRef.current = null
      if (sessionRef.current === session) sessionRef.current = null
      setHistory({ canUndo: false, canRedo: false })
      optionsRef.current.clearHistory()
      if (guest) window.pdfApi.setCollabGuest?.(false)
    }
  }

  const collab = useCollab({
    kind: 'pdf',
    ready: options.ready,
    shareBlock: () => optionsRef.current.shareBlock(),
    describe: async () => {
      const o = optionsRef.current
      if (!o.filePath) return null
      // the file as this tab shows it; its pending edits travel in the shared state
      return { title: o.fileName, fileName: o.fileName, base: await readFile() }
    },
    bind,
    onEnded: (role) => {
      if (role === 'guest') optionsRef.current.markChanged()
    },
  })

  // edits that did not come through an op (a post-save reload, a validation result)
  useEffect(() => {
    const share = shareRef.current
    if (!share) return
    if (settleAfter.current !== null && renders.current > settleAfter.current) {
      settleAfter.current = null
      share.settle()
    }
    share.sync()
  })

  const session = collab.session
  const epoch = shareRef.current?.epoch ?? 0
  const { page, selection } = options
  useEffect(() => {
    if (!session) return
    const presence: PdfPresence | null =
      page >= 0 ? { e: epoch, page, sel: selection ? [...selection] : null } : null
    session.setPresence(PRESENCE_FIELD, presence)
  }, [session, epoch, page, selection])

  const marks = session ? peerMarksByPage(session.presences(PRESENCE_FIELD), epoch) : null
  const role = collab.role

  return {
    collab,
    guest: role === 'guest',
    pausesAutosave: role === 'host',
    edited: (coalesceKey) => shareRef.current?.local(coalesceKey),
    undo: () => {
      const share = shareRef.current
      if (!share) return false
      if (share.undo()) optionsRef.current.undone()
      return true
    },
    redo: () => {
      const share = shareRef.current
      if (!share) return false
      if (share.redo()) optionsRef.current.undone()
      return true
    },
    canUndo: (own) => (session ? history.canUndo : own),
    canRedo: (own) => (session ? history.canRedo : own),
    announceSave: async (pageMap) => {
      const share = shareRef.current
      const live = sessionRef.current
      if (!share || !live || share.role !== 'host') return
      const next = share.announce()
      announced.current = true
      try {
        // before the reload: guests must have the file before the shared edits move to it
        live.send(FILE_TOPIC, { epoch: next, bytes: await readFile(), pageMap: [...pageMap] })
      } catch (err) {
        console.error('[pdf] could not send the saved file:', err)
      }
    },
    saved: (snapshot) => {
      const share = shareRef.current
      if (!share || share.role !== 'host' || !announced.current) return
      announced.current = false
      share.saved(snapshot)
      settleAfter.current = renders.current
    },
    refuseSave: (auto) => {
      if (sessionRef.current?.role !== 'guest') return false
      if (!auto) optionsRef.current.notice(collabText(optionsRef.current.lang, 'guestSaveBlocked'))
      return true
    },
    refuse: (scope) => {
      const live = sessionRef.current
      if (!live || (scope === 'guest' && live.role !== 'guest')) return null
      const others = live.role === 'host' && collab.peers.length > 1
      const text = collabText(optionsRef.current.lang, others ? 'hostBlocked' : 'guestBlocked')
      optionsRef.current.notice(text)
      return text
    },
    marksOn: (origIdx) => marks?.get(origIdx) ?? [],
  }
}

/** where the others are on one page: their name on the page they look at, their selected text */
export function CollabPageMarks({
  marks,
  geom,
  scale,
}: {
  marks: PeerMark[]
  geom: PageGeom
  scale: number
}): ReactElement | null {
  if (marks.length === 0) return null
  const tint = (mark: PeerMark) => ({ '--collab-c': mark.color }) as CSSProperties
  const here = marks.filter((mark) => mark.here)
  return (
    <div className="pdf-collab-layer" aria-hidden="true">
      {marks.flatMap((mark) =>
        mark.quads.map((quad, i) => (
          <div
            key={`${mark.clientId}-${i}`}
            className="pdf-collab-sel"
            style={{ ...pdfRectToCss(geom, quadToRect(quad), scale), ...tint(mark) }}
          />
        )),
      )}
      {here.length > 0 && (
        <div className="pdf-collab-tags">
          {here.map((mark) => (
            <span key={mark.clientId} className="pdf-collab-tag" style={tint(mark)}>
              {mark.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
