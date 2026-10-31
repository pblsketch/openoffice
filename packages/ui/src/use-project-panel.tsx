import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AgentTransport } from '@genoffice/agent-core'
import type { Lang } from '@genoffice/i18n'
import type {
  AddFolderResult,
  CreateProjectResult,
  ProjectEditor,
  ProjectFolderApi,
  ProjectId,
  ProjectListItem,
  ProjectNotice,
} from '@genoffice/project-store'
import type { AiSendGate } from './ai-send-gate'
import {
  consolidateProjectMemory,
  undoProjectMemoryConsolidation,
} from './project-memory-consolidate'
import {
  projectAddProblem,
  projectPrepareProblem,
  type ProjectProblem,
} from './project-panel-model'
import {
  memoryLineGone,
  memoryLinesOf,
  windowProjectFolderBridge,
  type ProjectMemoryLine,
  type ProjectRunPrepared,
} from './project-skill'
import {
  useProjectChat,
  type LegacyChatApi,
  type ProjectChat,
  type ProjectChatEntry,
  type ProjectChatLoop,
  type ProjectChatOpened,
} from './use-project-chat'
import { ProjectChatMenu } from './ProjectChatMenu'
import {
  memoryRemoveOutcome,
  ProjectFolderHintLine,
  ProjectMemoryConsolidatedLine,
  ProjectMemoryEventLine,
  type ProjectMemoryRemoveOutcome,
  ProjectNoticeLine,
  ProjectNoticeList,
  ProjectProblemLine,
  ProjectToolSummaryLine,
} from './ProjectNotices'
import { ProjectPicker } from './ProjectPicker'

/**
 * The project folder parts of an editor's AI panel (spec 5.1-5.7), shared by
 * every editor that does not wire them itself: the project chip under the
 * input, the chat menu in the header, the hint, notice and problem lines, and
 * the memory and other-editor lines under a message.
 *
 * The chat logic is `useProjectChat`; this wires its state to the shared
 * components and to the window's `projectFolderApi`. Without that bridge (a
 * test, an older preload) every part is null and every call falls through,
 * so the panel keeps its per-document chat exactly as before (spec 7.6).
 */

/** What "[Tidy up]" sends with */
export interface ProjectConsolidationRoute {
  transport: AgentTransport
  /** the send gate right now; the request goes only when it answers `run` */
  gate: () => AiSendGate
}

export interface ProjectPanelOptions {
  editor: ProjectEditor
  lang: Lang
  /** a reply runs: the chip and the chat menu are locked */
  busy: boolean
  /** the panel's loop (it may not exist yet) */
  loop: () => ProjectChatLoop | null | undefined
  /**
   * Replace the transcript and the loop's history with this chat (or go back
   * to the document's). `initial`: the panel just started; a send made
   * meanwhile (a request handed over to a new tab) may already be running.
   */
  onOpen: (opened: ProjectChatOpened, initial: boolean) => void
  /**
   * Another window recorded messages in the open chat: show them now (spec
   * 5.3.3). `running`: this panel's reply is on its way; `placeRemoteEntries`
   * puts them in front of it. The model gets them with the next request.
   */
  onRemoteMessages: (entries: ProjectChatEntry[], running: boolean) => void
  /** the panel's "new chat" (the chat menu offers it too) */
  onNewChat: () => void
  /**
   * What "[Tidy up]" sends with; null when nothing can be sent now (the
   * caller showed what holds it). The panel's send gate stays the gate.
   */
  consolidation: () =>
    | ProjectConsolidationRoute
    | null
    | undefined
    | Promise<ProjectConsolidationRoute | null | undefined>
  /** tests inject one; the default is the window's `projectFolderApi` */
  bridge?: ProjectFolderApi | null | undefined
  /** tests inject one; the default is the window's `projectApi` */
  legacyApi?: LegacyChatApi | null | undefined
}

/** A tool record as a panel keeps it */
export interface ProjectToolRecord {
  readonly name?: string | undefined
  readonly output?: string | undefined
  readonly isError?: boolean | undefined
}

/** What a message carries for the project lines under it */
export interface ProjectMessageParts {
  readonly tools?: readonly ProjectToolRecord[] | undefined
  /** the memory lines a reopened project chat gave the message */
  readonly memory?: readonly ProjectMemoryLine[] | undefined
  readonly otherEditorTools?: ProjectChatEntry['otherEditorTools'] | undefined
}

export interface ProjectPanel {
  readonly chat: ProjectChat
  /**
   * Await right before `loop.run` (after the panel's send gate): feeds other
   * windows' messages into the loop, reads the project context for this
   * request and shows its notices, or a line saying it went without them.
   */
  prepareSend(): Promise<ProjectRunPrepared>
  /** after the run (done, stopped or failed) */
  finishSend(): void
  /** the chat menu for the panel header; null without a chosen project */
  readonly chatMenu: ReactNode
  /** the project chip for the row under the input; null without the bridge */
  readonly picker: ReactNode
  /** "this document is in the '…' project folder [Use]"; null when there is none */
  readonly hint: ReactNode
  /** unwritable, context, problem and tidied-up lines; null when there is none */
  readonly notices: ReactNode
  /** the other-editor summary and the memory lines of one message */
  messageParts(parts: ProjectMessageParts): ReactNode
}

interface ShownNotices {
  readonly projectId: ProjectId | null
  readonly list: readonly ProjectNotice[]
}

interface ShownProblem {
  /** the project it is about; null: whatever is chosen (a refused folder) */
  readonly projectId: ProjectId | null
  readonly problem: ProjectProblem
}

interface Consolidated {
  readonly projectId: ProjectId
  readonly before: number
  readonly after: number
  readonly backupName: string
}

const NO_NOTICES: ShownNotices = { projectId: null, list: [] }

const memoryKey = (line: ProjectMemoryLine): string => `${line.kind}\n${line.text}`

const baseName = (fileRef: string | undefined): string | undefined =>
  fileRef ? (fileRef.split(/[\\/]/).filter(Boolean).at(-1) ?? fileRef) : undefined

export function useProjectPanel(options: ProjectPanelOptions): ProjectPanel {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const { lang, busy } = options
  const [bridge] = useState(() =>
    options.bridge !== undefined ? options.bridge : windowProjectFolderBridge(),
  )
  const busyRef = useRef(busy)
  busyRef.current = busy
  const [notices, setNotices] = useState<ShownNotices>(NO_NOTICES)
  const [problem, setProblem] = useState<ShownProblem | null>(null)
  const [consolidated, setConsolidated] = useState<Consolidated | null>(null)
  const [consolidating, setConsolidating] = useState(false)
  const [hintDismissed, setHintDismissed] = useState(false)
  const [forgotten, setForgotten] = useState<ReadonlySet<string>>(() => new Set())
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [defaultParentFolder, setDefaultParentFolder] = useState<string | undefined>(undefined)
  const chatRef = useRef<ProjectChat | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const chat = useProjectChat({
    editor: options.editor,
    loop: options.loop,
    bridge,
    ...(options.legacyApi !== undefined ? { legacyApi: options.legacyApi } : {}),
    onOpen: (opened) => {
      setForgotten(new Set())
      setProblem(null)
      // the selection is read once at the start; it opens before `ready`
      optionsRef.current.onOpen(opened, !chatRef.current?.ready)
    },
    // shown at once; the chat hook feeds the model once no reply runs (spec 5.3.3)
    onRemoteMessage: (entry) => optionsRef.current.onRemoteMessages([entry], busyRef.current),
  })
  chatRef.current = chat

  const refreshProjects = useCallback(() => {
    if (!bridge) return
    bridge.listProjects().then(
      (list) => {
        if (mountedRef.current) setProjects(list)
      },
      () => {},
    )
    bridge.getDefaultParentFolder().then(
      (folder) => {
        if (mountedRef.current) setDefaultParentFolder(folder)
      },
      () => {},
    )
  }, [bridge])

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  // a new hint (another document, another folder, another choice) shows again
  useEffect(() => setHintDismissed(false), [chat.hint, chat.projectId])

  const showProblem = (next: ProjectProblem | null, projectId: ProjectId | null = null) => {
    if (mountedRef.current) setProblem(next ? { projectId, problem: next } : null)
  }

  /** a folder was added, relocated, adopted or a project created: list it and choose it */
  const adopt = (result: AddFolderResult | CreateProjectResult): void => {
    refreshProjects()
    if (result.status !== 'added' && result.status !== 'created') {
      showProblem(projectAddProblem(result))
      return
    }
    showProblem(null)
    // one-time notices of the addition (a sync folder) show once it is chosen
    if (result.status === 'added' && result.notices.length > 0) {
      setNotices({ projectId: result.project.id, list: result.notices })
    }
    void chatRef.current?.selectProject(result.project.id)
  }

  /** a bridge call the person made failed: say so instead of doing nothing */
  const failed = (): void => {
    refreshProjects()
    showProblem({ kind: 'action-failed' })
  }

  const prepareSend = async (): Promise<ProjectRunPrepared> => {
    const prepared = await chat.prepareSend()
    if (!mountedRef.current) return prepared
    if (prepared.status === 'none') return prepared
    if (prepared.status !== 'ok') {
      // the request goes without the project: say it, and drop what the last context said
      const projectId = chatRef.current?.projectId ?? null
      setNotices((prev) =>
        prev.projectId === projectId
          ? { projectId, list: prev.list.filter((n) => n.kind === 'sync-folder') }
          : NO_NOTICES,
      )
      showProblem(projectPrepareProblem(prepared), projectId)
      return prepared
    }
    const projectId = prepared.context.projectId
    setProblem((prev) => (prev?.problem.kind === 'context' ? null : prev))
    // "unwritable" has its own line; a sync-folder notice stays until it is closed
    const fresh = prepared.notices.filter((n) => n.kind !== 'unwritable')
    if (prepared.notices.some((n) => n.kind === 'unwritable')) chat.markUnwritable()
    setNotices((prev) => {
      const kept =
        prev.projectId === projectId ? prev.list.filter((n) => n.kind === 'sync-folder') : []
      const added = fresh.filter((n) => n.kind !== 'sync-folder' || kept.length === 0)
      return { projectId, list: [...kept, ...added] }
    })
    return prepared
  }

  const finishSend = (): void => {
    void chat.finishSend()
  }

  const consolidate = async (): Promise<void> => {
    const projectId = chatRef.current?.projectId
    if (!projectId || consolidating) return
    setConsolidating(true)
    try {
      const route = await optionsRef.current.consolidation()
      if (!route || !mountedRef.current) return
      const result = await consolidateProjectMemory({
        ...(bridge ? { bridge } : {}),
        projectId,
        transport: route.transport,
        gate: route.gate,
      })
      if (!mountedRef.current) return
      if (result.status === 'ok') {
        setConsolidated({
          projectId,
          before: result.before,
          after: result.after,
          backupName: result.backupName,
        })
        setNotices((prev) => ({
          ...prev,
          list: prev.list.filter((n) => n.kind !== 'memory-long'),
        }))
      } else if (result.status === 'unwritable') {
        chatRef.current?.markUnwritable()
      } else if (result.status === 'failed') {
        showProblem({ kind: 'consolidate-failed' }, projectId)
      }
    } catch {
      showProblem({ kind: 'consolidate-failed' }, projectId)
    } finally {
      if (mountedRef.current) setConsolidating(false)
    }
  }

  const undoConsolidation = async (): Promise<void> => {
    const done = consolidated
    if (!bridge || !done) return
    try {
      const result = await undoProjectMemoryConsolidation(bridge, done.projectId, done.backupName)
      if (!mountedRef.current) return
      if (result.status === 'ok') setConsolidated(null)
      else if (result.status === 'unwritable') chatRef.current?.markUnwritable()
    } catch {
      showProblem({ kind: 'action-failed' }, done.projectId)
    }
  }

  const forget = async (line: ProjectMemoryLine): Promise<ProjectMemoryRemoveOutcome> => {
    const result = await chat.forgetMemory(line).catch(() => null)
    const outcome = memoryRemoveOutcome(result)
    // an entry no longer in the memory is as good as removed
    if (outcome !== 'failed' && mountedRef.current) {
      setForgotten((prev) => new Set(prev).add(memoryKey(line)))
    }
    return outcome
  }

  const projectId = chat.projectId
  const active = chat.chat

  const chatMenu: ReactNode =
    projectId && active ? (
      <ProjectChatMenu
        lang={lang}
        chats={chat.chats}
        currentChatId={active.kind === 'project' && !active.isNew ? active.chatId : null}
        currentTitle={active.kind === 'project' && active.title ? active.title : undefined}
        legacy={chat.legacy}
        legacyActive={active.kind === 'legacy'}
        disabled={busy}
        onOpen={() => void chat.refreshChats()}
        onSelect={(chatId) => void chat.openChat(chatId)}
        onNewChat={() => optionsRef.current.onNewChat()}
        onRename={(chatId, title) => void chat.renameChat(chatId, title).catch(failed)}
        onDelete={(chatId) => void chat.deleteChat(chatId).catch(failed)}
        onSelectLegacy={() => void chat.openLegacy()}
      />
    ) : null

  const picker: ReactNode =
    chat.available && bridge ? (
      <ProjectPicker
        lang={lang}
        projects={projects}
        selectedId={projectId}
        disabled={busy || !chat.ready}
        onOpen={refreshProjects}
        defaultParentFolder={defaultParentFolder}
        onSelect={(id) => {
          showProblem(null)
          void chat.selectProject(id)
        }}
        onCreate={(name, { otherPlace }) =>
          void bridge.createProject({ name, otherPlace }).then(adopt, failed)
        }
        onAddFolder={() => void bridge.addFolder().then(adopt, failed)}
        onRelocate={(id) => void bridge.relocateProject({ projectId: id }).then(adopt, failed)}
        onSetPinned={(id, pinned) =>
          void bridge.setPinned({ projectId: id, pinned }).then(refreshProjects, failed)
        }
        onOpenInFileManager={(id) => void bridge.openInFileManager({ projectId: id }).catch(failed)}
        onRemoveFromList={(id) =>
          void bridge.removeFromList({ projectId: id }).then(() => {
            refreshProjects()
            // the list entry and its per-document choices are gone: back to "no project"
            if (chatRef.current?.projectId === id) void chat.selectProject(null)
          }, failed)
        }
      />
    ) : null

  const hint: ReactNode =
    bridge && chat.hint && !hintDismissed ? (
      <ProjectFolderHintLine
        lang={lang}
        hint={chat.hint}
        onUse={() => void bridge.adoptFolderHint().then(adopt, failed)}
        onDismiss={() => setHintDismissed(true)}
      />
    ) : null

  const shown = notices.projectId !== null && notices.projectId === projectId ? notices.list : []
  const problemShown =
    problem && (problem.projectId === null || problem.projectId === projectId)
      ? problem.problem
      : null
  const consolidatedShown =
    consolidated && consolidated.projectId === projectId ? consolidated : null
  const unwritable = !!projectId && chat.unwritable
  const noticesNode: ReactNode =
    bridge && (problemShown || unwritable || shown.length > 0 || consolidatedShown) ? (
      <div className="ai-project-notices">
        {problemShown && (
          <ProjectProblemLine
            lang={lang}
            problem={problemShown}
            onDismiss={() => setProblem(null)}
          />
        )}
        {unwritable && <ProjectNoticeLine lang={lang} notice={{ kind: 'unwritable' }} />}
        <ProjectNoticeList
          lang={lang}
          notices={shown}
          onView={(section) => {
            if (projectId) void bridge.openProjectScreen({ projectId, section }).catch(() => {})
          }}
          onConsolidate={busy || consolidating ? undefined : () => void consolidate()}
          onDismiss={(index) =>
            setNotices((prev) => ({ ...prev, list: prev.list.filter((_, i) => i !== index) }))
          }
        />
        {consolidatedShown && (
          <ProjectMemoryConsolidatedLine
            lang={lang}
            before={consolidatedShown.before}
            after={consolidatedShown.after}
            onUndo={() => void undoConsolidation()}
          />
        )}
      </div>
    ) : null

  const messageParts = (parts: ProjectMessageParts): ReactNode => {
    const lines =
      parts.memory ??
      memoryLinesOf(
        parts.tools?.map((tool) => ({
          name: tool.name ?? '',
          ...(tool.output !== undefined ? { output: tool.output } : {}),
          ...(tool.isError !== undefined ? { isError: tool.isError } : {}),
        })),
      )
    const other = parts.otherEditorTools
    if (lines.length === 0 && !other) return null
    return (
      <>
        {other && (
          <ProjectToolSummaryLine
            lang={lang}
            editor={other.editor}
            documentName={baseName(other.fileRef)}
            count={other.count}
          />
        )}
        {lines.map((line, i) => (
          <ProjectMemoryEventLine
            key={`${i}-${memoryKey(line)}`}
            lang={lang}
            change={line.change}
            gone={
              chat.memoryEntries
                ? memoryLineGone(line, chat.memoryEntries)
                : forgotten.has(memoryKey(line))
            }
            onRemove={line.kind === 'added' && projectId ? () => forget(line) : undefined}
          />
        ))}
      </>
    )
  }

  return {
    chat,
    prepareSend,
    finishSend,
    chatMenu,
    picker,
    hint,
    notices: noticesNode,
    messageParts,
  }
}
