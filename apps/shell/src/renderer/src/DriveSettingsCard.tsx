import { useState } from 'react'
import { FAILURE_KEYS } from './drive-failures'
import { useDriveState } from './DrivePanel'
import { driveUiText, type DriveStringKey } from './i18n/strings-drive'
import { useI18n } from './locale'
import './drive.css'

/**
 * Settings → Integrations: confirm that the AI used with Drive files does not
 * train on them, connect Google Drive, see the account, let the AI search and
 * read the picked files, disconnect (decisions 0033, 0085). Nothing shows in
 * a build without a Google client.
 */
export function DriveSettingsCard() {
  const { lang } = useI18n()
  const t = (key: DriveStringKey, params?: Record<string, string>) => driveUiText(lang, key, params)
  const state = useDriveState()
  const [failure, setFailure] = useState<DriveStringKey | null>(null)
  const [confirming, setConfirming] = useState(false)
  const api = window.aiOfficeDrive

  if (!api || !state || state.state === 'unavailable') return null

  const connect = async () => {
    setFailure(null)
    const result = await api
      .connect()
      .catch(() => ({ ok: false as const, reason: 'network' as const }))
    if (!result.ok && result.reason !== 'cancelled') setFailure(FAILURE_KEYS[result.reason])
  }

  return (
    <section className="set-intg-part set-drive" data-testid="drive-settings">
      <h4 className="set-pane-subtitle">{t('driveNav')}</h4>
      <div className="set-field-desc set-intg-lead">{t('driveDesc')}</div>

      <div className="set-drive-training">
        <div className="set-drive-toggle-title">{t('driveTrainingTitle')}</div>
        <div className="set-field-desc">{t('driveTrainingBody')}</div>
        <label className="set-drive-toggle">
          <input
            type="checkbox"
            checked={state.trainingAck}
            onChange={(e) => {
              setFailure(null)
              void api.setTrainingAck(e.target.checked)
            }}
          />
          <span className="set-drive-toggle-title">{t('driveTrainingAck')}</span>
        </label>
      </div>

      {state.state === 'connected' ? (
        <>
          <div className="set-drive-row">
            <span className="set-drive-account">
              {t('driveConnectedAs', { email: state.email || state.name })}
            </span>
            {confirming ? null : (
              <button className="set-btn" onClick={() => setConfirming(true)}>
                {t('driveDisconnect')}
              </button>
            )}
          </div>
          {confirming && (
            <div className="set-intg-confirm">
              <div className="set-field-desc">{t('driveDisconnectConfirm')}</div>
              <div className="set-drive-row">
                <button
                  className="set-btn"
                  onClick={() => {
                    setConfirming(false)
                    void api.disconnect()
                  }}
                >
                  {t('driveDisconnectYes')}
                </button>
                <button className="set-btn" onClick={() => setConfirming(false)}>
                  {t('driveCancel')}
                </button>
              </div>
            </div>
          )}
          {!state.persisted && (
            <div className="set-field-desc set-intg-warn">{t('driveNotPersisted')}</div>
          )}
        </>
      ) : state.state === 'connecting' ? (
        <div className="set-drive-row">
          <span className="set-field-desc">{t('driveConnecting')}</span>
          <button className="set-btn" onClick={() => void api.cancelConnect()}>
            {t('driveCancel')}
          </button>
        </div>
      ) : (
        <>
          {state.expired && <div className="set-field-desc set-intg-warn">{t('driveExpired')}</div>}
          <div className="set-drive-row">
            <button
              className="set-btn set-btn-primary"
              onClick={() => void connect()}
              disabled={!state.trainingAck}
            >
              {t('driveConnect')}
            </button>
          </div>
          {failure && <div className="set-field-desc set-intg-warn">{t(failure)}</div>}
        </>
      )}

      <label className="set-drive-toggle">
        <input
          type="checkbox"
          checked={state.aiAccess}
          onChange={(e) => void api.setAiAccess(e.target.checked)}
        />
        <span>
          <span className="set-drive-toggle-title">{t('driveAiAccess')}</span>
          <span className="set-field-desc">{t('driveAiAccessDesc')}</span>
        </span>
      </label>
      <div className="set-field-desc">{t('drivePrivacy')}</div>
    </section>
  )
}
