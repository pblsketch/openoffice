import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createEditor } from '@rhwp/editor'
import type { ChromeVisibility, RhwpEditor } from '@rhwp/editor'
import type { Params } from '@genoffice/i18n'
import {
  aiPanelInitiallyOpen,
  rememberAiPanelOpen,
  skillTemplateText,
  templateDocumentOf,
  useAutoSavePref,
  useSplitPaneFocusPing,
  type TemplateDocument,
} from '@genoffice/ui'
import { HwpAiDock } from './ai/AiDock'
import { DocCheckPanel } from './check/DocCheckPanel'
import { createAgentBridge } from './ai/agent-bridge'
import {
  DIRTY_EVENT,
  FILE_COMMAND_EVENT,
  MEMO_NOT_COPIED_EVENT,
  MEMO_REMOVED_EVENT,
} from '../../studio-plugin/agent-plugin.mjs'
import blankHwpUrl from './assets/blank.hwp?url'
import { useI18n, type StringKey } from './i18n/locale'
import { MEMO_INSERT_EVENT, memoNoticeOf, type MemoNotice } from './MemoPanel'
import { MemoSide, MemoToggle, memoPanelInitiallyOpen, rememberMemoPanelOpen } from './MemoSide'
import { openDocumentsDroppedOn } from './editor-drop'
import { hwpPresentationKeyOf } from './presentation-keys'
import { gatherPrintJob } from './print-flow'
import { PrintPreview } from './preview/PrintPreview'
import {
  RECOVERY_TICK_MS,
  createRecoveryCopier,
  withChangeNotes,
  type RecoveryCopier,
} from './recovery-flow'
import { runSave, type SaveEditorPort } from './save-flow'
import { AUTOSAVE_IDLE_MS, startAutosave } from './autosave-flow'
import { PASSWORD_FLAG } from '../../scripts/rhwp-patches.mjs'
import { STUDIO_SETTINGS_KEY, seededStudioSettings, studioUrl } from './studio-settings'
import { hwpFormatOfPath } from '../shared/ipc'
import type {
  HwpFormat,
  PreviewAction,
  PrintMode,
  PrintResult,
  SaveMode,
  UiTheme,
} from '../shared/ipc'

/**
 * booting: the editor itself is starting. loading: the editor is up and working
 * on the document; it stays visible, because this is where it may ask for a
 * document password.
 */
type Phase = 'booting' | 'loading' | 'ready' | 'failed'

interface Notice {
  tone: 'info' | 'error'
  key?: StringKey
  /** a message already localized elsewhere (the main process), shown instead of `key` */
  text?: string
  params?: Params
  /** untranslated cause from the engine or the file system, shown under the message */
  detail?: string
  /** an information that stays until dismissed, as errors do */
  sticky?: true
}

/**
 * How often the editor is asked whether the document has unsaved changes, besides being
 * told of each change: for one the plugin missed (it loads after the document opens).
 */
const DIRTY_POLL_MS = 2000
/** How often a document that has not arrived yet is looked for. */
const ARRIVAL_POLL_MS = 1000
/** How long a confirmation stays up; errors stay until dismissed. */
const INFO_NOTICE_MS = 8000
/** Where the open / collapsed state of the AI dock is remembered. */
const AI_OPEN_KEY = 'hwpapp.showAi'
/** A pause after typing before the memo panel is told the document may have changed. */
const MEMO_TICK_MS = 500

const fileNameOf = (path: string) => path.split(/[\\/]/).pop() ?? path
/** the name the editor holds a new document under; the user names the file at its first save */
const BLANK_NAME = 'blank.hwp'
const detailOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
/**
 * The bridge gives up on a load after a minute, but the editor may still be
 * waiting on the user (the password prompt has no deadline). That is not a
 * failed open: the document can still arrive.
 */
const isBridgeTimeout = (error: unknown) =>
  error instanceof Error && error.message.startsWith('Request timeout')

function savePortOf(editor: RhwpEditor): SaveEditorPort {
  const agent = createAgentBridge(() => editor)
  return {
    isPasswordProtected: async () => {
      const flag = (await editor.commands.context())[PASSWORD_FLAG]
      // a build without the flag cannot tell, and must not write as if it could
      if (typeof flag !== 'boolean')
        throw new Error('the editor did not report password protection')
      return flag
    },
    exportHwp: () => editor.exportHwp(),
    exportHwpx: () => editor.exportHwpx(),
    exportHwpVerify: () => editor.exportHwpVerify(),
    listMemos: async () => {
      const listed = await agent.listMemos()
      return listed.memos.map((memo) => ({
        author: memo.author,
        date: memo.date,
        text: memo.text,
        place: memo.place,
        sectionIndex: memo.sectionIndex,
        paraIndex: memo.paraIndex,
        startCharIdx: memo.startCharIdx,
        endCharIdx: memo.endCharIdx,
        path: memo.path,
      }))
    },
    setMemoLock: (locked) => agent.setMemoLock(locked),
    measureTabs: async (spots) => (await agent.measureTabs(spots)).tabs,
    notifySaved: (fileName) => editor.notifySaved(fileName),
  }
}

export default function App() {
  const { t, lang } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<RhwpEditor | null>(null)
  const savingRef = useRef(false)
  /** resolved when the save in flight finishes, so a manual save can queue behind an autosave */
  const savingDoneRef = useRef<Promise<void> | null>(null)
  /** last key, click or paste in the editor (autosave waits for a pause) */
  const lastInputAtRef = useRef(0)
  /** the format the document was opened in: what it is exported as when it is read */
  const formatRef = useRef<HwpFormat>('hwp')
  /** the same format for the screen: the check panel passes it to the rules */
  const [docFormat, setDocFormat] = useState<HwpFormat>('hwp')
  const [phase, setPhase] = useState<Phase>('booting')
  /** Ctrl+F5: the document alone in fullscreen, with the editor's own chrome hidden */
  const [presenting, setPresenting] = useState(false)
  const presentingRef = useRef(false)
  /** the print preview covers the editor; 0-based page it opens on */
  const [preview, setPreview] = useState<{ open: boolean; initialPage: number }>({
    open: false,
    initialPage: 0,
  })
  const previewRef = useRef(false)
  /** bumped when Print / Ctrl+P arrives while the preview is already open */
  const [printSignal, setPrintSignal] = useState(0)
  const prePresentChromeRef = useRef<ChromeVisibility | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [aiOpen, setAiOpen] = useState(() => aiPanelInitiallyOpen(AI_OPEN_KEY))
  const [checkOpen, setCheckOpen] = useState(false)
  /** a request the check panel hands to the AI input box; `nonce` says it is a new one */
  const [aiPrefill, setAiPrefill] = useState<{ text: string; nonce: number } | null>(null)
  /** counts changes made through the bridge, so the check panel can read the document again */
  const [docRevision, setDocRevision] = useState(0)
  /** the memo column beside the document: out or not, independent of the AI dock */
  const [memoOpen, setMemoOpen] = useState(memoPanelInitiallyOpen)
  /** a memo editor is open here or in another tab: save, close and quit must wait */
  const [memoBlocked, setMemoBlocked] = useState(false)
  const memoBlockedRef = useRef(false)
  memoBlockedRef.current = memoBlocked
  /** bumped when the document may have changed: the memo list reads it again */
  const [docTick, setDocTick] = useState(0)
  /** bumped by the editor's Insert > Memo menu: the memo panel opens its add dialog */
  const [memoInsertTick, setMemoInsertTick] = useState(0)
  const [autoSave, setAutoSave] = useAutoSavePref('hwpapp.autoSave', window.hwpApi)
  /** the file the document is in: the AI conversation is kept with it */
  const [filePath, setFilePath] = useState<string | null>(null)
  /** an untitled copy's name (a skill template's): the title it has until its first save */
  const copyNameRef = useRef<string | null>(null)
  /** crash-recovery copies of the document (recovery-flow.ts), once it is in the editor */
  const copierRef = useRef<RecoveryCopier | null>(null)
  /** the editor holds a restored recovery copy that has not been saved since */
  const restoredRef = useRef(false)
  /** the AI panel's way into the document: the app's plugin inside the editor */
  const agentBridge = useMemo(
    () =>
      withChangeNotes(
        createAgentBridge(() => editorRef.current),
        () => {
          copierRef.current?.noteChange()
          setDocRevision((revision) => revision + 1)
        },
      ),
    [],
  )

  // the shell's split panes: tell it whenever this pane gains focus
  useSplitPaneFocusPing()

  useEffect(() => {
    rememberAiPanelOpen(AI_OPEN_KEY, aiOpen)
  }, [aiOpen])

  useEffect(() => {
    rememberMemoPanelOpen(memoOpen)
  }, [memoOpen])

  // boot the editor once and load the file queued for this view
  useEffect(() => {
    let disposed = false
    let editor: RhwpEditor | null = null
    let stopDrop: (() => void) | null = null
    void (async () => {
      try {
        const [path, theme, lang] = await Promise.all([
          window.hwpApi.consumePending(),
          window.hwpApi.getTheme().catch((): UiTheme => 'system'),
          window.hwpApi.getLanguage(),
        ])
        // the studio reads its settings before first paint, so they are seeded before it exists
        localStorage.setItem(
          STUDIO_SETTINGS_KEY,
          seededStudioSettings(localStorage.getItem(STUDIO_SETTINGS_KEY), theme),
        )
        editor = await createEditor(hostRef.current!, { studioUrl: studioUrl(lang) })
        if (disposed) {
          editor.destroy()
          return
        }
        editorRef.current = editor
        stopDrop = openDocumentsDroppedOn(editor.element, (files) =>
          window.hwpApi.openDroppedDocuments(files),
        )
        setPhase('loading')
        if (!path) {
          // a new document: the blank one bundled with the app, which has no file until
          // its first save (Save As)
          const blank = new Uint8Array(await (await fetch(blankHwpUrl)).arrayBuffer())
          await editor.loadFile(blank, BLANK_NAME, { skipUnsavedGuard: true })
          if (!disposed) setPhase('ready')
          return
        }
        formatRef.current = hwpFormatOfPath(path) ?? 'hwp'
        setDocFormat(formatRef.current)
        // an untitled copy (a skill template's, spec 5.7) is read from its temp file but
        // has no file of its own: the AI conversation and the first save treat it as new
        const copy = (await window.hwpApi.untitledCopy?.().catch(() => null)) ?? null
        if (copy) {
          formatRef.current = copy.format
          setDocFormat(copy.format)
          copyNameRef.current = copy.name
        } else setFilePath(path)
        const bytes = await window.hwpApi.readFile(path)
        await editor.loadFile(bytes, copy ? copy.name : fileNameOf(path), {
          skipUnsavedGuard: true,
        })
        if (disposed) return
        setPhase('ready')
        if (await window.hwpApi.trackingDropped().catch(() => false)) {
          if (!disposed) setNotice({ tone: 'info', key: 'openedTracked', sticky: true })
        }
      } catch (error) {
        if (disposed) return
        if (editor && isBridgeTimeout(error)) return
        setPhase('failed')
        setNotice({
          tone: 'error',
          key: editor ? 'openFailed' : 'editorFailed',
          detail: detailOf(error),
        })
      }
    })()
    return () => {
      disposed = true
      editorRef.current = null
      stopDrop?.()
      editor?.destroy()
    }
  }, [])

  // a document can arrive after the load call gave up or failed (a password
  // entered late, a second try in the editor's own prompt): notice it and go on
  useEffect(() => {
    if (phase !== 'loading' && phase !== 'failed') return
    const timer = setInterval(() => {
      void editorRef.current?.commands
        .context()
        .then((context) => {
          if (context.hasDocument !== true) return
          setPhase('ready')
          setNotice((current) => (current?.key === 'openFailed' ? null : current))
        })
        .catch(() => {})
    }, ARRIVAL_POLL_MS)
    return () => clearInterval(timer)
  }, [phase])

  // mirror the editor's unsaved state to the main process, which owns the close prompt: the
  // app's plugin passes each change on in the same task as the edit, so an edit followed at
  // once by closing the tab cannot slip through; a slow poll covers what it did not see
  useEffect(() => {
    if (phase !== 'ready') return
    const editor = editorRef.current
    if (!editor) return
    let reported = false
    let asking = false
    /** counts the changes the plugin passed on; a poll answer older than one is dropped */
    let changes = 0
    const report = (dirty: boolean) => {
      if (dirty === reported) return
      reported = dirty
      window.hwpApi.setDirty(dirty)
    }
    const check = async () => {
      if (asking || savingRef.current) return
      asking = true
      const seen = changes
      try {
        // a restored recovery copy stays unsaved until it is saved, whatever the editor says
        const dirty = (await editor.commands.context()).isDirty === true || restoredRef.current
        if (seen === changes) report(dirty)
      } catch {
        // the editor is going away; the next tick or the unmount settles it
      } finally {
        asking = false
      }
    }
    const frame = editor.element.contentWindow
    /** one bump after the typing stops, not one per key: the memo list reads it again */
    let memoTick: ReturnType<typeof setTimeout> | null = null
    const onChange = (event: Event) => {
      changes += 1
      // the memo list may have gained or lost a memo (a paste adds one)
      if (memoTick) clearTimeout(memoTick)
      memoTick = setTimeout(() => setDocTick((tick) => tick + 1), MEMO_TICK_MS)
      report((event as CustomEvent<unknown>).detail === true || restoredRef.current)
    }
    // one-time news the plugin sends when an edit took memos away or a paste left them behind
    const onMemoEvent = (event: Event) => {
      const mapped = memoNoticeOf(event.type, (event as CustomEvent<unknown>).detail)
      if (!mapped) return
      setNotice({ tone: 'info', key: mapped.key, params: mapped.params })
      // the list changed even if the dirty notice for the same edit was missed
      setDocTick((tick) => tick + 1)
    }
    frame?.addEventListener(DIRTY_EVENT, onChange)
    frame?.addEventListener(MEMO_REMOVED_EVENT, onMemoEvent)
    frame?.addEventListener(MEMO_NOT_COPIED_EVENT, onMemoEvent)
    // an edit before the plugin is up has no event: ask once it is
    void agentBridge
      .foreignChanges()
      .catch(() => {})
      .then(() => check())
    const timer = setInterval(() => void check(), DIRTY_POLL_MS)
    return () => {
      clearInterval(timer)
      if (memoTick) clearTimeout(memoTick)
      frame?.removeEventListener(DIRTY_EVENT, onChange)
      frame?.removeEventListener(MEMO_REMOVED_EVENT, onMemoEvent)
      frame?.removeEventListener(MEMO_NOT_COPIED_EVENT, onMemoEvent)
    }
  }, [phase, agentBridge])

  /** Save, close and quit wait for the memo editor (spec 3.2): say so, do not discard its text. */
  const showMemoBlocked = useCallback(() => {
    setNotice({ tone: 'error', key: 'memoSaveBlocked' })
  }, [])

  // main refuses a save, close or quit while a memo editor is open; say why, do not discard
  useEffect(() => window.hwpApi.onMemoBlocked(showMemoBlocked), [showMemoBlocked])

  const showMemoNotice = useCallback((notice: MemoNotice) => {
    setNotice({ tone: notice.tone ?? 'info', key: notice.key, params: notice.params })
  }, [])

  const save = useCallback(
    async (mode: SaveMode, automatic = false): Promise<boolean> => {
      const editor = editorRef.current
      if (!editor) return false
      // a memo editor is open: its text is not in the document yet; an autosave waits quietly
      if (memoBlockedRef.current) {
        if (!automatic) showMemoBlocked()
        return false
      }
      if (!editor) return false
      // a manual save waits for an autosave already running; an automatic one lets the
      // save in flight stand for it (no second export, and no backoff)
      while (savingRef.current) {
        if (automatic) return true
        const done = savingDoneRef.current
        if (!done) break
        await done
      }
      if (savingRef.current || editorRef.current !== editor) return false
      savingRef.current = true
      let release!: () => void
      const done = new Promise<void>((resolve) => (release = resolve))
      savingDoneRef.current = done
      try {
        const outcome = await runSave(savePortOf(editor), window.hwpApi, mode, automatic)
        if (outcome.kind === 'saved') {
          restoredRef.current = false
          copierRef.current?.saved()
          setFilePath(outcome.path)
          const backup = outcome.backupPath ? { name: fileNameOf(outcome.backupPath) } : null
          if (outcome.memosLost) {
            // stays until dismissed: the file is written, but some memos are not in it
            setNotice({
              tone: 'error',
              key: 'memoHwpxLost',
              params: { count: outcome.memosLost },
              ...(backup ? { detail: t('backupKept', backup) } : {}),
            })
          } else if (outcome.tailsLost) {
            // stays until dismissed: the file is written, but may not open in Hangul
            setNotice({
              tone: 'error',
              key: 'savedTailsLost',
              ...(backup ? { detail: t('backupKept', backup) } : {}),
            })
          } else if (!automatic) {
            setNotice(backup ? { tone: 'info', key: 'backupKept', params: backup } : null)
          }
          return true
        }
        if (outcome.kind === 'failed') {
          // a protected or tracked document cannot be saved by this path at all;
          // the manual save explains that once instead of every autosave backoff
          const propertyFailure = outcome.reason === 'protected' || outcome.reason === 'tracked'
          if (!automatic || !propertyFailure) {
            setNotice({
              tone: 'error',
              key:
                outcome.reason === 'protected'
                  ? 'saveProtected'
                  : outcome.reason === 'tracked'
                    ? 'saveTracked'
                    : outcome.reason === 'verify'
                      ? 'saveVerifyFailed'
                      : 'saveFailed',
              ...(outcome.reason === 'verify'
                ? { detail: t('saveVerifyHint') }
                : outcome.detail
                  ? { detail: outcome.detail }
                  : {}),
            })
          }
        }
        return false
      } finally {
        savingRef.current = false
        release()
        if (savingDoneRef.current === done) savingDoneRef.current = null
      }
    },
    [t, showMemoBlocked],
  )

  // the embedded editor drops its own Save and Print, so its File menu gets the app's: they
  // go to the main process and come back as the requests Ctrl+S and Ctrl+P make
  useEffect(() => {
    if (phase !== 'ready') return
    const frame = editorRef.current?.element.contentWindow
    if (!frame) return
    void agentBridge
      .installFileMenu({
        save: t('fileSave'),
        saveAs: t('fileSaveAs'),
        pdf: t('fileExportPdf'),
        preview: t('filePreview'),
        print: t('filePrint'),
      })
      .catch(() => {})
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<unknown>).detail
      if (
        command === 'save' ||
        command === 'saveAs' ||
        command === 'pdf' ||
        command === 'preview' ||
        command === 'print'
      ) {
        window.hwpApi.requestFileCommand(command)
      }
    }
    // the editor's Insert > Memo menu (T4): bring the memo column out and start adding
    const onMemoInsert = () => {
      setMemoOpen(true)
      setMemoInsertTick((tick) => tick + 1)
    }
    frame.addEventListener(FILE_COMMAND_EVENT, onCommand)
    frame.addEventListener(MEMO_INSERT_EVENT, onMemoInsert)
    return () => {
      frame.removeEventListener(FILE_COMMAND_EVENT, onCommand)
      frame.removeEventListener(MEMO_INSERT_EVENT, onMemoInsert)
    }
  }, [phase, agentBridge, t])

  // crash-recovery copies while the document has unsaved changes; typing never waits on one
  useEffect(() => {
    if (phase !== 'ready') return
    const editor = editorRef.current
    if (!editor) return
    const port = savePortOf(editor)
    const copier = createRecoveryCopier({
      editor: {
        ...port,
        isDirty: async () => (await editor.commands.context()).isDirty === true,
      },
      api: window.hwpApi,
      isBusy: () => savingRef.current,
      restoredUnsaved: () => restoredRef.current,
    })
    copierRef.current = copier
    let disposed = false
    void (async () => {
      const isProtected = await port.isPasswordProtected().catch(() => false)
      const opened = await window.hwpApi.recoveryOpened(isProtected).catch(() => null)
      if (disposed || !opened) return
      if (opened.restored) restoredRef.current = true
      // a document whose password a copy cannot keep: said once, when the tab opens
      if (opened.notice) setNotice({ tone: 'info', text: opened.notice, sticky: true })
    })()
    const frame = editor.element.contentWindow
    const inEditor = () => {
      lastInputAtRef.current = Date.now()
      copier.noteInput()
    }
    const elsewhere = () => {
      lastInputAtRef.current = Date.now()
      copier.noteInput(false)
    }
    const editorEvents = [
      'keydown',
      'input',
      'compositionend',
      'pointerdown',
      'paste',
      'cut',
      'drop',
    ]
    const pageEvents = ['keydown', 'pointerdown', 'wheel']
    for (const name of editorEvents) frame?.addEventListener(name, inEditor, true)
    frame?.addEventListener('wheel', elsewhere, { capture: true, passive: true })
    for (const name of pageEvents) {
      window.addEventListener(name, elsewhere, { capture: true, passive: true })
    }
    const timer = setInterval(() => void copier.tick(), RECOVERY_TICK_MS)
    const offFlush = window.hwpApi.onRecoveryFlush((token) => {
      void copier.flush().finally(() => window.hwpApi.sendRecoveryFlushed(token))
    })
    const offReset = window.hwpApi.onRecoveryReset(() => copier.reset())
    return () => {
      disposed = true
      clearInterval(timer)
      offFlush()
      offReset()
      for (const name of editorEvents) frame?.removeEventListener(name, inEditor, true)
      frame?.removeEventListener('wheel', elsewhere, { capture: true })
      for (const name of pageEvents) window.removeEventListener(name, elsewhere, { capture: true })
      if (copierRef.current === copier) copierRef.current = null
    }
  }, [phase])

  // saves asked for by the menu, the shortcut and the close prompt
  useEffect(() => {
    const ready = () => phase === 'ready'
    const offSave = window.hwpApi.onSaveRequest((mode) => {
      // a memo editor is open: do not discard its text, and tell the user why not
      if (memoBlockedRef.current) {
        showMemoBlocked()
        window.hwpApi.abortSave()
        return
      }
      // the main process is waiting on this request; decline it rather than leave it hanging
      if (!ready()) {
        window.hwpApi.abortSave()
        return
      }
      void (async () => {
        // a plain Save with nothing to write does nothing; ask the editor now
        // rather than trust the polled flag, which may not have seen the last key
        const dirty =
          mode === 'saveAs' ||
          (await editorRef.current?.commands
            .context()
            .then((context) => context.isDirty !== false || restoredRef.current)
            .catch(() => true))
        // save() queues behind an autosave already running; the main process is answered
        // when that one (and this save) finish
        if (dirty) await save(mode)
        else window.hwpApi.abortSave()
      })()
    })
    const offClose = window.hwpApi.onCloseSaveRequest(() => {
      if (memoBlockedRef.current) {
        showMemoBlocked()
        window.hwpApi.sendCloseSaveResult(false)
        return
      }
      if (!ready()) {
        window.hwpApi.sendCloseSaveResult(false)
        return
      }
      void (async () => {
        // an autosave already running may be exactly what the close prompt is about
        const running = savingDoneRef.current
        if (savingRef.current && running) await running
        const dirty = await editorRef.current?.commands
          .context()
          .then((context) => context.isDirty !== false || restoredRef.current)
          .catch(() => true)
        window.hwpApi.sendCloseSaveResult(dirty ? await save('save') : true)
      })()
    })
    return () => {
      offSave()
      offClose()
    }
  }, [phase, save, showMemoBlocked])

  // Print and PDF: the pages are gathered here, and the main process makes the PDF or
  // opens the print dialog. Print now goes through the preview, which calls runPrint.
  const printingRef = useRef(false)
  const runPrint = useCallback(
    async (
      mode: PrintMode,
      onProgress: (done: number, total: number) => void = () => {},
    ): Promise<PrintResult> => {
      if (phase !== 'ready') return { ok: false, error: 'the editor is not ready' }
      if (printingRef.current) return { ok: false, error: 'already printing' }
      printingRef.current = true
      try {
        const job = await gatherPrintJob(agentBridge, mode, onProgress)
        return await window.hwpApi.printPages(job)
      } catch (error) {
        return { ok: false, error: detailOf(error) }
      } finally {
        printingRef.current = false
      }
    },
    [phase, agentBridge],
  )

  useEffect(() => {
    previewRef.current = preview.open
  }, [preview.open])

  const openPreview = useCallback(async (): Promise<void> => {
    if (phase !== 'ready' || previewRef.current || printingRef.current) return
    let page = 1
    try {
      const context = await editorRef.current?.getSelectionContext()
      if (context && Number.isInteger(context.page) && context.page > 0) page = context.page
    } catch {
      // no caret yet: open at the first page
    }
    previewRef.current = true
    setPreview({ open: true, initialPage: page - 1 })
  }, [phase])

  const closePreview = useCallback((): void => {
    previewRef.current = false
    setPreview({ open: false, initialPage: 0 })
  }, [])

  /** Ctrl+Enter in the preview: put the caret on the page's first paragraph and close. */
  const editPage = useCallback(
    async (page: number): Promise<boolean> => {
      try {
        const target = await agentBridge.pageTarget(page)
        if (!target.ok) return false
        const focused = await editorRef.current?.focusTarget(target.target)
        if (!focused?.focused) return false
        closePreview()
        return true
      } catch {
        return false
      }
    },
    [agentBridge, closePreview],
  )

  // File > Print / Preview and Ctrl+P: open the preview, or print from it if it is open.
  useEffect(
    () =>
      window.hwpApi.onPreviewRequest((action: PreviewAction) => {
        if (phase !== 'ready' || printingRef.current) return
        if (previewRef.current) {
          if (action === 'print') setPrintSignal((value) => value + 1)
          return
        }
        void openPreview()
      }),
    [phase, openPreview],
  )

  // PDF still exports without a preview; the preview's PDF button uses runPrint directly.
  useEffect(
    () =>
      window.hwpApi.onPrintRequest((mode) => {
        if (mode !== 'pdf' || printingRef.current) return
        void (async () => {
          const result = await runPrint('pdf', (done, total) =>
            setNotice({
              tone: 'info',
              key: 'printPreparing',
              params: { done, total },
              sticky: true,
            }),
          )
          setNotice(result.ok ? null : { tone: 'error', key: 'pdfFailed', detail: result.error })
        })()
      }),
    [runPrint],
  )

  // autosave to the document's own file: 30 s and window blur, after the user has
  // paused (exporting a whole HWP document costs more than the other editors' saves)
  useEffect(() => {
    if (!autoSave || phase !== 'ready' || !filePath) return
    const editor = editorRef.current
    if (!editor) return
    const handle = startAutosave({
      shouldSave: async () => {
        if (
          savingRef.current ||
          memoBlockedRef.current ||
          printingRef.current ||
          presentingRef.current ||
          copierRef.current?.busy()
        )
          return false
        if (Date.now() - lastInputAtRef.current < AUTOSAVE_IDLE_MS) return false
        return editor.commands
          .context()
          .then((context) => context.isDirty === true || restoredRef.current)
          .catch(() => false)
      },
      save: () => save('save', true),
    })
    return () => handle.stop()
  }, [autoSave, phase, filePath, save])

  // the document as it is now, for a reader outside the editor (the MCP tool that reads
  // open documents): exported in its own format, never written anywhere
  useEffect(
    () =>
      window.hwpApi.onReadBytesRequest(() => {
        const editor = editorRef.current
        if (!editor || phase !== 'ready') {
          window.hwpApi.sendReadBytesResult({ ok: false, error: 'no document is open in this tab' })
          return
        }
        const exporting = formatRef.current === 'hwpx' ? editor.exportHwpx() : editor.exportHwp()
        exporting.then(
          (bytes) => window.hwpApi.sendReadBytesResult({ ok: true, bytes }),
          (error) => window.hwpApi.sendReadBytesResult({ ok: false, error: detailOf(error) }),
        )
      }),
    [phase],
  )

  // keep the editor's own chrome on the app theme
  useEffect(
    () =>
      window.hwpApi.onThemeChanged((theme) => {
        void editorRef.current?.commands.execute(`view:theme-${theme}`).catch(() => {})
      }),
    [],
  )

  // Ctrl+F5: the document alone in fullscreen; F5 and Shift+F5 stay with Hancom's
  // cell blocks. The editor's menu/toolbar/status bar hide with its own chrome API
  // and come back exactly as they were when the show ends.
  useEffect(() => {
    const enter = async (): Promise<void> => {
      const editor = editorRef.current
      if (!editor || phase !== 'ready' || presentingRef.current) return
      presentingRef.current = true
      try {
        prePresentChromeRef.current = await editor.chrome.get()
      } catch {
        prePresentChromeRef.current = null
      }
      if (!presentingRef.current) return
      void editor.chrome.set({ menu: false, toolbar: false, statusbar: false }).catch(() => {})
      setPresenting(true)
      const root = document.documentElement
      if (!document.fullscreenElement && root.requestFullscreen)
        void root.requestFullscreen().catch(() => {})
    }
    const exit = (): void => {
      if (!presentingRef.current) return
      presentingRef.current = false
      setPresenting(false)
      const editor = editorRef.current
      if (editor && prePresentChromeRef.current) {
        void editor.chrome.set(prePresentChromeRef.current).catch(() => {})
      }
      prePresentChromeRef.current = null
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
    const onKey = (event: KeyboardEvent): void => {
      // the preview owns the screen (and its own F5/ Esc handling)
      if (previewRef.current) return
      const action = hwpPresentationKeyOf(event, presentingRef.current)
      if (!action) return
      event.preventDefault()
      // the editor reads any F5 as a cell block: a key the show takes is not its key
      event.stopPropagation()
      if (action === 'exit') exit()
      else void enter()
    }
    // The document lives inside rhwp's own frame, so keys pressed there never
    // reach this window: listen on both. A cross-origin frame simply gets none.
    window.addEventListener('keydown', onKey, true)
    let frameWindow: Window | null = null
    try {
      frameWindow = editorRef.current?.element.contentWindow ?? null
      frameWindow?.addEventListener('keydown', onKey, true)
    } catch {
      frameWindow = null
    }
    return () => {
      window.removeEventListener('keydown', onKey, true)
      try {
        frameWindow?.removeEventListener('keydown', onKey, true)
      } catch {
        /* the frame went away with its document */
      }
    }
  }, [phase])

  // OS-level Esc leaves fullscreen without a keydown: end the show with it.
  useEffect(() => {
    if (!presenting) return
    const onFullScreenChange = (): void => {
      if (document.fullscreenElement) return
      presentingRef.current = false
      setPresenting(false)
      const editor = editorRef.current
      if (editor && prePresentChromeRef.current) {
        void editor.chrome.set(prePresentChromeRef.current).catch(() => {})
      }
      prePresentChromeRef.current = null
    }
    document.addEventListener('fullscreenchange', onFullScreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullScreenChange)
  }, [presenting])

  useEffect(() => {
    if (notice?.tone !== 'info' || notice.sticky) return
    const timer = setTimeout(() => setNotice(null), INFO_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  /**
   * The document as a skill's template (spec 5.7): an .hwp or .hwpx file, or a
   * new one, exported in its own format as it is now. The editor recognizes
   * no redaction marks.
   */
  const templateDocument = useMemo<TemplateDocument | null>(
    () =>
      phase !== 'ready'
        ? null
        : templateDocumentOf({
            filePath,
            extensions: ['hwp', 'hwpx'],
            defaultExtension: formatRef.current,
            untitledTitle: () =>
              copyNameRef.current?.replace(/\.[^.]+$/, '') || skillTemplateText(lang, 'untitled'),
            bytes: async () => {
              const editor = editorRef.current
              if (!editor) return null
              return formatRef.current === 'hwpx' ? editor.exportHwpx() : editor.exportHwp()
            },
          }),
    [phase, filePath, lang],
  )

  return (
    <div className={`hwp-app${presenting ? ' hwp-presenting' : ''}`} data-phase={phase}>
      {phase === 'ready' && (
        <div className="hwp-topbar">
          <button
            type="button"
            className="hwp-topbar-button"
            aria-pressed={checkOpen}
            onClick={() => setCheckOpen((open) => !open)}
          >
            {t('checkTitle')}
          </button>
          <MemoToggle open={memoOpen} onToggle={() => setMemoOpen((open) => !open)} />
          <label className={`autosave-toggle${autoSave ? ' on' : ''}`} data-tip={t('autoSaveTip')}>
            <span className="autosave-knob" />
            <span className="autosave-text">{t('autoSave')}</span>
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(e) => setAutoSave(e.target.checked)}
            />
          </label>
        </div>
      )}
      <div className="app-main">
        {/* the AI dock, then the memo column beside the document (as the PDF editor's notes);
            both can be out at once, and both need an open document. The preview covers both. */}
        {phase === 'ready' && !preview.open && (
          <HwpAiDock
            open={aiOpen}
            setOpen={setAiOpen}
            bridge={agentBridge}
            filePath={filePath}
            templateDocument={templateDocument}
            prefill={aiPrefill}
          />
        )}
        {phase === 'ready' && (
          <MemoSide
            open={memoOpen}
            bridge={agentBridge}
            changeTick={docTick}
            insertTick={memoInsertTick}
            onCollapse={() => setMemoOpen(false)}
            onModalOpenChange={setMemoBlocked}
            onNotice={showMemoNotice}
          />
        )}
        <div className="hwp-stage">
          <div ref={hostRef} className="hwp-editor-host" />
          {phase === 'ready' && checkOpen && (
            <DocCheckPanel
              bridge={agentBridge}
              format={docFormat}
              revision={docRevision}
              onClose={() => setCheckOpen(false)}
              onHandOff={(request) => {
                setAiPrefill({ text: request, nonce: Date.now() })
                setAiOpen(true)
              }}
            />
          )}
          {phase === 'booting' && <div className="hwp-cover">{t('loading')}</div>}
          {notice && (
            <div
              className={`hwp-notice hwp-notice-${notice.tone}`}
              role={notice.tone === 'error' ? 'alert' : 'status'}
            >
              <div className="hwp-notice-text">
                <span>{notice.text ?? (notice.key ? t(notice.key, notice.params) : '')}</span>
                {notice.detail && <span className="hwp-notice-detail">{notice.detail}</span>}
              </div>
              <button
                type="button"
                className="hwp-notice-close"
                aria-label={t('dismiss')}
                onClick={() => setNotice(null)}
              >
                ×
              </button>
            </div>
          )}
        </div>
      </div>
      {preview.open && (
        <PrintPreview
          bridge={agentBridge}
          initialPage={preview.initialPage}
          printSignal={printSignal}
          onClose={closePreview}
          onPrint={runPrint}
          onEditPage={editPage}
        />
      )}
    </div>
  )
}
