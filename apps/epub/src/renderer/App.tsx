/**
 * The EPUB editor: reading (spec §3 refusals and notices, §4 reading) and
 * editing (§5 editing, §6 saving).
 *
 * The book stays in the main process. This screen opens it, reads one
 * chapter at a time over IPC and draws it in a sandboxed frame
 * (`ChapterFrame`) as a cleaned copy whose blocks carry their engine ids
 * (`reader/chapter-html.ts`). Around it: the ribbon, the table of contents or
 * the in-book search on the left, and the status line. Editing inside the
 * frame, the history and find and replace are the edit controller's
 * (`edit/controller.ts`); this component wires keys, menus and buttons to it.
 * The AI panel docks at the right (`ai/AiDock.tsx`, spec §7). Book
 * translation (spec §8, `translate/BookTranslation.tsx`) opens from the
 * ribbon, the menu and the AI panel, and locks editing while it runs.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EpubTocEntry } from '@genoffice/epub-engine'
import type { Params } from '@genoffice/i18n'
import { useAutoSavePref } from '@genoffice/ui'
import { epubAssetUrl } from '../shared/asset-url'
import { EPUB_VIEW_PREFS_DEFAULT } from '../shared/ipc'
import type {
  EpubApi,
  EpubBookSummary,
  EpubChapterResult,
  EpubMenuCommand,
  EpubOpenFileResult,
  EpubReadOnlyReason,
  EpubViewPrefs,
  SaveMode,
} from '../shared/ipc'
import { openableLink } from '../shared/links'
import { EpubAiDock, useEpubAi } from './ai/AiDock'
import type { StartBookTranslation } from './ai/book-tools'
import { ChapterFrame, type FrameWheel } from './components/ChapterFrame'
import { EditHomeTools, EditQuickTools, ReplaceRow } from './components/EditTools'
import { Ribbon } from './components/Ribbon'
import { IconBlockedBook, IconNext, IconPrev } from './components/icons'
import { SearchPane, TocPane, type SearchView } from './components/SidePanes'
import { useI18n, type StringKey } from './i18n/locale'
import { EpubEditController, type EditState, type ReplaceAllOutcome } from './edit/controller'
import { belongsToField, shortcutOf, type EditCommand } from './edit/shortcuts'
import {
  buildTextIndex,
  normalizeQuery,
  rangeOf,
  searchBook,
  type BookSearchHit,
} from './reader/book-search'
import { buildChapterHtml } from './reader/chapter-html'
import {
  applyViewCss,
  blockElement,
  fragmentElement,
  scrollToElement,
  scrollToEnd,
  scrollToStart,
  showHit,
  topBlockId,
  type ChapterTarget,
} from './reader/frame-dom'
import { routeLink } from './reader/links'
import {
  OVERSCROLL_IDLE,
  currentTocEntry,
  firstReadingIndex,
  nextReadingIndex,
  overscroll,
} from './reader/navigation'
import { stepFontScale, viewPrefsCss, type FrameColors } from './reader/view-prefs'
import { BookTranslation, type BookTranslationHandle } from './translate/BookTranslation'
import { TranslateButton } from './translate/TranslateButton'

type Phase =
  | { kind: 'loading' }
  | { kind: 'no-book' }
  | { kind: 'refused'; reason: Extract<EpubOpenFileResult, { status: 'refused' }>['reason'] }
  | {
      kind: 'open'
      book: EpubBookSummary
      assetBase: string
      readOnly: EpubReadOnlyReason | null
    }

type OkChapter = Extract<EpubChapterResult, { ok: true }>

interface ShownChapter {
  spineIndex: number
  chapter: OkChapter
  html: string
  /** remounts the frame for every load */
  key: number
}

interface Notice {
  key: StringKey
  params?: Params
  /** further sentences shown after it */
  more?: Notice[]
}

/** How long the reader rests before the reading position is remembered. */
const POSITION_DELAY_MS = 700
/** How long a passing notice stays in the status line. */
const NOTICE_MS = 6000
/** Auto save: every 30 seconds and when the window loses focus (the other editors' rhythm). */
const AUTO_SAVE_INTERVAL_MS = 30_000

const REFUSAL_TEXT: Record<Extract<Phase, { kind: 'refused' }>['reason'], StringKey> = {
  damaged: 'refusedDamaged',
  'too-large': 'refusedDamaged',
  'not-epub': 'refusedNotEpub',
  drm: 'refusedDrm',
  unreadable: 'refusedUnreadable',
}

const READ_ONLY_TEXT: Record<EpubReadOnlyReason, StringKey> = {
  'fixed-layout-book': 'readOnlyFixedBook',
  'fixed-layout-chapter': 'readOnlyFixedChapter',
  'broken-chapter': 'readOnlyBroken',
}

/** The status line sentence of a replace all. */
function replaceAllNotice(outcome: ReplaceAllOutcome): Notice {
  const parts: Notice[] = []
  if (outcome.replaced > 0)
    parts.push({ key: 'editReplaceDone', params: { count: outcome.replaced } })
  if (outcome.skipped > 0)
    parts.push({ key: 'editReplaceSkipped', params: { count: outcome.skipped } })
  if (outcome.failed > 0)
    parts.push({ key: 'editReplaceFailed', params: { count: outcome.failed } })
  const [first, ...more] = parts
  return first ? { ...first, more } : { key: 'editReplaceNone' }
}

/** The focus left the app (moving into the chapter frame blurs the page's window but stays in it). */
function focusLeftApp(): boolean {
  return !document.hasFocus()
}

const SEARCH_IDLE: SearchView = {
  running: false,
  done: 0,
  total: 0,
  hits: [],
  truncated: false,
  unreadable: 0,
  finished: false,
}

/** The frame's colours: the page's `--epub-*` properties and search tokens (styles.css), with system colours as a fallback. */
function frameColors(): FrameColors {
  const style = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    paper: read('--epub-paper', 'Canvas'),
    ink: read('--epub-ink', 'CanvasText'),
    nightPaper: read('--epub-night-paper', 'Canvas'),
    nightInk: read('--epub-night-ink', 'CanvasText'),
    nightLink: read('--epub-night-link', 'LinkText'),
    hitBg: read('--search-hit-active-bg', 'Mark'),
    hitInk: read('--search-hit-active-ink', 'MarkText'),
  }
}

/** The reading text of a chapter as the frame will show it (the search's view of a chapter). */
function chapterReadingText(chapter: OkChapter, assetBase: string): string {
  const html = buildChapterHtml({
    source: chapter.source,
    broken: chapter.broken,
    blocks: chapter.broken ? [] : chapter.blocks,
    baseUrl: epubAssetUrl(assetBase, chapter.path),
  })
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return buildTextIndex(doc.body).text
}

export default function App(): React.JSX.Element {
  const { lang, t } = useI18n()
  const api = window.epubApi
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [prefs, setPrefs] = useState<EpubViewPrefs>(EPUB_VIEW_PREFS_DEFAULT)
  const [shown, setShown] = useState<ShownChapter | null>(null)
  const [chapterFailed, setChapterFailed] = useState<number | null>(null)
  const [side, setSide] = useState<'toc' | 'search' | null>('toc')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [closeMenus, setCloseMenus] = useState(0)
  const [search, setSearch] = useState<SearchView>(SEARCH_IDLE)
  const [activeHit, setActiveHit] = useState(-1)
  const [searchFocus, setSearchFocus] = useState(0)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [replacement, setReplacement] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [autoSave, setAutoSave] = useAutoSavePref('epubapp.autoSave', api)
  /** the book's file: the AI panel keeps its conversation per file */
  const [filePath, setFilePath] = useState<string | null>(null)

  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const shownRef = useRef(shown)
  shownRef.current = shown
  const frameDocRef = useRef<Document | null>(null)
  const pendingTargetRef = useRef<ChapterTarget>({ kind: 'start' })
  const loadTokenRef = useRef(0)
  const positionTimerRef = useRef<number | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const overscrollRef = useRef(OVERSCROLL_IDLE)
  const searchTokenRef = useRef(0)
  const searchTextCache = useRef(new Map<number, { path: string; version: number; text: string }>())
  const hitsRef = useRef<BookSearchHit[]>([])
  hitsRef.current = search.hits
  const activeHitRef = useRef(activeHit)
  activeHitRef.current = activeHit
  /** the find field's text as it is now; the last query searched */
  const queryRef = useRef('')
  const searchedRef = useRef('')
  const savingRef = useRef(false)
  /** the book translation window is open: automatic saves wait */
  const translationWindowRef = useRef(false)
  const frameBlurRef = useRef<(() => void) | null>(null)
  const goToRef = useRef<(spineIndex: number, target: ChapterTarget) => Promise<void>>(
    async () => {},
  )
  const flashRef = useRef<(next: Notice | null) => void>(() => {})
  const editRef = useRef<EpubEditController | null>(null)
  if (!editRef.current) {
    editRef.current = new EpubEditController({
      api,
      chapterHtml: (chapter) => {
        const open = phaseRef.current
        return buildChapterHtml({
          source: chapter.source,
          broken: false,
          blocks: chapter.blocks,
          baseUrl: open.kind === 'open' ? epubAssetUrl(open.assetBase, chapter.path) : '',
          viewCss: viewPrefsCss(prefsRef.current, frameColors()),
        })
      },
      readingText: (chapter) => {
        const open = phaseRef.current
        return open.kind === 'open' ? chapterReadingText(chapter, open.assetBase) : ''
      },
      showChapter: (spineIndex, blockId) =>
        void goToRef.current(
          spineIndex,
          blockId ? { kind: 'block', id: blockId } : { kind: 'start' },
        ),
      notify: (notice) => flashRef.current(notice),
      changed: () => setEditState(editRef.current!.state()),
    })
  }
  const editor = editRef.current
  const [editState, setEditState] = useState<EditState>(() => editor.state())

  const book = phase.kind === 'open' ? phase.book : null
  const translateRef = useRef<BookTranslationHandle>(null)

  const readChapterForAi = useCallback((spineIndex: number) => api.readChapter(spineIndex), [api])
  // the AI panel's start_book_translation only opens the translation window
  const startBookTranslation = useCallback<StartBookTranslation>(
    (request) =>
      translateRef.current?.requestOpen({ lang: request.lang, chapters: request.chapters }) ?? {
        unavailable: true,
      },
    [],
  )
  const ai = useEpubAi({
    book,
    readChapter: readChapterForAi,
    editor,
    shownChapter: shownRef,
    frameDoc: frameDocRef,
    startBookTranslation,
  })

  const flash = useCallback((next: Notice | null) => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    setNotice(next)
    noticeTimerRef.current = next
      ? window.setTimeout(() => {
          noticeTimerRef.current = null
          setNotice(null)
        }, NOTICE_MS)
      : null
  }, [])
  flashRef.current = flash

  // ---- reading position ----

  const rememberPosition = useCallback(() => {
    const doc = frameDocRef.current
    const current = shownRef.current
    if (!doc || !current) return
    api.setReadPosition({ spineIndex: current.spineIndex, blockId: topBlockId(doc) })
  }, [api])

  const schedulePosition = useCallback(() => {
    if (positionTimerRef.current !== null) window.clearTimeout(positionTimerRef.current)
    positionTimerRef.current = window.setTimeout(() => {
      positionTimerRef.current = null
      rememberPosition()
    }, POSITION_DELAY_MS)
  }, [rememberPosition])

  // ---- moving through the book ----

  const applyTarget = useCallback((doc: Document, target: ChapterTarget) => {
    switch (target.kind) {
      case 'start':
        scrollToStart(doc)
        break
      case 'end':
        scrollToEnd(doc)
        break
      case 'block': {
        const el = blockElement(doc, target.id)
        if (el) scrollToElement(el)
        else scrollToStart(doc)
        break
      }
      case 'fragment': {
        const el = fragmentElement(doc, target.id)
        if (el) scrollToElement(el)
        else scrollToStart(doc)
        break
      }
      case 'hit': {
        const range = rangeOf(doc, buildTextIndex(doc.body), target.start, target.length)
        if (range) showHit(doc, range)
        break
      }
    }
  }, [])

  /** Shows chapter `spineIndex` and puts the reader at `target`. */
  const goTo = useCallback(
    async (spineIndex: number, target: ChapterTarget) => {
      const open = phaseRef.current
      if (open.kind !== 'open') return
      overscrollRef.current = OVERSCROLL_IDLE
      const current = shownRef.current
      const doc = frameDocRef.current
      if (current && current.spineIndex === spineIndex && doc) {
        loadTokenRef.current++
        applyTarget(doc, target)
        schedulePosition()
        return
      }
      const token = ++loadTokenRef.current
      const chapter = await api.readChapter(spineIndex)
      if (token !== loadTokenRef.current) return
      if (!chapter.ok) {
        frameDocRef.current = null
        setShown(null)
        setChapterFailed(spineIndex)
        return
      }
      const html = buildChapterHtml({
        source: chapter.source,
        broken: chapter.broken,
        blocks: chapter.broken ? [] : chapter.blocks,
        baseUrl: epubAssetUrl(open.assetBase, chapter.path),
        viewCss: viewPrefsCss(prefsRef.current, frameColors()),
      })
      pendingTargetRef.current = target
      frameDocRef.current = null
      setChapterFailed(null)
      setShown({ spineIndex, chapter, html, key: token })
    },
    [api, applyTarget, schedulePosition],
  )

  goToRef.current = goTo

  const turn = useCallback(
    (dir: 1 | -1) => {
      const open = phaseRef.current
      const current = shownRef.current
      if (open.kind !== 'open' || !current) return
      const next = nextReadingIndex(open.book.spine, current.spineIndex, dir)
      if (next !== null) void goTo(next, { kind: dir > 0 ? 'start' : 'end' })
    },
    [goTo],
  )

  // ---- opening ----

  useEffect(() => {
    let alive = true
    void (async () => {
      const path = await api.consumePending().catch(() => null)
      if (!alive) return
      if (!path) {
        setPhase({ kind: 'no-book' })
        return
      }
      setFilePath(path)
      const opened = await api
        .openFile(path)
        .catch((): EpubOpenFileResult => ({ status: 'refused', reason: 'unreadable' }))
      if (!alive) return
      if (opened.status === 'refused') {
        setPhase({ kind: 'refused', reason: opened.reason })
        return
      }
      const state = await api.getReadingState().catch(() => null)
      if (!alive) return
      if (state) setPrefs(state.viewPrefs)
      const next: Phase = {
        kind: 'open',
        book: opened.book,
        assetBase: opened.assetBase,
        readOnly: opened.readOnly,
      }
      phaseRef.current = next
      setPhase(next)
      editor.setBookReadOnly(opened.readOnly !== null)
      const spine = opened.book.spine
      const remembered = state?.position
      if (remembered && remembered.spineIndex < spine.length) {
        void goTo(
          remembered.spineIndex,
          remembered.blockId ? { kind: 'block', id: remembered.blockId } : { kind: 'start' },
        )
      } else if (spine.length > 0) {
        void goTo(firstReadingIndex(spine), { kind: 'start' })
      }
    })()
    return () => {
      alive = false
    }
  }, [api, goTo, editor])

  // ---- view settings ----

  const updatePrefs = useCallback(
    (patch: Partial<EpubViewPrefs>) => {
      setPrefs((prev) => ({ ...prev, ...patch }))
      void api
        .setViewPrefs(patch)
        .then(setPrefs)
        .catch(() => {})
    },
    [api],
  )

  useEffect(() => api.onViewPrefsChanged(setPrefs), [api])

  useEffect(() => {
    const doc = frameDocRef.current
    if (doc) applyViewCss(doc, viewPrefsCss(prefs, frameColors()))
  }, [prefs])

  // ---- search ----

  const openSearch = useCallback(() => {
    if (phaseRef.current.kind !== 'open') return
    setSide('search')
    setSearchFocus((n) => n + 1)
  }, [])

  const runSearch = useCallback(
    async (query: string): Promise<BookSearchHit[] | null> => {
      const open = phaseRef.current
      if (open.kind !== 'open') return null
      // what is typed in the chapter counts
      await editor.flush()
      searchedRef.current = query
      const token = ++searchTokenRef.current
      const total = open.book.spine.length
      setActiveHit(-1)
      setSearch({ ...SEARCH_IDLE, running: true, total })
      const result = await searchBook({
        query,
        chapterCount: total,
        isCancelled: () => token !== searchTokenRef.current,
        onProgress: (done) => {
          if (token === searchTokenRef.current) {
            setSearch((prev) => ({ ...prev, done }))
          }
        },
        chapterText: async (i) => {
          const chapter = await api.readChapter(i).catch(() => null)
          if (!chapter || !chapter.ok) return null
          const cached = searchTextCache.current.get(i)
          if (cached && cached.path === chapter.path && cached.version === chapter.version) {
            return cached.text
          }
          const text = chapterReadingText(chapter, open.assetBase)
          searchTextCache.current.set(i, { path: chapter.path, version: chapter.version, text })
          return text
        },
      })
      if (token !== searchTokenRef.current || result.cancelled) return null
      setSearch({
        running: false,
        done: total,
        total,
        hits: result.hits,
        truncated: result.truncated,
        unreadable: result.unreadable.length,
        finished: query.trim() !== '',
      })
      return result.hits
    },
    [api, editor],
  )

  const focusHit = useCallback(
    (hits: readonly BookSearchHit[], index: number) => {
      const hit = hits[index]
      if (!hit) return
      setActiveHit(index)
      activeHitRef.current = index
      void goTo(hit.spineIndex, { kind: 'hit', start: hit.start, length: hit.length })
    },
    [goTo],
  )

  const pickHit = useCallback((index: number) => focusHit(hitsRef.current, index), [focusHit])

  // the find field starts empty whenever the pane opens again
  useEffect(() => {
    if (side !== 'search') queryRef.current = ''
  }, [side])

  // ---- replace (spec §5): one match on screen, or every match in the book ----

  const openReplace = useCallback(() => {
    if (phaseRef.current.kind !== 'open') return
    setReplaceOpen(true)
    setSide('search')
    setSearchFocus((n) => n + 1)
  }, [])

  const replaceOne = useCallback(async () => {
    const hits = hitsRef.current
    if (hits.length === 0) return
    const index = activeHitRef.current
    const hit = hits[index]
    const current = shownRef.current
    const doc = frameDocRef.current
    // the first press shows the match; the next one replaces it
    if (!hit || !current || current.spineIndex !== hit.spineIndex || !doc) {
      focusHit(hits, Math.max(0, index))
      return
    }
    const range = rangeOf(doc, buildTextIndex(doc.body), hit.start, hit.length)
    setReplacing(true)
    try {
      const done = range ? await editor.replaceRange(range, replacement) : false
      if (!done) {
        flash({ key: 'editReplaceNotHere' })
        focusHit(hits, index + 1)
        return
      }
      const next = await runSearch(searchedRef.current)
      if (next && next.length > 0) focusHit(next, Math.min(index, next.length - 1))
    } finally {
      setReplacing(false)
    }
  }, [editor, flash, replacement, runSearch, focusHit])

  const replaceAll = useCallback(async () => {
    const open = phaseRef.current
    const query = queryRef.current
    if (open.kind !== 'open' || !normalizeQuery(query)) return
    setReplacing(true)
    try {
      const outcome = await editor.replaceAll(query, replacement, open.book.spine.length)
      if (!outcome) return
      flash(replaceAllNotice(outcome))
      await runSearch(query)
    } finally {
      setReplacing(false)
    }
  }, [editor, flash, replacement, runSearch])

  // ---- saving (the editing screen sends its pending edits before these) ----

  const save = useCallback(
    async (mode: SaveMode, auto = false): Promise<boolean> => {
      if (phaseRef.current.kind !== 'open') return false
      savingRef.current = true
      if (!auto) flash({ key: 'saving' })
      try {
        // what was typed goes into the book before it is written
        await editor.flush()
        const mark = editor.saveMark()
        const result = await api.save(auto ? { mode, auto } : { mode })
        if (!result.ok) {
          // an automatic save that defers to another pane of the same book says nothing
          if (!(auto && result.error === 'external-modified')) {
            flash({ key: result.error === 'external-modified' ? 'saveConflict' : 'saveFailed' })
          }
          return false
        }
        if ('canceled' in result) {
          flash(null)
          return false
        }
        editor.saved(mark)
        setFilePath(result.path)
        if (!auto) flash({ key: result.written ? 'saved' : 'savedUnchanged' })
        return true
      } catch {
        flash({ key: 'saveFailed' })
        return false
      } finally {
        savingRef.current = false
      }
    },
    [api, editor, flash],
  )

  useEffect(
    () =>
      api.onSaveRequest((mode) => {
        if (phaseRef.current.kind !== 'open') {
          api.sendSaveRequestAck(false)
          return
        }
        void save(mode).then((saved) => {
          // a save that ended before reaching the main process still has someone waiting
          if (!saved) api.sendSaveRequestAck(false)
        })
      }),
    [api, save],
  )

  // auto save: every 30 seconds and when the app loses focus, with the shell-wide setting
  const bookWritable = phase.kind === 'open' && phase.readOnly === null
  useEffect(() => {
    if (!autoSave || !bookWritable) {
      frameBlurRef.current = null
      return
    }
    const tick = (): void => {
      // an input method is composing: this save waits for the next occasion. The book
      // translation window counts the saved book: its start saves what is unsaved itself
      if (savingRef.current || editor.composing || translationWindowRef.current) return
      void editor.flush().then(() => {
        if (editor.dirty && !savingRef.current) void save('save', true)
      })
    }
    // leaving the page for the chapter frame is not leaving the app
    const onBlur = (): void => {
      window.setTimeout(() => {
        if (focusLeftApp()) tick()
      }, 0)
    }
    const id = window.setInterval(tick, AUTO_SAVE_INTERVAL_MS)
    window.addEventListener('blur', onBlur)
    frameBlurRef.current = onBlur
    return () => {
      window.clearInterval(id)
      window.removeEventListener('blur', onBlur)
      frameBlurRef.current = null
    }
  }, [autoSave, bookWritable, editor, save])

  useEffect(
    () =>
      api.onCloseSaveRequest(() => {
        void save('save').then((ok) => api.sendCloseSaveResult(ok))
      }),
    [api, save],
  )

  // ---- book translation (spec §8) ----

  /** the ribbon's button and the menu: open the window, or say why not */
  const openTranslation = useCallback(() => {
    const answer = translateRef.current?.requestOpen({ lang: null, chapters: null })
    if (!answer) return
    if ('running' in answer) flash({ key: 'btBusy', params: answer.running })
    else if ('unavailable' in answer) {
      const open = phaseRef.current
      if (open.kind === 'open' && open.book.fixedLayout) flash({ key: 'btFixedLayout' })
    }
  }, [flash])

  const lockForTranslation = useCallback(
    (locked: boolean) => editor.setTranslationLock(locked),
    [editor],
  )
  const isDirtyForTranslation = useCallback(() => editor.dirty, [editor])
  const saveForTranslation = useCallback(() => save('save'), [save])
  const translationWindowChanged = useCallback((open: boolean) => {
    translationWindowRef.current = open
  }, [])

  // ---- commands from the menu, keys, the shell ----

  /** Keys, menus and buttons: one way in. */
  const runCommand = useCallback(
    (command: EditCommand) => {
      switch (command) {
        case 'undo':
          void editor.undo()
          break
        case 'redo':
          void editor.redo()
          break
        case 'find':
          openSearch()
          break
        case 'replace':
          openReplace()
          break
        case 'save':
          void save('save')
          break
        case 'saveAs':
          void save('saveAs')
          break
        case 'bold':
          void editor.toggleMark('bold')
          break
        case 'italic':
          void editor.toggleMark('italic')
          break
      }
    },
    [editor, openReplace, openSearch, save],
  )
  const commandRef = useRef(runCommand)
  commandRef.current = runCommand

  const onMenuCommand = useCallback(
    (command: EpubMenuCommand) => {
      switch (command) {
        case 'undo':
        case 'redo':
        case 'find':
        case 'replace':
          runCommand(command)
          break
        case 'zoom-in':
          updatePrefs({ fontScale: stepFontScale(prefsRef.current.fontScale, 1) })
          break
        case 'zoom-out':
          updatePrefs({ fontScale: stepFontScale(prefsRef.current.fontScale, -1) })
          break
        case 'zoom-reset':
          updatePrefs({ fontScale: 1 })
          break
        case 'translate-book':
          openTranslation()
          break
        default:
          break
      }
    },
    [runCommand, updatePrefs, openTranslation],
  )
  const menuCommandRef = useRef(onMenuCommand)
  menuCommandRef.current = onMenuCommand
  useEffect(() => api.onMenuCommand((command) => menuCommandRef.current(command)), [api])

  useEffect(() => api.onChromePressed(() => setCloseMenus((n) => n + 1)), [api])

  // the AI panel's conversation follows the file (an older preload may lack the event)
  useEffect(() => (api as Partial<EpubApi>).onFileRenamed?.(setFilePath), [api])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const command = shortcutOf(e)
      if (!command || belongsToField(command, e.target)) return
      e.preventDefault()
      commandRef.current(command)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(
    () => () => {
      if (positionTimerRef.current !== null) {
        window.clearTimeout(positionTimerRef.current)
        rememberPosition()
      }
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
      editor.detach()
    },
    [rememberPosition, editor],
  )

  // ---- the frame ----

  const onFrameReady = useCallback(
    (doc: Document) => {
      frameDocRef.current = doc
      applyViewCss(doc, viewPrefsCss(prefsRef.current, frameColors()))
      const current = shownRef.current
      if (current) editor.attach(doc, current.chapter)
      // the app losing focus while the chapter holds it (auto save)
      doc.defaultView?.addEventListener('blur', () => frameBlurRef.current?.())
      applyTarget(doc, pendingTargetRef.current)
      schedulePosition()
    },
    [applyTarget, schedulePosition, editor],
  )

  const onFrameLink = useCallback(
    (href: string | null) => {
      const open = phaseRef.current
      const current = shownRef.current
      if (open.kind !== 'open' || !current) return
      const route = routeLink(
        href,
        epubAssetUrl(open.assetBase, current.chapter.path),
        open.assetBase,
        open.book.spine.map((item) => item.path),
      )
      if (route.kind === 'chapter') {
        void goTo(
          route.spineIndex,
          route.fragment ? { kind: 'fragment', id: route.fragment } : { kind: 'start' },
        )
      } else if (route.kind === 'outside') {
        if (!openableLink(route.url)) {
          flash({ key: 'linkNotOpened', params: { url: route.url } })
          return
        }
        void api
          .openLink(route.url)
          .then((opened) => {
            if (!opened) flash({ key: 'linkNotOpened', params: { url: route.url } })
          })
          .catch(() => {})
      }
    },
    [api, goTo, flash],
  )

  const onFrameWheel = useCallback(
    (wheel: FrameWheel) => {
      const step = overscroll(overscrollRef.current, { ...wheel, time: performance.now() })
      overscrollRef.current = step.state
      if (step.turn) turn(step.turn)
    },
    [turn],
  )

  const onFrameKey = useCallback(
    (e: KeyboardEvent, edges: { atStart: boolean; atEnd: boolean }) => {
      const command = shortcutOf(e)
      if (command) {
        e.preventDefault()
        commandRef.current(command)
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // a space typed into a block is text, not a page turn
      const typing = (e.target as Element | null)?.closest?.('[contenteditable="true"]')
      const space = e.key === ' ' && !typing
      const forward = e.key === 'PageDown' || (space && !e.shiftKey)
      const backward = e.key === 'PageUp' || (space && e.shiftKey)
      if (forward && edges.atEnd) {
        e.preventDefault()
        turn(1)
      } else if (backward && edges.atStart) {
        e.preventDefault()
        turn(-1)
      }
    },
    [turn],
  )

  const onFramePress = useCallback(() => setCloseMenus((n) => n + 1), [])

  // ---- what is drawn ----

  const tocEntries = book?.toc.entries ?? []
  const tocCurrent = shown ? currentTocEntry(tocEntries, shown.spineIndex) : -1
  const chapterNames = useMemo(() => {
    const names = new Map<number, string>()
    for (const entry of book?.toc.entries ?? []) {
      if (entry.spineIndex !== null && !names.has(entry.spineIndex) && entry.title.trim()) {
        names.set(entry.spineIndex, entry.title.trim())
      }
    }
    return names
  }, [book])

  const onTocPick = useCallback(
    (entry: EpubTocEntry) => {
      if (entry.spineIndex === null) return
      void goTo(
        entry.spineIndex,
        entry.fragment ? { kind: 'fragment', id: entry.fragment } : { kind: 'start' },
      )
    },
    [goTo],
  )

  if (phase.kind === 'loading') {
    return (
      <div className="epub-app">
        <div className="center-note">{t('loading')}</div>
      </div>
    )
  }

  if (phase.kind === 'no-book') {
    return (
      <div className="epub-app">
        <div className="center-note">{t('noBook')}</div>
      </div>
    )
  }

  if (phase.kind === 'refused') {
    return (
      <div className="epub-app">
        <div className="epub-refusal" role="alert" data-reason={phase.reason}>
          <IconBlockedBook />
          <div className="epub-refusal-title">{t('refusedTitle')}</div>
          <div className="epub-refusal-text">{t(REFUSAL_TEXT[phase.reason])}</div>
        </div>
      </div>
    )
  }

  const spine = phase.book.spine
  const readOnly: EpubReadOnlyReason | null = phase.readOnly ?? shown?.chapter.readOnly ?? null
  const canReplace = phase.readOnly === null && !editState.locked
  const noticeText = notice
    ? [notice, ...(notice.more ?? [])].map((n) => t(n.key, n.params)).join(' · ')
    : ''
  const prevIndex = shown ? nextReadingIndex(spine, shown.spineIndex, -1) : null
  const nextIndex = shown ? nextReadingIndex(spine, shown.spineIndex, 1) : null

  return (
    <div className="epub-app">
      <Ribbon
        hasBook
        prefs={prefs}
        searchOpen={side === 'search'}
        tocOpen={side === 'toc'}
        closeMenusSignal={closeMenus}
        quickTools={
          <EditQuickTools
            canUndo={editState.canUndo && !editState.locked}
            canRedo={editState.canRedo && !editState.locked}
            autoSave={autoSave}
            enabled={phase.readOnly === null}
            onUndo={() => runCommand('undo')}
            onRedo={() => runCommand('redo')}
            onToggleAutoSave={setAutoSave}
          />
        }
        homeEditTools={
          <EditHomeTools
            editable={editState.editable}
            canReplace={canReplace}
            replaceOpen={side === 'search' && replaceOpen}
            onBold={() => runCommand('bold')}
            onItalic={() => runCommand('italic')}
            onReplace={() =>
              side === 'search' && replaceOpen ? setReplaceOpen(false) : openReplace()
            }
          />
        }
        translateTools={
          <TranslateButton
            t={t}
            hasBook
            fixedLayout={phase.book.fixedLayout}
            onClick={openTranslation}
          />
        }
        onSave={() => void save('save')}
        onSaveAs={() => void save('saveAs')}
        onFind={() => (side === 'search' ? setSide(null) : openSearch())}
        onFontScale={(fontScale) => updatePrefs({ fontScale })}
        onFontStep={(dir) => updatePrefs({ fontScale: stepFontScale(prefs.fontScale, dir) })}
        onLineHeight={(lineHeight) => updatePrefs({ lineHeight })}
        onToggleDark={() => updatePrefs({ dark: !prefs.dark })}
        onToggleToc={() => setSide((s) => (s === 'toc' ? null : 'toc'))}
      />
      <div className="epub-main">
        {side === 'toc' && (
          <TocPane
            entries={tocEntries}
            current={tocCurrent}
            onPick={onTocPick}
            onClose={() => setSide(null)}
          />
        )}
        {side === 'search' && (
          <SearchPane
            view={search}
            active={activeHit}
            focusSignal={searchFocus}
            chapterName={(i) => chapterNames.get(i) ?? t('chapterLabel', { n: i + 1 })}
            onSearch={(query) => void runSearch(query)}
            onPick={pickHit}
            onQueryChange={(query) => {
              queryRef.current = query
            }}
            onClose={() => {
              searchTokenRef.current++
              setSide(null)
              setReplaceOpen(false)
            }}
          >
            {replaceOpen && (
              <ReplaceRow
                value={replacement}
                disabled={!canReplace}
                hasHits={search.hits.length > 0}
                busy={replacing}
                onChange={setReplacement}
                onReplace={() => void replaceOne()}
                onReplaceAll={() => void replaceAll()}
              />
            )}
          </SearchPane>
        )}
        <section className="epub-reader">
          <BookTranslation
            ref={translateRef}
            book={phase.book}
            filePath={filePath}
            lang={lang}
            t={t}
            api={api}
            isDirty={isDirtyForTranslation}
            save={saveForTranslation}
            lock={lockForTranslation}
            onWindowOpen={translationWindowChanged}
          />
          {readOnly && shown && (
            <div className="epub-chapter-notice" role="note" data-reason={readOnly}>
              {t(READ_ONLY_TEXT[readOnly])}
            </div>
          )}
          <div className="epub-frame-wrap">
            {shown ? (
              <ChapterFrame
                key={shown.key}
                html={shown.html}
                title={chapterNames.get(shown.spineIndex) ?? t('chapterFrame')}
                onReady={onFrameReady}
                onLink={onFrameLink}
                onWheel={onFrameWheel}
                onScroll={schedulePosition}
                onKeyDown={onFrameKey}
                onPress={onFramePress}
              />
            ) : (
              <div className="center-note">
                {chapterFailed !== null ? t('chapterFailed') : t('loading')}
              </div>
            )}
          </div>
          <div className="epub-turn-bar">
            <button
              type="button"
              className="epub-turn"
              data-action="prev-chapter"
              disabled={prevIndex === null}
              onClick={() => turn(-1)}
            >
              <IconPrev />
              {t('prevChapter')}
            </button>
            <button
              type="button"
              className="epub-turn"
              data-action="next-chapter"
              disabled={nextIndex === null}
              onClick={() => turn(1)}
            >
              {t('nextChapter')}
              <IconNext />
            </button>
          </div>
        </section>
        <EpubAiDock ai={ai} filePath={filePath} />
      </div>
      <footer className="epub-status" aria-live="polite">
        <span className="epub-status-chapter">
          {shown ? t('statusChapter', { n: shown.spineIndex + 1, total: spine.length }) : ''}
        </span>
        {readOnly && (
          <span className="epub-status-readonly" data-reason={readOnly}>
            {t(READ_ONLY_TEXT[readOnly])}
          </span>
        )}
        {editState.locked && <span className="epub-status-locked">{t('editLocked')}</span>}
        <span className="epub-status-spacer" />
        {notice && <span className="epub-status-notice">{noticeText}</span>}
        {editState.dirty && (
          <span className="epub-status-dirty" data-dirty="true">
            {t('editUnsaved')}
          </span>
        )}
      </footer>
    </div>
  )
}
