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
 * The Drive files the app may open (decision 0085): the ones the person chose
 * in Google's picker, most recently viewed first, and a search among them.
 * The picker itself is Google's page in the browser; `onPick` starts it, and
 * the list reloads when it comes back.
 */
export function DriveBrowser({
  lang,
  dateLocale,
  list,
  onOpen,
  onPick,
  picking,
}: {
  lang: Lang
  dateLocale: string
  list: (listing: DriveListingRequest, pageToken?: string) => Promise<DriveListResult>
  /** open a file; returns an error to show, or null */
  onOpen: (entry: DriveEntry) => Promise<DriveStringKey | null>
  /** Google's picker; the picked files open, and the list reloads after; returns an error or null */
  onPick: () => Promise<DriveStringKey | null>
  /** Google's picker is open in the browser */
  picking: boolean
}) {
  const t = (key: DriveStringKey, params?: Record<string, string>) => driveUiText(lang, key, params)
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState<string | null>(null)
  const [files, setFiles] = useState<DriveEntry[]>([])
  const [nextPage, setNextPage] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<DriveStringKey | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const request = useRef(0)

  const listing = useCallback(
    (): DriveListingRequest => (searched ? { kind: 'search', text: searched } : { kind: 'recent' }),
    [searched],
  )

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

  const pick = async () => {
    setError(null)
    const problem = await onPick().catch(() => 'driveErrNetwork' as const)
    if (problem) setError(problem)
    setSearched(null)
    setQuery('')
    void load()
  }

  const activate = async (entry: DriveEntry) => {
    if (!entry.openable || opening) return
    setOpening(entry.id)
    setError(null)
    const problem = await onOpen(entry).catch(() => 'driveErrNetwork' as const)
    setOpening(null)
    if (problem) setError(problem)
  }

  const title = searched ? t('driveSearchResults', { q: searched }) : t('driveRecent')

  return (
    <div className="drive-browser">
      <div className="drive-toolbar">
        <button className="drive-primary" onClick={() => void pick()} disabled={picking}>
          {t('drivePick')}
        </button>
        <form
          className="drive-search"
          onSubmit={(e) => {
            e.preventDefault()
            setSearched(query.trim() || null)
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
      {picking && <p className="drive-muted">{t('drivePicking')}</p>}
      <p className="drive-muted">{t('drivePickNote')}</p>

      <nav className="drive-crumbs" aria-label={title}>
        {searched ? (
          <>
            <button
              className="drive-crumb"
              onClick={() => {
                setSearched(null)
                setQuery('')
              }}
            >
              {t('driveRecent')}
            </button>
            <span className="drive-crumb-item">
              <span className="drive-crumb-sep">›</span>
              <span className="drive-crumb-current">{title}</span>
            </span>
          </>
        ) : (
          <span className="drive-crumb-current">{title}</span>
        )}
      </nav>

      {error && (
        <p className="drive-warn" role="alert">
          {t(error)}
        </p>
      )}

      <ul className="drive-list" aria-busy={loading}>
        {files.map((entry) => {
          const icon = ICONS[entry.type]
          const unsupported = !entry.openable
          const note = unsupported
            ? t('driveUnsupported')
            : entry.google
              ? t('driveGoogleNote')
              : !entry.canEdit
                ? t('driveReadOnlyNote')
                : undefined
          return (
            <li key={entry.id}>
              <button
                className="drive-row"
                disabled={unsupported || opening !== null}
                title={note}
                onClick={() => void activate(entry)}
              >
                <span className="drive-icon">
                  {icon ? <img src={icon} alt="" width={20} height={20} /> : <OtherIcon />}
                </span>
                <span className="drive-name">{entry.name}</span>
                {entry.google && <span className="drive-badge">{t('driveGoogleBadge')}</span>}
                {!entry.canEdit && <span className="drive-badge">{t('driveReadOnly')}</span>}
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
