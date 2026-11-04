import React from 'react'
import type { Lang } from '@genoffice/i18n'
import { unusableMcpServers } from '@genoffice/agent-core/skill-mcp-refs'
import {
  chipTitleRepeats,
  type SkillChipRef,
  type SkillChipView,
  type SkillPickerItem,
} from './skill-picker-model'
import { skillPickerText } from './strings-skill-picker'
import './skill-picker.css'

/** First characters of a description shown on a list row */
const DESCRIPTION_PREVIEW_CHARS = 90

function preview(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > DESCRIPTION_PREVIEW_CHARS
    ? `${line.slice(0, DESCRIPTION_PREVIEW_CHARS)}…`
    : line
}

/** DOM id of a list row, for the input's aria-activedescendant */
export function skillPickerOptionId(listId: string, index: number): string {
  return `${listId}-opt-${index}`
}

/**
 * The skill list above the AI input: one row per matching skill (title,
 * source, start of the description, a template mark) and "Manage skills…"
 * at the bottom. Rows are picked with the mouse; the input drives the keys.
 */
export function SkillPicker({
  lang,
  listId,
  items,
  active,
  onPick,
  onHover,
}: {
  lang: Lang
  listId: string
  items: readonly SkillPickerItem[]
  /** highlighted row; `items.length` is the manage row */
  active: number
  /** a row index; `items.length` is the manage row */
  onPick: (index: number) => void
  onHover: (index: number) => void
}): React.JSX.Element {
  const manageIndex = items.length
  return (
    <div
      className="ai-skill-picker"
      role="listbox"
      id={listId}
      aria-label={skillPickerText(lang, 'listLabel')}
      // keep the caret in the input while a row is clicked
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="ai-skill-picker-rows">
        {items.map((item, index) => (
          <div
            key={item.id}
            id={skillPickerOptionId(listId, index)}
            role="option"
            aria-selected={index === active}
            className={`ai-skill-picker-row${index === active ? ' is-active' : ''}`}
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(index)}
          >
            <div className="ai-skill-picker-head">
              <span className="ai-skill-picker-title" dir="auto">
                {item.title}
              </span>
              {item.sourceLabel && (
                <span className="ai-skill-picker-source">{item.sourceLabel}</span>
              )}
              {item.template && (
                <span className="ai-skill-picker-badge">{skillPickerText(lang, 'template')}</span>
              )}
            </div>
            {item.description && (
              <div className="ai-skill-picker-desc" dir="auto">
                {preview(item.description)}
              </div>
            )}
          </div>
        ))}
      </div>
      <div
        id={skillPickerOptionId(listId, manageIndex)}
        role="option"
        aria-selected={active === manageIndex}
        className={`ai-skill-picker-row ai-skill-picker-manage${
          active === manageIndex ? ' is-active' : ''
        }`}
        onMouseEnter={() => onHover(manageIndex)}
        onClick={() => onPick(manageIndex)}
      >
        {skillPickerText(lang, 'manage')}
      </div>
    </div>
  )
}

function RemoveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M24 9.4L22.6 8L16 14.6L9.4 8L8 9.4l6.6 6.6L8 22.6L9.4 24l6.6-6.6l6.6 6.6l1.4-1.4l-6.6-6.6L24 9.4z"
        fill="currentColor"
      />
    </svg>
  )
}

/** One skill chip: its title, the source when another chip shares the title, and × */
export function SkillChip({
  lang,
  chip,
  showSource = false,
  onRemove,
}: {
  lang: Lang
  chip: SkillChipView
  showSource?: boolean
  /** absent on a sent message (read-only) */
  onRemove?: (() => void) | undefined
}): React.JSX.Element {
  const tip = chip.sourceLabel ? `${chip.title} · ${chip.sourceLabel}` : chip.title
  return (
    <span
      className={`ai-skill-chip${chip.missing ? ' is-missing' : ''}`}
      data-skill-id={chip.id}
      title={tip}
    >
      <span className="ai-skill-chip-mark" aria-hidden="true">
        /
      </span>
      <span className="ai-skill-chip-title" dir="auto">
        {chip.title}
      </span>
      {showSource && chip.sourceLabel && (
        <span className="ai-skill-chip-source">{chip.sourceLabel}</span>
      )}
      {chip.missing && (
        <span className="ai-skill-chip-missing">{skillPickerText(lang, 'missing')}</span>
      )}
      {onRemove && (
        <button
          type="button"
          className="ai-skill-chip-remove"
          onClick={onRemove}
          aria-label={skillPickerText(lang, 'removeChip', { title: chip.title })}
        >
          <RemoveIcon />
        </button>
      )}
    </span>
  )
}

const NO_MCP_SERVERS: ReadonlySet<string> = new Set()

/**
 * The composer's chip row (where attachments sit): the chips, a line when a
 * chip's skill has scripts (they do not run here; sending is not blocked), a
 * line naming the MCP servers the chips' skills expect that are not
 * registered and on (spec 8), and the latest refusal (too large, skill gone).
 */
export function SkillChipRow({
  lang,
  chips,
  notice,
  usableMcpServers = NO_MCP_SERVERS,
  onRemove,
}: {
  lang: Lang
  chips: readonly SkillChipView[]
  notice?: string | null | undefined
  /** MCP servers registered and on; none by default */
  usableMcpServers?: ReadonlySet<string> | undefined
  onRemove: (id: string) => void
}): React.JSX.Element | null {
  if (chips.length === 0 && !notice) return null
  const live = chips.filter((c) => !c.missing)
  const scripts = live.some((c) => c.hasScripts)
  const servers = unusableMcpServers(
    [...new Set(live.flatMap((c) => c.mcpServers ?? []))],
    (name) => usableMcpServers.has(name),
  )
  return (
    <div className="ai-skill-chips">
      {chips.length > 0 && (
        <div className="ai-skill-chip-list">
          {chips.map((chip) => (
            <SkillChip
              key={chip.id}
              lang={lang}
              chip={chip}
              showSource={chipTitleRepeats(chips, chip)}
              onRemove={() => onRemove(chip.id)}
            />
          ))}
        </div>
      )}
      {scripts && (
        <div className="ai-skill-chip-note">{skillPickerText(lang, 'scriptsNotice')}</div>
      )}
      {servers.length > 0 && (
        <div className="ai-skill-chip-note" dir="auto">
          {skillPickerText(lang, 'mcpServerNeeded', { servers: servers.join(', ') })}
        </div>
      )}
      {notice && (
        <div className="ai-skill-chip-note is-error" role="alert">
          {notice}
        </div>
      )}
    </div>
  )
}

/**
 * The chips kept on a sent message. `isAvailable` tells which skills are on
 * now; a chip whose skill is gone or off shows "unavailable".
 */
export function SentSkillChips({
  lang,
  chips,
  isAvailable,
}: {
  lang: Lang
  chips: readonly SkillChipRef[] | undefined
  isAvailable?: ((id: string) => boolean) | undefined
}): React.JSX.Element | null {
  if (!chips || chips.length === 0) return null
  return (
    <div className="ai-skill-chip-list ai-msg-skill-chips">
      {chips.map((chip) => (
        <SkillChip
          key={chip.id}
          lang={lang}
          chip={{ ...chip, missing: isAvailable ? !isAvailable(chip.id) : false }}
        />
      ))}
    </div>
  )
}
