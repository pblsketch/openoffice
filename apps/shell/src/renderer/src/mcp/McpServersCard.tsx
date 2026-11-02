import { useCallback, useEffect, useRef, useState } from 'react'
import type { Params } from '@genoffice/i18n'
import type { McpServersSettingsView } from '../../../shared/mcp-servers-api'
import { mcpServersText, type McpServersStringKey } from '../i18n/strings-mcp-servers'
import { useI18n } from '../locale'
import { McpServerAddForm } from './McpServerForm'
import { McpServerItem } from './McpServerItem'
import { mcpServersApi } from './mcp-model'
import { subscribeMcpOpenServer } from './mcp-open-request'
import './mcp-servers.css'

export type McpText = (key: McpServersStringKey, params?: Params) => string

/**
 * Settings → Integrations: the person's own MCP servers (user MCP spec 4).
 * Lists the registered servers with their status, adds new ones by hand or
 * from a pasted settings text, and opens a server an AI window asked about
 * ("open in Settings"). Every change goes through `window.aiOfficeMcpServers`;
 * nothing shows without it.
 */
export function McpServersCard() {
  const { lang, dateLocale } = useI18n()
  const s: McpText = (key, params) => mcpServersText(lang, key, params)
  const api = mcpServersApi()
  const [view, setView] = useState<McpServersSettingsView | null>(null)
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set())
  /** the server an AI window asked for: scrolled into view once */
  const [requested, setRequested] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  /** servers just registered: each runs its connection check once */
  const [toCheck, setToCheck] = useState<ReadonlySet<string>>(() => new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const next = await mcpServersApi()?.list()
    if (next && alive.current) setView(next)
  }, [])

  useEffect(() => {
    alive.current = true
    void refresh()
    const off = mcpServersApi()?.onChanged((next) => {
      if (alive.current) setView(next)
    })
    return () => {
      alive.current = false
      off?.()
    }
  }, [refresh])

  const setOpen = useCallback((id: string, open: boolean) => {
    setOpenIds((prev) => {
      if (prev.has(id) === open) return prev
      const next = new Set(prev)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  useEffect(
    () =>
      subscribeMcpOpenServer((id) => {
        setOpen(id, true)
        setRequested(id)
      }),
    [setOpen],
  )

  if (!api) return null

  const servers = view?.servers ?? []
  const names = servers.map((server) => server.name)

  return (
    <section className="set-intg-part mcp-card" data-testid="mcp-servers">
      <h4 className="set-pane-subtitle">{s('title')}</h4>
      <div className="set-field-desc set-intg-who" data-testid="mcp-servers-who">
        {s('direction')}
      </div>
      <div className="set-field-desc set-intg-lead">{s('desc')}</div>
      {view && !view.sealing && <div className="mcp-note set-field-desc">{s('noSealing')}</div>}

      {view &&
        (servers.length === 0 ? (
          <div className="set-field-desc mcp-empty">{s('empty')}</div>
        ) : (
          <ul className="mcp-list">
            {servers.map((server) => (
              <McpServerItem
                key={server.id}
                s={s}
                locale={dateLocale}
                server={server}
                taken={names.filter((name) => name !== server.name)}
                open={openIds.has(server.id)}
                requested={requested === server.id}
                autoCheck={toCheck.has(server.id)}
                onAutoChecked={() =>
                  setToCheck((prev) => {
                    const next = new Set(prev)
                    next.delete(server.id)
                    return next
                  })
                }
                onOpen={(open) => setOpen(server.id, open)}
                onChanged={() => void refresh()}
              />
            ))}
          </ul>
        ))}

      {notice && (
        <div className="set-field-desc set-intg-notice" role="status">
          {notice}
        </div>
      )}
      {adding ? (
        <McpServerAddForm
          s={s}
          taken={names}
          onCancel={() => setAdding(false)}
          onAdded={(id, fromPaste) => {
            if (!fromPaste) setAdding(false)
            setOpen(id, true)
            setToCheck((prev) => new Set(prev).add(id))
            void refresh()
          }}
          onPasteDone={(count) => {
            setAdding(false)
            setNotice(count > 0 ? s('pasteDone', { n: count }) : null)
          }}
        />
      ) : (
        <div className="mcp-actions">
          <button
            type="button"
            className="set-btn"
            onClick={() => {
              setNotice(null)
              setAdding(true)
            }}
          >
            {s('add')}
          </button>
        </div>
      )}
    </section>
  )
}
