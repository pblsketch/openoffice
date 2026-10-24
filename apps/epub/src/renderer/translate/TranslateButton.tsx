/**
 * The ribbon's "Translate book" button (spec §8). It only opens the book
 * translation window. A fixed-layout book cannot be translated: the button is
 * off and says why.
 */
import type { ReactElement } from 'react'
import type { TFunc } from '../i18n/locale'

function IconTranslate(): ReactElement {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 5h9" />
      <path d="M8.5 3v2" />
      <path d="M11 5c-.6 3.6-3 6.6-6.5 8" />
      <path d="M6.5 8.5c1 1.8 2.6 3.2 4.5 4" />
      <path d="M12.5 21l4-10 4 10" />
      <path d="M14 17.5h5" />
    </svg>
  )
}

export interface TranslateButtonProps {
  t: TFunc
  /** a book is open */
  hasBook: boolean
  /** the whole book is pre-paginated */
  fixedLayout: boolean
  onClick: () => void
}

export function TranslateButton({
  t,
  hasBook,
  fixedLayout,
  onClick,
}: TranslateButtonProps): ReactElement {
  const label = fixedLayout ? t('btFixedLayout') : t('btRibbonTip')
  return (
    <div className="ribbon-group" data-group="translate">
      <div className="ribbon-group-items">
        {/* a disabled button shows no tip: the wrapper carries it */}
        <span className="bt-ribbon-wrap" data-tip={label}>
          <button
            type="button"
            className="rb-btn epub-tool"
            data-action="translate-book"
            aria-label={t('btRibbon')}
            aria-description={label}
            disabled={!hasBook || fixedLayout}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
          >
            <IconTranslate />
            <span className="epub-tool-text">{t('btRibbon')}</span>
          </button>
        </span>
        {fixedLayout && (
          <span className="bt-ribbon-note" data-reason="fixed-layout">
            {t('btFixedLayout')}
          </span>
        )}
      </div>
    </div>
  )
}
