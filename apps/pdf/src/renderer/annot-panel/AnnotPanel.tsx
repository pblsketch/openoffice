/**
 * The annotation panel (reading-assist spec 4.3): the sidebar list of saved
 * and unsaved annotations and passage cards, its filters and sorting, and the
 * header menu that copies the filtered list as Markdown or opens it as a new
 * Markdown or Word document through `createDocument` (no AI).
 *
 * Presentational: the items come built (items.ts); a click hands the item to
 * `onActivate`. Later features add filter dimensions (`facets`), per-item
 * buttons (`renderItemActions`) and a bar over the list (`toolbar`).
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useDismissablePopover } from '@genoffice/ui'
import type { TFunc } from '../i18n/locale'
import {
  EMPTY_FILTER,
  colorOptions,
  facetOptions,
  filterAnnotItems,
  kindOptions,
  sortAnnotItems,
  type AnnotFacet,
  type AnnotFilter,
  type AnnotSort,
} from './filter'
import { annotMarkdown, openAnnotDocument, type CreateDocument } from './export'
import type { AnnotItem, Rgb } from './items'

export interface AnnotPanelProps {
  /** built items, in any order */
  items: readonly AnnotItem[]
  /** the saved annotations are still being read */
  loading: boolean
  /** the document title, for the export's first line */
  title: string
  t: TFunc
  /** sidebar width in px (drag-resizable like the other sidebar views) */
  width?: number
  onActivate: (item: AnnotItem) => void
  onClose: () => void
  onNotice: (message: string) => void
  /** absent where the channel is missing: the two document items show why */
  createDocument?: CreateDocument
  /**
   * a Word document can be made (only inside the shell): false disables the
   * Word item with the reason, null while it is still being checked (disabled,
   * no reason yet); absent = available
   */
  docxAvailable?: boolean | null
  /** defaults to the clipboard */
  copyText?: (text: string) => Promise<void>
  /** extra filter dimensions (e.g. the category of accepted AI highlights) */
  facets?: readonly AnnotFacet[]
  /** extra buttons under an item (e.g. "Add to note") */
  renderItemActions?: (item: AnnotItem) => ReactNode
  /** a feature's bar between the filters and the list (e.g. AI highlight suggestions by label) */
  toolbar?: ReactNode
}

const MARKUP_KINDS = new Set(['highlight', 'underline', 'squiggly', 'strikeout'])

/** an annotation color is document data: shown as it is, not through the theme */
const swatchColor = (c: Rgb): string =>
  `rgb(${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(', ')})`

const pageNumber = (value: string): number | null => {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

const clipboardWrite = (text: string): Promise<void> => navigator.clipboard.writeText(text)

export function AnnotPanel(props: AnnotPanelProps) {
  const { items, t, facets = [] } = props
  const [filter, setFilter] = useState<AnnotFilter>(EMPTY_FILTER)
  const [sort, setSort] = useState<AnnotSort>('page')
  const [pageFrom, setPageFrom] = useState('')
  const [pageTo, setPageTo] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuWrapRef = useRef<HTMLDivElement | null>(null)
  useDismissablePopover(menuOpen, () => setMenuOpen(false), {
    inside: () => [menuWrapRef.current],
  })

  const shown = useMemo(
    () => sortAnnotItems(filterAnnotItems(items, filter, facets), sort),
    [items, filter, facets, sort],
  )
  // cheap; computed per render because `t` must not sit in a hook's dependencies
  const kinds = kindOptions(items, t)
  const colors = useMemo(() => colorOptions(items), [items])
  const filtering =
    filter.kind !== null ||
    filter.color !== null ||
    filter.pageFrom !== null ||
    filter.pageTo !== null ||
    filter.query !== '' ||
    Object.values(filter.facets).some(Boolean)

  const update = (patch: Partial<AnnotFilter>) => setFilter((f) => ({ ...f, ...patch }))

  const copyMarkdown = async () => {
    setMenuOpen(false)
    try {
      await (props.copyText ?? clipboardWrite)(
        annotMarkdown({ title: props.title, items: shown, t }),
      )
      props.onNotice(t('apCopied'))
    } catch {
      props.onNotice(t('apCopyFailed'))
    }
  }

  const openDocument = async (type: 'md' | 'docx') => {
    setMenuOpen(false)
    const createDocument = props.createDocument
    if (!createDocument || reasonFor(type) !== null) return
    const result = await openAnnotDocument(type, {
      title: props.title,
      items: shown,
      t,
      createDocument,
    })
    if (!result.ok) props.onNotice(t('apCreateFailed', { reason: result.error ?? '' }))
  }

  const unavailable = props.createDocument ? null : t('apCreateUnavailable')
  const docx = props.docxAvailable === undefined ? true : props.docxAvailable
  /** why an item is unavailable (shown under it), '' while still checking, null when available */
  const reasonFor = (type: 'md' | 'docx'): string | null => {
    if (unavailable) return unavailable
    if (type === 'docx' && docx !== true) return docx === false ? t('apDocxUnavailable') : ''
    return null
  }

  return (
    <div className="pdf-thumbs pdf-annot-pane" style={{ width: props.width }}>
      <div className="pdf-outline-header pdf-annot-header">
        <span>
          {t('apPanel')}{' '}
          <span className="pdf-annot-count">{t('apCount', { count: shown.length })}</span>
        </span>
        <span className="pdf-annot-header-actions">
          <div ref={menuWrapRef} className="pdf-annot-menu-wrap">
            <button
              type="button"
              className="rb-icon"
              aria-label={t('apMenu')}
              data-tip={t('apMenu')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
            {menuOpen && (
              <div className="pdf-annot-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={shown.length === 0}
                  onClick={() => void copyMarkdown()}
                >
                  {t('apCopyMd')}
                </button>
                {(['md', 'docx'] as const).map((type) => {
                  const reason = reasonFor(type)
                  return (
                    <button
                      key={type}
                      type="button"
                      role="menuitem"
                      disabled={reason !== null || shown.length === 0}
                      title={reason || undefined}
                      onClick={() => void openDocument(type)}
                    >
                      <span>{type === 'md' ? t('apOpenMd') : t('apOpenDocx')}</span>
                      {reason && <span className="pdf-annot-menu-reason">{reason}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            className="rb-icon"
            aria-label={t('aiCollapsePanel')}
            data-tip={t('aiCollapsePanel')}
            onClick={props.onClose}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m14 6-6 6 6 6" />
            </svg>
          </button>
        </span>
      </div>

      <div className="pdf-annot-filters">
        <input
          type="search"
          className="pdf-annot-search"
          placeholder={t('apSearch')}
          aria-label={t('apSearch')}
          value={filter.query}
          onChange={(e) => update({ query: e.target.value })}
        />
        <div className="pdf-annot-filter-row">
          <select
            name="kind"
            aria-label={t('apFilterKind')}
            value={filter.kind ?? ''}
            onChange={(e) => update({ kind: e.target.value || null })}
          >
            <option value="">{t('apKindAll')}</option>
            {kinds.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
          <select
            name="sort"
            aria-label={t('apSortLabel')}
            value={sort}
            onChange={(e) => setSort(e.target.value === 'created' ? 'created' : 'page')}
          >
            <option value="page">{t('apSortPage')}</option>
            <option value="created">{t('apSortCreated')}</option>
          </select>
        </div>
        {facets.map((facet) => {
          const values = facetOptions(items, facet)
          if (values.length === 0) return null
          return (
            <div className="pdf-annot-filter-row" key={facet.id}>
              <select
                name={`facet-${facet.id}`}
                aria-label={facet.label}
                value={filter.facets[facet.id] ?? ''}
                onChange={(e) =>
                  update({ facets: { ...filter.facets, [facet.id]: e.target.value } })
                }
              >
                <option value="">
                  {facet.label}: {t('apFacetAll')}
                </option>
                {values.map((v) => (
                  <option key={v} value={v}>
                    {facet.valueLabel?.(v) ?? v}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
        <div className="pdf-annot-filter-row">
          <input
            type="number"
            name="pageFrom"
            min={1}
            inputMode="numeric"
            placeholder={t('apPageFrom')}
            aria-label={t('apPageFrom')}
            value={pageFrom}
            onChange={(e) => {
              setPageFrom(e.target.value)
              update({ pageFrom: pageNumber(e.target.value) })
            }}
          />
          <span aria-hidden="true">–</span>
          <input
            type="number"
            name="pageTo"
            min={1}
            inputMode="numeric"
            placeholder={t('apPageTo')}
            aria-label={t('apPageTo')}
            value={pageTo}
            onChange={(e) => {
              setPageTo(e.target.value)
              update({ pageTo: pageNumber(e.target.value) })
            }}
          />
        </div>
        {colors.length > 0 && (
          <div className="pdf-annot-colors" role="group" aria-label={t('apFilterColor')}>
            <button
              type="button"
              className="pdf-annot-color-all"
              aria-pressed={filter.color === null}
              onClick={() => update({ color: null })}
            >
              {t('apColorAll')}
            </button>
            {colors.map((c) => (
              <button
                key={c.hex}
                type="button"
                className="pdf-annot-color"
                data-color={c.hex}
                aria-pressed={filter.color === c.hex}
                aria-label={t('apColorPick', { color: c.hex })}
                data-tip={t('apColorPick', { color: c.hex })}
                onClick={() => update({ color: filter.color === c.hex ? null : c.hex })}
              >
                <span className="pdf-annot-swatch" style={{ background: swatchColor(c.color) }} />
              </button>
            ))}
          </div>
        )}
        {filtering && (
          <button
            type="button"
            className="pdf-annot-clear"
            onClick={() => {
              setFilter(EMPTY_FILTER)
              setPageFrom('')
              setPageTo('')
            }}
          >
            {t('apClearFilters')}
          </button>
        )}
      </div>

      {props.toolbar}
      <div className="pdf-annot-list" role="list">
        {items.length === 0 && (
          <div className="pdf-annot-empty">{props.loading ? t('apLoading') : t('apEmpty')}</div>
        )}
        {items.length > 0 && shown.length === 0 && (
          <div className="pdf-annot-empty">{t('apNoMatch')}</div>
        )}
        {shown.map((item) => {
          const actions = props.renderItemActions?.(item)
          return (
            <div
              key={item.key}
              role="listitem"
              className={`pdf-annot-item${item.notFound ? ' pdf-annot-lost' : ''}`}
              data-key={item.key}
            >
              <button
                type="button"
                className="pdf-annot-item-main"
                onClick={() => props.onActivate(item)}
              >
                <span className="pdf-annot-item-head">
                  <span
                    className={`pdf-annot-swatch${item.color ? '' : ' pdf-annot-swatch-none'}`}
                    style={item.color ? { background: swatchColor(item.color) } : undefined}
                  />
                  <span className="pdf-annot-kind">
                    {item.kindLabel}
                    {item.category ? ` · ${item.category}` : ''}
                  </span>
                  <span className="pdf-annot-page">
                    {item.notFound
                      ? t('apNotFound')
                      : item.pageNo !== null
                        ? `p.${item.pageNo}`
                        : ''}
                  </span>
                </span>
                {item.text ? (
                  <span className="pdf-annot-text">{item.text}</span>
                ) : (
                  MARKUP_KINDS.has(item.kind) && (
                    <span className="pdf-annot-text pdf-annot-muted">{t('apNoText')}</span>
                  )
                )}
                {item.detail && <span className="pdf-annot-detail">{item.detail}</span>}
                {((item.replies ?? 0) > 0 || item.origin === 'unsaved') && (
                  <span className="pdf-annot-meta">
                    {(item.replies ?? 0) > 0 && (
                      <span>
                        {item.replies === 1
                          ? t('apReplyOne')
                          : t('apReplies', { count: item.replies ?? 0 })}
                      </span>
                    )}
                    {item.origin === 'unsaved' && (
                      <span className="pdf-annot-unsaved" title={t('apUnsavedTip')}>
                        {t('apUnsaved')}
                      </span>
                    )}
                  </span>
                )}
              </button>
              {actions ? <div className="pdf-annot-item-actions">{actions}</div> : null}
            </div>
          )
        })}
        {props.loading && items.length > 0 && (
          <div className="pdf-annot-empty">{t('apLoading')}</div>
        )}
      </div>
    </div>
  )
}
