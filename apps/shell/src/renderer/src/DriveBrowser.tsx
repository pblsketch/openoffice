import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type {
  DriveEntry,
  DriveEntryType,
  DriveErrorKind,
  DriveListResult,
  DriveListingRequest,
} from '../../shared/drive-api'
import { driveUiText, type DriveStringKey } from './i18n/strings-drive'
import iconDocx from './assets/file-docx.svg'
import iconXlsx from './assets/file-xlsx.svg'
import iconPptx from './assets/file-pptx.svg'
import iconPdf from './assets/file-pdf.svg'
import iconMd from './assets/file-md.svg'
import iconHtml from './assets/file-html.svg'
import iconMindmap from './assets/file-mindmap.svg'
import iconHwp from './assets/file-hwp.svg'
import iconEpub from './assets/file-epub.svg'
import './drive.css'

const ICONS: Partial<Record<DriveEntryType, string>> = {
  document: iconDocx,
  spreadsheet: iconXlsx,
  presentation: iconPptx,
  pdf: iconPdf,
  markdown: iconMd,
  html: iconHtml,
  mindmap: iconMindmap,
  hwp: iconHwp,
  epub: iconEpub,
}

export const DRIVE_ERROR_KEYS: Record<DriveErrorKind | 'unsupported' | 'disk', DriveStringKey> = {
  'not-connected': 'driveErrNotConnected',
  'not-found': 'driveErrNotFound',
  forbidden: 'driveErrForbidden',
  'too-large': 'driveErrTooLarge',
  'rate-limit': 'driveErrRateLimit',
  network: 'driveErrNetwork',
  unsupported: 'driveUnsupported',
  disk: 'driveErrDisk',
}

type Place = 'mine' | 'shared' | 'recent'

interface Crumb {
  id: string
  name: string
}

function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M2.5 5.5c0-.8.7-1.5 1.5-1.5h3.6l1.6 1.8h6.8c.8 0 1.5.7 1.5 1.5v7.2c0 .8-.7 1.5-1.5 1.5H4c-.8 0-1.5-.7-1.5-1.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function OtherIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M5 2.5h6.5L15 6v11.5H5z M11.5 2.5V6H15"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Browsing Drive: My Drive (into folders), Shared with me, Recent, search.
 * Home opens what is clicked; the attach picker ticks files and folders.
 */
export function DriveBrowser({
  lang,
  dateLocale,
  list,
  onOpen,
  pick,
  disabled = false,
}: {
  lang: Lang
  dateLocale: string
  list: (listing: DriveListingRequest, pageToken?: string) => Promise<DriveListResult>
  /** open mode: open a file; returns an error to show, or null */
  onOpen?: (entry: DriveEntry) => Promise<DriveStringKey | null>
  /** pick mode: tick files and folders */
  pick?: { selected: ReadonlyMap<string, DriveEntry>; toggle: (entry: DriveEntry) => void }
  disabled?: boolean
}) {
  const t = (key: DriveStringKey, params?: Record<string, string>) => driveUiText(lang, key, params)
  const [place, setPlace] = useState<Place>('mine')
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState<string | null>(null)
  const [files, setFiles] = useState<DriveEntry[]>([])
  const [nextPage, setNextPage] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<DriveStringKey | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const request = useRef(0)

  const listing = useCallback((): DriveListingRequest => {
    if (searched) return { kind: 'search', text: searched }
    if (place === 'shared' && crumbs.length === 0) return { kind: 'shared' }
    if (place === 'recent') return { kind: 'recent' }
    return { kind: 'folder', folderId: crumbs.at(-1)?.id ?? 'root' }
  }, [searched, place, crumbs])

  const load = useCallback(
    async (more?: string) => {
      const id = ++request.current
      setLoading(true)
      setError(null)
      const result = await list(listing(), more).catch(() => null)
      if (id !== request.current) return
      setLoading(false)
      if (!result || !result.ok) {
        setError(DRIVE_ERROR_KEYS[result?.kind ?? 'network'])
        if (!more) setFiles([])
        return
      }
      setFiles((prev) => (more ? [...prev, ...result.files] : result.files))
      setNextPage(result.nextPageToken)
    },
    [list, listing],
  )

  useEffect(() => {
    void load()
  }, [load])

  const placeName = (p: Place) =>
    p === 'mine' ? t('driveMyDrive') : p === 'shared' ? t('driveShared') : t('driveRecent')

  const choosePlace = (next: Place) => {
    setPlace(next)
    setCrumbs([])
    setSearched(null)
    setQuery('')
  }

  const enterFolder = (entry: DriveEntry) => {
    setSearched(null)
    setQuery('')
    setCrumbs((c) => [...c, { id: entry.id, name: entry.name }])
  }

  const activate = async (entry: DriveEntry) => {
    if (entry.type === 'folder') return enterFolder(entry)
    if (pick) return pick.toggle(entry)
    if (!onOpen || !entry.openable || opening) return
    setOpening(entry.id)
    setError(null)
    const problem = await onOpen(entry).catch(() => 'driveErrNetwork' as const)
    setOpening(null)
    if (problem) setError(problem)
  }

  const title = searched
    ? t('driveSearchResults', { q: searched })
    : (crumbs.at(-1)?.name ?? placeName(place))

  return (
    <div className="drive-browser">
      <div className="drive-toolbar">
        <div className="filter-pills" role="tablist">
          {(['mine', 'shared', 'recent'] as const).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={place === p && !searched}
              className={`filter-pill${place === p && !searched ? ' active' : ''}`}
              onClick={() => choosePlace(p)}
            >
              {placeName(p)}
            </button>
          ))}
        </div>
        <form
          className="drive-search"
          onSubmit={(e) => {
            e.preventDefault()
            const q = query.trim()
            setCrumbs([])
            setSearched(q || null)
          }}
        >
          <input
            type="search"
            value={query}
            placeholder={t('driveSearchPlaceholder')}
            aria-label={t('driveSearchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
        <button className="drive-ghost" onClick={() => void load()} disabled={loading}>
          {t('driveRefresh')}
        </button>
      </div>

      {(crumbs.length > 0 || searched) && (
        <nav className="drive-crumbs" aria-label={title}>
          <button
            className="drive-crumb"
            onClick={() => {
              setCrumbs([])
              setSearched(null)
              setQuery('')
            }}
          >
            {placeName(place)}
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id} className="drive-crumb-item">
              <span className="drive-crumb-sep">›</span>
              <button className="drive-crumb" onClick={() => setCrumbs(crumbs.slice(0, i + 1))}>
                {c.name}
              </button>
            </span>
          ))}
          {searched && (
            <span className="drive-crumb-item">
              <span className="drive-crumb-sep">›</span>
              <span className="drive-crumb-current">{title}</span>
            </span>
          )}
        </nav>
      )}

      {error && (
        <p className="drive-warn" role="alert">
          {t(error)}
        </p>
      )}

      <ul className="drive-list" aria-busy={loading}>
        {files.map((entry) => {
          const icon = ICONS[entry.type]
          const folder = entry.type === 'folder'
          const unsupported = !folder && !entry.openable
          const note = unsupported
            ? t('driveUnsupported')
            : entry.google
              ? t(pick ? 'drivePickGoogleNote' : 'driveGoogleNote')
              : !entry.canEdit && !folder && !pick
                ? t('driveReadOnlyNote')
                : folder && pick
                  ? t('drivePickFolderNote')
                  : undefined
          const ticked = pick?.selected.has(entry.id) ?? false
          return (
            <li key={entry.id} className={pick ? 'drive-pick-item' : undefined}>
              {pick && (
                <label className="drive-check" title={note}>
                  <input
                    type="checkbox"
                    checked={ticked}
                    disabled={unsupported || disabled}
                    aria-label={entry.name}
                    onChange={() => pick.toggle(entry)}
                  />
                </label>
              )}
              <button
                className={`drive-row${ticked ? ' ticked' : ''}`}
                disabled={unsupported || disabled || opening !== null}
                title={note}
                onClick={() => void activate(entry)}
              >
                <span className="drive-icon">
                  {folder ? (
                    <FolderIcon />
                  ) : icon ? (
                    <img src={icon} alt="" width={20} height={20} />
                  ) : (
                    <OtherIcon />
                  )}
                </span>
                <span className="drive-name">{entry.name}</span>
                {entry.google && <span className="drive-badge">{t('driveGoogleBadge')}</span>}
                {!entry.canEdit && !folder && !pick && (
                  <span className="drive-badge">{t('driveReadOnly')}</span>
                )}
                <span className="drive-date">
                  {opening === entry.id
                    ? t('driveOpening')
                    : entry.modifiedTime
                      ? new Date(entry.modifiedTime).toLocaleDateString(dateLocale)
                      : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {!loading && files.length === 0 && !error && <p className="drive-muted">{t('driveEmpty')}</p>}
      {loading && <p className="drive-muted">{t('driveLoading')}</p>}
      {!loading && nextPage && (
        <button className="drive-ghost drive-more" onClick={() => void load(nextPage)}>
          {t('driveLoadMore')}
        </button>
      )}
    </div>
  )
}
