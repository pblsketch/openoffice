import { useEffect, useRef, useState } from 'react'
import {
  MCP_PERMISSIONS,
  toolDisplayOf,
  type McpPermission,
  type McpPlannedLaunchView,
  type McpRuntimeQuestion,
  type McpServerSettingsView,
  type McpSignInAnswer,
  type McpToolDefinition,
  type McpToolEntry,
  type McpToolNameView,
} from '../../../shared/mcp-servers-api'
import {
  FAIL_KEYS,
  PERMISSION_KEYS,
  RUNTIME_NAMES,
  STATUS_KEYS,
  TOOL_PROBLEM_KEYS,
  appAddedArgs,
  enabledToolCount,
  failureTextKey,
  formatBytes,
  launchEnvGroups,
  mcpServersApi,
  reviewCount,
  signInOutcome,
} from './mcp-model'
import { McpServerEditForm, type McpFormFocus } from './McpServerForm'
import type { McpText } from './McpServersCard'

/**
 * One registered server on the card: its status, the connection check,
 * sign-in, the command confirmation of a "my PC" server, the runtime
 * download question, the tool list with three-way permissions, the reviews
 * of changed tools and guide, and the switches (user MCP spec 4.5-4.9, 6.2).
 */

type Message = { tone: 'info' | 'error'; text: string }

interface ItemProps {
  s: McpText
  /** BCP-47 locale for sizes */
  locale: string
  server: McpServerSettingsView
  /** the other servers' names, for the edit form's suggestion */
  taken: string[]
  open: boolean
  /** an AI window asked for this server: bring it into view */
  requested: boolean
  /**
   * Just registered: run the connection check once by itself (B1). A server
   * that needs a browser sign-in stops at "sign in needed"; the browser opens
   * only when the person presses the button.
   */
  autoCheck?: boolean
  onAutoChecked?: () => void
  onOpen(open: boolean): void
  /** something changed: read the list again */
  onChanged(): void
}

export function McpServerItem({
  s,
  locale,
  server,
  taken,
  open,
  requested,
  autoCheck = false,
  onAutoChecked,
  onOpen,
  onChanged,
}: ItemProps) {
  const api = mcpServersApi()
  const [busy, setBusy] = useState<'test' | 'sign-in' | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [question, setQuestion] = useState<McpRuntimeQuestion | null>(null)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [editing, setEditing] = useState<{ focus: McpFormFocus } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)
  const autoChecked = useRef(false)
  const { id } = server

  // opening the tool list is what clears "n new tools" (6.2)
  const newCount = server.newTools.length
  useEffect(() => {
    if (open && newCount > 0) void mcpServersApi()?.markToolsSeen(id)
  }, [open, newCount, id])

  useEffect(() => {
    if (requested) rowRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [requested])

  // a server just registered is checked at once, so it never reads "connected" unchecked;
  // a "my PC" server is checked after "allow to run" (before that it would only be refused)
  const runTestRef = useRef<(() => Promise<void>) | null>(null)
  const needsLaunchApproval = server.kind === 'local' && server.launchReviewNeeded
  useEffect(() => {
    if (!autoCheck || autoChecked.current) return
    autoChecked.current = true
    onAutoChecked?.()
    if (!needsLaunchApproval) void runTestRef.current?.()
  }, [autoCheck, onAutoChecked, needsLaunchApproval])

  if (!api) return null

  const status = server.status
  const toolEntries = Object.entries(server.tools)
  const toReview = reviewCount(server)
  const remote = server.kind === 'remote'

  /** run an action, then read the list again (the main process also tells, later) */
  const apply = async (work: Promise<unknown>) => {
    await work.catch(() => undefined)
    onChanged()
  }

  const runTest = async () => {
    setBusy('test')
    setMessage(null)
    setQuestion(null)
    try {
      const result = await api.test(id)
      if (result.ok) {
        setNeedsLogin(false)
        setMessage({ tone: 'info', text: s('testOk', { n: result.toolCount }) })
        return
      }
      switch (result.problem) {
        case 'disabled':
          setMessage({ tone: 'error', text: s('testDisabled') })
          break
        case 'launch-not-approved':
          setMessage({ tone: 'error', text: s('testApproval') })
          break
        case 'login-required':
          setNeedsLogin(true)
          setMessage({ tone: 'error', text: s('testLogin') })
          break
        case 'runtime-download':
          setQuestion(result.question)
          break
        case 'failed':
          // the server's status block says why, once, with "Details" and "Try again"
          setMessage(null)
          break
        default:
          setMessage({ tone: 'error', text: s('saveFailed') })
      }
    } catch {
      setMessage({ tone: 'error', text: s('saveFailed') })
    } finally {
      setBusy(null)
      onChanged()
    }
  }

  runTestRef.current = runTest

  const signIn = async () => {
    setBusy('sign-in')
    setMessage(null)
    let answer: McpSignInAnswer
    try {
      answer = await api.signIn(id)
    } catch {
      answer = { ok: false as const, reason: 'network' as const }
    } finally {
      setBusy(null)
    }
    const outcome = signInOutcome(answer)
    setMessage({ tone: answer.ok ? 'info' : 'error', text: s(outcome.key) })
    if (outcome.open) setEditing({ focus: outcome.open })
    if (answer.ok) {
      setNeedsLogin(false)
      await runTest()
    } else {
      onChanged()
    }
  }

  const downloadRuntime = async () => {
    setMessage(null)
    const answer = await api.answerRuntimeDownload(id, true).catch(() => null)
    setQuestion(null)
    if (answer?.ok && answer.launch.ok) {
      setMessage({ tone: 'info', text: s('runtimeDone') })
      if (!server.launchReviewNeeded) await runTest()
      else onChanged()
      return
    }
    if (answer?.ok && !answer.launch.ok) {
      setMessage({ tone: 'error', text: answer.launch.text })
      setQuestion(answer.launch.question)
    } else {
      setMessage({ tone: 'error', text: s('failRuntimeMissing') })
    }
    onChanged()
  }

  const showSignIn = remote && (status.status === 'login-required' || needsLogin || !!server.oauth)
  const signInLabel =
    status.status === 'login-required' || server.oauth?.signedIn ? s('signInAgain') : s('signIn')
  const statusText = s(STATUS_KEYS[status.status])

  return (
    <li
      ref={rowRef}
      className="mcp-server"
      data-mcp-server={id}
      data-status={status.status}
      data-open={open ? 'true' : 'false'}
    >
      <div className="mcp-server-head">
        <div className="mcp-server-title">
          <div className="mcp-server-name-line">
            <span className="mcp-server-name">{server.name}</span>
            <span className="mcp-tag">{s(remote ? 'kindRemote' : 'kindLocal')}</span>
          </div>
          <div className="mcp-server-meta">
            <span className="mcp-status">{statusText}</span>
            {toolEntries.length > 0 && (
              <span>{s('toolsOn', { on: enabledToolCount(server), all: toolEntries.length })}</span>
            )}
            {newCount > 0 && <span className="mcp-badge">{s('newTools', { n: newCount })}</span>}
            {toReview > 0 && <span className="mcp-badge">{s('toReview', { n: toReview })}</span>}
          </div>
        </div>
        <label className="mcp-check">
          <input
            type="checkbox"
            name="enabled"
            checked={server.enabled}
            onChange={(e) => void apply(api.setEnabled(id, e.target.checked))}
          />
          <span>{s('enabled')}</span>
        </label>
        <button type="button" className="set-btn" onClick={() => onOpen(!open)}>
          {open ? s('hide') : s('show')}
        </button>
      </div>

      {open && (
        <div className="mcp-server-body">
          <div className="mcp-where">
            <span className="set-field-label">{s(remote ? 'address' : 'command')}</span>
            <code className="mcp-code">
              {remote ? server.url : [server.command, ...server.args].join(' ')}
            </code>
          </div>
          {server.secretsMemoryOnly && (
            <div className="set-field-desc mcp-note">{s('memoryOnly')}</div>
          )}

          {status.status === 'failed' && (
            <div className="mcp-block" data-testid="mcp-failure">
              <div className="mcp-error">
                {server.failure?.text ?? s(failureTextKey(server) ?? FAIL_KEYS[status.reason])}
              </div>
              {server.failure && (
                <details className="set-intg-details" data-testid="mcp-stderr">
                  <summary>{s('details')}</summary>
                  <pre className="mcp-pre">
                    {server.failure.stderrTail.length > 0
                      ? server.failure.stderrTail.join('\n')
                      : s('stderrNone')}
                  </pre>
                </details>
              )}
              <div className="mcp-actions">
                <button type="button" className="set-btn" onClick={() => void apply(api.retry(id))}>
                  {s('retry')}
                </button>
              </div>
            </div>
          )}

          {!remote && server.launchReviewNeeded && (
            <LaunchReview
              s={s}
              locale={locale}
              server={server}
              onApprove={async (planFingerprint) => {
                const answer = await api.approveLaunch(id, planFingerprint).catch(() => null)
                // the command to run is no longer the one shown: show it again, approve nothing
                if (answer && !answer.ok && answer.problem === 'launch-changed') {
                  onChanged()
                  return 'changed'
                }
                await runTest()
                return 'done'
              }}
            />
          )}

          {question && (
            <RuntimeQuestion
              s={s}
              locale={locale}
              question={question}
              onDownload={downloadRuntime}
              onDecline={() => setQuestion(null)}
            />
          )}

          {busy === 'sign-in' ? (
            <div className="mcp-actions">
              <span className="set-field-desc">{s('signingIn')}</span>
              <button type="button" className="set-btn" onClick={() => void api.cancelSignIn(id)}>
                {s('cancel')}
              </button>
            </div>
          ) : (
            message && (
              <div
                className={`set-field-desc ${message.tone === 'error' ? 'mcp-error' : 'mcp-ok'}`}
                role="status"
              >
                {message.text}
              </div>
            )
          )}

          <div className="mcp-actions">
            <button
              type="button"
              className="set-btn primary"
              disabled={busy !== null || !server.enabled}
              onClick={() => void runTest()}
            >
              {busy === 'test' ? s('testing') : s('test')}
            </button>
            {showSignIn && (
              <button
                type="button"
                className="set-btn"
                disabled={busy !== null}
                onClick={() => void signIn()}
              >
                {signInLabel}
              </button>
            )}
            <button
              type="button"
              className="set-btn"
              onClick={() => setEditing(editing ? null : { focus: null })}
            >
              {s('edit')}
            </button>
            <button type="button" className="set-btn danger" onClick={() => setConfirmRemove(true)}>
              {s('remove')}
            </button>
          </div>

          {confirmRemove && (
            <div className="set-intg-confirm" data-testid="mcp-remove-confirm">
              <div className="set-field-desc">{s('removeConfirm', { name: server.name })}</div>
              <div className="mcp-actions">
                <button type="button" className="set-btn" onClick={() => setConfirmRemove(false)}>
                  {s('cancel')}
                </button>
                <button
                  type="button"
                  className="set-btn danger"
                  onClick={() => {
                    setConfirmRemove(false)
                    void apply(api.remove(id))
                  }}
                >
                  {s('remove')}
                </button>
              </div>
            </div>
          )}

          {editing && (
            <McpServerEditForm
              key={editing.focus ?? 'edit'}
              s={s}
              taken={taken}
              server={server}
              focus={editing.focus}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null)
                onChanged()
              }}
            />
          )}

          <div className="mcp-block">
            <label className="mcp-check">
              <input
                type="checkbox"
                name="keep-inside"
                checked={server.keepResultsInside}
                onChange={(e) => void apply(api.setKeepResultsInside(id, e.target.checked))}
              />
              <span>
                <span className="set-field-label">{s('keepInside')}</span>
                <span className="set-field-desc mcp-block-desc">{s('keepInsideDesc')}</span>
              </span>
            </label>
            {!server.keepResultsInside && (
              <div className="set-field-desc mcp-error">{s('keepInsideOffWarn')}</div>
            )}
          </div>

          {server.pendingInstructions !== null ? (
            <div className="mcp-block mcp-review" data-testid="mcp-instructions-review">
              <div className="mcp-block-title">{s('instrShow')}</div>
              <div className="set-field-desc">{s('instrChanged')}</div>
              <Compare
                s={s}
                before={server.instructions?.text || s('instrNone')}
                after={server.pendingInstructions || s('instrNone')}
              />
              <div className="mcp-actions">
                <button
                  type="button"
                  className="set-btn primary"
                  onClick={() => void apply(api.approveInstructions(id))}
                >
                  {s('approve')}
                </button>
              </div>
            </div>
          ) : (
            server.instructions?.text && (
              <details className="set-intg-details">
                <summary>{s('instrShow')}</summary>
                <pre className="mcp-pre">{server.instructions.text}</pre>
              </details>
            )
          )}

          <div className="mcp-tools-part">
            <div className="mcp-block-title">{s('toolsTitle')}</div>
            {toolEntries.length === 0 ? (
              <div className="set-field-desc">{s('toolsNone')}</div>
            ) : (
              <ul className="mcp-tools">
                {toolEntries.map(([name, tool]) => (
                  <ToolRow
                    key={name}
                    s={s}
                    name={name}
                    tool={tool}
                    names={server.toolNames[name]}
                    onPermission={(permission) =>
                      void apply(api.setToolPermission(id, name, permission))
                    }
                    onApprove={() => void apply(api.approveTool(id, name))}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

// ---- the command confirmation (4.5) ---------------------------------------------

function LaunchReview({
  s,
  locale,
  server,
  onApprove,
}: {
  s: McpText
  locale: string
  server: McpServerSettingsView
  /** approve the plan of this fingerprint; `changed` when it is no longer what would run */
  onApprove(planFingerprint: string): Promise<'done' | 'changed'>
}) {
  const [launch, setLaunch] = useState<McpPlannedLaunchView | null>(null)
  const [busy, setBusy] = useState(false)
  /** the last "allow" came too late: the plan changed and is shown again */
  const [changed, setChanged] = useState(false)
  /** bumped to read the plan again */
  const [reload, setReload] = useState(0)
  const id = server.id
  // the plan follows what the person approves: the command, the arguments, the variable names
  const shape = JSON.stringify([server.command, server.args, Object.keys(server.env)])

  useEffect(() => {
    let alive = true
    void mcpServersApi()
      ?.plannedLaunch(id)
      .then(
        (answer) => {
          if (alive) setLaunch(answer.ok ? answer.launch : null)
        },
        () => {},
      )
    return () => {
      alive = false
    }
  }, [id, shape, reload])

  if (!launch) return null
  const changedNote = changed ? (
    <div className="set-field-desc mcp-error" role="status">
      {s('launchRecheck')}
    </div>
  ) : null
  // a server that ran before has an approved list or guide: its command changed
  const ranBefore = Object.keys(server.tools).length > 0 || server.instructions !== null

  if (!launch.ok) {
    return (
      <div className="mcp-block" data-testid="mcp-launch">
        <div className="mcp-block-title">{s('launchTitle')}</div>
        {changedNote}
        <div className="mcp-error">{launch.text}</div>
        {launch.question && (
          <RuntimeQuestion
            s={s}
            locale={locale}
            question={launch.question}
            onDecline={null}
            onDownload={async () => {
              const answer = await mcpServersApi()
                ?.answerRuntimeDownload(id, true)
                .catch(() => null)
              if (answer?.ok) setLaunch(answer.launch)
            }}
          />
        )}
      </div>
    )
  }

  const added = appAddedArgs(launch.args, launch.addedArgs, server.args)
  const envGroups = launchEnvGroups(launch.env)
  const originKey = {
    app: 'launchAdded',
    registered: 'launchRegistered',
    system: 'launchSystem',
  } as const
  return (
    <div className="mcp-block" data-testid="mcp-launch">
      <div className="mcp-block-title">{s('launchTitle')}</div>
      {changedNote}
      <div className="set-field-desc">{s(ranBefore ? 'launchChanged' : 'launchFirst')}</div>
      <div className="mcp-launch-row">
        <span className="set-field-label">{s('launchProgram')}</span>
        <code className="mcp-code">{launch.command}</code>
        <span className="set-field-desc">
          {s(launch.source === 'app' ? 'launchFromApp' : 'launchFromPc')}
        </span>
      </div>
      {launch.args.length > 0 && (
        <div className="mcp-launch-row">
          <span className="set-field-label">{s('launchArgs')}</span>
          <ol className="mcp-launch-list">
            {launch.args.map((arg, i) => (
              <li key={i} data-arg={i} data-added={added[i] ? 'true' : 'false'}>
                <code className="mcp-code">{arg}</code>
                {added[i] && <span className="mcp-tag">{s('launchAdded')}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {launch.env.length > 0 && (
        <div className="mcp-launch-row">
          <span className="set-field-label">{s('launchEnv')}</span>
          {envGroups.own.length > 0 && (
            <ul className="mcp-launch-list">
              {envGroups.own.map((variable) => (
                <li key={variable.name} data-env={variable.name} data-origin={variable.origin}>
                  <code className="mcp-code">{variable.name}</code>
                  <span className="mcp-tag">{s(originKey[variable.origin])}</span>
                </li>
              ))}
            </ul>
          )}
          {envGroups.system.length > 0 && (
            <details className="set-intg-details" data-testid="mcp-launch-system-env">
              <summary>{s('launchSystemFold', { n: envGroups.system.length })}</summary>
              <ul className="mcp-launch-list">
                {envGroups.system.map((variable) => (
                  <li key={variable.name} data-env={variable.name} data-origin={variable.origin}>
                    <code className="mcp-code">{variable.name}</code>
                    <span className="mcp-tag">{s(originKey[variable.origin])}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {launch.droppedEnv.length > 0 && (
        <div className="set-field-desc">
          {s('launchDropped', { names: launch.droppedEnv.join(', ') })}
        </div>
      )}
      <div className="mcp-actions">
        <button
          type="button"
          className="set-btn primary"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setChanged(false)
            void onApprove(launch.fingerprint)
              .then((answer) => {
                if (answer !== 'changed') return
                setChanged(true)
                setReload((n) => n + 1)
              })
              .finally(() => setBusy(false))
          }}
        >
          {s('launchAllow')}
        </button>
      </div>
    </div>
  )
}

// ---- the runtime download question (5.4) ----------------------------------------

function RuntimeQuestion({
  s,
  locale,
  question,
  onDownload,
  onDecline,
}: {
  s: McpText
  locale: string
  question: McpRuntimeQuestion
  onDownload(): Promise<void>
  onDecline: (() => void) | null
}) {
  const [downloading, setDownloading] = useState(false)
  return (
    <div className="mcp-block" data-testid="mcp-runtime">
      <div>
        {s('runtimeAsk', {
          runtime: RUNTIME_NAMES[question.runtime],
          size: formatBytes(question.totalBytes, locale),
        })}
      </div>
      <ul className="mcp-launch-list">
        {question.downloads.map((item) => (
          <li key={item.runtime} className="set-field-desc">
            {s('runtimeItem', {
              runtime: RUNTIME_NAMES[item.runtime],
              version: item.version,
              size: formatBytes(item.bytes, locale),
            })}
          </li>
        ))}
      </ul>
      <div className="set-field-desc">{s('runtimeWhere')}</div>
      <div className="mcp-actions">
        {onDecline && (
          <button type="button" className="set-btn" disabled={downloading} onClick={onDecline}>
            {s('runtimeNo')}
          </button>
        )}
        <button
          type="button"
          className="set-btn primary"
          disabled={downloading}
          onClick={() => {
            setDownloading(true)
            void onDownload().finally(() => setDownloading(false))
          }}
        >
          {downloading ? s('runtimeDownloading') : s('runtimeDownload')}
        </button>
      </div>
    </div>
  )
}

// ---- one tool (4.6, 6.2) ----------------------------------------------------------

function ToolRow({
  s,
  name,
  tool,
  names,
  onPermission,
  onApprove,
}: {
  s: McpText
  name: string
  tool: McpToolEntry
  names: McpToolNameView | undefined
  onPermission(permission: McpPermission): void
  onApprove(): void
}) {
  const display = toolDisplayOf(tool, names?.problem ?? null)
  const hints = tool.definition.annotations
  const frozen = display.display !== 'ok'
  return (
    <li className="mcp-tool" data-mcp-tool={name} data-display={display.display}>
      <div className="mcp-tool-head">
        <code className="mcp-tool-name">{names?.exposedName ?? name}</code>
        {hints?.readOnlyHint === true && <span className="mcp-tag">{s('toolReadOnly')}</span>}
        {hints?.destructiveHint === true && (
          <span className="mcp-tag mcp-tag-strong">{s('toolDestructive')}</span>
        )}
        {frozen ? (
          <span className="mcp-perm-inactive set-field-desc" data-testid="mcp-perm-inactive">
            {display.display === 'review'
              ? s('permPaused', { perm: s(PERMISSION_KEYS[tool.permission]) })
              : s('permUnusable')}
          </span>
        ) : (
          <div className="mcp-perm" role="group" aria-label={names?.exposedName ?? name}>
            {MCP_PERMISSIONS.map((permission) => (
              <button
                key={permission}
                type="button"
                data-perm={permission}
                aria-pressed={tool.permission === permission}
                onClick={() => {
                  if (tool.permission !== permission) onPermission(permission)
                }}
              >
                {s(PERMISSION_KEYS[permission])}
              </button>
            ))}
          </div>
        )}
      </div>
      {names?.changed && <div className="set-field-desc">{s('toolRenamed', { name })}</div>}
      {display.display === 'unusable' && (
        <div className="set-field-desc">{s(TOOL_PROBLEM_KEYS[display.reason])}</div>
      )}
      {display.display === 'review' && tool.pending ? (
        <div className="mcp-review">
          <div className="set-field-desc">{s('toolChanged')}</div>
          <ToolCompare s={s} before={tool.definition} after={tool.pending} />
          <div className="mcp-actions">
            <button type="button" className="set-btn primary" onClick={onApprove}>
              {s('approve')}
            </button>
          </div>
        </div>
      ) : (
        <details className="set-intg-details mcp-tool-desc">
          <summary>{s('toolDesc')}</summary>
          <pre className="mcp-pre">{tool.definition.description || s('toolNoDesc')}</pre>
        </details>
      )}
    </li>
  )
}

function ToolCompare({
  s,
  before,
  after,
}: {
  s: McpText
  before: McpToolDefinition
  after: McpToolDefinition
}) {
  const schema = (d: McpToolDefinition) => JSON.stringify(d.inputSchema, null, 2)
  return (
    <>
      <Compare
        s={s}
        before={before.description || s('toolNoDesc')}
        after={after.description || s('toolNoDesc')}
      />
      {schema(before) !== schema(after) && (
        <details className="set-intg-details" open>
          <summary>{s('toolInput')}</summary>
          <Compare s={s} before={schema(before)} after={schema(after)} />
        </details>
      )}
    </>
  )
}

function Compare({ s, before, after }: { s: McpText; before: string; after: string }) {
  return (
    <div className="mcp-compare">
      <div>
        <div className="set-field-label">{s('before')}</div>
        <pre className="mcp-pre">{before}</pre>
      </div>
      <div>
        <div className="set-field-label">{s('after')}</div>
        <pre className="mcp-pre">{after}</pre>
      </div>
    </div>
  )
}
