/**
 * Co-editing in the slides editor (decision 0073). The deck lives in the main
 * process, so this hook carries the shared session for it: edits main
 * captured go onto the host-ordered op stream, other people's ops go back to
 * main to be applied, a guest that fell out of step reloads the host's bytes,
 * and everyone publishes the slide and boxes they are on.
 *
 * Main numbers what it captures. A remote op is only applied once every local
 * edit main applied before it is on the stream; otherwise the host would put
 * them in the other order than this deck holds them.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RenderSlide } from '@genoffice/pptx-render'
import type { Lang } from '@genoffice/i18n'
import {
  OpLog,
  collabText,
  useCollab,
  type CollabController,
  type CollabSession,
} from '@genoffice/collab'
import { collabColorOf, collabNameOf } from '@genoffice/electron-utils/collab-channels'
import { wireOpsCommute, type SlidesCollabApi, type SlidesWireOp } from '../shared/collab'
import { showToast } from './components/toast-bus'
import {
  PRESENCE_FIELD,
  presenceBoxes,
  presenceOf,
  samePresence,
  type SlidePresence,
} from './collab-presence'

const TOPIC = 'slides'
/** host → guests: captured edits a snapshot already holds (see SlidesCollabSnapshot) */
const SKIP_TOPIC = 'slides:skip'
/** how long a remote op waits for this deck's own edits to reach the stream */
const CATCH_UP_MS = 5000
const PRESENCE_MS = 80

export interface PeerPresence {
  clientId: number
  name: string
  /** index into the --collab-<n> palette */
  color: number
  value: SlidePresence
}

export interface SlidesCollabOptions {
  lang: Lang
  /** a deck is on screen */
  ready: boolean
  slides: RenderSlide[]
  current: number
  selectedIds: readonly string[]
  editing: boolean
  /** master view keeps its own copy of the layouts: no sharing from there */
  masterView: boolean
  dirty: boolean
  setDirty: (dirty: boolean) => void
  setCurrent: (index: number) => void
  /** the deck was replaced by the host's bytes: show it afresh, keeping the slide */
  applyReloaded: (slides: RenderSlide[]) => void
}

export interface SlidesCollab {
  collab: CollabController
  /** where everyone else is */
  peers: PeerPresence[]
}

interface SkipNotice {
  /** the snapshot it belongs to */
  tag: string
  from: number
  to: number
}

/** tells two snapshots apart without hashing megabytes (zip headers carry timestamps) */
export function snapshotTag(bytes: Uint8Array): string {
  let hash = 0x811c9dc5
  const step = (i: number) => {
    hash ^= bytes[i]!
    hash = Math.imul(hash, 0x01000193)
  }
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) step(i)
  for (let i = Math.max(4096, bytes.length - 4096); i < bytes.length; i++) step(i)
  return `${bytes.length}:${(hash >>> 0).toString(36)}`
}

function isWireOp(value: unknown): value is SlidesWireOp {
  const op = value as Partial<SlidesWireOp> | null
  return (
    !!op &&
    typeof op === 'object' &&
    Array.isArray(op.ops) &&
    op.ops.every((o) => !!o && typeof o === 'object' && typeof o.op === 'string') &&
    Array.isArray(op.keys) &&
    op.keys.every((k) => typeof k === 'string') &&
    typeof op.check === 'string' &&
    typeof op.source === 'string'
  )
}

/** wire the deck to a session; returns the unbind */
function bindDeck(
  api: SlidesCollabApi,
  session: CollabSession,
  applyReloaded: (slides: RenderSlide[]) => void,
): () => void {
  const host = session.role === 'host'
  /** the last capture number this tab has put on the stream */
  let known = 0
  /** recent captures, for the ops a remote op turned out to land after */
  const recent = new Map<number, SlidesWireOp | null>()
  let waiters: Array<{ seq: number; done: () => void }> = []
  /** ops the host already applied while accepting them */
  const applied = new WeakSet<object>()
  /** guest: the host's edits the bytes it last reloaded already hold */
  let skip: SkipNotice | null = null
  const notices: SkipNotice[] = []
  const offSkip = host
    ? () => {}
    : session.on(SKIP_TOPIC, (payload) => {
        const n = payload as Partial<SkipNotice> | null
        if (typeof n?.tag !== 'string' || typeof n.from !== 'number' || typeof n.to !== 'number')
          return
        notices.push({ tag: n.tag, from: n.from, to: n.to })
        if (notices.length > 8) notices.shift()
      })

  const caughtUp = (seq: number) =>
    new Promise<void>((resolve) => {
      if (known >= seq) return resolve()
      const timer = setTimeout(resolve, CATCH_UP_MS)
      waiters.push({
        seq,
        done: () => {
          clearTimeout(timer)
          resolve()
        },
      })
    })

  /** apply in main; a guest also learns which of its own edits main held before it */
  const applyInMain = async (op: SlidesWireOp) => {
    const from = known
    for (let attempt = 0; attempt < 20; attempt++) {
      // main applies only once it holds no capture past `sent`
      const sent = known
      const r = await api.apply(op, sent)
      if (r.ok) {
        const late: Array<SlidesWireOp | null> = []
        for (let seq = from + 1; seq <= sent; seq++) late.push(recent.get(seq) ?? null)
        return { check: r.check, late }
      }
      if (r.wait === undefined) return null
      await caughtUp(r.wait)
    }
    return null
  }

  const log: OpLog<SlidesWireOp> = new OpLog<SlidesWireOp>(session, {
    topic: TOPIC,
    accept: async (op) => {
      if (!isWireOp(op)) return null
      const r = await applyInMain(op)
      if (!r) return null
      // numbered differently here: the host's numbers go out, the proposer starts over
      // (a capture number is the host's alone)
      const out =
        r.check === op.check && op.seq === undefined
          ? op
          : { ...op, check: r.check, seq: undefined }
      applied.add(out)
      return out
    },
    apply: async (op) => {
      if (applied.delete(op)) return
      if (!isWireOp(op)) {
        if (!host) void log.resync()
        return
      }
      if (skip && op.seq !== undefined && op.seq >= skip.from && op.seq <= skip.to) return
      const r = await applyInMain(op)
      if (host) return
      // the op did not land as it did elsewhere, or after an edit of ours it does not commute with
      if (!r || r.check !== op.check || r.late.some((own) => !own || !wireOpsCommute(own, op))) {
        void log.resync()
      }
    },
    snapshot: async () => {
      // the stream has every capture up to `known`; later ones are in the bytes too
      const seen = known
      const r = await api.snapshot()
      if (r.seq > seen) {
        session.send(SKIP_TOPIC, {
          tag: snapshotTag(r.bytes),
          from: seen + 1,
          to: r.seq,
        } satisfies SkipNotice)
      }
      return r.bytes
    },
    reload: async (bytes) => {
      const tag = snapshotTag(bytes)
      skip = notices.find((n) => n.tag === tag) ?? null
      const r = await api.reload(bytes)
      if (r) applyReloaded(r.slides)
    },
    commutes: wireOpsCommute,
  })

  const offCaptured = api.onCaptured(({ seq, op }) => {
    if (seq <= known) return
    known = seq
    recent.set(seq, op)
    recent.delete(seq - 64)
    if (op) log.submit(host ? { ...op, seq } : op)
    // a change the stream cannot carry: everyone takes the host's bytes
    else if (host) void log.rebase()
    else void log.resync()
    const ready = waiters.filter((w) => w.seq <= known)
    waiters = waiters.filter((w) => w.seq > known)
    for (const w of ready) w.done()
  })
  // listening first: the host's edits captured while sharing started come right after
  void api.begin(session.role)

  return () => {
    offCaptured()
    offSkip()
    log.dispose()
    for (const w of waiters) w.done()
    void api.end()
  }
}

export function useSlidesCollab(options: SlidesCollabOptions): SlidesCollab {
  const api = typeof window === 'undefined' ? undefined : window.slidesCollab
  const optionsRef = useRef(options)
  optionsRef.current = options
  const encryptedRef = useRef(false)
  /** a share attempt started capturing in main */
  const describedRef = useRef(false)
  const [peers, setPeers] = useState<PeerPresence[]>([])

  const refreshInfo = useCallback(() => {
    void api?.info().then((info) => {
      encryptedRef.current = info?.encrypted === true
    })
  }, [api])
  useEffect(() => {
    if (options.ready) refreshInfo()
  }, [options.ready, refreshInfo])

  // a reloaded page has no session: whatever main still held for this tab ends
  useEffect(() => {
    void api?.end()
  }, [api])

  useEffect(
    () =>
      api?.onBlocked((notice) => showToast(collabText(optionsRef.current.lang, notice), 'error')),
    [api],
  )

  const collab = useCollab({
    kind: 'slides',
    ready: options.ready,
    shareBlock: () => {
      if (encryptedRef.current) return 'encrypted'
      const o = optionsRef.current
      return o.masterView || !o.ready ? 'unsupported' : null
    },
    describe: async () => {
      if (!api) return null
      describedRef.current = true
      return api.describe()
    },
    bind: (session) => {
      if (!api) throw new Error('the deck has no co-editing bridge')
      describedRef.current = false
      return bindDeck(api, session, (slides) => optionsRef.current.applyReloaded(slides))
    },
  })
  const session = collab.session
  const role = collab.role

  // the host tells main whether anyone else is in (undo and the like wait for them to leave)
  useEffect(() => {
    if (role === 'host') api?.peers(collab.peers.length)
  }, [api, role, collab.peers.length])

  // a guest's copy never looks changed: the host saves it
  useEffect(() => {
    if (role === 'guest' && options.dirty) options.setDirty(false)
  }, [role, options.dirty, options.setDirty])

  // others' edits move slides around: stay on the same slide rather than the same index
  const sessionLiveRef = useRef(false)
  sessionLiveRef.current = session !== null
  const partRef = useRef<string | undefined>(undefined)
  partRef.current = options.slides[options.current]?.partPath
  useEffect(
    () =>
      window.slidesApi?.onDeckChanged?.(({ slides }) => {
        const part = partRef.current
        if (!sessionLiveRef.current || !part) return
        const index = slides.findIndex((s) => s.partPath === part)
        if (index >= 0) optionsRef.current.setCurrent(index)
      }),
    [],
  )

  // publish where this person is
  const slide = options.slides[options.current]
  const { selectedIds, editing } = options
  const lastRef = useRef<SlidePresence | null>(null)
  useEffect(() => {
    if (!session) {
      lastRef.current = null
      return
    }
    const timer = setTimeout(() => {
      const value: SlidePresence | null = slide?.partPath
        ? { slide: slide.partPath, boxes: presenceBoxes(slide, selectedIds), editing }
        : null
      if (samePresence(value, lastRef.current)) return
      lastRef.current = value
      session.setPresence(PRESENCE_FIELD, value)
    }, PRESENCE_MS)
    return () => clearTimeout(timer)
  }, [session, slide, selectedIds, editing])

  // ...and where everyone else is
  useEffect(() => {
    if (!session) {
      setPeers([])
      return
    }
    const read = () =>
      setPeers(
        session.presences<unknown>(PRESENCE_FIELD).flatMap(({ clientId, user, value }) => {
          const presence = presenceOf(value)
          const name = collabNameOf(user.name)
          return presence && name
            ? [{ clientId, name, color: collabColorOf(user.palette), value: presence }]
            : []
        }),
      )
    read()
    return session.onPeersChanged(read)
  }, [session])

  return {
    collab: {
      ...collab,
      openDialog: () => {
        refreshInfo()
        collab.openDialog()
      },
      share: async () => {
        const result = await collab.share()
        // main started capturing for a share that never went live
        if (result && describedRef.current) void api?.end()
        describedRef.current = false
        return result
      },
    },
    peers,
  }
}
