/**
 * The data behind the side-by-side translation view (reading-assist spec
 * 4.5): the document tree of the saved file and the stored translation it
 * shows.
 *
 * - The tree is built once when the view turns on (a structure job in the
 *   shell's own process, no AI), with the stored AI readings merged so the
 *   blocks match what the translation job keyed. It is kept only while the
 *   view is on and the tab lives: turning the view off drops it (and stops a
 *   build still running), so a large document does not stay in memory.
 * - A save that changed the file bumps `revision`: the tree is built again
 *   from the saved bytes (the store results were carried to the new hash
 *   before).
 * - The language is the stored translation written most recently, else the
 *   default target language; the reader can switch it.
 * - `mode` picks the results shown: the plain translation or the easy
 *   explanation (translation-reading spec 5.3). Each has its own stored
 *   languages; switching reads that mode's results for the shown language
 *   and, while the reader has not picked a language, moves to that mode's
 *   most recent one (an easy explanation defaults to the UI language).
 *
 * Only reads: structure.tree, store.aiReadPages, store.translationRecency,
 * store.translation. Nothing is sent to an AI and nothing is written.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import { applyStoredAiReadings } from '../../../../../packages/pdf-structure/src/ai-read'
import { defaultTargetLanguageForTree } from '../../../../../packages/pdf-structure/src/translate/language'
import type { TranslationMode } from '../../../../../packages/pdf-structure/src/store/job-keys'
import type { DocumentTree } from '../../../../../packages/pdf-structure/src/tree/types'
import type {
  PdfStoreApi,
  PdfStoredTranslation,
  PdfStructureApi,
  PdfStructureProgress,
} from '../../shared/ipc'
import { buildBilingualModel, chooseBilingualLanguage, type BilingualModel } from './model'

export interface BilingualDataApi {
  tree: PdfStructureApi['tree']
  cancel: PdfStructureApi['cancel']
  onProgress: PdfStructureApi['onProgress']
  store: Pick<PdfStoreApi, 'aiReadPages' | 'translationRecency' | 'translation'>
}

export type BilingualLoad =
  | { kind: 'off' }
  /** no saved file, or no structure channel (standalone run) */
  | { kind: 'unavailable' }
  | { kind: 'loading'; done: number; total: number }
  | { kind: 'failed' }
  | { kind: 'ready' }

export interface BilingualDataOptions {
  enabled: boolean
  /** the open file as saved; empty when there is none */
  filePath: string
  password: string | undefined
  /** UI language (the default target language follows it) */
  uiLang: Lang
  /** bumped after a save that changed the file: rebuild the tree */
  revision: number
  /** null when the structure / store channels are missing */
  api: BilingualDataApi | null
  /** the results shown: the plain translation (default) or the easy explanation */
  mode?: TranslationMode
}

export interface BilingualData {
  load: BilingualLoad
  /** result-store key of the analyzed bytes (null while off or loading) */
  docHash: string | null
  /** the tree of the saved file (null while off or loading) */
  tree: DocumentTree | null
  /** the language shown (null until the tree is in) */
  lang: string | null
  /** the results shown: the plain translation or the easy explanation */
  mode: TranslationMode
  /** languages with stored results of `mode`, most recently written first */
  storedLangs: string[]
  setLang: (lang: string) => void
  /** the columns of every page (null until the tree is in) */
  model: BilingualModel | null
  /** read the stored translation again (after a write into the store) */
  refresh: () => void
}

let jobSeq = 0
const newJobId = (): string =>
  `bilingual-tree-${Date.now().toString(36)}-${(++jobSeq).toString(36)}`

interface Analysis {
  docHash: string
  tree: DocumentTree
}

/** a stored translation as read, with the mode it was read for */
interface Stored {
  mode: TranslationMode
  translation: PdfStoredTranslation | null
}

/** a store read in a mode: a plain read passes no mode, exactly as before */
const recencyOf = (api: BilingualDataApi, docHash: string, mode: TranslationMode) =>
  mode === 'easy'
    ? api.store.translationRecency(docHash, 'easy')
    : api.store.translationRecency(docHash)

const translationOf = (
  api: BilingualDataApi,
  docHash: string,
  lang: string,
  mode: TranslationMode,
) =>
  mode === 'easy'
    ? api.store.translation(docHash, lang, 'easy')
    : api.store.translation(docHash, lang)

export function useBilingualData(o: BilingualDataOptions): BilingualData {
  const { enabled, filePath, password, revision, api } = o
  const mode: TranslationMode = o.mode === 'easy' ? 'easy' : 'translate'
  const [load, setLoad] = useState<BilingualLoad>({ kind: 'off' })
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [lang, setLangState] = useState<string | null>(null)
  const [storedLangs, setStoredLangs] = useState<string[]>([])
  /** the mode `storedLangs` were read for (null: none read yet) */
  const langsModeRef = useRef<TranslationMode | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const [stored, setStored] = useState<Stored | null>(null)
  const [storeRev, setStoreRev] = useState(0)
  const uiLangRef = useRef(o.uiLang)
  uiLangRef.current = o.uiLang
  const apiRef = useRef(api)
  apiRef.current = api
  /** a language the reader picked survives a rebuild after save, not a turn-off */
  const pickedRef = useRef<string | null>(null)

  // build (or drop) the tree
  useEffect(() => {
    if (!enabled) {
      pickedRef.current = null
      langsModeRef.current = null
      setAnalysis(null)
      setStored(null)
      setLangState(null)
      setStoredLangs([])
      setLoad({ kind: 'off' })
      return
    }
    const a = apiRef.current
    if (!a || !filePath) {
      setAnalysis(null)
      setLoad({ kind: 'unavailable' })
      return
    }
    let alive = true
    let finished = false
    const jobId = newJobId()
    setLoad({ kind: 'loading', done: 0, total: 0 })
    const off = a.onProgress((p: PdfStructureProgress) => {
      if (alive && p.jobId === jobId) setLoad({ kind: 'loading', done: p.done, total: p.total })
    })
    void (async () => {
      try {
        const out = await a.tree({
          jobId,
          path: filePath,
          ...(password !== undefined ? { password } : {}),
        })
        finished = true
        if (!alive) return
        if (!out.ok) {
          setAnalysis(null)
          setLoad({ kind: out.error === 'not-available' ? 'unavailable' : 'failed' })
          return
        }
        const readingsOut = await a.store.aiReadPages(out.docHash).catch(() => null)
        if (!alive) return
        const readings = new Map(
          readingsOut?.ok
            ? readingsOut.pages.map((p) => [p.pageFingerprint, { payload: p.payload }])
            : [],
        )
        const tree = readings.size > 0 ? applyStoredAiReadings(out.tree, readings) : out.tree
        const shownMode = modeRef.current
        const recency = await recencyOf(a, out.docHash, shownMode).catch(() => null)
        if (!alive) return
        const langs = recency?.ok ? recency.langs : []
        langsModeRef.current = shownMode
        setStoredLangs(langs.filter((l) => l.savedAt !== null).map((l) => l.lang))
        const next =
          pickedRef.current ??
          chooseBilingualLanguage(
            langs,
            defaultTargetLanguageForTree(tree, uiLangRef.current, shownMode),
          )
        setLangState(next)
        setAnalysis({ docHash: out.docHash, tree })
        setLoad({ kind: 'ready' })
      } catch {
        finished = true
        if (alive) {
          setAnalysis(null)
          setLoad({ kind: 'failed' })
        }
      }
    })()
    return () => {
      alive = false
      off()
      if (!finished) void a.cancel(jobId).catch(() => false)
    }
  }, [enabled, filePath, password, revision])

  const docHash = analysis?.docHash ?? null

  // the mode switched: that mode's stored languages, and its default while none was picked
  useEffect(() => {
    const a = apiRef.current
    const tree0 = analysis?.tree
    if (!docHash || !a || !tree0 || langsModeRef.current === null) return
    if (langsModeRef.current === mode) return
    let alive = true
    void (async () => {
      const recency = await recencyOf(a, docHash, mode).catch(() => null)
      if (!alive) return
      const langs = recency?.ok ? recency.langs : []
      langsModeRef.current = mode
      setStoredLangs(langs.filter((l) => l.savedAt !== null).map((l) => l.lang))
      if (pickedRef.current === null) {
        setLangState(
          chooseBilingualLanguage(
            langs,
            defaultTargetLanguageForTree(tree0, uiLangRef.current, mode),
          ),
        )
      }
    })()
    return () => {
      alive = false
    }
  }, [docHash, analysis, mode])

  // the stored results of the shown mode in the shown language
  useEffect(() => {
    const a = apiRef.current
    if (!docHash || !lang || !a) {
      setStored(null)
      return
    }
    let alive = true
    void translationOf(a, docHash, lang, mode)
      .then((out) => {
        if (!alive) return
        const translation = out.ok ? out.translation : null
        setStored({ mode, translation })
        // a language first written here (after a refresh) joins the stored ones
        if (translation && translation.blocks.length > 0 && langsModeRef.current === mode) {
          setStoredLangs((prev) => (prev.includes(lang) ? prev : [lang, ...prev]))
        }
      })
      .catch(() => {
        if (alive) setStored(null)
      })
    return () => {
      alive = false
    }
  }, [docHash, lang, mode, storeRev])

  const tree = analysis?.tree ?? null
  // results read for another language or mode (a switch in flight) show as nothing stored
  const shown =
    stored && stored.mode === mode && stored.translation?.lang === lang ? stored.translation : null
  const model = useMemo(() => (tree ? buildBilingualModel(tree, shown) : null), [tree, shown])

  const setLang = useCallback((next: string) => {
    pickedRef.current = next
    setLangState(next)
  }, [])
  const refresh = useCallback(() => setStoreRev((v) => v + 1), [])

  return {
    load,
    docHash: load.kind === 'ready' ? docHash : null,
    tree: load.kind === 'ready' ? tree : null,
    lang: load.kind === 'ready' ? lang : null,
    mode,
    storedLangs,
    setLang,
    model: load.kind === 'ready' ? model : null,
    refresh,
  }
}
