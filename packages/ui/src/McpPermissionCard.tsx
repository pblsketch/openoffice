import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type {
  McpPermissionAnswer,
  McpPermissionRequest,
  McpPermissionStore,
  McpWindowState,
} from '@genoffice/agent-core'
import { mcpDescriptionPreview, mcpInputPreview, mcpInputText } from './user-mcp-model'
import { userMcpText } from './strings-user-mcp'
import { resolveMcpWindowState, useMcpPermissionRequests } from './use-mcp-window'
import './user-mcp.css'

/** Cards mounted per store: a store's requests are blocked once the last card goes */
const mountedCards = new WeakMap<McpPermissionStore, number>()

/**
 * One permission request: the server, the tool, a mark when the server says
 * the tool may delete or change things, the tool's description (its start,
 * then "Show more"), what would be sent (the first 2,000 characters, then
 * "Show more") and the three answers. Focus starts on Block; Escape blocks
 * too.
 */
export function McpPermissionPrompt({
  lang,
  request,
  onAnswer,
}: {
  lang: Lang
  request: McpPermissionRequest
  onAnswer: (answer: McpPermissionAnswer) => void
}): React.JSX.Element {
  const [full, setFull] = useState(false)
  const [fullDescription, setFullDescription] = useState(false)
  const denyRef = useRef<HTMLButtonElement | null>(null)
  const titleId = useId()
  const text = useMemo(() => mcpInputText(request.input), [request.input])
  const preview = mcpInputPreview(text, full)
  const about = mcpDescriptionPreview(request.description ?? '', fullDescription)

  useEffect(() => {
    denyRef.current?.focus()
  }, [])

  return (
    <section
      className="ai-mcp-card"
      role="group"
      aria-labelledby={titleId}
      data-mcp-request={request.id}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        onAnswer('deny')
      }}
    >
      <div className="ai-mcp-card-head" id={titleId} dir="auto">
        {userMcpText(lang, 'cardTitle', { server: request.server, tool: request.tool })}
      </div>
      {request.destructive && (
        <div className="ai-mcp-card-mark" data-mcp-destructive="true">
          {userMcpText(lang, 'destructive')}
        </div>
      )}
      {about.text && (
        <>
          <div className="ai-mcp-card-label">{userMcpText(lang, 'toolAbout')}</div>
          <p className="ai-mcp-card-about" dir="auto">
            {about.text}
          </p>
          {about.more && (
            <button
              type="button"
              className="ai-mcp-card-more"
              onClick={() => setFullDescription(true)}
            >
              {userMcpText(lang, 'more')}
            </button>
          )}
        </>
      )}
      <div className="ai-mcp-card-label">{userMcpText(lang, 'inputLabel')}</div>
      {text ? (
        <pre className="ai-mcp-card-input" dir="ltr">
          {preview.text}
        </pre>
      ) : (
        <p className="ai-mcp-card-input is-empty">{userMcpText(lang, 'noInput')}</p>
      )}
      {preview.more && (
        <button type="button" className="ai-mcp-card-more" onClick={() => setFull(true)}>
          {userMcpText(lang, 'more')}
        </button>
      )}
      <div className="ai-mcp-card-actions">
        <button type="button" className="ai-mcp-card-btn" onClick={() => onAnswer('once')}>
          {userMcpText(lang, 'allowOnce')}
        </button>
        <button type="button" className="ai-mcp-card-btn" onClick={() => onAnswer('conversation')}>
          {userMcpText(lang, 'allowConversation')}
        </button>
        <button
          ref={denyRef}
          type="button"
          className="ai-mcp-card-btn"
          onClick={() => onAnswer('deny')}
        >
          {userMcpText(lang, 'deny')}
        </button>
      </div>
    </section>
  )
}

/**
 * The permission card an AI window shows in its conversation before an
 * `ask` tool of the person's MCP server runs (user MCP spec 7.4). It shows
 * the first waiting request of the window; the next comes up once that one
 * is answered. Nothing runs before the person answers, and when the last
 * card of the window goes away (the panel closes), everything still waiting
 * is blocked. Renders nothing while nothing waits or without an MCP bridge.
 *
 * `state` defaults to this window's MCP state (`windowMcpState()`); pass
 * `null` for none.
 */
export function McpPermissionCard({
  lang,
  state,
}: {
  lang: Lang
  state?: McpWindowState | null
}): React.JSX.Element | null {
  const resolved = resolveMcpWindowState(state)
  const requests = useMcpPermissionRequests(resolved)
  const store = resolved?.permissions ?? null

  // the activity line of a blocked call reads in the person's language
  useEffect(() => {
    resolved?.setBlockedStepLabel?.((server, tool) =>
      userMcpText(lang, 'blockedStep', { server, tool }),
    )
  }, [resolved, lang])

  useEffect(() => {
    if (!store) return
    mountedCards.set(store, (mountedCards.get(store) ?? 0) + 1)
    return () => {
      const left = (mountedCards.get(store) ?? 1) - 1
      mountedCards.set(store, left)
      // wait a tick: a card that is only being moved (or remounted) keeps its requests
      queueMicrotask(() => {
        if ((mountedCards.get(store) ?? 0) === 0) store.denyAll()
      })
    }
  }, [store])

  const request = requests[0]
  if (!store || !request) return null
  return (
    <McpPermissionPrompt
      key={request.id}
      lang={lang}
      request={request}
      onAnswer={(answer) => store.answer(request.id, answer)}
    />
  )
}
