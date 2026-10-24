/**
 * Where the AI panel meets the editor: the dock at the right end of the book
 * (the rail while it is collapsed), its open state, and the `BookAiHost` the
 * panel's tools work through.
 *
 * The host reads and changes the book only through what the app already has:
 * the main process's chapters, the tab's edit controller and the chapter
 * frame on screen. The app passes those in; nothing here keeps a book of its
 * own.
 */
import { useEffect, useMemo, useState } from 'react'
import type { MutableRefObject, ReactElement } from 'react'
import {
  AiMark,
  aiPanelInitiallyOpen,
  applyAiPanelPrefs,
  effectiveAiPanelOpen,
  onAiRailClick,
  rememberAiPanelOpen,
  useSplitPaneRole,
} from '@genoffice/ui'
import '@genoffice/ui/ai-model-picker.css'
import '@genoffice/ui/ai-queue-strip.css'
import '@genoffice/ui/ai-usage.css'
import '@genoffice/ui/ai-panel-prefs.css'
import './ai-panel.css'
import type { EpubAiApi, EpubBookSummary, EpubChapterResult } from '../../shared/ipc'
import { BLOCK_ATTR } from '../reader/chapter-html'
import { useI18n } from '../i18n/locale'
import { AiPanel } from './AiPanel'
import type { BookAiEditor, BookAiHost, BookAiView, StartBookTranslation } from './book-tools'

export type {
  BookTranslationAnswer,
  BookTranslationRequest,
  StartBookTranslation,
} from './book-tools'

/** Remembers whether the panel was open, like the other editors (`<app>.showAi`). */
const OPEN_KEY = 'epubapp.showAi'

/**
 * The blocks of the chapter frame that are in view: the first and the last,
 * with their positions among the frame's blocks. Null when none is.
 */
export function visibleBlocks(doc: Document): BookAiView['visible'] {
  const blocks = Array.from(doc.querySelectorAll(`[${BLOCK_ATTR}]`))
  const height = doc.defaultView?.innerHeight ?? 0
  let first = -1
  let last = -1
  blocks.forEach((el, i) => {
    const rect = el.getBoundingClientRect()
    if (rect.bottom > 0 && rect.top < height) {
      if (first < 0) first = i
      last = i
    }
  })
  if (first < 0) return null
  return {
    firstId: blocks[first]!.getAttribute(BLOCK_ATTR) ?? '',
    lastId: blocks[last]!.getAttribute(BLOCK_ATTR) ?? '',
    first,
    last,
    total: blocks.length,
  }
}

export interface EpubAiWiring {
  /** the open book; null while none is open */
  book: EpubBookSummary | null
  readChapter(spineIndex: number): Promise<EpubChapterResult>
  /** the tab's edit controller */
  editor: BookAiEditor
  /** the chapter shown now (spine index), null while none is */
  shownChapter: MutableRefObject<{ spineIndex: number } | null>
  /** the chapter frame's document, null while it loads */
  frameDoc: MutableRefObject<Document | null>
  /** opens the book-translation window (the translating screen); absent until it exists */
  startBookTranslation?: StartBookTranslation | null
}

export interface EpubAi {
  host: BookAiHost
  open: boolean
  setOpen(open: boolean): void
}

/** The AI's view of the editor, and whether its panel is open. */
export function useEpubAi(wiring: EpubAiWiring): EpubAi {
  const { book, readChapter, editor, shownChapter, frameDoc, startBookTranslation } = wiring
  const [open, setOpen] = useState(() => aiPanelInitiallyOpen(OPEN_KEY))
  useEffect(() => rememberAiPanelOpen(OPEN_KEY, open), [open])

  // the shell's AI panel preferences (text size): read once, then followed
  useEffect(() => {
    const api = window.epubApi as Partial<EpubAiApi> | undefined
    void api
      ?.getAiPanelPrefs?.()
      .then(applyAiPanelPrefs)
      .catch(() => {})
    return api?.onAiPanelPrefsChanged?.(applyAiPanelPrefs)
  }, [])

  const host = useMemo<BookAiHost>(
    () => ({
      book: () => book,
      readChapter,
      editor: () => editor,
      view: () => {
        const shown = shownChapter.current
        if (!shown) return null
        const doc = frameDoc.current
        return {
          spineIndex: shown.spineIndex,
          visible: doc ? visibleBlocks(doc) : null,
          selection: doc?.getSelection()?.toString() ?? '',
        }
      },
      startBookTranslation: startBookTranslation ?? null,
    }),
    [book, readChapter, editor, shownChapter, frameDoc, startBookTranslation],
  )
  return { host, open, setOpen }
}

export interface EpubAiDockProps {
  ai: EpubAi
  /** the book's file */
  filePath: string | null
}

/**
 * The panel at the right end of the book, or its rail while collapsed; the
 * panel stays mounted either way, so a run and its chat survive. In a split
 * (decision 0036) a secondary pane keeps its panel at the rail, and a click
 * on the rail asks the shell to focus this pane first.
 */
export function EpubAiDock({ ai, filePath }: EpubAiDockProps): ReactElement {
  const { t } = useI18n()
  const { role, requestFocus } = useSplitPaneRole()
  const open = effectiveAiPanelOpen(ai.open, role)
  return (
    <div className={`ai-dock${open ? '' : ' collapsed'}`} data-ai-open={open}>
      {!open && (
        <button
          type="button"
          className="ai-rail"
          data-tip={t('aiOpenAssistant')}
          aria-label={t('aiOpenAssistant')}
          onClick={() => onAiRailClick(role, ai.open, ai.setOpen, requestFocus)}
        >
          <AiMark size={18} />
        </button>
      )}
      <AiPanel host={ai.host} filePath={filePath} onCollapse={() => ai.setOpen(false)} />
    </div>
  )
}
