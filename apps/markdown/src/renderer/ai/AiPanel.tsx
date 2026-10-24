import {
  aiPanelWidthAtPointer,
  AiPanelSideButton,
  AiModelPicker,
  type AiModelPickerBridge,
  AiBlockedNotice,
  AiConnectPrompt,
  AiFirstConnectionNotice,
  AiInputTruncatedNotice,
  AiMark,
  AiSubscriptionUsageLine,
  aiSubscriptionText,
  useAiSendGate,
} from '@genoffice/ui'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react'
import {
  AgentLoop,
  streamText,
  type IpcStreamError,
  type MindMapTreeNode,
  composeWithDrive,
} from '@genoffice/agent-core'
import type {
  AiSettings,
  AiSubscriptionProviderId,
  AiSubscriptionUsage,
} from '@genoffice/ai-provider/browser'
import {
  AiComposer,
  AiQueueStrip,
  AI_QUEUE_LABELS,
  AiScopeQuote,
  AiTypingIndicator,
  AiUsageChip,
  addTokenUsage,
  createFileNav,
  Markdown,
  useChatRunQueue,
  NO_SKILL_USE,
  SentSkillChips,
  skillChipRefsOf,
  useComposerSkills,
  panelUserSkills,
  SkillUsedNotes,
  useSkillProposals,
  useSkillTemplates,
  type TemplateDocument,
  type AiScopeQuoteData,
  type AiTokenUsageView,
  type SkillChipRef,
  type SkillUse,
} from '@genoffice/ui'
import type { Editor } from '@tiptap/core'
import { aiLangDirective, t as tGlobal, useI18n } from '../i18n/locale'
import sendEnterOn from '../assets/send-enter-on.png'
import sendEnterOff from '../assets/send-enter-off.png'
import sendStop from '../assets/send-stop.png'
import { clearAiHighlights } from '../editor/aiHighlight'
import { setInactiveSelectionShown } from '../editor/inactiveSelection'
import { createMarkdownSkill, MARKDOWN_RULES } from './markdown-skill'
import { MindMapCard } from './MindMapCard'
import {
  buildDocWriterRequest,
  countMarkdownBlocks,
  DOC_MAX_CHARS,
  extractMarkdown,
  type DocWriteResult,
  type DocWriteSpec,
} from './doc-writer'
import { createSearchSkill } from './search-skill'
import { createElectronTransport } from './transport'
import { blockedRunOf, readImageGenerationAvailable, type AiBlockedRun } from './ai-connection'
import { useSubscriptionConnection } from './subscription-client'
import { EditQueueCard } from './EditQueueCard'
import {
  buildQueueInstruction,
  buildQueueSummary,
  liveItems,
  resolveQueue,
  type EditQueueItem,
} from './edit-queue'
import { DOC_NAV_SCHEME, navigateToBlock, parseDocNavHref } from './doc-nav'

// Word-parity count (docs word-count.ts): Asian chars one by one + non-Asian words
const ASIAN_RE =
  /[ᄀ-ᇿ⺀-⿟、-〿぀-ヿ㄀-ㄯ㄰-㆏㇀-ㇿ㐀-䶿一-鿿가-힯豈-﫿！-｠￠-￦]|[\uD840-\uD87F][\uDC00-\uDFFF]/g
const NON_ASIAN_WORD_RE = /[A-Za-z0-9À-ɏ]+(?:['-][A-Za-z0-9À-ɏ]+)*/g

function countWords(text: string): number {
  return (text.match(ASIAN_RE) ?? []).length + (text.match(NON_ASIAN_WORD_RE) ?? []).length
}

const PANEL_WIDTH_KEY = 'markdown-ai-panel-width'
const PANEL_WIDTH_DEFAULT = 360
const PANEL_WIDTH_MIN = 280
const MAX_SNAPSHOTS = 20
const TOOL_OUTPUT_MAX_CHARS = 2000
/** progress chip refresh while a write streams */
const CHIP_UPDATE_MS = 400

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
  /** interactive mind map from generate_mindmap's side-channel display (session-only;
   * the persisted transcript keeps the tool call, so a reopened file can regenerate) */
  mindmap?: MindMapTreeNode
  /** the selection this user message targeted, frozen at send */
  scope?: AiScopeQuoteData
  /** skill chips this user message carried */
  skills?: SkillChipRef[]
  /** skill cards the model proposed in this turn (keys of useSkillProposals) */
  skillProposals?: string[]
  /** tokens the provider billed for this reply, summed across its turns (absent when unreported) */
  usage?: AiTokenUsageView
}

/** longest selection excerpt echoed on a user bubble */
const SCOPE_TEXT_MAX = 200

/** structured, not the serialized file text: a body starting with `---` must
 *  never be re-parsed as a frontmatter block on rollback */
export interface DocSnapshot {
  /** document body as markdown */
  body: string
  /** raw frontmatter block (fences included), kept byte-for-byte */
  frontmatter: string
}

interface Snapshot {
  label: string
  time: string
  doc: DocSnapshot
}

/** Ribbon preset instruction; a new nonce triggers one auto-send */
export interface AiPreset {
  text: string
  nonce: number
}

export interface MarkdownAiDeps {
  getEditor(): Editor | null
  /** inner YAML of the properties block, read synchronously (write-then-read within one run) */
  getFrontmatter(): string
  /** replace the properties block; empty string removes it */
  setFrontmatter(inner: string): void
  /** document body + frontmatter, for pre-mutation snapshots */
  getSnapshot(): DocSnapshot
  /** rollback: replace the document (body and frontmatter) with a snapshot */
  restoreSnapshot(snapshot: DocSnapshot): void
  /** fired when a run with at least one mutation finishes (auto-save hook) */
  onRunDone(mutated: boolean): void
}

const MODEL_BRIDGE: AiModelPickerBridge = {
  getSettings: () => window.markdownApi.getAiSettings(),
  setSettings: (settings) => window.markdownApi.setAiSettings(settings),
  onSettingsChanged: (handler) => window.markdownApi.onAiSettingsChanged(handler),
  openModelSettings: () => window.markdownApi.openAiModelSettings().catch(() => {}),
}

export function AiPanel({
  deps,
  filePath,
  preset,
  onCollapse,
  editQueue = [],
  onQueueEditInstruction,
  onQueueRemove,
  onQueueClear,
  onQueueFocus,
  onQueueConsume,
  templateDocument,
  onSkillHandoff,
}: {
  deps: MarkdownAiDeps
  filePath: string | null
  preset?: AiPreset | null
  onCollapse: () => void
  /** queued selection-scoped edits (owned by App, which also owns the anchors) */
  editQueue?: EditQueueItem[]
  onQueueEditInstruction?: (qid: string, instruction: string) => void
  onQueueRemove?: (qid: string) => void
  onQueueClear?: () => void
  onQueueFocus?: (qid: string) => void
  onQueueConsume?: (qids: string[]) => void
  /** the document while it can go along as a skill's template (spec 5.7) */
  templateDocument?: TemplateDocument | null
  /** this tab took a request handed over by the template flow: show the panel */
  onSkillHandoff?: () => void
}): ReactElement {
  const { lang, t } = useI18n()
  const [chat, setChat] = useState<ChatEntry[]>([])
  /** a streamed write stopped early: the draft stays in the document until the user keeps or discards it */
  const [activePartial, setActivePartial] = useState<{ blocks: number } | null>(null)
  const partialResolverRef = useRef<((keep: boolean) => void) | null>(null)
  /** bumped by New chat / unmount: a writer resuming after its abort must not open the keep card */
  const writerEpochRef = useRef(0)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  /** messages queued while a reply runs; the pump re-runs them through send on settle */
  const msgQueue = useChatRunQueue<{ skillUse: SkillUse }>({
    busy,
    submit: (text, meta) => {
      const loop = loopRef.current
      if (!loop || loop.busy) return false
      // nothing can run right now: the message stays queued, and in front of "not connected"
      // the queue is paused so it does not start by itself after a sign-in
      if (!sendGateRef.current.admitQueued(() => msgQueueRef.current.setPaused(true))) return false
      return send(text, text, null, meta.skillUse)
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
    editor: 'markdown',
    cards: skillCards,
    busy,
    send: (text, use) => send(text, undefined, undefined, use),
    onTaken: onSkillHandoff,
    setComposer: setPrompt,
  })
  const skillTemplatesRef = useRef(skillTemplates)
  skillTemplatesRef.current = skillTemplates
  /** the skills of the last send: a retry sends the same skill text */
  const lastSkillUseRef = useRef<SkillUse>(NO_SKILL_USE)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  // bumped on selection/doc changes so the scope chip & queue rows stay fresh
  const [, setScopeTick] = useState(0)
  /** the scope chip's expandable preview of the selected text */
  const [scopePreviewOpen, setScopePreviewOpen] = useState(false)
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
  const applyAiSettings = (next: AiSettings): void => {
    setAiSettings(next)
  }
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
    displayText: string | undefined
    retryScope: AiScopeQuoteData | null | undefined
    skillUse: SkillUse
  }>({
    settings: aiSettings,
    statuses,
    store: MODEL_BRIDGE,
    start: (held) => {
      send(held.text, held.displayText, held.retryScope, held.skillUse)
    },
    onNotConnected: () => refreshSubscriptionRef.current(),
    onSettingsSaved: applyAiSettings,
  })
  const sendGateRef = useRef(sendGate)
  sendGateRef.current = sendGate
  /** whether generate_image can run, as the main process answers (refreshed with the settings and before each run) */
  const imageGenAvailableRef = useRef(false)
  const refreshImageGenAvailable = (): Promise<void> =>
    readImageGenerationAvailable(() => window.markdownApi.aiToolCapabilities()).then(
      (available) => {
        imageGenAvailableRef.current = available
      },
    )
  useEffect(() => {
    let alive = true
    // tests render the panel without a full preload bridge: a missing call must not take it down
    const refresh = () => {
      Promise.resolve()
        .then(() => window.markdownApi.getAiSettings())
        .then(
          (next) => {
            if (alive) applyAiSettings(next)
          },
          () => {},
        )
      void refreshImageGenAvailable()
    }
    const onFocus = () => {
      refresh()
      // a sign-in or install finished outside the app shows up once the window is back
      if (sendGateRef.current.peek().kind === 'connect') refreshSubscriptionRef.current()
    }
    refresh()
    window.addEventListener('focus', onFocus)
    let off: (() => void) | undefined
    try {
      off = window.markdownApi.onAiSettingsChanged?.(refresh)
    } catch {
      off = undefined
    }
    return () => {
      alive = false
      window.removeEventListener('focus', onFocus)
      off?.()
    }
  }, [])
  // a connection that came or went changes which image route can run
  useEffect(() => {
    void refreshImageGenAvailable()
  }, [statuses])
  /** the transport's structured copy of its last failure; onError matches it to its message */
  const streamErrorRef = useRef<IpcStreamError | null>(null)
  /** usage windows the subscription program reported last */
  const [subscriptionUsage, setSubscriptionUsage] = useState<AiSubscriptionUsage[]>([])
  /** the input of the last run was cut to fit a limit */
  const [inputTruncated, setInputTruncated] = useState(false)
  const langRef = useRef(lang)
  langRef.current = lang
  const depsRef = useRef(deps)
  depsRef.current = deps
  const filePathRef = useRef(filePath)
  /** instruction of the in-flight run, labels its rollback snapshot */
  const runInstructionRef = useRef('')
  /** what the user saw for that instruction (queue submissions show a summary) */
  const runDisplayRef = useRef('')
  /** the scope quote of the last send, so a retry reuses it instead of re-reading the live selection */
  const lastScopeRef = useRef<AiScopeQuoteData | undefined>(undefined)
  const runMutatedRef = useRef(false)
  /** tool activity of the whole run, for transcript persistence */
  const runToolsRef = useRef<ToolActivity[]>([])
  /** tokens billed so far in the in-flight run (summed across turns) */
  const runUsageRef = useRef<AiTokenUsageView | undefined>(undefined)
  /** tokens billed across the panel's session (the composer chip) */
  const [sessionUsage, setSessionUsage] = useState<AiTokenUsageView | undefined>(undefined)
  const chatIdsRef = useRef<{ projectId: string; chatId: string } | null>(null)
  /** messages sent before resolveChat returned, flushed once the chat id is known */
  const pendingPersistRef = useRef<
    Array<{
      role: 'user' | 'assistant'
      text: string
      tools?: ToolActivity[]
      scope?: AiScopeQuoteData
      skills?: SkillChipRef[]
    }>
  >([])

  const patchLast = (patch: Partial<ChatEntry> | ((last: ChatEntry) => Partial<ChatEntry>)) => {
    setChat((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (!last || last.role !== 'assistant') return prev
      next[next.length - 1] = { ...last, ...(typeof patch === 'function' ? patch(last) : patch) }
      return next
    })
  }

  const persistMessage = (
    role: 'user' | 'assistant',
    text: string,
    tools?: ToolActivity[],
    scope?: AiScopeQuoteData,
    skillChips?: SkillChipRef[],
  ) => {
    const ids = chatIdsRef.current
    if (!window.projectApi) return
    if (!ids) {
      pendingPersistRef.current.push({ role, text, tools, scope, skills: skillChips })
      return
    }
    void window.projectApi
      .appendChat({
        projectId: ids.projectId,
        chatId: ids.chatId,
        role,
        text,
        ...(tools && tools.length > 0 ? { tools } : {}),
        ...(scope ? { scope } : {}),
        ...(skillChips && skillChips.length > 0 ? { skills: skillChips } : {}),
      })
      .catch(() => {
        /* persistence failures are silent */
      })
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

  /**
   * Long-form writing: one tool-less request whose reply is the markdown, streamed
   * into the document as a draft by the tool. A stream that stops early leaves the
   * user a keep-or-discard choice; a stream that produced nothing is retried once.
   */
  const runDocWriter = async (
    spec: DocWriteSpec,
    onProgress: (markdown: string) => void,
    signal?: AbortSignal,
  ): Promise<DocWriteResult> => {
    const { system, user } = buildDocWriterRequest(
      spec,
      MARKDOWN_RULES,
      aiLangDirective(langRef.current),
    )
    const epoch = writerEpochRef.current
    let closed = false
    let chipTimer: ReturnType<typeof setTimeout> | null = null
    let latest = ''
    const updateChip = () => {
      chipTimer = null
      if (closed) return
      const blocks = countMarkdownBlocks(latest)
      patchLast((last) => ({
        tools: last.tools?.map((tl) =>
          tl.running ? { ...tl, summary: tGlobal('aiWritingDocument', { blocks }) } : tl,
        ),
      }))
    }
    const attempt = () =>
      streamText({
        transport: transportRef.current!,
        system,
        user,
        signal,
        maxChars: DOC_MAX_CHARS,
        extract: (raw) => ({ text: extractMarkdown(raw) }),
        onProgress: (markdown) => {
          if (closed) return
          latest = markdown
          onProgress(markdown)
          if (chipTimer === null) chipTimer = setTimeout(updateChip, CHIP_UPDATE_MS)
        },
      })
    let outcome = await attempt()
    if (outcome.status === 'empty' && !signal?.aborted) outcome = await attempt()
    closed = true
    if (chipTimer !== null) clearTimeout(chipTimer)
    if (outcome.status === 'complete') return { ok: true, markdown: outcome.text }
    if (outcome.status === 'empty') return { ok: false, error: outcome.error }
    if (epoch !== writerEpochRef.current) return { ok: false, error: 'the chat was reset' }
    // the draft stays in the document while the user decides
    const keep = await new Promise<boolean>((resolve) => {
      partialResolverRef.current = resolve
      setActivePartial({ blocks: countMarkdownBlocks(outcome.text) })
    })
    return keep
      ? { ok: true, markdown: outcome.text, truncated: true }
      : {
          ok: false,
          error: `${outcome.reason}${outcome.error ? `: ${outcome.error}` : ''}; the user discarded the partial content`,
        }
  }
  const runDocWriterRef = useRef(runDocWriter)
  runDocWriterRef.current = runDocWriter

  const decidePartial = (keep: boolean): void => {
    partialResolverRef.current?.(keep)
    partialResolverRef.current = null
    setActivePartial(null)
  }
  /** New chat / unmount: discard an open keep card and keep a still-settling writer from opening one */
  const abandonWriter = (): void => {
    writerEpochRef.current++
    decidePartial(false)
  }
  useEffect(
    () => () => {
      writerEpochRef.current++
    },
    [],
  )

  // The loop is built once; every mutable value goes through a ref getter
  const loopRef = useRef<AgentLoop<DocSnapshot> | null>(null)
  if (!loopRef.current) {
    loopRef.current = new AgentLoop<DocSnapshot>({
      transport: transportRef.current,
      skill: composeWithDrive('markdown+search', '', () => loopRef.current?.messages ?? [], [
        createMarkdownSkill(
          () => depsRef.current.getEditor(),
          {
            read: () => depsRef.current.getFrontmatter(),
            write: (inner) => depsRef.current.setFrontmatter(inner),
          },
          () => imageGenAvailableRef.current,
          () => ({
            write: (spec, onProgress, signal) => runDocWriterRef.current(spec, onProgress, signal),
          }),
        ),
        createSearchSkill(),
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
      captureSnapshot: () => depsRef.current.getSnapshot(),
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
        onToolExecuted: ({ call, execution, snapshotBefore }) => {
          if (execution.mutated) runMutatedRef.current = true
          if (snapshotBefore !== undefined) {
            const label = runInstructionRef.current.slice(0, 40)
            const time = new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
            setSnapshots((prev) =>
              [...prev, { label, time, doc: snapshotBefore }].slice(-MAX_SNAPSHOTS),
            )
          }
          // mind maps ride the UI-only display side channel onto the message
          const display = execution.display
          const mindmap = display?.kind === 'mindmap' ? display.tree : undefined
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
            return { tools: [...tools, activity], ...(mindmap ? { mindmap } : {}) }
          })
        },
        onTurnEnd: () => {
          patchLast({ streaming: false })
          setChat((prev) => [...prev, { role: 'assistant', text: '', streaming: true }])
        },
        onUsage: (usage) => {
          runUsageRef.current = addTokenUsage(runUsageRef.current, usage)
          setSessionUsage((prev) => addTokenUsage(prev, usage))
          patchLast({ usage: runUsageRef.current })
        },
        onDone: ({ text, cancelled, turnLimit, truncated }) => {
          const base = turnLimit
            ? [text, tGlobal('aiTurnLimit')].filter(Boolean).join('\n\n')
            : text || (cancelled ? tGlobal('aiStopped') : '')
          // A reasoning model can spend the entire output budget on thinking and close the
          // turn with finish_reason=length and no prose at all — the bare "(no reply)" read
          // as the assistant ignoring the user. Name the truncation, as docs already does.
          const final = truncated
            ? [base, tGlobal('aiTruncatedNote')].filter(Boolean).join('\n\n')
            : base
          patchLast((last) => ({
            streaming: false,
            text: final || (last.tools?.length ? last.text : tGlobal('aiNoReply')),
            // A stop mid-tool can leave a running placeholder behind — drop it
            tools: last.tools?.filter((tl) => !tl.running),
          }))
          persistMessage('assistant', final, runToolsRef.current)
          const editor = depsRef.current.getEditor()
          if (editor) clearAiHighlights(editor)
          depsRef.current.onRunDone(runMutatedRef.current)
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
      partialResolverRef.current?.(false)
      loopRef.current?.cancel()
      const editor = depsRef.current.getEditor()
      if (editor) clearAiHighlights(editor)
    }
  }, [])

  // ── chat-history persistence: bind to the file, restore prior transcript ──
  useEffect(() => {
    const api = window.projectApi
    if (!api) return
    const tempChatId = `unsaved-${Date.now()}`
    void api
      .resolveChat({ filePath: filePathRef.current ?? null, tempChatId })
      .then((ids) => {
        chatIdsRef.current = ids
        for (const msg of pendingPersistRef.current.splice(0)) {
          persistMessage(msg.role, msg.text, msg.tools, msg.scope, msg.skills)
        }
        return api.loadChat({ projectId: ids.projectId, chatId: ids.chatId, limit: 200 })
      })
      .then((stored) => {
        if (stored.length === 0) return
        // skill cards come back closed; a saved card's record is not part of the conversation
        const msgs = skillCardsRef.current.restore(stored)
        // the user may have sent a message while history was loading — never
        // replace a live transcript (and don't clobber the loop context)
        let applied = false
        setChat((prev) => {
          if (prev.length > 0) return prev
          applied = true
          return msgs.map((m) => ({
            role: m.role,
            text: m.text,
            tools: m.tools?.map((tool) => ({
              name: tool.name,
              summary: tool.summary,
              isError: tool.isError,
              output: tool.output ? tool.output.slice(0, TOOL_OUTPUT_MAX_CHARS) : undefined,
            })),
            ...(m.scope ? { scope: m.scope } : {}),
            ...(m.role === 'user' && skillChipRefsOf(m.skills).length > 0
              ? { skills: skillChipRefsOf(m.skills) }
              : {}),
            ...(m.skillProposals ? { skillProposals: m.skillProposals } : {}),
          }))
        })
        if (applied && !loopRef.current?.busy) {
          loopRef.current?.restore(msgs.map((m) => ({ role: m.role, text: m.text })))
          // the next request re-reads the current text of the skills this conversation used
          skillsRef.current.restoreHistory(
            msgs.map((m) => (m.role === 'user' ? skillChipRefsOf(m.skills) : undefined)),
          )
        }
      })
      .catch(() => {
        /* history load failures are silent */
      })
  }, [])

  /** after an untitled document's first save, bind the unsaved-* history to the real path */
  useEffect(() => {
    filePathRef.current = filePath
    const ids = chatIdsRef.current
    if (!window.projectApi || !ids || !filePath || !ids.chatId.startsWith('unsaved-')) return
    void window.projectApi
      .rebindChat({ projectId: ids.projectId, tempChatId: ids.chatId, newFilePath: filePath })
      .then((r) => {
        if (r?.chatId) chatIdsRef.current = r
      })
      .catch(() => {
        /* silent */
      })
  }, [filePath])

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

  /**
   * retryScope: null = a retry that had no scope; undefined = capture the live selection.
   * Returns false when no run was started (the text stays with the caller).
   */
  const send = (
    text: string,
    displayText?: string,
    retryScope?: AiScopeQuoteData | null,
    /** the chosen skills: their text goes to the model, their chips onto the bubble */
    skillUse: SkillUse = NO_SKILL_USE,
  ): boolean => {
    const instruction = text.trim()
    const loop = loopRef.current
    if (!instruction || !loop || loop.busy) return false
    // A request made during a status check or in front of the first-connection notice is
    // held and starts by itself once the way is clear; in front of "not connected" nothing
    // is kept. Either way nothing is sent now and the text stays with the caller.
    if (!sendGate.admit({ text: instruction, displayText, retryScope, skillUse })) {
      showWhatHoldsTheSend()
      return false
    }
    stickToBottomRef.current = true
    streamErrorRef.current = null
    setInputTruncated(false)
    runInstructionRef.current = instruction
    runDisplayRef.current = displayText ?? instruction
    runMutatedRef.current = false
    runToolsRef.current = []
    runUsageRef.current = undefined
    // a queue batch carries its own display text: no selection quote
    const scope =
      retryScope !== undefined
        ? (retryScope ?? undefined)
        : displayText === undefined
          ? selectionScopeQuote()
          : undefined
    lastScopeRef.current = scope
    // the popover input / composer own the DOM selection now: keep the targeted range visible until the run ends
    if (scope) setInactiveSelectionShown(depsRef.current.getEditor(), true)
    setChat((prev) => [
      ...prev,
      {
        role: 'user',
        text: displayText ?? instruction,
        ...(scope ? { scope } : {}),
        ...(skillUse.chips.length > 0 ? { skills: skillUse.chips } : {}),
      },
      { role: 'assistant', text: '', streaming: true },
    ])
    setPrompt('')
    skillsRef.current.consume(skillUse)
    lastSkillUseRef.current = skillUse
    skillTemplatesRef.current.noteRequest(displayText ?? text)
    setBusy(true)
    // persist what the user saw — a restored transcript must not surface the
    // internal batch protocol text behind a queue submission
    persistMessage('user', displayText ?? instruction, undefined, scope, skillUse.chips)
    void (async () => {
      try {
        const [settings] = await Promise.all([
          window.markdownApi.getAiSettings(),
          refreshImageGenAvailable(),
        ])
        settingsRef.current = settings
        if (!mountedRef.current) return
        applyAiSettings(settings)
        // the skill text rides with this request only; the bubble and the record keep the chips
        await loop.run(instruction + skillUse.text)
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

  /** the composer's typed text: the chosen skills ride along */
  const sendTyped = () => {
    const text = prompt.trim()
    if (!text) return
    skills.withSkills(text, (skillUse) => send(text, undefined, undefined, skillUse))
  }

  /** Enter while a reply runs: the draft joins the queue above the composer */
  const enqueueDraft = () => {
    const text = prompt.trim()
    if (!text) return
    skills.withSkills(text, (skillUse) => enqueueWith(text, skillUse))
  }
  const enqueueWith = (text: string, skillUse: SkillUse) => {
    skillsRef.current.consume(skillUse)
    msgQueue.enqueue(text, { skillUse })
    setPrompt('')
  }

  const retry = (): void => {
    send(
      runInstructionRef.current,
      runDisplayRef.current,
      lastScopeRef.current ?? null,
      lastSkillUseRef.current,
    )
  }

  /** a rerun of the last user bubble sends the last send's skill text again */
  const retrySkillUse = (entry: ChatEntry): SkillUse =>
    entry === [...chat].reverse().find((e) => e.role === 'user')
      ? lastSkillUseRef.current
      : NO_SKILL_USE

  /** "Continue with …" on a blocked run: that provider becomes the selection, then the request reruns */
  const continueWith = (provider: AiSubscriptionProviderId): void =>
    sendGate.continueWith(provider, retry)

  // keep the scope chip & queue rows in sync with the editor selection/content
  useEffect(() => {
    const editor = depsRef.current.getEditor()
    if (!editor) return
    const bump = () => {
      if (editor.state.selection.empty) setScopePreviewOpen(false)
      setScopeTick((tick) => tick + 1)
    }
    editor.on('selectionUpdate', bump)
    editor.on('update', bump)
    return () => {
      editor.off('selectionUpdate', bump)
      editor.off('update', bump)
    }
  }, [])

  // scope chip data, recomputed per render (the scope tick above keeps it fresh)
  const editor = depsRef.current.getEditor()
  const liveSelection = editor?.state.selection
  const selectionText =
    !editor || !liveSelection || liveSelection.empty
      ? ''
      : editor.state.doc.textBetween(liveSelection.from, liveSelection.to, '\n', ' ').trim()
  const hasScopeSelection = selectionText.length > 0

  /** the × on the scope chip: collapse the selection so the run targets the whole document */
  const clearScopeSelection = (): void => {
    if (editor) editor.commands.setTextSelection(editor.state.selection.to)
  }

  const selectionScopeQuote = (): AiScopeQuoteData | undefined => {
    const ed = depsRef.current.getEditor()
    if (!ed || ed.state.selection.empty) return undefined
    const { from, to } = ed.state.selection
    const text = ed.state.doc.textBetween(from, to, ' ', ' ').replace(/\s+/g, ' ').trim()
    if (!text) return undefined
    return {
      label: t('aiScopeSelection', { words: countWords(text) }),
      text: text.length > SCOPE_TEXT_MAX ? `${text.slice(0, SCOPE_TEXT_MAX)}…` : text,
    }
  }

  // the frozen-range highlight ends with the run, or as soon as the editor is focused again
  useEffect(() => {
    if (!busy) setInactiveSelectionShown(depsRef.current.getEditor(), false)
  }, [busy])
  useEffect(() => {
    const ed = depsRef.current.getEditor()
    if (!ed) return
    const off = () => setInactiveSelectionShown(ed, false)
    ed.on('focus', off)
    return () => {
      ed.off('focus', off)
    }
  }, [])

  /** [label](mdnav://block/N) links in replies select and scroll to that block */
  const docNav = {
    scheme: DOC_NAV_SCHEME,
    onNavigate: (href: string) => {
      const index = parseDocNavHref(href)
      const current = depsRef.current.getEditor()
      if (index !== null && current) navigateToBlock(current, index)
    },
  }
  // [name](filenav:///abs/path) citations open the cited file in its own app
  const fileNav = createFileNav((path) => {
    void window.markdownApi.openSourcePath(path)
  })

  /** submit every still-anchored queued edit as one batch run */
  const sendQueue = (): void => {
    const loop = loopRef.current
    const current = depsRef.current.getEditor()
    if (!loop || loop.busy || editQueue.length === 0 || !current) return
    // nothing is consumed while no run can start
    if (!sendGate.admitQueued(() => {})) {
      showWhatHoldsTheSend()
      return
    }
    const entries = liveItems(resolveQueue(current, editQueue))
    if (entries.length === 0) {
      onQueueClear?.()
      return
    }
    const instruction = buildQueueInstruction(entries)
    const display = buildQueueSummary(t('aiQueueSubmitted', { count: entries.length }), entries)
    // consumed at send: the run rewrites the anchored passages, which would
    // orphan the anchors anyway; a failed run is retried via the retry action
    onQueueConsume?.(editQueue.map((item) => item.qid))
    send(instruction, display)
  }

  // ribbon presets auto-send; while a run is active they land in the composer instead
  const presetNonceRef = useRef(0)
  useEffect(() => {
    if (!preset || preset.nonce === presetNonceRef.current) return
    presetNonceRef.current = preset.nonce
    if (loopRef.current?.busy || !send(preset.text)) setPrompt(preset.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset])

  const copyMessage = (text: string, idx: number): void => {
    void navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    window.setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1200)
  }

  const rollback = (snapshot: Snapshot): void => {
    if (busy) return
    depsRef.current.restoreSnapshot(snapshot.doc)
    setSnapshots((prev) => prev.filter((s) => s !== snapshot))
  }

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

  return (
    <aside
      ref={asideRef}
      className={`copilot${resizing ? ' ai-panel-resizing' : ''}`}
      style={{ width: '100%' }}
      dir={lang === 'ar' || lang === 'he' ? 'rtl' : undefined}
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
            onMove={(side) => window.markdownApi.setAiPanelPrefs({ side })}
          />
          {chat.length > 0 && (
            <button
              className="ai-header-btn"
              onClick={() => {
                stop()
                abandonWriter()
                msgQueue.clear()
                sendGate.reset()
                loopRef.current?.reset()
                setBusy(false)
                setChat([])
                skills.resetConversation()
                skillCards.reset()
                skillTemplates.reset()
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
              <button
                className="ai-starter"
                onClick={() => {
                  setPrompt(t('aiQuickDraftPrompt'))
                  inputRef.current?.focus()
                }}
              >
                {t('aiQuickDraft')}
              </button>
              <button
                className="ai-starter"
                onClick={() => {
                  setPrompt(t('aiQuickPolishPrompt'))
                  inputRef.current?.focus()
                }}
              >
                {t('aiQuickPolish')}
              </button>
              <button
                className="ai-starter"
                onClick={() => {
                  setPrompt(t('aiQuickMindMapPrompt'))
                  inputRef.current?.focus()
                }}
              >
                {t('aiQuickMindMap')}
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
                <span dir="auto">{entry.text}</span>
                {entry.undelivered && (
                  <div className="ai-msg-undelivered">
                    {t('aiUndelivered')}
                    {!busy && (
                      <button
                        className="ai-retry-btn"
                        onClick={() =>
                          send(entry.text, undefined, entry.scope ?? null, retrySkillUse(entry))
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
          if (!entry.text && !entry.streaming && !hasTools) return null
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
                    <Markdown text={entry.text} navs={[docNav, fileNav]} />
                  </div>
                )
              )}
              {hasTools && <ToolChipList tools={entry.tools!} />}
              {entry.mindmap && (
                <MindMapCard
                  tree={entry.mindmap}
                  onAsk={(label) => {
                    setPrompt(t('aiMindMapAskPrompt', { label }))
                    inputRef.current?.focus()
                  }}
                  onJumpBlock={(index) => {
                    const current = depsRef.current.getEditor()
                    if (current) navigateToBlock(current, index)
                  }}
                />
              )}
              <SkillUsedNotes tools={entry.tools} />
              {entry.skillProposals?.map((key) => skillCards.render(key))}
              {entry.usage && (
                <div className="ai-message-usage">
                  <AiUsageChip usage={entry.usage} lang={lang} />
                </div>
              )}
              {showToolbar && (
                <div className="ai-msg-toolbar">
                  <button
                    className="ai-msg-tool-btn"
                    onClick={() => copyMessage(entry.text, i)}
                    aria-label={t('aiCopyReplyTitle')}
                    data-tip={t('aiCopyReplyTitle')}
                  >
                    {copiedIdx === i ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path
                          d="M14.6113 5.34253C16.0608 5.3428 17.2363 6.518 17.2363 7.96753V15.5066C17.2361 16.956 16.0607 18.1313 14.6113 18.1316H7.07227C5.62267 18.1316 4.44751 16.9561 4.44727 15.5066V7.96753C4.44732 6.51783 5.62255 5.34253 7.07227 5.34253H14.6113ZM7.07227 6.59253C6.31291 6.59253 5.69732 7.20819 5.69727 7.96753V15.5066C5.69751 16.2658 6.31302 16.8816 7.07227 16.8816H14.6113C15.3703 16.8813 15.9861 16.2656 15.9863 15.5066V7.96753C15.9863 7.20835 15.3705 6.5928 14.6113 6.59253H7.07227ZM10.0176 2.8689C10.3626 2.86905 10.6426 3.14882 10.6426 3.4939C10.6425 3.83888 10.3626 4.11874 10.0176 4.1189H4.59961C3.84022 4.1189 3.22461 4.73451 3.22461 5.4939V11.324C3.22433 11.6689 2.94461 11.949 2.59961 11.949C2.25461 11.949 1.97489 11.6689 1.97461 11.324V5.4939C1.97461 4.04415 3.14987 2.8689 4.59961 2.8689H10.0176Z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                  </button>
                  {isLast && !busy && runInstructionRef.current && (
                    <button
                      className="ai-msg-tool-btn"
                      onClick={retry}
                      aria-label={t('aiRegenerateTitle')}
                      data-tip={t('aiRegenerateTitle')}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M 12.68 6.65 a 4.86 4.86 0 0 0 -9 -1.08 M 3.32 9.35 a 4.86 4.86 0 0 0 9 1.08" />
                        <path d="M 12.95 3.05 v 2.7 h -2.7 M 3.05 12.95 v -2.7 h 2.7" />
                      </svg>
                    </button>
                  )}
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
            onOpenSettings={() => void window.markdownApi.openAiModelSettings().catch(() => {})}
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

      {snapshots.length > 0 && (
        <div className="ai-versions">
          <div className="ai-versions-title">
            <IconClock />
            {t('aiSnapshotsTitle')}
          </div>
          {snapshots.map((s, i) => (
            <div key={i} className="ai-version-row">
              <span className="ai-version-label" data-tip={s.label}>
                <span className="ai-version-time">{s.time}</span>
                {s.label}
              </span>
              <button className="ai-version-rollback" disabled={busy} onClick={() => rollback(s)}>
                {t('aiRollback')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="ai-composer">
        {activePartial && (
          <div className="ai-queue ai-partial-card" role="group" aria-label={t('aiPartialTitle')}>
            <div className="ai-queue-head">
              <span className="ai-queue-title">{t('aiPartialTitle')}</span>
            </div>
            <div className="ai-queue-hint">
              {t('aiPartialBody', { blocks: activePartial.blocks })}
            </div>
            <div className="ai-queue-foot">
              <button
                type="button"
                className="ai-queue-discard"
                onClick={() => decidePartial(false)}
              >
                {t('aiPartialDiscard')}
              </button>
              <button type="button" className="ai-queue-send" onClick={() => decidePartial(true)}>
                {t('aiPartialAdopt')}
              </button>
            </div>
          </div>
        )}
        {editor && editQueue.length > 0 && (
          <EditQueueCard
            items={editQueue}
            editor={editor}
            busy={busy}
            onEditInstruction={(qid, instruction) => onQueueEditInstruction?.(qid, instruction)}
            onRemove={(qid) => onQueueRemove?.(qid)}
            onDiscardAll={() => onQueueClear?.()}
            onSend={sendQueue}
            onFocus={(qid) => onQueueFocus?.(qid)}
          />
        )}
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
            hasScopeSelection && (
              <div className="ai-scope-row">
                <span className="ai-scope-hint">
                  <button
                    className="ai-scope-label"
                    onClick={() => setScopePreviewOpen((v) => !v)}
                    aria-expanded={scopePreviewOpen}
                    data-tip={t('aiScopeSelectionTip')}
                  >
                    {t('aiScopeSelection', { words: countWords(selectionText) })}
                  </button>
                  <button
                    className="ai-scope-clear"
                    onClick={clearScopeSelection}
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
                    {selectionText.length > 400 ? `${selectionText.slice(0, 400)}…` : selectionText}
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
              {sessionUsage && <AiUsageChip usage={sessionUsage} session lang={lang} />}
              <AiSubscriptionUsageLine usage={subscriptionUsage} lang={lang} />
            </>
          }
          sendIconEnabled={<img src={sendEnterOn} alt="" aria-hidden />}
          sendIconDisabled={<img src={sendEnterOff} alt="" aria-hidden />}
          stopIcon={<img src={sendStop} alt="" aria-hidden />}
          textareaRef={inputRef}
          onChange={setPrompt}
          onSend={sendTyped}
          onStop={stop}
          skills={skills.composer}
        />
      </div>
    </aside>
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

function Svg({ children }: { children: ReactNode }): ReactElement {
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
      {children}
    </svg>
  )
}

function IconNewChat(): ReactElement {
  return (
    <Svg>
      <path
        d="M13.5 7.2v-3A1.7 1.7 0 0 0 11.8 2.5H4.2a1.7 1.7 0 0 0-1.7 1.7v6.1a1.7 1.7 0 0 0 1.7 1.7h1.1v2l2.6-2h1.3"
        strokeLinejoin="round"
      />
      <path d="M12.2 9.4v4M10.2 11.4h4" />
    </Svg>
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

function IconClock(): ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.6" />
    </svg>
  )
}
