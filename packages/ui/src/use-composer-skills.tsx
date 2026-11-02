import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import {
  aiSkillsBridge,
  chipsAfterListChange,
  filterPickerSkills,
  pickerSkillsOf,
  removeSkillTrigger,
  skillChipOf,
  skillChipRef,
  skillPickerKeyAction,
  skillTriggerAt,
  withSkillChip,
  type AiSkillsBridge,
  type SkillChipRef,
  type SkillChipView,
  type SkillPickerItem,
  type SkillPickerSurface,
  type SkillTrigger,
} from './skill-picker-model'
import { buildSkillRequest, readSkillsForRequest, SKILL_SEND_MAX_CHARS } from './skill-send'
import { SkillChipRow, SkillPicker, skillPickerOptionId } from './SkillPicker'
import { skillPickerText } from './strings-skill-picker'

// ---- what a panel sends -------------------------------------------------

/** The skills one request carries */
export interface SkillUse {
  /** added to the text the model gets ('' for none); never shown on the bubble */
  text: string
  /** the chips the person put on this message (kept on the bubble and stored) */
  chips: SkillChipRef[]
}

export const NO_SKILL_USE: SkillUse = Object.freeze({ text: '', chips: [] }) as SkillUse

/** A chosen skill names a template: the template flow may take the request over */
export interface TemplateSkillRequest {
  skill: SkillChipView
  chips: SkillChipView[]
  /** what the person typed */
  text: string
}

/**
 * Hook for the template flow (spec 5.7). Return true when it took the request
 * over (the panel then sends nothing and the chips leave the composer);
 * 'stop' when nothing may be sent and the chips stay (the template file is
 * missing); false or no hook sends as usual.
 */
export type OnTemplateSkill = (
  request: TemplateSkillRequest,
) => boolean | 'stop' | Promise<boolean | 'stop'>

// ---- the composer's side ----------------------------------------------

/** What AiComposer (or a panel's own input) needs to show the list and the chips */
export interface AiComposerSkills {
  lang: Lang
  items: readonly SkillPickerItem[]
  chips: readonly SkillChipView[]
  notice: string | null
  dollarAtStartOnly?: boolean | undefined
  /** MCP servers registered and on; the chip row names the others (spec 8) */
  usableMcpServers?: ReadonlySet<string> | undefined
  /** the list opened: read it again (spec 9.2) */
  onOpen: () => void
  onPick: (item: SkillPickerItem) => void
  onRemove: (id: string) => void
  onManage: () => void
}

export interface ComposerSkillsOptions {
  lang: Lang
  /** 'panel' (editors, home ask) leaves agent-only skills out */
  surface?: SkillPickerSurface | undefined
  /** sheets: `$` opens only at the start of the input */
  dollarAtStartOnly?: boolean | undefined
  onTemplateSkill?: OnTemplateSkill | undefined
  /** total cap of the added text */
  maxChars?: number | undefined
  /**
   * MCP servers registered and on (spec 8): the chips name the others and the
   * request tells the model they cannot be used; none by default
   */
  usableMcpServers?: ReadonlySet<string> | undefined
  /** tests inject one; the default is the window's `aiOfficeUserSkills` */
  bridge?: AiSkillsBridge | null | undefined
}

export interface ComposerSkills {
  /** pass to AiComposer's `skills`; undefined when the window has no skills bridge */
  composer: AiComposerSkills | undefined
  chips: readonly SkillChipView[]
  /** whether a skill is on and listed now (true until the list was read) */
  isAvailable: (id: string) => boolean
  /**
   * Read the chosen skills (and, once after a saved conversation was opened,
   * the skills it used) and hand the request's skill text to `send`. Runs
   * `send` right away when there is nothing to read. A refusal (too large, a
   * chosen skill gone) shows its line in the composer and does not call `send`.
   */
  withSkills: (userText: string, send: (use: SkillUse) => void) => void
  /** the request went out: its chips leave the composer and the restored skills are in */
  consume: (use: SkillUse) => void
  /** a saved conversation was opened: the chips its messages kept */
  restoreHistory: (chipLists: ReadonlyArray<readonly SkillChipRef[] | undefined>) => void
  /** a new conversation: forget the restored skills */
  resetConversation: () => void
}

function sameIds(a: readonly SkillChipView[], b: readonly SkillChipView[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (c, i) => c.id === b[i]?.id && c.title === b[i]?.title && !!c.missing === !!b[i]?.missing,
    )
  )
}

/**
 * The skills of one AI panel: the enabled list (read on mount, on every change
 * and whenever the list opens), the composer's chips, and the text a request
 * gets for them. Never starts an AI run by itself.
 */
export function useComposerSkills(options: ComposerSkillsOptions): ComposerSkills {
  const { lang, surface = 'panel', dollarAtStartOnly, maxChars = SKILL_SEND_MAX_CHARS } = options
  const bridgeRef = useRef<AiSkillsBridge | null>(null)
  bridgeRef.current = options.bridge !== undefined ? options.bridge : aiSkillsBridge()
  const hasBridge = bridgeRef.current !== null
  const templateRef = useRef(options.onTemplateSkill)
  templateRef.current = options.onTemplateSkill
  const usableMcpRef = useRef(options.usableMcpServers)
  usableMcpRef.current = options.usableMcpServers

  const [items, setItems] = useState<SkillPickerItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [chips, setChips] = useState<SkillChipView[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const chipsRef = useRef(chips)
  chipsRef.current = chips
  /** skills a reopened conversation used, re-read into the next request once */
  const historyRef = useRef<string[]>([])
  /** skills that could not be read at the last send although listed */
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  const readingRef = useRef(false)
  const liveRef = useRef(true)
  const listSeqRef = useRef(0)
  const langRef = useRef(lang)
  langRef.current = lang

  const refresh = useCallback(() => {
    const bridge = bridgeRef.current
    if (!bridge) return
    const seq = ++listSeqRef.current
    void bridge
      .list()
      .then((raw) => {
        if (!liveRef.current || seq !== listSeqRef.current) return
        const next = pickerSkillsOf(raw, langRef.current, surface)
        setItems(next)
        setLoaded(true)
        setGone(new Set())
        setChips((prev) => {
          const kept = chipsAfterListChange(prev, next)
          return sameIds(prev, kept) ? prev : kept
        })
      })
      .catch(() => {})
  }, [surface])

  useEffect(() => {
    liveRef.current = true
    const bridge = bridgeRef.current
    if (!bridge) return
    refresh()
    const off = bridge.onChanged(refresh)
    return () => {
      liveRef.current = false
      off()
    }
  }, [refresh, hasBridge])

  // builtin titles follow the UI language
  useEffect(() => {
    if (loaded) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  const isAvailable = useCallback(
    (id: string) => !loaded || (items.some((item) => item.id === id) && !gone.has(id)),
    [items, loaded, gone],
  )

  const onPick = useCallback((item: SkillPickerItem) => {
    setNotice(null)
    setChips((prev) => withSkillChip(prev, skillChipOf(item)))
  }, [])

  const onRemove = useCallback((id: string) => {
    setNotice(null)
    setChips((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const onManage = useCallback(() => {
    void bridgeRef.current?.openSettings().catch(() => {})
  }, [])

  const withSkills = useCallback(
    (userText: string, send: (use: SkillUse) => void) => {
      const composerChips = chipsRef.current
      const history = historyRef.current.filter((id) => !composerChips.some((c) => c.id === id))
      const bridge = bridgeRef.current
      if ((composerChips.length === 0 && history.length === 0) || !bridge) {
        send(NO_SKILL_USE)
        return
      }
      if (readingRef.current) return
      const t = (key: 'missingNotice' | 'tooLarge') => skillPickerText(langRef.current, key)
      if (composerChips.some((c) => c.missing)) {
        setNotice(t('missingNotice'))
        return
      }
      readingRef.current = true
      void (async () => {
        try {
          // a chip naming a template whose file is gone still goes to the hook,
          // which says so and sends nothing (spec 5.7)
          const template = composerChips.find((c) => c.template || c.templateMissing)
          const onTemplate = templateRef.current
          if (template && onTemplate) {
            const taken = await onTemplate({
              skill: template,
              chips: [...composerChips],
              text: userText,
            })
            if (taken === 'stop') return
            if (taken) {
              setChips((prev) => prev.filter((c) => !composerChips.some((u) => u.id === c.id)))
              return
            }
          }
          const ids = [...composerChips.map((c) => c.id), ...history]
          const { skills, missing } = await readSkillsForRequest(bridge, ids)
          if (!liveRef.current) return
          if (missing.length > 0) setGone((prev) => new Set([...prev, ...missing]))
          const chosenMissing = composerChips.filter((c) => missing.includes(c.id))
          if (chosenMissing.length > 0) {
            // spec 9.1: the chip becomes unavailable and nothing is sent without it
            setChips((prev) =>
              prev.map((c) => (missing.includes(c.id) ? { ...c, missing: true } : c)),
            )
            setNotice(t('missingNotice'))
            return
          }
          const usable = usableMcpRef.current
          const built = buildSkillRequest(skills, maxChars, {
            mcpServerUsable: usable ? (name) => usable.has(name) : undefined,
          })
          if (!built.ok) {
            setNotice(t('tooLarge'))
            return
          }
          setNotice(null)
          send({ text: built.text, chips: composerChips.map(skillChipRef) })
        } finally {
          readingRef.current = false
        }
      })()
    },
    [maxChars],
  )

  const consume = useCallback((use: SkillUse) => {
    historyRef.current = []
    setNotice(null)
    if (use.chips.length === 0) return
    const sent = new Set(use.chips.map((c) => c.id))
    setChips((prev) => prev.filter((c) => !sent.has(c.id)))
  }, [])

  const restoreHistory = useCallback(
    (chipLists: ReadonlyArray<readonly SkillChipRef[] | undefined>) => {
      const ids: string[] = []
      for (const list of chipLists) {
        for (const chip of list ?? []) if (!ids.includes(chip.id)) ids.push(chip.id)
      }
      historyRef.current = ids
    },
    [],
  )

  const resetConversation = useCallback(() => {
    historyRef.current = []
  }, [])

  const composer: AiComposerSkills | undefined = hasBridge
    ? {
        lang,
        items,
        chips,
        notice,
        dollarAtStartOnly,
        usableMcpServers: options.usableMcpServers,
        onOpen: refresh,
        onPick,
        onRemove,
        onManage,
      }
    : undefined

  return {
    composer,
    chips,
    isAvailable,
    withSkills,
    consume,
    restoreHistory,
    resetConversation,
  }
}

// ---- the input's side ---------------------------------------------------

export interface SkillPickerInput {
  /** run first in the input's keydown; true when the open list took the key */
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
  /** after every change and caret move of the input */
  track: (el: HTMLTextAreaElement) => void
  onCompositionStart: () => void
  onCompositionEnd: (e: React.CompositionEvent<HTMLTextAreaElement>) => void
  onBlur: () => void
  /** attributes for the input while the list is open */
  inputProps: {
    'aria-expanded'?: boolean
    'aria-controls'?: string
    'aria-activedescendant'?: string
    'aria-autocomplete'?: 'list'
  }
  /** the list, placed right above the input */
  popup: React.ReactNode
  /** the chips, placed where the attachments sit */
  chipRow: React.ReactNode
  open: boolean
}

/**
 * The skill list on one input: opens at a `/` or `$` (skillTriggerAt), filters
 * as the person types, takes ↑/↓/Enter/Tab/Esc while open, and on a pick
 * takes the typed `/word` out of the input and adds the chip. With no
 * `skills` it does nothing and the input behaves as before.
 */
export function useSkillPickerInput({
  skills,
  value,
  onChange,
  textareaRef,
}: {
  skills: AiComposerSkills | undefined
  value: string
  onChange: (next: string) => void
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}): SkillPickerInput {
  const listId = useId()
  const [caret, setCaret] = useState<number | null>(null)
  const [composing, setComposing] = useState(false)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [selection, setSelection] = useState({ key: '', index: 0 })
  const pendingCaretRef = useRef<number | null>(null)

  const live =
    skills && caret !== null
      ? skillTriggerAt(value, caret, { dollarAtStartOnly: skills.dollarAtStartOnly, composing })
      : null
  // a composition never opens the list; one already open keeps its last filter until it ends
  const frozenRef = useRef<SkillTrigger | null>(null)
  if (!composing) frozenRef.current = live
  const trigger = composing ? frozenRef.current : live
  const matches = trigger && skills ? filterPickerSkills(skills.items, trigger.query) : []
  const open = !!trigger && matches.length > 0 && dismissed !== trigger.start
  const key = trigger ? `${trigger.start}:${trigger.query}` : ''
  const active = selection.key === key ? Math.min(selection.index, matches.length) : 0

  // a closed trigger forgets that Esc dismissed it
  useEffect(() => {
    if (!trigger && dismissed !== null) setDismissed(null)
  }, [trigger, dismissed])

  const onOpen = skills?.onOpen
  useEffect(() => {
    if (open) onOpen?.()
    // re-read only when the list opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // put the caret where the removed `/word` was
  useLayoutEffect(() => {
    const at = pendingCaretRef.current
    const ta = textareaRef.current
    if (at === null || !ta) return
    pendingCaretRef.current = null
    ta.setSelectionRange(at, at)
    setCaret(at)
  }, [value, textareaRef])

  const pick = (index: number) => {
    if (!skills || !trigger) return
    if (index >= matches.length) {
      setDismissed(trigger.start)
      skills.onManage()
      return
    }
    const item = matches[index]
    if (!item) return
    const next = removeSkillTrigger(value, trigger)
    pendingCaretRef.current = next.caret
    onChange(next.value)
    skills.onPick(item)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    const action = skillPickerKeyAction({
      key: e.key,
      shiftKey: e.shiftKey,
      isComposing: e.nativeEvent.isComposing || composing,
      open,
    })
    if (!action || !trigger) return false
    e.preventDefault()
    // an Esc that closes the list must not reach a handler that stops the run
    e.stopPropagation()
    const count = matches.length + 1
    if (action === 'next') setSelection({ key, index: (active + 1) % count })
    else if (action === 'prev') setSelection({ key, index: (active - 1 + count) % count })
    else if (action === 'close') setDismissed(trigger.start)
    else pick(active)
    return true
  }

  const track = (el: HTMLTextAreaElement) => {
    if (!skills) return
    setCaret(el.selectionStart === el.selectionEnd ? el.selectionStart : null)
  }

  const inputProps: SkillPickerInput['inputProps'] = open
    ? {
        'aria-expanded': true,
        'aria-controls': listId,
        'aria-activedescendant': skillPickerOptionId(listId, active),
        'aria-autocomplete': 'list',
      }
    : {}

  const popup =
    open && skills ? (
      <div className="ai-skill-anchor">
        <SkillPicker
          lang={skills.lang}
          listId={listId}
          items={matches}
          active={active}
          onPick={pick}
          onHover={(index) => setSelection({ key, index })}
        />
      </div>
    ) : null

  const chipRow = skills ? (
    <SkillChipRow
      lang={skills.lang}
      chips={skills.chips}
      notice={skills.notice}
      usableMcpServers={skills.usableMcpServers}
      onRemove={skills.onRemove}
    />
  ) : null

  return {
    onKeyDown,
    track,
    onCompositionStart: () => setComposing(true),
    onCompositionEnd: (e) => {
      setComposing(false)
      track(e.currentTarget)
    },
    onBlur: () => setCaret(null),
    inputProps,
    popup,
    chipRow,
    open,
  }
}
