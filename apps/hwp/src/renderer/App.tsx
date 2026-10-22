import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createEditor } from '@rhwp/editor'
import type { RhwpEditor } from '@rhwp/editor'
import type { Params } from '@genoffice/i18n'
import {
  aiPanelInitiallyOpen,
  rememberAiPanelOpen,
  skillTemplateText,
  templateDocumentOf,
  useSplitPaneFocusPing,
  type TemplateDocument,
} from '@genoffice/ui'
import { HwpAiDock } from './ai/AiDock'
import { createAgentBridge } from './ai/agent-bridge'
import { DIRTY_EVENT, FILE_COMMAND_EVENT } from '../../studio-plugin/agent-plugin.mjs'
import blankHwpUrl from './assets/blank.hwp?url'
import { useI18n, type StringKey } from './i18n/locale'
import { openDocumentsDroppedOn } from './editor-drop'
import { gatherPrintJob } from './print-flow'
import { runSave, type SaveEditorPort } from './save-flow'
import { PASSWORD_FLAG } from '../../scripts/rhwp-patches.mjs'
import { STUDIO_SETTINGS_KEY, seededStudioSettings, studioUrl } from './studio-settings'
import { hwpFormatOfPath } from '../shared/ipc'
import type { HwpFormat, SaveMode, UiTheme } from '../shared/ipc'

/**
 * booting: the editor itself is starting. loading: the editor is up and working
 * on the document; it stays visible, because this is where it may ask for a
 * document password.
 */
type Phase = 'booting' | 'loading' | 'ready' | 'failed'

interface Notice {
  tone: 'info' | 'error'
  key: StringKey
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
/** Where the open / collapsed state of the AI panel is remembered. */
const AI_OPEN_KEY = 'hwpapp.showAi'

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
    measureTabs: async (spots) => (await agent.measureTabs(spots)).tabs,
    notifySaved: (fileName) => editor.notifySaved(fileName),
  }
}

export default function App() {
  const { t, lang } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<RhwpEditor | null>(null)
  const savingRef = useRef(false)
  /** the format the document was opened in: what it is exported as when it is read */
  const formatRef = useRef<HwpFormat>('hwp')
  const [phase, setPhase] = useState<Phase>('booting')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [aiOpen, setAiOpen] = useState(() => aiPanelInitiallyOpen(AI_OPEN_KEY))
  /** the file the document is in: the AI conversation is kept with it */
  const [filePath, setFilePath] = useState<string | null>(null)
  /** an untitled copy's name (a skill template's): the title it has until its first save */
  const copyNameRef = useRef<string | null>(null)
  /** the AI panel's way into the document: the app's plugin inside the editor */
  const agentBridge = useMemo(() => createAgentBridge(() => editorRef.current), [])

  // the shell's split panes: tell it whenever this pane gains focus
  useSplitPaneFocusPing()

  useEffect(() => {
    rememberAiPanelOpen(AI_OPEN_KEY, aiOpen)
  }, [aiOpen])

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
        // an untitled copy (a skill template's, spec 5.7) is read from its temp file but
        // has no file of its own: the AI conversation and the first save treat it as new
        const copy = (await window.hwpApi.untitledCopy?.().catch(() => null)) ?? null
        if (copy) {
          formatRef.current = copy.format
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
        const dirty = (await editor.commands.context()).isDirty === true
        if (seen === changes) report(dirty)
      } catch {
        // the editor is going away; the next tick or the unmount settles it
      } finally {
        asking = false
      }
    }
    const frame = editor.element.contentWindow
    const onChange = (event: Event) => {
      changes += 1
      report((event as CustomEvent<unknown>).detail === true)
    }
    frame?.addEventListener(DIRTY_EVENT, onChange)
    // an edit before the plugin is up has no event: ask once it is
    void agentBridge
      .foreignChanges()
      .catch(() => {})
      .then(() => check())
    const timer = setInterval(() => void check(), DIRTY_POLL_MS)
    return () => {
      clearInterval(timer)
      frame?.removeEventListener(DIRTY_EVENT, onChange)
    }
  }, [phase, agentBridge])

  const save = useCallback(
    async (mode: SaveMode): Promise<boolean> => {
      const editor = editorRef.current
      if (!editor || savingRef.current) return false
      savingRef.current = true
      try {
        const outcome = await runSave(savePortOf(editor), window.hwpApi, mode)
        if (outcome.kind === 'saved') {
          setFilePath(outcome.path)
          const backup = outcome.backupPath ? { name: fileNameOf(outcome.backupPath) } : null
          if (outcome.tailsLost) {
            // stays until dismissed: the file is written, but may not open in Hangul
            setNotice({
              tone: 'error',
              key: 'savedTailsLost',
              ...(backup ? { detail: t('backupKept', backup) } : {}),
            })
          } else {
            setNotice(backup ? { tone: 'info', key: 'backupKept', params: backup } : null)
          }
          return true
        }
        if (outcome.kind === 'failed') {
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
            ...(outcome.detail ? { detail: outcome.detail } : {}),
          })
        }
        return false
      } finally {
        savingRef.current = false
      }
    },
    [t],
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
        print: t('filePrint'),
      })
      .catch(() => {})
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<unknown>).detail
      if (command === 'save' || command === 'saveAs' || command === 'pdf' || command === 'print') {
        window.hwpApi.requestFileCommand(command)
      }
    }
    frame.addEventListener(FILE_COMMAND_EVENT, onCommand)
    return () => frame.removeEventListener(FILE_COMMAND_EVENT, onCommand)
  }, [phase, agentBridge, t])

  // saves asked for by the menu, the shortcut and the close prompt
  useEffect(() => {
    const canSave = () => phase === 'ready' && !savingRef.current
    const offSave = window.hwpApi.onSaveRequest((mode) => {
      // the main process is waiting on this request; decline it rather than leave it hanging
      if (!canSave()) {
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
            .then((context) => context.isDirty !== false)
            .catch(() => true))
        if (dirty) await save(mode)
        else window.hwpApi.abortSave()
      })()
    })
    const offClose = window.hwpApi.onCloseSaveRequest(() => {
      if (!canSave()) window.hwpApi.sendCloseSaveResult(false)
      else void save('save').then((ok) => window.hwpApi.sendCloseSaveResult(ok))
    })
    return () => {
      offSave()
      offClose()
    }
  }, [phase, save])

  // PDF and print asked for by the menu and Ctrl+P: the pages are gathered here, and the
  // main process makes the PDF or opens the print dialog
  const printingRef = useRef(false)
  useEffect(
    () =>
      window.hwpApi.onPrintRequest((mode) => {
        if (phase !== 'ready' || printingRef.current) return
        printingRef.current = true
        void (async () => {
          const failed = mode === 'pdf' ? 'pdfFailed' : 'printFailed'
          try {
            const job = await gatherPrintJob(agentBridge, mode, (done, total) =>
              setNotice({
                tone: 'info',
                key: 'printPreparing',
                params: { done, total },
                sticky: true,
              }),
            )
            setNotice({ tone: 'info', key: 'printSending', sticky: true })
            const result = await window.hwpApi.printPages(job)
            setNotice(result.ok ? null : { tone: 'error', key: failed, detail: result.error })
          } catch (error) {
            setNotice({ tone: 'error', key: failed, detail: detailOf(error) })
          } finally {
            printingRef.current = false
          }
        })()
      }),
    [phase, agentBridge],
  )

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
    <div className="hwp-app" data-phase={phase}>
      <div className="app-main">
        {/* the assistant works on an open document, so it appears with one */}
        {phase === 'ready' && (
          <HwpAiDock
            open={aiOpen}
            setOpen={setAiOpen}
            bridge={agentBridge}
            filePath={filePath}
            templateDocument={templateDocument}
          />
        )}
        <div className="hwp-stage">
          <div ref={hostRef} className="hwp-editor-host" />
          {phase === 'booting' && <div className="hwp-cover">{t('loading')}</div>}
          {notice && (
            <div
              className={`hwp-notice hwp-notice-${notice.tone}`}
              role={notice.tone === 'error' ? 'alert' : 'status'}
            >
              <div className="hwp-notice-text">
                <span>{t(notice.key, notice.params)}</span>
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
    </div>
  )
}
