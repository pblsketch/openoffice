/**
 * Selection pane (right side, PowerPoint Home ▸ Arrange ▸ Selection Pane / Alt+F10): every
 * element of the current slide listed front to back, hidden ones included. Clicking a row
 * selects the element (Ctrl/Shift-click adds to the selection; a group member enters its
 * group); the two buttons move the selection one step forward or backward in the stacking
 * order. Top-level rows carry an eye (hide/show) and rename on double-click.
 * Names come from the file (cNvPr name); unnamed members of a group show their kind.
 */
import React, { useEffect, useState } from 'react'
import type { ShapeKey } from '../../shared/ipc'
import type {
  GroupRenderNode,
  RenderNode,
  RenderSlide,
  ShapeRenderNode,
} from '@genoffice/pptx-render'
import { useI18n, type StringKey } from '../i18n/locale'
import { IconEye, IconEyeOff, IconSidebarCollapse } from './icons'

interface Props {
  slideIndex: number
  slide: RenderSlide | undefined
  selectedIds: string[]
  enteredGroupId: string | null
  onSelect: (id: string, groupId: string | null, additive: boolean) => void
  onMove: (dir: 'forward' | 'backward') => void
  /** Eye: hide/show a top-level element */
  onSetHidden: (id: string, hidden: boolean) => void
  /** Rename a top-level element */
  onRename: (id: string, name: string) => void
  onCollapse: () => void
}

function kindKey(node: RenderNode): StringKey {
  if (node.type === 'group') return 'paneSelKindGroup'
  if (node.type === 'picture') {
    return node.media === 'video'
      ? 'paneSelKindVideo'
      : node.media === 'audio'
        ? 'paneSelKindAudio'
        : 'paneSelKindPicture'
  }
  if (node.type === 'table') return 'paneSelKindTable'
  if (node.type === 'chart') return 'paneSelKindChart'
  if ((node.type === 'shape' || node.type === 'text') && (node as ShapeRenderNode).line)
    return 'paneSelKindLine'
  if (node.type === 'text' || (node as ShapeRenderNode).txBox) return 'paneSelKindTextBox'
  return 'paneSelKindShape'
}

/** First words of a text-bearing node (helps tell unnamed members apart) */
function textSnippet(node: RenderNode): string {
  if (node.type !== 'shape' && node.type !== 'text') return ''
  const text = (node as ShapeRenderNode).text?.lines
    .flatMap((l) => l.runs)
    .filter((r) => !r.isBullet)
    .map((r) => r.text)
    .join('')
    .trim()
  return text ? (text.length > 24 ? `${text.slice(0, 24)}…` : text) : ''
}

const listable = (n: RenderNode) => !n.decoration && n.type !== 'placeholder-chip'

export function SelectionPane({
  slideIndex,
  slide,
  selectedIds,
  enteredGroupId,
  onSelect,
  onMove,
  onSetHidden,
  onRename,
  onCollapse,
}: Props) {
  const { t } = useI18n()
  const [keys, setKeys] = useState<ShapeKey[]>([])
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)

  // Element names and hidden flags live in the deck; re-read them whenever the slide re-renders
  useEffect(() => {
    let alive = true
    void window.slidesApi.getShapeKeys(slideIndex).then((k) => {
      if (alive) setKeys(k)
    })
    return () => {
      alive = false
    }
  }, [slideIndex, slide])

  const names = new Map(keys.map((k) => [k.sourceId, k.name]))
  const nodeById = new Map((slide?.nodes ?? []).map((n) => [n.sourceId, n]))
  const selected = new Set(selectedIds)
  const canMove = selectedIds.length > 0 && !enteredGroupId

  const commitRename = () => {
    if (!renaming) return
    const value = renaming.value.trim()
    if (value && value !== names.get(renaming.id)) onRename(renaming.id, value)
    setRenaming(null)
  }

  const row = (
    id: string,
    node: RenderNode | undefined,
    groupId: string | null,
    depth: number,
    hidden = false,
  ) => {
    const kind = node ? t(kindKey(node)) : ''
    const name = names.get(id) || (node ? textSnippet(node) : '')
    const topLevel = groupId == null
    const label = name || kind || t('paneSelKindShape')
    return (
      <div
        key={`${groupId ?? ''}/${id}`}
        className={`sel-row${selected.has(id) ? ' selected' : ''}${hidden ? ' hidden' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={(e) => {
          if (!hidden) onSelect(id, groupId, e.ctrlKey || e.metaKey || e.shiftKey)
        }}
        onDoubleClick={() => {
          if (topLevel) setRenaming({ id, value: names.get(id) ?? '' })
        }}
      >
        {renaming?.id === id ? (
          <input
            className="sel-row-input"
            autoFocus
            value={renaming.value}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenaming({ id, value: e.target.value })}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') setRenaming(null)
            }}
          />
        ) : (
          <>
            {name && kind && <span className="sel-row-kind">{kind}</span>}
            <span className="sel-row-name" data-tip={topLevel ? t('paneSelRenameTip') : undefined}>
              {label}
            </span>
          </>
        )}
        {topLevel && (
          <button
            className="sel-row-eye"
            data-tip={hidden ? t('paneSelShow') : t('paneSelHide')}
            aria-label={hidden ? t('paneSelShow') : t('paneSelHide')}
            onClick={(e) => {
              e.stopPropagation()
              onSetHidden(id, !hidden)
            }}
          >
            {hidden ? <IconEyeOff size={14} /> : <IconEye size={14} />}
          </button>
        )}
      </div>
    )
  }

  const rows: React.ReactNode[] = []
  // spTree order is back to front; the pane lists the front-most first (PowerPoint)
  for (const key of [...keys].reverse()) {
    if (key.hidden) {
      rows.push(row(key.sourceId, undefined, null, 0, true))
      continue
    }
    const node = nodeById.get(key.sourceId)
    if (!node || !listable(node)) continue
    rows.push(row(key.sourceId, node, null, 0))
    if (node.type === 'group') {
      for (const child of [...(node as GroupRenderNode).children].reverse()) {
        if (listable(child)) rows.push(row(child.sourceId, child, node.sourceId, 1))
      }
    }
  }

  return (
    <aside className="comments-pane sel-pane">
      <div className="ai-panel-header">
        <span className="ai-panel-title">{t('paneSelTitle')}</span>
        <div className="ai-panel-header-actions">
          <button
            className="ai-header-btn"
            disabled={!canMove}
            onClick={() => onMove('forward')}
            data-tip={t('appCtxBringForward')}
            aria-label={t('appCtxBringForward')}
          >
            ▲
          </button>
          <button
            className="ai-header-btn"
            disabled={!canMove}
            onClick={() => onMove('backward')}
            data-tip={t('appCtxSendBackward')}
            aria-label={t('appCtxSendBackward')}
          >
            ▼
          </button>
          <button
            className="ai-header-btn"
            onClick={onCollapse}
            data-tip={t('paneSelCollapse')}
            aria-label={t('paneSelCollapse')}
          >
            <IconSidebarCollapse size={15} />
          </button>
        </div>
      </div>
      <div className="comments-list">
        {rows.length === 0 ? (
          <div className="comments-empty">
            <p>{t('paneSelEmpty')}</p>
          </div>
        ) : (
          rows
        )}
      </div>
    </aside>
  )
}
