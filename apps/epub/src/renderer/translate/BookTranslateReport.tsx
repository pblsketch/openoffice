/**
 * The end of a book translation (spec §8, when it ends): the blocks
 * translated, the blocks left in the source language (chapter and why), the
 * chapters kept as they were (chapter and why: not chosen, damaged, fixed
 * layout), and the result files, each with "Open" (a new tab).
 */
import { useCallback, useRef } from 'react'
import type { ReactElement } from 'react'
import type { EpubTranslationOutputKind, EpubTranslationReport } from '@genoffice/epub-engine'
import { useModalKeys } from '@genoffice/ui'
import type { StringKey, TFunc } from '../i18n/locale'
import { baseName, originalChapterLines, untranslatedLines } from './translate-model'

export interface BookTranslateReportProps {
  t: TFunc
  /** the target language as the user reads it */
  language: string
  report: EpubTranslationReport | null
  /** the result books written, in kind order */
  outputs: ReadonlyArray<{ kind: EpubTranslationOutputKind; path: string }>
  /** one line per result that could not be written */
  failures: readonly string[]
  /** written from a stopped translation (the rest stays in the source language) */
  partial: boolean
  chapterName: (index: number) => string
  onOpen: (path: string) => void
  onClose: () => void
}

const KIND_KEY: Record<EpubTranslationOutputKind, StringKey> = {
  translated: 'btKindTranslated',
  bilingual: 'btKindBilingual',
}

export function BookTranslateReport(props: BookTranslateReportProps): ReactElement {
  const { t, report, outputs, failures, partial } = props
  const propsRef = useRef(props)
  propsRef.current = props
  const dismiss = useCallback(() => propsRef.current.onClose(), [])
  const modal = useModalKeys(dismiss, { restoreFocus: true })
  const untranslated = report ? untranslatedLines(report, props.chapterName, t) : []
  const kept = report ? originalChapterLines(report, props.chapterName, t) : []

  return (
    <div className="bt-mask" ref={modal.ref} onKeyDown={modal.onKeyDown} tabIndex={-1}>
      <div
        className="bt-dialog bt-report"
        role="dialog"
        aria-modal="true"
        aria-label={partial ? t('btReportPartialTitle') : t('btReportTitle')}
        data-partial={partial || undefined}
      >
        <div className="bt-title">{partial ? t('btReportPartialTitle') : t('btReportTitle')}</div>
        {report && (
          <ul className="bt-summary">
            <li data-translated={report.translatedBlocks}>
              {t('btReportTranslated', {
                language: props.language,
                count: report.translatedBlocks,
              })}
            </li>
          </ul>
        )}
        {untranslated.length > 0 && (
          <section className="bt-report-part" data-report="untranslated">
            <span className="bt-report-head">{t('btReportUntranslated')}</span>
            <ul className="bt-lines">
              {untranslated.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}
        {kept.length > 0 && (
          <section className="bt-report-part" data-report="original-chapters">
            <span className="bt-report-head">{t('btReportOriginal')}</span>
            <ul className="bt-lines">
              {kept.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}
        {failures.length > 0 && (
          <ul className="bt-lines" role="alert" data-report="failures">
            {failures.map((line) => (
              <li key={line} className="bt-error">
                {line}
              </li>
            ))}
          </ul>
        )}
        {outputs.length > 0 && (
          <section className="bt-report-part" data-report="files">
            <span className="bt-report-head">{t('btReportFiles')}</span>
            <ul className="bt-lines">
              {outputs.map((o) => (
                <li key={o.path} className="bt-output" data-output={o.kind}>
                  <span className="bt-output-name" title={o.path}>
                    {t(KIND_KEY[o.kind])}: {baseName(o.path)}
                  </span>
                  <button
                    type="button"
                    className="bt-btn"
                    data-action="open-result"
                    data-path={o.path}
                    onClick={() => props.onOpen(o.path)}
                  >
                    {t('btOpen')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="bt-actions">
          <button
            type="button"
            className="bt-btn primary"
            data-action="close-report"
            onClick={props.onClose}
          >
            {t('btClose')}
          </button>
        </div>
      </div>
    </div>
  )
}
