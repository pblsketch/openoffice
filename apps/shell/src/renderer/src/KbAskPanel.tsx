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
  type CreateDocumentFormat,
  type KbFileInfo,
} from '@genoffice/agent-core'
import {
  AiBlockedNotice,
  AiComposer,
  AiConnectPrompt,
  AiTypingIndicator,
  AiUsageChip,
  addTokenUsage,
  aiRunErrorText,
  aiSubscriptionText,
  createFileNav,
  Markdown,
  NO_SKILL_USE,
  SentSkillChips,
  panelUserSkills,
  useComposerSkills,
  useSkillProposals,
  useSkillTemplates,
  type AiTokenUsageView,
  type SkillChipRef,
  type SkillUse,
} from '@genoffice/ui'
import type { AiSettings } from '@genoffice/ai-provider'
import {
  AI_SUBSCRIPTION_PROVIDERS,
  isSubscriptionProvider,
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
 * The conversation lives in memory only; it does not survive a restart (the
 * editor panels persist through project-store — wiring that here is a
 * deliberate later step, not an oversight). An empty corpus gets an
 * onboarding hero instead of a bare hint: the only useful move there is
 * going to Recents and starring files, so the panel says so and offers the
 * jump as a button.
 */

/** one tool a turn used, badge-shaped; the icon follows the call name */
interface ToolNote {
  label: string
  /** 'skill': "<title> skill used"; 'create': a new document was made */
  kind: 'search' | 'read' | 'skill' | 'create'
}

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
  /** the run stopped because its connection cannot go on: shown as the blocked notice */
  blocked?: AskBlockedRun
  /** the reason as the transport worded it, for a kind the notice has no text of its own for */
  blockedReason?: string
  /** skill chips a question carried */
  skills?: SkillChipRef[]
  /** skill cards the model proposed in this answer (keys of useSkillProposals) */
  skillProposals?: string[]
}

export function KbAskPanel({
  onOpenPath,
  onGoToRecents,
  connection,
  aiSettings,
  noticeDue,
  onOpenAiSettings,
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
    loopRef.current = new AgentLoop({
      transport: createIpcTransport<AiSettings>({
        onStream: (listener) => window.aiOffice.onAiStream(listener),
        start: (request) => window.aiOffice.aiStream(request),
        cancel: (requestId) => void window.aiOffice.aiStreamCancel(requestId),
        getSettings: () => settingsRef.current as AiSettings,
        unknownErrorText: () => t('askUnknownError'),
        // the subscription causes are worded once for every AI surface of the suite
        errorText: (cause) => aiRunErrorText(langRef.current, cause),
        onStreamError: (error) => {
          streamErrorRef.current = askBlockedRunOf(error)
        },
      }),
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
        docSkill,
      ]),
      events: {
        onText: (text) => patchLast({ text }),
        onToolStart: (call) => {
          // the skill tools show their own line once they ran
          if (USER_SKILL_TOOL_NAMES.has(call.name)) return
          patchLast((last) => ({
            toolNotes: [
              ...last.toolNotes,
              call.name === 'search_knowledge_base'
                ? { label: t('askToolSearch'), kind: 'search' as const }
                : call.name === CREATE_DOCUMENT_TOOL
                  ? { label: t('askToolCreate'), kind: 'create' as const }
                  : { label: t('askToolRead'), kind: 'read' as const },
            ],
          }))
        },
        onToolExecuted: ({ call, execution }) => {
          if (call.name !== USE_SKILL_TOOL || execution.isError) return
          patchLast((last) => ({
            toolNotes: [...last.toolNotes, { label: execution.summary, kind: 'skill' as const }],
          }))
        },
        onDone: () => {
          endRunScope()
          finishLast()
        },
        onUsage: (usage) => {
          runUsageRef.current = addTokenUsage(runUsageRef.current, usage)
          setSessionUsage((prev) => addTokenUsage(prev, usage))
          patchLast({ usage: runUsageRef.current })
        },
        onError: (error) => {
          endRunScope()
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
    // a narrowed ask: main mints this run's scope for the chosen group and keeps
    // every call of the run inside it. A group that has no files any more runs
    // nothing; it never widens to every starred file.
    const group = scopeGroup
    refreshGroups()
    let scope: string | undefined
    if (group !== null) {
      try {
        scope = await window.aiOffice.kbOpenScope(group)
      } catch {
        if (askSeqRef.current !== seq) return
        setMessages((prev) => [
          ...prev,
          asked,
          { role: 'assistant', text: t('askScopeGone'), toolNotes: [], isError: true },
        ])
        setBusy(false)
        return
      }
    }
    runScopeRef.current = scope
    openScopeRef.current = scope
    if (askSeqRef.current !== seq) {
      endRunScope()
      return
    }
    // freshly starred files are answerable this very turn
    try {
      const files =
        scope === undefined ? await window.aiOffice.kbList() : await window.aiOffice.kbList(scope)
      corpusRef.current = files
      if (scope === undefined) setCorpusCount(files.length)
      else setScopeCount(files.length)
    } catch {
      // keep the mount snapshot; a narrowed run never falls back to the full list
      if (scope !== undefined) corpusRef.current = []
    }
    if (askSeqRef.current !== seq) {
      endRunScope()
      return
    }
    if (corpusRef.current.length === 0) {
      endRunScope()
      setMessages((prev) => [
        ...prev,
        asked,
        scope === undefined
          ? { role: 'assistant', text: t('askEmptyCorpus'), toolNotes: [] }
          : { role: 'assistant', text: t('askScopeGone'), toolNotes: [], isError: true },
      ])
      setBusy(false)
      return
    }
    setMessages((prev) => [
      ...prev,
      asked,
      { role: 'assistant', text: '', toolNotes: [], streaming: true },
    ])
    try {
      // the skill text rides with this question only; the question shows the chips
      await loopRef.current!.run(instruction + skillUse.text)
    } catch {
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

  const fileNav = createFileNav((path) => onOpenPath(path))

  return (
    <div className="kb-ask">
      {corpusCount !== null && corpusCount > 0 && (
        <div className="kb-ask-headbar">
          <b>{t('askTitle')}</b>
          <span>
            {scopeGroup === null
              ? t('askCorpusCount', { n: String(corpusCount) })
              : scopeCount === null
                ? scopeGroup
                : t('askCorpusCountGroup', { group: scopeGroup, n: String(scopeCount) })}
          </span>
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
        {messages.length === 0 && corpusCount === 0 && (
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
          </div>
        )}
        {messages.length === 0 && corpusCount !== null && corpusCount > 0 && (
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
                  <span key={j} className="kb-ask-tool-note">
                    {note.kind === 'search' ? (
                      <IconSearch />
                    ) : note.kind === 'read' ? (
                      <IconFileText />
                    ) : note.kind === 'create' ? (
                      <IconFilePlus />
                    ) : null}
                    {note.label}
                    {m.streaming && j === m.toolNotes.length - 1 ? '…' : ''}
                  </span>
                ))}
              </div>
            )}
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
            {m.role === 'assistant' && m.text && !m.streaming && !m.isError && (
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
      {messages.length > 0 && (
        <p className="kb-ask-nosave">
          <IconInfo />
          {t('askNoSave')}
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
      <AiComposer
        value={draft}
        busy={busy}
        placeholder={t('askPlaceholder')}
        hintIdle={t('askHintIdle')}
        hintBusy={t('askHintBusy')}
        sendLabel={t('askSend')}
        stopLabel={t('askStop')}
        ariaLabel={t('askPlaceholder')}
        iconOnly
        sendIconEnabled={<img src={sendEnterOn} alt="" aria-hidden />}
        sendIconDisabled={<img src={sendEnterOff} alt="" aria-hidden />}
        stopIcon={<img src={sendStop} alt="" aria-hidden />}
        footerStart={
          sessionUsage ? <AiUsageChip usage={sessionUsage} session lang={lang} /> : undefined
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
