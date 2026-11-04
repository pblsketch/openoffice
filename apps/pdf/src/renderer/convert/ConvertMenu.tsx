/**
 * The ribbon's "Convert PDF" button: one menu for every way out of the PDF —
 * Word / Excel / PPT / Markdown / EPUB, then the picture exports. PNG offers
 * every page, only the page being viewed, or only the pictures placed in the
 * pages; JPG offers every page or only the page being viewed.
 */
import { useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useDismissablePopover } from '@genoffice/ui'
import type { TFunc } from '../i18n/locale'
import { IconConvertPdf, RbCaret } from '../icons'
import type { PdfConvertFormat, PdfReflowFormat } from '../../shared/ipc'

export type PageImageFormat = 'png' | 'jpg'

export function ConvertMenu({
  t,
  busy,
  label,
  onConvert,
  onReflow,
  onPageImages,
  onEmbedded,
}: {
  t: TFunc
  /** a conversion or an export runs: the button is disabled */
  busy: boolean
  /** the button text (changes while an export runs) */
  label: string
  onConvert: (format: PdfConvertFormat) => void
  onReflow: (format: PdfReflowFormat) => void
  /** pages rendered as pictures: every visible page, or only the current one */
  onPageImages: (allPages: boolean, format: PageImageFormat) => void
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
        data-tip={t('convertPdfTip')}
        data-action="convert-pdf"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="rb-big-icon">
          <IconConvertPdf />
          <RbCaret />
        </span>
        <span>{label}</span>
      </button>
      {open && (
        <div className="rb-drop rb-menu" role="menu">
          <button role="menuitem" onClick={choose(() => onConvert('docx'))}>
            {t('convertToWord')}
          </button>
          <button role="menuitem" onClick={choose(() => onConvert('xlsx'))}>
            {t('convertToExcel')}
          </button>
          <button role="menuitem" onClick={choose(() => onConvert('pptx'))}>
            {t('convertToPpt')}
          </button>
          <button role="menuitem" onClick={choose(() => onReflow('md'))}>
            {t('cvToMarkdown')}
          </button>
          <button role="menuitem" onClick={choose(() => onReflow('epub'))}>
            {t('cvToEpub')}
          </button>
          <div className="rb-menu-sep" role="separator" />
          <div className="rb-menu-heading" role="presentation">
            {t('exportImages')}
          </div>
          <button
            role="menuitem"
            data-action="export-whole-pages"
            data-tip={t('exportImagesAll')}
            onClick={choose(() => onPageImages(true, 'png'))}
          >
            {t('imgExportWholePages')}
          </button>
          <button
            role="menuitem"
            data-action="export-current-page"
            data-tip={t('imgExportCurrentPageTip')}
            onClick={choose(() => onPageImages(false, 'png'))}
          >
            {t('imgExportCurrentPage')}
          </button>
          <button
            role="menuitem"
            data-action="export-embedded-images"
            data-tip={t('imgExportEmbeddedTip')}
            onClick={choose(onEmbedded)}
          >
            {t('imgExportEmbedded')}
          </button>
          <div className="rb-menu-sep" role="separator" />
          <div className="rb-menu-heading" role="presentation">
            {t('exportImagesJpg')}
          </div>
          <button
            role="menuitem"
            data-action="export-whole-pages-jpg"
            data-tip={t('exportImagesAllJpg')}
            onClick={choose(() => onPageImages(true, 'jpg'))}
          >
            {t('imgExportWholePages')}
          </button>
          <button
            role="menuitem"
            data-action="export-current-page-jpg"
            data-tip={t('imgExportCurrentPageJpgTip')}
            onClick={choose(() => onPageImages(false, 'jpg'))}
          >
            {t('imgExportCurrentPage')}
          </button>
        </div>
      )}
    </div>
  )
}
