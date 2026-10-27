/**
 * LAN co-editing in the Hangul editor (decision 0073), as watch mode: the person
 * sharing edits and everyone who joins watches. Merging two people's edits would
 * need a change inside the editor, so the host's document goes out whole after
 * each pause in its work (collab-flow.ts), and a guest's editor shows it with its
 * menus hidden and its keys refused. The host's page is shown to guests.
 */
import { useEffect, useRef, useState, type MutableRefObject, type ReactElement } from 'react'
import type { ChromeVisibility, RhwpEditor } from '@rhwp/editor'
import type { Lang } from '@genoffice/i18n'
import {
  collabColorVar,
  collabText,
  useCollab,
  type CollabController,
  type CollabSession,
  type CollabStringKey,
} from '@genoffice/collab'
import { DIRTY_EVENT } from '../../studio-plugin/agent-plugin.mjs'
import type { HwpFormat } from '../shared/ipc'
import {
  LATEST_TOPIC,
  PRESENCE_FIELD,
  SNAPSHOT_TICK_MS,
  SNAPSHOT_TOPIC,
  createSnapshotPublisher,
  createSnapshotReceiver,
  guestKeyAllowed,
  hostPlaceOf,
  pageOfIndicator,
  snapshotOf,
  type HostPlace,
} from './collab-flow'
import './collab.css'

/** how often the host's page is looked up for guests */
const PRESENCE_MS = 1_000
/** a guest's stray edit is put back once the guest has left the editor alone this long */
const STRAY_RESTORE_MS = 1_000
/** a dirty flag this soon after a guest's input is that input's edit */
const STRAY_WINDOW_MS = 300
/** a refused key says why at most this often */
const REFUSED_FLASH_MS = 3_000

/** what the host's work in the editor looks like: it may have changed the document */
const HOST_INPUT_EVENTS = [
  'keydown',
  'input',
  'compositionend',
  'pointerdown',
  'pointerup',
  'paste',
  'cut',
  'drop',
]
/** what a guest may not do to the watched document */
const GUEST_REFUSED_EVENTS = ['keypress', 'beforeinput', 'paste', 'cut', 'drop', 'contextmenu']
/** how a guest's typing in an input method reaches the editor */
const GUEST_COMPOSING_EVENTS = ['compositionstart', 'compositionupdate', 'compositionend', 'input']

export interface HwpCollabOptions {
  editor: () => RhwpEditor | null
  /** the document is on screen */
  ready: boolean
  /** the format the document was opened in: what it is shared and watched as */
  format: () => HwpFormat
  /** the name guests see and their copy is written under */
  fileName: () => string
  isPasswordProtected: () => Promise<boolean>
  /** the plugin's count of document changes it did not make */
  foreignChanges: () => Promise<number>
  /** a save, a print or a recovery copy has the editor */
  busy: () => boolean
  /** true while this tab is a guest in a live session */
  guestRef: MutableRefObject<boolean>
  /** a guest's copy just became the person's own unsaved document */
  markUnsaved: () => void
}

export interface HwpCollab {
  collab: CollabController
  /** the document changed with no key or click in the editor (the AI panel) */
  noteChange: () => void
  /** guest: the person sharing and the page they are on */
  host: HostPlace | null
}

function frameOf(editor: RhwpEditor): Window | null {
  try {
    return editor.element.contentWindow
  } catch {
    return null
  }
}

/**
 * Moves with every change to the document. Neither counter alone sees them all: the
 * plugin counts the editor's `document-changed`, which typing in a table cell does not
 * fire, and the editor's `changeSeq` counts `document-mutated`, which table and picture
 * edits do not fire. The selection context fails for some caret places (deep in a table
 * cell); the publisher then goes by the host's input instead.
 */
async function changeMarkOf(editor: RhwpEditor, foreign: () => Promise<number>): Promise<string> {
  const [count, context] = await Promise.all([foreign(), editor.getSelectionContext()])
  return `${count}:${context.documentEpoch}:${context.changeSeq}`
}

async function pageOf(editor: RhwpEditor): Promise<number | null> {
  let shown: string | null | undefined
  try {
    shown = editor.element.contentDocument?.getElementById('sb-page')?.textContent
  } catch {
    shown = null
  }
  return (
    pageOfIndicator(shown) ??
    editor.getSelectionContext().then(
      (context) => context.page,
      () => null,
    )
  )
}

/** capture listeners on the editor's frame, ahead of the editor's own */
function listenFrame(
  editor: RhwpEditor,
  names: readonly string[],
  handler: (event: Event) => void,
): () => void {
  const frame = frameOf(editor)
  if (!frame) return () => {}
  for (const name of names) frame.addEventListener(name, handler, true)
  return () => {
    try {
      for (const name of names) frame.removeEventListener(name, handler, true)
    } catch {
      // the frame went away with its document
    }
  }
}

/** load the host's bytes where the guest was reading: a load scrolls back to the top */
async function loadKeepingPlace(editor: RhwpEditor, bytes: Uint8Array, name: string) {
  const scroller = () => {
    try {
      return editor.element.contentDocument?.getElementById('scroll-container') ?? null
    } catch {
      return null
    }
  }
  const before = scroller()
  const top = before?.scrollTop ?? 0
  const left = before?.scrollLeft ?? 0
  await editor.loadFile(bytes, name, { skipUnsavedGuard: true })
  const put = () => {
    const after = scroller()
    if (!after) return
    after.scrollTop = top
    after.scrollLeft = left
  }
  put()
  // the editor lays the pages out again over the next frames
  frameOf(editor)?.requestAnimationFrame(put)
  setTimeout(put, 200)
}

export function useHwpCollab(options: HwpCollabOptions): HwpCollab {
  const optionsRef = useRef(options)
  optionsRef.current = options
  /** the editor's answer to "is this document password protected"; null until it gave one */
  const protectedRef = useRef<boolean | null>(null)
  /** what describe() exported, for the host's binding */
  const sharedRef = useRef<{ base: Uint8Array; baseline: Uint8Array; mark: string | null } | null>(
    null,
  )
  const noteRef = useRef<(() => void) | null>(null)
  const flashRef = useRef<((key: CollabStringKey) => void) | null>(null)
  const [host, setHost] = useState<HostPlace | null>(null)

  const exportNow = (editor: RhwpEditor): Promise<Uint8Array> =>
    optionsRef.current.format() === 'hwpx' ? editor.exportHwpx() : editor.exportHwp()

  const bindHost = (session: CollabSession): (() => void) => {
    const editor = optionsRef.current.editor()
    const shared = sharedRef.current
    if (!editor || !shared) throw new Error('the document was not exported for sharing')
    const publisher = createSnapshotPublisher({
      base: shared.base,
      baseline: shared.baseline,
      baselineMark: shared.mark,
      source: {
        changeMark: () => changeMarkOf(editor, optionsRef.current.foreignChanges),
        exportBytes: async () => {
          // the bridge exports a protected document without its password
          if (await optionsRef.current.isPasswordProtected().catch(() => true)) {
            throw new Error('the document is password protected')
          }
          return exportNow(editor)
        },
      },
      publish: (snapshot) => session.send(SNAPSHOT_TOPIC, snapshot),
      isBusy: () => optionsRef.current.busy(),
    })
    const offLatest = session.handle(LATEST_TOPIC, () => publisher.latest())
    noteRef.current = () => publisher.noteChange()
    const offInput = listenFrame(editor, HOST_INPUT_EVENTS, () => publisher.noteInput())
    const ticker = setInterval(() => void publisher.tick(), SNAPSHOT_TICK_MS)
    // where the host is: the page its status bar shows, which follows the caret in a table
    // cell too (the selection context reads a cell's paragraph as a body one)
    let page: number | null = null
    const pager = setInterval(() => {
      void pageOf(editor).then((now) => {
        if (now === null || now === page) return
        page = now
        session.setPresence(PRESENCE_FIELD, { page })
      })
    }, PRESENCE_MS)
    return () => {
      clearInterval(ticker)
      clearInterval(pager)
      offInput()
      offLatest()
      noteRef.current = null
    }
  }

  const bindGuest = (session: CollabSession): (() => void) => {
    const editor = optionsRef.current.editor()
    const frame = editor && frameOf(editor)
    if (!editor || !frame) throw new Error('no editor to watch the shared document in')
    let unbound = false
    // what still gets through (a drag on a table border, a picture moved) is put back once
    // the guest stops. Its edit marks the copy changed in the same task as the input; the
    // editor's own page layout after a load marks it too, but later and on its own
    let lastInputAt = Number.NEGATIVE_INFINITY
    let strayTimer: ReturnType<typeof setTimeout> | null = null
    const restoreLater = () => {
      if (strayTimer) clearTimeout(strayTimer)
      strayTimer = setTimeout(() => {
        strayTimer = null
        receiver.restore()
      }, STRAY_RESTORE_MS)
    }
    const noteInput = () => {
      lastInputAt = Date.now()
      if (strayTimer) restoreLater()
    }
    const onDirty = (event: Event) => {
      const dirty = (event as CustomEvent<unknown>).detail === true
      if (dirty && Date.now() - lastInputAt <= STRAY_WINDOW_MS) restoreLater()
    }
    frame.addEventListener(DIRTY_EVENT, onDirty)
    const receiver = createSnapshotReceiver({
      load: (bytes) => loadKeepingPlace(editor, bytes, optionsRef.current.fileName()),
      isBusy: () => optionsRef.current.busy(),
    })
    const offSnapshot = session.on(SNAPSHOT_TOPIC, (payload) => {
      const snapshot = snapshotOf(payload)
      if (snapshot) receiver.offer(snapshot)
    })
    // the newest copy, and the bytes on screen to put back after a stray edit
    void session.request(LATEST_TOPIC, null).then(
      (payload) => {
        const snapshot = snapshotOf(payload)
        if (snapshot) receiver.offer(snapshot)
      },
      () => {},
    )

    let flashedAt = 0
    const sayViewOnly = () => {
      const at = Date.now()
      if (at - flashedAt < REFUSED_FLASH_MS) return
      flashedAt = at
      flashRef.current?.('viewOnly')
    }
    const refuse = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      sayViewOnly()
    }
    const offKeys = listenFrame(editor, ['keydown'], (event) => {
      noteInput()
      if (!guestKeyAllowed(event as KeyboardEvent)) refuse(event)
    })
    const offRefused = listenFrame(editor, GUEST_REFUSED_EVENTS, (event) => {
      noteInput()
      refuse(event)
    })
    // a refused key does not stop an input method: its text reaches the editor through
    // the hidden text area the editor types from, so that is cut off too (the zoom box stays)
    const offComposing = listenFrame(editor, GUEST_COMPOSING_EVENTS, (event) => {
      const field = event.target as HTMLTextAreaElement | null
      if (field?.tagName !== 'TEXTAREA') return
      noteInput()
      event.stopImmediatePropagation()
      // left there, the text would go into the document with the first key after the session
      if (event.type === 'input' || event.type === 'compositionend') field.value = ''
      sayViewOnly()
    })
    const offPointer = listenFrame(editor, ['pointerup'], noteInput)

    // the editor's menus and toolbar edit; the status bar (zoom) stays
    let chromeBefore: ChromeVisibility | null = null
    void editor.chrome.get().then(
      (before) => {
        if (unbound) return
        chromeBefore = before
        void editor.chrome.set({ menu: false, toolbar: false }).catch(() => {})
      },
      () => {},
    )

    const showHost = () => setHost(hostPlaceOf(session.peers(), session.presences(PRESENCE_FIELD)))
    showHost()
    const offPeers = session.onPeersChanged(showHost)

    optionsRef.current.guestRef.current = true
    return () => {
      unbound = true
      offSnapshot()
      offKeys()
      offRefused()
      offComposing()
      offPointer()
      offPeers()
      try {
        frame.removeEventListener(DIRTY_EVENT, onDirty)
      } catch {
        // the frame went away with its document
      }
      if (strayTimer) clearTimeout(strayTimer)
      receiver.dispose()
      const before = chromeBefore
      if (before) {
        const putBack = () => void editor.chrome.set(before).catch(() => {})
        // a show (F5) puts back the chrome it found when it ends: this goes back after that
        if (document.fullscreenElement) {
          document.addEventListener('fullscreenchange', putBack, { once: true })
        } else putBack()
      }
      setHost(null)
    }
  }

  const collab = useCollab({
    kind: 'hwp',
    ready: options.ready,
    // the bridge exports a protected document without its password: guests would get it in the clear
    shareBlock: () => (protectedRef.current === false ? null : 'encrypted'),
    describe: async () => {
      const o = optionsRef.current
      const editor = o.editor()
      if (!editor || (await o.isPasswordProtected().catch(() => true))) return null
      // read before the export: a change made while it runs moves the mark past this
      const mark = await changeMarkOf(editor, o.foreignChanges).catch(() => null)
      const format = o.format()
      const raw = await exportNow(editor)
      // what a save would write now: the corrections against the opened file, done in main
      const base = (await window.hwpApi.collabBase?.(raw, format).catch(() => null)) ?? raw
      sharedRef.current = { base, baseline: raw, mark }
      const fileName = o.fileName()
      return { title: fileName, fileName, base }
    },
    bind: (session) => (session.role === 'host' ? bindHost(session) : bindGuest(session)),
    onEnded: (role) => {
      if (role !== 'guest') return
      optionsRef.current.guestRef.current = false
      // the copy is this person's own unsaved document from now on
      optionsRef.current.markUnsaved()
    },
  })
  flashRef.current = collab.flash

  // asked again whenever the dialog opens, so the sync shareBlock has a fresh answer
  useEffect(() => {
    if (!options.ready) return
    let live = true
    void optionsRef.current.isPasswordProtected().then(
      (yes) => {
        if (live) protectedRef.current = yes
      },
      () => {
        if (live) protectedRef.current = null
      },
    )
    return () => {
      live = false
    }
  }, [options.ready, collab.dialogOpen])

  return { collab, noteChange: () => noteRef.current?.(), host }
}

function PageIcon() {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" fill="none" aria-hidden="true">
      <path
        d="M1.5 1.25h5l3 3v6.5h-8z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M6.5 1.25v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  )
}

/** A guest's line in the top bar: who is sharing, the page they are on, and that this is view only. */
export function HwpCollabStatus({
  collab,
  host,
  lang,
}: {
  collab: CollabController
  host: HostPlace | null
  lang: Lang
}): ReactElement | null {
  if (collab.role !== 'guest') return null
  return (
    <div className="hwp-collab-status" role="status">
      {host && (
        <span
          className="hwp-collab-host"
          style={{ ['--collab-c' as string]: collabColorVar(host.color) }}
        >
          <span className="hwp-collab-dot" aria-hidden="true" />
          <span className="hwp-collab-name">{host.name}</span>
          {host.page !== null && (
            <span className="hwp-collab-page">
              <PageIcon />
              {host.page}
            </span>
          )}
        </span>
      )}
      <span className="hwp-collab-viewonly">{collabText(lang, 'viewOnly')}</span>
    </div>
  )
}
