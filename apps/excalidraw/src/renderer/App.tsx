/**
 * The drawing editor: one drawing per view, edited on the Excalidraw canvas.
 *
 * The file is the engine's (`@genoffice/excalidraw-engine`): it is opened
 * here from the bytes the main process read, and every save asks it for the
 * bytes to write. The canvas only shows and edits the scene.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Excalidraw, hashElementsVersion } from '@excalidraw/excalidraw'
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { createDrawing, openDrawing } from '@genoffice/excalidraw-engine'
import type { DrawingElement, DrawingOpenStatus } from '@genoffice/excalidraw-engine'
import { useAutoSavePref, useSplitPaneFocusPing } from '@genoffice/ui'
import { DrawingSession } from './document/session'
import { useI18n } from './i18n/locale'
import type { StringKey } from './i18n/locale'
import { excalidrawLangCode } from './lang'
import { missingPictureCount, pictureRefsToRead } from './pictures'
import { useCanvasTheme } from './theme'
import type { DrawingMenuCommand, SaveMode } from '../shared/ipc'

const AUTO_SAVE_INTERVAL_MS = 30_000
const TOAST_MS = 5_000

type LoadStatus = 'loading' | 'ready' | 'failed'

interface Toast {
  key: StringKey
  count?: number
}

const FAILURE_TEXT: Record<Exclude<DrawingOpenStatus, 'ok'> | 'error', StringKey> = {
  'not-a-drawing': 'openFailedNotDrawing',
  unreadable: 'openFailedUnreadable',
  'too-large': 'openFailedTooLarge',
  error: 'openFailedError',
}

/** The canvas's elements as the engine sees them: plain records with an id and a type. */
function asDrawingElements(elements: readonly OrderedExcalidrawElement[]): DrawingElement[] {
  return elements as unknown as DrawingElement[]
}

function fingerprint(elements: readonly DrawingElement[]): number {
  return hashElementsVersion(elements as unknown as OrderedExcalidrawElement[])
}

/** A key event the canvas reads as its own shortcut (undo, redo). */
function sendCanvasKey(key: string, shift: boolean): void {
  const target = document.querySelector('.excalidraw') ?? document
  const mac = navigator.platform.toLowerCase().includes('mac')
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      code: `Key${key.toUpperCase()}`,
      ctrlKey: !mac,
      metaKey: mac,
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    }),
  )
}

export default function App() {
  const { lang, t } = useI18n()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [failure, setFailure] = useState<StringKey>('openFailedError')
  const [session, setSession] = useState<DrawingSession | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const [autoSave, setAutoSave] = useAutoSavePref('excalidrawapp.autoSave', window.excalidrawApi)
  const theme = useCanvasTheme()

  const sessionRef = useRef<DrawingSession | null>(null)
  const statusRef = useRef<LoadStatus>('loading')
  const canvasRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const savingRef = useRef(false)
  statusRef.current = status

  // the shell's split panes: tell it whenever this pane gains focus
  useSplitPaneFocusPing()

  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  // ---- opening ----

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const pending = await window.excalidrawApi.consumePending()
        let opened: DrawingSession
        if (pending) {
          const file = await window.excalidrawApi.openFile(pending.path)
          const result = file.status === 'ok' ? openDrawing(file.bytes, file.format) : file
          if (cancelled) return
          if (result.status !== 'ok') {
            setFailure(FAILURE_TEXT[result.status])
            setStatus('failed')
            return
          }
          opened = new DrawingSession(result.document, fingerprint)
        } else {
          // a new drawing is an Obsidian note: it opens in Obsidian and here alike
          opened = new DrawingSession(createDrawing('markdown'), fingerprint)
        }
        sessionRef.current = opened
        setSession(opened)
        setPath(pending?.path ?? null)
        setStatus('ready')
      } catch (err) {
        console.error('[excalidraw] open failed:', err)
        if (!cancelled) setStatus('failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // the unsaved mark follows the session; the main process mirrors it for the close prompt
  useEffect(() => {
    if (!session) return
    const sync = (): void => setDirty(session.dirty)
    sync()
    return session.subscribe(sync)
  }, [session])

  useEffect(() => {
    if (status === 'ready') window.excalidrawApi.setDirty(dirty)
  }, [dirty, status])

  const initialData = useMemo<ExcalidrawInitialDataState | null>(() => {
    if (!session) return null
    const scene = session.initialScene()
    return {
      elements: scene.elements as unknown as ExcalidrawInitialDataState['elements'],
      appState: scene.appState as ExcalidrawInitialDataState['appState'],
      // a note's pictures live in its vault and arrive after the canvas is up
      files: session.format === 'json' ? (scene.files as unknown as BinaryFiles) : undefined,
      scrollToContent: true,
    }
  }, [session])

  // a note's pictures: read from its vault folder once the canvas exists
  const loadPictures = useCallback(async (canvas: ExcalidrawImperativeAPI) => {
    const current = sessionRef.current
    if (!current || current.format !== 'markdown') return
    const refs = pictureRefsToRead(current.document.embeddedFiles())
    if (refs.length === 0) return
    const pictures = await window.excalidrawApi.readEmbedded({ refs }).catch(() => [])
    const created = Date.now()
    canvas.addFiles(
      pictures.map((picture): BinaryFileData => ({
        id: picture.fileId as BinaryFileData['id'],
        mimeType: picture.mimeType as BinaryFileData['mimeType'],
        dataURL: picture.dataURL as BinaryFileData['dataURL'],
        created,
      })),
    )
    const missing = missingPictureCount(
      current.initialScene().elements,
      pictures.map((picture) => picture.fileId),
    )
    if (missing > 0) setToast({ key: 'picturesMissing', count: missing })
  }, [])

  const onCanvas = useCallback(
    (canvas: ExcalidrawImperativeAPI) => {
      canvasRef.current = canvas
      void loadPictures(canvas)
    },
    [loadPictures],
  )

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      sessionRef.current?.update({
        elements: asDrawingElements(elements),
        appState: appState as unknown as Record<string, unknown>,
        files: files as unknown as Record<string, unknown>,
      })
    },
    [],
  )

  // ---- saving ----

  const doSave = useCallback(async (mode: SaveMode, auto = false): Promise<boolean> => {
    const current = sessionRef.current
    if (statusRef.current !== 'ready' || !current) return false
    // a menu save during an autosave queues behind it instead of being dropped
    while (savingRef.current) await new Promise((resolve) => setTimeout(resolve, 50))
    savingRef.current = true
    try {
      const at = current.currentFingerprint()
      const bytes = current.produceBytes()
      const result = await window.excalidrawApi.save({
        bytes,
        format: current.format,
        mode,
        auto,
      })
      if (result.ok && 'path' in result) {
        if (at !== null) current.markWritten(at)
        setPath(result.path)
        return true
      }
      // a sibling copy holding the disk version is not a failure (decision 0036)
      const deferred = !result.ok && result.error === 'external-modified'
      if (!result.ok && !deferred) {
        console.error('[excalidraw] save failed:', result.error)
        setToast({ key: 'saveFailed' })
      }
      return false
    } catch (err) {
      console.error('[excalidraw] save failed:', err)
      setToast({ key: 'saveFailed' })
      return false
    } finally {
      savingRef.current = false
    }
  }, [])

  // autosave: every 30s and on window blur; an untitled drawing waits for an explicit first save
  useEffect(() => {
    if (!autoSave || !path) return
    const tick = (): void => {
      if (savingRef.current || !sessionRef.current?.dirty) return
      // text being typed on the canvas goes in when its editor closes; the next tick takes it
      if (canvasRef.current?.getAppState().editingTextElement) return
      void doSave('save', true)
    }
    const id = window.setInterval(tick, AUTO_SAVE_INTERVAL_MS)
    window.addEventListener('blur', tick)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('blur', tick)
    }
  }, [autoSave, path, doSave])

  // ---- commands from the shell menu ----

  const runCommand = useCallback((command: DrawingMenuCommand) => {
    const canvas = canvasRef.current
    if (!canvas) return
    switch (command) {
      case 'undo':
        sendCanvasKey('z', false)
        break
      case 'redo':
        sendCanvasKey('z', true)
        break
      case 'zoom-in':
      case 'zoom-out': {
        const { zoom } = canvas.getAppState()
        const next = command === 'zoom-in' ? zoom.value * 1.1 : zoom.value / 1.1
        canvas.updateScene({
          appState: { zoom: { value: Math.min(30, Math.max(0.1, next)) as typeof zoom.value } },
        })
        break
      }
      case 'zoom-reset':
        canvas.updateScene({ appState: { zoom: { value: 1 as AppState['zoom']['value'] } } })
        break
      case 'zoom-fit':
        canvas.scrollToContent(undefined, { fitToContent: true })
        break
    }
  }, [])

  useEffect(() => {
    const api = window.excalidrawApi
    const offSave = api.onSaveRequest((mode) => {
      if (statusRef.current !== 'ready') {
        api.sendSaveRequestAck(false)
        return
      }
      void doSave(mode).then((saved) => {
        // a save that failed before it reached the main process still has someone waiting
        if (!saved) api.sendSaveRequestAck(false)
      })
    })
    const offClose = api.onCloseSaveRequest(() => {
      void (async () => {
        while (savingRef.current) await new Promise((resolve) => setTimeout(resolve, 50))
        if (!sessionRef.current?.dirty) {
          api.sendCloseSaveResult(true)
          return
        }
        api.sendCloseSaveResult(await doSave('save'))
      })()
    })
    const offRenamed = api.onFileRenamed((next) => setPath(next))
    const offMenu = api.onMenuCommand(runCommand)
    return () => {
      offSave()
      offClose()
      offRenamed()
      offMenu()
    }
  }, [doSave, runCommand])

  // Ctrl+S / Ctrl+Shift+S; captured so it works while text is being typed on the canvas
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      if (event.key.toLowerCase() !== 's') return
      event.preventDefault()
      event.stopPropagation()
      void doSave(event.shiftKey ? 'saveAs' : 'save')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [doSave])

  // The canvas would load a file dropped on it, a drawing in a dropped picture
  // over the open one. Documents were already taken by the preload (they open
  // as tabs); every other file drop stops here.
  useEffect(() => {
    const onDrop = (event: DragEvent): void => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.stopPropagation()
      if (sessionRef.current?.format === 'markdown') setToast({ key: 'picturesNotInNote' })
    }
    window.addEventListener('drop', onDrop, true)
    return () => window.removeEventListener('drop', onDrop, true)
  }, [])

  // ---- links: only the main process opens them, after checking the address ----

  const onLinkOpen = useCallback(
    (element: { link: string | null }, event: CustomEvent<{ nativeEvent: unknown }>) => {
      event.preventDefault()
      if (!element.link) return
      void window.excalidrawApi
        .openLink(element.link)
        .then((opened) => {
          if (!opened) setToast({ key: 'linkNotOpened' })
        })
        .catch(() => setToast({ key: 'linkNotOpened' }))
    },
    [],
  )

  const renderTopRightUI = useCallback(
    () => (
      <label className="xd-autosave" title={t('autoSave')}>
        <input
          type="checkbox"
          checked={autoSave}
          onChange={(event) => setAutoSave(event.target.checked)}
        />
        <span>{t('autoSave')}</span>
        {dirty ? <span className="xd-dirty" aria-hidden="true" /> : null}
      </label>
    ),
    // `t` changes every render; the language is the dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [autoSave, dirty, lang, setAutoSave],
  )

  if (status === 'loading') return <div className="xd-status">{t('loading')}</div>
  if (status === 'failed' || !session || !initialData) {
    return (
      <div className="xd-status" role="alert">
        <strong>{t('openFailedTitle')}</strong>
        <span>{t(failure)}</span>
      </div>
    )
  }

  return (
    <div className="xd-root">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={onCanvas}
        onChange={onChange}
        onLinkOpen={onLinkOpen}
        langCode={excalidrawLangCode(lang)}
        theme={theme}
        name={path ?? undefined}
        renderTopRightUI={renderTopRightUI}
        // Nothing here reaches the network: no shared libraries, no live
        // collaboration, no AI, and web embeds are never loaded.
        validateEmbeddable={false}
        aiEnabled={false}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
            saveAsImage: false,
            toggleTheme: null,
          },
          // a note points at pictures in its vault; one added here would live only in this file
          tools: { image: session.format === 'json' },
        }}
      />
      {toast ? (
        <div className="xd-toast" role="status">
          {t(toast.key, toast.count === undefined ? undefined : { count: toast.count })}
        </div>
      ) : null}
    </div>
  )
}
