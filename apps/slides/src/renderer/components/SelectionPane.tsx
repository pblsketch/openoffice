/**
 * Selection pane (right side, PowerPoint Home ▸ Arrange ▸ Selection Pane / Alt+F10): every
 * element of the current slide listed front to back. Clicking a row selects the element
 * (Ctrl/Shift-click adds to the selection; a group member enters its group); the two
 * buttons move the selection one step forward or backward in the stacking order.
 * Names come from the file (cNvPr name); unnamed members of a group show their kind.
 */
import React, { useEffect, useState } from 'react'
import type {
  GroupRenderNode,
  RenderNode,
  RenderSlide,
  ShapeRenderNode,
} from '@genoffice/pptx-render'
import { useI18n, type StringKey } from '../i18n/locale'
import { IconSidebarCollapse } from './icons'

interface Props {
  slideIndex: number
  slide: RenderSlide | undefined
  selectedIds: string[]
  enteredGroupId: string | null
  onSelect: (id: string, groupId: string | null, additive: boolean) => void
  onMove: (dir: 'forward' | 'backward') => void
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
  onCollapse,
}: Props) {
  const { t } = useI18n()
  const [names, setNames] = useState<Map<string, string>>(new Map())

  // Element names live in the deck; re-read them whenever the slide is re-rendered
  useEffect(() => {
    let alive = true
    void window.slidesApi.getShapeKeys(slideIndex).then((keys) => {
      if (alive) setNames(new Map(keys.map((k) => [k.sourceId, k.name])))
    })
    return () => {
      alive = false
    }
  }, [slideIndex, slide])

  const nodes = (slide?.nodes ?? []).filter(listable)
  const selected = new Set(selectedIds)
  const canMove = selectedIds.length > 0 && !enteredGroupId

  const row = (node: RenderNode, groupId: string | null, depth: number) => {
    const kind = t(kindKey(node))
    const name = names.get(node.sourceId) || textSnippet(node)
    return (
      <div
        key={`${groupId ?? ''}/${node.sourceId}`}
        className={`sel-row${selected.has(node.sourceId) ? ' selected' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={(e) => onSelect(node.sourceId, groupId, e.ctrlKey || e.metaKey || e.shiftKey)}
      >
        {name && <span className="sel-row-kind">{kind}</span>}
        <span className="sel-row-name">{name || kind}</span>
      </div>
    )
  }

  const rows: React.ReactNode[] = []
  // spTree order is back to front; the pane lists the front-most first (PowerPoint)
  for (const node of [...nodes].reverse()) {
    rows.push(row(node, null, 0))
    if (node.type === 'group') {
      for (const child of [...(node as GroupRenderNode).children].reverse()) {
        if (listable(child)) rows.push(row(child, node.sourceId, 1))
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
