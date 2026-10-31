/**
 * The book preview: the book as an e-book reader shows it, page by page on a
 * chosen screen (an e-reader, a phone, a tablet, or the whole area), with the
 * reader's text size and paper. It covers the chapter view until it is closed
 * and never edits: the editing frame stays loaded underneath.
 *
 * A chapter is drawn in its own sandboxed frame from the same cleaned copy as
 * the editing view (`buildChapterHtml`), so the book's code never runs here
 * either. The pages are CSS columns (`reader/preview-pages.ts`); turning a
 * page scrolls the frame, and the last page of a chapter turns to the next
 * chapter in reading order. The text comes from the main process as it is
 * now, unsaved edits included, and is read again when the book changes.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Dropdown, type DropdownOption } from '@genoffice/ui'
import { epubAssetUrl } from '../../shared/asset-url'
import type { EpubBookSummary, EpubChapterResult } from '../../shared/ipc'
import { useI18n, type StringKey } from '../i18n/locale'
import { BLOCK_ATTR, VIEW_STYLE_ID, buildChapterHtml } from '../reader/chapter-html'
import { applyViewCss, blockElement, fragmentElement } from '../reader/frame-dom'
import { routeLink } from '../reader/links'
import { nextReadingIndex } from '../reader/navigation'
import {
  FIXED_FALLBACK,
  PREVIEW_DEVICES,
  PREVIEW_FONT_SCALES,
  PREVIEW_THEMES,
  fitScale,
  fixedPageCss,
  fixedViewport,
  pageCount,
  pageGeometry,
  pageOfBox,
  previewCss,
  readPreviewSettings,
  screenSize,
  stepPreviewFont,
  viewCount,
  viewOfPage,
  viewOffset,
  type PageFlow,
  type PageGeometry,
  type PreviewDevice,
  type PreviewSettings,
  type Size,
} from '../reader/preview-pages'
import { frameColors, type ReadingTheme } from '../reader/view-prefs'
import { linkHref } from './ChapterFrame'
import { ToolButton } from './Ribbon'
import { IconClose, IconNext, IconPrev, IconRotate, IconTextLarger, IconTextSmaller } from './icons'

/** Where the preview stands: a chapter and the first block of the view. */
export interface PreviewPlace {
  spineIndex: number
  blockId: string | null
}

export interface BookPreviewHandle {
  /** shows a chapter, at a fragment when one is given (the table of contents) */
  goTo(spineIndex: number, fragment: string | null): void
  /** the chapter and block on screen, for the editing view to go to on closing */
  place(): PreviewPlace | null
}

export interface BookPreviewProps {
  book: EpubBookSummary
  assetBase: string
  /** where the preview opens */
  start: PreviewPlace
  readChapter(spineIndex: number): Promise<EpubChapterResult>
  /** changes whenever the book may have changed (edits, undo, the AI) */
  refreshSignal: unknown
  chapterName(spineIndex: number): string
  /** an outside link was pressed */
  openOutside(url: string): void
  /** the chapter on screen changed */
  onChapter(spineIndex: number): void
  onClose(): void
}

/** Where saved preview settings are kept (this computer only, every book). */
export const PREVIEW_SETTINGS_KEY = 'epubapp.preview'

/** Wheel travel that turns one page, and the pause before the next turn. */
const WHEEL_TURN = 60
const WHEEL_REST_MS = 280

type OkChapter = Extract<EpubChapterResult, { ok: true }>

type Target =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'block'; id: string }
  | { kind: 'fragment'; id: string }
  | { kind: 'view'; view: number }

interface Shown {
  spineIndex: number
  chapter: OkChapter
  html: string
  /** a pre-paginated chapter: one page at this size */
  fixed: Size | null
  /** remounts the frame for every load */
  key: number
}

interface Layout {
  pages: number
  views: number
  view: number
}

const DEVICE_TEXT: Record<PreviewDevice, StringKey> = {
  ereader: 'previewDeviceReader',
  phone: 'previewDevicePhone',
  tablet: 'previewDeviceTablet',
  fit: 'previewDeviceFit',
}

const THEME_TEXT: Record<ReadingTheme, StringKey> = {
  light: 'previewThemeLight',
  sepia: 'previewThemeSepia',
  dark: 'previewThemeDark',
}

function loadSettings(): PreviewSettings {
  try {
    return readPreviewSettings(window.localStorage.getItem(PREVIEW_SETTINGS_KEY))
  } catch {
    return readPreviewSettings(null)
  }
}

function saveSettings(settings: PreviewSettings): void {
  try {
    window.localStorage.setItem(PREVIEW_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // the settings stay for this window
  }
}

/** A key that belongs to a field outside the preview (the AI panel, the find field). */
function fieldKey(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return el.closest('input, textarea, select, [contenteditable="true"]') !== null
}

/** The stage's size; a fixed guess where nothing is laid out (tests). */
function measure(el: HTMLElement | null): Size {
  const width = el?.clientWidth ?? 0
  const height = el?.clientHeight ?? 0
  return width > 0 && height > 0 ? { width, height } : { width: 900, height: 700 }
}

export const BookPreview = forwardRef<BookPreviewHandle, BookPreviewProps>(
  function BookPreview(props, ref) {
    const { t } = useI18n()
    const [settings, setSettings] = useState<PreviewSettings>(loadSettings)
    const [stage, setStage] = useState<Size>({ width: 900, height: 700 })
    const [flow, setFlow] = useState<PageFlow>({
      axis: props.book.verticalWriting ? 'vertical' : 'horizontal',
      rtl: false,
    })
    const [shown, setShown] = useState<Shown | null>(null)
    const [failed, setFailed] = useState(false)
    const [layout, setLayout] = useState<Layout>({ pages: 1, views: 1, view: 0 })

    const rootRef = useRef<HTMLDivElement>(null)
    const stageRef = useRef<HTMLDivElement>(null)
    const frameRef = useRef<HTMLIFrameElement>(null)
    const docRef = useRef<Document | null>(null)
    const propsRef = useRef(props)
    propsRef.current = props
    const settingsRef = useRef(settings)
    settingsRef.current = settings
    const stageSizeRef = useRef(stage)
    stageSizeRef.current = stage
    const flowRef = useRef(flow)
    flowRef.current = flow
    const shownRef = useRef(shown)
    shownRef.current = shown
    const layoutRef = useRef(layout)
    layoutRef.current = layout
    const targetRef = useRef<Target>({ kind: 'start' })
    /** how far the body is shifted to show the current view */
    const offsetRef = useRef({ left: 0, top: 0 })
    const tokenRef = useRef(0)
    const loadingRef = useRef(false)
    const wheelRef = useRef({ sum: 0, at: 0, turned: 0 })
    const relayoutTimer = useRef<number | null>(null)

    const screen = screenSize(settings, stage)
    const geom = pageGeometry(screen, flow.axis)

    /** The geometry as it is now (handlers run between renders). */
    const currentGeometry = useCallback(
      (): PageGeometry =>
        pageGeometry(screenSize(settingsRef.current, stageSizeRef.current), flowRef.current.axis),
      [],
    )

    const cssFor = useCallback(
      (fixed: Size | null, g: PageGeometry): string =>
        fixed ? fixedPageCss(fixed) : previewCss(g, settingsRef.current, frameColors()),
      [],
    )

    // ---- the page on screen ----

    /**
     * Moves the pages so view `view` shows. The body is shifted rather than
     * the frame scrolled: the frame's scroll range ends at the last column's
     * text, short of its margin, so scrolling would stop short on the last view.
     */
    const showView = useCallback(
      (view: number) => {
        const doc = docRef.current
        if (!doc || shownRef.current?.fixed) return
        const at = viewOffset(currentGeometry(), flowRef.current, view)
        offsetRef.current = at
        const shift =
          at.left === 0 && at.top === 0 ? 'none' : `translate(${-at.left}px, ${-at.top}px)`
        doc.body?.style.setProperty('transform', shift, 'important')
      },
      [currentGeometry],
    )

    /** The page an element starts on. */
    const pageOf = useCallback(
      (el: Element): number => {
        const box = el.getClientRects()[0] ?? el.getBoundingClientRect()
        return pageOfBox(currentGeometry(), flowRef.current, box, offsetRef.current)
      },
      [currentGeometry],
    )

    /** The first block that shows on the view (or runs into it from the page before). */
    const blockInView = useCallback((): string | null => {
      const doc = docRef.current
      if (!doc) return null
      const g = currentGeometry()
      const first = layoutRef.current.view * g.columns
      let last: string | null = null
      for (const el of Array.from(doc.querySelectorAll(`[${BLOCK_ATTR}]`))) {
        const page = pageOf(el)
        if (page > first + g.columns - 1) break
        last = el.getAttribute(BLOCK_ATTR)
        if (page >= first) return last
      }
      return last
    }, [currentGeometry, pageOf])

    /** Counts the pages and puts the reader at `target`. */
    const lay = useCallback(
      (target: Target) => {
        const doc = docRef.current
        if (!doc) return
        if (shownRef.current?.fixed) {
          setLayout({ pages: 1, views: 1, view: 0 })
          return
        }
        const g = currentGeometry()
        const el = doc.scrollingElement ?? doc.documentElement
        // counted unshifted (a shift changes the scroll range), so places are measured the same way
        showView(0)
        el.scrollLeft = 0
        el.scrollTop = 0
        const pages = pageCount(g, { scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight })
        const views = viewCount(g, pages)
        let view = 0
        if (target.kind === 'end') view = views - 1
        else if (target.kind === 'view') view = target.view
        else if (target.kind === 'block' || target.kind === 'fragment') {
          const found =
            target.kind === 'block' ? blockElement(doc, target.id) : fragmentElement(doc, target.id)
          if (found) view = viewOfPage(g, pageOf(found))
        }
        view = Math.min(Math.max(0, view), views - 1)
        const next = { pages, views, view }
        layoutRef.current = next
        setLayout(next)
        showView(view)
      },
      [currentGeometry, pageOf, showView],
    )

    /** Lays the chapter out again where the reader is (pictures and fonts arrived, settings changed). */
    const relayout = useCallback(() => {
      const doc = docRef.current
      if (!doc) return
      const anchor = blockInView()
      const shownNow = shownRef.current
      applyViewCss(doc, cssFor(shownNow?.fixed ?? null, currentGeometry()))
      lay(anchor ? { kind: 'block', id: anchor } : { kind: 'view', view: layoutRef.current.view })
    }, [blockInView, cssFor, currentGeometry, lay])

    const relayoutSoon = useCallback(() => {
      if (relayoutTimer.current !== null) window.clearTimeout(relayoutTimer.current)
      relayoutTimer.current = window.setTimeout(() => {
        relayoutTimer.current = null
        relayout()
      }, 60)
    }, [relayout])

    // ---- chapters ----

    const load = useCallback(
      async (spineIndex: number, target: Target) => {
        const p = propsRef.current
        const token = ++tokenRef.current
        loadingRef.current = true
        const chapter = await p.readChapter(spineIndex).catch(() => null)
        if (token !== tokenRef.current) return
        loadingRef.current = false
        if (!chapter || !chapter.ok) {
          docRef.current = null
          setShown(null)
          setFailed(true)
          p.onChapter(spineIndex)
          return
        }
        const item = p.book.spine[spineIndex]
        const fixed = item?.fixedLayout ? (fixedViewport(chapter.source) ?? FIXED_FALLBACK) : null
        const html = buildChapterHtml({
          source: chapter.source,
          broken: chapter.broken,
          blocks: chapter.broken ? [] : chapter.blocks,
          baseUrl: epubAssetUrl(p.assetBase, chapter.path),
          viewCss: cssFor(fixed, currentGeometry()),
        })
        targetRef.current = target
        docRef.current = null
        setFailed(false)
        setShown({ spineIndex, chapter, html, fixed, key: token })
        p.onChapter(spineIndex)
      },
      [cssFor, currentGeometry],
    )

    const turn = useCallback(
      (dir: 1 | -1) => {
        const current = shownRef.current
        if (loadingRef.current || !current) return
        const { view, views } = layoutRef.current
        const next = view + dir
        if (next >= 0 && next < views) {
          const updated = { ...layoutRef.current, view: next }
          layoutRef.current = updated
          setLayout(updated)
          showView(next)
          return
        }
        const chapter = nextReadingIndex(propsRef.current.book.spine, current.spineIndex, dir)
        if (chapter !== null) void load(chapter, { kind: dir > 0 ? 'start' : 'end' })
      },
      [load, showView],
    )

    const jump = useCallback(
      (to: 'first' | 'last') => {
        const { views } = layoutRef.current
        const view = to === 'first' ? 0 : views - 1
        const updated = { ...layoutRef.current, view }
        layoutRef.current = updated
        setLayout(updated)
        showView(view)
      },
      [showView],
    )

    useImperativeHandle(
      ref,
      () => ({
        goTo: (spineIndex, fragment) => {
          const target: Target = fragment ? { kind: 'fragment', id: fragment } : { kind: 'start' }
          if (shownRef.current?.spineIndex === spineIndex && docRef.current) lay(target)
          else void load(spineIndex, target)
        },
        place: () => {
          const current = shownRef.current
          return current ? { spineIndex: current.spineIndex, blockId: blockInView() } : null
        },
      }),
      [blockInView, lay, load],
    )

    // the first chapter
    useEffect(() => {
      const start = propsRef.current.start
      void load(
        start.spineIndex,
        start.blockId ? { kind: 'block', id: start.blockId } : { kind: 'start' },
      )
      rootRef.current?.focus({ preventScroll: true })
    }, [load])

    // the book changed: read the chapter again, and draw it if its text moved on
    const firstSignal = useRef(true)
    useEffect(() => {
      if (firstSignal.current) {
        firstSignal.current = false
        return
      }
      const current = shownRef.current
      if (!current) return
      void propsRef.current
        .readChapter(current.spineIndex)
        .then((fresh) => {
          const still = shownRef.current
          if (!fresh.ok || !still || still.spineIndex !== current.spineIndex) return
          if (fresh.version === still.chapter.version && fresh.path === still.chapter.path) return
          const anchor = blockInView()
          void load(
            current.spineIndex,
            anchor ? { kind: 'block', id: anchor } : { kind: 'view', view: layoutRef.current.view },
          )
        })
        .catch(() => {})
    }, [props.refreshSignal, blockInView, load])

    // the preview area's size
    useEffect(() => {
      const el = stageRef.current
      setStage(measure(el))
      if (!el || typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver(() => setStage(measure(el)))
      observer.observe(el)
      return () => observer.disconnect()
    }, [])

    // settings and the screen size lay the chapter out again; settings are remembered
    useEffect(() => {
      saveSettings(settings)
    }, [settings])
    useEffect(() => {
      if (docRef.current) relayout()
      // geometry inputs only: relayout reads the rest from refs
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings, screen.width, screen.height, flow.axis])

    // ---- the frame ----

    const onKey = useCallback(
      (e: KeyboardEvent) => {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
        // the frame's nodes belong to another window: `instanceof Node` does not hold for them
        const target = e.target as Node | null
        const isNode = target !== null && typeof target.nodeType === 'number'
        const frameDoc = docRef.current
        const inFrame =
          isNode && frameDoc !== null && (target === frameDoc || target.ownerDocument === frameDoc)
        if (!inFrame) {
          const root = rootRef.current
          const free =
            !isNode ||
            target === document ||
            target === document.body ||
            target === document.documentElement ||
            (root !== null && root.contains(target))
          if (!free || fieldKey(e.target)) return
        }
        const onButton = (e.target as Element | null)?.closest?.('button, [role="combobox"]')
        const rtl = flowRef.current.rtl
        let dir: 1 | -1
        switch (e.key) {
          case 'ArrowRight':
            dir = rtl ? -1 : 1
            break
          case 'ArrowLeft':
            dir = rtl ? 1 : -1
            break
          case 'ArrowDown':
          case 'PageDown':
            dir = 1
            break
          case 'ArrowUp':
          case 'PageUp':
            dir = -1
            break
          case ' ':
            if (onButton) return
            dir = e.shiftKey ? -1 : 1
            break
          case 'Home':
            e.preventDefault()
            jump('first')
            return
          case 'End':
            e.preventDefault()
            jump('last')
            return
          case 'Escape':
            e.preventDefault()
            propsRef.current.onClose()
            return
          default:
            return
        }
        if (onButton && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return
        e.preventDefault()
        turn(dir)
      },
      [jump, turn],
    )

    const onWheel = useCallback(
      (deltaX: number, deltaY: number) => {
        const delta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX
        const now = performance.now()
        const w = wheelRef.current
        if (now - w.at > WHEEL_REST_MS) w.sum = 0
        w.at = now
        if (now - w.turned < WHEEL_REST_MS) return
        w.sum += delta
        if (Math.abs(w.sum) < WHEEL_TURN) return
        const dir = w.sum > 0 ? 1 : -1
        w.sum = 0
        w.turned = now
        turn(dir)
      },
      [turn],
    )

    useEffect(() => {
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [onKey])

    useEffect(() => {
      const el = stageRef.current
      if (!el) return
      const handler = (e: WheelEvent) => {
        e.preventDefault()
        onWheel(e.deltaX, e.deltaY)
      }
      el.addEventListener('wheel', handler, { passive: false })
      return () => el.removeEventListener('wheel', handler)
    }, [onWheel])

    useEffect(
      () => () => {
        if (relayoutTimer.current !== null) window.clearTimeout(relayoutTimer.current)
        tokenRef.current++
      },
      [],
    )

    const onLink = useCallback(
      (href: string | null) => {
        const p = propsRef.current
        const current = shownRef.current
        if (!current) return
        const route = routeLink(
          href,
          epubAssetUrl(p.assetBase, current.chapter.path),
          p.assetBase,
          p.book.spine.map((item) => item.path),
        )
        if (route.kind === 'chapter') {
          const target: Target = route.fragment
            ? { kind: 'fragment', id: route.fragment }
            : { kind: 'start' }
          if (route.spineIndex === current.spineIndex) lay(target)
          else void load(route.spineIndex, target)
        } else if (route.kind === 'outside') {
          p.openOutside(route.url)
        }
      },
      [lay, load],
    )

    // a new chapter's frame: wire it, find its writing direction, lay it out
    useEffect(() => {
      const frame = frameRef.current
      if (!frame || !shown) return
      const onLoad = () => {
        const doc = frame.contentDocument
        if (!doc || !doc.getElementById(VIEW_STYLE_ID)) return
        docRef.current = doc
        const onClick = (e: MouseEvent) => {
          const anchor = (e.target as Element | null)?.closest?.('a, area')
          if (!anchor) return
          e.preventDefault()
          if (e.type === 'click') onLink(linkHref(anchor))
        }
        doc.addEventListener('click', onClick, true)
        doc.addEventListener('auxclick', onClick, true)
        doc.addEventListener('submit', (e) => e.preventDefault(), true)
        doc.addEventListener('keydown', onKey)
        doc.addEventListener(
          'wheel',
          (e) => {
            e.preventDefault()
            onWheel(e.deltaX, e.deltaY)
          },
          { passive: false },
        )
        // the frame never scrolls (pages move by shifting the body): a selection
        // dragged past the page edge must not carry the page away
        doc.addEventListener(
          'scroll',
          () => {
            const el = doc.scrollingElement ?? doc.documentElement
            if (el.scrollLeft !== 0) el.scrollLeft = 0
            if (el.scrollTop !== 0) el.scrollTop = 0
          },
          { passive: true },
        )
        // pictures and fonts change how far the chapter runs
        doc.addEventListener('load', relayoutSoon, true)
        void doc.fonts?.ready.then(() => relayoutSoon())
        const style = doc.defaultView?.getComputedStyle(doc.body)
        const found: PageFlow = {
          axis: style?.writingMode.startsWith('vertical') ? 'vertical' : 'horizontal',
          // vertical-rl books turn their pages leftwards too, as readers do
          rtl: style?.direction === 'rtl' || style?.writingMode === 'vertical-rl',
        }
        const before = flowRef.current
        flowRef.current = found
        if (found.axis !== before.axis || found.rtl !== before.rtl) setFlow(found)
        if (found.axis !== before.axis) {
          applyViewCss(doc, cssFor(shownRef.current?.fixed ?? null, currentGeometry()))
        }
        lay(targetRef.current)
      }
      frame.addEventListener('load', onLoad)
      return () => frame.removeEventListener('load', onLoad)
      // one wiring per chapter frame (keyed by shown.key)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown?.key])

    // ---- what is drawn ----

    const patch = (next: Partial<PreviewSettings>) => setSettings((prev) => ({ ...prev, ...next }))
    const spine = props.book.spine
    const scale = fitScale(screen, stage)
    const fixed = shown?.fixed ?? null
    const fixedScale = fixed
      ? Math.min(screen.width / fixed.width, screen.height / fixed.height)
      : 1
    const atStart =
      layout.view === 0 && (!shown || nextReadingIndex(spine, shown.spineIndex, -1) === null)
    const atEnd =
      layout.view >= layout.views - 1 &&
      (!shown || nextReadingIndex(spine, shown.spineIndex, 1) === null)
    const firstPage = layout.view * geom.columns + 1
    const deviceOptions: DropdownOption<PreviewDevice>[] = PREVIEW_DEVICES.map((device) => ({
      value: device,
      label: t(DEVICE_TEXT[device]),
    }))
    const themeOptions: DropdownOption<ReadingTheme>[] = PREVIEW_THEMES.map((theme) => ({
      value: theme,
      label: t(THEME_TEXT[theme]),
    }))
    const prevKey = flow.rtl ? 'previewNextPage' : 'previewPrevPage'
    const nextKey = flow.rtl ? 'previewPrevPage' : 'previewNextPage'

    return (
      <div
        ref={rootRef}
        className="epub-preview"
        role="region"
        aria-label={t('preview')}
        tabIndex={-1}
        data-device={settings.device}
      >
        <div className="epub-preview-bar" role="toolbar" aria-label={t('preview')}>
          <Dropdown
            className="epub-preview-device-pick"
            value={settings.device}
            options={deviceOptions}
            onPick={(device) => patch({ device })}
            ariaLabel={t('previewDevice')}
            tip={t('previewDevice')}
          />
          <ToolButton
            action="preview-rotate"
            label={t('previewRotate')}
            active={settings.device !== 'fit' && settings.landscape}
            disabled={settings.device === 'fit'}
            onClick={() => patch({ landscape: !settings.landscape })}
          >
            <IconRotate />
          </ToolButton>
          <span className="rb-sep" />
          <ToolButton
            action="preview-font-smaller"
            label={t('fontSmaller')}
            disabled={settings.fontScale <= PREVIEW_FONT_SCALES[0]}
            onClick={() => patch({ fontScale: stepPreviewFont(settings.fontScale, -1) })}
          >
            <IconTextSmaller />
          </ToolButton>
          <span className="epub-preview-scale" aria-live="polite">
            {Math.round(settings.fontScale * 100)}%
          </span>
          <ToolButton
            action="preview-font-larger"
            label={t('fontLarger')}
            disabled={settings.fontScale >= PREVIEW_FONT_SCALES.at(-1)!}
            onClick={() => patch({ fontScale: stepPreviewFont(settings.fontScale, 1) })}
          >
            <IconTextLarger />
          </ToolButton>
          <span className="rb-sep" />
          <Dropdown
            className="epub-preview-theme-pick"
            value={settings.theme}
            options={themeOptions}
            onPick={(theme) => patch({ theme })}
            ariaLabel={t('previewTheme')}
            tip={t('previewTheme')}
          />
          <span className="epub-preview-spacer" />
          <button
            type="button"
            className="epub-preview-close"
            data-action="preview-close"
            data-tip={t('previewClose')}
            data-tip-kbd="Esc"
            onClick={() => props.onClose()}
          >
            <IconClose />
            {t('previewClose')}
          </button>
        </div>
        <div ref={stageRef} className="epub-preview-stage">
          <button
            type="button"
            className="epub-preview-turn"
            data-action="preview-prev-page"
            aria-label={t(prevKey)}
            data-tip={t(prevKey)}
            disabled={flow.rtl ? atEnd : atStart}
            onClick={() => turn(flow.rtl ? 1 : -1)}
          >
            <IconPrev />
          </button>
          <div
            className="epub-preview-device"
            style={{ width: screen.width * scale, height: screen.height * scale }}
          >
            <div
              className="epub-preview-screen"
              data-theme={settings.theme}
              style={{
                width: screen.width,
                height: screen.height,
                transform: scale < 1 ? `scale(${scale})` : undefined,
              }}
            >
              {shown ? (
                <iframe
                  key={shown.key}
                  ref={frameRef}
                  className="epub-preview-frame"
                  title={props.chapterName(shown.spineIndex)}
                  sandbox="allow-same-origin"
                  srcDoc={shown.html}
                  style={
                    fixed
                      ? {
                          width: fixed.width,
                          height: fixed.height,
                          transform: `translate(-50%, -50%) scale(${fixedScale})`,
                        }
                      : { width: screen.width, height: screen.height }
                  }
                  data-fixed={fixed ? 'true' : undefined}
                />
              ) : (
                <div className="center-note">{failed ? t('chapterFailed') : t('loading')}</div>
              )}
            </div>
          </div>
          <button
            type="button"
            className="epub-preview-turn"
            data-action="preview-next-page"
            aria-label={t(nextKey)}
            data-tip={t(nextKey)}
            disabled={flow.rtl ? atStart : atEnd}
            onClick={() => turn(flow.rtl ? -1 : 1)}
          >
            <IconNext />
          </button>
        </div>
        <div className="epub-preview-foot">
          <span className="epub-preview-where">
            {shown
              ? `${props.chapterName(shown.spineIndex)} · ${t('previewPage', {
                  n: Math.min(firstPage, layout.pages),
                  total: layout.pages,
                })}`
              : ''}
          </span>
          <span className="epub-preview-note">{t('previewNote')}</span>
        </div>
      </div>
    )
  },
)
