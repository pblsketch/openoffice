/**
 * PDF → Markdown / EPUB conversion dialog (spec §3–§5): page range, save
 * location, and for EPUB the cover switch and the book information (prefilled
 * from the PDF, "Fill with AI" on request). Converting shows the job's
 * progress with a Cancel button; a password-protected file asks for its
 * password and retries. Markdown opens in a Markdown tab when done (after the
 * warnings, like the Word conversion's notices); EPUB is only saved and offers
 * "Open folder".
 *
 * The job runs in the shell's structure process; this component only talks to
 * the `api` it is given (window.pdfApi in the app, a fake in tests).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { Lang } from '@genoffice/i18n'
import type {
  PdfConvertOutputRequest,
  PdfReflowFormat,
  PdfStructureConvertRequest,
  PdfStructureConvertResult,
  PdfStructureOutcome,
  PdfStructurePickTargetRequest,
  PdfStructureProgress,
} from '../../shared/ipc'
import type { TFunc } from '../i18n/locale'
import { useModalDialog } from '../modal-dialog'
import { PasswordDialog } from '../PasswordDialog'
import { parsePageRange } from './page-range'
import { conversionWarningLines, structureFailureText } from './messages'
import { BookInfoAiFill, type BookInfoFillState } from './BookInfoAiFill'
import { collectLeadingText, isLanguageTag } from './book-info-ai'

export interface ConvertDialogApi {
  pickTarget(request: PdfStructurePickTargetRequest): Promise<string | null>
  convert(
    request: PdfStructureConvertRequest,
  ): Promise<PdfStructureOutcome<PdfStructureConvertResult>>
  cancel(jobId: string): Promise<boolean>
  onProgress(handler: (progress: PdfStructureProgress) => void): () => void
  releaseTarget(request: PdfConvertOutputRequest): Promise<boolean>
  openResult(request: PdfConvertOutputRequest): Promise<boolean>
  revealResult(request: PdfConvertOutputRequest): Promise<boolean>
}

export interface ConvertDialogProps {
  format: PdfReflowFormat
  /** the open file (the job reads it from disk) */
  filePath: string
  fileName: string
  /** pages of the document once pending edits are saved */
  pageCount: number
  /** the PDF's stored title / author (pending property edits included) */
  docInfo: { title?: string | undefined; author?: string | undefined }
  /** the password the document was opened with */
  password: string | undefined
  lang: Lang
  t: TFunc
  api: ConvertDialogApi
  /** save pending edits so the job reads what is on screen; false = not saved (the editor said why) */
  prepare: () => Promise<boolean>
  /** text of a 1-based page as shown (for "Fill with AI") */
  pageText: (page: number) => Promise<string>
  onClose: () => void
}

type Stage =
  | { kind: 'form' }
  | { kind: 'running'; jobId: string; done: number; total: number }
  | { kind: 'password'; wrong: boolean }
  | { kind: 'done'; outPath: string; warnings: string[] }

const newJobId = (): string =>
  `convert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path
const stemOf = (name: string): string => name.replace(/\.pdf$/i, '')

export function ConvertDialog(props: ConvertDialogProps): ReactElement {
  const { format, filePath, fileName, pageCount, docInfo, lang, t, api } = props
  const epub = format === 'epub'
  const [stage, setStage] = useState<Stage>({ kind: 'form' })
  const [somePages, setSomePages] = useState(false)
  const [rangeText, setRangeText] = useState('')
  const [outPath, setOutPath] = useState<string | null>(null)
  const [cover, setCover] = useState(true)
  const [pageBreaks, setPageBreaks] = useState(false)
  const [title, setTitle] = useState(() => docInfo.title?.trim() || stemOf(fileName))
  const [author, setAuthor] = useState(() => docInfo.author?.trim() ?? '')
  const [language, setLanguage] = useState('')
  /** a problem with the form or the last run, shown above the buttons */
  const [message, setMessage] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [aiPress, setAiPress] = useState(0)
  const [aiState, setAiState] = useState<BookInfoFillState>({ kind: 'idle' })
  const [pwInput, setPwInput] = useState('')
  /** the password the next run uses: the open one, or the one typed into the prompt */
  const passwordRef = useRef(props.password)
  const runningJobRef = useRef<string | null>(null)
  const aliveRef = useRef(true)
  const propsRef = useRef(props)
  propsRef.current = props

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      // closing the dialog (or the tab) mid-run stops the job
      const jobId = runningJobRef.current
      if (jobId) void propsRef.current.api.cancel(jobId)
    }
  }, [])

  const range = somePages ? parsePageRange(rangeText, pageCount) : null
  const rangeError =
    range && !range.ok
      ? range.reason === 'empty'
        ? t('cvPagesEmpty')
        : range.reason === 'syntax'
          ? t('cvPagesSyntax')
          : t('cvPagesOutOfRange', { first: 1, last: pageCount })
      : null
  const titleError = epub && !title.trim() ? t('cvBookTitleRequired') : null
  const languageError =
    epub && language.trim() && !isLanguageTag(language.trim()) ? t('cvBookLanguageInvalid') : null
  const formValid = !rangeError && !titleError && !languageError

  const output = (path: string): PdfConvertOutputRequest => ({ source: filePath, path })

  const chooseTarget = async (): Promise<string | null> => {
    const picked = await api.pickTarget({
      kind: format,
      path: filePath,
      title: t(epub ? 'cvTitleEpub' : 'cvTitleMd'),
    })
    if (picked && aliveRef.current) setOutPath(picked)
    return picked
  }

  const finishMarkdown = (path: string): void => {
    void api.openResult(output(path))
    props.onClose()
  }

  const runJob = async (target: string): Promise<void> => {
    const jobId = newJobId()
    runningJobRef.current = jobId
    setMessage(null)
    setStage({ kind: 'running', jobId, done: 0, total: 0 })
    const off = api.onProgress((progress) => {
      if (progress.jobId !== jobId || !aliveRef.current) return
      setStage((now) =>
        now.kind === 'running' && now.jobId === jobId
          ? { ...now, done: progress.done, total: progress.total }
          : now,
      )
    })
    const pages = range?.ok ? range.pages : undefined
    const password = passwordRef.current
    let result: PdfStructureOutcome<PdfStructureConvertResult>
    try {
      result = await api.convert({
        jobId,
        path: filePath,
        ...(password !== undefined ? { password } : {}),
        ...(pages ? { pages } : {}),
        format,
        outPath: target,
        ...(epub
          ? {
              epub: {
                title: title.trim(),
                ...(author.trim() ? { author: author.trim() } : {}),
                cover,
                ...(language.trim() ? { language: language.trim() } : {}),
                uiLanguage: lang,
                pageImageAlt: t('cvPageImageAlt'),
                pageBreaks,
              },
            }
          : {}),
      })
    } catch (err) {
      result = { ok: false, error: 'failed', message: String(err) }
    } finally {
      off()
      if (runningJobRef.current === jobId) runningJobRef.current = null
    }
    if (!aliveRef.current) return
    if (result.ok) {
      // a target serves one job: the next conversion picks again
      setOutPath(null)
      const warnings = format === 'md' ? conversionWarningLines(result.warnings, t) : []
      if (format === 'md' && warnings.length === 0) {
        finishMarkdown(result.outPath)
        return
      }
      setStage({ kind: 'done', outPath: result.outPath, warnings })
      return
    }
    if (result.error === 'password-required') {
      setPwInput('')
      setStage({ kind: 'password', wrong: password !== undefined })
      return
    }
    if (result.error === 'not-granted' || result.error === 'invalid-target') setOutPath(null)
    setMessage(structureFailureText(result, t))
    setStage({ kind: 'form' })
  }

  const start = async (): Promise<void> => {
    if (stage.kind !== 'form') return
    setShowErrors(true)
    if (!formValid) return
    setMessage(null)
    if (!(await props.prepare()) || !aliveRef.current) return
    const target = outPath ?? (await chooseTarget())
    if (!target || !aliveRef.current) return
    if (format === 'md' && !(await api.releaseTarget(output(target)))) {
      if (aliveRef.current) setMessage(t('cvErrTargetOpen'))
      return
    }
    if (!aliveRef.current) return
    await runJob(target)
  }

  const cancelRun = (): void => {
    if (stage.kind === 'running') void api.cancel(stage.jobId)
  }

  const stageRef = useRef(stage)
  stageRef.current = stage
  const dismiss = useCallback((): void => {
    const now = stageRef.current
    if (now.kind === 'running') {
      void propsRef.current.api.cancel(now.jobId)
      return
    }
    if (now.kind === 'done' && format === 'md') {
      void propsRef.current.api.openResult({ source: filePath, path: now.outPath })
    }
    propsRef.current.onClose()
  }, [filePath, format])
  const dialogRef = useModalDialog(dismiss, { escape: stage.kind !== 'password' })

  const collectText = useCallback(
    () => collectLeadingText(propsRef.current.pageCount, propsRef.current.pageText),
    [],
  )

  if (stage.kind === 'password') {
    return (
      <PasswordDialog
        fileName={fileName}
        value={pwInput}
        wrong={stage.wrong}
        onChange={(value) => {
          setPwInput(value)
          if (stage.wrong) setStage({ kind: 'password', wrong: false })
        }}
        onSubmit={() => {
          passwordRef.current = pwInput
          if (outPath) void runJob(outPath)
          else setStage({ kind: 'form' })
        }}
        onCancel={() => setStage({ kind: 'form' })}
      />
    )
  }

  const heading = t(epub ? 'cvTitleEpub' : 'cvTitleMd')
  const busy = stage.kind === 'running'

  return (
    <div className="pdf-modal-mask">
      <div
        ref={dialogRef}
        className="pdf-modal pdf-modal-wide pdf-convert-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        data-format={format}
      >
        <div className="pdf-modal-title">{heading}</div>

        {stage.kind === 'done' ? (
          <>
            <p className="pdf-convert-done">{t(epub ? 'cvDoneEpub' : 'cvDoneMd')}</p>
            <p className="pdf-convert-path" data-tip={stage.outPath}>
              {baseName(stage.outPath)}
            </p>
            {stage.warnings.length > 0 && (
              <ul className="pdf-convert-warnings">
                {stage.warnings.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <div className="pdf-modal-actions">
              {epub ? (
                <>
                  <button
                    className="pdf-modal-btn"
                    data-action="open-folder"
                    onClick={() => void api.revealResult(output(stage.outPath))}
                  >
                    {t('cvOpenFolder')}
                  </button>
                  <button
                    className="pdf-modal-btn primary"
                    data-action="close"
                    onClick={props.onClose}
                  >
                    {t('cvClose')}
                  </button>
                </>
              ) : (
                <button
                  className="pdf-modal-btn primary"
                  data-action="open-md"
                  onClick={() => finishMarkdown(stage.outPath)}
                >
                  {t('cvOpenMd')}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <fieldset className="pdf-convert-pages" disabled={busy}>
              <legend>{t('cvPages')}</legend>
              <label className="pdf-modal-check">
                <input
                  type="radio"
                  name="pdf-convert-pages"
                  checked={!somePages}
                  onChange={() => setSomePages(false)}
                />
                {t('cvPagesAll', { count: pageCount })}
              </label>
              <label className="pdf-modal-check">
                <input
                  type="radio"
                  name="pdf-convert-pages"
                  data-field="some-pages"
                  checked={somePages}
                  onChange={() => setSomePages(true)}
                />
                {t('cvPagesSome')}
              </label>
              <input
                className={`pdf-modal-input${showErrors && rangeError ? ' invalid' : ''}`}
                data-field="range"
                placeholder={t('cvPagesPlaceholder')}
                value={rangeText}
                disabled={!somePages}
                onChange={(e) => setRangeText(e.target.value)}
              />
              {showErrors && rangeError && (
                <span className="pdf-convert-error" role="alert" data-error="range">
                  {rangeError}
                </span>
              )}
            </fieldset>

            <div className="pdf-field">
              <span>{t('cvTarget')}</span>
              <span className="pdf-convert-path" data-tip={outPath ?? undefined}>
                {outPath ? baseName(outPath) : t('cvTargetNone')}
              </span>
              <button
                className="pdf-modal-btn"
                data-action="choose-target"
                disabled={busy}
                onClick={() => void chooseTarget()}
              >
                {t('cvTargetChoose')}
              </button>
            </div>

            {epub && (
              <div className="pdf-convert-book">
                <label className="pdf-modal-check">
                  <input
                    type="checkbox"
                    data-field="cover"
                    checked={cover}
                    disabled={busy}
                    onChange={(e) => setCover(e.target.checked)}
                  />
                  {t('cvCover')}
                </label>
                <label className="pdf-modal-check">
                  <input
                    type="checkbox"
                    data-field="page-breaks"
                    checked={pageBreaks}
                    disabled={busy}
                    onChange={(e) => setPageBreaks(e.target.checked)}
                  />
                  {t('cvPageBreaks')}
                </label>
                <label className="pdf-field">
                  <span>{t('cvBookTitle')}</span>
                  <input
                    className={`pdf-modal-input${showErrors && titleError ? ' invalid' : ''}`}
                    data-field="title"
                    value={title}
                    disabled={busy}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                {showErrors && titleError && (
                  <span className="pdf-convert-error" role="alert" data-error="title">
                    {titleError}
                  </span>
                )}
                <label className="pdf-field">
                  <span>{t('cvBookAuthor')}</span>
                  <input
                    className="pdf-modal-input"
                    data-field="author"
                    value={author}
                    disabled={busy}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </label>
                <label className="pdf-field">
                  <span>{t('cvBookLanguage')}</span>
                  <input
                    className={`pdf-modal-input${showErrors && languageError ? ' invalid' : ''}`}
                    data-field="language"
                    placeholder={t('cvBookLanguageAuto')}
                    value={language}
                    disabled={busy}
                    onChange={(e) => setLanguage(e.target.value)}
                  />
                </label>
                {showErrors && languageError && (
                  <span className="pdf-convert-error" role="alert" data-error="language">
                    {languageError}
                  </span>
                )}
                <div className="pdf-convert-ai">
                  <button
                    className="pdf-modal-btn"
                    data-action="ai-fill"
                    data-tip={t('cvAiFillTip')}
                    disabled={busy || aiState.kind === 'running'}
                    onClick={() => setAiPress((n) => n + 1)}
                  >
                    {t('cvAiFill')}
                  </button>
                  {aiState.kind !== 'idle' && (
                    <span
                      className={`pdf-convert-ai-state${aiState.kind === 'error' ? ' is-error' : ''}`}
                      data-ai-state={aiState.kind}
                    >
                      {aiState.kind === 'running'
                        ? t('cvAiFilling')
                        : aiState.kind === 'filled'
                          ? t('cvAiFilled')
                          : aiState.message}
                    </span>
                  )}
                </div>
                {aiPress > 0 && (
                  <BookInfoAiFill
                    press={aiPress}
                    lang={lang}
                    t={t}
                    collectText={collectText}
                    onSuggest={(suggestion) => {
                      if (suggestion.title) setTitle(suggestion.title)
                      if (suggestion.author) setAuthor(suggestion.author)
                      if (suggestion.language) setLanguage(suggestion.language)
                    }}
                    onStateChange={setAiState}
                  />
                )}
              </div>
            )}

            {stage.kind === 'running' && (
              <div className="pdf-convert-progress" role="status" data-progress>
                <div className="pdf-convert-bar">
                  <div
                    className="pdf-convert-bar-fill"
                    style={{
                      width:
                        stage.total > 0
                          ? `${Math.min(100, Math.round((stage.done / stage.total) * 100))}%`
                          : '0%',
                    }}
                  />
                </div>
                <span>
                  {stage.total > 0
                    ? t('cvRunning', { done: stage.done, total: stage.total })
                    : t('cvPreparing')}
                </span>
              </div>
            )}

            {message && (
              <p className="pdf-convert-error" role="alert" data-error="run">
                {message}
              </p>
            )}

            <div className="pdf-modal-actions">
              {busy ? (
                <button className="pdf-modal-btn" data-action="cancel-run" onClick={cancelRun}>
                  {t('cancel')}
                </button>
              ) : (
                <>
                  <button className="pdf-modal-btn" data-action="close" onClick={props.onClose}>
                    {t('cancel')}
                  </button>
                  <button
                    className="pdf-modal-btn primary"
                    data-action="convert"
                    onClick={() => void start()}
                  >
                    {t('cvConvert')}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
