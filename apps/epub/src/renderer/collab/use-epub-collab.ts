/**
 * Co-editing in the EPUB editor (decision 0073).
 *
 * - The host shares what a save would write now. Its tab keeps working on
 *   its own book; guests' reads and edits arrive as requests and run through
 *   that same book, and every change goes out to everyone as the chapter it
 *   left (`routed-api.ts`).
 * - A guest's tab opened the shared copy from a temp folder. Once bound, it
 *   reads every chapter from the host and sends its edits there, so block
 *   ids and versions are the host's for everyone. Pictures, styles and fonts
 *   still come from its own copy: chapter edits never touch them.
 * - Everyone's undo takes back only their own edits: a chapter someone else
 *   changed drops out of the history.
 * - When a guest's session ends, its copy takes the chapter texts the session
 *   changed and becomes the person's own unsaved book.
 */
import { useMemo, useRef, useState, type MutableRefObject } from 'react'
import { useCollab, type CollabController } from '@genoffice/collab'
import type { EpubEditResult } from '../../shared/ipc'
import type { EpubEditController, RemoteChapter } from '../edit/controller'
import { topBlockId, type ChapterTarget } from '../reader/frame-dom'
import { PresenceSync, type PeerPlace } from './presence'
import {
  ChangedChapters,
  TOPIC,
  applyRequestOf,
  catchupOf,
  chapterOf,
  rangesRequestOf,
  remoteEditOf,
  type Catchup,
  type OkEdit,
  type RemoteEdit,
  type RoutedApi,
} from './routed-api'

export interface EpubCollabOptions {
  routed: RoutedApi
  editor: EpubEditController
  /** a chapter (or the failure to read one) is on screen: a guest tab takes its session then */
  ready: boolean
  /** the book's file */
  filePath: () => string | null
  frameDoc: MutableRefObject<Document | null>
  shown: MutableRefObject<{ spineIndex: number; chapter: { path: string } } | null>
  goTo: MutableRefObject<(spineIndex: number, target: ChapterTarget) => Promise<void>>
}

/** The editor's checks and hooks; the same object for the life of the tab. */
export interface EpubCollabGuard {
  /** this save must not run (a manual one says why) */
  save(auto: boolean): boolean
  /** book translation must not open here (says why) */
  translation(): boolean
  /** a chapter frame is ready */
  frame(doc: Document): void
}

export interface EpubCollab {
  collab: CollabController
  guard: EpubCollabGuard
  /** the people reading another chapter */
  places: PeerPlace[]
}

const INVALID = { ok: false as const, error: 'invalid-request' as const }

export function useEpubCollab(options: EpubCollabOptions): EpubCollab {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const [changed] = useState(() => new ChangedChapters())
  const [places, setPlaces] = useState<PeerPlace[]>([])
  const guestRef = useRef(false)
  /** the temp copy an ended session left this tab, until it is saved somewhere else */
  const copyPathRef = useRef<string | null>(null)
  const presenceRef = useRef<PresenceSync | null>(null)
  const collabRef = useRef<CollabController | null>(null)

  /** draws the chapter on screen again from the book that now answers */
  const reload = () => {
    const { shown, frameDoc, goTo } = optionsRef.current
    const current = shown.current
    if (!current) return
    const top = frameDoc.current ? topBlockId(frameDoc.current) : null
    // without a current frame, goTo reads the chapter and draws a new one
    frameDoc.current = null
    void goTo.current(current.spineIndex, top ? { kind: 'block', id: top } : { kind: 'start' })
  }

  /** a guest's session ended: its copy takes the session's chapters and is the person's own */
  const handOver = async () => {
    const o = optionsRef.current
    const chapters = changed.all().map(({ spineIndex, source }) => ({ spineIndex, source }))
    changed.clear()
    if (chapters.length > 0) await o.routed.base.adoptChapters(chapters).catch(() => 0)
    await o.routed.base.setCollabGuest('copy').catch(() => {})
    copyPathRef.current = o.filePath()
    guestRef.current = false
    o.routed.setRoute({ kind: 'local' })
    o.editor.forgetHistory()
    // the host's translation lock does not hold the copy
    await o.editor.setTranslationLock(false).catch(() => false)
    o.editor.markChanged()
    reload()
  }

  const collab = useCollab({
    kind: 'epub',
    ready: options.ready,
    shareBlock: () => (optionsRef.current.filePath() ? null : 'unsupported'),
    describe: async () => {
      const o = optionsRef.current
      const path = o.filePath()
      if (!path) return null
      // what was typed belongs in the copy
      await o.editor.flush()
      changed.clear()
      // edits from here on are the session's, even those that land before it is bound
      o.routed.setRoute({
        kind: 'host',
        changed: (result) => changed.take(chapterOf(result)),
        locked: () => {},
      })
      const base = await o.routed.base.collabBase().catch(() => null)
      if (!base) {
        o.routed.setRoute({ kind: 'local' })
        return null
      }
      const fileName = path.replace(/^.*[/\\]/, '')
      return { title: fileName, fileName, base }
    },
    bind: (session) => {
      const { routed, editor, frameDoc } = optionsRef.current
      const offs: Array<() => void> = []
      if (session.role === 'host') {
        const announce = (result: OkEdit, by: string) => {
          const chapter = chapterOf(result)
          changed.take(chapter)
          session.send(TOPIC.edit, { by, chapter } satisfies RemoteEdit)
          if (by !== session.peerId) editor.applyRemote(chapter, result.dirty)
        }
        const answer = (result: EpubEditResult, from: string): EpubEditResult => {
          if (result.ok && result.replacements.length > 0) announce(result, from)
          return result
        }
        routed.setRoute({
          kind: 'host',
          changed: (result) => announce(result, session.peerId),
          locked: (locked) => session.send(TOPIC.lock, { locked }),
        })
        const base = routed.base
        offs.push(
          session.handle(TOPIC.read, (payload) =>
            Number.isSafeInteger(payload) ? base.readChapter(payload as number) : INVALID,
          ),
          session.handle(TOPIC.apply, async (payload, from) => {
            const request = applyRequestOf(payload)
            return request ? answer(await base.applyEdits(request), from) : INVALID
          }),
          session.handle(TOPIC.ranges, async (payload, from) => {
            const request = rangesRequestOf(payload)
            return request ? answer(await base.replaceRanges(request), from) : INVALID
          }),
          // a guest reads chapters as it goes; it needs the lock and, for later, what changed
          session.onPeerJoin((peerId) =>
            session.send(
              TOPIC.catchup,
              { locked: editor.isLocked, chapters: changed.all() } satisfies Catchup,
              peerId,
            ),
          ),
          () => {
            routed.setRoute({ kind: 'local' })
            changed.clear()
          },
        )
      } else {
        guestRef.current = true
        // what this tab knew came from its own copy: from now on the host's book answers
        editor.forgetHistory()
        routed.setRoute({
          kind: 'guest',
          request: (topic, payload) => session.request(topic, payload),
          changed: (result) => changed.take(chapterOf(result)),
        })
        void routed.base.setCollabGuest('live').catch(() => {})
        const follow = (chapter: RemoteChapter, by: string) => {
          changed.take(chapter)
          // this tab's own edits came back as answers already
          if (by !== session.peerId) editor.applyRemote(chapter)
        }
        offs.push(
          session.on(TOPIC.edit, (payload) => {
            const edit = remoteEditOf(payload)
            if (edit) follow(edit.chapter, edit.by)
          }),
          session.on(TOPIC.lock, (payload) => {
            const locked = (payload as { locked?: unknown } | null)?.locked
            if (typeof locked === 'boolean') void editor.setTranslationLock(locked)
          }),
          session.on(TOPIC.catchup, (payload) => {
            const catchup = catchupOf(payload)
            if (!catchup) return
            for (const chapter of catchup.chapters) changed.take(chapter)
            if (catchup.locked) void editor.setTranslationLock(true)
          }),
          // until the copy has taken over, nothing reaches either book
          () => routed.setRoute({ kind: 'closed' }),
        )
        reload()
      }
      const presence = new PresenceSync({
        session,
        chapter: () => {
          const shown = optionsRef.current.shown.current
          return shown ? { spineIndex: shown.spineIndex, path: shown.chapter.path } : null
        },
        caret: () => editor.caret(),
        locate: (id, start, end) => editor.rangeIn(id, start, end),
        // carets move all the time; the status line changes only when someone changes chapter
        elsewhere: (next) =>
          setPlaces((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next)),
      })
      presenceRef.current = presence
      // the host's chapter is on screen already; a guest's frame comes with the reload
      if (session.role === 'host' && frameDoc.current) presence.attach(frameDoc.current)
      offs.push(() => {
        presence.stop()
        presenceRef.current = null
      })
      return () => offs.forEach((off) => off())
    },
    onEnded: (role) => {
      if (role === 'guest') void handOver()
    },
  })
  collabRef.current = collab

  const guard = useMemo<EpubCollabGuard>(
    () => ({
      save: (auto) => {
        if (guestRef.current) {
          if (!auto) collabRef.current?.flash('guestSaveBlocked')
          return true
        }
        // the copy a session left has no file of its own: only the person saves it, somewhere
        const copy = copyPathRef.current
        return auto && copy !== null && copy === optionsRef.current.filePath()
      },
      translation: () => {
        if (!guestRef.current) return false
        collabRef.current?.flash('guestBlocked')
        return true
      },
      frame: (doc) => presenceRef.current?.attach(doc),
    }),
    [],
  )

  return { collab, guard, places }
}
