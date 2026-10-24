import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import {
  createBridgedUserSkillsSkill,
  windowUserSkillsBridge,
  type AgentMessage,
  type AgentSkill,
  type SkillProposal,
  type UserSkillText,
  type UserSkillsBridgeLike,
} from '@genoffice/agent-core'
import {
  readStoredSkillCards,
  skillCardBridge,
  skillCardSavedRecord,
  type SkillCardBridge,
  type SkillCardStatus,
  type StoredChatLike,
  type SavedSkillCardRecord,
} from './skill-card-model'
import {
  SkillCardLine,
  SkillProposalCard,
  type SkillCardTemplateContext,
} from './SkillProposalCard'
import { skillDisplayName } from './skill-picker-model'
import { skillCardText } from './strings-skill-card'
import {
  OriginalTemplateActions,
  PreviewTemplateActions,
  SkillCardPreviewLine,
} from './SkillTemplateActions'
import {
  previewEndedOf,
  skillTemplateBridge,
  type HandedPreview,
  type SkillTemplateBridge,
  type TemplateDocument,
} from './skill-template-model'

// ---- the capability an AI panel composes ------------------------------------

export interface PanelUserSkillsOptions {
  /** the UI language now (the loop lives longer than one render) */
  lang: () => Lang
  /** the loop's history: skills the request carries as chips are not listed again */
  messages: () => readonly AgentMessage[]
  /** a proposal came in: show its card */
  onProposal: (proposal: SkillProposal) => void
  /** the model used a skill on its own (the template flow offers its template) */
  onUsed?: ((skill: UserSkillText) => void) | undefined
  /** tests inject one; the default is the window's `aiOfficeUserSkills` */
  bridge?: UserSkillsBridgeLike | null | undefined
}

/**
 * The skill tools (`use_skill`, `read_skill_file`, `propose_skill`) for an AI
 * panel's composeSkills list, worded in the UI language: one capability, or
 * none when the window has no skills bridge (a test, an older preload).
 */
export function panelUserSkills(options: PanelUserSkillsOptions): AgentSkill[] {
  const bridge = options.bridge !== undefined ? options.bridge : windowUserSkillsBridge()
  if (!bridge) return []
  return [
    createBridgedUserSkillsSkill(bridge, {
      messages: options.messages,
      onProposal: options.onProposal,
      onUsed: options.onUsed,
      labels: {
        used: (title) => skillCardText(options.lang(), 'skillUsed', { title }),
        proposed: (title) => skillCardText(options.lang(), 'skillProposed', { title }),
      },
      displayTitle: (skill) =>
        skillDisplayName({
          name: skill.name,
          title: skill.source === 'builtin' ? '' : skill.title,
        }),
    }),
  ]
}

// ---- the cards in a panel's chat ----------------------------------------------

/** What a proposal is called in the chat: the name the model gave (a title in older chats) */
function proposalLabel(proposal: SkillProposal): string {
  return proposal.name || proposal.title
}

/** 'preview': the card continues in a template preview tab (spec 5.6) */
type CardEntryStatus = SkillCardStatus | 'preview'

interface CardEntry {
  /** the live proposal; absent for a card read back from a stored conversation */
  proposal?: SkillProposal
  title: string
  status: CardEntryStatus
  /** the preview tab this card continues in */
  continuesIn?: { tabId: string; previewId: string } | undefined
  /** this card is the one a template preview tab took over */
  preview?: HandedPreview | undefined
}

export interface SkillProposalsOptions {
  lang: Lang
  /**
   * The panel's current document can go along as a skill's template
   * (spec 5.7). False until the template flow sets it per editor; the home
   * ask panel never does.
   */
  canBeTemplate?: boolean | undefined
  /** the template buttons (the template flow); see SkillProposalCard */
  renderTemplateActions?: ((context: SkillCardTemplateContext) => React.ReactNode) | undefined
  /**
   * The panel's document while it can be a template (spec 5.7); null or
   * absent: none. With it, the card shows the template box and the template
   * flow's own buttons (unless `renderTemplateActions` is given).
   */
  templateDocument?: TemplateDocument | null | undefined
  /** tests inject one; the default is the window's `aiOfficeUserSkills` */
  templateBridge?: SkillTemplateBridge | null | undefined
  /**
   * Store a saved card's record: an assistant message with no text and this
   * one tool record. Absent in panels that store no conversation.
   */
  persistSaved?: ((record: SavedSkillCardRecord) => void) | undefined
  /** tests inject one; the default is the window's `aiOfficeUserSkills` */
  bridge?: SkillCardBridge | null | undefined
}

export interface SkillProposals {
  /** a proposal came in: its card is open from now on */
  add: (proposal: SkillProposal) => void
  /**
   * A template preview tab took a card over (spec 5.6): its card opens here
   * with the preview's buttons. Returns the card's key.
   */
  addPreview: (preview: HandedPreview) => string
  /** the card for a key a chat entry carries (null for an unknown key) */
  render: (key: string) => React.ReactNode
  /**
   * A stored conversation was opened: its cards stay closed (saved or
   * unsaved). Returns the messages to show and to hand to the loop, without
   * the saved records, each with the keys of the cards it carries.
   */
  restore: <T extends StoredChatLike>(
    messages: readonly T[],
  ) => Array<T & { skillProposals?: string[] }>
  /** a new conversation */
  reset: () => void
}

/**
 * The skill cards of one AI panel: proposals arrive from the `propose_skill`
 * tool, show as an open card, and close as saved or unsaved. A cancelled or
 * never-saved card stays in the chat as "unsaved skill proposal"; a card is
 * never written anywhere before its Save.
 */
export function useSkillProposals(options: SkillProposalsOptions): SkillProposals {
  const [cards, setCards] = useState<ReadonlyMap<string, CardEntry>>(() => new Map())
  const optionsRef = useRef(options)
  optionsRef.current = options
  const restoreSeqRef = useRef(0)

  const setCard = useCallback((key: string, patch: Partial<CardEntry>) => {
    setCards((prev) => {
      const card = prev.get(key)
      if (!card) return prev
      const next = new Map(prev)
      next.set(key, { ...card, ...patch })
      return next
    })
  }, [])

  const add = useCallback((proposal: SkillProposal) => {
    setCards((prev) => {
      const next = new Map(prev)
      next.set(proposal.key, { proposal, title: proposalLabel(proposal), status: 'open' })
      return next
    })
  }, [])

  const restore = useCallback(
    <T extends StoredChatLike>(
      messages: readonly T[],
    ): Array<T & { skillProposals?: string[] }> => {
      const read = readStoredSkillCards(messages, `stored${++restoreSeqRef.current}`)
      setCards((prev) => {
        const next = new Map(prev)
        for (const p of read.proposals) next.set(p.key, { title: p.title, status: p.status })
        return next
      })
      return read.messages
    },
    [],
  )

  const addPreview = useCallback((preview: HandedPreview): string => {
    const key = `preview-${preview.previewId}`
    setCards((prev) => {
      if (prev.has(key)) return prev
      const next = new Map(prev)
      next.set(key, {
        proposal: preview.proposal,
        title: preview.draft?.name || proposalLabel(preview.proposal),
        status: 'open',
        preview,
      })
      return next
    })
    return key
  }, [])

  const reset = useCallback(() => setCards(new Map()), [])

  const bridge = options.bridge !== undefined ? options.bridge : skillCardBridge()
  const templateBridge =
    options.templateBridge !== undefined ? options.templateBridge : skillTemplateBridge()

  // a template preview this tab opened ended in its own tab: saved, or not (spec 9.11)
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  useEffect(() => {
    if (!templateBridge) return
    return templateBridge.onPreviewEnded((raw) => {
      const ended = previewEndedOf(raw)
      if (!ended) return
      for (const [key, card] of cardsRef.current) {
        if (card.status !== 'preview' || card.continuesIn?.previewId !== ended.previewId) continue
        if (ended.outcome === 'saved') {
          setCard(key, { status: 'saved', title: ended.title || card.title })
          if (ended.skillId) {
            optionsRef.current.persistSaved?.(
              skillCardSavedRecord(
                card.proposal ? proposalLabel(card.proposal) : card.title,
                ended.skillId,
              ),
            )
          }
        } else {
          setCard(key, { status: 'unsaved' })
        }
      }
    })
  }, [templateBridge, setCard])

  const render = (key: string): React.ReactNode => {
    const card = cards.get(key)
    if (!card) return null
    const { lang } = options
    const document = options.templateDocument ?? null
    if (card.status === 'open' && card.proposal) {
      const proposal = card.proposal
      const preview = card.preview
      const renderTemplateActions =
        options.renderTemplateActions ??
        (preview
          ? (context: SkillCardTemplateContext) => (
              <PreviewTemplateActions
                context={context}
                preview={preview}
                document={document}
                bridge={templateBridge}
              />
            )
          : document
            ? (context: SkillCardTemplateContext) => (
                <OriginalTemplateActions
                  context={context}
                  document={document}
                  bridge={templateBridge}
                  onPreviewOpened={(continuesIn) =>
                    setCard(key, { status: 'preview', title: context.draft.name, continuesIn })
                  }
                />
              )
            : undefined)
      return (
        <SkillProposalCard
          key={key}
          lang={lang}
          proposal={proposal}
          bridge={bridge}
          canBeTemplate={preview ? true : (options.canBeTemplate ?? !!document)}
          renderTemplateActions={renderTemplateActions}
          initialDraft={preview ? { ...preview.draft, withTemplate: true } : undefined}
          onSaved={(id, draft) => {
            setCard(key, { status: 'saved', title: draft.name })
            // the stored record names the proposal as the model named it
            optionsRef.current.persistSaved?.(skillCardSavedRecord(proposalLabel(proposal), id))
            if (preview) {
              void templateBridge
                ?.finishPreview(preview.previewId, 'saved', { skillId: id, title: draft.name })
                .catch(() => undefined)
            }
          }}
          onCancel={() => {
            setCard(key, { status: 'unsaved' })
            if (preview) {
              void templateBridge
                ?.finishPreview(preview.previewId, 'unsaved')
                .catch(() => undefined)
            }
          }}
        />
      )
    }
    if (card.status === 'preview') {
      const tabId = card.continuesIn?.tabId
      return (
        <SkillCardPreviewLine
          key={key}
          lang={lang}
          title={card.title}
          onGoToTab={
            templateBridge && tabId
              ? () => void templateBridge.focusTab(tabId).catch(() => undefined)
              : undefined
          }
        />
      )
    }
    return (
      <SkillCardLine
        key={key}
        lang={lang}
        status={card.status === 'saved' ? 'saved' : 'unsaved'}
        title={card.title}
        onOpenSettings={bridge ? () => void bridge.openSettings().catch(() => {}) : undefined}
      />
    )
  }

  return { add, addPreview, render, restore, reset }
}
