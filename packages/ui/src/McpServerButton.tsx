import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type { McpServerView, McpWindowState } from '@genoffice/agent-core'
import { aiModelPopoverStyle } from './AiModelPicker'
import { useDismissablePopover } from './popover-dismiss'
import {
  mcpServerAction,
  mcpServerButtonVisible,
  mcpServerStatusText,
  type McpServerAction,
} from './user-mcp-model'
import { userMcpText, type UserMcpStringKey } from './strings-user-mcp'
import { useMcpWindow } from './use-mcp-window'
import './user-mcp.css'

const POPOVER_WIDTH = 300
const POPOVER_MAX_HEIGHT = 380

const ACTION_LABELS: Record<McpServerAction, UserMcpStringKey> = {
  login: 'relogin',
  review: 'review',
  retry: 'retry',
  check: 'checkInSettings',
  enable: 'enableInSettings',
}

/** Call a bridge method without letting a refusal escape as an unhandled rejection */
function fire(call: () => Promise<unknown> | unknown): void {
  try {
    void Promise.resolve(call()).catch(() => {})
  } catch {
    // the shell answers through the list; nothing to show here
  }
}

function ServerIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="2.5" width="11" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="11" height="4.5" rx="1" />
      <path d="M5 4.75h.01M5 11.25h.01M8 4.75h3M8 11.25h3" />
    </svg>
  )
}

function ServerRow({
  lang,
  server,
  on,
  onToggle,
  onAction,
}: {
  lang: Lang
  server: McpServerView
  on: boolean
  onToggle: (on: boolean) => void
  onAction: (action: McpServerAction) => void
}) {
  const disabled = server.status === 'disabled'
  const action = mcpServerAction(server)
  return (
    <li className={`ai-mcp-row${on ? '' : ' is-off'}`}>
      <label className="ai-mcp-row-main">
        <input
          type="checkbox"
          checked={on}
          disabled={disabled}
          aria-label={userMcpText(lang, 'useInChat', { server: server.name })}
          onChange={(e) => onToggle(e.currentTarget.checked)}
        />
        <span className="ai-mcp-row-name" dir="auto">
          {server.name}
        </span>
      </label>
      <div className="ai-mcp-row-meta">
        <span className={`ai-mcp-row-status is-${on || disabled ? server.status : 'off-in-chat'}`}>
          {mcpServerStatusText(lang, server, !on)}
        </span>
        {server.newToolCount > 0 && (
          <span className="ai-mcp-row-new">
            {userMcpText(lang, 'newTools', { n: server.newToolCount })}
          </span>
        )}
      </div>
      {action && (
        <button type="button" className="ai-mcp-row-action" onClick={() => onAction(action)}>
          {userMcpText(lang, ACTION_LABELS[action])}
        </button>
      )}
    </li>
  )
}

/**
 * The server button beside the AI input (user MCP spec 7.5). Shown only
 * while at least one registered server is on in Settings. It opens the
 * server list: per server, on/off for this conversation only, its status
 * ("Off in this conversation" once turned off here), "New tools: n" and the
 * action its status needs. Sign in again, review, check (never checked) and
 * turn on (off in Settings) open Settings → Integrations at that server;
 * retry asks the shell to connect again.
 *
 * `state` defaults to this window's MCP state (`windowMcpState()`); pass
 * `null` for none. `className` defaults to the panels' attach-button class.
 */
export function McpServerButton({
  lang,
  state,
  className = 'ai-attach-btn',
}: {
  lang: Lang
  state?: McpWindowState | null
  className?: string
}): React.JSX.Element | null {
  const { state: mcp, servers, offInChat } = useMcpWindow(state)
  const [open, setOpen] = useState(false)
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({})
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const visible = mcp !== null && mcpServerButtonVisible(servers)

  const close = useCallback(() => setOpen(false), [])
  useDismissablePopover(open, close, { inside: () => [buttonRef.current, popRef.current] })

  // the last server turned off in Settings takes the button, and its list, away
  useEffect(() => {
    if (!visible) setOpen(false)
  }, [visible])

  useEffect(() => {
    if (!open) return
    popRef.current
      ?.querySelector<HTMLElement>('input:not(:disabled), button')
      ?.focus({ preventScroll: true })
  }, [open])

  if (!mcp || !visible) return null

  const label = userMcpText(lang, 'buttonLabel')
  const finish = () => {
    setOpen(false)
    buttonRef.current?.focus({ preventScroll: true })
  }
  const openList = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      setPopStyle(
        aiModelPopoverStyle(
          rect,
          { width: window.innerWidth, height: window.innerHeight },
          POPOVER_WIDTH,
          POPOVER_MAX_HEIGHT,
        ),
      )
    }
    setOpen(true)
  }
  const act = (server: string, action: McpServerAction) => {
    if (action === 'retry') {
      fire(() => mcp.bridge.retry(server))
      return
    }
    // Settings opens in another view; the list has done its part
    fire(() => mcp.bridge.openSettings(server))
    setOpen(false)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${className} ai-mcp-server-btn${open ? ' open' : ''}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tip={open ? undefined : label}
        onClick={() => (open ? finish() : openList())}
      >
        <ServerIcon />
      </button>
      {open && (
        <div
          ref={popRef}
          className="ai-mcp-pop"
          role="dialog"
          aria-label={label}
          style={{ ...popStyle, width: POPOVER_WIDTH }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return
            e.preventDefault()
            e.stopPropagation()
            finish()
          }}
        >
          <div className="ai-mcp-pop-title">{label}</div>
          <p className="ai-mcp-pop-hint">{userMcpText(lang, 'listHint')}</p>
          <ul className="ai-mcp-list">
            {servers.map((server) => (
              <ServerRow
                key={server.name}
                lang={lang}
                server={server}
                on={server.status !== 'disabled' && !offInChat.has(server.name)}
                onToggle={(on) => mcp.setServerOffInChat(server.name, !on)}
                onAction={(action) => act(server.name, action)}
              />
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
