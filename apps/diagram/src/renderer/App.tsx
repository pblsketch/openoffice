/**
 * The diagram editor: draw.io in a frame filling the tab, with the app's own
 * progress screen while it starts, one notice bar for what a file uses that
 * is not drawn as saved, the export dialog, and a slim status line (unsaved
 * mark, AutoSave). Saving, recovery copies, exports and print are the app's;
 * the drawing is draw.io's.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAutoSavePref, useSplitPaneFocusPing } from '@genoffice/ui'
import { createDiagramFile, type DiagramFormat } from '@genoffice/drawio-model'
import type { Lang } from '@genoffice/i18n'
import type { BridgeEvent, DrawioMenuAction, EmbedEvent } from '../shared/bridge-protocol'
import { drawioStartUrl } from '../shared/drawio-start'
import { isHelpKey } from '../bridge/shortcuts'
import { diagramBaseName, exportKindOf } from '../shared/formats'
import type {
  DiagramImportKind,
  DiagramMenuCommand,
  ExportFormat,
  ExportScope,
  PrintPage,
  SaveRequestMode,
  UiTheme,
} from '../shared/ipc'
import { hasNotices, scanDiagramNotices, type DiagramNotices } from '../shared/notices'
import { OPEN_FAILURE_KEYS } from '../shared/open-failure'
import { DrawioFrame } from './drawio/frame-client'
import { diagramImporter } from './document/importers'
import { settleOpenFailure } from './document/open-failure'
import { applyLiveOps, liveDiagramRead, liveDiagramText } from './document/live-ops'
import { DiagramCopier, RECOVERY_COPY_TIMING } from './document/recovery-copies'
import { pagePictureBytes } from './document/page-pictures'
import { t as translate, useI18n, type StringKey } from './i18n/locale'
import { useDarkView } from './theme'
import { DiagramAiDock, useDiagramAi } from './ai/AiDock'

const AUTO_SAVE_INTERVAL_MS = 30_000
const TOAST_MS = 4_000

type Status = 'loading' | 'ready' | 'failed'
type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

/** What the frame loads when draw.io says it is ready. */
type Pending =
  | { kind: 'xml'; xml: string; dirty: boolean }
  | { kind: 'import'; importer: DiagramImportKind; bytes: Uint8Array; title: string }

const MENU_ACTIONS: Record<DiagramMenuCommand, DrawioMenuAction> = {
  undo: 'undo',
  redo: 'redo',
  'zoom-in': 'zoomIn',
  'zoom-out': 'zoomOut',
  'zoom-reset': 'resetView',
  'zoom-fit': 'fitWindow',
  find: 'findReplace',
}

export default function App({ initialTheme }: { initialTheme: UiTheme }) {
  const { lang, t } = useI18n()
  const dark = useDarkView(initialTheme)
  const [status, setStatus] = useState<Status>('loading')
  const [failure, setFailure] = useState<string | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [notices, setNotices] = useState<DiagramNotices | null>(null)
  const [exportFormat, setExportFormat] = useState<ExportFormat | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [frameLang, setFrameLang] = useState<Lang>(lang)
  const [frameKey, setFrameKey] = useState(0)
  const [autoSave, setAutoSave] = useAutoSavePref('diagramapp.autoSave', window.diagramApi)

  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const clientRef = useRef<DrawioFrame | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  /** opened (or not) before draw.io asked: `init` waits for this */
  const openedRef = useRef<Promise<void> | null>(null)
  const statusRef = useRef<Status>('loading')
  statusRef.current = status
  const pathRef = useRef<string | null>(null)
  pathRef.current = path
  const titleRef = useRef<string | null>(null)
  titleRef.current = title
  const formatRef = useRef<DiagramFormat>('drawio')
  const compressedRef = useRef(false)
  const dirtyRef = useRef(false)
  const revisionRef = useRef(0)
  const savingRef = useRef(false)
  const extraNoticesRef = useRef<Partial<DiagramNotices>>({})
  const darkRef = useRef(dark)
  darkRef.current = dark
  const copierRef = useRef<DiagramCopier | null>(null)

  useSplitPaneFocusPing()

  // the AI panel reads and changes the diagram through the frame, once draw.io is up
  const ai = useDiagramAi({
    client: () => clientRef.current,
    ready: () => statusRef.current === 'ready',
  })

  const say = useCallback((text: string) => setToast(text), [])
  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  const fail = useCallback((key: StringKey, params?: Record<string, string | number>) => {
    setFailure(translate(key, params))
    setStatus('failed')
  }, [])

  /**
   * The file did not open (spec 3.1, 3.5): the shell closes the tab and shows
   * why; the reason stays in the tab only when the shell does not.
   */
  const failOpen = useCallback((key: StringKey, params?: Record<string, string | number>) => {
    pendingRef.current = null
    return settleOpenFailure(
      translate(key, params),
      (message) => window.diagramApi.openFailed(message),
      (message) => {
        setFailure(message)
        setStatus('failed')
      },
    )
  }, [])

  // ---- opening: what the frame loads once draw.io is up ----

  useEffect(() => {
    openedRef.current = (async () => {
      const api = window.diagramApi
      const pending = await api.consumePending()
      if (pending) {
        const file = await api.openFile(pending)
        if (file.status === 'import') {
          setTitle(file.title)
          pendingRef.current = {
            kind: 'import',
            importer: file.importer,
            bytes: file.bytes,
            title: file.title,
          }
          return
        }
        if (file.status !== 'ok') {
          await failOpen(OPEN_FAILURE_KEYS[file.status])
          return
        }
        formatRef.current = file.format
        compressedRef.current = file.compressed
        if (file.restored !== 'untitled') setPath(pending)
        pendingRef.current = { kind: 'xml', xml: file.xml, dirty: file.restored !== undefined }
        return
      }
      // a new diagram: given content (a converter's result, a recovery copy) or an empty page
      const seed = await api.takeSeed().catch(() => null)
      formatRef.current = 'drawio'
      compressedRef.current = false
      pendingRef.current = seed
        ? { kind: 'xml', xml: seed.xml, dirty: true }
        : { kind: 'xml', xml: createDiagramFile().xml, dirty: false }
    })().catch((err: unknown) => {
      console.error('[diagram] open failed:', err)
      fail('failEditor')
    })
  }, [fail, failOpen])

  /** draw.io is ready: give it the diagram. */
  const loadIntoFrame = useCallback(async () => {
    const client = clientRef.current
    await openedRef.current
    const pending = pendingRef.current
    if (!client || !pending || statusRef.current === 'failed') return
    let xml: string
    if (pending.kind === 'import') {
      const importer = diagramImporter(pending.importer)
      if (!importer) {
        await failOpen(OPEN_FAILURE_KEYS.unsupported)
        return
      }
      const result = await importer({ bytes: pending.bytes, title: pending.title, frame: client })
      if (!result.ok) {
        await failOpen('failImport', { reason: result.reason })
        return
      }
      extraNoticesRef.current = result.notices ?? {}
      xml = result.xml
      // from now on it is a diagram like any new one
      pendingRef.current = { kind: 'xml', xml, dirty: false }
    } else {
      xml = pending.xml
    }
    client.sendEmbed({ action: 'load', xml, autosave: 0, dark: darkRef.current })
  }, [failOpen])

  /** draw.io loaded the diagram: set what is saved, read what the notice tells. */
  const afterLoad = useCallback(
    async (_event: EmbedEvent) => {
      const client = clientRef.current
      const pending = pendingRef.current
      if (!client || !pending || pending.kind !== 'xml') return
      try {
        await client.request(pending.dirty ? 'markUnsaved' : 'markSaved', {})
        if (statusRef.current === 'loading') {
          const read = await client.request('readPages', {})
          const found = {
            ...scanDiagramNotices(read.pages.map((page) => page.xml)),
            ...extraNoticesRef.current,
          }
          if (hasNotices(found)) setNotices(found)
        }
        setStatus('ready')
      } catch (err) {
        console.error('[diagram] the editor did not take the diagram:', err)
        fail('failEditor')
      }
    },
    [fail],
  )

  // ---- saving ----

  const markDirty = useCallback((next: boolean) => {
    dirtyRef.current = next
    setDirty(next)
  }, [])

  useEffect(() => {
    if (status === 'ready') window.diagramApi.setDirty(dirty)
  }, [dirty, status])

  useEffect(() => {
    if (dirty && saveState === 'saved') setSaveState('idle')
  }, [dirty, saveState])

  const doSave = useCallback(async (mode: SaveRequestMode, auto = false): Promise<boolean> => {
    const client = clientRef.current
    if (statusRef.current !== 'ready' || !client) return false
    while (savingRef.current) await new Promise((resolve) => setTimeout(resolve, 50))
    // nothing changed and the diagram has its file: nothing is written (spec 3.2)
    if (mode === 'save' && pathRef.current && !dirtyRef.current) return true
    savingRef.current = true
    copierRef.current?.noteSave()
    setSaveState('saving')
    try {
      const target = await window.diagramApi.saveTarget({
        mode,
        defaultName: pathRef.current ? undefined : (titleRef.current ?? undefined),
      })
      if (!target.ok) {
        console.error('[diagram] save failed:', target.error)
        setSaveState('failed')
        return false
      }
      if ('canceled' in target) {
        setSaveState('idle')
        return false
      }
      const revision = revisionRef.current
      const bytes = await client.serialize(exportKindOf(target.format), compressedRef.current)
      const result = await window.diagramApi.save({ token: target.token, bytes, auto })
      if (result.ok && 'path' in result) {
        await client.request('markSaved', { revision })
        formatRef.current = target.format
        setPath(result.path)
        setTitle(null)
        setSaveState(dirtyRef.current ? 'idle' : 'saved')
        return true
      }
      const deferred = !result.ok && result.error === 'external-modified'
      setSaveState(result.ok || deferred ? 'idle' : 'failed')
      if (!result.ok && !deferred) console.error('[diagram] save failed:', result.error)
      return false
    } catch (err) {
      console.error('[diagram] save failed:', err)
      setSaveState('failed')
      return false
    } finally {
      savingRef.current = false
    }
  }, [])

  // AutoSave: every 30 s and when the window loses focus; an untitled diagram waits for its first save
  useEffect(() => {
    if (!autoSave || !path) return
    const tick = (): void => {
      if (savingRef.current || !dirtyRef.current) return
      void doSave('save', true)
    }
    const id = window.setInterval(tick, AUTO_SAVE_INTERVAL_MS)
    window.addEventListener('blur', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('blur', tick)
    }
  }, [autoSave, path, doSave])

  // crash-recovery copies while the diagram has unsaved changes
  useEffect(() => {
    if (status !== 'ready') return
    const copier = new DiagramCopier({
      dirty: () => dirtyRef.current,
      revision: () => revisionRef.current,
      saving: () => savingRef.current,
      bytes: async () => {
        const client = clientRef.current
        if (!client) throw new Error('no editor')
        return client.serialize(exportKindOf(formatRef.current), compressedRef.current)
      },
      write: (bytes) =>
        window.diagramApi.writeRecoveryCopy({ bytes, name: titleRef.current ?? undefined }),
    })
    copierRef.current = copier
    const id = window.setInterval(() => void copier.tick(), RECOVERY_COPY_TIMING.intervalMs)
    const offNow = window.diagramApi.onRecoveryCopyNow(() => {
      void copier.writeNow().finally(() => window.diagramApi.sendRecoveryCopyNowDone())
    })
    const offReset = window.diagramApi.onRecoveryReset(() => copier.reset())
    return () => {
      window.clearInterval(id)
      offNow()
      offReset()
      copierRef.current = null
    }
  }, [status])

  // ---- export and print: the app's own, never draw.io's dialogs ----

  const pagesFor = useCallback(async (scope: ExportScope) => {
    const client = clientRef.current
    if (!client) throw new Error('no editor')
    const info = await client.request('pageInfo', {})
    const all = info.pages.map((page, index) => ({ ...page, number: index + 1 }))
    const chosen = scope === 'all' ? all : all.filter((page) => page.id === info.currentPage)
    return { client, chosen }
  }, [])

  const suggestedName = (): string =>
    diagramBaseName(pathRef.current) || titleRef.current || translate('untitled')

  const printPages = useCallback(
    async (scope: ExportScope): Promise<PrintPage[]> => {
      const { client, chosen } = await pagesFor(scope)
      const pages: PrintPage[] = []
      for (const page of chosen) {
        const svg = await client.request('pageSvg', { pageId: page.id, theme: 'light' })
        pages.push({
          svg: svg.svg,
          width: svg.width,
          height: svg.height,
          pageWidth: page.pageWidth,
          pageHeight: page.pageHeight,
        })
      }
      return pages
    },
    [pagesFor],
  )

  const runExport = useCallback(
    async (format: ExportFormat, scope: ExportScope) => {
      try {
        if (format === 'pdf') {
          const result = await window.diagramApi.exportPdf({
            pages: await printPages(scope),
            suggestedName: suggestedName(),
          })
          if (!result.ok) say(translate('exportFailed', { error: result.error }))
          return
        }
        const { client, chosen } = await pagesFor(scope)
        const pages: { number: number; bytes: Uint8Array }[] = []
        for (const page of chosen) {
          pages.push({
            number: page.number,
            bytes: await pagePictureBytes(client, format, page.id),
          })
        }
        const result = await window.diagramApi.exportImages({
          format,
          pages,
          scope,
          suggestedName: suggestedName(),
        })
        if (!result.ok) say(translate('exportFailed', { error: result.error }))
      } catch (err) {
        say(translate('exportFailed', { error: err instanceof Error ? err.message : String(err) }))
      }
    },
    [pagesFor, printPages, say],
  )

  const runPrint = useCallback(async () => {
    if (statusRef.current !== 'ready') return
    try {
      const result = await window.diagramApi.print({
        pages: await printPages('all'),
        title: suggestedName(),
      })
      if (!result.ok) say(translate('printFailed', { error: result.error }))
    } catch (err) {
      say(translate('printFailed', { error: err instanceof Error ? err.message : String(err) }))
    }
  }, [printPages, say])

  const askExport = useCallback((format: ExportFormat) => {
    if (statusRef.current === 'ready') setExportFormat(format)
  }, [])

  // ---- the frame ----

  const onBridgeEvent = useCallback(
    (event: BridgeEvent) => {
      switch (event.name) {
        case 'dirty':
          markDirty(event.dirty)
          return
        case 'changed':
          revisionRef.current = event.revision
          return
        case 'shortcut':
          if (event.key === 'print') void runPrint()
          else void doSave(event.key)
          return
        case 'command':
          switch (event.command) {
            case 'help':
              window.diagramApi.openHelp()
              return
            case 'print':
              void runPrint()
              return
            case 'save':
              void doSave('save')
              return
            case 'exportPdf':
              askExport('pdf')
              return
            case 'exportPng':
              askExport('png')
              return
            case 'exportSvg':
              askExport('svg')
              return
          }
          return
        case 'openLink':
          void window.diagramApi
            .openLink(event.url)
            .then((opened) => {
              if (!opened) say(translate('linkNotOpened'))
            })
            .catch(() => say(translate('linkNotOpened')))
          return
        default:
          return
      }
    },
    [askExport, doSave, markDirty, runPrint, say],
  )

  const handlersRef = useRef({ loadIntoFrame, afterLoad, doSave, onBridgeEvent })
  handlersRef.current = { loadIntoFrame, afterLoad, doSave, onBridgeEvent }

  useEffect(() => {
    const client = new DrawioFrame({
      onInit: () => void handlersRef.current.loadIntoFrame(),
      onLoad: (event) => void handlersRef.current.afterLoad(event),
      onSave: () => void handlersRef.current.doSave('save'),
      onBridgeEvent: (event) => handlersRef.current.onBridgeEvent(event),
    })
    clientRef.current = client
    return () => {
      client.dispose()
      clientRef.current = null
    }
  }, [])

  // the app's theme, live: draw.io's dark view on or off
  useEffect(() => {
    if (status !== 'ready') return
    void clientRef.current?.request('setDark', { dark }).catch(() => {})
  }, [dark, status])

  // the app's language: draw.io starts again in it with the content as it is (undo history is lost)
  useEffect(() => {
    if (lang === frameLang) return
    const client = clientRef.current
    if (statusRef.current !== 'ready' || !client) {
      setFrameLang(lang)
      setFrameKey((key) => key + 1)
      return
    }
    void (async () => {
      try {
        const bytes = await client.serialize('xml', compressedRef.current)
        pendingRef.current = {
          kind: 'xml',
          xml: new TextDecoder().decode(bytes),
          dirty: dirtyRef.current,
        }
      } catch (err) {
        console.warn('[diagram] the diagram could not be kept for the language change:', err)
        return
      }
      client.failAll(new Error('the editor restarts'))
      setStatus('loading')
      setFrameLang(lang)
      setFrameKey((key) => key + 1)
    })()
  }, [lang, frameLang])

  // the start address changes only when draw.io starts again (a new language), not with the theme
  const frameSrc = useMemo(
    () => drawioStartUrl({ lang: frameLang, dark: darkRef.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frameLang, frameKey],
  )

  const onFrameLoad = useCallback(() => {
    clientRef.current?.attach(frameRef.current?.contentWindow ?? null)
  }, [])

  // ---- the shell's menu, save requests and questions ----

  useEffect(() => {
    const api = window.diagramApi
    const offSave = api.onSaveRequest((mode) => {
      if (statusRef.current !== 'ready') {
        api.sendSaveRequestAck(false)
        return
      }
      if (mode === 'retarget') markDirty(true)
      void doSave(mode === 'retarget' ? 'save' : mode).then((saved) => {
        if (!saved) api.sendSaveRequestAck(false)
      })
    })
    const offClose = api.onCloseSaveRequest(() => {
      void (async () => {
        while (savingRef.current) await new Promise((resolve) => setTimeout(resolve, 50))
        if (!dirtyRef.current && pathRef.current) {
          api.sendCloseSaveResult(true)
          return
        }
        api.sendCloseSaveResult(await doSave('save'))
      })()
    })
    const offRenamed = api.onFileRenamed((next) => setPath(next))
    const offMenu = api.onMenuCommand((command) => {
      const action = MENU_ACTIONS[command]
      if (statusRef.current === 'ready' && action) {
        void clientRef.current?.request('runAction', { action }).catch(() => {})
      }
    })
    const offExport = api.onExportRequest((format) => askExport(format))
    const offPrint = api.onPrintRequest(() => void runPrint())
    // questions from the in-app MCP server; silence while loading keeps the asker retrying
    const offRead = api.onReadRequest((query) => {
      const client = clientRef.current
      if (statusRef.current === 'loading') return
      if (!client || statusRef.current !== 'ready') {
        api.sendReadResult({
          id: query.id,
          error: 'the file did not open, so there is no diagram to read',
        })
        return
      }
      // one page when the asker names one (or the page on screen), every page otherwise
      const named = typeof query.page === 'string' && query.page !== ''
      const read =
        named || query.current === true
          ? liveDiagramRead(client, named ? query.page : undefined).then((page) => {
              if (!page.ok) throw new Error(page.error)
              return { text: page.text, read: page.read }
            })
          : liveDiagramText(client).then((text) => ({ text }))
      read
        .then((answer) => api.sendReadResult({ id: query.id, ...answer }))
        .catch((err: unknown) =>
          api.sendReadResult({
            id: query.id,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
    })
    const offApply = api.onApplyRequest((query) => {
      const client = clientRef.current
      if (statusRef.current === 'loading') return
      if (!client || statusRef.current !== 'ready') {
        api.sendApplyResult({ id: query.id, ok: false, error: 'the file did not open' })
        return
      }
      applyLiveOps(client, Array.isArray(query.ops) ? query.ops : [])
        .then((result) => api.sendApplyResult({ id: query.id, ok: true, result }))
        .catch((err: unknown) =>
          api.sendApplyResult({
            id: query.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
    })
    const offBytes = api.onBytesRequest(() => {
      const client = clientRef.current
      if (statusRef.current === 'loading') return
      if (!client || statusRef.current !== 'ready') {
        api.sendBytesResult({ error: 'the file did not open, so there is no diagram to read' })
        return
      }
      client
        .serialize(exportKindOf(formatRef.current), compressedRef.current)
        .then((bytes) => api.sendBytesResult({ bytes }))
        .catch((err: unknown) =>
          api.sendBytesResult({ error: err instanceof Error ? err.message : String(err) }),
        )
    })
    return () => {
      offSave()
      offClose()
      offRenamed()
      offMenu()
      offExport()
      offPrint()
      offRead()
      offApply()
      offBytes()
    }
  }, [askExport, doSave, markDirty, runPrint])

  // Ctrl+S, Ctrl+Shift+S, Ctrl+P and F1 (help) while the app's own parts have
  // the keyboard (inside draw.io the bridge sends them)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isHelpKey(event)) {
        event.preventDefault()
        window.diagramApi.openHelp()
        return
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        void doSave(event.shiftKey ? 'saveAs' : 'save')
      } else if (key === 'p' && !event.shiftKey) {
        event.preventDefault()
        void runPrint()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [doSave, runPrint])

  // ---- the screen ----

  if (status === 'failed') {
    return (
      <div className="dg-app">
        <div className="dg-center" role="alert">
          {failure ?? t('failEditor')}
        </div>
      </div>
    )
  }

  const statusText =
    saveState === 'saving'
      ? t('statusSaving')
      : saveState === 'failed'
        ? t('statusSaveFailed')
        : dirty
          ? t('statusUnsaved')
          : saveState === 'saved'
            ? t('statusSaved')
            : ''

  return (
    <div className="dg-app">
      {notices && <NoticeBar notices={notices} onClose={() => setNotices(null)} />}
      <div className="dg-body">
        <div className="dg-stage">
          <iframe
            key={frameKey}
            ref={frameRef}
            className="dg-frame"
            title={t('appName')}
            src={frameSrc}
            onLoad={onFrameLoad}
          />
          {status === 'loading' && (
            <div className="dg-progress" role="status">
              <div className="dg-spinner" aria-hidden="true" />
              <div>{t('loading')}</div>
            </div>
          )}
        </div>
        <DiagramAiDock ai={ai} filePath={path} />
      </div>
      <div className="dg-foot">
        <span className="dg-status" aria-live="polite">
          {toast ?? statusText}
        </span>
        <label className="dg-autosave">
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(event) => setAutoSave(event.target.checked)}
          />
          {t('autoSave')}
        </label>
      </div>
      {exportFormat && (
        <ExportDialog
          format={exportFormat}
          onCancel={() => setExportFormat(null)}
          onExport={(scope) => {
            const format = exportFormat
            setExportFormat(null)
            void runExport(format, scope)
          }}
        />
      )}
    </div>
  )
}

function NoticeBar({ notices, onClose }: { notices: DiagramNotices; onClose: () => void }) {
  const { t } = useI18n()
  const lines: string[] = []
  if (notices.remotePictures > 0)
    lines.push(t('noticeRemotePictures', { count: notices.remotePictures }))
  if (notices.remoteFonts > 0) lines.push(t('noticeRemoteFonts', { count: notices.remoteFonts }))
  if (notices.plantUml > 0) lines.push(t('noticePlantUml', { count: notices.plantUml }))
  if (notices.libavoid > 0) lines.push(t('noticeLibavoid', { count: notices.libavoid }))
  if (notices.elk > 0) lines.push(t('noticeElk', { count: notices.elk }))
  if ((notices.visioPictures ?? 0) > 0) {
    lines.push(t('noticeVisioPictures', { count: notices.visioPictures ?? 0 }))
  }
  return (
    <div className="dg-notice" role="status">
      <ul>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <button type="button" className="dg-notice-close" onClick={onClose}>
        {t('noticeClose')}
      </button>
    </div>
  )
}

const EXPORT_TITLE: Record<ExportFormat, StringKey> = {
  png: 'exportTitlePng',
  svg: 'exportTitleSvg',
  pdf: 'exportTitlePdf',
}

function ExportDialog({
  format,
  onCancel,
  onExport,
}: {
  format: ExportFormat
  onCancel: () => void
  onExport: (scope: ExportScope) => void
}) {
  const { t } = useI18n()
  const [scope, setScope] = useState<ExportScope>('all')
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
  return (
    <div className="dg-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="dg-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dg-export-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="dg-export-title">{t(EXPORT_TITLE[format])}</h2>
        <label className="dg-choice">
          <input
            type="radio"
            name="dg-scope"
            checked={scope === 'all'}
            onChange={() => setScope('all')}
          />
          {t('exportAllPages')}
        </label>
        <label className="dg-choice">
          <input
            type="radio"
            name="dg-scope"
            checked={scope === 'current'}
            onChange={() => setScope('current')}
          />
          {t('exportCurrentPage')}
        </label>
        <div className="dg-buttons">
          <button type="button" onClick={onCancel}>
            {t('btnCancel')}
          </button>
          <button type="button" className="dg-primary" onClick={() => onExport(scope)} autoFocus>
            {t('btnExport')}
          </button>
        </div>
      </div>
    </div>
  )
}
