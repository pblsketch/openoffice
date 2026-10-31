import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { createIpcTransport, type AgentTransport } from '@genoffice/agent-core'
import type { AiSettings, AiSubscriptionStatuses } from '@genoffice/ai-provider/browser'
import { localContextLimit } from '@genoffice/ai-provider/browser'
import type { Lang, Params } from '@genoffice/i18n'
import type {
  AddFolderResult,
  CreateProjectResult,
  ProjectChangedEvent,
  ProjectChatListItem,
  ProjectChatRef,
  ProjectDetail,
  ProjectFileEntry,
  ProjectFolderApi,
  ProjectId,
  ProjectListItem,
  ProjectScreenSection,
} from '@genoffice/project-store'
import {
  aiContextConfirmText,
  aiRunErrorText,
  aiSendGate,
  consolidateProjectMemory,
  ProjectProblemLine,
  projectAddProblem,
  projectConsolidatedText,
  projectEditorLabel,
  projectFullTime,
  projectPanelText,
  projectPickerItems,
  projectRelativeTime,
  undoProjectMemoryConsolidation,
  type ConsolidateProjectMemoryOptions,
  type ConsolidateProjectMemoryResult,
  type ProjectPanelStringKey,
  type ProjectProblem,
} from '@genoffice/ui'
import { useI18n } from './locale'
import { projectsText, type ProjectsStringKey } from './i18n/strings-projects'
import './projects-panel.css'

/**
 * The home project screen (decision 0088, spec 5.12): the project list with
 * "new project" and "add folder", and one project's instructions, memory,
 * files and chats. Every action goes through the project folder bridge; main
 * decides where folders are written and asks the trust question itself.
 *
 * The picker's hover actions (pin, open folder, remove from list) are plain
 * buttons on each row here, so they are reachable from the keyboard.
 */

/** A request to show the screen at a project (and section), from `onOpenProjectScreen` */
export interface ProjectScreenRequest {
  projectId: ProjectId
  section?: ProjectScreenSection
  /** bumps on every request, so asking for the same project again still applies */
  seq: number
}

/**
 * Listen for "show the project screen" from main (an AI panel's "[view]").
 * Returns the unsubscribe function; a window without the bridge listens to nothing.
 */
export function subscribeProjectScreen(
  bridge: Pick<ProjectFolderApi, 'onOpenProjectScreen'> | null | undefined,
  onRequest: (request: ProjectScreenRequest) => void,
): () => void {
  if (!bridge || typeof bridge.onOpenProjectScreen !== 'function') return () => undefined
  let seq = 0
  return bridge.onOpenProjectScreen((event) => {
    seq += 1
    onRequest({
      projectId: event.projectId,
      ...(event.section ? { section: event.section } : {}),
      seq,
    })
  })
}

type Tab = 'instructions' | 'memory' | 'files' | 'chats'

const TABS: readonly Tab[] = ['instructions', 'memory', 'files', 'chats']

const TAB_KEY: Record<Tab, ProjectsStringKey> = {
  instructions: 'tabInstructions',
  memory: 'tabMemory',
  files: 'tabFiles',
  chats: 'tabChats',
}

/** Files read per page of the file list ("more" reads the next page) */
const FILES_PAGE = 200

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

/** A sentence to show, kept as a key so it is translated when drawn */
type Note =
  | { from: 'screen'; key: ProjectsStringKey; params?: Params; tone?: 'info' | 'warning' }
  | { from: 'panel'; key: ProjectPanelStringKey; params?: Params; tone?: 'info' | 'warning' }

function noteText(lang: Lang, note: Note): string {
  return note.from === 'screen'
    ? projectsText(lang, note.key, note.params)
    : projectPanelText(lang, note.key, note.params)
}

/** Where "<name>" is created under the default parent folder, for display */
function createLocation(parent: string, name: string): string {
  const base = parent.trim()
  if (!base) return ''
  const separator = base.includes('\\') || !base.includes('/') ? '\\' : '/'
  const trimmed = /[\\/]$/.test(base) && base.length > 1 ? base.slice(0, -1) : base
  return `${trimmed}${trimmed.endsWith(separator) ? '' : separator}${name.normalize('NFC').trim()}`
}

/** A file of the project on disk: the folder plus its `/`-separated relative path */
export function projectFilePath(folder: string, relPath: string): string {
  const separator = folder.includes('\\') || !folder.includes('/') ? '\\' : '/'
  const base = /[\\/]$/.test(folder) ? folder.slice(0, -1) : folder
  const parts = relPath.split('/').filter((part) => part !== '' && part !== '.' && part !== '..')
  return [base, ...parts].join(separator)
}

/**
 * Listen for "the app wrote part of a project" from main. Returns the
 * unsubscribe function; a window without the bridge (or an older one) hears nothing.
 */
export function subscribeProjectChanges(
  bridge: Pick<ProjectFolderApi, 'onProjectChanged'> | null | undefined,
  listener: (event: ProjectChangedEvent) => void,
): () => void {
  if (!bridge || typeof bridge.onProjectChanged !== 'function') return () => undefined
  return bridge.onProjectChanged(listener)
}

function formatSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** The default transport: the home renderer's AI stream, the same path the ask panel uses */
function defaultTransport(getSettings: () => AiSettings, lang: () => Lang): AgentTransport {
  return createIpcTransport<AiSettings>({
    onStream: (listener) => window.aiOffice.onAiStream(listener),
    start: (request) => window.aiOffice.aiStream(request),
    cancel: (requestId) => void window.aiOffice.aiStreamCancel(requestId),
    getSettings,
    unknownErrorText: () => projectsText(lang(), 'consolidateFailed'),
    errorText: (cause) => aiRunErrorText(lang(), cause),
    contextLimit: (settings) => localContextLimit(settings),
    confirmContext: (warning) => window.confirm(aiContextConfirmText(lang(), warning)),
  })
}

export interface ProjectsPanelProps {
  /** the project folder bridge; defaults to `window.projectFolderApi` */
  bridge?: ProjectFolderApi | null
  /** the latest "show this project" request (from an AI panel's "[view]") */
  request?: ProjectScreenRequest | null
  /** the AI settings as last read; null until they are */
  aiSettings: AiSettings | null
  /** the subscription statuses the send gate reads */
  statuses: AiSubscriptionStatuses
  /** the first-connection notice is owed: nothing is sent until it is acknowledged */
  noticeDue: boolean
  /** show the first-connection notice (a consolidation waits behind it) */
  onNoticeNeeded?: () => void
  onOpenAiSettings: () => void
  /** main handed a chat to this home window (a home chat, or no document to open it in): show the ask panel with it */
  onOpenHomeAsk: (chat: ProjectChatRef) => void
  /** open a file of the project in the app (a name in the file list); defaults to the shell's open path */
  onOpenPath?: (path: string) => void
  /** the settings a consolidation runs with, read fresh at the click; tests inject one */
  readSettings?: () => Promise<AiSettings>
  /** the transport a consolidation runs on; tests inject one */
  createTransport?: (getSettings: () => AiSettings, lang: () => Lang) => AgentTransport
  /** the consolidation itself; tests may inject one */
  consolidate?: (
    options: ConsolidateProjectMemoryOptions,
  ) => Promise<ConsolidateProjectMemoryResult>
}

export function ProjectsPanel(props: ProjectsPanelProps) {
  const { lang } = useI18n()
  const bridge = props.bridge !== undefined ? props.bridge : (window.projectFolderApi ?? null)
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  const [openId, setOpenId] = useState<ProjectId | null>(null)
  const [tabRequest, setTabRequest] = useState<{ tab: Tab; seq: number }>({
    tab: 'instructions',
    seq: 0,
  })
  const [note, setNote] = useState<Note | null>(null)
  /** a folder refused or a project not made, and why (spec 5.1) */
  const [problem, setProblem] = useState<ProjectProblem | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [parentFolder, setParentFolder] = useState('')
  const [busy, setBusy] = useState(false)
  /** what the project screen says when it opens (an existing project a create or add led to) */
  const [arrivalNote, setArrivalNote] = useState<Note | null>(null)
  const s = (key: ProjectsStringKey, params?: Params) => projectsText(lang, key, params)
  const p = (key: ProjectPanelStringKey, params?: Params) => projectPanelText(lang, key, params)

  const refresh = async (): Promise<void> => {
    if (!bridge) return
    try {
      setProjects(await bridge.listProjects())
    } catch {
      setProjects([])
      setNote({ from: 'screen', key: 'loadFailed', tone: 'warning' })
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per mount
  }, [])

  // a rename, pin or removal made in another window shows in the list
  useEffect(
    () =>
      subscribeProjectChanges(bridge, (event) => {
        if (event.part === 'settings') void refresh()
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one subscription per mount
    [],
  )

  // a "show this project" request opens it at the asked section
  const requestSeq = props.request?.seq
  useEffect(() => {
    const request = props.request
    if (!request) return
    setOpenId(request.projectId)
    setTabRequest((prev) => ({ tab: request.section ?? 'instructions', seq: prev.seq + 1 }))
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request matters
  }, [requestSeq])

  const openProject = (id: ProjectId, arrival: Note | null = null) => {
    setNote(null)
    setProblem(null)
    setArrivalNote(arrival)
    setOpenId(id)
    setTabRequest((prev) => ({ tab: 'instructions', seq: prev.seq + 1 }))
  }

  /** what an add-folder style result does on the list screen */
  const afterAdd = async (result: AddFolderResult | CreateProjectResult): Promise<void> => {
    setProblem(projectAddProblem(result))
    switch (result.status) {
      case 'added':
        await refresh()
        // a folder that was already a listed project just opens, and says so
        openProject(
          result.project.id,
          result.identity === 'existing' ? { from: 'panel', key: 'alreadyListed' } : null,
        )
        return
      case 'created':
        setCreating(false)
        setNewName('')
        await refresh()
        openProject(result.project.id)
        return
      default:
        // cancelled says nothing; the rest is the problem line set above
        return
    }
  }

  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } catch {
      setNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    } finally {
      setBusy(false)
    }
  }

  const startCreate = () => {
    setNote(null)
    setProblem(null)
    setCreating(true)
    if (!bridge) return
    void bridge
      .getDefaultParentFolder()
      .then(setParentFolder)
      .catch(() => setParentFolder(''))
  }

  const create = (otherPlace: boolean) => {
    const name = newName.normalize('NFC').trim()
    if (!bridge || !name) return
    setNote(null)
    setProblem(null)
    void run(async () => {
      await afterAdd(await bridge.createProject(otherPlace ? { name, otherPlace: true } : { name }))
    })
  }

  const addFolder = () => {
    if (!bridge) return
    setNote(null)
    setProblem(null)
    void run(async () => afterAdd(await bridge.addFolder()))
  }

  const relocate = (id: ProjectId) => {
    if (!bridge) return
    setNote(null)
    setProblem(null)
    void run(async () => afterAdd(await bridge.relocateProject({ projectId: id })))
  }

  const setPinned = (id: ProjectId, pinned: boolean) => {
    if (!bridge) return
    void run(async () => {
      await bridge.setPinned({ projectId: id, pinned })
      await refresh()
    })
  }

  const removeFromList = (id: ProjectId) => {
    if (!bridge) return
    void run(async () => {
      await bridge.removeFromList({ projectId: id })
      if (openId === id) setOpenId(null)
      await refresh()
    })
  }

  const openFolder = (id: ProjectId) => {
    if (!bridge) return
    void bridge.openInFileManager({ projectId: id }).catch(() => undefined)
  }

  if (!bridge) return <main className="content projects-panel" />

  const problemLine = problem && (
    <ProjectProblemLine lang={lang} problem={problem} onDismiss={() => setProblem(null)} />
  )

  if (openId) {
    return (
      <main className="content projects-panel">
        {problemLine}
        <ProjectDetailView
          key={openId}
          bridge={bridge}
          projectId={openId}
          lang={lang}
          tabRequest={tabRequest}
          onBack={() => {
            setOpenId(null)
            void refresh()
          }}
          onChanged={() => void refresh()}
          initialNote={arrivalNote}
          onOpenPath={props.onOpenPath ?? ((path) => void window.aiOffice?.openPath(path))}
          aiSettings={props.aiSettings}
          statuses={props.statuses}
          noticeDue={props.noticeDue}
          onNoticeNeeded={props.onNoticeNeeded}
          onOpenAiSettings={props.onOpenAiSettings}
          onOpenHomeAsk={props.onOpenHomeAsk}
          readSettings={props.readSettings}
          createTransport={props.createTransport}
          consolidate={props.consolidate}
          relocate={() => relocate(openId)}
        />
      </main>
    )
  }

  const rows = projectPickerItems(projects ?? [], '', lang).flatMap((item) =>
    item.kind === 'project' ? [item] : [],
  )
  const pinnedRows = rows.filter((row) => row.group === 'pinned')
  const recentRows = rows.filter((row) => row.group === 'recent')
  const location = createLocation(parentFolder, newName)

  const renderRow = (project: ProjectListItem) => (
    <li key={project.id} className="projects-row" data-project-id={project.id}>
      <button
        type="button"
        className={`projects-row-main${project.missing ? ' is-missing' : ''}`}
        title={project.missing ? p('folderMissingTitle') : project.path}
        onClick={() => (project.missing ? relocate(project.id) : openProject(project.id))}
      >
        <span className="projects-row-name">{project.name}</span>
        <span className="projects-row-path">{project.path}</span>
        {project.missing && <span className="projects-mark">{p('folderMissing')}</span>}
        {project.unwritable && (
          <span className="projects-mark is-warning">{p('unwritableMark')}</span>
        )}
      </button>
      <div className="projects-row-actions">
        <button
          type="button"
          className="projects-small"
          aria-label={`${project.pinned ? p('unpin') : p('pin')}: ${project.name}`}
          onClick={() => setPinned(project.id, !project.pinned)}
        >
          {project.pinned ? p('unpin') : p('pin')}
        </button>
        {!project.missing && (
          <button
            type="button"
            className="projects-small"
            aria-label={`${IS_MAC ? s('openInFinder') : s('openInExplorer')}: ${project.name}`}
            onClick={() => openFolder(project.id)}
          >
            {IS_MAC ? s('openInFinder') : s('openInExplorer')}
          </button>
        )}
        <button
          type="button"
          className="projects-small"
          title={p('removeFromListTitle')}
          aria-label={`${p('removeFromList')}: ${project.name}`}
          onClick={() => removeFromList(project.id)}
        >
          {p('removeFromList')}
        </button>
      </div>
    </li>
  )

  return (
    <main className="content projects-panel">
      <div className="projects-head">
        <h2 className="projects-title">{s('navProjects')}</h2>
      </div>
      <p className="projects-desc">{s('intro')}</p>
      <div className="projects-toolbar">
        <button type="button" className="projects-primary" onClick={startCreate}>
          {p('newProject')}
        </button>
        <button type="button" className="projects-ghost" disabled={busy} onClick={addFolder}>
          {s('addExistingFolder')}
        </button>
      </div>
      {creating && (
        <form
          className="projects-create"
          onSubmit={(event) => {
            event.preventDefault()
            create(false)
          }}
        >
          <label className="projects-field">
            <span className="projects-field-label">{s('newNameLabel')}</span>
            <input
              autoFocus
              value={newName}
              placeholder={p('newProjectNameHint')}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setCreating(false)
                }
              }}
            />
          </label>
          {location && newName.trim() && (
            <p className="projects-location">{p('createLocation', { path: location })}</p>
          )}
          <div className="projects-buttons">
            <button type="submit" className="projects-primary" disabled={busy || !newName.trim()}>
              {s('create')}
            </button>
            <button
              type="button"
              className="projects-ghost"
              disabled={busy || !newName.trim()}
              onClick={() => create(true)}
            >
              {p('createElsewhere')}
            </button>
            <button type="button" className="projects-ghost" onClick={() => setCreating(false)}>
              {s('cancel')}
            </button>
          </div>
        </form>
      )}
      {note && <NoteLine lang={lang} note={note} />}
      {problemLine}
      {projects !== null && rows.length === 0 && <p className="projects-empty">{s('emptyHint')}</p>}
      {pinnedRows.length > 0 && (
        <section className="projects-group" aria-label={p('groupPinned')}>
          <h3 className="projects-group-title">{p('groupPinned')}</h3>
          <ul className="projects-list">{pinnedRows.map((row) => renderRow(row.project))}</ul>
        </section>
      )}
      {recentRows.length > 0 && (
        <section className="projects-group" aria-label={p('groupRecent')}>
          <h3 className="projects-group-title">{p('groupRecent')}</h3>
          <ul className="projects-list">{recentRows.map((row) => renderRow(row.project))}</ul>
        </section>
      )}
    </main>
  )
}

function NoteLine({ lang, note, children }: { lang: Lang; note: Note; children?: ReactNode }) {
  return (
    <p
      className={`projects-note${note.tone === 'warning' ? ' is-warning' : ''}`}
      role={note.tone === 'warning' ? 'alert' : 'status'}
    >
      <span>{noteText(lang, note)}</span>
      {children}
    </p>
  )
}

/** What the last consolidation showed under the memory list */
type ConsolidationView =
  | { kind: 'running' }
  | { kind: 'done'; before: number; after: number; backupName: string }
  | { kind: 'note'; note: Note; settings?: boolean; detail?: string }

interface DetailProps {
  bridge: ProjectFolderApi
  projectId: ProjectId
  lang: Lang
  tabRequest: { tab: Tab; seq: number }
  onBack: () => void
  onChanged: () => void
  /** a line the screen opens with (an existing project a create or add led to) */
  initialNote: Note | null
  /** opens a file of the project in the app */
  onOpenPath: (path: string) => void
  aiSettings: AiSettings | null
  statuses: AiSubscriptionStatuses
  noticeDue: boolean
  onNoticeNeeded: (() => void) | undefined
  onOpenAiSettings: () => void
  onOpenHomeAsk: (chat: ProjectChatRef) => void
  readSettings: (() => Promise<AiSettings>) | undefined
  createTransport: ((getSettings: () => AiSettings, lang: () => Lang) => AgentTransport) | undefined
  consolidate:
    | ((options: ConsolidateProjectMemoryOptions) => Promise<ConsolidateProjectMemoryResult>)
    | undefined
  relocate: () => void
}

function ProjectDetailView(props: DetailProps) {
  const { bridge, projectId, lang } = props
  const s = (key: ProjectsStringKey, params?: Params) => projectsText(lang, key, params)
  const p = (key: ProjectPanelStringKey, params?: Params) => projectPanelText(lang, key, params)
  const langRef = useRef(lang)
  langRef.current = lang

  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [tab, setTab] = useState<Tab>(props.tabRequest.tab)
  const [headNote, setHeadNote] = useState<Note | null>(props.initialNote)
  const [nameDraft, setNameDraft] = useState('')
  const [instructionsDraft, setInstructionsDraft] = useState('')
  const [instructionsNote, setInstructionsNote] = useState<Note | null>(null)
  const [memoryEditing, setMemoryEditing] = useState<string | null>(null)
  const [memoryNote, setMemoryNote] = useState<Note | null>(null)
  /** a save found the file changed since its text was loaded: ask before writing over it */
  const [conflict, setConflict] = useState<'instructions' | 'memory' | null>(null)
  // What each draft was loaded from. A draft still equal to it follows the
  // file when the screen reads again; an edited one is kept, and its save
  // compares the file with this first (never writes over a change unasked).
  const nameDraftRef = useRef('')
  nameDraftRef.current = nameDraft
  const nameBaseRef = useRef('')
  const instructionsDraftRef = useRef('')
  instructionsDraftRef.current = instructionsDraft
  const instructionsBaseRef = useRef('')
  const memoryBaseRef = useRef('')
  const tabRef = useRef(tab)
  tabRef.current = tab
  const [consolidation, setConsolidation] = useState<ConsolidationView | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [files, setFiles] = useState<{ list: ProjectFileEntry[]; total: number } | null>(null)
  const [filesFailed, setFilesFailed] = useState(false)
  const [ignored, setIgnored] = useState<ProjectFileEntry[] | null>(null)
  const [chats, setChats] = useState<ProjectChatListItem[] | null>(null)
  const [renaming, setRenaming] = useState<{ id: ProjectId; title: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ProjectChatListItem | null>(null)
  const [listNote, setListNote] = useState<Note | null>(null)
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})

  /**
   * Reads the project again. A draft nobody edited follows the file; an
   * edited draft stays as typed. `fresh` takes the file's text for both.
   */
  const reload = async (fresh = false): Promise<ProjectDetail | null> => {
    try {
      const next = await bridge.getProjectDetail({ projectId })
      setDetail(next)
      setLoadFailed(false)
      if (fresh || nameDraftRef.current === nameBaseRef.current) {
        nameBaseRef.current = next.project.name
        nameDraftRef.current = next.project.name
        setNameDraft(next.project.name)
      }
      if (fresh || instructionsDraftRef.current === instructionsBaseRef.current) {
        instructionsBaseRef.current = next.instructions
        instructionsDraftRef.current = next.instructions
        setInstructionsDraft(next.instructions)
      }
      return next
    } catch {
      setLoadFailed(true)
      return null
    }
  }
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  useEffect(() => {
    void reload(true)
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one project per mount (keyed)
  }, [])

  // a new request for this project (an AI panel's [View]) moves to its section
  // and reads the folder again: what changed outside the app shows
  const tabSeq = props.tabRequest.seq
  const mountedSeq = useRef(tabSeq)
  useEffect(() => {
    setTab(props.tabRequest.tab)
    // the first read is the mount's own
    if (tabSeq !== mountedSeq.current) void reloadRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request matters
  }, [tabSeq])

  // the screen reads the folder again whenever it is shown: the window or the
  // Home tab comes back, or any window of the app wrote part of this project
  useEffect(() => {
    const again = () => void reloadRef.current()
    const onVisible = () => {
      if (document.visibilityState === 'visible') again()
    }
    window.addEventListener('focus', again)
    document.addEventListener('visibilitychange', onVisible)
    let homeActive = true
    const tabs = window.aiOfficeTabs
    const offTabs =
      typeof tabs?.onChanged === 'function'
        ? tabs.onChanged((list) => {
            const active = list.some((item) => item.kind === 'home' && item.active)
            if (active && !homeActive) again()
            homeActive = active
          })
        : () => undefined
    const offChanges = subscribeProjectChanges(bridge, (event) => {
      if (event.projectId !== projectId) return
      again()
      if (event.part === 'chats' && tabRef.current === 'chats') void loadChatsRef.current()
    })
    return () => {
      window.removeEventListener('focus', again)
      document.removeEventListener('visibilitychange', onVisible)
      offTabs()
      offChanges()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one project per mount (keyed)
  }, [])

  const loadFiles = async (offset: number): Promise<void> => {
    try {
      const scope = await bridge.openScope({ projectId })
      try {
        const page = await bridge.listFiles({ scope, offset, limit: FILES_PAGE })
        setFiles((prev) => ({
          list: offset === 0 || !prev ? page.files : [...prev.list, ...page.files],
          total: page.total,
        }))
        setFilesFailed(false)
      } finally {
        void bridge.closeScope({ scope }).catch(() => undefined)
      }
    } catch {
      setFilesFailed(true)
    }
    try {
      if (offset === 0) setIgnored(await bridge.listIgnoredFiles({ projectId }))
    } catch {
      setIgnored([])
    }
  }

  const loadChats = async (): Promise<void> => {
    try {
      setChats((await bridge.listChats({ projectId })).chats)
    } catch {
      setChats([])
      setListNote({ from: 'screen', key: 'loadFailed', tone: 'warning' })
    }
  }
  const loadChatsRef = useRef(loadChats)
  loadChatsRef.current = loadChats

  useEffect(() => {
    if (tab === 'files') void loadFiles(0)
    if (tab === 'chats') void loadChats()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read when the tab opens
  }, [tab])

  if (!detail) {
    return (
      <>
        <BackButton lang={lang} onBack={props.onBack} />
        {loadFailed && <NoteLine lang={lang} note={{ from: 'screen', key: 'loadFailed' }} />}
      </>
    )
  }

  const project = detail.project
  const written = (result: { status: 'ok' } | { status: 'unwritable' }, saved?: Note) =>
    result.status === 'ok'
      ? (saved ?? null)
      : ({ from: 'screen', key: 'saveUnwritable', tone: 'warning' } as Note)

  const saveName = async () => {
    const name = nameDraft.normalize('NFC').trim()
    if (!name || name === project.name) return
    try {
      const result = await bridge.renameProject({ projectId, name })
      if (result.status === 'ok') nameBaseRef.current = nameDraftRef.current
      setHeadNote(written(result))
      await reload()
      props.onChanged()
    } catch {
      setHeadNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    }
  }

  const chooseUseTrust = async () => {
    try {
      await bridge.decideTrust({ projectId, decision: 'use' })
    } catch {
      setHeadNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    }
    await reload()
  }

  const retry = async () => {
    try {
      const result = await bridge.retryUnwritable({ projectId })
      setHeadNote(written(result))
    } catch {
      setHeadNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    }
    await reload()
    props.onChanged()
  }

  const setSwitch = async (patch: { memoryEnabled?: boolean; readAgentsFiles?: boolean }) => {
    try {
      const settings = await bridge.setSettings({ projectId, settings: patch })
      setDetail((prev) => (prev ? { ...prev, settings } : prev))
    } catch {
      setHeadNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    }
  }

  /**
   * Reads the project again before a save: true when the file is still what
   * the draft was loaded from. Otherwise the screen asks first ([Reload] /
   * [Save anyway]) and the save waits.
   */
  const unchangedSince = async (
    part: 'instructions' | 'memory',
    base: string,
  ): Promise<boolean> => {
    const now = await bridge.getProjectDetail({ projectId })
    setDetail(now)
    if ((part === 'instructions' ? now.instructions : now.memory) === base) return true
    setConflict(part)
    return false
  }

  const saveInstructions = async (overwrite = false) => {
    const text = instructionsDraft
    try {
      if (!overwrite && !(await unchangedSince('instructions', instructionsBaseRef.current))) {
        return
      }
      setConflict(null)
      const result = await bridge.saveInstructions({ projectId, text })
      setInstructionsNote(written(result, { from: 'screen', key: 'saved' }))
      if (result.status === 'ok') {
        instructionsBaseRef.current = text
        await reload()
      }
    } catch {
      setInstructionsNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    }
  }

  /** [Reload] after a conflict: the file's text replaces the draft */
  const reloadConflict = async () => {
    const part = conflict
    setConflict(null)
    const next = await reload(part === 'instructions')
    if (next && part === 'memory') {
      memoryBaseRef.current = next.memory
      setMemoryEditing(next.memory)
    }
  }

  const removeMemory = async (entry: string) => {
    try {
      const result = await bridge.editMemory({ projectId, change: { op: 'remove', text: entry } })
      setMemoryNote(
        result.status === 'refused' && result.reason === 'unwritable'
          ? { from: 'screen', key: 'saveUnwritable', tone: 'warning' }
          : null,
      )
    } catch {
      setMemoryNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    }
    await reload()
  }

  const saveMemory = async (overwrite = false) => {
    if (memoryEditing === null) return
    try {
      if (!overwrite && !(await unchangedSince('memory', memoryBaseRef.current))) return
      setConflict(null)
      const result = await bridge.saveMemory({ projectId, text: memoryEditing })
      setMemoryNote(written(result, { from: 'screen', key: 'saved' }))
      if (result.status === 'ok') setMemoryEditing(null)
    } catch {
      setMemoryNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    }
    await reload()
  }

  /** the line a save shows instead of writing over a file changed elsewhere */
  const conflictLine = (part: 'instructions' | 'memory') =>
    conflict === part && (
      <NoteLine lang={lang} note={{ from: 'screen', key: 'changedOutside', tone: 'warning' }}>
        <button type="button" className="projects-small" onClick={() => void reloadConflict()}>
          {s('reloadFile')}
        </button>
        <button
          type="button"
          className="projects-small"
          onClick={() => void (part === 'instructions' ? saveInstructions(true) : saveMemory(true))}
        >
          {s('saveAnyway')}
        </button>
      </NoteLine>
    )

  // "[Tidy up]": one request, only on this click, through the same send gate as a chat
  const consolidate = async () => {
    if (consolidation?.kind === 'running') return
    setMemoryNote(null)
    if (props.noticeDue) {
      props.onNoticeNeeded?.()
      setConsolidation({ kind: 'note', note: { from: 'screen', key: 'consolidateNotice' } })
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setConsolidation({ kind: 'running' })
    let settings = props.aiSettings
    try {
      const read = props.readSettings ?? (() => window.aiOffice.aiGetSettings())
      settings = await read()
    } catch {
      // the settings as last read
    }
    const make = props.createTransport ?? defaultTransport
    const transport = make(
      () => settings as AiSettings,
      () => langRef.current,
    )
    const run = props.consolidate ?? consolidateProjectMemory
    let result: ConsolidateProjectMemoryResult
    try {
      result = await run({
        bridge,
        projectId,
        transport,
        gate: () => aiSendGate(settings, props.statuses),
        signal: controller.signal,
      })
    } catch (err) {
      result = { status: 'failed', error: err instanceof Error ? err.message : String(err) }
    }
    if (abortRef.current === controller) abortRef.current = null
    setConsolidation(consolidationView(result, props.onNoticeNeeded))
    await reload()
  }

  const undoConsolidation = async (backupName: string) => {
    try {
      const result = await undoProjectMemoryConsolidation(bridge, projectId, backupName)
      setConsolidation({
        kind: 'note',
        note:
          result.status === 'ok'
            ? { from: 'screen', key: 'consolidateUndone' }
            : result.status === 'unwritable'
              ? { from: 'screen', key: 'saveUnwritable', tone: 'warning' }
              : { from: 'screen', key: 'undoFailed', tone: 'warning' },
      })
    } catch {
      setConsolidation({
        kind: 'note',
        note: { from: 'screen', key: 'undoFailed', tone: 'warning' },
      })
    }
    await reload()
  }

  const hideFromAi = async (relPath: string) => {
    try {
      const result = await bridge.addIgnore({ projectId, relPath })
      setListNote(written(result))
    } catch {
      setListNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    }
    await loadFiles(0)
  }

  const restoreToAi = async (relPath: string) => {
    try {
      const result = await bridge.removeIgnore({ projectId, relPath })
      setListNote(written(result))
    } catch {
      setListNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    }
    await loadFiles(0)
  }

  const openChat = async (chat: ProjectChatListItem) => {
    const ref: ProjectChatRef = { projectId, chatId: chat.id }
    // Main opens the chat in its latest document's editor, or hands it to this
    // home window (a home chat, no document, one that cannot be opened). That
    // hand-over arrives before the call returns while this window listens.
    let handedHere = false
    const stop =
      typeof bridge.onOpenChat === 'function'
        ? bridge.onOpenChat((event) => {
            if (event.projectId === ref.projectId && event.chatId === ref.chatId) handedHere = true
          })
        : () => undefined
    try {
      await bridge.openDocumentChat(ref)
      // the ask panel shows the chat; it opens it from the request
      if (handedHere || chat.lastEditor === 'home') props.onOpenHomeAsk(ref)
    } catch {
      setListNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    } finally {
      stop()
    }
  }

  const renameChat = async () => {
    if (!renaming) return
    const title = renaming.title.trim()
    setRenaming(null)
    if (!title) return
    try {
      const result = await bridge.renameChat({ projectId, chatId: renaming.id, title })
      setListNote(written(result))
    } catch {
      setListNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    }
    await loadChats()
  }

  const deleteChat = async (chat: ProjectChatListItem) => {
    setConfirmDelete(null)
    try {
      const result = await bridge.deleteChat({ projectId, chatId: chat.id })
      setListNote(written(result))
    } catch {
      setListNote({ from: 'screen', key: 'actionFailed', tone: 'warning' })
    }
    await loadChats()
  }

  const onTabKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const dir = document.documentElement.dir === 'rtl' ? -step : step
    const next = TABS[(TABS.indexOf(tab) + dir + TABS.length) % TABS.length]!
    setTab(next)
    tabRefs.current[next]?.focus()
  }

  const trust = detail.trust
  const now = Date.now()
  const chatTitle = (chat: ProjectChatListItem) => chat.title.trim() || p('untitledChat')

  return (
    <>
      <BackButton lang={lang} onBack={props.onBack} />
      <header className="projects-detail-head">
        <div className="projects-name-row">
          <label className="projects-field projects-name-field">
            <span className="projects-field-label">{s('projectNameLabel')}</span>
            <input
              value={nameDraft}
              maxLength={128}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void saveName()
                } else if (event.key === 'Escape') {
                  setNameDraft(project.name)
                }
              }}
            />
          </label>
          <button
            type="button"
            className="projects-ghost"
            disabled={!nameDraft.trim() || nameDraft.trim() === project.name}
            onClick={() => void saveName()}
          >
            {s('saveName')}
          </button>
        </div>
        <p className="projects-hint">{s('renameHint')}</p>
        <div className="projects-path-row">
          <span className="projects-path" title={project.path}>
            {project.path}
          </span>
          {!project.missing && (
            <button
              type="button"
              className="projects-small"
              onClick={() => void bridge.openInFileManager({ projectId }).catch(() => undefined)}
            >
              {IS_MAC ? s('openInFinder') : s('openInExplorer')}
            </button>
          )}
        </div>
        <div className="projects-trust" data-trust={trust}>
          <span className="projects-trust-state" role="status">
            {s('trustStatus', {
              state:
                trust === 'use'
                  ? s('trustUse')
                  : trust === 'without'
                    ? s('trustWithout')
                    : s('trustUnconfirmed'),
            })}
          </span>
          {trust !== 'use' && (
            <button type="button" className="projects-small" onClick={() => void chooseUseTrust()}>
              {s('trustUseButton')}
            </button>
          )}
        </div>
        {trust === 'without' && <p className="projects-hint">{s('trustWithoutDesc')}</p>}
        {project.missing && (
          <NoteLine lang={lang} note={{ from: 'screen', key: 'missingNote', tone: 'warning' }}>
            <button type="button" className="projects-small" onClick={props.relocate}>
              {s('relocate')}
            </button>
          </NoteLine>
        )}
        {project.unwritable && (
          <NoteLine lang={lang} note={{ from: 'panel', key: 'unwritable', tone: 'warning' }}>
            <button type="button" className="projects-small" onClick={() => void retry()}>
              {s('retry')}
            </button>
          </NoteLine>
        )}
        {headNote && <NoteLine lang={lang} note={headNote} />}
      </header>

      <div
        className="projects-tabs"
        role="tablist"
        aria-label={s('tabsLabel')}
        onKeyDown={onTabKey}
      >
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`projects-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`projects-pane-${id}`}
            tabIndex={tab === id ? 0 : -1}
            ref={(el) => {
              tabRefs.current[id] = el
            }}
            className={`projects-tab${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            {s(TAB_KEY[id])}
          </button>
        ))}
      </div>

      <section
        className="projects-pane"
        role="tabpanel"
        id={`projects-pane-${tab}`}
        aria-labelledby={`projects-tab-${tab}`}
        data-section={tab}
      >
        {tab === 'instructions' && (
          <>
            <p className="projects-desc">{s('instructionsDesc')}</p>
            {trust === 'without' && <p className="projects-hint">{s('withoutNotSent')}</p>}
            <textarea
              className="projects-textarea"
              aria-label={s('tabInstructions')}
              value={instructionsDraft}
              placeholder={s('instructionsPlaceholder')}
              onChange={(event) => {
                setInstructionsDraft(event.target.value)
                setInstructionsNote(null)
              }}
            />
            {conflictLine('instructions')}
            <div className="projects-buttons">
              <button
                type="button"
                className="projects-primary"
                disabled={instructionsDraft === detail.instructions}
                onClick={() => void saveInstructions()}
              >
                {s('save')}
              </button>
            </div>
            {instructionsNote && <NoteLine lang={lang} note={instructionsNote} />}
            {(detail.agents !== null || detail.claude !== null) && (
              <div className="projects-also">
                <h3 className="projects-sub-title">{s('alsoRead')}</h3>
                <label className="projects-switch">
                  <input
                    type="checkbox"
                    checked={detail.settings.readAgentsFiles}
                    onChange={(event) => void setSwitch({ readAgentsFiles: event.target.checked })}
                  />
                  <span>{s('readAgentsFiles')}</span>
                </label>
                {detail.agents !== null && (
                  <figure className="projects-file-text">
                    <figcaption>AGENTS.md</figcaption>
                    <pre>{detail.agents}</pre>
                  </figure>
                )}
                {detail.claude !== null && (
                  <figure className="projects-file-text">
                    <figcaption>CLAUDE.md</figcaption>
                    <pre>{detail.claude}</pre>
                  </figure>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'memory' && (
          <>
            <p className="projects-desc">{s('memoryDesc')}</p>
            <label className="projects-switch">
              <input
                type="checkbox"
                checked={detail.settings.memoryEnabled}
                onChange={(event) => void setSwitch({ memoryEnabled: event.target.checked })}
              />
              <span>{s('memoryEnabled')}</span>
            </label>
            <p className="projects-hint">{s('memoryEnabledDesc')}</p>
            {trust === 'without' && <p className="projects-hint">{s('withoutNotSent')}</p>}
            <p className="projects-length">
              {s('memoryLength', {
                count: detail.memoryEntries.length,
                chars: detail.memoryChars,
              })}
            </p>
            {detail.memoryConflictCopies.length > 0 && (
              <NoteLine
                lang={lang}
                note={{
                  from: 'screen',
                  key: 'memoryConflict',
                  params: { names: detail.memoryConflictCopies.join(', ') },
                  tone: 'warning',
                }}
              />
            )}
            {memoryEditing === null ? (
              <>
                {detail.memoryEntries.length === 0 ? (
                  <p className="projects-empty">{s('memoryEmpty')}</p>
                ) : (
                  <ul className="projects-list projects-memory-list">
                    {detail.memoryEntries.map((entry, index) => (
                      <li key={`${index}:${entry}`} className="projects-row">
                        <span className="projects-memory-text">{entry}</span>
                        <div className="projects-row-actions">
                          <button
                            type="button"
                            className="projects-small"
                            aria-label={s('removeMemoryAria', { text: entry })}
                            onClick={() => void removeMemory(entry)}
                          >
                            {p('removeMemory')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="projects-buttons">
                  <button
                    type="button"
                    className="projects-ghost"
                    onClick={() => {
                      setMemoryNote(null)
                      setConflict(null)
                      memoryBaseRef.current = detail.memory
                      setMemoryEditing(detail.memory)
                    }}
                  >
                    {s('memoryEditAll')}
                  </button>
                  <button
                    type="button"
                    className="projects-ghost"
                    disabled={
                      consolidation?.kind === 'running' || detail.memoryEntries.length === 0
                    }
                    onClick={() => void consolidate()}
                  >
                    {p('consolidate')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <textarea
                  className="projects-textarea"
                  aria-label={s('memoryEditLabel')}
                  autoFocus
                  value={memoryEditing}
                  onChange={(event) => setMemoryEditing(event.target.value)}
                />
                {conflictLine('memory')}
                <div className="projects-buttons">
                  <button
                    type="button"
                    className="projects-primary"
                    onClick={() => void saveMemory()}
                  >
                    {s('save')}
                  </button>
                  <button
                    type="button"
                    className="projects-ghost"
                    onClick={() => {
                      setConflict(null)
                      setMemoryEditing(null)
                    }}
                  >
                    {s('cancel')}
                  </button>
                </div>
              </>
            )}
            {memoryNote && <NoteLine lang={lang} note={memoryNote} />}
            {consolidation?.kind === 'running' && (
              <p className="projects-note" role="status">
                <span>{s('consolidating')}</span>
                <button
                  type="button"
                  className="projects-small"
                  onClick={() => abortRef.current?.abort()}
                >
                  {s('stop')}
                </button>
              </p>
            )}
            {consolidation?.kind === 'done' && (
              <p className="projects-note" role="status">
                <span>
                  {projectConsolidatedText(lang, consolidation.before, consolidation.after)}
                </span>
                <button
                  type="button"
                  className="projects-small"
                  onClick={() => void undoConsolidation(consolidation.backupName)}
                >
                  {p('undo')}
                </button>
              </p>
            )}
            {consolidation?.kind === 'note' && (
              <NoteLine lang={lang} note={consolidation.note}>
                {consolidation.detail && (
                  <span className="projects-note-detail">{consolidation.detail}</span>
                )}
                {consolidation.settings && (
                  <button type="button" className="projects-small" onClick={props.onOpenAiSettings}>
                    {s('openAiSettings')}
                  </button>
                )}
              </NoteLine>
            )}
          </>
        )}

        {tab === 'files' && (
          <>
            <p className="projects-desc">{s('filesDesc')}</p>
            {listNote && <NoteLine lang={lang} note={listNote} />}
            {filesFailed && (
              <NoteLine
                lang={lang}
                note={{ from: 'screen', key: 'filesLoadFailed', tone: 'warning' }}
              />
            )}
            {files && <p className="projects-length">{s('filesCount', { count: files.total })}</p>}
            {files && files.list.length === 0 && !filesFailed && (
              <p className="projects-empty">{s('filesEmpty')}</p>
            )}
            {files && files.list.length > 0 && (
              <ul className="projects-list projects-file-list">
                {files.list.map((file) => (
                  <li key={file.relPath} className="projects-row" data-rel-path={file.relPath}>
                    <button
                      type="button"
                      className="projects-file-name projects-file-open"
                      title={file.relPath}
                      aria-label={s('openFileAria', { name: file.relPath })}
                      onClick={() => props.onOpenPath(projectFilePath(project.path, file.relPath))}
                    >
                      {file.relPath}
                    </button>
                    <span className="projects-file-meta">
                      {file.ext ? file.ext.toUpperCase() : s('noExt')}
                    </span>
                    <span className="projects-file-meta">{formatSize(file.sizeBytes)}</span>
                    {file.cloudOnly && (
                      <span className="projects-mark" title={s('notOnPcTitle')}>
                        {s('notOnPc')}
                      </span>
                    )}
                    <div className="projects-row-actions">
                      <button
                        type="button"
                        className="projects-small"
                        aria-label={s('hideFromAiAria', { name: file.relPath })}
                        onClick={() => void hideFromAi(file.relPath)}
                      >
                        {s('hideFromAi')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {files && files.list.length < files.total && (
              <div className="projects-buttons">
                <button
                  type="button"
                  className="projects-ghost"
                  onClick={() => void loadFiles(files.list.length)}
                >
                  {s('loadMore')}
                </button>
              </div>
            )}
            <h3 className="projects-sub-title">{s('ignoredTitle')}</h3>
            <p className="projects-hint">{s('ignoredDesc')}</p>
            {ignored && ignored.length === 0 && (
              <p className="projects-empty">{s('ignoredEmpty')}</p>
            )}
            {ignored && ignored.length > 0 && (
              <ul className="projects-list projects-ignored-list">
                {ignored.map((file) => (
                  <li key={file.relPath} className="projects-row" data-rel-path={file.relPath}>
                    <span className="projects-file-name" title={file.relPath}>
                      {file.relPath}
                    </span>
                    <span className="projects-file-meta">
                      {file.ext ? file.ext.toUpperCase() : s('noExt')}
                    </span>
                    <span className="projects-file-meta">{formatSize(file.sizeBytes)}</span>
                    {file.cloudOnly && (
                      <span className="projects-mark" title={s('notOnPcTitle')}>
                        {s('notOnPc')}
                      </span>
                    )}
                    <div className="projects-row-actions">
                      <button
                        type="button"
                        className="projects-small"
                        aria-label={s('restoreAria', { name: file.relPath })}
                        onClick={() => void restoreToAi(file.relPath)}
                      >
                        {p('undo')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === 'chats' && (
          <>
            <p className="projects-desc">{s('chatsDesc')}</p>
            {listNote && <NoteLine lang={lang} note={listNote} />}
            {chats && chats.length === 0 && <p className="projects-empty">{p('noChats')}</p>}
            {chats && chats.length > 0 && (
              <ul className="projects-list projects-chat-list">
                {chats.map((chat) => (
                  <li key={chat.id} className="projects-row" data-chat-id={chat.id}>
                    {renaming?.id === chat.id ? (
                      <input
                        className="projects-inline-input"
                        aria-label={p('renameInputAria')}
                        autoFocus
                        value={renaming.title}
                        onChange={(event) =>
                          setRenaming({ id: chat.id, title: event.target.value })
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            void renameChat()
                          } else if (event.key === 'Escape') {
                            event.preventDefault()
                            setRenaming(null)
                          }
                        }}
                        onBlur={() => void renameChat()}
                      />
                    ) : (
                      <button
                        type="button"
                        className="projects-row-main"
                        onClick={() => void openChat(chat)}
                      >
                        <span className="projects-row-name">{chatTitle(chat)}</span>
                        <span
                          className="projects-file-meta"
                          title={projectFullTime(chat.updatedAt, lang)}
                        >
                          {projectRelativeTime(chat.updatedAt, now, lang)}
                        </span>
                        <span
                          className="projects-file-meta"
                          title={p('lastEditorTitle', {
                            editor: projectEditorLabel(lang, chat.lastEditor),
                          })}
                        >
                          {projectEditorLabel(lang, chat.lastEditor)}
                        </span>
                        {chat.foreign && (
                          <span className="projects-mark" title={p('otherPcTitle')}>
                            {p('otherPc')}
                          </span>
                        )}
                      </button>
                    )}
                    <div className="projects-row-actions">
                      <button
                        type="button"
                        className="projects-small"
                        aria-label={`${p('renameChat')}: ${chatTitle(chat)}`}
                        onClick={() => setRenaming({ id: chat.id, title: chat.title })}
                      >
                        {p('renameChat')}
                      </button>
                      <button
                        type="button"
                        className="projects-small"
                        title={p('deleteChatTitle')}
                        aria-label={`${p('deleteChat')}: ${chatTitle(chat)}`}
                        onClick={() => setConfirmDelete(chat)}
                      >
                        {p('deleteChat')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={p('deleteChat')}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setConfirmDelete(null)
            }}
          >
            <p>{p('deleteConfirm', { title: chatTitle(confirmDelete) })}</p>
            <div className="modal-buttons">
              <button
                type="button"
                className="btn btn-secondary"
                autoFocus
                onClick={() => setConfirmDelete(null)}
              >
                {s('cancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void deleteChat(confirmDelete)}
              >
                {p('deleteChat')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function BackButton({ lang, onBack }: { lang: Lang; onBack: () => void }) {
  return (
    <button type="button" className="projects-back" onClick={onBack}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d="M8.5 3L4.5 7l4 4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>{projectsText(lang, 'backToList')}</span>
    </button>
  )
}

/** What a consolidation result shows under the memory list */
function consolidationView(
  result: ConsolidateProjectMemoryResult,
  onNoticeNeeded: (() => void) | undefined,
): ConsolidationView {
  const note = (key: ProjectsStringKey, tone?: 'warning'): Note =>
    tone ? { from: 'screen', key, tone } : { from: 'screen', key }
  switch (result.status) {
    case 'ok':
      return {
        kind: 'done',
        before: result.before,
        after: result.after,
        backupName: result.backupName,
      }
    case 'not-ready':
      if (result.gate.kind === 'connect') {
        return { kind: 'note', note: note('consolidateConnect', 'warning'), settings: true }
      }
      if (result.gate.kind === 'notice') {
        onNoticeNeeded?.()
        return { kind: 'note', note: note('consolidateNotice') }
      }
      return { kind: 'note', note: note('consolidateChecking') }
    case 'nothing':
      return { kind: 'note', note: note('consolidateNothing') }
    case 'without':
      return { kind: 'note', note: note('consolidateWithout') }
    case 'stopped':
      return { kind: 'note', note: note('consolidateStopped') }
    case 'unwritable':
      return { kind: 'note', note: { from: 'panel', key: 'unwritable', tone: 'warning' } }
    case 'unavailable':
    case 'failed':
      return {
        kind: 'note',
        note: note('consolidateFailed', 'warning'),
        ...(result.status === 'failed' && result.error ? { detail: result.error } : {}),
      }
  }
}
