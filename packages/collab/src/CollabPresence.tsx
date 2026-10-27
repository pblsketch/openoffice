/**
 * Who is here: the ribbon button with everyone's initials, the list in the
 * dialog, and the notice when a session ends or the PIN was replaced.
 */
import type { Lang } from '@genoffice/i18n'
import { collabText } from './strings'
import type { CollabController } from './use-collab'
import type { CollabPeer } from './session'
import './collab.css'

/** the CSS color of palette entry `index`, for markup that cannot use the token directly */
export function collabColorVar(index: number): string {
  return `var(--collab-${index})`
}

/** the resolved color of palette entry `index`, for editors that paint on a canvas ('' if unset) */
export function collabColorValue(
  index: number,
  element: Element = document.documentElement,
): string {
  return getComputedStyle(element).getPropertyValue(`--collab-${index}`).trim()
}

function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?'
}

function Avatar({ peer }: { peer: CollabPeer }) {
  return (
    <span
      className="collab-avatar"
      style={{ ['--collab-c' as string]: collabColorVar(peer.color) }}
      aria-hidden="true"
    >
      {initialOf(peer.name)}
    </span>
  )
}

export function PeerList({ collab, lang }: { collab: CollabController; lang: Lang }) {
  const others = collab.peers.filter((peer) => !peer.self)
  return (
    <div className="collab-field">
      <span className="collab-dim">{collabText(lang, 'peopleLabel')}</span>
      <ul className="collab-peers">
        {collab.peers.map((peer) => (
          <li key={peer.clientId}>
            <Avatar peer={peer} />
            <span className="collab-peer-name">{peer.name}</span>
            {peer.self && <span className="collab-badge">{collabText(lang, 'you')}</span>}
            {peer.host && <span className="collab-badge">{collabText(lang, 'hostBadge')}</span>}
          </li>
        ))}
      </ul>
      {others.length === 0 && collab.role === 'host' && (
        <div className="collab-dim collab-small">{collabText(lang, 'nobodyYet')}</div>
      )}
    </div>
  )
}

function CollabIcon({ size = 20 }: { size?: number | undefined }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M15.8 13.6c2.3-.3 4.2 1.2 4.7 4.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * The editor's entry point. `className` lets each ribbon use its own button
 * style; the faces of the people here replace the icon during a session.
 */
export function CollabButton({
  collab,
  lang,
  className,
  iconSize,
  showLabel = true,
}: {
  collab: CollabController
  lang: Lang
  className?: string
  iconSize?: number
  showLabel?: boolean
}) {
  if (!collab.available) return null
  const label = collabText(lang, 'button')
  const status =
    collab.role === 'host'
      ? collabText(lang, 'statusHosting', { count: collab.peers.length })
      : collab.role === 'guest'
        ? collabText(lang, 'statusGuest', { name: collab.session?.ticket?.hostName ?? '' })
        : label
  const faces = collab.peers.slice(0, 3)
  return (
    <button
      type="button"
      className={`collab-button${collab.role ? ' active' : ''}${className ? ` ${className}` : ''}`}
      data-tip={status}
      aria-label={status}
      onMouseDown={(e) => e.preventDefault()}
      onClick={collab.openDialog}
    >
      <span className="collab-button-icon">
        {faces.length > 0 ? (
          <span className="collab-faces">
            {faces.map((peer) => (
              <Avatar key={peer.clientId} peer={peer} />
            ))}
          </span>
        ) : (
          <CollabIcon size={iconSize} />
        )}
      </span>
      {showLabel && <span>{label}</span>}
    </button>
  )
}

/** a short-lived line at the bottom of the window: the session ended, or the PIN changed */
export function CollabNotice({ collab, lang }: { collab: CollabController; lang: Lang }) {
  const ended = collab.ended
  if (!ended) {
    return collab.flashed ? (
      <div className="collab-notice" role="status">
        <span>{collabText(lang, collab.flashed)}</span>
      </div>
    ) : null
  }
  const key =
    ended.role === 'host'
      ? 'endedHostStopped'
      : ended.reason === 'stopped'
        ? 'endedLeft'
        : ended.reason === 'host-left'
          ? 'endedByHost'
          : 'endedLost'
  return (
    <div className="collab-notice" role="status">
      <span>{collabText(lang, key)}</span>
      <button type="button" onClick={collab.dismissEnded}>
        {collabText(lang, 'dismiss')}
      </button>
    </div>
  )
}
