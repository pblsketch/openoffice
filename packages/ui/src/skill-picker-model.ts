import type { Lang } from '@genoffice/i18n'
import { RESERVED_USER_SKILL_NAMES } from '@genoffice/agent-core'
import { builtinSkillDesc, isBuiltinSkillName } from './strings-builtin-skills'
import { skillPickerText } from './strings-skill-picker'

/**
 * The rules of the AI panel's skill list (`/` and `$`) as plain functions: when
 * the list opens, what it lists and how it filters, which keys it takes, and
 * the shape of a skill chip. Components only lay these out.
 */

// ---- the bridge every window's preload exposes -------------------------

/**
 * The calls of `window.aiOfficeUserSkills` the AI panels use. Kept as a local
 * shape: this package must not import the preload-side package.
 */
export interface AiSkillsBridge {
  list(): Promise<unknown>
  aiRead(id: string): Promise<unknown>
  openSettings(): Promise<void>
  onChanged(listener: () => void): () => void
}

/** The skills bridge of this window, or null (tests, a window with no shell behind it) */
export function aiSkillsBridge(): AiSkillsBridge | null {
  const b = (globalThis as { aiOfficeUserSkills?: Partial<AiSkillsBridge> }).aiOfficeUserSkills
  return b &&
    typeof b.list === 'function' &&
    typeof b.aiRead === 'function' &&
    typeof b.openSettings === 'function' &&
    typeof b.onChanged === 'function'
    ? (b as AiSkillsBridge)
    : null
}

// ---- opening ------------------------------------------------------------

export type SkillTriggerChar = '/' | '$'

/** The `/word` or `$word` the caret sits at the end of */
export interface SkillTrigger {
  char: SkillTriggerChar
  /** index of the `/` or `$` */
  start: number
  /** the caret: the typed text runs from `start` to here */
  end: number
  /** what follows the trigger character, the filter */
  query: string
}

export interface SkillTriggerOptions {
  /** `$` opens only at the very start of the input (sheets: `$A$1` cell references) */
  dollarAtStartOnly?: boolean | undefined
  /** an input-method composition (Hangul) is running: never open */
  composing?: boolean | undefined
}

/**
 * Whether the skill list opens at `caret`: a `/` or `$` at the start of the
 * input or right after whitespace, with no whitespace between it and the
 * caret. A space typed after it closes the list (there is no trigger anymore).
 */
export function skillTriggerAt(
  value: string,
  caret: number,
  options: SkillTriggerOptions = {},
): SkillTrigger | null {
  if (options.composing) return null
  if (!Number.isInteger(caret) || caret < 1 || caret > value.length) return null
  let start = caret
  while (start > 0 && !/\s/.test(value.charAt(start - 1))) start -= 1
  const char = value.charAt(start)
  if (char !== '/' && char !== '$') return null
  if (char === '$' && options.dollarAtStartOnly && start !== 0) return null
  return { char, start, end: caret, query: value.slice(start + 1, caret) }
}

/** The text with the typed trigger taken out, and where the caret goes */
export function removeSkillTrigger(
  value: string,
  trigger: SkillTrigger,
): { value: string; caret: number } {
  return { value: value.slice(0, trigger.start) + value.slice(trigger.end), caret: trigger.start }
}

// ---- keys ---------------------------------------------------------------

export type SkillPickerKeyAction = 'next' | 'prev' | 'pick' | 'close'

/**
 * What a key does while the list is open. A closed list takes no keys, so
 * Enter sends and Esc stops a run as before. An open list takes Esc first,
 * and that Esc never stops a run.
 */
export function skillPickerKeyAction(event: {
  key: string
  shiftKey?: boolean
  isComposing?: boolean
  open: boolean
}): SkillPickerKeyAction | null {
  if (!event.open || event.isComposing) return null
  switch (event.key) {
    case 'ArrowDown':
      return 'next'
    case 'ArrowUp':
      return 'prev'
    case 'Enter':
    case 'Tab':
      return event.shiftKey ? null : 'pick'
    case 'Escape':
      return 'close'
    default:
      return null
  }
}

// ---- what the list shows ----------------------------------------------

/** One row of the skill list */
export interface SkillPickerItem {
  /** `source:name`, `plugin:<plugin>:<name>` */
  id: string
  source: string
  plugin: string | undefined
  name: string
  /** display title (builtins in the UI language) */
  title: string
  description: string
  /** plain-text source label; empty for project skills */
  sourceLabel: string
  hasScripts: boolean
  /** names a template document that is there */
  template: boolean
  /** names a template document whose file is not there (spec 5.7: nothing is sent) */
  templateMissing?: boolean | undefined
}

/** Where a list is shown: the regular AI panels and home ask, or the agent window */
export type SkillPickerSurface = 'panel' | 'agent'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** The plain-text source label of a skill row */
export function skillSourceLabel(
  lang: Lang,
  skill: { source: string; plugin?: string | undefined; github?: unknown },
): string {
  switch (skill.source) {
    case 'builtin':
      return skillPickerText(lang, 'sourceBuiltin')
    case 'app':
      return skillPickerText(lang, skill.github ? 'sourceAppGitHub' : 'sourceApp')
    case 'user':
      return skillPickerText(lang, 'sourceUser')
    case 'plugin':
      return skillPickerText(lang, 'sourcePlugin', { plugin: skill.plugin ?? '' })
    case 'codex':
      return skillPickerText(lang, 'sourceCodex')
    default:
      return ''
  }
}

/** The name the app gives a skill whose title has no Latin letters or digits (`skill-<6 random>`) */
const MADE_UP_NAME = /^skill-[a-z0-9]{6}(?:-\d+)?$/

/**
 * What a list shows for a skill: its name, as coding agents show it. A skill
 * that only has a made-up name shows the title it was made with instead.
 */
export function skillDisplayName(skill: { name: string; title?: string | undefined }): string {
  const title = skill.title?.trim()
  return title && MADE_UP_NAME.test(skill.name) ? title : skill.name
}

/**
 * The rows of the list from the bridge's answer: enabled skills only (skills
 * used only when called are listed too), never hidden or unreadable ones;
 * the regular panels leave out agent-only skills. Rows show the skill's name;
 * builtins use their descriptions in the UI language.
 */
export function pickerSkillsOf(
  raw: unknown,
  lang: Lang,
  surface: SkillPickerSurface = 'panel',
): SkillPickerItem[] {
  if (!Array.isArray(raw)) return []
  const items: SkillPickerItem[] = []
  for (const view of raw) {
    if (!isRecord(view)) continue
    const id = str(view.id)
    const name = str(view.name)
    const source = str(view.source)
    if (!id.includes(':') || !name || !source) continue
    if (view.enabled !== true || view.hidden === true || view.unreadable) continue
    if (view.agentOnly === true && surface !== 'agent') continue
    if (RESERVED_USER_SKILL_NAMES.has(name.toLowerCase())) continue
    const plugin = typeof view.plugin === 'string' ? view.plugin : undefined
    const builtin = source === 'builtin' && isBuiltinSkillName(name)
    items.push({
      id,
      source,
      plugin,
      name,
      title: skillDisplayName({ name, title: builtin ? '' : str(view.title) }),
      description: builtin ? builtinSkillDesc(lang, name) : str(view.description),
      sourceLabel: skillSourceLabel(lang, { source, plugin, github: view.github }),
      hasScripts: view.hasScripts === true,
      template: !!view.template && view.templateExists === true,
      ...(view.template && view.templateExists !== true ? { templateMissing: true } : {}),
    })
  }
  return items
}

function fold(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase()
}

/**
 * The rows matching what was typed after `/` or `$`: any part of the title,
 * name or description ("/가정" finds "가정통신문"). Rows whose title or name
 * starts with it come first; the order is otherwise kept.
 */
export function filterPickerSkills<T extends { title: string; name: string; description: string }>(
  items: readonly T[],
  query: string,
): T[] {
  const q = fold(query.trim())
  if (!q) return [...items]
  const ranked: Array<{ item: T; rank: number; index: number }> = []
  items.forEach((item, index) => {
    const title = fold(item.title)
    const name = fold(item.name)
    let rank = -1
    if (title.startsWith(q) || name.startsWith(q)) rank = 0
    else if (title.includes(q) || name.includes(q)) rank = 1
    else if (fold(item.description).includes(q)) rank = 2
    if (rank >= 0) ranked.push({ item, rank, index })
  })
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index)
  return ranked.map((r) => r.item)
}

// ---- chips --------------------------------------------------------------

/** A chip as a sent message stores it */
export interface SkillChipRef {
  id: string
  source: string
  title: string
}

/** A chip on screen */
export interface SkillChipView extends SkillChipRef {
  sourceLabel?: string | undefined
  hasScripts?: boolean | undefined
  template?: boolean | undefined
  /** names a template whose file is not there */
  templateMissing?: boolean | undefined
  /** the skill is gone or off: shown as unavailable and never sent */
  missing?: boolean | undefined
}

/** Most chips one message keeps */
export const SKILL_CHIPS_MAX = 32
const CHIP_ID_MAX = 512
const CHIP_FIELD_MAX = 200

/** Stored chips read back: well-formed entries only, bounded */
export function skillChipRefsOf(raw: unknown): SkillChipRef[] {
  if (!Array.isArray(raw)) return []
  const out: SkillChipRef[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    if (out.length >= SKILL_CHIPS_MAX) break
    if (!isRecord(entry)) continue
    const id = str(entry.id)
    if (!id.includes(':') || id.length > CHIP_ID_MAX || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      source: str(entry.source).slice(0, CHIP_FIELD_MAX),
      title: (str(entry.title) || id).slice(0, CHIP_FIELD_MAX),
    })
  }
  return out
}

/** A chip for a row picked from the list */
export function skillChipOf(item: SkillPickerItem): SkillChipView {
  return {
    id: item.id,
    source: item.source,
    title: item.title,
    sourceLabel: item.sourceLabel,
    hasScripts: item.hasScripts,
    template: item.template,
    ...(item.templateMissing ? { templateMissing: true } : {}),
  }
}

/** The stored part of a chip */
export function skillChipRef(chip: SkillChipRef): SkillChipRef {
  return { id: chip.id, source: chip.source, title: chip.title }
}

/** Add a chip once (the same skill goes in only once) */
export function withSkillChip(
  chips: readonly SkillChipView[],
  chip: SkillChipView,
): SkillChipView[] {
  if (chips.some((c) => c.id === chip.id)) return [...chips]
  if (chips.length >= SKILL_CHIPS_MAX) return [...chips]
  return [...chips, chip]
}

/**
 * Chips after the list was read again: a chip whose skill was turned off or
 * removed leaves; the others follow the skill's current title and marks.
 */
export function chipsAfterListChange(
  chips: readonly SkillChipView[],
  items: readonly SkillPickerItem[],
): SkillChipView[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const out: SkillChipView[] = []
  for (const chip of chips) {
    const item = byId.get(chip.id)
    if (item) out.push({ ...skillChipOf(item), missing: false })
  }
  return out
}

/** Whether two chips on one row share a title (each then shows its source) */
export function chipTitleRepeats(chips: readonly SkillChipView[], chip: SkillChipView): boolean {
  return chips.some((c) => c.id !== chip.id && c.title === chip.title)
}
