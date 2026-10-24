/**
 * AI highlight suggestions in the annotation panel (reading-assist spec 4.3,
 * 4.6): "AI highlight suggestion" items (pending ones, only while the
 * preview is on) with Accept / Dismiss, a bar that groups them by label with
 * "accept all" per label and "dismiss all", the category facet that also
 * filters accepted highlights by their /Subj, and the "waiting for save" mark
 * of an accepted one. A suggestion with no place says so and cannot be
 * accepted.
 */
import type { ReactElement, ReactNode } from 'react'
import type { HighlightRun } from '../../../../../packages/pdf-structure/src/store/reading'
import type { AnnotItem, AnnotItemDraft } from '../annot-panel/items'
import type { AnnotFacet } from '../annot-panel/filter'
import type { TFunc } from '../i18n/locale'
import { unionRect, type SuggestionView } from './locate'
import { cssColor } from './presets'

/** the panel kind of a suggestion */
export const SUGGESTION_KIND = 'suggestion'

const ITEM_PREFIX = 'H'

/** the panel items of the pending suggestions */
export function suggestionDrafts(
  pending: readonly SuggestionView[],
  run: HighlightRun | null,
  t: TFunc,
  goToPage: (origIdx: number) => void,
): AnnotItemDraft[] {
  return pending.map((v) => {
    const page = v.found?.origIdx ?? v.page
    return {
      key: `${ITEM_PREFIX}${v.key}`,
      kind: SUGGESTION_KIND,
      kindLabel: t('hlKindSuggestion'),
      origin: 'store',
      page,
      rect: v.found ? unionRect(v.found.rects) : null,
      color: [...v.label.color],
      text: v.quote,
      category: v.label.name,
      createdMs: run?.createdAt ?? null,
      notFound: !v.found,
      // the panel goes to the place first; without one, the block's page
      target: {
        type: 'custom',
        activate: () => {
          if (!v.found && page !== null) goToPage(page)
        },
      },
    }
  })
}

/** the suggestion key of a panel item, or null when the item is not a suggestion */
export function suggestionKeyOf(item: AnnotItem): string | null {
  return item.kind === SUGGESTION_KIND && item.key.startsWith(ITEM_PREFIX)
    ? item.key.slice(ITEM_PREFIX.length)
    : null
}

/** "Category": accepted highlights by their /Subj and suggestions by their label */
export function categoryFacet(t: TFunc): AnnotFacet {
  return {
    id: 'category',
    label: t('hlFacetCategory'),
    valueOf: (item) => item.category ?? null,
  }
}

/** the buttons under a suggestion, or the "waiting for save" mark of an accepted one */
export function highlightItemActions(
  item: AnnotItem,
  o: {
    t: TFunc
    readOnly: boolean
    viewOf: (key: string) => SuggestionView | undefined
    onAccept: (view: SuggestionView) => void
    onDismiss: (view: SuggestionView) => void
    /** an unsaved highlight that an accepted suggestion became, waiting for a save */
    waitingSave: (markupId: string) => boolean
  },
): ReactNode {
  const { t } = o
  const key = suggestionKeyOf(item)
  if (key === null) {
    if (item.origin === 'unsaved' && item.key.startsWith('L') && o.waitingSave(item.key.slice(1))) {
      return (
        <span className="pdf-hl-waiting" title={t('hlWaitingSaveTip')} data-waiting-save>
          {t('hlWaitingSave')}
        </span>
      )
    }
    return null
  }
  const view = o.viewOf(key)
  if (!view) return null
  const reason = o.readOnly ? t('hlReadOnly') : !view.found ? t('hlNotFoundTip') : null
  return (
    <>
      <button
        type="button"
        className="pdf-modal-btn"
        data-action="hl-accept"
        disabled={reason !== null}
        title={reason ?? undefined}
        onClick={() => o.onAccept(view)}
      >
        {t('hlAccept')}
      </button>
      <button
        type="button"
        className="pdf-modal-btn"
        data-action="hl-dismiss"
        onClick={() => o.onDismiss(view)}
      >
        {t('hlDismiss')}
      </button>
    </>
  )
}

/** the bar over the list: suggestions per label, accept all of a label, dismiss all */
export function HighlightPanelBar({
  pending,
  run,
  t,
  readOnly,
  onAcceptLabel,
  onAcceptAllSave,
  onDismissAll,
}: {
  pending: readonly SuggestionView[]
  run: HighlightRun | null
  t: TFunc
  readOnly: boolean
  onAcceptLabel: (labelId: string) => void
  /** accept every suggestion with a place, then save the PDF */
  onAcceptAllSave: () => void
  onDismissAll: () => void
}): ReactElement | null {
  if (!run || pending.length === 0) return null
  const acceptable = pending.filter((v) => v.found).length
  return (
    <div className="pdf-hl-bar" role="group" aria-label={t('hlKindSuggestion')}>
      <div className="pdf-hl-bar-head">
        <span>{t('hlSuggestionCount', { count: pending.length })}</span>
      </div>
      <div className="pdf-hl-bar-actions">
        <button
          type="button"
          className="pdf-modal-btn primary"
          data-action="hl-accept-save"
          disabled={readOnly || acceptable === 0}
          title={readOnly ? t('hlReadOnly') : undefined}
          onClick={onAcceptAllSave}
        >
          {t('hlAcceptAllSave', { count: acceptable })}
        </button>
        <button
          type="button"
          className="pdf-modal-btn"
          data-action="hl-dismiss-all"
          onClick={onDismissAll}
        >
          {t('hlDismissAll')}
        </button>
      </div>
      {run.labels.map((label) => {
        const ofLabel = pending.filter((v) => v.label.id === label.id)
        if (ofLabel.length === 0) return null
        const acceptable = ofLabel.filter((v) => v.found).length
        return (
          <div key={label.id} className="pdf-hl-bar-label" data-label={label.id}>
            <span
              className="pdf-annot-swatch"
              aria-hidden="true"
              style={{ background: cssColor(label.color) }}
            />
            <span className="pdf-hl-bar-name">
              {label.name} <span className="pdf-annot-count">{ofLabel.length}</span>
            </span>
            <button
              type="button"
              className="pdf-modal-btn"
              data-action="hl-accept-label"
              disabled={readOnly || acceptable === 0}
              title={readOnly ? t('hlReadOnly') : undefined}
              onClick={() => onAcceptLabel(label.id)}
            >
              {t('hlAcceptAll', { count: acceptable })}
            </button>
          </div>
        )
      })}
    </div>
  )
}
