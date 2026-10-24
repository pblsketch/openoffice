/**
 * The mind map editor: toolbar on top, the map in a card with the theme panel
 * beside it, sheet tabs and the zoom ratio below.
 *
 * The map lives in a `DocumentSession` (the engine's document and the history
 * of every sheet). Each sheet that has been shown has its own `MapController`
 * with its own instance of the drawing library, so the undo history of one
 * sheet never reaches another. Everything that changes the map goes through a
 * controller's edit functions; this component only wires the screen to them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  templateDocumentOf,
  presentationKeyOf,
  useAutoSavePref,
  useSplitPaneFocusPing,
  type TemplateDocument,
} from '@genoffice/ui'
import type { ThemeId, ViewLayout } from '@genoffice/xmind-engine'
import { t as translate, useI18n } from './i18n/locale'
import { mapStrings } from './i18n/map-strings'
import type { StringKey } from './i18n/locale'
import { linkFromInput, linkInputKind } from './document/link-input'
import { newMap, type OpenFailure, type OpenNotices, openMapBytes } from './document/open'
import { openCopiedMap, seededMap } from './document/open'
import { useRecoveryCopies } from './document/recovery-copies'
import type { DocumentSession, SheetTab } from './document/session'
import { deleteSheetAfterConfirm } from './document/sheet-actions'
import { thumbnailForSave } from './document/thumbnail'
import { useMapExport } from './export/use-map-export'
import { MapController, type MapHost, type TopicRequest } from './map/controller'
import { Toolbar } from './components/Toolbar'
import { SheetTabs } from './components/SheetTabs'
import { ThemePanel } from './components/ThemePanel'
import { NotePanel, type NotePanelHandle } from './components/NotePanel'
import { MindmapAiDock, useMindmapAi } from './ai/AiDock'
import { useMapHandoff } from './ai/use-handoff'
import {
  ConfirmDialog,
  type ConfirmRequest,
  Notice,
  TopicFieldDialog,
  type TopicFieldRequest,
} from './components/dialogs'
import type { MindmapMenuCommand, SaveMode } from '../shared/ipc'

type LoadStatus = 'loading' | 'ready' | 'failed' | 'error'
type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

/** What the screen says for a file that did not open. Such a file has no map and is never written. */
const OPEN_FAILURE_TEXT: Readonly<Record<OpenFailure, StringKey>> = {
  'legacy-format': 'openLegacy',
  encrypted: 'openEncrypted',
  unreadable: 'openUnreadable',
  rejected: 'openRejected',
}

const AUTO_SAVE_INTERVAL_MS = 30_000
/** Labels are typed in one field, separated by a comma: the plain one, the full-width one or the ideographic one. */
const LABEL_SEPARATORS = /[,\uFF0C\u3001]/
const TOAST_MS = 4000

/** true while the keyboard is in a text field or in a title being typed on the map */
function typingInText(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  return active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'
}

export default function App() {
  const { lang, t } = useI18n()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [failure, setFailure] = useState<OpenFailure | null>(null)
  const [session, setSession] = useState<DocumentSession | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [tabs, setTabs] = useState<SheetTab[]>([])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [notices, setNotices] = useState<OpenNotices>({ preserved: 0, unknownTheme: false })
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [fieldRequest, setFieldRequest] = useState<TopicFieldRequest | null>(null)
  const [toast, setToast] = useState<StringKey | null>(null)
  const [themeOpen, setThemeOpen] = useState(false)
  /** F5: the map alone, shell chrome covered by HTML fullscreen */
  const [presenting, setPresenting] = useState(false)
  const [noteOpen, setNoteOpen] = useState(
    () => localStorage.getItem('mindmapapp.showNotes') === '1',
  )
  /** bumped when a controller reports a change of selection, history, zoom or layout */
  const [, setMapTick] = useState(0)
  const [autoSave, setAutoSave] = useAutoSavePref('mindmapapp.autoSave', window.mindmapApi)

  const sessionRef = useRef<DocumentSession | null>(null)
  const statusRef = useRef<LoadStatus>('loading')
  const controllers = useRef(new Map<string, MapController>())
  const hosts = useRef(new Map<string, HTMLDivElement>())
  const noteRef = useRef<NotePanelHandle | null>(null)
  // the map keeps the host object it was made with; this reaches the newest handler
  const openTopicFieldRef = useRef<(field: TopicRequest, topicId: string) => void>(() => {})
  const confirmAnswer = useRef<((ok: boolean) => void) | null>(null)
  const savingRef = useRef(false)
  const langRef = useRef(lang)
  langRef.current = lang
  statusRef.current = status

  // the shell's split panes: tell it whenever this pane gains focus
  useSplitPaneFocusPing()

  const controller = activeKey ? (controllers.current.get(activeKey) ?? null) : null

  // ---- asking ----

  const ask = useCallback((request: ConfirmRequest): Promise<boolean> => {
    // a second question while one is open answers the first with "no"
    confirmAnswer.current?.(false)
    return new Promise<boolean>((resolve) => {
      confirmAnswer.current = resolve
      setConfirm(request)
    })
  }, [])

  const answer = useCallback((ok: boolean) => {
    const resolve = confirmAnswer.current
    confirmAnswer.current = null
    setConfirm(null)
    resolve?.(ok)
  }, [])

  const say = useCallback((key: StringKey) => setToast(key), [])
  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  // ---- what a map on screen needs from the screen around it ----

  const openField = useCallback((field: TopicRequest, topicId: string) => {
    const active = [...controllers.current.values()].find((candidate) => candidate.topic(topicId))
    const topic = active?.topic(topicId)
    if (!topic) return
    const value =
      field === 'label'
        ? topic.labels.join(', ')
        : field === 'note'
          ? (topic.note ?? '')
          : (topic.link ?? '')
    setFieldRequest({ field, topicId, value })
  }, [])

  const host = useMemo<MapHost>(
    () => ({
      confirmDelete: (count) =>
        ask({
          kind: 'delete-hidden',
          title: translate('deleteHiddenTitle'),
          body: translate('deleteHiddenBody', { count }),
          confirmLabel: translate('btnDelete'),
        }),
      openLink: (url) => {
        void window.mindmapApi
          .openLink(url)
          .then((opened) => {
            if (!opened) say('linkNotOpened')
          })
          .catch(() => say('linkNotOpened'))
      },
      onRequest: (field, topicId) => openTopicFieldRef.current(field, topicId),
      onStateChange: () => setMapTick((tick) => tick + 1),
    }),
    [ask, say],
  )

  // ---- opening ----

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const pending = await window.mindmapApi.consumePending()
        let opened: DocumentSession
        let found: OpenNotices = { preserved: 0, unknownTheme: false }
        let openedPath = pending
        if (pending) {
          const file = await window.mindmapApi.openFile(pending)
          const started = performance.now()
          // a restored recovery copy opens with unsaved changes; without its file it is untitled
          const result =
            file.status !== 'ok'
              ? file
              : file.restored
                ? await openCopiedMap({ bytes: file.bytes })
                : await openMapBytes(file.bytes)
          if (file.status === 'ok' && file.restored === 'untitled') openedPath = null
          // how long the engine took over the file, for measuring large maps
          performance.measure('mindmap:open', { start: started, end: performance.now() })
          if (cancelled) return
          if (result.status !== 'ok') {
            setFailure(result.status)
            setStatus('failed')
            return
          }
          opened = result.session
          found = result.notices
        } else {
          // a new map that starts with given content (a conversion's result, T17,
          // or a skill template's copy, spec 5.7), taken once
          const seed = (await window.mindmapApi.takeSeed?.()) ?? null
          if (seed && 'bytes' in seed) {
            const result = await openCopiedMap(seed)
            if (cancelled) return
            if (result.status !== 'ok') {
              setFailure(result.status)
              setStatus('failed')
              return
            }
            opened = result.session
            found = result.notices
          } else {
            opened = seed
              ? await seededMap(seed, translate('untitled'))
              : await newMap({
                  sheetTitle: translate('sheetDefaultName', { n: 1 }),
                  rootTitle: translate('centralTopic'),
                })
          }
          if (cancelled) return
        }
        sessionRef.current = opened
        setSession(opened)
        setPath(openedPath)
        setTabs(opened.tabs())
        setActiveKey(opened.tabs()[0]?.key ?? null)
        setNotices(found)
        setStatus('ready')
      } catch (err) {
        console.error('[mindmap] open failed:', err)
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // the session reports every change of the tree: the tabs and the unsaved mark follow
  useEffect(() => {
    if (!session) return
    const sync = (): void => {
      setTabs(session.tabs())
      setDirty(session.dirty)
    }
    sync()
    return session.subscribe(sync)
  }, [session])

  // mirror dirtiness to the main process (close prompt); a new map nobody touched never counts
  useEffect(() => {
    if (status === 'ready') window.mindmapApi.setDirty(dirty)
  }, [dirty, status])

  useEffect(() => {
    if (dirty && saveState === 'saved') setSaveState('idle')
  }, [dirty, saveState])

  // ---- one drawing-library instance per sheet, made when the sheet is first shown ----

  useEffect(() => {
    if (!session || !activeKey || controllers.current.has(activeKey)) return
    const el = hosts.current.get(activeKey)
    if (!el) return
    const created = new MapController({
      el,
      session,
      sheetKey: activeKey,
      strings: mapStrings(langRef.current),
      host,
    })
    controllers.current.set(activeKey, created)
    setMapTick((tick) => tick + 1)
  }, [session, activeKey, host, tabs])

  // a sheet that comes on screen catches up on what could not be measured while it was hidden
  useEffect(() => {
    if (activeKey) controllers.current.get(activeKey)?.onShown()
  }, [activeKey])

  // a deleted sheet takes its instance with it
  useEffect(() => {
    const alive = new Set(tabs.map((tab) => tab.key))
    for (const [key, gone] of controllers.current) {
      if (alive.has(key)) continue
      gone.destroy()
      controllers.current.delete(key)
    }
  }, [tabs])

  useEffect(() => {
    const all = controllers.current
    return () => {
      all.forEach((each) => each.destroy())
      all.clear()
    }
  }, [])

  // the language changed: new topics, new summaries and the map's menu follow
  useEffect(() => {
    const strings = mapStrings(lang)
    controllers.current.forEach((each) => each.setStrings(strings))
  }, [lang])

  /** Brings the tree in line with every sheet on screen, so nothing shown is missing from what is saved or read. */
  const flushAll = useCallback(() => {
    // a note still being typed belongs to the map before it is saved or read
    noteRef.current?.commit()
    controllers.current.forEach((each) => {
      // a title still being typed is part of the map: it goes in before anything is saved or read
      each.commitEdit()
      each.flush()
    })
  }, [])

  // crash-recovery copies while the map has unsaved changes (spec "work is not lost")
  const recovery = useRecoveryCopies({
    ready: status === 'ready',
    session,
    sheets: () => [...controllers.current.values()],
    flush: (commit) =>
      controllers.current.forEach((each) => {
        // only a copy the OS session end asks for takes a title still being typed
        if (commit) each.commitEdit()
        each.flush()
      }),
    saving: () => savingRef.current,
  })

  // the AI panel works on the map through the same session and controllers (T12)
  const ai = useMindmapAi({ session, controllers, activeKey, setActiveKey, path, flush: flushAll })

  /** The note panel shares the map's end side with the theme and AI panels: one at a time. */
  const closeNote = useCallback(() => {
    noteRef.current?.commit()
    setNoteOpen(false)
  }, [])

  useEffect(() => {
    localStorage.setItem('mindmapapp.showNotes', noteOpen ? '1' : '0')
  }, [noteOpen])

  // a request the shell handed over to this new map: taken once, run through the panel (T16)
  const handoff = useMapHandoff({
    ready: status === 'ready',
    untitled: path === null,
    openPanel: () => {
      closeNote()
      setThemeOpen(false)
      ai.setOpen(true)
    },
  })

  /**
   * The map as a skill's template (spec 5.7): an .xmind file, or a new map,
   * as a save would write it now. The editor recognizes no redaction marks.
   */
  const templateDocument = useMemo<TemplateDocument | null>(
    () =>
      status !== 'ready'
        ? null
        : templateDocumentOf({
            filePath: path,
            extensions: ['xmind'],
            defaultExtension: 'xmind',
            untitledTitle: () => translate('untitled'),
            bytes: async () => {
              const current = sessionRef.current
              if (!current) return null
              flushAll()
              return current.produceBytes()
            },
          }),
    [status, path, flushAll],
  )

  // ---- saving ----

  const doSave = useCallback(
    async (mode: SaveMode, auto = false): Promise<boolean> => {
      const current = sessionRef.current
      if (statusRef.current !== 'ready' || !current) return false
      // a menu save during an autosave queues behind it instead of being dropped
      while (savingRef.current) await new Promise((resolve) => setTimeout(resolve, 50))
      savingRef.current = true
      // a recovery copy being made now may hold what this save writes: it is dropped
      recovery.noteSave()
      setSaveState('saving')
      try {
        flushAll()
        const bytes = await current.produceBytes({ thumbnail: await thumbnailForSave() })
        const rootTitle = current.view(current.tabs()[0]!.key).root.title.trim()
        const result = await window.mindmapApi.save({
          bytes,
          mode,
          // an automatic save defers to the next manual one while a copy pair holds the map
          auto,
          // an untitled map is offered its central topic as a name, unless that is still the default one
          defaultName: rootTitle !== translate('centralTopic') ? rootTitle : undefined,
        })
        if (result.ok && 'path' in result) {
          current.markWritten()
          setPath(result.path)
          setSaveState(current.dirty ? 'idle' : 'saved')
          return true
        }
        // a sibling copy holding the disk version is not a failure: an
        // automatic save is deferred silently and a declined overwrite keeps
        // the map dirty, exactly like the other editors' guard
        const deferred = !result.ok && result.error === 'external-modified'
        setSaveState(result.ok || deferred ? 'idle' : 'failed')
        if (!result.ok && !deferred) console.error('[mindmap] save failed:', result.error)
        return false
      } catch (err) {
        console.error('[mindmap] save failed:', err)
        setSaveState('failed')
        return false
      } finally {
        savingRef.current = false
      }
    },
    [flushAll, recovery],
  )

  // autosave: every 30s and on window blur; untitled maps wait for an explicit first save
  useEffect(() => {
    if (!autoSave || !path) return
    const tick = (onTimer: boolean): void => {
      if (savingRef.current) return
      const maps = [...controllers.current.values()]
      // An input method is composing: this save waits for the next occasion rather than cut into it.
      if (maps.some((each) => each.composing)) return
      // The timer does not close a title the user is in the middle of typing; the
      // next tick, leaving the window or a save by hand takes it.
      if (onTimer && maps.some((each) => each.editingText)) return
      flushAll()
      if (!sessionRef.current?.dirty) return
      void doSave('save', true)
    }
    const onTimer = (): void => tick(true)
    const onBlur = (): void => tick(false)
    const id = window.setInterval(onTimer, AUTO_SAVE_INTERVAL_MS)
    window.addEventListener('blur', onBlur)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('blur', onBlur)
    }
  }, [autoSave, path, doSave, flushAll])

  // ---- undo, redo and the other commands (toolbar, keyboard, menu: one way in) ----

  const activeController = useCallback(
    () => (activeKey ? (controllers.current.get(activeKey) ?? null) : null),
    [activeKey],
  )

  const runCommand = useCallback(
    (command: MindmapMenuCommand) => {
      const map = activeController()
      if (!map) return
      switch (command) {
        case 'undo':
        case 'redo':
          // While a title is being typed the keystroke belongs to the text, not to the map's history.
          if (typingInText()) document.execCommand(command)
          else if (command === 'undo') map.undo()
          else map.redo()
          break
        case 'add-child':
          map.addChild()
          break
        case 'add-sibling':
          map.addSibling()
          break
        case 'fold-all':
          map.setAllFolded(true)
          break
        case 'unfold-all':
          map.setAllFolded(false)
          break
        case 'zoom-in':
          map.zoomIn()
          break
        case 'zoom-out':
          map.zoomOut()
          break
        case 'zoom-reset':
          map.zoomReset()
          break
        case 'zoom-fit':
          map.zoomFit()
          break
      }
    },
    [activeController],
  )

  // ---- presentation (F5): the map alone, no ribbon or sheet tabs ----

  const fitPresented = useCallback(() => {
    // the fullscreen bounds arrive after the event, so fit once the view has resized
    window.setTimeout(() => activeController()?.zoomFit(), 80)
  }, [activeController])

  const exitPresent = useCallback(() => {
    setPresenting(false)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }, [])

  const enterPresent = useCallback(() => {
    // a title still being typed belongs to the map before the chrome goes away
    flushAll()
    setPresenting(true)
    const root = document.documentElement
    if (!document.fullscreenElement && root.requestFullscreen)
      void root.requestFullscreen().then(fitPresented, fitPresented)
    else fitPresented()
  }, [flushAll, fitPresented])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (status !== 'ready') return
      const action = presentationKeyOf(event, presenting)
      if (!action) return
      // F5 and Ctrl/Cmd/Shift+F5 both start the map's show; it has one view.
      event.preventDefault()
      if (action === 'exit') {
        // the map's own Esc (cancel a pick, close the edit box) waits until the show is over
        event.stopPropagation()
        exitPresent()
      } else enterPresent()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [status, presenting, enterPresent, exitPresent])

  useEffect(() => {
    const onFullScreenChange = (): void => {
      if (document.fullscreenElement) fitPresented()
      else setPresenting(false)
    }
    document.addEventListener('fullscreenchange', onFullScreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullScreenChange)
  }, [fitPresented])

  useEffect(() => {
    const api = window.mindmapApi
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
        flushAll()
        if (!sessionRef.current?.dirty) {
          api.sendCloseSaveResult(true)
          return
        }
        api.sendCloseSaveResult(await doSave('save'))
      })()
    })
    const offRenamed = api.onFileRenamed((next) => setPath(next))
    const offMenu = api.onMenuCommand(runCommand)
    // Questions from the in-app MCP server. Staying silent while the map is
    // still loading keeps the asker retrying instead of failing.
    const offOutline = api.onOutlineRequest(() => {
      if (statusRef.current === 'loading') return
      const current = sessionRef.current
      if (!current) {
        api.sendOutlineResult({ error: 'the file did not open, so there is no map to read' })
        return
      }
      try {
        flushAll()
        api.sendOutlineResult({ text: current.outline() })
      } catch (err) {
        api.sendOutlineResult({ error: err instanceof Error ? err.message : String(err) })
      }
    })
    const offBytes = api.onBytesRequest(() => {
      if (statusRef.current === 'loading') return
      const current = sessionRef.current
      if (!current) {
        api.sendBytesResult({ error: 'the file did not open, so there is no map to read' })
        return
      }
      flushAll()
      current
        .produceBytes()
        .then((bytes) => api.sendBytesResult({ bytes }))
        .catch((err: unknown) =>
          api.sendBytesResult({ error: err instanceof Error ? err.message : String(err) }),
        )
    })
    const offChrome = api.onChromePressed(() => activeController()?.cancelRelationshipPick())
    return () => {
      offSave()
      offClose()
      offRenamed()
      offMenu()
      offOutline()
      offBytes()
      offChrome()
    }
  }, [doSave, flushAll, runCommand, activeController])

  // Ctrl+S / Ctrl+Shift+S, and undo or redo pressed while the map itself does not have the keyboard
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        void doSave(event.shiftKey ? 'saveAs' : 'save')
        return
      }
      if (key !== 'z' && key !== 'y') return
      const target = event.target instanceof Element ? event.target : null
      // the map handles its own keys, and a text field its own undo
      if (target?.closest('.map-container') || typingInText()) return
      event.preventDefault()
      runCommand(key === 'y' || event.shiftKey ? 'redo' : 'undo')
    }
    // Captured: the edit box of a title keeps its keys to itself, and Ctrl+S has to work while typing.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [doSave, runCommand])

  // export, print and the preview picture a save writes (export/use-map-export.ts)
  const exporter = useMapExport({ session, controllers, activeKey, path, flushAll, say })

  // ---- sheets ----

  const selectSheet = (key: string): void => {
    noteRef.current?.commit()
    activeController()?.flush()
    setActiveKey(key)
  }

  const addSheet = (): void => {
    if (!session) return
    activeController()?.flush()
    const added = session.addSheet({
      title: t('sheetDefaultName', { n: session.tabs().length + 1 }),
      rootTitle: t('centralTopic'),
    })
    setActiveKey(added.key)
  }

  const deleteSheet = (key: string): void => {
    if (!session) return
    const index = session.indexOf(key)
    void deleteSheetAfterConfirm(session, key, (title) =>
      ask({
        kind: 'delete-sheet',
        title: translate('deleteSheetTitle'),
        body: translate('deleteSheetBody', { name: title }),
        confirmLabel: translate('btnDelete'),
      }),
    ).then((outcome) => {
      if (outcome === 'last-sheet') say('lastSheetNote')
      if (outcome !== 'deleted') return
      const left = session.tabs()
      setActiveKey((current) =>
        current === key ? (left[Math.min(index, left.length - 1)]?.key ?? null) : current,
      )
    })
  }

  // ---- the theme of the sheet that is open ----

  const pickTheme = (id: ThemeId): void => {
    if (!controller?.setTheme(id) || !session) return
    // the sheet now carries a theme of this app: the notice about the default look may no longer apply
    if (!session.hasUnknownTheme()) {
      setNotices((current) =>
        current.unknownTheme ? { ...current, unknownTheme: false } : current,
      )
    }
  }

  // ---- labels, notes, links ----

  /** Labels and links are modal; a note belongs in the side panel, where it stays while the map is used. */
  const openTopicField = (field: TopicRequest, topicId: string): void => {
    if (field === 'note') {
      setThemeOpen(false)
      ai.setOpen(false)
      if (noteOpen) noteRef.current?.focus()
      else setNoteOpen(true)
      return
    }
    openField(field, topicId)
  }
  openTopicFieldRef.current = openTopicField

  const requestField = (field: TopicRequest): void => {
    const id = controller?.selectedTopicIds().at(-1)
    if (id) openTopicField(field, id)
    else say('selectTopicFirst')
  }

  const submitField = (value: string): boolean => {
    const map = controller
    if (!map || !fieldRequest) return true
    const { field, topicId } = fieldRequest
    if (field === 'label') return map.setLabels(topicId, value.split(LABEL_SEPARATORS))
    if (field === 'note') return map.setNote(topicId, value)
    // Any address is kept; the controller turns down only a reference into the file.
    return map.setLink(topicId, linkFromInput(value))
  }

  // computed on every render: `t` is a new function each time and must not be a hook dependency
  const statusText =
    toast !== null
      ? t(toast)
      : saveState === 'saving'
        ? t('saving')
        : saveState === 'failed'
          ? t('saveFailedStatus')
          : dirty
            ? t('unsaved')
            : saveState === 'saved'
              ? t('savedOk')
              : ''

  if (status === 'error') return <div className="center-note">{t('loadFailed')}</div>
  if (status === 'loading') return <div className="center-note">{t('loading')}</div>
  if (status === 'failed') {
    return (
      <div className="center-note" role="alert" data-open-failure={failure ?? 'unreadable'}>
        {t(OPEN_FAILURE_TEXT[failure ?? 'unreadable'])}
      </div>
    )
  }

  const hasTopic = (controller?.selectedTopicIds().length ?? 0) > 0
  const selectedId = controller?.selectedTopicIds().at(-1)
  const selectedTopic = selectedId ? (controller?.topic(selectedId) ?? null) : null
  const picking = controller?.pickingRelationship ?? false

  return (
    <div className={`app${presenting ? ' mm-presenting' : ''}`}>
      <Toolbar
        disabled={!controller}
        dirty={dirty}
        statusText={statusText}
        canUndo={controller?.canUndo ?? false}
        canRedo={controller?.canRedo ?? false}
        autoSave={autoSave}
        hasTopic={hasTopic}
        layout={controller?.layout ?? 'both'}
        layoutExact={controller?.layoutExact ?? true}
        pickingRelationship={picking}
        themeOpen={themeOpen}
        aiOpen={ai.open}
        noteOpen={noteOpen}
        onSave={() => void doSave('save')}
        onSaveAs={() => void doSave('saveAs')}
        onUndo={() => runCommand('undo')}
        onRedo={() => runCommand('redo')}
        onToggleAutoSave={setAutoSave}
        onAddChild={() => runCommand('add-child')}
        onAddSibling={() => runCommand('add-sibling')}
        onRelationship={() => {
          if (picking) controller?.cancelRelationshipPick()
          else if (!controller?.pickRelationshipTarget()) say('selectTopicFirst')
        }}
        onSummary={() => {
          if (!controller?.addSummary()) say('selectTopicFirst')
        }}
        onNote={() => requestField('note')}
        onLabel={() => requestField('label')}
        onLink={() => requestField('link')}
        onLayout={(layout: ViewLayout) => controller?.setLayout(layout)}
        onToggleTheme={() => {
          closeNote()
          ai.setOpen(false)
          setThemeOpen((open) => !open)
        }}
        onFoldAll={() => runCommand('fold-all')}
        onUnfoldAll={() => runCommand('unfold-all')}
        onZoomIn={() => runCommand('zoom-in')}
        onZoomOut={() => runCommand('zoom-out')}
        onZoomFit={() => runCommand('zoom-fit')}
        onToggleAi={() => {
          closeNote()
          setThemeOpen(false)
          ai.setOpen(!ai.open)
        }}
        onExport={exporter.exportAs}
        onMakeFromDocument={() => window.mindmapApi.makeFromDocument?.()}
      />

      {(notices.preserved > 0 || notices.unknownTheme || picking) && (
        <div className="mm-notices">
          {notices.preserved > 0 && (
            <Notice
              kind="preserved"
              text={t('noticePreserved', { count: notices.preserved })}
              onClose={() => setNotices((current) => ({ ...current, preserved: 0 }))}
            />
          )}
          {notices.unknownTheme && (
            <Notice
              kind="theme"
              text={t('noticeTheme')}
              onClose={() => setNotices((current) => ({ ...current, unknownTheme: false }))}
            />
          )}
          {picking && (
            <Notice
              kind="pick-relationship"
              text={t('pickRelationship')}
              onClose={() => controller?.cancelRelationshipPick()}
            />
          )}
        </div>
      )}

      <main className="mm-stage">
        {/* the theme panel and the AI panel dock at this element's end side, one open at a time */}
        <div className="mm-card" aria-label={t('appName')}>
          {tabs.map((tab) => (
            <div
              key={tab.key}
              className="mm-sheet-host"
              data-sheet-host={tab.key}
              hidden={tab.key !== activeKey}
              ref={(el) => {
                if (el) hosts.current.set(tab.key, el)
                else hosts.current.delete(tab.key)
              }}
            />
          ))}
        </div>
        {themeOpen && controller && (
          <ThemePanel
            themeId={controller.themeId}
            written={controller.themeWritten}
            disabled={!controller}
            onPick={pickTheme}
            onClose={() => setThemeOpen(false)}
          />
        )}
        {noteOpen && (
          <NotePanel
            ref={noteRef}
            sheetKey={activeKey ?? ''}
            topic={selectedTopic}
            onCommit={(topicId, note) => controller?.setNote(topicId, note)}
            onClose={closeNote}
          />
        )}
        <MindmapAiDock
          ai={ai}
          filePath={path}
          request={handoff.request}
          onRunStart={handoff.onRunStart}
          templateDocument={templateDocument}
          onSkillHandoff={() => {
            closeNote()
            setThemeOpen(false)
            ai.setOpen(true)
          }}
        />
      </main>

      <footer className="mm-foot">
        <SheetTabs
          tabs={tabs}
          activeKey={activeKey}
          disabled={!session}
          onSelect={selectSheet}
          onAdd={addSheet}
          onRename={(key, title) => session?.renameSheet(key, title)}
          onDelete={deleteSheet}
        />
        <button
          type="button"
          className="mm-zoom"
          data-action="zoom-reset"
          data-tip={t('zoomReset')}
          disabled={!controller}
          onClick={() => runCommand('zoom-reset')}
        >
          {Math.round((controller?.zoom ?? 1) * 100)}%
        </button>
      </footer>

      {confirm && <ConfirmDialog request={confirm} onAnswer={answer} />}
      {fieldRequest && (
        <TopicFieldDialog
          key={`${fieldRequest.field}:${fieldRequest.topicId}`}
          request={fieldRequest}
          onSubmit={submitField}
          linkKind={linkInputKind}
          onClose={() => setFieldRequest(null)}
        />
      )}
    </div>
  )
}
