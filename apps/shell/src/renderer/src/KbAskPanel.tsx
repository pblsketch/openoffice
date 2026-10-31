import { useEffect, useRef, useState } from 'react'
import {
  AgentLoop,
  CREATE_DOCUMENT_TOOL,
  USE_SKILL_TOOL,
  USER_SKILL_TOOL_NAMES,
  composeSkills,
  createDocumentSkill,
  createIpcTransport,
  createKnowledgeBaseSkill,
  type AgentMessage,
  type AgentTransport,
  type CreateDocumentFormat,
  type KbFileInfo,
} from '@genoffice/agent-core'
import {
  AiBlockedNotice,
  AiComposer,
  AiConnectPrompt,
  AiToolsUnsupportedNotice,
  AiTypingIndicator,
  AiUsageChip,
  addTokenUsage,
  aiContextConfirmText,
  aiRunErrorText,
  aiSendGate,
  aiSubscriptionText,
  consolidateProjectMemory,
  createFileNav,
  Markdown,
  NO_SKILL_USE,
  ProjectChatMenu,
  ProjectFolderHintLine,
  ProjectMemoryConsolidatedLine,
  ProjectMemoryEventLine,
  memoryLineGone,
  memoryRemoveOutcome,
  type ProjectMemoryRemoveOutcome,
  ProjectNoticeLine,
  ProjectNoticeList,
  ProjectPicker,
  ProjectToolSummaryLine,
  ProjectProblemLine,
  placeRemoteEntries,
  projectAddProblem,
  projectPanelText,
  type ProjectProblem,
  SentSkillChips,
  panelProjectSkill,
  panelUserSkills,
  undoProjectMemoryConsolidation,
  useComposerSkills,
  useProjectChat,
  useSkillProposals,
  useSkillTemplates,
  type AiTokenUsageView,
  type ProjectChatEntry,
  type ProjectChatOpened,
  type ProjectMemoryLine,
  type SkillChipRef,
  type SkillUse,
} from '@genoffice/ui'
import type {
  AddFolderResult,
  CreateProjectResult,
  ProjectEditor,
  ProjectId,
  ProjectListItem,
  ProjectNotice,
  ToolActivity,
} from '@genoffice/project-store'
import type { AiSettings } from '@genoffice/ai-provider'
import {
  AI_SUBSCRIPTION_PROVIDERS,
  isSubscriptionProvider,
  localContextLimit,
  localModelCapabilities,
  selectAiProvider,
  type AiSubscriptionProviderId,
} from '@genoffice/ai-provider/browser'
import {
  askBlockedRunOf,
  askHeldStep,
  askSendGate,
  withContinuedProvider,
  type AskBlockedRun,
} from './kb-ask-connection'
import {
  askScopeFailure,
  isProjectTool,
  notesAfterCreate,
  openAskScope,
  projectToolNote,
  startedToolNote,
  storedToolNotes,
  toolRecordOf,
  type AskToolLabels,
  type ToolNote,
} from './kb-ask-project'
import { kbAskProjectText } from './kb-ask-project-strings'
import { useI18n } from './locale'
import { changeAiSettings } from './settings-ai'
import type { SubscriptionConnection } from './subscription-client'
import { aiConnectHint } from './subscription-status'
import sendEnterOn from './assets/send-enter-on.png'
import sendEnterOff from './assets/send-enter-off.png'
import sendStop from './assets/send-stop.png'

/**
 * The home screen's knowledge-base ask panel: chat with the reader's starred
 * corpus without opening a document. First app-side consumer of the shell's
 * kb:* gateway — the loop, streaming and rendering reuse what every editor's
 * AI panel uses (AgentLoop + createIpcTransport + Markdown with a filenav
 * nav), so answers cite the folder and file they came from and clicking a
 * citation opens that file in the app that owns it.
 *
 * Without a project the conversation lives in memory only; it does not
 * survive a restart. With a project chosen under the composer (spec 5.2,
 * 5.3.8) the chat is kept in that folder through the shared project chat
 * hook, the [chat ▾] menu appears in the head bar, and a run reads the
 * project folder plus the starred scope chosen above (spec 5.5). Going back
 * to "No project" brings back the in-memory chat that was there before.
 * An empty corpus gets an onboarding hero instead of a bare hint: the only
 * useful move there is going to Recents and starring files, so the panel
 * says so and offers the jump as a button.
 */

/** the editor id the home ask records its project chats under */
const HOME_EDITOR: ProjectEditor = 'home'

interface AskMessage {
  role: 'user' | 'assistant'
  text: string
  toolNotes: ToolNote[]
  streaming?: boolean
  isError?: boolean
  /** tokens the provider billed for this answer, summed across its turns (absent when unreported) */
  usage?: AiTokenUsageView
  /** the "save as" buttons' outcome for this answer */
  saved?: { path: string; name: string } | { error: string } | 'saving'
  /** the answer's document was saved into the chosen project's folder: no "save as" buttons */
  createdInProject?: boolean
  /** the run stopped because its connection cannot go on: shown as the blocked notice */
  blocked?: AskBlockedRun
  /** the reason as the transport worded it, for a kind the notice has no text of its own for */
  blockedReason?: string
  /** skill chips a question carried */
  skills?: SkillChipRef[]
  /** skill cards the model proposed in this answer (keys of useSkillProposals) */
  skillProposals?: string[]
  /** "remembered / changed / removed" lines of a project chat (spec 5.6) */
  memory?: ProjectMemoryLine[]
  /** tools another editor ran for this message: one summary line, never expanded (spec 5.3.2) */
  otherTools?: { editor: ProjectEditor; fileRef?: string; count: number }
}

/** the in-memory chat set aside while a project chat is shown */
interface MemoryChat {
  messages: AskMessage[]
  model: AgentMessage[]
}

/** a person-triggered memory consolidation that went through ("N → M [undo]") */
interface ConsolidatedMemory {
  projectId: ProjectId
  before: number
  after: number
  backupName: string
}

export function KbAskPanel({
  onOpenPath,
  onGoToRecents,
  connection,
  aiSettings,
  noticeDue,
  onOpenAiSettings,
  openChatRequest,
}: {
  onOpenPath: (path: string) => void
  onGoToRecents: () => void
  /** the live subscription connection: the connect prompt shows it and acts on it */
  connection: SubscriptionConnection
  /** the AI settings as last read; null until they are */
  aiSettings: AiSettings | null
  /** the first-connection notice is up over this panel and not acknowledged yet */
  noticeDue: boolean
  /** open Settings on its AI section, where a connection is made */
  onOpenAiSettings: () => void
  /**
   * A project chat the home project screen asked to open here (main handed
   * it to the home window, see ProjectsPanel); `seq` bumps on every request.
   */
  openChatRequest?: { projectId: ProjectId; chatId: ProjectId; seq: number } | null
}): React.JSX.Element {
  const { t, lang } = useI18n()
  const [messages, setMessages] = useState<AskMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [corpusCount, setCorpusCount] = useState<number | null>(null)
  const corpusRef = useRef<KbFileInfo[]>([])
  const settingsRef = useRef<AiSettings | null>(null)
  const loopRef = useRef<AgentLoop<unknown> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  /** bumped by Stop: an ask still refreshing the corpus must not start its run */
  const askSeqRef = useRef(0)
  /** tokens billed so far in the in-flight answer (summed across turns) */
  const runUsageRef = useRef<AiTokenUsageView | undefined>(undefined)
  /** tokens billed across the panel's session (the composer chip) */
  const [sessionUsage, setSessionUsage] = useState<AiTokenUsageView | undefined>(undefined)
  /** a send was refused for want of a connection: the connect prompt stays until one can run */
  const [connectAsked, setConnectAsked] = useState(false)
  /** a question sent while the connection was still being checked: it waits for the answer */
  const heldRef = useRef<string | null>(null)
  /** the skills called with `/` or `$` in the composer, and the text a question gets for them */
  const skills = useComposerSkills({
    lang,
    // a chip whose skill has a template opens its copy in a new tab (spec 9.7)
    onTemplateSkill: (request) => skillTemplatesRef.current.onTemplateSkill(request),
  })
  /** the skill cards `propose_skill` shows; nothing is written before their Save. The
   *  home panel has no document, so a card never offers a template here */
  const skillCards = useSkillProposals({ lang })
  const skillCardsRef = useRef(skillCards)
  skillCardsRef.current = skillCards
  /**
   * The template flow without a document (spec 5.7, 9.7): a template skill
   * runs in a new tab of its editor, and one the model used offers its new
   * document. Nothing is ever handed to this panel.
   */
  const skillTemplates = useSkillTemplates({ lang, editor: null, setComposer: setDraft })
  const skillTemplatesRef = useRef(skillTemplates)
  skillTemplatesRef.current = skillTemplates
  /** the skills of the held question, and of the last question asked (continue with ...) */
  const heldSkillUseRef = useRef<SkillUse>(NO_SKILL_USE)
  const lastSkillUseRef = useRef<SkillUse>(NO_SKILL_USE)
  /** structured cause of the failure the loop is about to report through onError */
  const streamErrorRef = useRef<AskBlockedRun | null>(null)
  const langRef = useRef(lang)
  langRef.current = lang
  const connectionRef = useRef(connection)
  connectionRef.current = connection
  /** starred groups that have files, as last read: the "All / <group>" choice */
  const [groups, setGroups] = useState<string[]>([])
  /** the group asks are narrowed to (null = All). Starts at All whenever the
   *  panel opens and is stored nowhere: the choice is not remembered (spec 8.8) */
  const [scopeGroup, setScopeGroup] = useState<string | null>(null)
  /** starred files in the chosen group, for the headbar (null until known) */
  const [scopeCount, setScopeCount] = useState<number | null>(null)
  /** the scope main minted for the latest narrowed run: the knowledge tools carry it on
   *  every call, and main keeps it to its group. It stays set (closed in main, so
   *  refused) after the run, so a late call of that run is never read as unscoped */
  const runScopeRef = useRef<string | undefined>(undefined)
  /** that scope while main still holds it open */
  const openScopeRef = useRef<string | undefined>(undefined)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const aiSettingsRef = useRef(aiSettings)
  aiSettingsRef.current = aiSettings
  /** the chat transport, for the person-triggered memory consolidation */
  const transportRef = useRef<AgentTransport | null>(null)
  /** a run's question and answer are the last two messages and the answer is on its way */
  const runActiveRef = useRef(false)
  /** the answer text and tool records of the run in flight, for the project chat */
  const runTextRef = useRef('')
  const runToolsRef = useRef<ToolActivity[]>([])
  /** a project (or earlier) chat is shown, not the in-memory one */
  const showingProjectRef = useRef(false)
  /** the in-memory chat set aside while a project chat is shown */
  const memoryChatRef = useRef<MemoryChat | null>(null)
  /** the project list for the picker, refreshed when it opens */
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const projectsRef = useRef(projects)
  projectsRef.current = projects
  const [defaultParentFolder, setDefaultParentFolder] = useState<string | undefined>(undefined)
  /** what the last send of the chosen project brought up (changed, long, cut, sync folder) */
  const [projectNotices, setProjectNotices] = useState<ProjectNotice[]>([])
  /** a write into the project failed outside the chat records (consolidation, a send's context) */
  const [unwritableNotice, setUnwritableNotice] = useState(false)
  const [consolidated, setConsolidated] = useState<ConsolidatedMemory | null>(null)
  const [consolidating, setConsolidating] = useState(false)
  const [consolidateFailed, setConsolidateFailed] = useState(false)
  /** what the person asked for in the picker that did not happen (a refused folder, …) */
  const [projectProblem, setProjectProblem] = useState<ProjectProblem | null>(null)

  const toolLabels = (): AskToolLabels => ({
    search: t('askToolSearch'),
    read: t('askToolRead'),
    create: t('askToolCreate'),
  })

  const askMessageOf = (entry: ProjectChatEntry): AskMessage => ({
    role: entry.role,
    text: entry.text,
    toolNotes: entry.role === 'assistant' ? storedToolNotes(entry.tools, toolLabels()) : [],
    ...(entry.skills && entry.skills.length > 0 ? { skills: entry.skills } : {}),
    ...(entry.memory.length > 0 ? { memory: entry.memory } : {}),
    ...(entry.otherEditorTools ? { otherTools: entry.otherEditorTools } : {}),
  })

  /** a run in flight belongs to the chat on screen: leaving that chat stops it */
  const abandonRun = (): void => {
    if (!busy && !runActiveRef.current) return
    runActiveRef.current = false
    askSeqRef.current++
    loopRef.current?.cancel()
    endRunScope()
    void projectChatRef.current.finishSend()
    setBusy(false)
  }

  /** the project chat hook opened a chat, or went back to "no project" */
  const showOpenedChat = (opened: ProjectChatOpened): void => {
    const loop = loopRef.current
    setProjectNotices([])
    setUnwritableNotice(false)
    setConsolidated(null)
    setConsolidateFailed(false)
    setProjectProblem(null)
    if (opened.kind === 'document') {
      // back to the in-memory chat as it was before a project was chosen
      if (!showingProjectRef.current) return
      abandonRun()
      showingProjectRef.current = false
      const kept = memoryChatRef.current
      memoryChatRef.current = null
      setMessages(kept?.messages ?? [])
      loop?.reset()
      if (kept) loop?.restore(kept.model)
      return
    }
    abandonRun()
    if (!showingProjectRef.current) {
      memoryChatRef.current = {
        messages: messagesRef.current,
        model: [...(loop?.messages ?? [])],
      }
    }
    showingProjectRef.current = true
    setMessages(opened.entries.map(askMessageOf))
    loop?.reset()
    loop?.restore(opened.model)
  }

  /** another window recorded a message in the open chat: shown now, ahead of a run in flight */
  const showRemoteMessage = (entry: ProjectChatEntry): void => {
    const message = askMessageOf(entry)
    setMessages((prev) => placeRemoteEntries(prev, [message], runActiveRef.current))
  }

  const projectChat = useProjectChat({
    editor: HOME_EDITOR,
    loop: () => loopRef.current,
    onOpen: showOpenedChat,
    onRemoteMessage: showRemoteMessage,
  })
  const projectChatRef = useRef(projectChat)
  projectChatRef.current = projectChat
  /** the chosen project (null: no project) */
  const projectId = projectChat.projectId
  /** the provider a question would run on right now (null until the settings are read) */
  const providerChoice = aiSettings ? selectAiProvider(aiSettings, connection.statuses) : null
  const aiConnected = providerChoice?.connected === true
  const connectPromptOpen = connectAsked && providerChoice !== null && !providerChoice.connected
  // why the selected AI cannot run right now; null when it can
  const connectHint = aiConnectHint(aiSettings, connection.statuses)
  // once a provider can run again the connect prompt has done its job
  useEffect(() => {
    if (aiConnected) setConnectAsked(false)
  }, [aiConnected])

  const refreshSettings = (): void => {
    void window.aiOffice
      .aiGetSettings()
      .then((settings) => {
        settingsRef.current = settings
      })
      .catch(() => undefined)
  }

  const refreshGroups = (): void => {
    if (typeof window.aiOffice?.starredGroups !== 'function') return
    void window.aiOffice
      .starredGroups()
      .then(setGroups)
      .catch(() => undefined)
  }

  /** the narrowed run is over: main drops its scope */
  const endRunScope = (): void => {
    const scope = openScopeRef.current
    openScopeRef.current = undefined
    if (scope !== undefined) void window.aiOffice.kbCloseScope(scope).catch(() => undefined)
  }

  const chooseScope = (group: string | null): void => {
    if (busy) return
    setScopeGroup(group)
    setScopeCount(null)
    if (group === null || typeof window.aiOffice?.starred !== 'function') return
    void window.aiOffice
      .starred({ group, limit: 0 })
      .then((page) => setScopeCount(page.totalAll))
      .catch(() => undefined)
  }

  useEffect(() => {
    refreshGroups()
    // one corpus snapshot per mount; sends refresh it again (see ask()).
    // A bridge without the kb channel (defensive: the shell always exposes
    // it) leaves the corpus empty, which keeps the panel on its guidance.
    if (typeof window.aiOffice?.kbList !== 'function') {
      setCorpusCount(0)
      return
    }
    void window.aiOffice
      .kbList()
      .then((files) => {
        corpusRef.current = files
        setCorpusCount(files.length)
      })
      .catch(() => setCorpusCount(0))
    refreshSettings()
    const docSkill = createDocumentSkill({
      create: (request) => window.aiOffice.kbCreateDocument(request),
    })
    const transport = createIpcTransport<AiSettings>({
      onStream: (listener) => window.aiOffice.onAiStream(listener),
      start: (request) => window.aiOffice.aiStream(request),
      cancel: (requestId) => void window.aiOffice.aiStreamCancel(requestId),
      getSettings: () => settingsRef.current as AiSettings,
      unknownErrorText: () => t('askUnknownError'),
      // the subscription causes are worded once for every AI surface of the suite
      errorText: (cause) => aiRunErrorText(langRef.current, cause),
      // a local model's window: the transport warns at 80% and asks once per run
      contextLimit: (settings) => localContextLimit(settings),
      confirmContext: (warning) => window.confirm(aiContextConfirmText(langRef.current, warning)),
      onStreamError: (error) => {
        streamErrorRef.current = askBlockedRunOf(error)
      },
    })
    transportRef.current = transport
    loopRef.current = new AgentLoop({
      transport,
      // a local model that reported no tool support answers in text only
      toolsAllowed: () =>
        settingsRef.current ? localModelCapabilities(settingsRef.current).tools !== false : true,
      skill: composeSkills('kb+skills', '', [
        createKnowledgeBaseSkill({
          listFiles: () => corpusRef.current,
          // a narrowed run's calls carry its scope; main keeps them to the group
          search: (query, limit) =>
            window.aiOffice.kbSearch({ q: query, limit }, runScopeRef.current),
          read: (path, offset) => window.aiOffice.kbRead(path, offset, runScopeRef.current),
          alsoCitable: () => docSkill.createdPaths(),
        }),
        // the person's skills: use_skill, read_skill_file, propose_skill (app-run tools)
        ...panelUserSkills({
          lang: () => langRef.current,
          messages: () => loopRef.current?.messages ?? [],
          // a template skill the model used offers its new document (spec 5.7)
          onUsed: (skill) => skillTemplatesRef.current.onUsed(skill),
          onProposal: (proposal) => {
            skillCardsRef.current.add(proposal)
            patchLast((last) => ({
              skillProposals: [...(last.skillProposals ?? []), proposal.key],
            }))
          },
        }),
        // the chosen project folder (spec 5.4, 5.5): adds nothing unless the send's
        // prepareSend found a project; the run's knowledge scope covers the folder too
        ...panelProjectSkill({
          run: projectChatRef.current.run,
          lang: () => langRef.current,
          onMemoryEdit: (line) => patchLast((last) => ({ memory: [...(last.memory ?? []), line] })),
        }),
        docSkill,
      ]),
      events: {
        onText: (text) => {
          runTextRef.current = text
          patchLast({ text })
        },
        onToolStart: (call) => {
          // the skill and project tools show their own line once they ran
          if (USER_SKILL_TOOL_NAMES.has(call.name) || isProjectTool(call.name)) return
          patchLast((last) => ({
            toolNotes: [...last.toolNotes, startedToolNote(call.name, toolLabels())],
          }))
        },
        onToolExecuted: ({ call, execution }) => {
          if (runActiveRef.current) runToolsRef.current.push(toolRecordOf(call, execution))
          if (call.name === CREATE_DOCUMENT_TOOL) {
            // saved into the chosen project's folder: the step is done and says where
            const path = execution.isError ? undefined : docSkill.createdPaths().at(-1)
            const chosen = projectChatRef.current.projectId
            const folder = projectsRef.current.find((item) => item.id === chosen)?.path
            patchLast((last) => {
              const notes = notesAfterCreate(last.toolNotes, path, folder, (name) =>
                kbAskProjectText(langRef.current, 'askSavedToProject', { name }),
              )
              return notes ? { toolNotes: notes, createdInProject: true } : {}
            })
            return
          }
          if (isProjectTool(call.name)) {
            const note = projectToolNote(call.name, execution.summary, execution.isError)
            if (note) patchLast((last) => ({ toolNotes: [...last.toolNotes, note] }))
            return
          }
          if (call.name !== USE_SKILL_TOOL || execution.isError) return
          patchLast((last) => ({
            toolNotes: [...last.toolNotes, { label: execution.summary, kind: 'skill' as const }],
          }))
        },
        onDone: () => {
          endRunScope()
          // the answer joins the project chat (a stopped run keeps what came so far)
          if (runActiveRef.current) {
            runActiveRef.current = false
            const text = runTextRef.current
            const tools = runToolsRef.current
            if (text || tools.length > 0) {
              projectChatRef.current.persist({
                role: 'assistant',
                text,
                ...(tools.length > 0 ? { tools } : {}),
              })
            }
          }
          void projectChatRef.current.finishSend()
          finishLast()
        },
        onUsage: (usage) => {
          runUsageRef.current = addTokenUsage(runUsageRef.current, usage)
          setSessionUsage((prev) => addTokenUsage(prev, usage))
          patchLast({ usage: runUsageRef.current })
        },
        onError: (error) => {
          endRunScope()
          // a failed run records no answer; the question stays unanswered in the chat
          runActiveRef.current = false
          void projectChatRef.current.finishSend()
          const blocked = streamErrorRef.current
          streamErrorRef.current = null
          if (blocked) {
            // the shown status may be stale (a login that expired mid-run): look again,
            // and offer the connect cards if the provider turns out to be unusable
            if (blocked.provider && isSubscriptionProvider(blocked.provider)) {
              connectionRef.current.recheck(blocked.provider)
            }
            setConnectAsked(true)
          }
          patchLast((last) => ({
            // a blocked run keeps what was answered so far; the notice under it says why it stopped
            text: blocked ? last.text : last.text || error,
            streaming: false,
            isError: !blocked && !last.text,
            ...(blocked ? { blocked, blockedReason: error } : {}),
          }))
          // onError is the loop's last word on a run: the composer takes questions again
          setBusy(false)
        },
      },
    })
    return () => {
      loopRef.current?.cancel()
      endRunScope()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only; the loop reads live refs
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, connectPromptOpen])

  const patchLast = (
    patch: Partial<AskMessage> | ((last: AskMessage) => Partial<AskMessage>),
  ): void => {
    setMessages((prev) => {
      if (prev.length === 0 || prev[prev.length - 1]!.role !== 'assistant') return prev
      const last = prev[prev.length - 1]!
      const delta = typeof patch === 'function' ? patch(last) : patch
      return [...prev.slice(0, -1), { ...last, ...delta }]
    })
  }

  const finishLast = (): void => {
    setMessages((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]!
      return [...prev.slice(0, -1), { ...last, streaming: false }]
    })
    setBusy(false)
  }

  /** `again`: a question asked before, sent once more; `known`: settings just written, ahead of the props;
      `skillUse`: the chosen skills (their text goes to the model, their chips onto the question) */
  const ask = async (
    again?: string,
    known?: AiSettings,
    skillUse: SkillUse = NO_SKILL_USE,
  ): Promise<void> => {
    const instruction = (again ?? draft).trim()
    if (!instruction || busy) return
    const gate = askSendGate(known ?? aiSettings, connection.statuses, noticeDue)
    heldRef.current = gate === 'checking' ? instruction : null
    heldSkillUseRef.current = gate === 'checking' ? skillUse : NO_SKILL_USE
    if (gate !== 'run') {
      // nothing is sent: the question stays in the composer while the panel shows what
      // is missing (a connection) or the home screen shows what must be read first
      // (the first-connection notice). Asked while the connection was still being
      // checked, it is held and starts by itself when the check says it can run.
      if (again !== undefined) setDraft(instruction)
      if (gate === 'connect') setConnectAsked(true)
      return
    }
    streamErrorRef.current = null
    // a held question was left in the composer while it waited: it is sent now
    if (again === undefined || draft.trim() === instruction) setDraft('')
    skills.consume(skillUse)
    lastSkillUseRef.current = skillUse
    skillTemplatesRef.current.noteRequest(instruction)
    const asked: AskMessage = {
      role: 'user',
      text: instruction,
      toolNotes: [],
      ...(skillUse.chips.length > 0 ? { skills: skillUse.chips } : {}),
    }
    setBusy(true)
    refreshSettings()
    const seq = ++askSeqRef.current
    runUsageRef.current = undefined
    /** nothing is sent: the question shows with why */
    const stopWith = (text: string, isError = true): void => {
      setMessages((prev) => [
        ...prev,
        asked,
        { role: 'assistant', text, toolNotes: [], ...(isError ? { isError: true } : {}) },
      ])
      setBusy(false)
    }
    // a narrowed ask: main mints this run's scope for the chosen group and keeps
    // every call of the run inside it. A group that has no files any more runs
    // nothing; it never widens to every starred file. With a project chosen the
    // scope also covers that folder (spec 5.5): the group choice still applies
    // to the starred part.
    const group = scopeGroup
    const runProject = projectChatRef.current.projectId
    refreshGroups()
    let scope: string | undefined
    try {
      scope = await openAskScope(window.aiOffice, group, runProject)
    } catch (error) {
      if (askSeqRef.current !== seq) return
      stopWith(
        askScopeFailure(error, runProject) === 'group-gone'
          ? t('askScopeGone')
          : kbAskProjectText(langRef.current, 'askProjectMissing'),
      )
      return
    }
    runScopeRef.current = scope
    openScopeRef.current = scope
    if (askSeqRef.current !== seq) {
      endRunScope()
      return
    }
    // freshly starred files are answerable this very turn
    let listed = true
    try {
      const files =
        scope === undefined ? await window.aiOffice.kbList() : await window.aiOffice.kbList(scope)
      corpusRef.current = files
      if (group === null) setCorpusCount(files.length)
      else setScopeCount(files.length)
    } catch {
      // keep the mount snapshot; a narrowed run never falls back to the full list
      listed = false
      if (scope !== undefined) corpusRef.current = []
    }
    if (askSeqRef.current !== seq) {
      endRunScope()
      return
    }
    // with a project the folder is there to read even when nothing is starred
    if (corpusRef.current.length === 0 && (runProject === null || !listed)) {
      endRunScope()
      if (runProject !== null) stopWith(t('askUnknownError'))
      else if (scope === undefined) stopWith(t('askEmptyCorpus'), false)
      else stopWith(t('askScopeGone'))
      return
    }
    // the project's context for this request, read now and fixed for the run
    const prepared = await projectChatRef.current.prepareSend()
    if (askSeqRef.current !== seq) {
      endRunScope()
      void projectChatRef.current.finishSend()
      return
    }
    if (prepared.status !== 'ok' && prepared.status !== 'none') {
      endRunScope()
      void projectChatRef.current.finishSend()
      stopWith(
        prepared.status === 'failed'
          ? t('askUnknownError')
          : kbAskProjectText(langRef.current, 'askProjectMissing'),
      )
      return
    }
    const notices = prepared.status === 'ok' ? prepared.notices : []
    setProjectNotices(notices.filter((notice) => notice.kind !== 'unwritable'))
    if (notices.some((notice) => notice.kind === 'unwritable')) setUnwritableNotice(true)
    setConsolidateFailed(false)
    runTextRef.current = ''
    runToolsRef.current = []
    runActiveRef.current = true
    setMessages((prev) => [
      ...prev,
      asked,
      { role: 'assistant', text: '', toolNotes: [], streaming: true },
    ])
    // with a project the question joins its chat; without one it stays in memory as before
    projectChatRef.current.persist({
      role: 'user',
      text: instruction,
      ...(skillUse.chips.length > 0 ? { skills: skillUse.chips } : {}),
    })
    try {
      // the skill text rides with this question only; the question shows the chips
      await loopRef.current!.run(instruction + skillUse.text)
    } catch {
      runActiveRef.current = false
      void projectChatRef.current.finishSend()
      finishLast()
    }
  }

  // The gate moved: start the question that waited in front of the status check, or drop it.
  const gateNow = askSendGate(aiSettings, connection.statuses, noticeDue)
  useEffect(() => {
    const held = heldRef.current
    if (held === null) return
    const step = askHeldStep(gateNow)
    if (step === 'keep') return
    heldRef.current = null
    if (step === 'start') void ask(held, undefined, heldSkillUseRef.current)
    // the check answered "not connected": the prompt takes over
    else if (gateNow === 'connect') setConnectAsked(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a move of the gate matters
  }, [gateNow])

  /** "Continue with <provider>" on a blocked run: select that provider and ask the question again */
  const continueWith = (provider: AiSubscriptionProviderId): void => {
    if (busy || loopRef.current?.busy) return
    const question = [...messages].reverse().find((m) => m.role === 'user')
    void changeAiSettings((current) => withContinuedProvider(current, provider)).then((next) => {
      if (!next) return
      settingsRef.current = next
      if (question) void ask(question.text, next, lastSkillUseRef.current)
    })
  }

  // the deterministic half of "keep this answer": the question becomes the
  // file name, the answer's markdown the body, same write path as the tool
  const saveAnswer = async (index: number, format: CreateDocumentFormat): Promise<void> => {
    const answer = messages[index]
    if (!answer || answer.saved === 'saving') return
    const question = [...messages.slice(0, index)].reverse().find((m) => m.role === 'user')
    const title = (question?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
    const patchAt = (saved: AskMessage['saved']): void =>
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, saved } : m)))
    patchAt('saving')
    try {
      const { path } = await window.aiOffice.kbCreateDocument({
        title,
        format,
        content: answer.text,
      })
      patchAt({ path, name: path.split(/[\\/]/).pop() ?? path })
    } catch (error) {
      patchAt({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  // ---- project folder (spec 5.1, 5.6, 5.10, 5.12) ----

  const refreshProjects = (): void => {
    const bridge = window.projectFolderApi
    if (!bridge) return
    void bridge
      .listProjects()
      .then(setProjects)
      .catch(() => undefined)
  }

  // the picker's list and where "new project" goes; again whenever the choice moves
  useEffect(() => {
    if (!projectChat.available) return
    refreshProjects()
    void window.projectFolderApi
      ?.getDefaultParentFolder()
      .then(setDefaultParentFolder)
      .catch(() => undefined)
  }, [projectChat.available, projectId])

  /** a folder became a project (added, created, relocated, adopted): choose it */
  const chooseAddedProject = (result: AddFolderResult | CreateProjectResult): void => {
    refreshProjects()
    // refused or not made: say why (spec 5.1); a closed dialog says nothing
    setProjectProblem(projectAddProblem(result))
    if (result.status !== 'added' && result.status !== 'created') return
    const once = result.status === 'added' ? result.notices : []
    void projectChat.selectProject(result.project.id).then(() => {
      // one-time notices of the addition (a sync folder) show once the chat is open
      if (once.length > 0) setProjectNotices(once)
    })
  }

  /** a bridge call the person made failed: say so instead of doing nothing */
  const showActionFailed = (): void => setProjectProblem({ kind: 'action-failed' })

  // the home project screen asked for a chat of a project: open it here
  const openChatSeq = openChatRequest?.seq
  useEffect(() => {
    if (openChatRequest) projectChat.openChatRef(openChatRequest)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request matters
  }, [openChatSeq])

  const removeProjectFromList = (id: ProjectId): void => {
    const bridge = window.projectFolderApi
    if (!bridge) return
    void bridge
      .removeFromList({ projectId: id })
      .then(() => {
        refreshProjects()
        if (projectChatRef.current.projectId === id) void projectChat.selectProject(null)
      })
      .catch(showActionFailed)
  }

  /** "[remove]" on a memory line: the entry leaves memory.md and the line says so */
  const forgetMemory = (
    index: number,
    line: ProjectMemoryLine,
  ): Promise<ProjectMemoryRemoveOutcome> =>
    projectChat
      .forgetMemory(line)
      .then((result) => {
        const outcome = memoryRemoveOutcome(result)
        // an entry already gone before the click is as good as removed
        if (outcome === 'failed') return outcome
        setMessages((prev) =>
          prev.map((m, i) =>
            i === index
              ? {
                  ...m,
                  memory: (m.memory ?? []).map((l) =>
                    l === line
                      ? {
                          kind: 'removed',
                          text: line.text,
                          change: { op: 'remove', text: line.text },
                        }
                      : l,
                  ),
                }
              : m,
          ),
        )
        return outcome
      })
      .catch((): ProjectMemoryRemoveOutcome => 'failed')

  /** "[Tidy up]": one request on the chat's connection, only when the person presses it */
  const consolidate = (): void => {
    const id = projectChatRef.current.projectId
    const transport = transportRef.current
    // the home screen's first-connection notice comes before any request
    if (!id || !transport || consolidating || busy || noticeDue) return
    setConsolidating(true)
    setConsolidateFailed(false)
    void consolidateProjectMemory({
      projectId: id,
      transport,
      gate: () => aiSendGate(aiSettingsRef.current, connectionRef.current.statuses),
    })
      .then((result) => {
        if (result.status === 'ok') {
          setConsolidated({
            projectId: id,
            before: result.before,
            after: result.after,
            backupName: result.backupName,
          })
          setProjectNotices((prev) => prev.filter((notice) => notice.kind !== 'memory-long'))
        } else if (result.status === 'not-ready') {
          if (result.gate.kind === 'connect') setConnectAsked(true)
        } else if (result.status === 'unwritable') {
          setUnwritableNotice(true)
        } else if (result.status === 'failed') {
          setConsolidateFailed(true)
        }
      })
      .catch(() => setConsolidateFailed(true))
      .finally(() => setConsolidating(false))
  }

  const undoConsolidation = (done: ConsolidatedMemory): void => {
    const bridge = window.projectFolderApi
    if (!bridge) return
    void undoProjectMemoryConsolidation(bridge, done.projectId, done.backupName)
      .then((result) => {
        if (result.status === 'ok') setConsolidated(null)
        else if (result.status === 'unwritable') setUnwritableNotice(true)
      })
      .catch(() => undefined)
  }

  const chat = projectChat.chat
  const showUnwritable = projectId !== null && (projectChat.unwritable || unwritableNotice)
  /** the chosen project's name for the head and the input hint */
  const projectName =
    projects.find((item) => item.id === projectId)?.name ??
    projectPanelText(lang, 'projectFallback')
  const askPlaceholder =
    projectId === null
      ? t('askPlaceholder')
      : kbAskProjectText(
          lang,
          (corpusCount ?? 0) > 0 ? 'askProjectStarsPlaceholder' : 'askProjectPlaceholder',
          { name: projectName },
        )

  const fileNav = createFileNav((path) => onOpenPath(path))

  return (
    <div className="kb-ask">
      {corpusCount !== null && (corpusCount > 0 || projectId !== null) && (
        <div className="kb-ask-headbar">
          <b>
            {projectId !== null
              ? kbAskProjectText(lang, 'askProjectTitle', { name: projectName })
              : t('askTitle')}
          </b>
          {/* the chosen project's chats (spec 5.3): only with a project */}
          {projectId !== null && chat !== null && (
            <ProjectChatMenu
              lang={lang}
              chats={projectChat.chats}
              currentChatId={chat.kind === 'project' && !chat.isNew ? chat.chatId : null}
              currentTitle={chat.kind === 'project' && chat.title ? chat.title : undefined}
              legacy={projectChat.legacy}
              legacyActive={chat.kind === 'legacy'}
              disabled={busy}
              onOpen={() => void projectChat.refreshChats()}
              onSelect={(id) => void projectChat.openChat(id)}
              onNewChat={() => void projectChat.newChat()}
              onRename={(id, title) => void projectChat.renameChat(id, title)}
              onDelete={(id) => void projectChat.deleteChat(id)}
              onSelectLegacy={() => void projectChat.openLegacy()}
            />
          )}
          {/* with a project and nothing starred, the star count says nothing */}
          {(projectId === null || (corpusCount ?? 0) > 0 || scopeGroup !== null) && (
            <span>
              {scopeGroup === null
                ? t('askCorpusCount', { n: String(corpusCount) })
                : scopeCount === null
                  ? scopeGroup
                  : t('askCorpusCountGroup', { group: scopeGroup, n: String(scopeCount) })}
            </span>
          )}
          {(groups.length > 0 || scopeGroup !== null) && (
            <KbAskScopeChoice
              groups={
                scopeGroup === null || groups.includes(scopeGroup)
                  ? groups
                  : [...groups, scopeGroup]
              }
              chosen={scopeGroup}
              disabled={busy}
              allLabel={t('askScopeAll')}
              ariaLabel={t('askScopeLabel')}
              onChoose={chooseScope}
            />
          )}
        </div>
      )}
      <div className="kb-ask-thread" ref={scrollRef}>
        {messages.length === 0 && corpusCount === 0 && projectId === null && (
          <div className="kb-ask-hero">
            <div className="kb-ask-hero-icon" aria-hidden="true">
              <IconBookOpen />
            </div>
            <h3>{t('askTitle')}</h3>
            <p>{t('askHeroTagline')}</p>
            <div className="kb-ask-steps">
              <div className="kb-ask-step">
                <span className="kb-ask-step-num">1</span>
                <div>
                  <b>{t('askStep1Title')}</b>
                  <span>{t('askStep1Desc')}</span>
                </div>
              </div>
              <div className="kb-ask-step">
                <span className="kb-ask-step-num">2</span>
                <div>
                  <b>{t('askStep2Title')}</b>
                  <span>{t('askStep2Desc')}</span>
                </div>
              </div>
              <div className="kb-ask-step">
                <span className="kb-ask-step-num">3</span>
                <div>
                  <b>{t('askStep3Title')}</b>
                  <span>{t('askStep3Desc')}</span>
                </div>
              </div>
            </div>
            <button className="kb-ask-cta" type="button" onClick={onGoToRecents}>
              <IconStar />
              {t('askCtaRecents')}
            </button>
            {projectChat.available && (
              <p className="kb-ask-hero-project">{kbAskProjectText(lang, 'askHeroProjectHint')}</p>
            )}
          </div>
        )}
        {messages.length === 0 && projectId !== null && (
          <p className="kb-ask-hint">
            {kbAskProjectText(lang, 'askProjectIntro', { name: projectName })}
          </p>
        )}
        {messages.length === 0 && projectId === null && corpusCount !== null && corpusCount > 0 && (
          <p className="kb-ask-hint">{t('askIntro')}</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`kb-ask-msg kb-ask-${m.role}${m.isError ? ' kb-ask-error' : ''}`}>
            {m.role === 'user' && (
              <SentSkillChips lang={lang} chips={m.skills} isAvailable={skills.isAvailable} />
            )}
            {m.role === 'assistant' && m.toolNotes.length > 0 && (
              <div className="kb-ask-tools">
                {m.toolNotes.map((note, j) => (
                  <span
                    key={j}
                    className={`kb-ask-tool-note${note.kind === 'created' ? ' is-done' : ''}`}
                  >
                    {note.kind === 'search' ? (
                      <IconSearch />
                    ) : note.kind === 'read' ? (
                      <IconFileText />
                    ) : note.kind === 'create' || note.kind === 'created' ? (
                      <IconFilePlus />
                    ) : null}
                    {note.label}
                    {m.streaming && note.kind !== 'created' && j === m.toolNotes.length - 1
                      ? '…'
                      : ''}
                    {note.kind === 'created' && note.path && (
                      <button
                        type="button"
                        className="kb-ask-tool-open"
                        onClick={() => onOpenPath(note.path as string)}
                      >
                        {kbAskProjectText(lang, 'askOpenCreated')}
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {m.otherTools && (
              <ProjectToolSummaryLine
                lang={lang}
                editor={m.otherTools.editor}
                documentName={m.otherTools.fileRef?.split(/[\\/]/).pop()}
                count={m.otherTools.count}
              />
            )}
            {m.memory?.map((line, j) => (
              <ProjectMemoryEventLine
                key={j}
                lang={lang}
                change={line.change}
                gone={memoryLineGone(line, projectChat.memoryEntries)}
                onRemove={line.kind === 'added' ? () => forgetMemory(i, line) : undefined}
              />
            ))}
            {m.skillProposals?.map((key) => skillCards.render(key))}
            {m.text ? (
              m.role === 'assistant' ? (
                <Markdown text={m.text} navs={[fileNav]} />
              ) : (
                m.text
              )
            ) : m.streaming ? (
              <AiTypingIndicator label={t('askHintBusy')} />
            ) : null}
            {m.role === 'assistant' && m.usage && (
              <div className="ai-message-usage">
                <AiUsageChip usage={m.usage} lang={lang} />
              </div>
            )}
            {m.role === 'assistant' &&
              m.text &&
              !m.streaming &&
              !m.isError &&
              !m.createdInProject && (
                <div className="kb-ask-actions">
                  {m.saved && typeof m.saved === 'object' && 'path' in m.saved ? (
                    <button
                      type="button"
                      className="kb-ask-action kb-ask-action-saved"
                      onClick={() => onOpenPath((m.saved as { path: string }).path)}
                    >
                      <IconFileText />
                      {t('askSavedAs', { name: m.saved.name })}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="kb-ask-action"
                        disabled={m.saved === 'saving'}
                        onClick={() => void saveAnswer(i, 'md')}
                      >
                        <IconFilePlus />
                        {t('askSaveMd')}
                      </button>
                      <button
                        type="button"
                        className="kb-ask-action"
                        disabled={m.saved === 'saving'}
                        onClick={() => void saveAnswer(i, 'docx')}
                      >
                        <IconFilePlus />
                        {t('askSaveDocx')}
                      </button>
                      {m.saved && typeof m.saved === 'object' && 'error' in m.saved && (
                        <span className="kb-ask-action-error">
                          {t('askSaveFailed', { error: m.saved.error })}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            {m.blocked && (
              <AiBlockedNotice
                kind={m.blocked.kind}
                provider={m.blocked.provider}
                resetsAt={m.blocked.resetsAt}
                message={m.blockedReason}
                settings={aiSettings ?? {}}
                // only the run that just stopped can be continued on another connection
                statuses={i === messages.length - 1 && !busy ? connection.statuses : {}}
                lang={lang}
                onContinueWith={continueWith}
              />
            )}
          </div>
        ))}
        {skillTemplates.notes}
        {connectPromptOpen && (
          <>
            <AiConnectPrompt
              choice={providerChoice}
              statuses={connection.statuses}
              lang={lang}
              disabled={connection.busy}
              onOpenSettings={onOpenAiSettings}
              onInstall={connection.install}
              onUpdate={connection.update}
              onCancelLogin={connection.cancelLogin}
              onLogin={connection.login}
              onRecheck={connection.recheck}
              onAcceptMetered={(provider) => void connection.acceptMetered(provider)}
              onOpenInstallHelp={connection.openInstallHelp}
              onOpenConnectHelp={connection.openConnectHelp}
            />
            {AI_SUBSCRIPTION_PROVIDERS.map(
              (provider) =>
                connection.failed[provider] && (
                  <p
                    key={provider}
                    className="kb-ask-login kb-ask-error"
                    role="alert"
                    data-provider={provider}
                  >
                    {t(
                      connection.failed[provider] === 'install'
                        ? 'setSubInstallFailed'
                        : 'setSubLoginFailed',
                    )}
                  </p>
                ),
            )}
          </>
        )}
      </div>
      {/* with a project the chat is kept in its folder; the unwritable line says when it is not */}
      {messages.length > 0 && projectId === null && (
        <p className="kb-ask-nosave">
          <IconInfo />
          {t('askNoSave')}
        </p>
      )}
      {projectChat.hint && (
        <ProjectFolderHintLine
          lang={lang}
          hint={projectChat.hint}
          onUse={() =>
            void window.projectFolderApi
              ?.adoptFolderHint()
              .then(chooseAddedProject)
              .catch(showActionFailed)
          }
        />
      )}
      {projectProblem && (
        <ProjectProblemLine
          lang={lang}
          problem={projectProblem}
          onDismiss={() => setProjectProblem(null)}
        />
      )}
      {projectId !== null && (
        <ProjectNoticeList
          lang={lang}
          notices={projectNotices}
          onView={(section) =>
            void window.projectFolderApi
              ?.openProjectScreen({ projectId, section })
              .catch(() => undefined)
          }
          onConsolidate={consolidating || busy ? undefined : consolidate}
          onDismiss={(index) => setProjectNotices((prev) => prev.filter((_, k) => k !== index))}
        />
      )}
      {showUnwritable && <ProjectNoticeLine lang={lang} notice={{ kind: 'unwritable' }} />}
      {consolidated !== null && consolidated.projectId === projectId && (
        <ProjectMemoryConsolidatedLine
          lang={lang}
          before={consolidated.before}
          after={consolidated.after}
          onUndo={() => undoConsolidation(consolidated)}
        />
      )}
      {consolidateFailed && (
        <p className="kb-ask-login kb-ask-error" role="alert">
          {t('askUnknownError')}
        </p>
      )}
      {connectHint && !connectPromptOpen && (
        <p className="kb-ask-login">
          {aiSubscriptionText(lang, connectHint.titleKey, {
            provider: connectHint.providerName ?? '',
          })}{' '}
          <button type="button" className="kb-ask-login-link" onClick={onOpenAiSettings}>
            {aiSubscriptionText(lang, 'actionOpenSettings')}
          </button>
        </p>
      )}
      {aiSettings !== null && localModelCapabilities(aiSettings).tools === false && (
        <AiToolsUnsupportedNotice lang={lang} />
      )}
      <AiComposer
        value={draft}
        busy={busy}
        placeholder={askPlaceholder}
        hintIdle={t('askHintIdle')}
        hintBusy={t('askHintBusy')}
        sendLabel={t('askSend')}
        stopLabel={t('askStop')}
        ariaLabel={askPlaceholder}
        iconOnly
        sendIconEnabled={<img src={sendEnterOn} alt="" aria-hidden />}
        sendIconDisabled={<img src={sendEnterOff} alt="" aria-hidden />}
        stopIcon={<img src={sendStop} alt="" aria-hidden />}
        footerStart={
          sessionUsage ? <AiUsageChip usage={sessionUsage} session lang={lang} /> : undefined
        }
        footerBelow={
          projectChat.available ? (
            <ProjectPicker
              lang={lang}
              projects={projects}
              selectedId={projectId}
              disabled={busy}
              defaultParentFolder={defaultParentFolder}
              onOpen={refreshProjects}
              onSelect={(id) => void projectChat.selectProject(id)}
              onCreate={(name, { otherPlace }) =>
                void window.projectFolderApi
                  ?.createProject({ name, otherPlace })
                  .then(chooseAddedProject)
                  .catch(showActionFailed)
              }
              onAddFolder={() =>
                void window.projectFolderApi
                  ?.addFolder()
                  .then(chooseAddedProject)
                  .catch(showActionFailed)
              }
              onRelocate={(id) =>
                void window.projectFolderApi
                  ?.relocateProject({ projectId: id })
                  .then(chooseAddedProject)
                  .catch(showActionFailed)
              }
              onSetPinned={(id, pinned) =>
                void window.projectFolderApi
                  ?.setPinned({ projectId: id, pinned })
                  .then(refreshProjects)
                  .catch(() => undefined)
              }
              onOpenInFileManager={(id) =>
                void window.projectFolderApi
                  ?.openInFileManager({ projectId: id })
                  .catch(() => undefined)
              }
              onRemoveFromList={removeProjectFromList}
            />
          ) : undefined
        }
        onChange={setDraft}
        onSend={() => {
          const text = draft.trim()
          if (!text || busy) return
          skills.withSkills(text, (skillUse) => void ask(undefined, undefined, skillUse))
        }}
        skills={skills.composer}
        onStop={() => {
          askSeqRef.current++
          loopRef.current?.cancel()
          endRunScope()
          finishLast()
        }}
      />
    </div>
  )
}

/**
 * "All / <group>": what the next ask reads. Same segmented look as the Starred
 * view's group pills. Choosing only names the group; the narrowing itself is
 * kept by the main process for the run (see KbRunScopes in knowledge-base.ts).
 */
function KbAskScopeChoice({
  groups,
  chosen,
  disabled,
  allLabel,
  ariaLabel,
  onChoose,
}: {
  groups: string[]
  chosen: string | null
  disabled: boolean
  allLabel: string
  ariaLabel: string
  onChoose: (group: string | null) => void
}): React.JSX.Element {
  const options: Array<{ group: string | null; label: string }> = [
    { group: null, label: allLabel },
    ...groups.map((group) => ({ group, label: group })),
  ]
  return (
    <div className="filter-pills kb-ask-scope" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.group ?? ''}
          type="button"
          role="radio"
          aria-checked={chosen === option.group}
          className={`filter-pill${chosen === option.group ? ' active' : ''}`}
          disabled={disabled}
          onClick={() => onChoose(option.group)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** open book for the empty-corpus hero (inline, like every Home icon) */
function IconBookOpen(): React.JSX.Element {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 6.8C10.2 5.4 7.9 4.7 5.5 4.7c-.4 0-.8 0-1.2.1v12.9c.4-.1.8-.1 1.2-.1 2.4 0 4.7.7 6.5 2.1 1.8-1.4 4.1-2.1 6.5-2.1.4 0 .8 0 1.2.1V4.8c-.4-.1-.8-.1-1.2-.1-2.4 0-4.7.7-6.5 2.1z" />
      <path d="M12 6.8v12.9" />
    </svg>
  )
}

function IconStar(): React.JSX.Element {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.6l2.6 5.2 5.8.9-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.9z" />
    </svg>
  )
}

function IconInfo(): React.JSX.Element {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.2v.01M12 11.5V16" />
    </svg>
  )
}

function IconFilePlus(): React.JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  )
}

function IconSearch(): React.JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  )
}

function IconFileText(): React.JSX.Element {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  )
}
