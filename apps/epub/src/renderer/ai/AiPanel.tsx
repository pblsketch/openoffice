/**
 * The EPUB editor's AI panel (spec §7): the same parts and rules as the other
 * editors' panels (the send gate, the connect prompt, the first-connection
 * notice, the blocked-run notice, the shared run-error wording), with the
 * book's own skill (`epub-skill.ts`) next to web search, attachments, Drive
 * and the person's skills.
 *
 * Every edit_blocks call is one entry of the tab's undo history (the edit
 * controller's), so Ctrl+Z takes an AI change back like any other; the
 * panel keeps no history of its own. A run starts only from the person's
 * send (or a message they queued), through the send gate.
 */
import {
  AiBlockedNotice,
  AiComposer,
  AiConnectPrompt,
  AiFirstConnectionNotice,
  AiInputTruncatedNotice,
  AiMark,
  AiModelPicker,
  type AiModelPickerBridge,
  AiQueueStrip,
  AI_QUEUE_LABELS,
  AiSubscriptionUsageLine,
  aiSubscriptionText,
  AiTypingIndicator,
  AiUsageChip,
  addTokenUsage,
  type AiTokenUsageView,
  createFileNav,
  Markdown,
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
  type SkillChipRef,
  type SkillUse,
  docMentionActions,
  type AiComposerDocs,
} from '@genoffice/ui'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react'
import { AgentLoop, composeWithDrive } from '@genoffice/agent-core'
import type { AgentImage, IpcStreamError } from '@genoffice/agent-core'
import type {
  AiSettings,
  AiSubscriptionProviderId,
  AiSubscriptionUsage,
} from '@genoffice/ai-provider'
import { ATTACHMENT_IMAGE_EXTS } from '../../shared/ipc'
import type { AttachmentAddResult, AttachmentMeta, EpubAiApi } from '../../shared/ipc'
import { t as tGlobal, useI18n } from '../i18n/locale'
import { aiLangDirective } from './lang-directive'
import type { BookAiHost } from './book-tools'
import { createEpubSkill } from './epub-skill'
import { createFilesSkill } from './files-skill'
import { createSearchSkill } from './search-skill'
import { createElectronTransport } from './transport'
import { blockedRunFor, mergeSubscriptionUsage, type BlockedRun } from './connection'
import { useSubscriptionConnection } from './subscription-client'
import sendEnterOn from './assets/send-enter-on.png'
import sendEnterOff from './assets/send-enter-off.png'
import sendStop from './assets/send-stop.png'
import attachIcon from './assets/attach-icon.png'
import fileDocumentIcon from './assets/file-document.png'
import fileExcelIcon from './assets/file-excel.png'
import fileGeneralIcon from './assets/file-general.png'
import fileImageIcon from './assets/file-image.png'
import filePdfIcon from './assets/file-pdf.png'
import filePptIcon from './assets/file-ppt.png'
import fileWordIcon from './assets/file-word.png'

/** [chip label, composer prefill] */
const STARTERS = [
  ['aiStarterSummary', 'aiStarterSummaryPrompt'],
  ['aiStarterFind', 'aiStarterFindPrompt'],
  ['aiStarterProofread', 'aiStarterProofreadPrompt'],
  ['aiStarterTranslate', 'aiStarterTranslatePrompt'],
] as const
/** what a fixed-layout book offers: it can be read, not changed or translated */
const READ_ONLY_STARTERS = STARTERS.slice(0, 2)

/** clipboard bitmap MIME → attachment extension (matches ATTACHMENT_IMAGE_EXTS) */
const PASTE_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}
const ATTACHMENT_CARD_ICONS: Record<string, string> = Object.fromEntries(
  (
    [
      [fileWordIcon, ['doc', 'docx', 'odt']],
      [fileExcelIcon, ['xls', 'xlsx', 'xlsm', 'csv', 'tsv']],
      [filePptIcon, ['ppt', 'pptx']],
      [filePdfIcon, ['pdf']],
      [fileImageIcon, ['png', 'jpg', 'jpeg', 'gif', 'webp']],
    ] as [string, string[]][]
  ).flatMap(([icon, exts]) => exts.map((ext) => [ext, icon])),
)
const MAX_IMAGES_PER_MESSAGE = 20
const PANEL_WIDTH_KEY = 'epub-ai-panel-width'
const PANEL_WIDTH_DEFAULT = 360
const PANEL_WIDTH_MIN = 280
const TOOL_OUTPUT_MAX_CHARS = 2000

/** The AI part of the preload bridge. A preload from an older build may lack any of it. */
function aiApi(): Partial<EpubAiApi> {
  return (window.epubApi as Partial<EpubAiApi> | undefined) ?? {}
}

const MODEL_BRIDGE: AiModelPickerBridge = {
  getSettings: () =>
    aiApi().getAiSettings?.() ?? Promise.reject(new Error('the AI settings cannot be read')),
  setSettings: (settings) =>
    aiApi().setAiSettings?.(settings) ??
    Promise.reject(new Error('the AI settings cannot be saved')),
  onSettingsChanged: (handler) => aiApi().onAiSettingsChanged?.(handler) ?? (() => {}),
  openModelSettings: () =>
    aiApi()
      .openAiModelSettings?.()
      .catch(() => {}) ?? Promise.resolve(),
}

function formatAttachmentSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(2)} KB`
}

function clampPanelWidth(w: number): number {
  // The viewport can be tiny for a moment (a view is 0×0 until the shell lays
  // it out), so the ceiling never drops below the minimum
  const max = Math.max(PANEL_WIDTH_MIN, Math.min(720, Math.round(window.innerWidth * 0.6)))
  return Math.min(Math.max(w, PANEL_WIDTH_MIN), max)
}

function loadPanelWidth(): number {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
  return Number.isFinite(saved) && saved > 0
    ? Math.min(Math.max(saved, PANEL_WIDTH_MIN), 720)
    : PANEL_WIDTH_DEFAULT
}

interface ToolActivity {
  name: string
  summary: string
  /** still executing: rendered as a running row, replaced in place when the tool finishes */
  running?: boolean
  isError?: boolean
  output?: string
}

interface ChatEntry {
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
  isError?: boolean
  /** the run stopped because its connection cannot go on: rendered as the blocked notice */
  blocked?: BlockedRun
  /** the run failed and this user message was rolled back out of the model context */
  undelivered?: boolean
  /** attachments this message took from the composer (shown read-only; a retry sends them again) */
  attachments?: AttachmentMeta[]
  /** skill chips this user message carried */
  skills?: SkillChipRef[]
  /** skill cards the model proposed in this turn (keys of useSkillProposals) */
  skillProposals?: string[]
  /** the skill text this message's request carried (live only): a retry resends it */
  skillText?: string
  tools?: ToolActivity[]
  /** tokens the provider billed for this reply (absent when unreported) */
  usage?: AiTokenUsageView
}

/** composer chips (removable) and the read-only echo on a sent message share one renderer */
function AttachmentList({
  atts,
  previews,
  onRemove,
  removeLabel,
}: {
  atts: AttachmentMeta[]
  previews: Record<string, string>
  onRemove?: (path: string) => void
  removeLabel?: string
}) {
  const remove = (path: string) =>
    onRemove && (
      <button
        type="button"
        className="ai-attachment-thumb-remove"
        onClick={() => onRemove(path)}
        data-tip={removeLabel}
        aria-label={removeLabel}
      >
        <svg width="16" height="16" viewBox="0 0 32 32" aria-hidden>
          <path
            d="M24 9.4L22.6 8L16 14.6L9.4 8L8 9.4l6.6 6.6L8 22.6L9.4 24l6.6-6.6l6.6 6.6l1.4-1.4l-6.6-6.6L24 9.4z"
            fill="currentColor"
          />
        </svg>
      </button>
    )
  return (
    <>
      {atts.map((a) =>
        ATTACHMENT_IMAGE_EXTS.has(a.ext) ? (
          <span key={a.path} className="ai-attachment-thumb" title={a.name}>
            {previews[a.path] ? (
              <img src={previews[a.path]} alt={a.name} />
            ) : (
              <span className="ai-attachment-thumb-pending" aria-hidden>
                <img src={fileImageIcon} alt="" />
              </span>
            )}
            {remove(a.path)}
          </span>
        ) : (
          <span key={a.path} className="ai-attachment-card" title={a.path}>
            <span className="ai-attachment-card-icon">
              <img
                src={ATTACHMENT_CARD_ICONS[a.ext] ?? fileDocumentIcon ?? fileGeneralIcon}
                alt=""
                aria-hidden
              />
            </span>
            <span className="ai-attachment-card-meta">
              <span className="ai-attachment-card-name">{a.name}</span>
              <span className="ai-attachment-card-size">{formatAttachmentSize(a.sizeBytes)}</span>
            </span>
            {remove(a.path)}
          </span>
        ),
      )}
    </>
  )
}

export interface AiPanelProps {
  /** what the AI reads and changes; kept fresh by the app */
  host: BookAiHost
  /** the book's file: the chat history is kept per file */
  filePath: string | null
  onCollapse: () => void
}

export function AiPanel({ host, filePath, onCollapse }: AiPanelProps): ReactElement {
  const { lang, t } = useI18n()
  const [chat, setChat] = useState<ChatEntry[]>([])
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  /** Claude / Codex connection: live statuses and the connect-card actions */
  const subscription = useSubscriptionConnection()
  /** the shared AI settings as last read; null until the first read answered */
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null)
  useEffect(() => {
    let alive = true
    const refresh = () => {
      const read = aiApi().getAiSettings?.()
      if (!read) return
      read
        .then((next) => {
          if (alive) setAiSettings(next)
        })
        .catch(() => {
          /* no settings bridge: the gate keeps waiting for the settings */
        })
    }
    refresh()
    const off = aiApi().onAiSettingsChanged?.(refresh)
    window.addEventListener('focus', refresh)
    return () => {
      alive = false
      off?.()
      window.removeEventListener('focus', refresh)
    }
  }, [])
  /** The send gate every editor shares: holds a request made during a status check or in front
      of the first-connection notice, refuses in front of "not connected", and writes this
      panel's settings changes ("continue with …", the acknowledged notice) onto the stored ones. */
  const sendGate = useAiSendGate<{
    text: string
    attachments: AttachmentMeta[] | undefined
    skillUse: SkillUse
  }>({
    settings: aiSettings,
    statuses: subscription.statuses,
    store: MODEL_BRIDGE,
    start: (held) => {
      send(held.text, held.attachments, held.skillUse)
    },
    onSettingsSaved: setAiSettings,
  })
  const sendGateRef = useRef(sendGate)
  sendGateRef.current = sendGate
  /** rate-limit windows the subscription program reported (latest per window) */
  const [subscriptionUsage, setSubscriptionUsage] = useState<AiSubscriptionUsage[]>([])
  /** the last turn's input was cut to fit a limit; shown until dismissed */
  const [inputTruncated, setInputTruncated] = useState(false)
  /** structured cause of the last failed stream */
  const lastStreamErrorRef = useRef<IpcStreamError | null>(null)
  /** messages queued while a reply runs; the pump re-runs them through send on settle */
  const msgQueue = useChatRunQueue<{ atts: AttachmentMeta[]; skillUse: SkillUse }>({
    busy,
    submit: (text, meta) => {
      const loop = loopRef.current
      if (!loop || loop.busy) return false
      // a queued message waits instead of being refused and dropped; in front of "not
      // connected" the queue is paused so it does not start by itself after a sign-in
      if (!sendGateRef.current.admitQueued(() => msgQueueRef.current.setPaused(true))) return false
      return send(text, meta.atts, meta.skillUse)
    },
  })
  const msgQueueRef = useRef(msgQueue)
  msgQueueRef.current = msgQueue
  /** the skills called with `/` or `$`: the list, the chips and the text a request gets */
  const skills = useComposerSkills({ lang })
  const skillsRef = useRef(skills)
  skillsRef.current = skills
  /** the skill cards `propose_skill` shows; nothing is written before their Save */
  const skillCards = useSkillProposals({
    lang,
    persistSaved: (record) => persistMessage('assistant', '', [record]),
  })
  const skillCardsRef = useRef(skillCards)
  skillCardsRef.current = skillCards
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const stickToBottomRef = useRef(true)
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([])
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments
  const sendSeqRef = useRef(0)
  const [attachNotice, setAttachNotice] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  /** data-URL previews for image attachments, keyed by path */
  const [attachmentPreviews, setAttachmentPreviews] = useState<Record<string, string>>({})
  const previewRequestedRef = useRef(new Set<string>())
  /** attachments taken by earlier sends: the files skill keeps reading them in later turns */
  const sentAttachmentsRef = useRef<AttachmentMeta[]>([])
  useEffect(() => {
    const wanted = [...attachments, ...chat.flatMap((e) => e.attachments ?? [])]
    const alive = new Set(wanted.map((a) => a.path))
    setAttachmentPreviews((prev) => {
      const stale = Object.keys(prev).filter((path) => !alive.has(path))
      if (stale.length === 0) return prev
      const next = { ...prev }
      for (const path of stale) delete next[path]
      return next
    })
    for (const path of previewRequestedRef.current) {
      if (!alive.has(path)) previewRequestedRef.current.delete(path)
    }
    for (const a of wanted) {
      if (!ATTACHMENT_IMAGE_EXTS.has(a.ext) || previewRequestedRef.current.has(a.path)) continue
      const read = aiApi().readAttachmentImage?.(a.path)
      if (!read) continue
      previewRequestedRef.current.add(a.path)
      void read
        .then((r) => {
          if (!previewRequestedRef.current.has(a.path)) return
          if (r.ok && r.base64 && r.mime) {
            setAttachmentPreviews((prev) => ({
              ...prev,
              [a.path]: `data:${r.mime};base64,${r.base64}`,
            }))
          }
        })
        .catch(() => previewRequestedRef.current.delete(a.path))
    }
  }, [attachments, chat])
  const availableAttachments = (): AttachmentMeta[] => {
    const seen = new Set<string>()
    return [...sentAttachmentsRef.current, ...attachmentsRef.current].filter((a) => {
      if (seen.has(a.path)) return false
      seen.add(a.path)
      return true
    })
  }
  const showAttachNotice = (lines: string[]) => {
    if (lines.length === 0) return
    setAttachNotice(lines.join('; '))
    window.setTimeout(() => setAttachNotice(null), 5000)
  }
  /** files accepted by the main process join the composer (the ref at once, for a send in the same tick) */
  const mergeAttachments = (result: AttachmentAddResult | null) => {
    if (!result) return
    if (result.accepted.length > 0) {
      const seen = new Set(attachmentsRef.current.map((a) => a.path))
      const next = [...attachmentsRef.current, ...result.accepted.filter((a) => !seen.has(a.path))]
      attachmentsRef.current = next
      setAttachments(next)
    }
    showAttachNotice(result.rejected)
  }
  const pickAttachments = async () => {
    const pick = aiApi().pickAttachments
    if (pick) mergeAttachments(await pick())
  }
  const addPaths = async (paths: string[]) => {
    const add = aiApi().addAttachmentPaths
    if (add && paths.length > 0) mergeAttachments(await add(paths))
  }
  /** Drive files the person ticked: attached like files from this PC, notes beside them */
  const attachFromDrive = async ({ paths, notes }: DriveAttachPicked) => {
    const added = paths.length > 0 ? await aiApi().addAttachmentPaths?.(paths) : null
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
      add: async (paths) => (await aiApi().addAttachmentPaths?.(paths)) ?? null,
      merge: mergeAttachments,
    }),
    attachments,
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const pathOf = aiApi().getPathForFile
    if (!pathOf) return
    await addPaths(Array.from(e.dataTransfer.files).map(pathOf).filter(Boolean))
  }
  /** pasted files with a local path go the usual way; pictures without one (screenshots) go to a temporary file first */
  const onPasteFiles = async (files: File[]) => {
    const api = aiApi()
    const paths: string[] = []
    for (const f of files) {
      const path = api.getPathForFile?.(f) ?? ''
      if (path) {
        paths.push(path)
        continue
      }
      const ext = PASTE_MIME_EXT[f.type] ?? f.name.split('.').pop()?.toLowerCase() ?? 'bin'
      if (api.addPastedImage) mergeAttachments(await api.addPastedImage(await f.arrayBuffer(), ext))
    }
    await addPaths(paths)
  }
  const removeAttachment = (path: string) => {
    const next = attachmentsRef.current.filter((a) => a.path !== path)
    attachmentsRef.current = next
    setAttachments(next)
  }
  /** picture attachments go to the model as pictures (5 MB each, a limited number per message) */
  const collectImages = async (atts: AttachmentMeta[]): Promise<AgentImage[]> => {
    const imageAtts = atts.filter((a) => ATTACHMENT_IMAGE_EXTS.has(a.ext))
    const images: AgentImage[] = []
    const failures: string[] = []
    const read = aiApi().readAttachmentImage
    for (const att of imageAtts.slice(0, MAX_IMAGES_PER_MESSAGE)) {
      const result = read ? await read(att.path) : { ok: false as const }
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
  // preferred = the width the user chose (the one value kept); panelWidth = what fits the window now
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
  const langRef = useRef(lang)
  langRef.current = lang
  const hostRef = useRef(host)
  hostRef.current = host
  const filePathRef = useRef(filePath)
  /** the instruction of the run in flight: the header retry sends it again */
  const runInstructionRef = useRef('')
  /** the skills of the last send: a retry sends the same skill text */
  const lastSkillUseRef = useRef<SkillUse>(NO_SKILL_USE)
  /** tool activity of the whole run, for the saved transcript */
  const runToolsRef = useRef<ToolActivity[]>([])
  /** tokens billed so far in the run in flight (summed across turns) */
  const runUsageRef = useRef<AiTokenUsageView | undefined>(undefined)
  /** tokens billed across the panel's session (the composer chip) */
  const [sessionUsage, setSessionUsage] = useState<AiTokenUsageView | undefined>(undefined)
  const chatIdsRef = useRef<{ projectId: string; chatId: string } | null>(null)
  /** messages sent before resolveChat answered, written once the chat id is known */
  const pendingPersistRef = useRef<
    Array<{
      role: 'user' | 'assistant'
      text: string
      tools?: ToolActivity[]
      attachments?: AttachmentMeta[]
      skillChips?: SkillChipRef[]
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
    atts?: AttachmentMeta[],
    skillChips?: SkillChipRef[],
  ) => {
    const ids = chatIdsRef.current
    if (!window.projectApi) return
    if (!ids) {
      pendingPersistRef.current.push({ role, text, tools, attachments: atts, skillChips })
      return
    }
    void window.projectApi
      .appendChat({
        projectId: ids.projectId,
        chatId: ids.chatId,
        role,
        text,
        ...(tools && tools.length > 0 ? { tools } : {}),
        ...(atts && atts.length > 0 ? { attachments: atts } : {}),
        ...(skillChips && skillChips.length > 0 ? { skills: skillChips } : {}),
      })
      .catch(() => {
        /* the transcript is a convenience: failures are silent */
      })
  }

  // The loop is built once; every value that changes goes through a ref
  const transportRef = useRef<ReturnType<typeof createElectronTransport> | null>(null)
  if (!transportRef.current) {
    transportRef.current = createElectronTransport(() => settingsRef.current!, {
      getLang: () => langRef.current,
      onStreamError: (error) => {
        lastStreamErrorRef.current = error
      },
      onSubscriptionUsage: (usage) =>
        setSubscriptionUsage((prev) => mergeSubscriptionUsage(prev, usage)),
      onInputTruncated: () => setInputTruncated(true),
    })
  }

  const loopRef = useRef<AgentLoop | null>(null)
  if (!loopRef.current) {
    loopRef.current = new AgentLoop({
      transport: transportRef.current,
      skill: composeWithDrive('epub+search', '', () => loopRef.current?.messages ?? [], [
        createEpubSkill({ host: () => hostRef.current }),
        createSearchSkill(),
        createFilesSkill(availableAttachments),
        // the person's skills: use_skill, read_skill_file, propose_skill (app-run tools)
        ...panelUserSkills({
          lang: () => langRef.current,
          messages: () => loopRef.current?.messages ?? [],
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
            // the running row pushed by onToolStart is swapped out (a call that never ran has none)
            const tools = [...(last.tools ?? [])]
            if (tools.at(-1)?.running) tools.pop()
            return { tools: [...tools, activity] }
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
          const final = truncated
            ? [base, tGlobal('aiTruncatedNote')].filter(Boolean).join('\n\n')
            : base
          patchLast((last) => ({
            streaming: false,
            text: final || (last.tools?.length ? last.text : tGlobal('aiNoReply')),
            tools: last.tools?.filter((tl) => !tl.running),
          }))
          persistMessage('assistant', final, runToolsRef.current)
          setBusy(false)
        },
        onError: (error) => {
          // a connection that cannot go on gets the blocked notice (with "continue with …") instead of an error line
          const blocked = blockedRunFor(error, lastStreamErrorRef.current)
          // the next queued message would only meet the same block
          if (blocked) msgQueueRef.current.hold()
          // once a tool ran the message was delivered; a later turn failing is not a send failure
          const undelivered = runToolsRef.current.length === 0
          setChat((prev) => {
            const next = [...prev]
            for (let i = undelivered ? next.length - 1 : -1; i >= 0; i--) {
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
      loopRef.current?.cancel()
    }
  }, [])

  // ── the transcript: bound to the file, the earlier conversation restored ──
  useEffect(() => {
    const api = window.projectApi
    if (!api) return
    const tempChatId = `unsaved-${Date.now()}`
    void api
      .resolveChat({ filePath: filePathRef.current ?? null, tempChatId })
      .then((ids) => {
        chatIdsRef.current = ids
        for (const msg of pendingPersistRef.current.splice(0)) {
          persistMessage(msg.role, msg.text, msg.tools, msg.attachments, msg.skillChips)
        }
        return api.loadChat({ projectId: ids.projectId, chatId: ids.chatId, limit: 200 })
      })
      .then((stored) => {
        if (stored.length === 0) return
        // skill cards come back closed; a saved card's record is not part of the conversation
        const msgs = skillCardsRef.current.restore(stored)
        let applied = false
        const restoredAtts = (m: (typeof msgs)[number]): AttachmentMeta[] | undefined =>
          m.attachments
            ?.filter((a) => a.path)
            .map((a) => ({
              name: a.name,
              path: a.path ?? '',
              ext: a.ext ?? '',
              sizeBytes: a.sizeBytes ?? 0,
            }))
        setChat((prev) => {
          // a message sent while the history was loading wins over the history
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
            attachments: restoredAtts(m),
            ...(m.role === 'user' && skillChipRefsOf(m.skills).length > 0
              ? { skills: skillChipRefsOf(m.skills) }
              : {}),
            ...(m.skillProposals ? { skillProposals: m.skillProposals } : {}),
          }))
        })
        // the next request re-reads the current text of the skills this conversation used
        if (applied) {
          skillsRef.current.restoreHistory(
            msgs.map((m) => (m.role === 'user' ? skillChipRefsOf(m.skills) : undefined)),
          )
        }
        if (applied && !loopRef.current?.busy) {
          loopRef.current?.restore(msgs.map((m) => ({ role: m.role, text: m.text })))
          const seen = new Set(sentAttachmentsRef.current.map((a) => a.path))
          for (const a of msgs.flatMap((m) => restoredAtts(m) ?? [])) {
            if (seen.has(a.path)) continue
            seen.add(a.path)
            sentAttachmentsRef.current.push(a)
          }
        }
      })
      .catch(() => {
        /* a history that cannot be loaded is not shown */
      })
  }, [])

  /** a history kept before the path was known moves to the real path */
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
      chatRef.current?.scrollTo?.({ top: chatRef.current.scrollHeight })
    }
  }, [chat, busy])

  const onChatScroll = (): void => {
    const el = chatRef.current
    if (!el) return
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  /** false when nothing was started (empty text, a run already active, or the gate held or refused it) */
  const send = (
    text: string,
    attachmentsOverride?: AttachmentMeta[],
    /** the chosen skills: their text goes to the model, their chips onto the bubble */
    skillUse: SkillUse = NO_SKILL_USE,
  ): boolean => {
    const instruction = text.trim()
    const loop = loopRef.current
    if (!instruction || !loop || loop.busy) return false
    // Nothing connected, or the first-connection notice not acknowledged: nothing is sent, the
    // composer keeps the text and the files, and the dock above it says what to do. A request
    // made during a status check or in front of the notice is held and starts by itself.
    if (!sendGate.admit({ text: instruction, attachments: attachmentsOverride, skillUse })) {
      return false
    }
    lastStreamErrorRef.current = null
    setInputTruncated(false)
    // the message takes the composer's attachments: echoed on the bubble, pictures to the model, files via the skill
    const sentAtts = attachmentsOverride ?? attachmentsRef.current
    if (sentAtts.length > 0) {
      const seen = new Set(sentAttachmentsRef.current.map((a) => a.path))
      sentAttachmentsRef.current = [
        ...sentAttachmentsRef.current,
        ...sentAtts.filter((a) => !seen.has(a.path)),
      ]
      if (!attachmentsOverride) {
        attachmentsRef.current = []
        setAttachments([])
      }
    }
    stickToBottomRef.current = true
    runInstructionRef.current = instruction
    runToolsRef.current = []
    runUsageRef.current = undefined
    setChat((prev) => [
      ...prev,
      {
        role: 'user',
        text: instruction,
        attachments: sentAtts.length > 0 ? sentAtts : undefined,
        ...(skillUse.chips.length > 0 ? { skills: skillUse.chips, skillText: skillUse.text } : {}),
      },
      { role: 'assistant', text: '', streaming: true },
    ])
    setPrompt('')
    skillsRef.current.consume(skillUse)
    lastSkillUseRef.current = skillUse
    setBusy(true)
    persistMessage('user', instruction, undefined, sentAtts, skillUse.chips)
    // Stop or New chat during the reads before the run bump the sequence; a stale send never starts the loop
    const seq = ++sendSeqRef.current
    void (async () => {
      try {
        const settings = await aiApi().getAiSettings?.()
        if (!settings) throw new Error(tGlobal('aiUnknownError'))
        settingsRef.current = settings
        const images = sentAtts.length > 0 ? await collectImages(sentAtts) : []
        if (!mountedRef.current || seq !== sendSeqRef.current) return
        // the skill text rides with this request only; the bubble and the record keep the chips
        await loop.run(instruction + skillUse.text, images.length > 0 ? images : undefined)
      } catch (err) {
        if (!mountedRef.current || seq !== sendSeqRef.current) return
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

  /** a send whose reads before the run are still going: cancelling it drops the empty reply and marks the message undelivered */
  const cancelPendingSend = (): void => {
    sendSeqRef.current++
    setChat((prev) => {
      const last = prev.at(-1)
      if (!last || last.role !== 'assistant' || !last.streaming || last.text) return prev
      const rest = prev.slice(0, -1)
      const user = rest.at(-1)
      if (user?.role === 'user') rest[rest.length - 1] = { ...user, undelivered: true }
      return rest
    })
    setBusy(false)
  }

  /** Enter while a reply runs: the draft joins the queue above the composer */
  const enqueueDraft = () => {
    const text = prompt.trim()
    if (!text) return
    skills.withSkills(text, (skillUse) => enqueueWith(text, skillUse))
  }
  const enqueueWith = (text: string, skillUse: SkillUse) => {
    skillsRef.current.consume(skillUse)
    // the queued message owns the composer attachments; they go with it when it runs
    const atts = attachmentsRef.current
    if (atts.length > 0) {
      attachmentsRef.current = []
      setAttachments([])
    }
    msgQueue.enqueue(text, { atts, skillUse })
    setPrompt('')
  }

  /** the composer's send: the typed text goes out with the chosen skills */
  const sendDraft = () => {
    const text = prompt.trim()
    if (!text) return
    skills.withSkills(text, (skillUse) => send(text, undefined, skillUse))
  }

  /** the skills a past user message was sent with, for resending it (none for a restored one) */
  const entrySkillUse = (entry: ChatEntry): SkillUse =>
    entry.skills && entry.skillText !== undefined
      ? { text: entry.skillText, chips: entry.skills }
      : NO_SKILL_USE

  const stop = (): void => {
    msgQueue.hold()
    const loop = loopRef.current
    if (loop?.busy) loop.cancel()
    else cancelPendingSend()
  }

  const retry = (): void => {
    send(runInstructionRef.current, [], lastSkillUseRef.current)
  }

  /** "Continue with …" on a blocked run: that provider becomes the selection and the request runs again */
  const continueWith = (provider: AiSubscriptionProviderId): void => {
    // the blocked request again, with the attachments it was sent with
    const last = [...chat].reverse().find((entry) => entry.role === 'user')
    sendGate.continueWith(provider, () => {
      if (last) send(last.text, last.attachments ?? [], entrySkillUse(last))
      else retry()
    })
  }

  // a file link in an answer opens that file in its own tab
  const fileNav = createFileNav((path) => {
    void aiApi().openSourcePath?.(path)
  })

  const copyMessage = (text: string, idx: number): void => {
    void navigator.clipboard?.writeText(text)
    setCopiedIdx(idx)
    window.setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1200)
  }

  // The display width follows the window (at most 60% of it); a wider window brings the chosen width back
  useEffect(() => {
    const onResize = (): void => setPanelWidth(clampPanelWidth(preferredWidthRef.current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const resizeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => resizeCleanupRef.current?.(), [])

  /** Dragging the panel's inner edge (its left one: the panel sits at the right of the window). */
  const startResize = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    const resizer = e.currentTarget
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: PointerEvent): void => {
      const w = clampPanelWidth(window.innerWidth - ev.clientX)
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

  const starters = host.book()?.fixedLayout ? READ_ONLY_STARTERS : STARTERS

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
          {chat.length > 0 && (
            <button
              type="button"
              className="ai-header-btn"
              onClick={() => {
                msgQueue.clear()
                sendGate.reset()
                stop()
                loopRef.current?.reset()
                setBusy(false)
                setChat([])
                skills.resetConversation()
                skillCards.reset()
                attachmentsRef.current = []
                setAttachments([])
                setAttachNotice(null)
                sentAttachmentsRef.current = []
              }}
              data-tip={t('aiNewChat')}
              aria-label={t('aiNewChat')}
            >
              <IconNewChat />
            </button>
          )}
          <button
            type="button"
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
              {starters.map(([label, promptKey]) => (
                <button
                  type="button"
                  key={label}
                  className="ai-starter"
                  onClick={() => {
                    setPrompt(t(promptKey))
                    inputRef.current?.focus()
                  }}
                >
                  {t(label)}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((entry, i) => {
          if (entry.role === 'user') {
            return (
              <div key={i} className="ai-msg ai-msg-user">
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
                        type="button"
                        className="ai-retry-btn"
                        onClick={() =>
                          send(entry.text, entry.attachments ?? [], entrySkillUse(entry))
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
          const nextEntry = chat[i + 1]
          const turnEnded = nextEntry ? nextEntry.role === 'user' : !busy
          const showToolbar = !entry.streaming && turnEnded && !!entry.text && !entry.isError
          return (
            <div
              key={i}
              className={`ai-msg ai-msg-assistant${entry.isError ? ' ai-msg-error' : ''}${entry.streaming ? ' ai-msg-streaming' : ''}`}
            >
              {!entry.text && entry.streaming ? (
                <span className="ai-typing-row">
                  <AiTypingIndicator label={hasTools ? t('aiWorking') : t('aiThinking')} />
                </span>
              ) : entry.blocked ? (
                <AiBlockedNotice
                  kind={entry.blocked.kind}
                  provider={entry.blocked.provider}
                  resetsAt={entry.blocked.resetsAt}
                  message={entry.text}
                  settings={aiSettings ?? {}}
                  // only the run that just stopped offers "continue with …": it reruns the last request
                  statuses={isLast && !busy ? subscription.statuses : {}}
                  lang={lang}
                  onContinueWith={continueWith}
                />
              ) : (
                entry.text && (
                  <div dir="auto">
                    <Markdown text={entry.text} navs={[fileNav]} />
                  </div>
                )
              )}
              {hasTools && <ToolChipList tools={entry.tools!} />}
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
                    type="button"
                    className="ai-msg-tool-btn"
                    onClick={() => copyMessage(entry.text, i)}
                    aria-label={t('aiCopyReplyTitle')}
                    data-tip={t('aiCopyReplyTitle')}
                  >
                    {copiedIdx === i ? <IconCheck /> : <IconCopy />}
                  </button>
                  {isLast && !busy && runInstructionRef.current && (
                    <button
                      type="button"
                      className="ai-msg-tool-btn"
                      onClick={retry}
                      aria-label={t('aiRegenerateTitle')}
                      data-tip={t('aiRegenerateTitle')}
                    >
                      <IconRegenerate />
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {(sendGate.connectChoice || sendGate.noticeDue) && (
        <div className="ai-composer">
          {sendGate.connectChoice ? (
            <AiConnectPrompt
              choice={sendGate.connectChoice}
              statuses={subscription.statuses}
              lang={lang}
              disabled={subscription.busy}
              attention={sendGate.connectAttention}
              onOpenSettings={() =>
                void aiApi()
                  .openAiModelSettings?.()
                  .catch(() => {})
              }
              onInstall={subscription.install}
              onUpdate={subscription.update}
              onCancelLogin={subscription.cancelLogin}
              onLogin={subscription.login}
              onRecheck={subscription.recheck}
              onAcceptMetered={subscription.acceptMetered}
              onOpenInstallHelp={subscription.openInstallHelp}
            />
          ) : (
            <AiFirstConnectionNotice
              lang={lang}
              codexKeepsHistory
              onAcknowledge={sendGate.acknowledgeNotice}
            />
          )}
        </div>
      )}
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
        {inputTruncated && (
          <AiInputTruncatedNotice lang={lang} onDismiss={() => setInputTruncated(false)} />
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
          placeholder={t('aiComposerPlaceholder')}
          hintIdle={t('aiHintIdle')}
          hintBusy={t('aiHintBusy')}
          sendLabel={t('aiSend')}
          stopLabel={t('aiStop')}
          iconOnly
          sendIconEnabled={<img src={sendEnterOn} alt="" aria-hidden />}
          sendIconDisabled={<img src={sendEnterOff} alt="" aria-hidden />}
          stopIcon={<img src={sendStop} alt="" aria-hidden />}
          textareaRef={inputRef}
          onChange={setPrompt}
          onSend={sendDraft}
          onStop={stop}
          skills={skills.composer}
          docs={docMention}
          onPasteFiles={(files) => void onPasteFiles(files)}
          footerStart={
            <>
              <AiModelPicker
                bridge={MODEL_BRIDGE}
                lang={lang}
                subscriptionStatuses={subscription.statuses}
              />
              <AiSubscriptionUsageLine usage={subscriptionUsage} lang={lang} />
              {sessionUsage && <AiUsageChip usage={sessionUsage} session lang={lang} />}
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
        />
      </div>
    </aside>
  )
}

/** Step-row status icons (the same timeline glyphs as the other editors) */
function StepIcon({ status }: { status: 'running' | 'done' | 'error' }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 14,
    height: 14,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (status === 'running') {
    return (
      <svg {...common}>
        <path d="M6.5 3.5h11M6.5 20.5h11M8 3.5v3.2c0 2.6 4 4.2 4 5.3 0 1.1 4 2.7 4 5.3v3.2M16 3.5v3.2c0 2.6-4 4.2-4 5.3 0 1.1-4 2.7-4 5.3v3.2" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.4 2.4 2.4 4.6-5" />
    </svg>
  )
}

/** Tool activity of a reply: open while tools run, folded into "Worked · N steps" when they finish; a click always wins */
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

function Svg({ children, size = 15 }: { children: ReactNode; size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

function IconNewChat(): ReactElement {
  return (
    <Svg>
      <path d="M13.5 7.2v-3A1.7 1.7 0 0 0 11.8 2.5H4.2a1.7 1.7 0 0 0-1.7 1.7v6.1a1.7 1.7 0 0 0 1.7 1.7h1.1v2l2.6-2h1.3" />
      <path d="M12.2 9.4v4M10.2 11.4h4" />
    </Svg>
  )
}

function IconCollapse(): ReactElement {
  return (
    <Svg>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M5.5 2.5v11" />
      <path d="M12.5 8H8.1M9.8 5.9 7.7 8l2.1 2.1" strokeWidth="1.3" />
    </Svg>
  )
}

function IconCopy(): ReactElement {
  return (
    <Svg size={16}>
      <rect x="5.2" y="5.2" width="8.3" height="8.8" rx="1.6" />
      <path d="M8.2 2.6H4.1A1.6 1.6 0 0 0 2.5 4.2v5.4" />
    </Svg>
  )
}

function IconCheck(): ReactElement {
  return (
    <Svg size={14}>
      <path d="m3.4 8.4 3 3 6.2-6.6" />
    </Svg>
  )
}

function IconRegenerate(): ReactElement {
  return (
    <Svg size={18}>
      <path d="M 12.68 6.65 a 4.86 4.86 0 0 0 -9 -1.08 M 3.32 9.35 a 4.86 4.86 0 0 0 9 1.08" />
      <path d="M 12.95 3.05 v 2.7 h -2.7 M 3.05 12.95 v -2.7 h 2.7" />
    </Svg>
  )
}
