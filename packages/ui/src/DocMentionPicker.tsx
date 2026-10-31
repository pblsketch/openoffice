import React, { useEffect } from 'react'
import type { Lang } from '@genoffice/i18n'
import { isDocMentionPickable } from './doc-mention-model'
import type { DocMentionGroup, DocMentionItem } from './doc-mention-types'
import { docMentionText, type DocMentionStringKey } from './strings-doc-mention'
import './doc-mention.css'

/** DOM id of a list row, for the input's aria-activedescendant */
export function docMentionOptionId(listId: string, index: number): string {
  return `${listId}-doc-${index}`
}

const GROUP_LABEL: Record<DocMentionGroup, DocMentionStringKey> = {
  pane: 'groupPane',
  open: 'groupOpen',
  project: 'groupProject',
  recent: 'groupRecent',
}

/** Consecutive rows of one group, each run under its label */
function runsOf(
  items: readonly DocMentionItem[],
): Array<{ group: DocMentionGroup; rows: Array<{ item: DocMentionItem; index: number }> }> {
  const runs: Array<{
    group: DocMentionGroup
    rows: Array<{ item: DocMentionItem; index: number }>
  }> = []
  items.forEach((item, index) => {
    const last = runs[runs.length - 1]
    if (last && last.group === item.group) last.rows.push({ item, index })
    else runs.push({ group: item.group, rows: [{ item, index }] })
  })
  return runs
}

/**
 * The `@` document list above the AI input: matching documents under their
 * group labels (file name, folder, and why a greyed row cannot be picked) and
 * "Find more…" at the bottom. Rows are picked with the mouse; the input
 * drives the keys. A greyed row is never picked or highlighted.
 */
export function DocMentionPicker({
  lang,
  listId,
  items,
  active,
  onPick,
  onHover,
}: {
  lang: Lang
  listId: string
  items: readonly DocMentionItem[]
  /** highlighted row; `items.length` is the "Find more…" row */
  active: number
  /** a pickable row index; `items.length` is the "Find more…" row */
  onPick: (index: number) => void
  onHover: (index: number) => void
}): React.JSX.Element {
  const moreIndex = items.length
  // keep the highlighted row in view as ↑/↓ move past the visible rows
  useEffect(() => {
    document
      .getElementById(docMentionOptionId(listId, active))
      ?.scrollIntoView?.({ block: 'nearest' })
  }, [listId, active])
  return (
    <div
      className="ai-doc-mention-picker"
      role="listbox"
      id={listId}
      aria-label={docMentionText(lang, 'listLabel')}
      // keep the caret in the input while a row is clicked
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="ai-doc-mention-rows">
        {runsOf(items).map((run) => {
          const label = docMentionText(lang, GROUP_LABEL[run.group])
          return (
            <div
              key={`${run.group}-${run.rows[0]?.index ?? 0}`}
              role="group"
              aria-label={label}
              className="ai-doc-mention-group"
            >
              <div className="ai-doc-mention-group-label" aria-hidden="true">
                {label}
              </div>
              {run.rows.map(({ item, index }) => {
                const pickable = isDocMentionPickable(item)
                const reason =
                  item.state === 'modified'
                    ? docMentionText(lang, 'reasonModified')
                    : item.state === 'unsaved'
                      ? docMentionText(lang, 'reasonUnsaved')
                      : ''
                return (
                  <div
                    key={`${item.path ?? item.name}-${index}`}
                    id={docMentionOptionId(listId, index)}
                    role="option"
                    aria-selected={index === active}
                    aria-disabled={pickable ? undefined : true}
                    className={`ai-doc-mention-row${index === active ? ' is-active' : ''}${
                      pickable ? '' : ' is-disabled'
                    }`}
                    title={item.path ?? item.name}
                    onMouseEnter={() => {
                      if (pickable) onHover(index)
                    }}
                    onClick={() => {
                      if (pickable) onPick(index)
                    }}
                  >
                    <span className="ai-doc-mention-name" dir="auto">
                      {item.name}
                    </span>
                    {item.dir && (
                      <span className="ai-doc-mention-dir" dir="auto">
                        {item.dir}
                      </span>
                    )}
                    {reason && <span className="ai-doc-mention-reason">{reason}</span>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <div
        id={docMentionOptionId(listId, moreIndex)}
        role="option"
        aria-selected={active === moreIndex}
        className={`ai-doc-mention-row ai-doc-mention-more${
          active === moreIndex ? ' is-active' : ''
        }`}
        onMouseEnter={() => onHover(moreIndex)}
        onClick={() => onPick(moreIndex)}
      >
        {docMentionText(lang, 'more')}
      </div>
    </div>
  )
}
