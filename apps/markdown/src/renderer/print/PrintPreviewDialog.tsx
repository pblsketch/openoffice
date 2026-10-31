import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { useI18n } from '../i18n/locale'
import {
  MARKDOWN_PRINT_OPTIONS,
  parseMarkdownPageRange,
  type MarkdownPageRange,
  type MarkdownPaperSize,
} from '../../shared/print-options'

/** The page range the dialog asks the printer for. */
type RangeMode = 'all' | 'current' | 'custom'

interface Props {
  /** the self-contained print HTML; the same document the PDF export writes */
  html: string
  onClose: () => void
}

/**
 * The print preview of a Markdown note: the pages of the PDF the export writes,
 * drawn with pdf.js. Printing sends the same HTML and options to the main
 * process, so the paper the printer gets is the paper on screen.
 */
export function PrintPreviewDialog({ html, onClose }: Props): JSX.Element {
  const { t } = useI18n()
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [page, setPage] = useState(1)
  const [fit, setFit] = useState(true)
  const [paper, setPaper] = useState<MarkdownPaperSize>('A4')
  const [landscape, setLandscape] = useState(false)
  const [rangeMode, setRangeMode] = useState<RangeMode>('all')
  const [customRange, setCustomRange] = useState('')
  const [rendering, setRendering] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 })
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const paneRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const renderTask = useRef<{ cancel(): void } | null>(null)
  const renderId = useRef(0)
  const printingRef = useRef(false)

  useEffect(() => {
    let alive = true
    renderTask.current?.cancel()
    renderId.current += 1
    setRendering(true)
    setError(null)
    void (async () => {
      try {
        const result = await window.markdownApi.renderPrintPreview({
          html,
          options: { ...MARKDOWN_PRINT_OPTIONS, pageSize: paper, landscape },
        })
        if (!alive) return
        if (!result.ok) {
          setDoc(null)
          setPageCount(0)
          setError(result.error)
          setRendering(false)
          return
        }
        const { GlobalWorkerOptions, getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
        GlobalWorkerOptions.workerSrc = workerUrl
        const pdf = await getDocument({ data: result.pdf }).promise
        if (!alive) {
          void pdf.loadingTask.destroy()
          return
        }
        setDoc(pdf)
        setPageCount(pdf.numPages)
        setPage((current) => Math.min(Math.max(current, 1), Math.max(pdf.numPages, 1)))
      } catch (cause) {
        if (alive) {
          setDoc(null)
          setPageCount(0)
          setError(cause instanceof Error ? cause.message : String(cause))
          setRendering(false)
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [html, paper, landscape])

  useEffect(
    () => () => {
      renderTask.current?.cancel()
      if (doc) void doc.loadingTask.destroy()
    },
    [doc],
  )

  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    const measure = (): void => setPaneSize({ width: pane.clientWidth, height: pane.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  const renderPage = useCallback(async (): Promise<void> => {
    const target = canvasRef.current
    if (!doc || !target) return
    const id = ++renderId.current
    renderTask.current?.cancel()
    setRendering(true)
    try {
      const pdfPage = await doc.getPage(page)
      if (id !== renderId.current) return
      const base = pdfPage.getViewport({ scale: 1 })
      const fitScale =
        paneSize.width > 0 && paneSize.height > 0
          ? Math.min((paneSize.width - 32) / base.width, (paneSize.height - 32) / base.height)
          : 1
      const displayScale = fit ? Math.min(2, Math.max(0.1, fitScale)) : 1
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      const viewport = pdfPage.getViewport({ scale: displayScale * ratio })
      target.width = Math.max(1, Math.floor(viewport.width))
      target.height = Math.max(1, Math.floor(viewport.height))
      target.style.width = `${base.width * displayScale}px`
      target.style.height = `${base.height * displayScale}px`
      const task = pdfPage.render({ canvas: target, viewport })
      renderTask.current = task
      await task.promise
      if (id === renderId.current) {
        setRendering(false)
        setError(null)
      }
    } catch (cause) {
      // a canceled render is what a page change does; it is not worth a message
      if (id === renderId.current && !/cancel/i.test(String(cause))) {
        setError(cause instanceof Error ? cause.message : String(cause))
        setRendering(false)
      }
    }
  }, [doc, fit, page, paneSize.height, paneSize.width])

  useEffect(() => {
    if (doc) void renderPage()
  }, [doc, renderPage])

  const selectedRange = (): MarkdownPageRange | null | 'invalid' => {
    if (rangeMode === 'all') return null
    if (rangeMode === 'current') return { from: page, to: page }
    return parseMarkdownPageRange(customRange, pageCount) ?? 'invalid'
  }
  const range = selectedRange()
  const rangeInvalid = range === 'invalid'
  const pages = range === 'invalid' ? null : range

  const print = async (): Promise<void> => {
    if (printingRef.current || rangeInvalid || rendering) return
    printingRef.current = true
    setPrinting(true)
    setError(null)
    try {
      const result = await window.markdownApi.printDocument({
        html,
        pages,
        options: { ...MARKDOWN_PRINT_OPTIONS, pageSize: paper, landscape },
      })
      if (result.ok) {
        onClose()
        return
      }
      setError(result.error)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      printingRef.current = false
      setPrinting(false)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key === 'F5') {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (event.key === 'PageUp' || event.key === 'ArrowLeft') {
        event.preventDefault()
        setPage((current) => Math.max(1, current - 1))
      } else if (event.key === 'PageDown' || event.key === 'ArrowRight') {
        event.preventDefault()
        setPage((current) => Math.min(Math.max(pageCount, 1), current + 1))
      } else if (event.ctrlKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        void print()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <div className="md-print-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="md-print-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('appPrintPreviewTitle')}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="md-print-header">{t('appPrintPreviewTitle')}</header>
        <div className="md-print-body">
          <div className="md-print-preview" ref={paneRef}>
            <canvas ref={canvasRef} className="md-print-canvas" />
            {rendering && <div className="md-print-overlay">{t('appPrintPreviewRendering')}</div>}
            {error && (
              <div className="md-print-overlay error" role="alert">
                {t('appPrintPreviewFailed')} {error}
              </div>
            )}
          </div>
          <div className="md-print-options">
            <div className="md-print-nav">
              <button
                type="button"
                className="md-print-button"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                ‹
              </button>
              <span>{t('appPrintPreviewPageOf', { page, total: pageCount })}</span>
              <button
                type="button"
                className="md-print-button"
                disabled={pageCount === 0 || page >= pageCount}
                onClick={() => setPage((current) => Math.min(Math.max(pageCount, 1), current + 1))}
              >
                ›
              </button>
              <span className="md-print-gap" />
              <button
                type="button"
                className={`md-print-button${fit ? ' active' : ''}`}
                aria-pressed={fit}
                onClick={() => setFit(true)}
              >
                {t('appPrintPreviewFit')}
              </button>
              <button
                type="button"
                className={`md-print-button${fit ? '' : ' active'}`}
                aria-pressed={!fit}
                onClick={() => setFit(false)}
              >
                {t('appPrintPreviewActual')}
              </button>
            </div>
            <fieldset className="md-print-fieldset">
              <legend>{t('appPrintPreviewRange')}</legend>
              <label>
                <input
                  type="radio"
                  name="md-print-range"
                  checked={rangeMode === 'all'}
                  onChange={() => setRangeMode('all')}
                />
                {t('appPrintPreviewAll')}
              </label>
              <label>
                <input
                  type="radio"
                  name="md-print-range"
                  checked={rangeMode === 'current'}
                  onChange={() => setRangeMode('current')}
                />
                {t('appPrintPreviewCurrent')}
              </label>
              <label>
                <input
                  type="radio"
                  name="md-print-range"
                  checked={rangeMode === 'custom'}
                  onChange={() => setRangeMode('custom')}
                />
                {t('appPrintPreviewCustom')}
              </label>
              <input
                className={`md-print-range${rangeInvalid ? ' invalid' : ''}`}
                type="text"
                inputMode="numeric"
                placeholder="1-3"
                aria-label={t('appPrintPreviewCustom')}
                value={customRange}
                disabled={rangeMode !== 'custom'}
                onChange={(event) => {
                  setCustomRange(event.target.value)
                  setRangeMode('custom')
                }}
              />
              {rangeInvalid && (
                <span className="md-print-hint" role="alert">
                  {t('appPrintPreviewInvalidRange')}
                </span>
              )}
            </fieldset>
            <label className="md-print-field">
              <span>{t('appPrintPreviewPaper')}</span>
              <select
                value={paper}
                onChange={(event) => setPaper(event.target.value as MarkdownPaperSize)}
              >
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
            <label className="md-print-field">
              <span>{t('appPrintPreviewOrientation')}</span>
              <select
                value={landscape ? 'landscape' : 'portrait'}
                onChange={(event) => setLandscape(event.target.value === 'landscape')}
              >
                <option value="portrait">{t('appPrintPreviewPortrait')}</option>
                <option value="landscape">{t('appPrintPreviewLandscape')}</option>
              </select>
            </label>
          </div>
        </div>
        <div className="md-print-actions">
          <button type="button" className="md-print-button" onClick={onClose}>
            {t('redactCancel')}
          </button>
          <button
            type="button"
            className="md-print-button primary"
            disabled={printing || rangeInvalid || pageCount === 0 || rendering}
            onClick={() => void print()}
          >
            {t('appPrintPreviewPrint')}
          </button>
        </div>
      </div>
    </div>
  )
}
