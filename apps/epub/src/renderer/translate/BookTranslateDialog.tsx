/**
 * The book translation window (spec §8): the choices, then the pre-start
 * confirmation.
 *
 * - Choices: the target language (one of the 21 UI languages; the default is
 *   the UI language, or English when the book is in it), the chapters (spine
 *   order with their contents titles, all chosen by default; damaged and
 *   fixed-layout chapters cannot be chosen and say why), and the results (a
 *   translated book, a bilingual book, or both), each with the place it is
 *   saved to. The save dialog suggests `<name>.<lang>.epub` and
 *   `<name>.<lang>.bilingual.epub`; the book itself and files open in a tab are
 *   refused, with the reason.
 * - Confirmation: the calls the job makes, the blocks already translated (not
 *   sent again), the AI it sends to, a paid route's charge, a warning when the
 *   stored translation was made with another provider or model, and a warning
 *   when the target is the book's own language (it does not stop the start).
 *   With unsaved changes the start button is "Save and translate": the book
 *   is saved first and nothing starts when the save fails. "Translate again
 *   from the start" asks once more before it deletes the stored translation
 *   of the language. When everything chosen is already stored, the results
 *   are written without a call. When a save changed the book while the window
 *   was open (an automatic save, Ctrl+S) and with it the calls the job would
 *   make, the confirmation is shown again with the new numbers instead of
 *   starting.
 *
 * The way (spec §5.5): "Translate" (the default) or "Easy explanation". The
 * easy way rewrites the book in plain words of the target language, whose
 * default is always the UI language; its results are the easy book and the
 * book with the explanation after the original, suggested as
 * `<name>.<lang>.<word>.epub` and `<name>.<lang>.<word>.bilingual.epub` with
 * the UI language's word for it, so a translated book is never the default.
 * The confirmation counts, names the AI and the charge from the easy
 * explanation's own stored results, and "again from the start" deletes only
 * those. Switching the way sends nothing; it picks that way's default
 * language and asks for the places again.
 *
 * The units are read here from the saved book (the main process; no AI), so
 * the estimate counts what the job would send. Nothing is sent from here:
 * Start hands the confirmed choice and route to the caller, after the shared
 * send gate let it through.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { AiProviderId, AiSettings } from '@genoffice/ai-provider/browser'
import type { DocumentJobEstimate, TranslationMode } from '@genoffice/pdf-structure'
import type {
  EpubSkippedChapter,
  EpubTranslationOutputKind,
  EpubTranslationUnit,
} from '@genoffice/epub-engine'
import type { Lang } from '@genoffice/i18n'
import {
  AiConnectPrompt,
  AiFirstConnectionNotice,
  aiProviderDisplayName,
  useAiSendGate,
  useModalKeys,
  type AiModelPickerBridge,
} from '@genoffice/ui'
import type {
  EpubAiApi,
  EpubBookSummary,
  EpubResultPathRefusal,
  EpubStoreApi,
  EpubTranslateApi,
} from '../../shared/ipc'
import type { StringKey, TFunc } from '../i18n/locale'
import { useSubscriptionConnection } from '../ai/subscription-client'
import {
  TRANSLATION_LANGUAGES,
  defaultEpubTargetLanguage,
  easyExplanationLabel,
  epubBookLanguage,
  epubSampleText,
  estimateEpubTranslationJob,
  isTranslationLanguage,
} from './engine'
import { createBookJobStore } from './ipc-store'
import { documentJobRoute, routeLabel, sameRoute, type DocumentJobRoute } from './route'
import {
  KIND_KEYS,
  RESULT_KINDS,
  baseName,
  chapterRows,
  chosenChapters,
  initialChapters,
  languageName,
  resultName,
  sameLanguage,
  unitsForChapters,
  type ChapterRow,
} from './translate-model'

export type ReadyRoute = Extract<DocumentJobRoute, { state: 'ready' }>

/** what the window needs of the preload */
export type BookTranslateDialogApi = Pick<EpubTranslateApi, 'translationUnits'> &
  Partial<Pick<EpubTranslateApi, 'pickResultTarget'>> & {
    store: Pick<EpubStoreApi, 'translation' | 'write'>
  } & Partial<
    Pick<
      EpubAiApi,
      'getAiSettings' | 'setAiSettings' | 'onAiSettingsChanged' | 'openAiModelSettings'
    >
  >

/** translate, start over (the stored translation of the language is deleted first), or only write */
export type BookTranslateMode = 'translate' | 'restart' | 'export'

export interface BookResultTarget {
  kind: EpubTranslationOutputKind
  path: string
}

export interface BookTranslateStartRequest {
  /** the store key of the saved book the units were read from */
  docHash: string
  lang: string
  /** spine indices; undefined = every chapter that can be chosen */
  chapters: number[] | undefined
  /** the units of the choice (the title and contents, and the chosen chapters' blocks) */
  units: EpubTranslationUnit[]
  /** the result books, in kind order */
  targets: BookResultTarget[]
  /** the calls the confirmation showed; a different count on the saved book asks again */
  calls?: number
  mode: BookTranslateMode
  /** 'easy': an easy explanation; absent (or 'translate') for a translation */
  translationMode?: TranslationMode
  /** the confirmed AI (absent for 'export') */
  route?: ReadyRoute
}

/** what the caller answers to Start */
export type BookTranslateStartAnswer =
  | { ok: true }
  | { ok: false; busy: { done: number; total: number } }
  | { ok: false; error: string }
  /** a save changed the book and the calls since the confirmation was shown: nothing started */
  | { ok: false; changed: true }

export interface BookTranslateDialogProps {
  book: EpubBookSummary
  /** the book's file */
  filePath: string
  /** UI language */
  lang: Lang
  t: TFunc
  api: BookTranslateDialogApi
  /** the target language asked for (the AI panel, a resumed job); null = the default */
  initialLang: string | null
  /** spine indices asked for; null = every chapter */
  initialChapters: number[] | null
  /** the way chosen when the window opens (a resumed job's); default 'translate' */
  initialMode?: TranslationMode
  /** the book has changes that are not saved: the start saves first */
  dirty: boolean
  onStart: (request: BookTranslateStartRequest) => Promise<BookTranslateStartAnswer>
  onClose: () => void
}

const MODES: readonly TranslationMode[] = ['translate', 'easy']

const MODE_KEY: Record<TranslationMode, StringKey> = {
  translate: 'btModeTranslate',
  easy: 'btModeEasy',
}

const REFUSAL_KEY: Record<EpubResultPathRefusal, StringKey> = {
  source: 'btLocationSource',
  'open-in-tab': 'btLocationOpen',
  'not-epub': 'btLocationInvalid',
  invalid: 'btLocationInvalid',
}

interface Analysis {
  docHash: string
  units: EpubTranslationUnit[]
  skipped: EpubSkippedChapter[]
  rows: ChapterRow[]
  /** the book's language: `dc:language`, else the guess from its text */
  bookLanguage: string | undefined
  /** the default target language of each way */
  defaults: Record<TranslationMode, string>
}

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; analysis: Analysis }

type Location =
  { state: 'picked'; path: string } | { state: 'refused'; reason: EpubResultPathRefusal }

export function BookTranslateDialog(props: BookTranslateDialogProps): ReactElement {
  const { filePath, lang, t, api } = props
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [step, setStep] = useState<'choose' | 'confirm'>('choose')
  const [mode, setMode] = useState<TranslationMode>(props.initialMode ?? 'translate')
  const modeRef = useRef(mode)
  modeRef.current = mode
  const [target, setTarget] = useState<string | null>(
    props.initialLang && isTranslationLanguage(props.initialLang) ? props.initialLang : null,
  )
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [kinds, setKinds] = useState<Set<EpubTranslationOutputKind>>(new Set(['translated']))
  const [locations, setLocations] = useState<Partial<Record<EpubTranslationOutputKind, Location>>>(
    {},
  )
  const [picking, setPicking] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const propsRef = useRef(props)
  propsRef.current = props
  const dismiss = useCallback(() => propsRef.current.onClose(), [])
  const modal = useModalKeys(dismiss, { restoreFocus: true })

  const aliveRef = useRef(true)
  const chosenRef = useRef(chosen)
  chosenRef.current = chosen

  /**
   * Read the units of the saved book (the main process reads them; no AI).
   * Again after a save changed the book: the chapters chosen stay chosen.
   */
  const readUnits = useCallback(async (again: boolean): Promise<void> => {
    try {
      const out = await propsRef.current.api.translationUnits({})
      if (!aliveRef.current) return
      if (!out.ok) {
        // read again: the confirmation stays, without numbers, so nothing can start from it
        if (!again) setLoad({ kind: 'failed' })
        return
      }
      const p = propsRef.current
      const rows = chapterRows(p.book, out.units, out.skipped, p.t)
      const sample = epubSampleText(out.units)
      const defaults: Record<TranslationMode, string> = {
        translate: defaultEpubTargetLanguage(p.lang, p.book.metadata.languages, sample),
        easy: defaultEpubTargetLanguage(p.lang, p.book.metadata.languages, sample, 'easy'),
      }
      setTarget((asked) => asked ?? defaults[modeRef.current])
      setChosen(initialChapters(rows, again ? [...chosenRef.current] : p.initialChapters))
      setLoad({
        kind: 'ready',
        analysis: {
          docHash: out.docHash,
          units: out.units,
          skipped: out.skipped,
          rows,
          bookLanguage: epubBookLanguage(p.book.metadata.languages, sample),
          defaults,
        },
      })
    } catch {
      if (aliveRef.current && !again) setLoad({ kind: 'failed' })
    }
  }, [])

  // the units of the saved book, once per opened window
  useEffect(() => {
    aliveRef.current = true
    void readUnits(false)
    return () => {
      aliveRef.current = false
    }
  }, [readUnits])

  const analysis = load.kind === 'ready' ? load.analysis : null
  const lang0 = target ?? 'en'
  const easy = mode === 'easy'
  /** the UI language's word for an easy explanation, in its result names */
  const easyWord = easy ? easyExplanationLabel(lang) : undefined
  const kindKey = KIND_KEYS[mode]
  const units = useMemo(
    () => (analysis ? unitsForChapters(analysis.units, chosen) : []),
    [analysis, chosen],
  )
  const chapterCount = analysis ? analysis.rows.filter((r) => chosen.has(r.index)).length : 0
  const chosenKinds = RESULT_KINDS.filter((k) => kinds.has(k))
  const targets: BookTranslateStartRequest['targets'] = []
  for (const kind of chosenKinds) {
    const at = locations[kind]
    if (at?.state === 'picked') targets.push({ kind, path: at.path })
  }
  const samePlace =
    targets.length === 2 && targets[0]!.path.toLowerCase() === targets[1]!.path.toLowerCase()

  const chapterError = analysis && chapterCount === 0 ? t('btChaptersRequired') : null
  const kindError = chosenKinds.length === 0 ? t('btResultRequired') : null
  const locationError =
    !kindError && targets.length < chosenKinds.length
      ? t('btLocationRequired')
      : samePlace
        ? t('btLocationSame')
        : null
  const noUnits = !!analysis && !chapterError && units.length === 0
  const canNext = !!analysis && !chapterError && !kindError && !locationError && !noUnits

  /** a save changed the book since the window read it: read it again, keep the step */
  const bookChanged = () => void readUnits(true)

  /** another way: its default language, and the places chosen again (the names carry the way) */
  const changeMode = (next: TranslationMode) => {
    if (next === mode) return
    setMode(next)
    if (analysis) setTarget(analysis.defaults[next])
    setLocations({})
  }

  const changeLanguage = (next: string) => {
    setTarget(next)
    // the suggested names carry the language: the places are chosen again
    setLocations({})
  }

  const toggleChapter = (index: number) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  const toggleKind = (kind: EpubTranslationOutputKind) =>
    setKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })

  const pickLocation = async (kind: EpubTranslationOutputKind) => {
    if (picking || !api.pickResultTarget) return
    setPicking(true)
    try {
      const out = await api.pickResultTarget({
        kind,
        lang: lang0,
        ...(easyWord !== undefined
          ? { defaultName: resultName(filePath, lang0, kind, easyWord) }
          : {}),
      })
      if (!out) return
      setLocations((prev) => ({
        ...prev,
        [kind]: out.ok
          ? { state: 'picked', path: out.path }
          : { state: 'refused', reason: out.reason },
      }))
    } catch {
      // the dialog could not be shown: nothing was chosen
    } finally {
      setPicking(false)
    }
  }

  const next = () => {
    setShowErrors(true)
    if (canNext) setStep('confirm')
  }

  return (
    <div className="bt-mask" ref={modal.ref} onKeyDown={modal.onKeyDown} tabIndex={-1}>
      <div
        className="bt-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('btTitle')}
        data-step={step}
      >
        <div className="bt-title">
          {step === 'choose' ? t('btTitle') : t(easy ? 'btEasyConfirmTitle' : 'btConfirmTitle')}
        </div>
        {step === 'choose' ? (
          <>
            <p className="bt-hint">{t(easy ? 'btEasyIntro' : 'btIntro')}</p>
            {load.kind === 'loading' && (
              <p className="bt-status" role="status" data-loading>
                {t('btLoading')}
              </p>
            )}
            {load.kind === 'failed' && (
              <p className="bt-error" role="alert" data-error="load">
                {t('btLoadFailed')}
              </p>
            )}
            {analysis && (
              <>
                <fieldset className="bt-group bt-modes" data-mode={mode}>
                  <legend>{t('btMode')}</legend>
                  {MODES.map((m) => (
                    <label key={m} className="bt-check">
                      <input
                        type="radio"
                        name="bt-mode"
                        data-field={`mode-${m}`}
                        checked={mode === m}
                        onChange={() => changeMode(m)}
                      />
                      {t(MODE_KEY[m])}
                    </label>
                  ))}
                </fieldset>

                <label className="bt-field">
                  <span>{t(easy ? 'btEasyLanguage' : 'btLanguage')}</span>
                  <select
                    className="bt-input"
                    data-field="language"
                    value={lang0}
                    onChange={(e) => changeLanguage(e.target.value)}
                  >
                    {TRANSLATION_LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {languageName(code, lang)}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className="bt-group">
                  <legend>{t('btChapters')}</legend>
                  <div className="bt-chapter-tools">
                    <button
                      type="button"
                      className="bt-link"
                      data-action="chapters-all"
                      onClick={() => setChosen(initialChapters(analysis.rows, null))}
                    >
                      {t('btChaptersAll')}
                    </button>
                    <button
                      type="button"
                      className="bt-link"
                      data-action="chapters-none"
                      onClick={() => setChosen(new Set())}
                    >
                      {t('btChaptersNone')}
                    </button>
                  </div>
                  <ul className="bt-chapters">
                    {analysis.rows.map((row) => (
                      <li
                        key={row.index}
                        data-chapter={row.index}
                        data-blocked={row.blocked ?? undefined}
                      >
                        <label className="bt-check">
                          <input
                            type="checkbox"
                            data-field={`chapter-${row.index}`}
                            checked={row.blocked === null && chosen.has(row.index)}
                            disabled={row.blocked !== null}
                            onChange={() => toggleChapter(row.index)}
                          />
                          <span className="bt-chapter-title">{row.title}</span>
                        </label>
                        {row.blocked !== null && (
                          <span className="bt-note" data-reason={row.blocked}>
                            {t(row.blocked === 'broken' ? 'btChapterBroken' : 'btChapterFixed')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {showErrors && chapterError && (
                    <span className="bt-error" role="alert" data-error="chapters">
                      {chapterError}
                    </span>
                  )}
                </fieldset>

                <fieldset className="bt-group">
                  <legend>{t('btResults')}</legend>
                  {RESULT_KINDS.map((kind) => {
                    const on = kinds.has(kind)
                    const at = locations[kind]
                    return (
                      <div key={kind} className="bt-result" data-kind={kind}>
                        <label className="bt-check">
                          <input
                            type="checkbox"
                            data-field={`kind-${kind}`}
                            checked={on}
                            onChange={() => toggleKind(kind)}
                          />
                          {t(kindKey[kind])}
                        </label>
                        {on && (
                          <div className="bt-location">
                            <span
                              className="bt-location-text"
                              data-location={at?.state === 'picked' ? at.path : ''}
                              title={at?.state === 'picked' ? at.path : undefined}
                            >
                              {at?.state === 'picked'
                                ? t('btLocation', { name: baseName(at.path) })
                                : t('btLocationNone', {
                                    name: resultName(filePath, lang0, kind, easyWord),
                                  })}
                            </span>
                            <button
                              type="button"
                              className="bt-btn"
                              data-action={`pick-${kind}`}
                              disabled={picking || !api.pickResultTarget}
                              onClick={() => void pickLocation(kind)}
                            >
                              {t('btLocationPick')}
                            </button>
                            {at?.state === 'refused' && (
                              <span className="bt-error" role="alert" data-refused={at.reason}>
                                {t(REFUSAL_KEY[at.reason])}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {showErrors && (kindError ?? locationError) && (
                    <span className="bt-error" role="alert" data-error="results">
                      {kindError ?? locationError}
                    </span>
                  )}
                </fieldset>

                {noUnits ? (
                  <p className="bt-error" role="alert" data-error="no-units">
                    {t('btNoUnits')}
                  </p>
                ) : (
                  !chapterError && (
                    <p className="bt-status" data-units={units.length}>
                      {t('btUnits', { count: units.length })}
                    </p>
                  )
                )}
              </>
            )}
            <div className="bt-actions">
              <button type="button" className="bt-btn" data-action="cancel" onClick={props.onClose}>
                {t('btCancel')}
              </button>
              <button
                type="button"
                className="bt-btn primary"
                data-action="next"
                disabled={!analysis}
                onClick={next}
              >
                {t('btNext')}
              </button>
            </div>
          </>
        ) : (
          analysis && (
            <BookTranslateConfirm
              lang={lang}
              t={t}
              api={api}
              docHash={analysis.docHash}
              target={lang0}
              mode={mode}
              units={units}
              chapters={chosenChapters(analysis.rows, chosen)}
              targets={targets}
              sameAsBook={!easy && sameLanguage(analysis.bookLanguage, lang0)}
              dirty={props.dirty}
              onBack={() => setStep('choose')}
              onCancel={props.onClose}
              onStart={props.onStart}
              onBookChanged={bookChanged}
            />
          )
        )}
      </div>
    </div>
  )
}

/** the pre-start confirmation; mounted only once the user reached it */
function BookTranslateConfirm({
  lang,
  t,
  api,
  docHash,
  target,
  mode,
  units,
  chapters,
  targets,
  sameAsBook,
  dirty,
  onBack,
  onCancel,
  onStart,
  onBookChanged,
}: {
  lang: Lang
  t: TFunc
  api: BookTranslateDialogApi
  docHash: string
  target: string
  /** the way: its stored results are counted, and its words are used */
  mode: TranslationMode
  units: EpubTranslationUnit[]
  chapters: number[] | undefined
  targets: BookResultTarget[]
  sameAsBook: boolean
  dirty: boolean
  onBack: () => void
  onCancel: () => void
  onStart: (request: BookTranslateStartRequest) => Promise<BookTranslateStartAnswer>
  /** the saved book changed: the window reads it again (new units, a new estimate follows) */
  onBookChanged: () => void
}): ReactElement {
  const connection = useSubscriptionConnection()
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [estimate, setEstimate] = useState<DocumentJobEstimate | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [askRestart, setAskRestart] = useState(false)
  const route = documentJobRoute(settings, connection.statuses)
  /** what the user saw when pressing Start; a held start runs only if it still holds */
  const confirmedRef = useRef<{ route: ReadyRoute; mode: BookTranslateMode } | null>(null)
  const latest = useRef({ settings, statuses: connection.statuses })
  latest.current = { settings, statuses: connection.statuses }
  const routeKey = route.state === 'ready' ? `${route.provider}\n${route.model}` : ''
  const apiRef = useRef(api)
  apiRef.current = api
  const easy = mode === 'easy'
  /** the words of the way: an easy explanation's own, or the translation's */
  const say = (plain: StringKey, easyKey: StringKey): StringKey => (easy ? easyKey : plain)

  const bridge = useMemo<AiModelPickerBridge>(
    () => ({
      getSettings: () =>
        apiRef.current.getAiSettings?.() ??
        Promise.reject(new Error('the AI settings cannot be read')),
      setSettings: (next) =>
        apiRef.current.setAiSettings?.(next) ??
        Promise.reject(new Error('the AI settings cannot be saved')),
      onSettingsChanged: (handler) => apiRef.current.onAiSettingsChanged?.(handler) ?? (() => {}),
      openModelSettings: () => void apiRef.current.openAiModelSettings?.().catch(() => {}),
    }),
    [],
  )

  useEffect(() => {
    let alive = true
    const refresh = () => {
      void apiRef.current
        .getAiSettings?.()
        .then((next) => {
          if (alive) setSettings(next)
        })
        .catch(() => {})
    }
    refresh()
    const off = apiRef.current.onAiSettingsChanged?.(refresh)
    return () => {
      alive = false
      off?.()
    }
  }, [])

  // the store tells what is already translated; the route's model tells a provider change
  useEffect(() => {
    let alive = true
    const [provider = '', model = ''] = routeKey ? routeKey.split('\n') : []
    estimateEpubTranslationJob({
      docHash,
      lang: target,
      units,
      model: { provider, model },
      store: createBookJobStore(api.store),
      ...(easy ? { mode: 'easy' as const } : {}),
    }).then(
      (e) => {
        if (alive) setEstimate(e)
      },
      () => {
        if (alive) setMessage(t('btLoadFailed'))
      },
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- per confirmation, route and read of the book
  }, [routeKey, docHash, units, mode])

  const send = async (o: { mode: BookTranslateMode; route?: ReadyRoute }): Promise<void> => {
    setStarting(true)
    try {
      const answer = await onStart({
        docHash,
        lang: target,
        chapters,
        units,
        targets,
        ...(estimate ? { calls: estimate.calls } : {}),
        mode: o.mode,
        ...(easy ? { translationMode: 'easy' as const } : {}),
        ...(o.route ? { route: o.route } : {}),
      })
      if (answer.ok) return
      if ('changed' in answer) {
        // the numbers shown no longer hold: they are counted again before anything starts
        setEstimate(null)
        setMessage(t('btBookChanged'))
        onBookChanged()
      } else {
        setMessage('busy' in answer ? t('btBusy', answer.busy) : answer.error)
      }
    } finally {
      setStarting(false)
    }
  }

  const run = async (): Promise<void> => {
    const confirmed = confirmedRef.current
    if (!confirmed) return
    const now = documentJobRoute(latest.current.settings, latest.current.statuses)
    if (!sameRoute(confirmed.route, now)) {
      // the connection changed while the start was held: show the new state first
      confirmedRef.current = null
      setMessage(t('btRouteChanged'))
      return
    }
    await send({ mode: confirmed.mode, route: confirmed.route })
    confirmedRef.current = null
  }
  const runRef = useRef(run)
  runRef.current = run

  const sendGate = useAiSendGate<number>({
    settings,
    statuses: connection.statuses,
    store: bridge,
    start: () => void runRef.current(),
    onSettingsSaved: (next) => setSettings(next),
  })
  const pressRef = useRef(0)

  const nothingToSend = !!estimate && estimate.calls === 0
  /** the route and its terms are shown: something will be sent (a restart sends everything again) */
  const sending = !nothingToSend || askRestart
  const canSend = route.state === 'ready' && !!estimate && !starting && !sendGate.noticeDue
  const canStart = canSend && !nothingToSend
  const startJob = (mode: BookTranslateMode) => {
    if (route.state !== 'ready' || !(mode === 'restart' ? canSend : canStart)) return
    setMessage(null)
    setAskRestart(false)
    confirmedRef.current = { route, mode }
    if (sendGate.admit(++pressRef.current)) void run()
  }
  /** write the results from what is stored; nothing is sent */
  const exportStored = () => {
    if (starting || !estimate || estimate.done === 0) return
    setMessage(null)
    void send({ mode: 'export' })
  }

  const connectChoice =
    sendGate.connectChoice ?? (route.state === 'not-connected' ? route.choice : null)
  const change = route.state === 'ready' ? estimate?.providerChange : null
  const storedName = (p: { provider: string | null; model: string | null }) =>
    p.provider
      ? p.model
        ? `${aiProviderDisplayName(p.provider as AiProviderId)} · ${p.model}`
        : aiProviderDisplayName(p.provider as AiProviderId)
      : t('btProviderUnknown')
  const language = languageName(target, lang)

  return (
    <>
      <ul className="bt-summary" data-confirm>
        <li data-language={target} data-mode={mode}>
          {t(say('btConfirmLanguage', 'btEasyConfirmLanguage'), { language })}
        </li>
        <li data-calls={estimate?.calls ?? ''}>
          {estimate
            ? t('btConfirmCalls', { calls: estimate.calls, blocks: estimate.pending })
            : t('btLoading')}
        </li>
        {estimate && estimate.done > 0 && (
          <li data-done={estimate.done}>
            {t(say('btConfirmDone', 'btEasyConfirmDone'), {
              done: estimate.done,
              total: estimate.total,
            })}
          </li>
        )}
        {sending && route.state === 'checking' && (
          <li data-route="checking">{t('btConfirmChecking')}</li>
        )}
        {sending && route.state === 'ready' && (
          <>
            <li data-route="ready" data-provider={route.provider}>
              {t('btConfirmProvider', { provider: routeLabel(route) })}
            </li>
            <li>{t('btConfirmSends')}</li>
            {route.paid && (
              <li className="bt-paid" data-paid>
                {t('btConfirmPaid', { provider: aiProviderDisplayName(route.provider) })}
              </li>
            )}
          </>
        )}
      </ul>
      <p className="bt-status" data-rights>
        {t('btRightsNotice')}
      </p>
      {sameAsBook && (
        <p className="bt-warning" role="alert" data-same-language>
          {t('btSameLanguage', { language })}
        </p>
      )}
      {!nothingToSend && change && (
        <p className="bt-warning" role="alert" data-provider-change>
          {t(say('btProviderChange', 'btEasyProviderChange'), {
            stored: storedName(change.stored),
            next: routeLabel(route as ReadyRoute),
          })}
        </p>
      )}
      {dirty && (
        <p className="bt-warning" data-unsaved>
          {t('btUnsaved')}
        </p>
      )}
      {nothingToSend && (
        <p className="bt-status" data-nothing>
          {t(say('btNothing', 'btEasyNothing'))}
        </p>
      )}
      {sending && connectChoice && (
        <AiConnectPrompt
          choice={connectChoice}
          statuses={connection.statuses}
          lang={lang}
          disabled={connection.busy}
          attention={sendGate.connectAttention}
          onOpenSettings={() => void apiRef.current.openAiModelSettings?.().catch(() => {})}
          onInstall={connection.install}
          onUpdate={connection.update}
          onCancelLogin={connection.cancelLogin}
          onLogin={connection.login}
          onRecheck={connection.recheck}
          onAcceptMetered={connection.acceptMetered}
          onOpenInstallHelp={connection.openInstallHelp}
        />
      )}
      {sending && sendGate.noticeDue && (
        <>
          <p className="bt-hint" role="note" data-notice="book">
            {t(say('btNoticeSends', 'btEasyNoticeSends'))}
          </p>
          <AiFirstConnectionNotice
            lang={lang}
            codexKeepsHistory
            onAcknowledge={sendGate.acknowledgeNotice}
          />
        </>
      )}
      {askRestart && estimate && (
        <div className="bt-restart" role="alertdialog" data-restart-confirm>
          <p>
            {t(say('btRestartConfirm', 'btEasyRestartConfirm'), {
              language,
              count: estimate.done,
            })}
          </p>
          <div className="bt-actions">
            <button
              type="button"
              className="bt-btn"
              data-action="restart-no"
              onClick={() => setAskRestart(false)}
            >
              {t('btCancel')}
            </button>
            <button
              type="button"
              className="bt-btn primary"
              data-action="restart-yes"
              disabled={!canSend}
              onClick={() => startJob('restart')}
            >
              {dirty
                ? t(say('btRestartSaveYes', 'btEasyRestartSaveYes'))
                : t(say('btRestartYes', 'btEasyRestartYes'))}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className="bt-error" role="alert" data-error="start">
          {message}
        </p>
      )}
      <div className="bt-actions">
        {estimate && estimate.done > 0 && !askRestart && (
          <button
            type="button"
            className="bt-btn"
            data-action="restart"
            disabled={starting}
            onClick={() => setAskRestart(true)}
          >
            {t(say('btRestart', 'btEasyRestart'))}
          </button>
        )}
        <button type="button" className="bt-btn" data-action="back" onClick={onBack}>
          {t('btBack')}
        </button>
        <button type="button" className="bt-btn" data-action="cancel" onClick={onCancel}>
          {t('btCancel')}
        </button>
        {nothingToSend ? (
          <button
            type="button"
            className="bt-btn primary"
            data-action="export"
            disabled={starting}
            onClick={exportStored}
          >
            {dirty ? t('btSaveAndExport') : t('btExport')}
          </button>
        ) : (
          <button
            type="button"
            className="bt-btn primary"
            data-action="start"
            disabled={!canStart}
            onClick={() => startJob('translate')}
          >
            {dirty ? t(say('btSaveAndStart', 'btEasySaveAndStart')) : t('btStart')}
          </button>
        )}
      </div>
    </>
  )
}
