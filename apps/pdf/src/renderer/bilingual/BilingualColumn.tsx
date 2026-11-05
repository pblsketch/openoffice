/**
 * The translation column beside one page, the outline it draws on the page,
 * and the bar above the pages (reading-assist spec 4.5). Display only: the
 * actions that send or write (task T7) plug into the slots. A unit with
 * sentence boundaries shows one hover span per sentence (translation-reading
 * spec 4.4); marks render inside the spans as they do in a paragraph.
 */
import { Fragment, memo } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react'
import type { TranslationMode } from '../../../../../packages/pdf-structure/src/store/job-keys'
import type { InlineRun } from '../../../../../packages/pdf-structure/src/tree/types'
import type { TFunc } from '../i18n/locale'
import type {
  BilingualCounts,
  BilingualItem,
  BilingualPage,
  BilingualTableItem,
  BilingualTextItem,
  BilingualUnit,
} from './model'
import { pendingUnits, splitRunsAtEnds } from './model'
import type { BilingualData } from './useBilingualData'

// ── extension points (task T7 fills them) ──

/** what a page's action slot knows */
export interface BilingualPageContext {
  docHash: string
  lang: string
  /** the results the column shows: the plain translation or the easy explanation */
  mode: TranslationMode
  /** original page (1-based) in the saved file */
  page: number
  counts: BilingualCounts
  /** the units on the page with nothing stored, in reading order */
  pending: BilingualUnit[]
}

/** what a paragraph's action slot knows */
export interface BilingualParagraphContext {
  docHash: string
  lang: string
  /** the results the column shows: the plain translation or the easy explanation */
  mode: TranslationMode
  /** page the paragraph starts on */
  page: number
  /** the tree block (the table, for a cell paragraph) */
  itemId: string
  unit: BilingualUnit
}

export interface BilingualSlots {
  /** in each page's column header ("translate this page", "translate the rest (N)") */
  pageActions?: (ctx: BilingualPageContext) => ReactNode
  /** beside each paragraph ("translate again") */
  paragraphActions?: (ctx: BilingualParagraphContext) => ReactNode
  /** a paragraph was double-clicked (open its editor) */
  onParagraphDoubleClick?: (ctx: BilingualParagraphContext) => void
  /** replaces a paragraph's text (its editor while open); undefined keeps the text */
  renderParagraphBody?: (ctx: BilingualParagraphContext) => ReactNode | undefined
  /** in the bar above the pages ("translate all pages") */
  barActions?: (data: BilingualData) => ReactNode
  /** under the bar (what a press met: the connect prompt, the first-connection notice) */
  barPanel?: (data: BilingualData) => ReactNode
}

// ── inline text ──

/** inline runs as text: marks kept, links shown but not followed from the column */
export function BilingualRuns({ runs }: { runs: readonly InlineRun[] }): ReactElement {
  return (
    <>
      {runs.map((r, i) => {
        switch (r.kind) {
          case 'text': {
            let node: ReactNode = r.text
            if (r.href) node = <span className="bl-link">{node}</span>
            if (r.italic) node = <em>{node}</em>
            if (r.bold) node = <strong>{node}</strong>
            return <Fragment key={i}>{node}</Fragment>
          }
          case 'footnoteRef':
            return <sup key={i}>{r.marker ?? '*'}</sup>
          case 'math':
            return (
              <code key={i} className="bl-math">
                {r.latex}
              </code>
            )
          case 'lineBreak':
            return <br key={i} />
          default:
            return null
        }
      })}
    </>
  )
}

// ── the column ──

export interface BilingualColumnProps {
  /** null: a page inserted since the last save (its column stays empty) */
  page: BilingualPage | null
  docHash: string | null
  lang: string | null
  /** the results shown (default: the plain translation) */
  mode?: TranslationMode
  width: number
  height: number
  fontSize: number
  /** inside the drawn window (visible pages and two on each side) */
  drawn: boolean
  /** the linked block under the pointer (column or page), lit as a whole */
  hoverId: string | null
  /** the unit of the located sentence under the pointer (lit alone), or null */
  hoverUnitKey?: string | null
  /** that sentence's index in the unit */
  hoverSentence?: number | null
  t: TFunc
  slots: BilingualSlots | undefined
  /** the pointer entered (or left, null) an item, or one sentence of a sentence-linked unit */
  onHover: (id: string | null, sentence?: { unitKey: string; index: number }) => void
  onResizeStart: (e: ReactPointerEvent<HTMLDivElement>) => void
}

/** the located sentence lit in the column */
interface LitSentence {
  unitKey: string
  index: number
}

const STATE_TIP = {
  pending: 'blPendingTip',
  failed: 'blFailedTip',
} as const

function unitClass(unit: BilingualUnit): string {
  if (unit.state === 'translated') return unit.edited ? ' bl-edited' : ''
  return unit.state === 'failed' ? ' bl-source bl-failed' : ' bl-source'
}

function unitTip(unit: BilingualUnit, t: TFunc): string | undefined {
  if (unit.state === 'translated') return unit.edited ? t('blEditedTip') : undefined
  return t(STATE_TIP[unit.state])
}

/** whitespace and line breaks a sentence starts with, kept outside its hover span */
function splitLead(runs: readonly InlineRun[]): [InlineRun[], InlineRun[]] {
  const lead: InlineRun[] = []
  const rest = [...runs]
  while (rest.length > 0) {
    const r = rest[0]!
    if (r.kind === 'lineBreak') {
      lead.push(rest.shift()!)
      continue
    }
    if (r.kind !== 'text') break
    const space = /^\s+/u.exec(r.text)?.[0]
    if (!space) break
    lead.push({ ...r, text: space })
    if (space.length === r.text.length) rest.shift()
    else rest[0] = { ...r, text: r.text.slice(space.length) }
  }
  return [lead, rest]
}

/** a translation cut into sentences, each reacting to the pointer on its own */
function SentenceRuns(props: {
  unit: BilingualUnit
  ends: readonly number[]
  lit: number | null
  onEnter: (index: number) => void
  onLeave: () => void
}): ReactElement {
  const parts = splitRunsAtEnds(props.unit.runs, props.ends)
  return (
    <>
      {parts.map((runs, i) => {
        const [lead, body] = splitLead(runs)
        return (
          <Fragment key={i}>
            {lead.length > 0 && <BilingualRuns runs={lead} />}
            <span
              className={`bl-sent${props.lit === i ? ' bl-sent-hover' : ''}`}
              data-bl-sent={i}
              onMouseEnter={() => props.onEnter(i)}
              onMouseLeave={props.onLeave}
            >
              <BilingualRuns runs={body} />
            </span>
          </Fragment>
        )
      })}
    </>
  )
}

/**
 * A unit's text: the slot's replacement (its editor while open), else the
 * sentences when the unit links by sentence, else the runs as they are.
 */
function UnitBody({
  unit,
  ctx,
  slots,
  linked,
  lit,
  onSentence,
  onSentenceLeave,
}: {
  unit: BilingualUnit
  ctx: BilingualParagraphContext | null
  slots: BilingualSlots | undefined
  /** the unit has a box to look its sentences up in */
  linked: boolean
  lit: LitSentence | null
  onSentence: (index: number) => void
  onSentenceLeave: () => void
}): ReactElement {
  const override = ctx ? slots?.renderParagraphBody?.(ctx) : undefined
  if (override !== undefined) return <>{override}</>
  if (linked && unit.sentenceEnds) {
    return (
      <SentenceRuns
        unit={unit}
        ends={unit.sentenceEnds.translated}
        lit={lit?.unitKey === unit.unitKey ? lit.index : null}
        onEnter={onSentence}
        onLeave={onSentenceLeave}
      />
    )
  }
  return <BilingualRuns runs={unit.runs} />
}

/** the unit shows sentence spans (no editor over it) */
function linksBySentence(
  unit: BilingualUnit,
  linked: boolean,
  ctx: BilingualParagraphContext | null,
  slots: BilingualSlots | undefined,
): boolean {
  if (!linked || !unit.sentenceEnds) return false
  return !ctx || slots?.renderParagraphBody?.(ctx) === undefined
}

function Actions({
  ctx,
  slots,
}: {
  ctx: BilingualParagraphContext | null
  slots: BilingualSlots | undefined
}): ReactElement | null {
  const node = ctx ? slots?.paragraphActions?.(ctx) : null
  return node ? <span className="bl-item-actions">{node}</span> : null
}

interface ItemProps {
  ctxOf: (itemId: string, unit: BilingualUnit) => BilingualParagraphContext | null
  hover: boolean
  lit: LitSentence | null
  t: TFunc
  slots: BilingualSlots | undefined
  onHover: BilingualColumnProps['onHover']
}

function TextItem(props: ItemProps & { item: BilingualTextItem }): ReactElement {
  const { item, ctxOf, hover, lit, t, slots, onHover } = props
  const { unit } = item
  const ctx = ctxOf(item.id, unit)
  const linked = item.regions.length > 0
  // a sentence-linked paragraph reacts per sentence, not as a whole
  const bySentence = linksBySentence(unit, linked, ctx, slots)
  const whole = linked && !bySentence
  const level = item.role === 'heading' ? Math.min(Math.max(item.level ?? 1, 1), 6) : 0
  return (
    <div
      className={`bl-item bl-${item.role}${level ? ` bl-h${level}` : ''}${unitClass(unit)}${
        linked ? ' bl-linked' : ''
      }${bySentence ? ' bl-sentences' : ''}${hover ? ' bl-hover' : ''}`}
      data-bl-id={item.id}
      title={unitTip(unit, t)}
      onMouseEnter={whole ? () => onHover(item.id) : undefined}
      onMouseLeave={whole ? () => onHover(null) : undefined}
      onDoubleClick={
        ctx && slots?.onParagraphDoubleClick ? () => slots.onParagraphDoubleClick!(ctx) : undefined
      }
    >
      {item.marker !== undefined &&
        (item.role === 'footnote' ? (
          <sup className="bl-marker">{item.marker}</sup>
        ) : (
          <span className="bl-marker">{item.marker}</span>
        ))}
      <UnitBody
        unit={unit}
        ctx={ctx}
        slots={slots}
        linked={linked}
        lit={lit}
        onSentence={(index) => onHover(item.id, { unitKey: unit.unitKey, index })}
        onSentenceLeave={() => onHover(null)}
      />
      <Actions ctx={ctx} slots={slots} />
    </div>
  )
}

function TableItem(props: ItemProps & { item: BilingualTableItem }): ReactElement {
  const { item, ctxOf, hover, lit, t, slots, onHover } = props
  const linked = item.regions.length > 0
  const rows = Array.from({ length: item.rowCount }, (_, r) =>
    item.cells.filter((c) => c.row === r).sort((a, b) => a.col - b.col),
  )
  return (
    <div
      className={`bl-item bl-table-wrap${linked ? ' bl-linked' : ''}${hover ? ' bl-hover' : ''}`}
      data-bl-id={item.id}
      onMouseEnter={linked ? () => onHover(item.id) : undefined}
      onMouseLeave={linked ? () => onHover(null) : undefined}
    >
      <table className="bl-table">
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r}>
              {cells.map((c) => {
                const Cell = c.header ? 'th' : 'td'
                return (
                  <Cell
                    key={`${c.row}.${c.col}`}
                    rowSpan={c.rowSpan > 1 ? c.rowSpan : undefined}
                    colSpan={c.colSpan > 1 ? c.colSpan : undefined}
                  >
                    {c.paragraphs.map((p, k) => {
                      if (!p.unit)
                        return (
                          <div key={k} className="bl-cell-p">
                            <BilingualRuns runs={p.runs} />
                          </div>
                        )
                      const unit = p.unit
                      const ctx = ctxOf(item.id, unit)
                      return (
                        <div
                          key={k}
                          className={`bl-cell-p${unitClass(unit)}`}
                          title={unitTip(unit, t)}
                          onDoubleClick={
                            ctx && slots?.onParagraphDoubleClick
                              ? () => slots.onParagraphDoubleClick!(ctx)
                              : undefined
                          }
                        >
                          <UnitBody
                            unit={unit}
                            ctx={ctx}
                            slots={slots}
                            linked={linked && p.region !== undefined}
                            lit={lit}
                            onSentence={(index) =>
                              onHover(item.id, { unitKey: unit.unitKey, index })
                            }
                            // back to the table as a whole: the pointer is still over it
                            onSentenceLeave={() => onHover(item.id)}
                          />
                          <Actions ctx={ctx} slots={slots} />
                        </div>
                      )
                    })}
                  </Cell>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Item(props: ItemProps & { item: BilingualItem }): ReactElement {
  return props.item.kind === 'text' ? (
    <TextItem {...props} item={props.item} />
  ) : (
    <TableItem {...props} item={props.item} />
  )
}

/** the translation column of one page */
export const BilingualColumn = memo(function BilingualColumn(
  props: BilingualColumnProps,
): ReactElement {
  const { page, docHash, lang, width, height, fontSize, drawn, hoverId, t, slots } = props
  const style = { width, height, ['--bl-font' as string]: `${fontSize}px` }
  if (!page) {
    return <div className="bl-col bl-col-blank" style={style} aria-hidden="true" />
  }
  const mode: TranslationMode = props.mode === 'easy' ? 'easy' : 'translate'
  const ready = drawn && docHash !== null && lang !== null
  const lit: LitSentence | null =
    props.hoverUnitKey != null && props.hoverSentence != null
      ? { unitKey: props.hoverUnitKey, index: props.hoverSentence }
      : null
  const ctxOf = (itemId: string, unit: BilingualUnit): BilingualParagraphContext | null =>
    docHash !== null && lang !== null
      ? { docHash, lang, mode, page: page.page, itemId, unit }
      : null
  const pageActions =
    ready && slots?.pageActions
      ? slots.pageActions({
          docHash: docHash!,
          lang: lang!,
          mode,
          page: page.page,
          counts: page.counts,
          pending: pendingUnits(page),
        })
      : null
  return (
    <div className="bl-col" style={style} data-bl-page={page.page}>
      <div
        className="bl-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('blResize')}
        onPointerDown={props.onResizeStart}
      />
      <div className="bl-col-head">
        <span className="bl-col-page">{t('blPageHeader', { page: page.page })}</span>
        {page.counts.units > 0 && (
          <span className="bl-col-count">
            {t('blPageCount', { translated: page.counts.translated, units: page.counts.units })}
          </span>
        )}
        {pageActions && <span className="bl-page-actions">{pageActions}</span>}
      </div>
      {ready && (
        <div className="bl-col-body">
          {page.continued.map((c) => (
            <div
              key={`c:${c.id}`}
              className={`bl-continued${hoverId === c.id ? ' bl-hover' : ''}`}
              onMouseEnter={() => props.onHover(c.id)}
              onMouseLeave={() => props.onHover(null)}
            >
              {t('blContinued')}
            </div>
          ))}
          {page.items.map((item) => (
            <Item
              key={item.id}
              item={item}
              ctxOf={ctxOf}
              hover={hoverId === item.id}
              lit={lit}
              t={t}
              slots={slots}
              onHover={props.onHover}
            />
          ))}
          {page.items.length === 0 && page.continued.length === 0 && (
            <div className="bl-empty">{t('blNoText')}</div>
          )}
        </div>
      )}
    </div>
  )
})

/** a folded column: a thin strip that unfolds it */
export function BilingualFoldedColumn(props: {
  height: number
  width: number
  t: TFunc
  onExpand: () => void
}): ReactElement {
  return (
    <div className="bl-col bl-col-folded" style={{ width: props.width, height: props.height }}>
      <button
        type="button"
        className="bl-expand"
        aria-label={props.t('blExpand')}
        data-tip={props.t('blExpand')}
        onClick={props.onExpand}
      >
        ‹
      </button>
    </div>
  )
}

/**
 * The hovered block's source boxes outlined on one page, or (`sentence`) the
 * lines of the hovered source sentence lit. Screen only: the layer sits over
 * the page bitmap and is hidden in print; nothing is written to the file.
 */
export function BilingualPageOverlay(props: {
  boxes: ReadonlyArray<{ left: number; top: number; width: number; height: number }>
  kind?: 'outline' | 'sentence'
}): ReactElement | null {
  if (props.boxes.length === 0) return null
  const className = props.kind === 'sentence' ? 'bl-overlay-sent' : 'bl-overlay-box'
  return (
    <div className="bl-overlay" aria-hidden="true">
      {props.boxes.map((b, i) => (
        <div
          key={i}
          className={className}
          style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
        />
      ))}
    </div>
  )
}
