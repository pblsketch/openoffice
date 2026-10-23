import React, { useEffect, useId, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import { USE_SKILL_TOOL, type SkillProposal } from '@genoffice/agent-core'
import {
  initialSkillCardDraft,
  skillCardMode,
  skillCardNameVerdict,
  skillCardSaveBlock,
  skillCardSaveFailureKey,
  skillCardSaveInput,
  skillCardSaveResultOf,
  skillNameCheckOf,
  type SkillCardBridge,
  type SkillCardDraft,
  type SkillCardNameState,
  type SkillCardStatus,
  type SkillCardTemplate,
} from './skill-card-model'
import { skillCardText, type SkillCardStringKey } from './strings-skill-card'
import './skill-card.css'

/** Wait after the last keystroke before the name is checked */
const NAME_CHECK_DELAY_MS = 250

/** What the template buttons get (the template flow renders and runs them) */
export interface SkillCardTemplateContext {
  lang: Lang
  proposal: SkillProposal
  /** the fields as the person left them */
  draft: SkillCardDraft
  /** why Save is blocked (already in the UI language), or null */
  blocked: string | null
  /** a save is running */
  busy: boolean
  /** save with this template; resolves true when saved */
  save: (template: SkillCardTemplate) => Promise<boolean>
}

export interface SkillProposalCardProps {
  lang: Lang
  proposal: SkillProposal
  /** the window's skills bridge; null: the card shows that it cannot save here */
  bridge: SkillCardBridge | null
  /**
   * The current document can go along as the skill's template (spec 5.7).
   * Off in the home ask panel; the template flow turns it on per editor.
   */
  canBeTemplate?: boolean | undefined
  /**
   * The two template buttons shown in place of Save while the template box is
   * checked. Without it, the two buttons are shown and do nothing yet.
   */
  renderTemplateActions?: ((context: SkillCardTemplateContext) => React.ReactNode) | undefined
  /** fields that start other than the proposal's (a card carried over to a preview tab) */
  initialDraft?: Partial<SkillCardDraft> | undefined
  onSaved: (id: string, draft: SkillCardDraft) => void
  onCancel: () => void
}

/**
 * The skill card (spec 5.6): the model's proposal in editable fields, the
 * name first (lists show it) with its rule check, "on its own / only when
 * called", the template box when the document can be a template, and
 * Save (Replace for an own skill) and Cancel. Nothing is written before Save;
 * Save hands the fields to the shell, which writes the skill.
 */
export function SkillProposalCard({
  lang,
  proposal,
  bridge,
  canBeTemplate = false,
  renderTemplateActions,
  initialDraft,
  onSaved,
  onCancel,
}: SkillProposalCardProps): React.JSX.Element {
  const t = (key: SkillCardStringKey, params?: Record<string, string>) =>
    skillCardText(lang, key, params)
  const ids = useId()
  const mode = skillCardMode(proposal)
  const [draft, setDraft] = useState<SkillCardDraft>(() => ({
    ...initialSkillCardDraft(proposal),
    ...initialDraft,
  }))
  const [nameState, setNameState] = useState<SkillCardNameState>('checking')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<SkillCardStringKey | null>(null)
  const liveRef = useRef(true)
  useEffect(() => {
    liveRef.current = true
    return () => {
      liveRef.current = false
    }
  }, [])

  // a proposal without a name (an older prompt's title only) gets one made from the title
  useEffect(() => {
    if (draft.name || !bridge) return
    void bridge
      .suggestName(draft.title)
      .then((name) => {
        if (liveRef.current && typeof name === 'string' && name) {
          setDraft((d) => (d.name ? d : { ...d, name }))
        }
      })
      .catch(() => undefined)
    // only once, for the starting fields
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // check the name against the rule and my skills' names whenever it changes
  const checkSeqRef = useRef(0)
  useEffect(() => {
    const seq = ++checkSeqRef.current
    const name = draft.name.trim()
    if (!bridge || !name) {
      setNameState(name ? 'checking' : { ok: false, problem: 'empty' })
      return
    }
    setNameState('checking')
    const timer = setTimeout(() => {
      const forId = mode === 'edit-own' ? proposal.target?.id : undefined
      void bridge
        .checkName(name, forId)
        .then(
          (raw) => skillNameCheckOf(raw),
          () => skillNameCheckOf(null),
        )
        .then((check) => {
          if (liveRef.current && seq === checkSeqRef.current) setNameState(check)
        })
    }, NAME_CHECK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft.name, bridge, mode, proposal.target?.id])

  const verdict = skillCardNameVerdict(mode, proposal, draft.name, nameState)
  const blockKey = bridge ? skillCardSaveBlock(draft, verdict.blocked) : 'noBridge'
  const blocked = blockKey ? t(blockKey) : null
  const nameProblem = verdict.blocked && verdict.blocked !== 'nameChecking'

  const save = async (template?: SkillCardTemplate): Promise<boolean> => {
    if (!bridge || busy || blockKey) return false
    setBusy(true)
    setFailure(null)
    try {
      const input = skillCardSaveInput(draft, proposal, { overwrite: verdict.overwrite, template })
      const result = skillCardSaveResultOf(await bridge.saveFromCard(input).catch(() => null))
      if (!liveRef.current) return result.ok
      if (result.ok) {
        onSaved(result.id, draft)
        return true
      }
      setFailure(skillCardSaveFailureKey(result.reason, result.problem))
      return false
    } finally {
      if (liveRef.current) setBusy(false)
    }
  }

  const set = (patch: Partial<SkillCardDraft>) => {
    setFailure(null)
    setDraft((d) => ({ ...d, ...patch }))
  }

  // an own skill keeps its template unless a new one is checked here
  const showTemplate = canBeTemplate
  const templateChecked = showTemplate && draft.withTemplate
  const templateContext: SkillCardTemplateContext = {
    lang,
    proposal,
    draft,
    blocked,
    busy,
    save,
  }

  return (
    <section
      className="ai-skill-card"
      aria-labelledby={`${ids}-head`}
      data-skill-card-mode={mode}
      dir="auto"
    >
      <div className="ai-skill-card-head" id={`${ids}-head`}>
        {t(mode === 'new' ? 'cardNewTitle' : 'cardEditTitle')}
        {proposal.target && <span className="ai-skill-card-target">{proposal.target.title}</span>}
      </div>
      {mode === 'copy' && <p className="ai-skill-card-note">{t('copyNotice')}</p>}

      <label className="ai-skill-card-field">
        <span>{t('fieldName')}</span>
        <input
          type="text"
          value={draft.name}
          disabled={busy}
          spellCheck={false}
          dir="ltr"
          aria-invalid={nameProblem ? true : undefined}
          onChange={(e) => set({ name: e.target.value })}
        />
        <span className="ai-skill-card-hint">{t('nameHint')}</span>
      </label>
      <label className="ai-skill-card-field">
        <span>{t('fieldDescription')}</span>
        <textarea
          rows={2}
          value={draft.description}
          disabled={busy}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>
      <label className="ai-skill-card-field">
        <span>{t('fieldBody')}</span>
        <textarea
          className="ai-skill-card-body"
          rows={8}
          value={draft.body}
          disabled={busy}
          onChange={(e) => set({ body: e.target.value })}
        />
      </label>

      <fieldset className="ai-skill-card-invoke" disabled={busy}>
        <legend>{t('invokeLabel')}</legend>
        {(['auto', 'manual'] as const).map((invoke) => (
          <label key={invoke}>
            <input
              type="radio"
              name={`${ids}-invoke`}
              value={invoke}
              checked={draft.invoke === invoke}
              onChange={() => set({ invoke })}
            />
            {t(invoke === 'auto' ? 'invokeAuto' : 'invokeManual')}
          </label>
        ))}
      </fieldset>

      {showTemplate && (
        <label className="ai-skill-card-check">
          <input
            type="checkbox"
            checked={draft.withTemplate}
            disabled={busy}
            onChange={(e) => set({ withTemplate: e.target.checked })}
          />
          {t('templateCheck')}
        </label>
      )}

      {verdict.notice && <p className="ai-skill-card-note">{t(verdict.notice)}</p>}
      {(failure || (blocked && blockKey !== 'nameChecking')) && (
        <p className="ai-skill-card-note is-error" role="alert">
          {failure ? t(failure) : blocked}
        </p>
      )}

      <div className="ai-skill-card-actions">
        {templateChecked ? (
          renderTemplateActions ? (
            renderTemplateActions(templateContext)
          ) : (
            <>
              <button type="button" className="ai-skill-card-btn primary" disabled>
                {t('templateBlank')}
              </button>
              <button type="button" className="ai-skill-card-btn" disabled>
                {t('templateAsIs')}
              </button>
            </>
          )
        ) : (
          <button
            type="button"
            className="ai-skill-card-btn primary"
            disabled={busy || !!blockKey}
            title={blocked ?? undefined}
            onClick={() => void save()}
          >
            {busy ? t('saving') : t(mode === 'edit-own' ? 'replace' : 'save')}
          </button>
        )}
        <button type="button" className="ai-skill-card-btn" disabled={busy} onClick={onCancel}>
          {t('cancel')}
        </button>
      </div>
    </section>
  )
}

/**
 * A card that is closed: "Saved · View in Settings", or the unsaved
 * proposal it stays as in the conversation.
 */
export function SkillCardLine({
  lang,
  status,
  title,
  onOpenSettings,
}: {
  lang: Lang
  status: Exclude<SkillCardStatus, 'open'>
  title: string
  onOpenSettings?: (() => void) | undefined
}): React.JSX.Element {
  return (
    <div className={`ai-skill-card-line is-${status}`} data-skill-card-status={status}>
      <span className="ai-skill-card-line-text" dir="auto">
        {skillCardText(lang, status === 'saved' ? 'saved' : 'unsaved')}
        {title ? ` · ${title}` : ''}
      </span>
      {status === 'saved' && onOpenSettings && (
        <>
          {' · '}
          <button type="button" className="ai-skill-card-link" onClick={onOpenSettings}>
            {skillCardText(lang, 'openSettings')}
          </button>
        </>
      )}
    </div>
  )
}

/**
 * "<title> skill used" for every skill the model used in a turn (spec 5.5),
 * from the turn's tool rows, so the line stays in sight when the panel folds
 * its tool rows away.
 */
export function SkillUsedNotes({
  tools,
}: {
  tools:
    | ReadonlyArray<{
        name?: string | undefined
        summary: string
        isError?: boolean | undefined
        running?: boolean | undefined
      }>
    | undefined
}): React.JSX.Element | null {
  const used = (tools ?? []).filter(
    (tool) => tool.name === USE_SKILL_TOOL && !tool.isError && !tool.running && tool.summary,
  )
  if (used.length === 0) return null
  return (
    <div className="ai-skill-used">
      {used.map((tool, i) => (
        <span key={i} className="ai-skill-used-note" dir="auto">
          {tool.summary}
        </span>
      ))}
    </div>
  )
}
