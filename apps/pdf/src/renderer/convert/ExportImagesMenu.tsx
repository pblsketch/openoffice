/**
 * The ribbon's "Export images" button: a menu with the two ways to export —
 * whole pages rendered as pictures (the existing export), or only the
 * pictures placed in the pages.
 */
import { useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { useDismissablePopover } from '@genoffice/ui'
import type { TFunc } from '../i18n/locale'
import { RbCaret } from '../icons'

export function ExportImagesMenu({
  t,
  icon,
  busy,
  label,
  onWholePages,
  onEmbedded,
}: {
  t: TFunc
  icon: ReactNode
  /** an export runs: the button is disabled */
  busy: boolean
  /** the button text (changes while an export runs) */
  label: string
  onWholePages: () => void
  onEmbedded: () => void
}): ReactElement {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  useDismissablePopover(open, () => setOpen(false), { inside: () => [wrapRef.current] })
  const choose = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  return (
    <div className="rb-drop-wrap" ref={wrapRef}>
      <button
        className={`rb-big${open ? ' active' : ''}`}
        data-tip={t('exportImages')}
        data-action="export-images"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="rb-big-icon">
          {icon}
          <RbCaret />
        </span>
        <span>{label}</span>
      </button>
      {open && (
        <div className="rb-drop rb-menu" role="menu">
          <button
            role="menuitem"
            data-action="export-whole-pages"
            data-tip={t('exportImagesAll')}
            onClick={choose(onWholePages)}
          >
            {t('imgExportWholePages')}
          </button>
          <button
            role="menuitem"
            data-action="export-embedded-images"
            data-tip={t('imgExportEmbeddedTip')}
            onClick={choose(onEmbedded)}
          >
            {t('imgExportEmbedded')}
          </button>
        </div>
      )}
    </div>
  )
}
