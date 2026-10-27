/**
 * The co-editing dialog every editor shows: share this document (name, PIN,
 * address, who is here) or join one (found on the LAN or typed in).
 */
import { useEffect, useMemo, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import {
  COLLAB_COLOR_COUNT,
  COLLAB_DEFAULT_PORT,
  COLLAB_PIN_LENGTH,
  collabNameOf,
  type CollabDiscovered,
  type CollabHostFail,
  type CollabJoinFail,
} from '@genoffice/electron-utils/collab-channels'
import { useModalKeys } from '@genoffice/ui'
import { collabBridge } from './connect'
import { collabText, type CollabStringKey } from './strings'
import type { CollabController, CollabShareBlock } from './use-collab'
import { PeerList } from './CollabPresence'
import './collab.css'

const SHARE_ERRORS: Record<CollabHostFail | CollabShareBlock, CollabStringKey> = {
  busy: 'errShareBusy',
  'too-large': 'errShareTooLarge',
  network: 'errShareNetwork',
  invalid: 'errShareUnsupported',
  unavailable: 'errShareUnsupported',
  'save-first': 'errShareSaveFirst',
  encrypted: 'errShareEncrypted',
  unsupported: 'errShareUnsupported',
}

const JOIN_ERRORS: Record<CollabJoinFail, CollabStringKey> = {
  pin: 'errPin',
  locked: 'errLocked',
  full: 'errFull',
  version: 'errVersion',
  unreachable: 'errUnreachable',
  timeout: 'errTimeout',
  invalid: 'errInvalid',
  unavailable: 'errUnavailable',
}

/** "192.168.0.12" for the usual port, "192.168.0.12:47640" otherwise */
export function addressText(address: string, port: number): string {
  return port === COLLAB_DEFAULT_PORT ? address : `${address}:${port}`
}

/** splits "host:port" as typed; a bare host means the usual port */
export function parseAddress(typed: string): { address: string; port?: number } | null {
  const value = typed.trim()
  const match = /^([^:\s]+)(?::(\d{1,5}))?$/.exec(value)
  const address = match?.[1]
  if (!address) return null
  const port = match?.[2] === undefined ? undefined : Number(match[2])
  if (port !== undefined && (port < 1 || port > 65535)) return null
  return port === undefined ? { address } : { address, port }
}

function ProfileFields({ collab, lang }: { collab: CollabController; lang: Lang }) {
  const t = (key: CollabStringKey, params?: Record<string, string | number>) =>
    collabText(lang, key, params)
  const [name, setName] = useState(collab.profile?.name ?? '')
  useEffect(() => setName(collab.profile?.name ?? ''), [collab.profile?.name])
  const color = collab.profile?.color ?? 0
  const commitName = () => {
    const clean = collabNameOf(name)
    if (!clean || clean === collab.profile?.name) {
      setName(collab.profile?.name ?? '')
      return
    }
    void collab.saveProfile({ name: clean, color })
  }
  return (
    <div className="collab-profile">
      <label className="collab-field">
        <span>{t('nameLabel')}</span>
        <input
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName()
          }}
        />
        <small className="collab-dim">{t('nameHint')}</small>
      </label>
      <div className="collab-field" role="radiogroup" aria-label={t('colorLabel')}>
        <span>{t('colorLabel')}</span>
        <div className="collab-swatches">
          {Array.from({ length: COLLAB_COLOR_COUNT }, (_, index) => (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={index === color}
              aria-label={t('colorChoice', { n: index + 1 })}
              className={`collab-swatch${index === color ? ' on' : ''}`}
              style={{ ['--collab-c' as string]: `var(--collab-${index})` }}
              onClick={() => {
                if (collab.profile) void collab.saveProfile({ ...collab.profile, color: index })
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ShareTab({ collab, lang }: { collab: CollabController; lang: Lang }) {
  const t = (key: CollabStringKey, params?: Record<string, string | number>) =>
    collabText(lang, key, params)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<CollabStringKey | null>(null)
  const info = collab.hostInfo

  if (collab.role === 'guest') {
    const host = collab.session?.ticket?.hostName ?? ''
    return (
      <div className="collab-pane">
        <p>{t('statusGuest', { name: host })}</p>
        <PeerList collab={collab} lang={lang} />
        <div className="collab-actions">
          <button type="button" className="collab-danger" onClick={() => void collab.stop()}>
            {t('leave')}
          </button>
        </div>
      </div>
    )
  }

  if (collab.role === 'host' && info) {
    return (
      <div className="collab-pane">
        <div className="collab-pin-row">
          <div>
            <div className="collab-dim">{t('pinLabel')}</div>
            <div className="collab-pin" aria-live="polite">
              {info.pin.slice(0, 3)} {info.pin.slice(3)}
            </div>
          </div>
          <button type="button" onClick={() => void collab.newPin()}>
            {t('pinNew')}
          </button>
        </div>
        {collab.pinReplaced && <p className="collab-warn">{t('pinChanged')}</p>}
        <div className="collab-field">
          <span className="collab-dim">{t('addressLabel')}</span>
          <div className="collab-addresses">
            {info.addresses.map((address) => (
              <code key={address}>{addressText(address, info.port)}</code>
            ))}
          </div>
        </div>
        <PeerList collab={collab} lang={lang} />
        <div className="collab-actions">
          <button type="button" className="collab-danger" onClick={() => void collab.stop()}>
            {t('shareStop')}
          </button>
        </div>
      </div>
    )
  }

  const start = async () => {
    setBusy(true)
    setError(null)
    const failed = await collab.share()
    setBusy(false)
    if (failed) setError(SHARE_ERRORS[failed])
  }
  return (
    <div className="collab-pane">
      <p>{t('shareIntro')}</p>
      <ProfileFields collab={collab} lang={lang} />
      <p className="collab-dim collab-small">{t('lanNotice')}</p>
      <p className="collab-dim collab-small">{t('firewallHint')}</p>
      {error && (
        <p className="collab-error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="collab-actions">
        <button
          type="button"
          className="collab-primary"
          disabled={busy || !collab.profile}
          onClick={() => void start()}
        >
          {busy ? t('shareStarting') : t('shareStart')}
        </button>
      </div>
    </div>
  )
}

function JoinTab({ collab, lang }: { collab: CollabController; lang: Lang }) {
  const t = (key: CollabStringKey, params?: Record<string, string | number>) =>
    collabText(lang, key, params)
  const [found, setFound] = useState<CollabDiscovered[]>([])
  const [address, setAddress] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<CollabStringKey | null>(null)

  useEffect(() => collabBridge()?.discover(setFound), [])

  const target = useMemo(() => parseAddress(address), [address])
  const pinDigits = pin.replace(/\D/g, '')
  const canJoin = !!target && pinDigits.length === COLLAB_PIN_LENGTH && !busy

  const submit = async () => {
    if (!target) return
    setBusy(true)
    setError(null)
    const failed = await collab.join({ ...target, pin: pinDigits })
    setBusy(false)
    if (failed) setError(JOIN_ERRORS[failed])
    else {
      setPin('')
      collab.closeDialog()
    }
  }

  return (
    <div className="collab-pane">
      <p>{t('joinIntro')}</p>
      <ProfileFields collab={collab} lang={lang} />
      <div className="collab-field">
        <span>{t('foundLabel')}</span>
        {found.length === 0 ? (
          <div className="collab-dim collab-small">{t('searching')}</div>
        ) : (
          <ul className="collab-found">
            {found.flatMap((host) =>
              host.sessions.map((session, index) => {
                const text = addressText(host.address, host.port)
                return (
                  <li key={`${text}#${index}`}>
                    <button
                      type="button"
                      className={address === text ? 'on' : undefined}
                      onClick={() => setAddress(text)}
                    >
                      <span className="collab-found-title">{session.title}</span>
                      <span className="collab-dim collab-small">
                        {t('foundBy', { name: host.hostName })} · {text}
                      </span>
                    </button>
                  </li>
                )
              }),
            )}
          </ul>
        )}
      </div>
      <div className="collab-join-row">
        <label className="collab-field">
          <span>{t('addressInput')}</span>
          <input
            value={address}
            placeholder={t('addressPlaceholder')}
            spellCheck={false}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label className="collab-field collab-pin-input">
          <span>{t('pinInput')}</span>
          <input
            value={pin}
            inputMode="numeric"
            autoComplete="off"
            maxLength={COLLAB_PIN_LENGTH + 2}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canJoin) void submit()
            }}
          />
        </label>
      </div>
      {error && (
        <p className="collab-error" role="alert">
          {t(error)}
        </p>
      )}
      <div className="collab-actions">
        <button
          type="button"
          className="collab-primary"
          disabled={!canJoin}
          onClick={() => void submit()}
        >
          {busy ? t('joining') : t('join')}
        </button>
      </div>
    </div>
  )
}

export function CollabDialog({ collab, lang }: { collab: CollabController; lang: Lang }) {
  return collab.dialogOpen ? <DialogBody collab={collab} lang={lang} /> : null
}

function DialogBody({ collab, lang }: { collab: CollabController; lang: Lang }) {
  const t = (key: CollabStringKey) => collabText(lang, key)
  const [tab, setTab] = useState<'share' | 'join'>('share')
  const modal = useModalKeys(collab.closeDialog, { restoreFocus: true })
  const inSession = collab.role !== null
  const shown = inSession ? 'share' : tab
  return (
    <div
      className="collab-mask"
      ref={modal.ref}
      tabIndex={-1}
      onKeyDown={modal.onKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) collab.closeDialog()
      }}
    >
      <div className="collab-dialog" role="dialog" aria-modal="true" aria-label={t('dialogTitle')}>
        <div className="collab-head">
          <span className="collab-title">{t('dialogTitle')}</span>
          <button
            type="button"
            className="collab-close"
            aria-label={t('close')}
            onClick={collab.closeDialog}
          >
            ×
          </button>
        </div>
        {!inSession && (
          <div className="collab-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={shown === 'share'}
              className={shown === 'share' ? 'on' : undefined}
              onClick={() => setTab('share')}
            >
              {t('tabShare')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={shown === 'join'}
              className={shown === 'join' ? 'on' : undefined}
              onClick={() => setTab('join')}
            >
              {t('tabJoin')}
            </button>
          </div>
        )}
        {shown === 'share' ? (
          <ShareTab collab={collab} lang={lang} />
        ) : (
          <JoinTab collab={collab} lang={lang} />
        )}
      </div>
    </div>
  )
}
