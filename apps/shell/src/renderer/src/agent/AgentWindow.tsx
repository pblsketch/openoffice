import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { htmlDir, htmlLang, type Lang, type Params } from '@genoffice/i18n'
import {
  pickerSkillsOf,
  skillChipOf,
  skillPickerText,
  useSkillPickerInput,
  withSkillChip,
  type AiComposerSkills,
  type SkillChipView,
  type SkillPickerItem,
} from '@genoffice/ui'
import './globals'
import {
  AGENT_CODEX_WEB_SEARCH,
  AGENT_MODES,
  AGENT_PROVIDERS,
  AGENT_WARNING_VERSION,
  type AgentActionView,
  type AgentAllowScope,
  type AgentCodexWebSearch,
  type AgentConnection,
  type AgentInit,
  type AgentInstallProposalPayload,
  type AgentMode,
  type AgentPrefs,
  type AgentProjectPrefs,
  type AgentProjectSkillsView,
  type AgentProvider,
  type AgentSessionSkill,
  type AgentSkillProposalPayload,
} from '../../../shared/agent-api'
import { agentText, type AgentStringKey } from '../i18n/strings-agent'
import { agentWebText, type AgentWebStringKey } from '../i18n/strings-agent-web'
import { agentSkillsText } from '../i18n/strings-agent-skills'
import {
  agentProjectSkillsText,
  type AgentProjectSkillsStringKey,
} from '../i18n/strings-agent-project-skills'
import { AgentSkillCard, agentSkillsBridge } from './AgentSkillCard'
import { AgentInstallProposal } from './AgentInstallProposal'
import {
  agentPickerSkillsRaw,
  agentSkillNoticeShown,
  agentSkillRequest,
} from './agent-skills-model'
import {
  agentPermissionChoices,
  agentSessionAllowLabel,
  agentWebPermissionLabel,
  codexNetworkWarningShown,
} from './agent-web'
import {
  EMPTY_AGENT_LOG,
  agentLogAfterAnswer,
  coveredBySessionAllow,
  agentLogAfterSend,
  agentLogAfterSkillsChanged,
  agentLogWith,
  agentLogWithSkillItem,
  openablePath,
  type AgentLogEntry,
  type AgentLogState,
} from './agent-log'

const PROVIDER_LABEL: Record<AgentProvider, AgentStringKey> = {
  'claude-code': 'providerClaude',
  codex: 'providerCodex',
}
const PROVIDER_NOTE: Record<AgentProvider, AgentStringKey> = {
  'claude-code': 'providerClaudeNote',
  codex: 'providerCodexNote',
}
const MODE_LABEL: Record<AgentMode, [AgentStringKey, AgentStringKey]> = {
  'ask-commands': ['modeAskCommands', 'modeAskCommandsDesc'],
  'ask-writes': ['modeAskWrites', 'modeAskWritesDesc'],
  'trust-project': ['modeTrust', 'modeTrustDesc'],
}
const CONNECTION_NOTE: Partial<Record<AgentConnection, AgentStringKey>> = {
  checking: 'connChecking',
  unavailable: 'connUnavailable',
  'metered-accepted': 'connMetered',
  blocked: 'providerBlocked',
}
const ACTION_LABEL: Record<
  Exclude<AgentActionView['kind'], 'web-search' | 'web-fetch'>,
  AgentStringKey
> = {
  read: 'actRead',
  write: 'actWrite',
  command: 'actCommand',
  'app-tool': 'actAppTool',
  skill: 'actSkill',
  other: 'actOther',
}
const WEB_ACTION_LABEL: Record<'web-search' | 'web-fetch', AgentWebStringKey> = {
  'web-search': 'actWebSearch',
  'web-fetch': 'actWebFetch',
}
const WEB_SEARCH_LABEL: Record<AgentCodexWebSearch, AgentWebStringKey> = {
  cached: 'codexWebCached',
  live: 'codexWebLive',
  disabled: 'codexWebDisabled',
}
const STATUS_LABEL: Record<'running' | 'done' | 'failed' | 'denied', AgentStringKey> = {
  running: 'toolRunning',
  done: 'toolDone',
  failed: 'toolFailed',
  denied: 'toolDenied',
}
const START_ERROR: Record<string, AgentStringKey> = {
  'bad-folder': 'errBadFolder',
  'not-connected': 'errNotConnected',
  'not-accepted': 'errNotAccepted',
  'provider-blocked': 'providerBlocked',
}
const RUN_ERROR: Record<string, AgentStringKey> = {
  'unsafe-tools': 'errUnsafeTools',
  'sandbox-unavailable': 'errSandboxUnavailable',
  'rate-limit': 'errRateLimit',
  'signed-out': 'errSignedOut',
  'metered-not-accepted': 'errMetered',
  'needs-update': 'errNeedsUpdate',
  'not-installed': 'errNotInstalled',
}

function runErrorKey(kind: string | undefined): AgentStringKey {
  return (kind && RUN_ERROR[kind]) || 'errGeneric'
}

/** The app's own tools that only read (`read_sheet`, `open_documents`, …), as either program names them */
const APP_READ_TOOL = /(?:^|[:_])(?:read_[a-z]+|open_documents)$/
/** The app's tools that only offer a skill card; they do not touch a document */
const APP_SKILL_TOOL = /(?:^|[:_])propose_skill(?:_install)?$/

function actionLabel(lang: Lang, action: AgentActionView): string {
  if (action.kind === 'web-search' || action.kind === 'web-fetch') {
    return agentWebText(lang, WEB_ACTION_LABEL[action.kind])
  }
  if (action.kind === 'app-tool' && APP_SKILL_TOOL.test(action.tool)) {
    return agentSkillsText(lang, 'actProposeSkill')
  }
  return agentText(
    lang,
    action.kind === 'app-tool' && APP_READ_TOOL.test(action.tool)
      ? 'actRead'
      : ACTION_LABEL[action.kind],
  )
}

function actionDetail(action: AgentActionView): string {
  if (action.kind === 'command') return action.command ?? ''
  if (action.kind === 'web-search' || action.kind === 'web-fetch') {
    return action.target ?? action.tool
  }
  if (action.paths.length > 0) return action.paths.join(', ')
  return action.tool
}

export function AgentWindow() {
  const api = window.aiOfficeAgentWindow
  const [init, setInit] = useState<AgentInit | null>(null)
  const [prefs, setPrefs] = useState<AgentPrefs | null>(null)
  const [folder, setFolder] = useState('')
  const [startError, setStartError] = useState<AgentStringKey | null>(null)
  const [starting, setStarting] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [log, setLog] = useState<AgentLogState>(EMPTY_AGENT_LOG)
  const [input, setInput] = useState('')
  /** the Codex choices of the chosen folder, as remembered for it */
  const [projectPrefs, setProjectPrefs] = useState<AgentProjectPrefs | null>(null)
  /** the chosen folder's own skills and whether they are on (decision 0064) */
  const [projectSkills, setProjectSkills] = useState<AgentProjectSkillsView | null>(null)
  const folderRef = useRef('')
  const sessionRef = useRef<string | null>(null)
  const logEnd = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const skillsApi = useMemo(() => agentSkillsBridge(), [])
  /** the session's skills: the `/` list and what each chip's instruction names (spec 6.2) */
  const [sessionSkills, setSessionSkills] = useState<AgentSessionSkill[]>([])
  const [chips, setChips] = useState<SkillChipView[]>([])
  const [chipNotice, setChipNotice] = useState<string | null>(null)
  /** the cards and install proposals the session asked for, by key */
  const [cards, setCards] = useState<Record<string, AgentSkillProposalPayload>>({})
  const [installs, setInstalls] = useState<Record<string, AgentInstallProposalPayload>>({})
  /** the one-time notice of spec 6.5: due as the main process says, until closed */
  const [noticeDue, setNoticeDue] = useState<boolean | null>(null)
  const [noticeClosed, setNoticeClosed] = useState(false)

  useEffect(() => {
    void api.getInit().then((value) => {
      setInit(value)
      setPrefs(value.prefs)
      setFolder(value.prefs.recentFolders[0] ?? '')
    })
    const offs = [
      api.onEvent(({ sessionId: id, event }) => {
        if (id !== sessionRef.current) return
        setLog((current) => agentLogWith(current, event))
      }),
      api.onSkillProposal((payload) => {
        if (payload.sessionId !== sessionRef.current) return
        setCards((current) => ({ ...current, [payload.proposal.key]: payload }))
        setLog((current) =>
          agentLogWithSkillItem(current, { kind: 'skill-card', key: payload.proposal.key }),
        )
      }),
      api.onInstallProposal((payload) => {
        if (payload.sessionId !== sessionRef.current) return
        setInstalls((current) => ({ ...current, [payload.key]: payload }))
        setLog((current) =>
          agentLogWithSkillItem(current, { kind: 'skill-install', key: payload.key }),
        )
      }),
    ]
    return () => {
      for (const off of offs) off()
    }
  }, [api])

  // spec 9.4: a session keeps the skills it started with; a change shows one line
  useEffect(() => {
    if (!skillsApi) return
    void skillsApi.agentNotice().then(setNoticeDue, () => setNoticeDue(false))
    return skillsApi.onChanged(() => {
      if (sessionRef.current) setLog((current) => agentLogAfterSkillsChanged(current))
    })
  }, [skillsApi])

  const lang: Lang = init?.lang ?? 'en'
  const pickerItems = useMemo(
    () => pickerSkillsOf(agentPickerSkillsRaw(sessionSkills), lang, 'agent'),
    [sessionSkills, lang],
  )
  const onPickSkill = useCallback((item: SkillPickerItem) => {
    setChipNotice(null)
    setChips((current) => withSkillChip(current, skillChipOf(item)))
  }, [])
  const composerSkills: AiComposerSkills | undefined =
    sessionId && pickerItems.length > 0
      ? {
          lang,
          items: pickerItems,
          chips,
          notice: chipNotice,
          // the list is the session's own: it does not change while the session runs
          onOpen: () => undefined,
          onPick: onPickSkill,
          onRemove: (id) => {
            setChipNotice(null)
            setChips((current) => current.filter((chip) => chip.id !== id))
          },
          onManage: () => void skillsApi?.openSettings(),
        }
      : undefined
  const picker = useSkillPickerInput({
    skills: composerSkills,
    value: input,
    onChange: setInput,
    textareaRef: inputRef,
  })

  // the connection check may still be running when the window opens; ask again until it settles
  const checking = init ? Object.values(init.connections).includes('checking') : false
  useEffect(() => {
    if (!checking) return
    const timer = setInterval(() => {
      void api.getInit().then((value) => setInit(value))
    }, 2000)
    return () => clearInterval(timer)
  }, [api, checking])

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'end' })
  }, [log])

  // each project folder remembers its own Codex choices; a new folder starts from the defaults
  useEffect(() => {
    folderRef.current = folder
    setProjectPrefs(null)
    setProjectSkills(null)
    if (!folder) return
    let current = true
    void api.getProjectPrefs(folder).then((value) => {
      if (current) setProjectPrefs(value)
    })
    void api.getProjectSkills(folder).then((value) => {
      if (current) setProjectSkills(value)
    })
    return () => {
      current = false
    }
  }, [api, folder])

  if (!init || !prefs) return <div className="agent" />
  const t = (key: AgentStringKey, params?: Params): string => agentText(lang, key, params)
  const tw = (key: AgentWebStringKey): string => agentWebText(lang, key)
  const tp = (key: AgentProjectSkillsStringKey, params?: Params): string =>
    agentProjectSkillsText(lang, key, params)
  document.documentElement.lang = htmlLang(lang)
  document.documentElement.dir = htmlDir(lang)

  const updatePrefs = (patch: Partial<AgentPrefs>): void => {
    setPrefs({ ...prefs, ...patch })
    void api.setPrefs(patch).then((saved) => saved && setPrefs(saved))
  }
  const updateProjectPrefs = (patch: Partial<AgentProjectPrefs>): void => {
    if (!folder || !projectPrefs) return
    const chosen = folder
    setProjectPrefs({ ...projectPrefs, ...patch })
    void api.setProjectPrefs(chosen, patch).then((saved) => {
      // a folder chosen meanwhile keeps its own choices
      if (saved && chosen === folderRef.current) setProjectPrefs(saved)
    })
  }
  const chooseProjectSkills = (on: boolean): void => {
    if (!folder || !projectSkills) return
    const chosen = folder
    setProjectSkills({ ...projectSkills, allowed: on, changed: false })
    void api.setProjectSkills(chosen, on).then((saved) => {
      if (saved && chosen === folderRef.current) setProjectSkills(saved)
    })
  }
  const connection = init.connections[prefs.provider]
  const accepted = prefs.warningAccepted >= AGENT_WARNING_VERSION
  const canStart =
    !starting &&
    folder !== '' &&
    accepted &&
    (connection === 'ready' || connection === 'metered-accepted')

  const start = async (): Promise<void> => {
    setStarting(true)
    setStartError(null)
    const result = await api.start({ provider: prefs.provider, mode: prefs.mode, folder })
    setStarting(false)
    if (!result.ok) {
      setStartError(START_ERROR[result.reason] ?? runErrorKey(result.kind))
      return
    }
    sessionRef.current = result.sessionId
    setSessionId(result.sessionId)
    setSessionSkills(result.skills ?? [])
    setChips([])
    setChipNotice(null)
    setCards({})
    setInstalls({})
    setLog(EMPTY_AGENT_LOG)
  }

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!sessionId || !text || log.busy) return
    // each chip becomes "use this skill: read <its SKILL.md> and follow it" (spec 6.2)
    const request = agentSkillRequest(text, chips, sessionSkills)
    if (!request.ok) {
      setChipNotice(skillPickerText(lang, 'missingNotice'))
      return
    }
    setInput('')
    setChips([])
    setChipNotice(null)
    setLog((current) => agentLogAfterSend(current, text, request.titles))
    const ok = await api.send(sessionId, request.text)
    if (!ok) setLog((current) => agentLogWith(current, { type: 'turn-done', ok: false }))
  }

  const closeNotice = (openSettings: boolean): void => {
    setNoticeClosed(true)
    void skillsApi?.markAgentNoticeSeen()
    if (openSettings) void skillsApi?.openSettings()
  }

  const notice = agentSkillNoticeShown(noticeDue, noticeClosed) ? (
    <div className="agent-notice" role="status">
      <p>{agentSkillsText(lang, 'noticeText')}</p>
      <div className="agent-perm-actions">
        <button
          className="agent-btn agent-btn-primary"
          type="button"
          onClick={() => closeNotice(true)}
        >
          {agentSkillsText(lang, 'noticeOpenSettings')}
        </button>
        <button className="agent-btn" type="button" onClick={() => closeNotice(false)}>
          {agentSkillsText(lang, 'noticeClose')}
        </button>
      </div>
    </div>
  ) : null

  const answer = (id: string, allow: boolean, scope: AgentAllowScope = 'once'): void => {
    if (!sessionId) return
    // a session-wide allowance also answers the same kind of request still waiting
    const ids = [id, ...(allow && scope === 'session' ? coveredBySessionAllow(log, id) : [])]
    for (const each of ids) {
      setLog((current) => agentLogAfterAnswer(current, each))
      void api.answer(sessionId, each, allow, scope)
    }
  }

  const stop = (): void => {
    if (sessionId) void api.stop(sessionId)
  }

  const reset = (): void => {
    sessionRef.current = null
    setSessionId(null)
    setSessionSkills([])
    setChips([])
    setChipNotice(null)
    setLog(EMPTY_AGENT_LOG)
    void api.getInit().then((value) => setInit(value))
  }

  const renderEntry = (entry: AgentLogEntry, index: number) => {
    switch (entry.kind) {
      case 'you':
      case 'agent':
        return (
          <div key={index} className="agent-msg" data-who={entry.kind}>
            <span className="agent-msg-who">{t(entry.kind === 'you' ? 'you' : 'agent')}</span>
            {entry.kind === 'you' && entry.skills && entry.skills.length > 0 ? (
              <span className="agent-msg-skills">
                {entry.skills.map((title, i) => (
                  <span key={i} className="agent-msg-skill" dir="auto">
                    {title}
                  </span>
                ))}
              </span>
            ) : null}
            <span className="agent-msg-text">{entry.text}</span>
          </div>
        )
      case 'skills-changed':
        return (
          <div key={index} className="agent-system" role="status">
            {agentSkillsText(lang, 'nextSession')}
          </div>
        )
      case 'skill-card': {
        const payload = cards[entry.key]
        return payload ? (
          <AgentSkillCard
            key={`card-${entry.key}`}
            lang={lang}
            payload={payload}
            api={api}
            skills={skillsApi}
          />
        ) : null
      }
      case 'skill-install': {
        const payload = installs[entry.key]
        return payload && skillsApi ? (
          <AgentInstallProposal
            key={`install-${entry.key}`}
            lang={lang}
            address={payload.address}
            skills={skillsApi}
          />
        ) : null
      }
      case 'tool': {
        const path = openablePath(entry.action)
        return (
          <div key={index} className="agent-tool" data-status={entry.status}>
            <span className="agent-tool-status">{t(STATUS_LABEL[entry.status])}</span>
            <span>{actionLabel(lang, entry.action)}</span>
            <span className="agent-tool-detail" title={actionDetail(entry.action)}>
              {(entry.action.kind === 'command' && entry.action.summary) ||
                actionDetail(entry.action)}
            </span>
            {path && entry.status === 'done' && entry.action.kind === 'write' ? (
              <button
                className="agent-link"
                type="button"
                onClick={() => void api.openFile(sessionId ?? '', path)}
              >
                {t('openFile')}
              </button>
            ) : null}
          </div>
        )
      }
      case 'started':
        return (
          <div key={index} className="agent-system">
            {t(entry.skills === 1 ? 'skillsLineOne' : 'skillsLine', { n: entry.skills })}
          </div>
        )
      case 'turn-failed':
        return (
          <div key={index} className="agent-system">
            {t('turnFailed')}
          </div>
        )
      case 'error':
        return (
          <div key={index} className="agent-error" role="alert">
            {t(runErrorKey(entry.errorKind))}
          </div>
        )
      case 'ended':
        return (
          <div key={index} className="agent-system">
            {t('ended')}
          </div>
        )
    }
  }

  if (sessionId) {
    return (
      <div className="agent" data-busy={log.busy} data-ended={log.ended}>
        <div className="agent-head">
          <h1 className="agent-title">{t('windowTitle')}</h1>
          {log.ended ? (
            <button className="agent-btn" type="button" onClick={reset}>
              {t('newSession')}
            </button>
          ) : (
            <button className="agent-btn" type="button" onClick={stop}>
              {t('stop')}
            </button>
          )}
        </div>
        <div className="agent-body">
          {notice}
          <div className="agent-system">
            {t('startedLine', { program: t(PROVIDER_LABEL[prefs.provider]), folder })}
          </div>
          <div className="agent-log">{log.entries.map(renderEntry)}</div>
          {log.pending.map((request) => (
            <div key={request.id} className="agent-perm" role="alertdialog">
              <span className="agent-label">{t('permTitle')}</span>
              <span>
                {request.action.kind === 'command'
                  ? t('permCommand')
                  : request.action.kind === 'write'
                    ? t('permWrite')
                    : request.action.kind === 'read'
                      ? t('permRead')
                      : agentWebPermissionLabel(request.action)
                        ? tw(agentWebPermissionLabel(request.action)!)
                        : t('permOther', { tool: request.action.tool })}
              </span>
              <pre className="agent-perm-detail">{actionDetail(request.action)}</pre>
              {request.action.reason ? (
                <span className="agent-choice-note">
                  {t('permReason', { reason: request.action.reason })}
                </span>
              ) : null}
              <div className="agent-perm-actions">
                {agentPermissionChoices(request.action).map((choice) =>
                  choice === 'deny' ? (
                    <button
                      key={choice}
                      className="agent-btn"
                      type="button"
                      onClick={() => answer(request.id, false)}
                    >
                      {t('permDeny')}
                    </button>
                  ) : choice === 'allow-session' ? (
                    <button
                      key={choice}
                      className="agent-btn"
                      type="button"
                      onClick={() => answer(request.id, true, 'session')}
                    >
                      {tw(agentSessionAllowLabel(request.action))}
                    </button>
                  ) : (
                    <button
                      key={choice}
                      className="agent-btn agent-btn-primary"
                      type="button"
                      onClick={() => answer(request.id, true)}
                    >
                      {t('permAllow')}
                    </button>
                  ),
                )}
              </div>
            </div>
          ))}
          <div ref={logEnd} />
        </div>
        <div className="agent-foot">
          <div className="agent-input-wrap">
            {picker.chipRow}
            {picker.popup}
            <textarea
              ref={inputRef}
              className="agent-input"
              value={input}
              placeholder={t('inputPlaceholder')}
              disabled={log.ended}
              {...picker.inputProps}
              onChange={(event) => {
                setInput(event.target.value)
                picker.track(event.target)
              }}
              onSelect={(event) => picker.track(event.currentTarget)}
              onCompositionStart={picker.onCompositionStart}
              onCompositionEnd={picker.onCompositionEnd}
              onBlur={picker.onBlur}
              onKeyDown={(event) => {
                // the open `/` list takes its keys first
                if (picker.onKeyDown(event)) return
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  void send()
                }
              }}
            />
          </div>
          <div className="agent-foot-actions">
            <button
              className="agent-btn agent-btn-primary"
              type="button"
              disabled={log.ended || log.busy || !input.trim()}
              onClick={() => void send()}
            >
              {t('send')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="agent">
      <div className="agent-head">
        <h1 className="agent-title">{t('windowTitle')}</h1>
      </div>
      <div className="agent-body">
        {notice}
        <p className="agent-intro">{t('intro')}</p>

        <div className="agent-section">
          <span className="agent-label">{t('folderLabel')}</span>
          <div className="agent-folder">
            <span className="agent-folder-path" title={folder}>
              {folder || t('folderNone')}
            </span>
            <button
              className="agent-btn"
              type="button"
              onClick={() => void api.pickFolder().then((picked) => picked && setFolder(picked))}
            >
              {t('folderPick')}
            </button>
          </div>
          {prefs.recentFolders.length > 0 ? (
            <div className="agent-recent">
              <span className="agent-choice-note">{t('recentLabel')}</span>
              {prefs.recentFolders.map((recent) => (
                <button
                  key={recent}
                  className="agent-link"
                  type="button"
                  title={recent}
                  onClick={() => setFolder(recent)}
                >
                  {recent}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {folder && projectSkills && projectSkills.skills.length > 0 ? (
          <div className="agent-section" role="radiogroup" aria-label={tp('label')}>
            <span className="agent-label">{tp('label')}</span>
            <span className="agent-choice-note">
              {tp('note', { count: projectSkills.skills.length })}
            </span>
            <ul className="agent-project-skills">
              {projectSkills.skills.map((skill) => (
                <li key={skill.name}>
                  <strong>{skill.title || skill.name}</strong>
                  {skill.description ? ` — ${skill.description}` : ''}
                </li>
              ))}
            </ul>
            {projectSkills.changed ? (
              <div className="agent-notice" role="alert">
                <p>{tp('changed')}</p>
              </div>
            ) : null}
            {[false, true].map((on) => (
              <div
                key={String(on)}
                className="agent-choice"
                role="radio"
                tabIndex={0}
                aria-checked={projectSkills.allowed === on}
                data-selected={projectSkills.allowed === on}
                onClick={() => chooseProjectSkills(on)}
                onKeyDown={(event) => event.key === ' ' && chooseProjectSkills(on)}
              >
                <div className="agent-choice-text">
                  <span>{tp(on ? 'on' : 'off')}</span>
                </div>
              </div>
            ))}
            <span className="agent-choice-note">{tp('remember')}</span>
          </div>
        ) : null}

        <div className="agent-section" role="radiogroup" aria-label={t('providerLabel')}>
          <span className="agent-label">{t('providerLabel')}</span>
          {AGENT_PROVIDERS.map((provider) => {
            const note = CONNECTION_NOTE[init.connections[provider]]
            const blocked = init.connections[provider] === 'blocked'
            const choose = (): void => {
              if (!blocked) updatePrefs({ provider })
            }
            return (
              <div
                key={provider}
                className="agent-choice"
                role="radio"
                tabIndex={blocked ? -1 : 0}
                aria-checked={prefs.provider === provider}
                aria-disabled={blocked}
                data-selected={prefs.provider === provider}
                onClick={choose}
                onKeyDown={(event) => event.key === ' ' && choose()}
              >
                <div className="agent-choice-text">
                  <span>{t(PROVIDER_LABEL[provider])}</span>
                  <span className="agent-choice-note">
                    {provider === 'codex' ? tw('providerCodexNoteWeb') : t(PROVIDER_NOTE[provider])}
                  </span>
                  {note ? <span className="agent-choice-note">{t(note)}</span> : null}
                </div>
              </div>
            )
          })}
        </div>

        <div className="agent-section" role="radiogroup" aria-label={t('modeLabel')}>
          <span className="agent-label">{t('modeLabel')}</span>
          {AGENT_MODES.map((mode) => (
            <div
              key={mode}
              className="agent-choice"
              role="radio"
              tabIndex={0}
              aria-checked={prefs.mode === mode}
              data-selected={prefs.mode === mode}
              onClick={() => updatePrefs({ mode })}
              onKeyDown={(event) => event.key === ' ' && updatePrefs({ mode })}
            >
              <div className="agent-choice-text">
                <span>{t(MODE_LABEL[mode][0])}</span>
                <span className="agent-choice-note">{t(MODE_LABEL[mode][1])}</span>
              </div>
            </div>
          ))}
        </div>

        {prefs.provider === 'codex' && folder && projectPrefs ? (
          <>
            <div className="agent-section" role="radiogroup" aria-label={tw('codexWebLabel')}>
              <span className="agent-label">{tw('codexWebLabel')}</span>
              {AGENT_CODEX_WEB_SEARCH.map((value) => (
                <div
                  key={value}
                  className="agent-choice"
                  role="radio"
                  tabIndex={0}
                  aria-checked={projectPrefs.codexWebSearch === value}
                  data-selected={projectPrefs.codexWebSearch === value}
                  onClick={() => updateProjectPrefs({ codexWebSearch: value })}
                  onKeyDown={(event) =>
                    event.key === ' ' && updateProjectPrefs({ codexWebSearch: value })
                  }
                >
                  <div className="agent-choice-text">
                    <span>{tw(WEB_SEARCH_LABEL[value])}</span>
                  </div>
                </div>
              ))}
              <span className="agent-choice-note">{tw('codexWebNote')}</span>
            </div>

            <div className="agent-section" role="radiogroup" aria-label={tw('codexNetworkLabel')}>
              <span className="agent-label">{tw('codexNetworkLabel')}</span>
              {[false, true].map((on) => (
                <div
                  key={String(on)}
                  className="agent-choice"
                  role="radio"
                  tabIndex={0}
                  aria-checked={projectPrefs.codexNetwork === on}
                  data-selected={projectPrefs.codexNetwork === on}
                  onClick={() => updateProjectPrefs({ codexNetwork: on })}
                  onKeyDown={(event) =>
                    event.key === ' ' && updateProjectPrefs({ codexNetwork: on })
                  }
                >
                  <div className="agent-choice-text">
                    <span>{tw(on ? 'codexNetworkOn' : 'codexNetworkOff')}</span>
                  </div>
                </div>
              ))}
              {codexNetworkWarningShown(projectPrefs) ? (
                <div className="agent-notice" role="alert">
                  <p>{tw('codexNetworkWarning')}</p>
                </div>
              ) : null}
              <span className="agent-choice-note">{tw('codexFolderNote')}</span>
            </div>
          </>
        ) : null}

        <div className="agent-notice">
          <strong>{t('warningTitle')}</strong>
          <p>{t('warningCommands')}</p>
          <p>{t('warningRedaction')}</p>
          <p>{t('warningUsage')}</p>
          <label>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) =>
                updatePrefs({ warningAccepted: event.target.checked ? AGENT_WARNING_VERSION : 0 })
              }
            />{' '}
            {t('warningAccept')}
          </label>
        </div>

        {startError ? (
          <div className="agent-error" role="alert">
            {t(startError)}
          </div>
        ) : null}
      </div>
      <div className="agent-foot">
        <span className="agent-choice-note" style={{ flex: 1 }} />
        <button
          className="agent-btn agent-btn-primary"
          type="button"
          disabled={!canStart}
          onClick={() => void start()}
        >
          {starting ? t('starting') : t('start')}
        </button>
      </div>
    </div>
  )
}
