import { useCallback, useEffect, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type {
  DriveApi,
  DriveEntry,
  DriveListingRequest,
  DriveUiState,
} from '../../shared/drive-api'
import { DRIVE_ERROR_KEYS, DriveBrowser } from './DriveBrowser'
import { FAILURE_KEYS as PICK_FAILURE_KEYS } from './drive-failures'
import { driveUiText, type DriveStringKey } from './i18n/strings-drive'
import './drive.css'

declare global {
  interface Window {
    /** Google Drive (decision 0033; src/preload/index.ts) */
    aiOfficeDrive?: DriveApi
  }
}

/** The live Drive state from the main process; null until it answers */
export function useDriveState(): DriveUiState | null {
  const [state, setState] = useState<DriveUiState | null>(null)
  useEffect(() => {
    const api = window.aiOfficeDrive
    if (!api) {
      setState({ state: 'unavailable' })
      return
    }
    let live = true
    void api.state().then(
      (s) => live && setState(s),
      () => live && setState({ state: 'unavailable' }),
    )
    const off = api.onStateChanged((s) => setState(s))
    return () => {
      live = false
      off()
    }
  }, [])
  return state
}

export function DriveNavIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5.6 2h4.8l3.9 6.7-2.4 4.3H4.1L1.7 8.7z M5.6 2l3.9 6.7h4.8 M10.4 2 4.1 13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DrivePanel({
  lang,
  dateLocale,
  onOpenSettings,
}: {
  lang: Lang
  dateLocale: string
  /** Settings → Integrations, where Drive is connected */
  onOpenSettings: () => void
}) {
  const t = (key: DriveStringKey) => driveUiText(lang, key)
  const state = useDriveState()

  const list = useCallback(
    (listing: DriveListingRequest, pageToken?: string) =>
      window.aiOfficeDrive!.list(listing, pageToken),
    [],
  )

  const open = async (entry: DriveEntry): Promise<DriveStringKey | null> => {
    const result = await window.aiOfficeDrive!.open(entry.id).catch(() => null)
    return result?.ok ? null : DRIVE_ERROR_KEYS[result?.kind ?? 'network']
  }

  const pick = async (): Promise<DriveStringKey | null> => {
    const result = await window.aiOfficeDrive!.pickOpen().catch(() => null)
    if (!result) return 'driveErrNetwork'
    if (result.ok) return result.problem ? DRIVE_ERROR_KEYS[result.problem] : null
    if (result.reason === 'cancelled' || result.reason === 'busy') return null
    if (result.reason === 'not-connected') return 'driveErrNotConnected'
    return PICK_FAILURE_KEYS[result.reason]
  }

  if (!state || state.state === 'unavailable') return <main className="content drive-panel" />

  if (state.state !== 'connected') {
    return (
      <main className="content drive-panel">
        <div className="drive-head">
          <h2 className="drive-title">{t('driveNav')}</h2>
        </div>
        <div className="drive-empty-card">
          <div className="drive-empty-title">{t('driveNotConnectedTitle')}</div>
          <p className="drive-empty-body">{t('driveNotConnectedBody')}</p>
          {state.state === 'disconnected' && state.expired && (
            <p className="drive-warn">{t('driveExpired')}</p>
          )}
          <button className="drive-primary" onClick={onOpenSettings}>
            {t('driveOpenSettings')}
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="content drive-panel">
      <div className="drive-head">
        <h2 className="drive-title">{t('driveNav')}</h2>
        <span className="drive-account">{state.email || state.name}</span>
      </div>
      {state.trainingAck ? (
        <DriveBrowser
          lang={lang}
          dateLocale={dateLocale}
          list={list}
          onOpen={open}
          onPick={pick}
          picking={state.picking}
        />
      ) : (
        <div className="drive-empty-card">
          <div className="drive-empty-title">{t('driveTrainingTitle')}</div>
          <p className="drive-empty-body">{t('driveTrainingBody')}</p>
          <button className="drive-primary" onClick={onOpenSettings}>
            {t('driveOpenSettings')}
          </button>
        </div>
      )}
    </main>
  )
}
