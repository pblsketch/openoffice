import {
  AI_QUEUE_LABELS,
  AiBlockedNotice,
  AiComposer,
  AiConnectPrompt,
  AiFirstConnectionNotice,
  AiInputTruncatedNotice,
  AiMark,
  AiModelPicker,
  type AiModelPickerBridge,
  AiPanelSideButton,
  AiQueueStrip,
  AiScopeQuote,
  type AiScopeQuoteData,
  AiSubscriptionUsageLine,
  AiTypingIndicator,
  Markdown,
  aiPanelWidthAtPointer,
  aiSubscriptionText,
  useAiSendGate,
  useChatRunQueue,
  DriveAttachButton,
  type DriveAttachPicked,
  DocAttachButton,
  NO_SKILL_USE,
  SentSkillChips,
  skillChipRefsOf,
  useComposerSkills,
  panelUserSkills,
  SkillUsedNotes,
  useSkillProposals,
  useSkillTemplates,
  type TemplateDocument,
  type SkillChipRef,
  type SkillUse,
  docMentionActions,
  type AiComposerDocs,
} from '@genoffice/ui'
import { useEffect, useRef, useState } from 'react'
import type {
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from 'react'
import {
  AgentLoop,
  type AgentImage,
  type IpcStreamError,
  composeWithDrive,
} from '@genoffice/agent-core'
import type {
  AiSettings,
  AiSubscriptionProviderId,
  AiSubscriptionUsage,
} from '@genoffice/ai-provider/browser'
import { aiLangDirective, t as tGlobal, useI18n } from '../i18n/locale'
import sendEnterOn from '../assets/send-enter-on.png'
import sendEnterOff from '../assets/send-enter-off.png'
import sendStop from '../assets/send-stop.png'
import attachIcon from '../assets/attach-icon.png'
import { ATTACHMENT_IMAGE_EXTS } from '../../shared/ipc'
import type { AttachmentAddResult, AttachmentMeta } from '../../shared/ipc'
import type { AgentPlace } from '../../../studio-plugin/agent-plugin.mjs'
import type { AgentBridge } from './agent-bridge'
import { blockedRunOf, type AiBlockedRun } from './ai-connection'
import { AttachmentList, MAX_IMAGES_PER_MESSAGE, PASTE_MIME_EXT } from './attachments'
import { createFilesSkill } from './files-skill'
import {
  SELECTION_POLL_MS,
  countWords,
  scopeExcerpt,
  scopeOf,
  scopeText,
  type SelectionScope,
} from './selection-scope'
import { createHwpSkill, type HwpChange } from './hwp-skill'
import { useSubscriptionConnection } from './subscription-client'
import { createElectronTransport } from './transport'

const PANEL_WIDTH_KEY = 'hwp-ai-panel-width'
const PANEL_WIDTH_DEFAULT = 360
const PANEL_WIDTH_MIN = 280
const TOOL_OUTPUT_MAX_CHARS = 2000
/** Told to the model with the next message after the user took a run back. */
const REVERTED_NOTE =
  '(Note: the user undid the document changes of your previous reply; the document state below is current.)'

function clampPanelWidth(w: number): number {
  // The viewport can be transiently tiny (a WebContentsView is 0×0 until the
  // shell lays it out), so never let the ceiling drop below the minimum
  const max = Math.max(PANEL_WIDTH_MIN, Math.min(720, Math.round(window.innerWidth * 0.6)))
  return Math.min(Math.max(w, PANEL_WIDTH_MIN), max)
}

function loadPanelWidth(): number {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
  // static bounds only — clamping against the window here would bake a
  // transiently small viewport into the restored preference
  return Number.isFinite(saved) && saved > 0
    ? Math.min(Math.max(saved, PANEL_WIDTH_MIN), 720)
    : PANEL_WIDTH_DEFAULT
}

interface ToolActivity {
  name: string
  summary: string
  /** still executing: rendered as a spinner chip, replaced in place when the tool finishes */
  running?: boolean
  isError?: boolean
  output?: string
}

/**
 * What one run changed in the document. Each item is one step of the editor's
 * undo history, so the run is taken back by undoing that many steps, and only
 * while nothing else has been changed since the run began.
 */
interface RunChanges {
  items: HwpChange[]
  /** the editor's count of changes made by anyone else, read when the run began */
  foreign: number
  state: 'applied' | 'reverted' | 'refused'
}

interface ChatEntry {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  isError?: boolean
  /** the run stopped because its connection cannot go on (limit used up, signed out, …) */
  blocked?: AiBlockedRun
  /** the run failed and this user message was rolled back out of the model context */
  undelivered?: boolean
  tools?: ToolActivity[]
  changes?: RunChanges
  /** attachments this message took from the composer (echoed read-only; a retry sends them again) */
  attachments?: AttachmentMeta[]
  /** the selection this message was about, frozen at send */
  scope?: AiScopeQuoteData
  /** skill chips this user message carried */
  skills?: SkillChipRef[]
  /** skill cards the model proposed in this turn (keys of useSkillProposals) */
  skillProposals?: string[]
}

const MODEL_BRIDGE: AiModelPickerBridge = {
  getSettings: () => window.hwpApi.getAiSettings(),
  setSettings: (settings) => window.hwpApi.setAiSettings(settings),
  onSettingsChanged: (handler) => window.hwpApi.onAiSettingsChanged(handler),
  openModelSettings: () => window.hwpApi.openAiModelSettings().catch(() => {}),
}

export function AiPanel({
  bridge,
  filePath,
  onCollapse,
  templateDocument,
  onSkillHandoff,
}: {
  /** the document operations of the open editor */
  bridge: AgentBridge
  /** the file of the open document: the conversation is kept with it */
  filePath: string | null
  onCollapse: () => void
  /** the document while it can go along as a skill's template (spec 5.7) */
  templateDocument?: TemplateDocument | null
  /** this tab took a request handed over by the template flow: show the panel */
  onSkillHandoff?: () => void
}): ReactElement {
  const { lang, t } = useI18n()
  const [chat, setChat] = useState<ChatEntry[]>([])
  /** the conversation shown now, for code that must decide before the next render */
  const chatNowRef = useRef(chat)
  chatNowRef.current = chat
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  /** an undo of a run is on its way to the editor */
  const [reverting, setReverting] = useState(false)
  /** the editor shows marks over what the last run changed */
  const [marksShown, setMarksShown] = useState(false)
  const filePathRef = useRef(filePath)
  /** where this document's conversation is kept, once the shell said */
  const chatIdsRef = useRef<{ projectId: string; chatId: string } | null>(null)
  /** messages sent before that was known, written once it is */
  const pendingPersistRef = useRef<
    {
      role: 'user' | 'assistant'
      text: string
      tools?: ToolActivity[]
      scope?: AiScopeQuoteData
      skills?: SkillChipRef[]
    }[]
  >([])
  /** what the tools of the run in flight did, kept with its reply */
  const runToolsRef = useRef<ToolActivity[]>([])

  /** Keep a message of the conversation with the document; a failure loses only the record. */
  const persistMessage = (
    role: 'user' | 'assistant',
    text: string,
    tools?: ToolActivity[],
    scope?: AiScopeQuoteData,
    skills?: SkillChipRef[],
  ): void => {
    const api = window.projectApi
    if (!api) return
    const ids = chatIdsRef.current
    if (!ids) {
      pendingPersistRef.current.push({ role, text, tools, scope, skills })
      return
    }
    void api
      .appendChat({
        projectId: ids.projectId,
        chatId: ids.chatId,
        role,
        text,
        ...(tools && tools.length > 0
          ? {
              tools: tools.map((tool) => ({
                name: tool.name,
                summary: tool.summary,
                ...(tool.isError ? { isError: true } : {}),
                ...(tool.output ? { output: tool.output } : {}),
              })),
            }
          : {}),
        ...(scope ? { scope } : {}),
        ...(skills && skills.length > 0 ? { skills } : {}),
      })
      .catch(() => {
        // the conversation goes on without its record
      })
  }
  /** Take the marks of the changes off the pages. */
  const clearMarks = (): void => {
    setMarksShown(false)
    void bridgeRef.current.clearMarks().catch(() => {})
  }
  /** messages queued while a reply runs; the pump re-runs them through send on settle */
  const msgQueue = useChatRunQueue<{
    attachments: AttachmentMeta[]
    /** what was selected when the message was queued; checked again when it is changed */
    scope: SelectionScope | null
    skillUse: SkillUse
  }>({
    busy,
    submit: (text, queued) => {
      const loop = loopRef.current
      if (!loop || loop.busy) return false
      // nothing can run right now: the message stays queued, and in front of "not connected"
      // the queue is paused so it does not start by itself after a sign-in
      if (!sendGateRef.current.admitQueued(() => msgQueueRef.current.setPaused(true))) return false
      return send(text, queued.attachments, queued.scope, queued.skillUse)
    },
  })
  const msgQueueRef = useRef(msgQueue)
  msgQueueRef.current = msgQueue
  /** the skills called with `/` or `$`: the list, the chips and the text a request gets */
  const skills = useComposerSkills({
    lang,
    // a chip whose skill has a template runs in a new tab (spec 5.7)
    onTemplateSkill: (request) => skillTemplatesRef.current.onTemplateSkill(request),
  })
  const skillsRef = useRef(skills)
  skillsRef.current = skills
  /** the skill cards `propose_skill` shows; nothing is written before their Save */
  const skillCards = useSkillProposals({
    lang,
    // the document goes along as a template while it can be one (spec 5.7)
    templateDocument: templateDocument ?? null,
    persistSaved: (record) => persistMessage('assistant', '', [record]),
  })
  const skillCardsRef = useRef(skillCards)
  skillCardsRef.current = skillCards
  /**
   * The template flow (spec 5.6, 5.7): a chip whose skill has a template runs
   * in a new tab, a template the model used offers its new document, and the
   * request a new tab was opened for runs here once through the send gate.
   */
  const skillTemplates = useSkillTemplates({
    lang,
    editor: 'hwp',
    cards: skillCards,
    busy,
    send: (text, use) => send(text, undefined, undefined, use),
    onTaken: onSkillHandoff,
    setComposer: setPrompt,
  })
  const skillTemplatesRef = useRef(skillTemplates)
  skillTemplatesRef.current = skillTemplates

  // ---- attachments: files the user hands over as reference material ----
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([])
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments
  const [dragOver, setDragOver] = useState(false)
  const [attachNotice, setAttachNotice] = useState<string | null>(null)
  /** data-URL previews for image attachments, keyed by path */
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, string>>({})
  const previewRequestedRef = useRef(new Set<string>())
  /** attachments consumed by earlier sends: the files skill keeps reading them in follow-up turns */
  const sentAttachmentsRef = useRef<AttachmentMeta[]>([])
  useEffect(() => {
    const wanted = [...attachments, ...chat.flatMap((entry) => entry.attachments ?? [])]
    for (const a of wanted) {
      if (!ATTACHMENT_IMAGE_EXTS.has(a.ext) || previewRequestedRef.current.has(a.path)) continue
      previewRequestedRef.current.add(a.path)
      void window.hwpApi
        .readAttachmentImage(a.path)
        .then((result) => {
          if (result.ok && result.base64 && result.mime) {
            const url = `data:${result.mime};base64,${result.base64}`
            setAttachmentPreviews((prev) => ({ ...prev, [a.path]: url }))
          }
        })
        .catch(() => {})
    }
  }, [attachments, chat])
  /** every file of this conversation, each once: what read_attachment indexes */
  const availableAttachments = (): AttachmentMeta[] => {
    const seen = new Set<string>()
    return [...sentAttachmentsRef.current, ...attachmentsRef.current].filter((a) => {
      if (seen.has(a.path)) return false
      seen.add(a.path)
      return true
    })
  }
  const showAttachNotice = (lines: string[]): void => {
    if (lines.length === 0) return
    setAttachNotice(lines.join('; '))
    window.setTimeout(() => setAttachNotice(null), 5000)
  }
  const mergeAttachments = (result: AttachmentAddResult | null): void => {
    if (!result) return
    if (result.accepted.length > 0) {
      setAttachments((prev) => {
        const have = new Set(prev.map((a) => a.path))
        return [...prev, ...result.accepted.filter((a) => !have.has(a.path))]
      })
    }
    showAttachNotice(result.rejected)
  }
  const pickAttachments = async (): Promise<void> =>
    mergeAttachments(await window.hwpApi.pickAttachments())
  /** Drive files the person ticked: attached like files from this PC, notes beside them */
  const attachFromDrive = async ({ paths, notes }: DriveAttachPicked) => {
    const added = paths.length > 0 ? await window.hwpApi.addAttachmentPaths(paths) : null
    mergeAttachments({
      accepted: added?.accepted ?? [],
      rejected: [...(added?.rejected ?? []), ...notes],
    })
  }

  /** The `@` document list in the input attaches through the same route as the buttons */
  const docMention: AiComposerDocs = {
    lang,
    ...docMentionActions({
      lang,
      add: async (paths) => (await window.hwpApi.addAttachmentPaths(paths)) ?? null,
      merge: mergeAttachments,
    }),
    attachments,
  }

  const onDrop = async (e: ReactDragEvent): Promise<void> => {
    // handled here: without this the tab would open the dropped document instead
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((file) => window.hwpApi.getPathForFile(file))
      .filter(Boolean)
    if (paths.length > 0) mergeAttachments(await window.hwpApi.addAttachmentPaths(paths))
  }
  /** pasted files with a local path go the regular way; a bare bitmap (a screenshot) is saved to a temp file first */
  const onPasteFiles = async (files: File[]): Promise<void> => {
    const paths: string[] = []
    for (const file of files) {
      const path = window.hwpApi.getPathForFile(file)
      if (path) {
        paths.push(path)
        continue
      }
      const ext = PASTE_MIME_EXT[file.type] ?? file.name.split('.').pop()?.toLowerCase() ?? 'bin'
      mergeAttachments(await window.hwpApi.addPastedImage(await file.arrayBuffer(), ext))
    }
    if (paths.length > 0) mergeAttachments(await window.hwpApi.addAttachmentPaths(paths))
  }
  const removeAttachment = (path: string): void =>
    setAttachments((prev) => prev.filter((a) => a.path !== path))
  /** image attachments ride along as multimodal input (≤5MB each, capped per message) */
  const collectImages = async (atts: AttachmentMeta[]): Promise<AgentImage[]> => {
    const imageAtts = atts.filter((a) => ATTACHMENT_IMAGE_EXTS.has(a.ext))
    const images: AgentImage[] = []
    const failures: string[] = []
    for (const att of imageAtts.slice(0, MAX_IMAGES_PER_MESSAGE)) {
      const result = await window.hwpApi.readAttachmentImage(att.path)
      if (result.ok && result.base64 && result.mime) {
        images.push({ base64: result.base64, mime: result.mime })
      } else {
        failures.push(result.error ?? t('aiImageReadFail', { name: att.name }))
      }
    }
    if (imageAtts.length > MAX_IMAGES_PER_MESSAGE) {
      failures.push(t('aiTooManyImages', { max: MAX_IMAGES_PER_MESSAGE }))
    }
    showAttachNotice(failures)
    return images
  }
  const availableAttachmentsRef = useRef(availableAttachments)
  availableAttachmentsRef.current = availableAttachments

  // ---- the selection in the editor: a request made with one is about that part ----
  const [selected, setSelected] = useState<SelectionScope | null>(null)
  /** the selection the user took out of scope with the chip's x; a new selection is in scope again */
  const [scopeCleared, setScopeCleared] = useState<string | null>(null)
  const [scopePreviewOpen, setScopePreviewOpen] = useState(false)
  useEffect(() => {
    // not during a run: the run's own changes move the editor's selection around
    if (busy) return
    let stopped = false
    const readSelection = async (): Promise<void> => {
      try {
        const result = await bridgeRef.current.selection()
        if (stopped) return
        // a selection the editor made itself to show a change is not the user's
        const next =
          result.ok && !result.own
            ? scopeOf(result.segments, result.inTable, result.contiguous)
            : null
        setSelected((prev) => (prev?.key === next?.key ? prev : next))
      } catch {
        // the editor is not ready, or is gone
      }
    }
    void readSelection()
    const timer = window.setInterval(() => void readSelection(), SELECTION_POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [busy])
  const scope = selected && selected.key !== scopeCleared ? selected : null
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  useEffect(() => {
    if (!scope) setScopePreviewOpen(false)
  }, [scope])
  /** the selection of the run in progress, for a retry of it */
  const runScopeRef = useRef<SelectionScope | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stickToBottomRef = useRef(true)
  // preferred = the user's chosen width (the only value persisted); panelWidth =
  // what fits the current window. Deriving the display width from the preference
  // means a transiently small window never permanently shrinks the panel.
  const preferredWidthRef = useRef(loadPanelWidth())
  const [panelWidth, setPanelWidth] = useState(() => clampPanelWidth(preferredWidthRef.current))
  const [resizing, setResizing] = useState(false)
  const asideRef = useRef<HTMLElement>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    const dock = asideRef.current?.closest('.ai-dock') as HTMLElement | null
    dock?.style.setProperty('--ai-panel-width', `${panelWidth}px`)
  }, [panelWidth])

  const settingsRef = useRef<AiSettings | null>(null)
  /** the settings as last read, for what the panel shows and gates (settingsRef stays the run's own copy) */
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null)
  /** connection of the two subscription providers, and the actions of their connect cards */
  const subscription = useSubscriptionConnection()
  const statuses = subscription.statuses
  const refreshSubscriptionRef = useRef(subscription.refresh)
  refreshSubscriptionRef.current = subscription.refresh
  /** The send gate every editor shares: holds a request made during a status check or in front
      of the first-connection notice, refuses in front of "not connected", and writes this
      panel's settings changes ("continue with …", the acknowledged notice) onto the stored ones */
  const sendGate = useAiSendGate<{
    text: string
    attachments?: AttachmentMeta[]
    scope: SelectionScope | null
    skillUse: SkillUse
  }>({
    settings: aiSettings,
    statuses,
    store: MODEL_BRIDGE,
    start: (held) => {
      send(held.text, held.attachments, held.scope, held.skillUse)
    },
    onNotConnected: () => refreshSubscriptionRef.current(),
    onSettingsSaved: setAiSettings,
  })
  const sendGateRef = useRef(sendGate)
  sendGateRef.current = sendGate
  useEffect(() => {
    let alive = true
    const refresh = () => {
      window.hwpApi.getAiSettings().then(
        (next) => {
          if (alive) setAiSettings(next)
        },
        () => {},
      )
    }
    const onFocus = () => {
      refresh()
      // a sign-in or install finished outside the app shows up once the window is back
      if (sendGateRef.current.peek().kind === 'connect') refreshSubscriptionRef.current()
    }
    refresh()
    window.addEventListener('focus', onFocus)
    const off = window.hwpApi.onAiSettingsChanged(refresh)
    return () => {
      alive = false
      window.removeEventListener('focus', onFocus)
      off()
    }
  }, [])
  /** the transport's structured copy of its last failure; onError matches it to its message */
  const streamErrorRef = useRef<IpcStreamError | null>(null)
  /** usage windows the subscription program reported last */
  const [subscriptionUsage, setSubscriptionUsage] = useState<AiSubscriptionUsage[]>([])
  /** the input of the last run was cut to fit a limit */
  const [inputTruncated, setInputTruncated] = useState(false)
  const langRef = useRef(lang)
  langRef.current = lang
  const bridgeRef = useRef(bridge)
  bridgeRef.current = bridge
  /** instruction of the last run, for a retry */
  const runInstructionRef = useRef('')
  /** document changes of the in-flight run, in the order they were made */
  const runChangesRef = useRef<HwpChange[]>([])
  /** foreign-change count read when the in-flight run began; null when it could not be read */
  const runForeignRef = useRef<number | null>(null)
  /** the user took the previous run back: the model is told with the next message */
  const revertedNoteDueRef = useRef(false)

  const patchLast = (patch: Partial<ChatEntry> | ((last: ChatEntry) => Partial<ChatEntry>)) => {
    setChat((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (!last || last.role !== 'assistant') return prev
      next[next.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) }
      return next
    })
  }

  /** What the finished run changed, for its last reply; absent when it changed nothing. */
  const takeRunChanges = (): { changes: RunChanges } | Record<string, never> => {
    const items = runChangesRef.current
    runChangesRef.current = []
    if (items.length === 0) return {}
    // the plugin marked each change on the pages as it made it
    setMarksShown(true)
    const foreign = runForeignRef.current
    // a run whose starting point is unknown cannot be checked, so it is not offered for undo
    return {
      changes: { items, foreign: foreign ?? -1, state: foreign === null ? 'refused' : 'applied' },
    }
  }

  const transportRef = useRef<ReturnType<typeof createElectronTransport> | null>(null)
  if (!transportRef.current)
    transportRef.current = createElectronTransport(() => settingsRef.current!, {
      lang: () => langRef.current,
      onStreamError: (error) => {
        streamErrorRef.current = error
      },
      onSubscriptionUsage: setSubscriptionUsage,
      onInputTruncated: () => setInputTruncated(true),
    })

  const skillRef = useRef<ReturnType<typeof createHwpSkill> | null>(null)
  if (!skillRef.current)
    skillRef.current = createHwpSkill({
      // through the ref: the editor behind the bridge may be replaced while the panel lives
      bridge: new Proxy({} as AgentBridge, {
        get: (_target, method: keyof AgentBridge) => bridgeRef.current[method],
      }),
      label: tGlobal,
      onChange: (change) => {
        runChangesRef.current.push(change)
        // the view follows the work: a change far down the document would go unseen
        if (change.place) void bridgeRef.current.reveal(change.place).catch(() => {})
      },
    })

  // The loop is built once; every mutable value goes through a ref getter
  const loopRef = useRef<AgentLoop | null>(null)
  if (!loopRef.current) {
    loopRef.current = new AgentLoop({
      transport: transportRef.current,
      skill: composeWithDrive('hwp+files', '', () => loopRef.current?.messages ?? [], [
        skillRef.current.skill,
        createFilesSkill(() => availableAttachmentsRef.current()),
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
      ]),
      systemSuffix: () => aiLangDirective(langRef.current),
      events: {
        onText: (text) => patchLast({ text }),
        onToolStart: (call) => {
          // Live "running" chip: replaced in place by onToolExecuted
          patchLast((last) => ({
            tools: [
              ...(last.tools ?? []),
              { name: call.name, summary: call.name.replace(/[_-]+/g, ' '), running: true },
            ],
          }))
        },
        onToolExecuted: ({ call, execution }) => {
          const activity: ToolActivity = {
            name: call.name,
            summary: execution.summary,
            isError: execution.isError,
            output: execution.output?.slice(0, TOOL_OUTPUT_MAX_CHARS),
          }
          runToolsRef.current.push(activity)
          patchLast((last) => {
            // Swap out the running placeholder pushed by onToolStart (parse-fail calls have none)
            const tools = [...(last.tools ?? [])]
            if (tools.at(-1)?.running) tools.pop()
            return { tools: [...tools, activity] }
          })
        },
        onTurnEnd: () => {
          patchLast({ streaming: false })
          setChat((prev) => [...prev, { role: 'assistant', text: '', streaming: true }])
        },
        onDone: ({ text, cancelled, turnLimit, truncated }) => {
          const base = turnLimit
            ? [text, tGlobal('aiTurnLimit')].filter(Boolean).join('\n\n')
            : text || (cancelled ? tGlobal('aiStopped') : '')
          const final = truncated
            ? [base, tGlobal('aiTruncatedNote')].filter(Boolean).join('\n\n')
            : base
          const changed = takeRunChanges()
          persistMessage('assistant', final, runToolsRef.current)
          runToolsRef.current = []
          patchLast((last) => ({
            streaming: false,
            text: final || (last.tools?.length ? last.text : tGlobal('aiNoReply')),
            // A stop mid-tool can leave a running placeholder behind — drop it
            tools: last.tools?.filter((tl) => !tl.running),
            ...changed,
          }))
          setBusy(false)
        },
        onError: (error) => {
          const blocked = blockedRunOf(streamErrorRef.current, error)
          streamErrorRef.current = null
          if (blocked) {
            // the queue must not fire one message after another into the same wall
            msgQueueRef.current.hold()
            refreshSubscriptionRef.current()
          }
          // a run can fail after it already changed the document: those changes stay listed
          const changed = takeRunChanges()
          setChat((prev) => {
            const next = [...prev]
            for (let i = next.length - 1; i >= 0; i--) {
              const entry = next[i]!
              if (entry.role === 'user') {
                next[i] = { ...entry, undelivered: true }
                break
              }
            }
            const last = next.at(-1)
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                streaming: false,
                text: error,
                isError: true,
                ...(blocked ? { blocked } : {}),
                tools: last.tools?.filter((tl) => !tl.running),
                ...changed,
              }
            }
            return next
          })
          setBusy(false)
        },
      },
    })
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      loopRef.current?.cancel()
    }
  }, [])

  useEffect(() => {
    if (stickToBottomRef.current) {
      chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight })
    }
  }, [chat, busy, inputTruncated])

  const onChatScroll = (): void => {
    const el = chatRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  /**
   * No run was started: the connect prompt / the first-connection notice at the
   * end of the chat is the answer, so it is brought into view.
   */
  const showWhatHoldsTheSend = (): void => {
    stickToBottomRef.current = true
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight })
  }

  /** the attachments of the run in progress, for a retry of it */
  const runAttachmentsRef = useRef<AttachmentMeta[]>([])
  /** the skills of the run in progress: a retry sends the same skill text */
  const runSkillUseRef = useRef<SkillUse>(NO_SKILL_USE)

  /** Returns false when no run was started (the text stays with the caller). */
  const send = (
    text: string,
    attachmentsOverride?: AttachmentMeta[],
    /** undefined: what is selected now; a value: what was selected when the message was written */
    scopeOverride?: SelectionScope | null,
    /** the chosen skills: their text goes to the model, their chips onto the bubble */
    skillUse: SkillUse = NO_SKILL_USE,
  ): boolean => {
    const instruction = text.trim()
    const loop = loopRef.current
    if (!instruction || !loop || loop.busy || reverting) return false
    // A request made during a status check or in front of the first-connection notice is
    // held and starts by itself once the way is clear; in front of "not connected" nothing
    // is kept. Either way nothing is sent now and the text stays with the caller.
    const sentScope = scopeOverride === undefined ? scopeRef.current : scopeOverride
    if (
      !sendGate.admit({
        text: instruction,
        attachments: attachmentsOverride,
        scope: sentScope,
        skillUse,
      })
    ) {
      showWhatHoldsTheSend()
      return false
    }
    stickToBottomRef.current = true
    streamErrorRef.current = null
    setInputTruncated(false)
    runInstructionRef.current = instruction
    runChangesRef.current = []
    runForeignRef.current = null
    // the marks show what the last run did; a new run starts without them
    clearMarks()
    // the message takes the composer's attachments: echoed on the bubble, images sent with
    // it, the other files read through the files skill, now and in later turns
    const sentAtts = attachmentsOverride ?? attachmentsRef.current
    if (sentAtts.length > 0) {
      const seen = new Set(sentAttachmentsRef.current.map((a) => a.path))
      sentAttachmentsRef.current = [
        ...sentAttachmentsRef.current,
        ...sentAtts.filter((a) => !seen.has(a.path)),
      ]
      if (!attachmentsOverride) setAttachments([])
    }
    runAttachmentsRef.current = sentAtts
    runScopeRef.current = sentScope
    skillRef.current!.setSelection(sentScope)
    const scopeQuote: AiScopeQuoteData | undefined = sentScope
      ? {
          label: t('aiScopeSelection', { words: countWords(scopeText(sentScope)) }),
          text: scopeExcerpt(sentScope),
        }
      : undefined
    runToolsRef.current = []
    persistMessage('user', instruction, undefined, scopeQuote, skillUse.chips)
    setChat((prev) => [
      ...prev,
      {
        role: 'user',
        text: instruction,
        ...(sentAtts.length > 0 ? { attachments: sentAtts } : {}),
        ...(scopeQuote ? { scope: scopeQuote } : {}),
        ...(skillUse.chips.length > 0 ? { skills: skillUse.chips } : {}),
      },
      { role: 'assistant', text: '', streaming: true },
    ])
    setPrompt('')
    skillsRef.current.consume(skillUse)
    skillTemplatesRef.current.noteRequest(text)
    runSkillUseRef.current = skillUse
    setBusy(true)
    void (async () => {
      try {
        const [settings, foreign, images] = await Promise.all([
          window.hwpApi.getAiSettings(),
          bridgeRef.current.foreignChanges().catch(() => null),
          sentAtts.length > 0 ? collectImages(sentAtts) : Promise.resolve([]),
          skillRef.current!.refreshContext(),
        ])
        settingsRef.current = settings
        runForeignRef.current = foreign
        if (!mountedRef.current) return
        setAiSettings(settings)
        const noted = revertedNoteDueRef.current
        revertedNoteDueRef.current = false
        // the skill text rides with this request only; the bubble and the record keep the chips
        const asked = instruction + skillUse.text
        loop.run(
          noted ? `${REVERTED_NOTE}\n\n${asked}` : asked,
          images.length > 0 ? images : undefined,
        )
      } catch (err) {
        if (!mountedRef.current) return
        patchLast({
          streaming: false,
          text: err instanceof Error ? err.message : String(err),
          isError: true,
        })
        setBusy(false)
      }
    })()
    return true
  }

  const stop = (): void => {
    msgQueue.hold()
    loopRef.current?.cancel()
  }

  /** Enter while a reply runs: the draft joins the queue above the composer */
  const enqueueDraft = () => {
    const text = prompt.trim()
    if (!text) return
    skills.withSkills(text, (skillUse) => enqueueWith(text, skillUse))
  }
  const enqueueWith = (text: string, skillUse: SkillUse) => {
    skillsRef.current.consume(skillUse)
    // the queued message owns the composer's attachments and the selection it was written
    // about; the pump hands them back to send
    msgQueue.enqueue(text, {
      attachments: attachmentsRef.current,
      scope: scopeRef.current,
      skillUse,
    })
    setAttachments([])
    setPrompt('')
  }

  const retry = (): void => {
    send(
      runInstructionRef.current,
      runAttachmentsRef.current,
      runScopeRef.current,
      runSkillUseRef.current,
    )
  }

  /** A send typed in the composer: the chosen skills are read first, then it goes out. */
  const sendPrompt = (): void => {
    const text = prompt.trim()
    if (!text) return
    skills.withSkills(text, (skillUse) => send(text, undefined, undefined, skillUse))
  }

  /** "Continue with …" on a blocked run: that provider becomes the selection, then the request reruns */
  const continueWith = (provider: AiSubscriptionProviderId): void =>
    sendGate.continueWith(provider, retry)

  const copyMessage = (text: string, idx: number): void => {
    void navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    window.setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1200)
  }

  // The editor's history is one stack: only the newest run still in the document can be
  // taken back, and a run that could not be taken back whole blocks the ones under it.
  const revertableIdx = (() => {
    for (let i = chat.length - 1; i >= 0; i--) {
      const state = chat[i]!.changes?.state
      if (state === 'applied') return i
      if (state === 'refused') return -1
    }
    return -1
  })()
  /** the newest user message: the one the last run (and its skills) belongs to */
  const lastUserIdx = chat.map((entry) => entry.role).lastIndexOf('user')

  const revert = (idx: number): void => {
    const changes = chat[idx]?.changes
    if (!changes || changes.state !== 'applied' || idx !== revertableIdx || busy || reverting)
      return
    const settle = (state: RunChanges['state']): void => {
      if (!mountedRef.current) return
      setChat((prev) =>
        prev.map((entry, i) =>
          i === idx && entry.changes ? { ...entry, changes: { ...entry.changes, state } } : entry,
        ),
      )
      if (state === 'reverted') {
        revertedNoteDueRef.current = true
        // what they marked was taken back
        clearMarks()
      }
      setReverting(false)
    }
    setReverting(true)
    bridgeRef.current.undo(changes.items.length, changes.foreign).then(
      (result) => settle(result.ok ? 'reverted' : 'refused'),
      () => settle('refused'),
    )
  }

  // the conversation kept with this document: bound to its file, restored when the panel opens
  useEffect(() => {
    const api = window.projectApi
    if (!api) return
    void api
      .resolveChat({ filePath: filePathRef.current ?? null, tempChatId: `unsaved-${Date.now()}` })
      .then((ids) => {
        chatIdsRef.current = ids
        for (const msg of pendingPersistRef.current.splice(0)) {
          persistMessage(msg.role, msg.text, msg.tools, msg.scope, msg.skills)
        }
        return api.loadChat({ projectId: ids.projectId, chatId: ids.chatId, limit: 200 })
      })
      .then((stored) => {
        if (!mountedRef.current || stored.length === 0) return
        // a message the user sent while the record loaded is not replaced. Decided here and
        // not in the state update, which React runs later: the model is to get the same
        if (chatNowRef.current.length > 0 || loopRef.current?.busy) return
        // skill cards come back closed; a saved card's record is not part of the conversation
        const messages = skillCardsRef.current.restore(stored)
        setChat(
          messages.map((message) => ({
            role: message.role,
            text: message.text,
            ...(message.tools
              ? {
                  tools: message.tools.map((tool) => ({
                    name: tool.name,
                    summary: tool.summary,
                    isError: tool.isError,
                    output: tool.output?.slice(0, TOOL_OUTPUT_MAX_CHARS),
                  })),
                }
              : {}),
            ...(message.scope ? { scope: message.scope } : {}),
            ...(message.role === 'user' && skillChipRefsOf(message.skills).length > 0
              ? { skills: skillChipRefsOf(message.skills) }
              : {}),
            ...(message.skillProposals ? { skillProposals: message.skillProposals } : {}),
          })),
        )
        // the next request re-reads the current text of the skills this conversation used
        skillsRef.current.restoreHistory(
          messages.map((message) =>
            message.role === 'user' ? skillChipRefsOf(message.skills) : undefined,
          ),
        )
        loopRef.current?.restore(
          messages.map((message) => ({ role: message.role, text: message.text })),
        )
      })
      .catch(() => {
        // the panel opens without the earlier conversation
      })
  }, [])

  // a document saved under a name for the first time takes its conversation along
  useEffect(() => {
    filePathRef.current = filePath
    const ids = chatIdsRef.current
    if (!window.projectApi || !ids || !filePath || !ids.chatId.startsWith('unsaved-')) return
    void window.projectApi
      .rebindChat({ projectId: ids.projectId, tempChatId: ids.chatId, newFilePath: filePath })
      .then((rebound) => {
        if (rebound?.chatId) chatIdsRef.current = rebound
      })
      .catch(() => {
        // the conversation stays where it was kept
      })
  }, [filePath])

  // Re-derive the display width on window resize (max is 60% of the window);
  // growing the window back restores the preferred width
  useEffect(() => {
    const onResize = (): void => setPanelWidth(clampPanelWidth(preferredWidthRef.current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanupRef.current?.(), [])

  /** Drag the inner panel edge to resize from the selected window side. */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const resizer = e.currentTarget
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: PointerEvent): void => {
      const w = clampPanelWidth(aiPanelWidthAtPointer(ev.clientX))
      preferredWidthRef.current = w
      setPanelWidth(w)
    }
    let done = false
    const cleanup = (): void => {
      if (done) return
      done = true
      resizeCleanupRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      resizer.removeEventListener('lostpointercapture', cleanup)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setResizing(false)
      localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(preferredWidthRef.current)))
    }
    resizeCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
    resizer.addEventListener('lostpointercapture', cleanup)
    resizer.setPointerCapture(e.pointerId)
  }

  const starter = (text: string): void => {
    setPrompt(text)
    inputRef.current?.focus()
  }

  return (
    <aside
      ref={asideRef}
      className={`copilot${resizing ? ' ai-panel-resizing' : ''}${dragOver ? ' ai-panel-dragover' : ''}`}
      style={{ width: '100%' }}
      dir={lang === 'ar' || lang === 'he' ? 'rtl' : undefined}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
      }}
      onDrop={(e) => void onDrop(e)}
    >
      <div
        className="ai-panel-resizer"
        onPointerDown={startResize}
        role="separator"
        aria-orientation="vertical"
        aria-label={aiSubscriptionText(lang, 'aiAssistant')}
      />
      <header className="ai-panel-header">
        <span className="ai-panel-title">
          <AiMark size={22} />
          {aiSubscriptionText(lang, 'aiAssistant')}
        </span>
        <div className="ai-panel-header-actions">
          <AiPanelSideButton
            lang={lang}
            onMove={(side) => window.hwpApi.setAiPanelPrefs({ side })}
          />
          {chat.length > 0 && (
            <button
              className="ai-header-btn"
              onClick={() => {
                stop()
                msgQueue.clear()
                sendGate.reset()
                loopRef.current?.reset()
                revertedNoteDueRef.current = false
                sentAttachmentsRef.current = []
                setAttachments([])
                setScopeCleared(null)
                setBusy(false)
                setChat([])
                skills.resetConversation()
                skillCards.reset()
                skillTemplates.reset()
                clearMarks()
              }}
              data-tip={t('aiNewChat')}
              aria-label={t('aiNewChat')}
            >
              <IconNewChat />
            </button>
          )}
          <button
            className="ai-header-btn ai-panel-collapse"
            onClick={onCollapse}
            data-tip={t('aiCollapsePanel')}
            aria-label={t('aiCollapsePanel')}
          >
            <IconCollapse />
          </button>
        </div>
      </header>

      <div className="ai-chat" ref={chatRef} onScroll={onChatScroll}>
        {chat.length === 0 && (
          <div className="ai-chat-empty">
            <div className="ai-chat-empty-title">{t('aiEmptyTitle')}</div>
            <div className="ai-chat-empty-body">{t('aiEmptyBody')}</div>
            <div className="ai-starter-list">
              <button className="ai-starter" onClick={() => starter(t('aiStarterSummarizePrompt'))}>
                {t('aiStarterSummarize')}
              </button>
              <button className="ai-starter" onClick={() => starter(t('aiStarterProofreadPrompt'))}>
                {t('aiStarterProofread')}
              </button>
            </div>
          </div>
        )}
        {chat.map((entry, i) => {
          if (entry.role === 'user') {
            return (
              <div key={i} className="ai-msg ai-msg-user">
                {entry.scope && <AiScopeQuote scope={entry.scope} />}
                <SentSkillChips lang={lang} chips={entry.skills} isAvailable={skills.isAvailable} />
                {entry.attachments && entry.attachments.length > 0 && (
                  <div className="ai-msg-attachments">
                    <AttachmentList atts={entry.attachments} previews={attachmentPreviews} />
                  </div>
                )}
                <span dir="auto">{entry.text}</span>
                {entry.undelivered && (
                  <div className="ai-msg-undelivered">
                    {t('aiUndelivered')}
                    {!busy && (
                      <button
                        className="ai-retry-btn"
                        onClick={() =>
                          send(
                            entry.text,
                            entry.attachments ?? [],
                            null,
                            // the newest message is the run that failed: its skills go again
                            i === lastUserIdx ? runSkillUseRef.current : NO_SKILL_USE,
                          )
                        }
                      >
                        {t('aiRetry')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          }
          const hasTools = (entry.tools?.length ?? 0) > 0
          if (!entry.text && !entry.streaming && !hasTools && !entry.changes) return null
          const isLast = i === chat.length - 1
          // Action row appears once per completed reply: on the turn's final segment only
          // (mid-turn segments have a following assistant entry; the live turn ends when !busy)
          const nextEntry = chat[i + 1]
          const turnEnded = nextEntry ? nextEntry.role === 'user' : !busy
          const showToolbar = !entry.streaming && turnEnded && !!entry.text && !entry.isError
          const blocked = entry.blocked
          return (
            <div
              key={i}
              className={`ai-msg ai-msg-assistant${entry.isError && !blocked ? ' ai-msg-error' : ''}${entry.streaming ? ' ai-msg-streaming' : ''}`}
            >
              {!entry.text && entry.streaming ? (
                <span className="ai-typing-row">
                  <AiTypingIndicator label={hasTools ? t('aiWorking') : t('aiThinking')} />
                </span>
              ) : blocked ? (
                <AiBlockedNotice
                  kind={blocked.kind}
                  provider={blocked.provider}
                  resetsAt={blocked.resetsAt}
                  message={entry.text}
                  settings={aiSettings ?? {}}
                  // the continue button belongs to the run that just stopped, not to older replies
                  statuses={isLast && !busy ? (statuses ?? {}) : {}}
                  lang={lang}
                  onContinueWith={continueWith}
                />
              ) : (
                entry.text && (
                  <div dir="auto">
                    <Markdown text={entry.text} />
                  </div>
                )
              )}
              {hasTools && <ToolChipList tools={entry.tools!} />}
              <SkillUsedNotes tools={entry.tools} />
              {entry.skillProposals?.map((key) => skillCards.render(key))}
              {entry.changes && (
                <RunChangesCard
                  changes={entry.changes}
                  canRevert={i === revertableIdx && !busy && !reverting}
                  onRevert={() => revert(i)}
                  onClearMarks={i === revertableIdx && marksShown ? clearMarks : null}
                  onShow={(place) => void bridgeRef.current.reveal(place).catch(() => {})}
                />
              )}
              {showToolbar && (
                <div className="ai-msg-toolbar">
                  <button
                    className="ai-msg-tool-btn"
                    onClick={() => copyMessage(entry.text, i)}
                    aria-label={t('aiCopyReplyTitle')}
                    data-tip={t('aiCopyReplyTitle')}
                  >
                    {copiedIdx === i ? <IconCheck /> : <IconCopy />}
                  </button>
                </div>
              )}
            </div>
          )
        })}
        {skillTemplates.notes}
        {sendGate.connectChoice && (
          <AiConnectPrompt
            choice={sendGate.connectChoice}
            statuses={statuses ?? {}}
            lang={lang}
            disabled={subscription.busy}
            attention={sendGate.connectAttention}
            onOpenSettings={() => void window.hwpApi.openAiModelSettings().catch(() => {})}
            onInstall={subscription.install}
            onUpdate={subscription.update}
            onCancelLogin={subscription.cancelLogin}
            onLogin={subscription.login}
            onRecheck={subscription.recheck}
            onAcceptMetered={subscription.acceptMetered}
            onOpenInstallHelp={subscription.openInstallHelp}
            onOpenConnectHelp={subscription.openConnectHelp}
          />
        )}
        {sendGate.noticeDue && (
          <AiFirstConnectionNotice
            lang={lang}
            codexKeepsHistory
            onAcknowledge={sendGate.acknowledgeNotice}
          />
        )}
        {inputTruncated && (
          <AiInputTruncatedNotice lang={lang} onDismiss={() => setInputTruncated(false)} />
        )}
      </div>

      <div className="ai-composer">
        {attachments.length > 0 && (
          <div className="ai-attachments">
            <AttachmentList
              atts={attachments}
              previews={attachmentPreviews}
              onRemove={removeAttachment}
              removeLabel={t('aiRemoveAttachmentTitle')}
            />
          </div>
        )}
        {attachNotice && <div className="ai-attach-notice">{attachNotice}</div>}
        <AiComposer
          queueStrip={
            <AiQueueStrip
              items={msgQueue.queued}
              labels={AI_QUEUE_LABELS[lang]}
              onUpdate={msgQueue.update}
              onRemove={msgQueue.remove}
              onClear={msgQueue.clear}
              paused={msgQueue.paused}
              onTogglePause={msgQueue.togglePaused}
              onMove={msgQueue.move}
            />
          }
          onQueue={enqueueDraft}
          queuePlaceholder={AI_QUEUE_LABELS[lang].queuePlaceholder}
          value={prompt}
          busy={busy}
          header={
            scope && (
              <div className="ai-scope-row">
                <span className="ai-scope-hint">
                  <button
                    className="ai-scope-label"
                    onClick={() => setScopePreviewOpen((open) => !open)}
                    aria-expanded={scopePreviewOpen}
                    data-tip={t('aiScopeSelectionTip')}
                  >
                    {t('aiScopeSelection', { words: countWords(scopeText(scope)) })}
                  </button>
                  <button
                    className="ai-scope-clear"
                    onClick={() => setScopeCleared(scope.key)}
                    data-tip={t('aiScopeClearTitle')}
                    aria-label={t('aiScopeClearTitle')}
                  >
                    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
                      <path
                        d="M4 4l8 8M12 4l-8 8"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </span>
                {scopePreviewOpen && (
                  <div className="ai-scope-preview">
                    {scopeText(scope).length > 400
                      ? `${scopeText(scope).slice(0, 400)}…`
                      : scopeText(scope)}
                  </div>
                )}
              </div>
            )
          }
          placeholder={t('aiComposerPlaceholder')}
          hintIdle={t('aiHintIdle')}
          hintBusy={t('aiHintBusy')}
          sendLabel={t('aiSend')}
          stopLabel={t('aiStop')}
          iconOnly
          footerStart={
            <>
              <AiModelPicker
                bridge={MODEL_BRIDGE}
                lang={lang}
                subscriptionStatuses={statuses ?? {}}
                onRefreshSubscriptions={subscription.refresh}
              />
              <AiSubscriptionUsageLine usage={subscriptionUsage} lang={lang} />
              <button
                type="button"
                className="ai-attach-btn"
                onClick={() => void pickAttachments()}
                data-tip={t('aiAttachTitle')}
                aria-label={t('aiAttachTitle')}
              >
                <img src={attachIcon} alt="" aria-hidden />
              </button>
              <DriveAttachButton lang={lang} onPicked={attachFromDrive} />
              <DocAttachButton lang={lang} onPicked={attachFromDrive} />
            </>
          }
          onPasteFiles={(files) => void onPasteFiles(files)}
          sendIconEnabled={<img src={sendEnterOn} alt="" aria-hidden />}
          sendIconDisabled={<img src={sendEnterOff} alt="" aria-hidden />}
          stopIcon={<img src={sendStop} alt="" aria-hidden />}
          textareaRef={inputRef}
          onChange={setPrompt}
          onSend={sendPrompt}
          skills={skills.composer}
          docs={docMention}
          onStop={stop}
        />
      </div>
    </aside>
  )
}

/** What a run changed in the document, with the button that takes the whole run back. */
function RunChangesCard({
  changes,
  canRevert,
  onRevert,
  onClearMarks,
  onShow,
}: {
  changes: RunChanges
  canRevert: boolean
  onRevert: () => void
  /** set while the editor marks these changes on the pages */
  onClearMarks: (() => void) | null
  onShow: (place: AgentPlace) => void
}): ReactElement {
  const { t } = useI18n()
  const count = changes.items.reduce((sum, item) => sum + item.count, 0)
  return (
    <div className={`ai-changes ai-changes-${changes.state}`}>
      <div className="ai-changes-head">
        <span className="ai-changes-title">
          {changes.state === 'reverted' ? t('aiReverted') : t('aiChangesTitle', { count })}
        </span>
        {onClearMarks && changes.state === 'applied' && (
          <button className="ai-changes-unmark" onClick={onClearMarks}>
            {t('aiClearMarks')}
          </button>
        )}
        {changes.state === 'applied' && (
          <button className="ai-changes-revert" disabled={!canRevert} onClick={onRevert}>
            {t('aiRevert')}
          </button>
        )}
      </div>
      <ul className="ai-changes-list">
        {changes.items.map((item, j) => (
          <li key={j} className="ai-change" dir="auto">
            {item.place && changes.state !== 'reverted' ? (
              // a place that was taken back is no longer there to show
              <button
                type="button"
                className="ai-change-go"
                data-tip={t('aiShowChange')}
                onClick={() => onShow(item.place!)}
              >
                <ChangeLine item={item} />
              </button>
            ) : (
              <ChangeLine item={item} />
            )}
          </li>
        ))}
      </ul>
      {changes.state === 'refused' && (
        <div className="ai-changes-note" role="status">
          {t('aiRevertRefused')}
        </div>
      )}
    </div>
  )
}

/** One change as a line: what went (struck through), what came, marked the same in every language. */
function ChangeLine({ item }: { item: HwpChange }): ReactElement {
  if (item.kind === 'insert' || item.kind === 'table') {
    return (
      <>
        <span className="ai-change-mark" aria-hidden>
          {item.kind === 'table' ? '+ ▦' : '+'}
        </span>
        <ins className="ai-change-to">{item.to}</ins>
      </>
    )
  }
  if (item.kind === 'delete') {
    return (
      <>
        <span className="ai-change-mark" aria-hidden>
          −
        </span>
        <del className="ai-change-from">{item.from}</del>
      </>
    )
  }
  return (
    <>
      {item.kind === 'field' ||
      item.kind === 'format' ||
      item.kind === 'cells' ||
      item.kind === 'lines' ||
      item.kind === 'note' ? (
        // named, not struck through: this text stays, it is what the change was done to
        <span className="ai-change-field">{item.from}</span>
      ) : (
        <del className="ai-change-from">{item.from}</del>
      )}
      <span className="ai-change-arrow" aria-hidden>
        →
      </span>
      <ins className="ai-change-to">{item.to}</ins>
      {item.count > 1 && <span className="ai-change-count">×{item.count}</span>}
    </>
  )
}

/** Step-row status icons (timeline glyphs, unified with the other apps) */
function StepIcon({ status }: { status: 'running' | 'done' | 'error' }) {
  if (status === 'running') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6.5 3.5h11M6.5 20.5h11M8 3.5v3.2c0 2.6 4 4.2 4 5.3 0 1.1 4 2.7 4 5.3v3.2M16 3.5v3.2c0 2.6-4 4.2-4 5.3 0 1.1-4 2.7-4 5.3v3.2" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.4 2.4 2.4 4.6-5" />
    </svg>
  )
}

/** Tool activity group (docs parity): auto-opens while tools run, auto-collapses into
 *  "Worked · N steps" when they finish; a manual toggle always wins */
function ToolChipList({ tools }: { tools: ToolActivity[] }) {
  const { t: tr } = useI18n()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [userOpen, setUserOpen] = useState<boolean | null>(null)

  const toggle = (j: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(j)) next.delete(j)
      else next.add(j)
      return next
    })
  }

  const anyRunning = tools.some((tool) => tool.running)
  const open = userOpen ?? anyRunning
  const label = anyRunning ? tr('aiGroupWorking') : tr('aiWorkedSteps', { n: tools.length })

  return (
    <div className="ai-work-group">
      <button
        type="button"
        className={`ai-work-group-summary${anyRunning ? ' running' : ''}`}
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
      >
        {anyRunning && !open && <span className="ai-tool-chip-spinner" aria-hidden />}
        <span className="ai-work-group-label">{label}</span>
        <span className={`ai-tool-chip-caret${open ? ' open' : ''}`} aria-hidden>
          ›
        </span>
      </button>
      <div className={`ai-work-group-body${open ? ' open' : ''}`}>
        <div className="ai-work-group-body-inner">
          {tools.map((tool, j) => {
            const hasOutput = !tool.running && !!tool.output
            const isOpen = expanded.has(j)
            const stepStatus = tool.running ? 'running' : tool.isError ? 'error' : 'done'
            return (
              <div key={j} className="ai-step-row">
                <span className={`ai-step-icon ${stepStatus}`} aria-hidden>
                  <StepIcon status={stepStatus} />
                </span>
                <div className="ai-step-content">
                  {hasOutput ? (
                    <button
                      type="button"
                      className="ai-step-title clickable"
                      data-tip={tool.name}
                      aria-expanded={isOpen}
                      onClick={() => toggle(j)}
                    >
                      {tool.summary}
                    </button>
                  ) : (
                    <span className="ai-step-title" data-tip={tool.name}>
                      {tool.summary}
                    </span>
                  )}
                  {hasOutput && isOpen && (
                    <div className="ai-step-detail">
                      <div className="ai-tool-output">
                        <div className="ai-tool-output-pre">{tool.output}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function IconNewChat(): ReactElement {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden
    >
      <path
        d="M13.5 7.2v-3A1.7 1.7 0 0 0 11.8 2.5H4.2a1.7 1.7 0 0 0-1.7 1.7v6.1a1.7 1.7 0 0 0 1.7 1.7h1.1v2l2.6-2h1.3"
        strokeLinejoin="round"
      />
      <path d="M12.2 9.4v4M10.2 11.4h4" />
    </svg>
  )
}

function IconCollapse(): ReactElement {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M5.5 2.5v11" />
      <path d="M12.5 8H8.1M9.8 5.9 7.7 8l2.1 2.1" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function IconCheck(): ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconCopy(): ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M14.6113 5.34253C16.0608 5.3428 17.2363 6.518 17.2363 7.96753V15.5066C17.2361 16.956 16.0607 18.1313 14.6113 18.1316H7.07227C5.62267 18.1316 4.44751 16.9561 4.44727 15.5066V7.96753C4.44732 6.51783 5.62255 5.34253 7.07227 5.34253H14.6113ZM7.07227 6.59253C6.31291 6.59253 5.69732 7.20819 5.69727 7.96753V15.5066C5.69751 16.2658 6.31302 16.8816 7.07227 16.8816H14.6113C15.3703 16.8813 15.9861 16.2656 15.9863 15.5066V7.96753C15.9863 7.20835 15.3705 6.5928 14.6113 6.59253H7.07227ZM10.0176 2.8689C10.3626 2.86905 10.6426 3.14882 10.6426 3.4939C10.6425 3.83888 10.3626 4.11874 10.0176 4.1189H4.59961C3.84022 4.1189 3.22461 4.73451 3.22461 5.4939V11.324C3.22433 11.6689 2.94461 11.949 2.59961 11.949C2.25461 11.949 1.97489 11.6689 1.97461 11.324V5.4939C1.97461 4.04415 3.14987 2.8689 4.59961 2.8689H10.0176Z"
        fill="currentColor"
      />
    </svg>
  )
}
