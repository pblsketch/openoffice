/**
 * The left pane: the table of contents, or the in-book search with its list
 * of results.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { EpubTocEntry } from '@genoffice/epub-engine'
import { useI18n } from '../i18n/locale'
import type { BookSearchHit } from '../reader/book-search'
import { IconClose, IconSearch } from './icons'

export function TocPane(p: {
  entries: readonly EpubTocEntry[]
  /** index of the entry of the chapter being read; -1 for none */
  current: number
  onPick(entry: EpubTocEntry): void
  onClose(): void
}) {
  const { t } = useI18n()
  const activeRef = useRef<HTMLButtonElement>(null)
  const activeEntry = p.current
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [activeEntry])
  return (
    <aside className="epub-side" data-pane="toc" aria-label={t('toc')}>
      <div className="epub-side-head">
        <span className="epub-side-title">{t('toc')}</span>
        <button
          type="button"
          className="epub-side-close"
          aria-label={t('close')}
          data-tip={t('close')}
          onClick={p.onClose}
        >
          <IconClose />
        </button>
      </div>
      {p.entries.length === 0 ? (
        <div className="epub-side-empty">{t('tocEmpty')}</div>
      ) : (
        <nav className="epub-toc">
          {p.entries.map((entry, i) => {
            const reachable = entry.spineIndex !== null
            return (
              <button
                key={i}
                type="button"
                ref={i === p.current ? activeRef : undefined}
                className={`epub-toc-entry${i === p.current ? ' active' : ''}`}
                style={{ paddingInlineStart: `${10 + (Math.max(1, entry.depth) - 1) * 14}px` }}
                aria-current={i === p.current ? 'true' : undefined}
                disabled={!reachable}
                title={entry.title}
                onClick={() => p.onPick(entry)}
              >
                {entry.title}
              </button>
            )
          })}
        </nav>
      )}
    </aside>
  )
}

export interface SearchView {
  running: boolean
  done: number
  total: number
  hits: BookSearchHit[]
  truncated: boolean
  unreadable: number
  /** a search has finished for the query shown */
  finished: boolean
}

export function SearchPane(p: {
  view: SearchView
  /** the active hit's position in `view.hits`; -1 for none */
  active: number
  /** the label of a chapter in the result list */
  chapterName(spineIndex: number): string
  /** bumped to put the focus back into the field */
  focusSignal: number
  onSearch(query: string): void
  onPick(index: number): void
  onClose(): void
  /** the text in the find field changed */
  onQueryChange?(query: string): void
  /** shown under the find field (the editing screen's replace row) */
  children?: ReactNode
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [p.focusSignal])
  const { view } = p
  return (
    <aside className="epub-side" data-pane="search" aria-label={t('find')}>
      <div className="epub-side-head">
        <span className="epub-side-title">{t('find')}</span>
        <button
          type="button"
          className="epub-side-close"
          aria-label={t('close')}
          data-tip={t('close')}
          onClick={p.onClose}
        >
          <IconClose />
        </button>
      </div>
      <form
        className="epub-search-form"
        onSubmit={(e) => {
          e.preventDefault()
          p.onSearch(query)
        }}
      >
        <input
          ref={inputRef}
          className="epub-search-input"
          type="search"
          value={query}
          placeholder={t('findPlaceholder')}
          aria-label={t('findPlaceholder')}
          onChange={(e) => {
            setQuery(e.target.value)
            p.onQueryChange?.(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') p.onClose()
          }}
        />
        <button type="submit" className="epub-search-run" aria-label={t('findRun')}>
          <IconSearch />
        </button>
      </form>
      {p.children}
      <div className="epub-search-summary" aria-live="polite">
        {view.running
          ? t('findSearching', { done: view.done, total: view.total })
          : view.finished
            ? view.hits.length === 0
              ? t('findNone')
              : view.truncated
                ? t('findTruncated', { count: view.hits.length })
                : t('findCount', { count: view.hits.length })
            : ''}
        {!view.running && view.unreadable > 0 && (
          <div className="epub-search-warn">{t('findUnreadable', { count: view.unreadable })}</div>
        )}
      </div>
      <ol className="epub-search-hits">
        {view.hits.map((hit, i) => (
          <li key={`${hit.spineIndex}:${hit.start}`}>
            <button
              type="button"
              className={`epub-search-hit${i === p.active ? ' active' : ''}`}
              aria-current={i === p.active ? 'true' : undefined}
              onClick={() => p.onPick(i)}
            >
              <span className="epub-search-hit-chapter">{p.chapterName(hit.spineIndex)}</span>
              <span className="epub-search-hit-text">
                {hit.before}
                <mark>{hit.match}</mark>
                {hit.after}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  )
}
