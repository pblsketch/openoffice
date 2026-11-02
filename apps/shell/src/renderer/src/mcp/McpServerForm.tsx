import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { serverNameProblem, suggestServerNameFrom } from '@genoffice/agent-core/user-mcp/names'
import {
  plainHttpReach,
  type McpPastedServerView,
  type McpSecretView,
  type McpServerInput,
  type McpServerKind,
  type McpServerPatch,
  type McpServerSettingsView,
  type McpSettingsResult,
  type McpTransport,
} from '../../../shared/mcp-servers-api'
import {
  NAME_PROBLEM_KEYS,
  isPlainHttp,
  mcpServersApi,
  secretPlaceholderKey,
  settingsProblemKey,
} from './mcp-model'
import type { McpText } from './McpServersCard'

/**
 * Adding or editing a server (user MCP spec 4.1-4.5). Two ways to add: the
 * fields, or a pasted settings text the main process reads; a text with
 * several servers shows one filled-in form after another. Secret values the
 * main process already holds (saved, or read from the paste) never come
 * back: their fields stay empty with "saved, ends in ab12" as placeholder,
 * and an empty field sends `null` (keep). What the person types lives only in
 * this form's state and goes with it.
 */

interface Row {
  name: string
  value: string
  /** the value the main process holds for this name, when there is one */
  held: McpSecretView | null
  /** the pasted value named this PC variable instead: ask for the value */
  fromVar: string | null
}

interface Fields {
  kind: McpServerKind
  name: string
  url: string
  transport: McpTransport
  key: string
  /** the held `Authorization` header, shown in the key field */
  keyHeld: McpSecretView | null
  headers: Row[]
  clientId: string
  clientSecret: string
  clientSecretHeld: McpSecretView | null
  command: string
  args: string
  env: Row[]
  allowPlainHttp: boolean
  /** a plain-http address the person confirmed before (editing); '' when none */
  confirmedUrl: string
}

const AUTHORIZATION = 'authorization'

const heldRows = (
  record: Record<string, McpSecretView>,
  vars: Record<string, string> = {},
): Row[] =>
  Object.entries(record).map(([name, held]) => ({
    name,
    value: '',
    held,
    fromVar: Object.entries(vars).find(([k]) => k === name)?.[1] ?? null,
  }))

function splitKey(record: Record<string, McpSecretView>): {
  keyHeld: McpSecretView | null
  rest: Record<string, McpSecretView>
} {
  const entry = Object.entries(record).find(([name]) => name.toLowerCase() === AUTHORIZATION)
  const rest = Object.fromEntries(
    Object.entries(record).filter(([name]) => name.toLowerCase() !== AUTHORIZATION),
  )
  return { keyHeld: entry?.[1] ?? null, rest }
}

const emptyFields = (): Fields => ({
  kind: 'remote',
  name: '',
  url: '',
  transport: 'auto',
  key: '',
  keyHeld: null,
  headers: [],
  clientId: '',
  clientSecret: '',
  clientSecretHeld: null,
  command: '',
  args: '',
  env: [],
  allowPlainHttp: false,
  confirmedUrl: '',
})

function pastedFields(server: McpPastedServerView): Fields {
  const { keyHeld, rest } = splitKey(server.headers)
  return {
    ...emptyFields(),
    kind: server.kind,
    name: server.name,
    url: server.url,
    transport: server.transport,
    keyHeld,
    headers: heldRows(rest, server.headerVars),
    command: server.command,
    args: server.args.join('\n'),
    env: heldRows(server.env, server.envVars),
  }
}

function serverFields(server: McpServerSettingsView): Fields {
  const { keyHeld, rest } = splitKey(server.headers)
  return {
    ...emptyFields(),
    kind: server.kind,
    name: server.name,
    url: server.url,
    transport: server.transport,
    keyHeld,
    headers: heldRows(rest),
    clientId: server.oauth?.clientId ?? '',
    clientSecretHeld:
      server.oauth && server.oauth.clientSecret.state !== 'missing'
        ? server.oauth.clientSecret
        : null,
    command: server.command,
    args: server.args.join('\n'),
    env: heldRows(server.env),
    // an address confirmed when it was registered stays confirmed while it is unchanged
    allowPlainHttp: isPlainHttp(server.url),
    confirmedUrl: isPlainHttp(server.url) ? server.url : '',
  }
}

/** Rows as the main process takes them: a held value left empty is `null` (keep it) */
function rowsRecord(rows: Row[]): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    out[name] = row.value === '' && row.held ? null : row.value
  }
  return out
}

function headersRecord(f: Fields): Record<string, string | null> {
  const headers = rowsRecord(f.headers)
  // the key field shows the held Authorization header: left empty, it is kept
  if (f.keyHeld && f.key.trim() === '') headers.Authorization = null
  return headers
}

const argLines = (text: string) => text.split(/\r?\n/).filter((line) => line.trim() !== '')

// ---- the form ------------------------------------------------------------------

export type McpFormFocus = 'key' | 'advanced' | null

interface FormProps {
  s: McpText
  /** names of the other registered servers, for the suggestion */
  taken: string[]
  onCancel(): void
}

/** Adding: the two ways, and the pasted servers one after another */
export function McpServerAddForm({
  s,
  taken,
  onCancel,
  onAdded,
  onPasteDone,
}: FormProps & {
  onAdded(id: string, fromPaste: boolean): void
  onPasteDone(count: number): void
}) {
  const [way, setWay] = useState<'direct' | 'paste'>('direct')
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [pasted, setPasted] = useState<{
    token: string
    servers: McpPastedServerView[]
    ignored: string[]
    index: number
    added: number
  } | null>(null)
  const [reading, setReading] = useState(false)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (way === 'paste' && !pasted) pasteRef.current?.focus()
  }, [way, pasted])

  const read = async () => {
    const api = mcpServersApi()
    if (!api || reading) return
    const text = pasteText
    setPasteError(null)
    setReading(true)
    try {
      const view = await api.parsePaste(text)
      if (!view.ok) {
        // the text stays for the person to fix
        setPasteError(
          view.error === 'empty'
            ? s('pasteEmpty')
            : view.error === 'no-servers'
              ? s('pasteNoServers')
              : view.line !== undefined
                ? s('pasteUnreadableLine', { line: view.line })
                : s('pasteUnreadable'),
        )
        return
      }
      // the text may hold keys: it leaves the form once it has been read
      setPasteText('')
      setPasted({
        token: view.token,
        servers: view.servers,
        ignored: view.ignored,
        index: 0,
        added: 0,
      })
    } catch {
      setPasteError(s('pasteUnreadable'))
    } finally {
      setReading(false)
    }
  }

  const next = (added: boolean) => {
    if (!pasted) return
    const count = pasted.added + (added ? 1 : 0)
    if (pasted.index + 1 >= pasted.servers.length) {
      onPasteDone(count)
      return
    }
    setPasted({ ...pasted, index: pasted.index + 1, added: count })
  }

  const submitAdd = async (input: McpServerInput) => {
    const api = mcpServersApi()
    if (!api) return { ok: false as const, problem: 'failed' as const }
    const result = await api.add(input)
    if (result.ok) onAdded(result.id, input.paste !== undefined)
    return result
  }

  if (pasted) {
    const server = pasted.servers[pasted.index]!
    const ignored = [...pasted.ignored, ...(server.typeIgnored ? ['type'] : []), ...server.ignored]
    return (
      <div className="mcp-form" data-testid="mcp-form">
        <div className="mcp-form-title">{s('formAdd')}</div>
        <ServerFields
          key={pasted.index}
          s={s}
          mode="add"
          initial={pastedFields(server)}
          kindFixed
          taken={taken}
          focus={null}
          top={
            <>
              <div className="mcp-step">
                {s('pasteStep', { i: pasted.index + 1, n: pasted.servers.length })}
              </div>
              {server.nameChanged && (
                <div className="set-field-desc mcp-note">
                  {s('namePasteChanged', { pasted: server.pastedName, name: server.name })}{' '}
                  {s('nameSkillNote')}
                </div>
              )}
              {ignored.length > 0 && (
                <div className="set-field-desc" data-testid="mcp-paste-ignored">
                  {s('pasteIgnored', { items: ignored.join(', ') })}
                  {server.typeIgnored && (
                    <> {s('pasteTypeIgnored', { type: server.typeIgnored })}</>
                  )}
                </div>
              )}
              {server.problem && (
                <div className="set-field-desc mcp-error">
                  {s(server.problem === 'no-target' ? 'pasteNoTarget' : 'pasteUnsupported')}
                </div>
              )}
            </>
          }
          keyHint={server.keyNeeded ? s('keyFromVar', { name: server.keyEnvVar ?? '' }) : null}
          blocked={server.problem !== null}
          submitLabel={s('register')}
          onSubmit={async (f) => {
            const result = await submitAdd({
              ...addInput(f),
              paste: { token: pasted.token, index: pasted.index },
            })
            if (result.ok) next(true)
            return result
          }}
          onSkip={() => next(false)}
          onCancel={onCancel}
        />
      </div>
    )
  }

  return (
    <div className="mcp-form" data-testid="mcp-form">
      <div className="mcp-form-title">{s('formAdd')}</div>
      <div className="mcp-tabs" role="tablist">
        {(['direct', 'paste'] as const).map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={way === w}
            className="mcp-tab"
            onClick={() => setWay(w)}
          >
            {s(w === 'direct' ? 'wayDirect' : 'wayPaste')}
          </button>
        ))}
      </div>
      {way === 'paste' ? (
        <div className="mcp-form-body">
          <label className="mcp-form-row">
            <span className="set-field-label">{s('pasteLabel')}</span>
            <span className="set-field-desc">{s('pasteHint')}</span>
            <textarea
              ref={pasteRef}
              name="paste"
              className="mcp-input mcp-paste"
              rows={8}
              spellCheck={false}
              autoComplete="off"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
          </label>
          {pasteError && <div className="set-field-desc mcp-error">{pasteError}</div>}
          <div className="mcp-actions">
            <button type="button" className="set-btn" onClick={onCancel}>
              {s('cancel')}
            </button>
            <button
              type="button"
              className="set-btn primary"
              disabled={reading}
              onClick={() => void read()}
            >
              {s('pasteRead')}
            </button>
          </div>
        </div>
      ) : (
        <ServerFields
          s={s}
          mode="add"
          initial={emptyFields()}
          kindFixed={false}
          taken={taken}
          focus={null}
          top={null}
          keyHint={s('keyHint')}
          blocked={false}
          submitLabel={s('register')}
          onSubmit={(f) => submitAdd(addInput(f))}
          onCancel={onCancel}
        />
      )}
    </div>
  )
}

/** Editing a registered server; the kind cannot change */
export function McpServerEditForm({
  s,
  taken,
  onCancel,
  server,
  focus,
  onSaved,
}: FormProps & { server: McpServerSettingsView; focus: McpFormFocus; onSaved(): void }) {
  return (
    <div className="mcp-form" data-testid="mcp-form">
      <div className="mcp-form-title">{s('formEdit', { name: server.name })}</div>
      <ServerFields
        s={s}
        mode="edit"
        initial={serverFields(server)}
        kindFixed
        taken={taken}
        focus={focus}
        top={null}
        keyHint={null}
        blocked={false}
        submitLabel={s('save')}
        onSubmit={async (f) => {
          const api = mcpServersApi()
          if (!api) return { ok: false as const, problem: 'failed' as const }
          const result = await api.edit(server.id, editPatch(f, server))
          if (result.ok) onSaved()
          return result
        }}
        onCancel={onCancel}
      />
    </div>
  )
}

function addInput(f: Fields): McpServerInput {
  const name = f.name.trim()
  if (f.kind === 'local') {
    return {
      name,
      kind: 'local',
      command: f.command.trim(),
      args: argLines(f.args),
      env: rowsRecord(f.env),
    }
  }
  const input: McpServerInput = {
    name,
    kind: 'remote',
    url: f.url.trim(),
    transport: f.transport,
    headers: headersRecord(f),
  }
  if (f.key.trim()) input.key = f.key.trim()
  if (f.clientId.trim()) {
    input.oauthClient = { clientId: f.clientId.trim(), clientSecret: f.clientSecret || null }
  }
  if (isPlainHttp(f.url)) input.allowPlainHttp = f.allowPlainHttp
  return input
}

function editPatch(f: Fields, server: McpServerSettingsView): McpServerPatch {
  const patch: McpServerPatch = { name: f.name.trim() }
  if (server.kind === 'local') {
    patch.command = f.command.trim()
    patch.args = argLines(f.args)
    patch.env = rowsRecord(f.env)
    return patch
  }
  patch.url = f.url.trim()
  patch.headers = headersRecord(f)
  if (f.key.trim()) patch.key = f.key.trim()
  const clientId = f.clientId.trim()
  const before = server.oauth?.clientId ?? ''
  if (clientId !== before || f.clientSecret) {
    patch.oauthClient = clientId ? { clientId, clientSecret: f.clientSecret || null } : null
  }
  if (isPlainHttp(f.url)) patch.allowPlainHttp = f.allowPlainHttp
  return patch
}

// ---- the fields of one server -----------------------------------------------------

interface FieldsProps {
  s: McpText
  mode: 'add' | 'edit'
  initial: Fields
  kindFixed: boolean
  taken: string[]
  focus: McpFormFocus
  /** what goes above the fields: the paste step, the renamed name, ignored items */
  top: ReactNode
  keyHint: string | null
  /** the server cannot be added as it is (a pasted one without target) */
  blocked: boolean
  submitLabel: string
  onSubmit(fields: Fields): Promise<McpSettingsResult | McpSettingsResult<{ id: string }>>
  onSkip?: () => void
  onCancel(): void
}

function ServerFields({
  s,
  mode,
  initial,
  kindFixed,
  taken,
  focus,
  top,
  keyHint,
  blocked,
  submitLabel,
  onSubmit,
  onSkip,
  onCancel,
}: FieldsProps) {
  const [f, setF] = useState<Fields>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(
    focus === 'advanced' || initial.headers.length > 0 || initial.clientId !== '',
  )
  const keyRef = useRef<HTMLInputElement>(null)
  const clientRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  // the form opens on its first field, or on the field a sign-in answer asked for
  useEffect(() => {
    if (focus === 'key') keyRef.current?.focus()
    else if (focus === 'advanced') clientRef.current?.focus()
    else nameRef.current?.focus()
  }, [focus])

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) =>
    setF((prev) => ({ ...prev, [key]: value }))

  const name = f.name.trim()
  const nameTaken = taken.some((t) => t.toLowerCase() === name.toLowerCase())
  const nameProblem = name === '' ? null : serverNameProblem(name)
  const local = f.kind === 'local'
  const suggestion =
    nameProblem || nameTaken
      ? suggestServerNameFrom(
          name,
          taken,
          local ? { command: f.command, args: argLines(f.args) } : { url: f.url },
        )
      : null
  const plain = !local && isPlainHttp(f.url)
  // an internet address by number is refused right here: plain http is never allowed there
  const publicHttp = plain && plainHttpReach(f.url) === 'public'
  // editing: an address confirmed before needs no new confirmation until it changes
  const urlChanged = f.confirmedUrl !== '' && f.url.trim() !== f.confirmedUrl.trim()
  const missingTarget = local ? f.command.trim() === '' : f.url.trim() === ''
  const canSubmit =
    !busy &&
    !blocked &&
    name !== '' &&
    !nameProblem &&
    !nameTaken &&
    !missingTarget &&
    !publicHttp &&
    (!plain || f.allowPlainHttp)

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const result = await onSubmit(f)
      if (!result.ok) setError(s(settingsProblemKey(result.problem, result.detail)))
    } catch {
      setError(s('saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  const anyHeld =
    f.keyHeld !== null ||
    f.clientSecretHeld !== null ||
    [...f.headers, ...f.env].some((row) => row.held !== null)
  const from = mode === 'add' ? 'pasted' : 'saved'
  const placeholder = (held: McpSecretView | null) => {
    if (!held) return ''
    const view = secretPlaceholderKey(held, from)
    return s(view.key, { last4: view.last4 })
  }

  /** Enter in a one-line field registers (or saves) once the form is complete */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    const target = e.target as HTMLElement
    if (target.tagName !== 'INPUT') return
    const type = (target as HTMLInputElement).type
    if (type === 'checkbox' || type === 'radio') return
    e.preventDefault()
    void submit()
  }

  const rows = (
    list: 'headers' | 'env',
    nameLabel: string,
    addLabel: string,
    prefix: 'header' | 'env',
  ) => (
    <div className="mcp-rows">
      {f[list].map((row, i) => (
        <div className="mcp-pair-wrap" key={i}>
          <div className="mcp-pair">
            <input
              name={`${prefix}-name-${i}`}
              className="mcp-input"
              aria-label={nameLabel}
              placeholder={nameLabel}
              spellCheck={false}
              value={row.name}
              onChange={(e) =>
                set(
                  list,
                  f[list].map((r, j) =>
                    j === i ? { ...r, name: e.target.value, held: null, fromVar: null } : r,
                  ),
                )
              }
            />
            <input
              name={`${prefix}-value-${i}`}
              className="mcp-input"
              type="password"
              autoComplete="off"
              aria-label={s('value')}
              placeholder={(row.fromVar ? '' : placeholder(row.held)) || s('value')}
              value={row.value}
              onChange={(e) =>
                set(
                  list,
                  f[list].map((r, j) => (j === i ? { ...r, value: e.target.value } : r)),
                )
              }
            />
            <button
              type="button"
              className="set-btn"
              onClick={() =>
                set(
                  list,
                  f[list].filter((_, j) => j !== i),
                )
              }
            >
              {s('removeRow')}
            </button>
          </div>
          {row.fromVar && row.value === '' && (
            <div className="set-field-desc mcp-note" data-testid="mcp-value-from-var">
              {s('valueFromVar', { name: row.fromVar })}
            </div>
          )}
        </div>
      ))}
      <div>
        <button
          type="button"
          className="set-btn"
          onClick={() =>
            set(list, [...f[list], { name: '', value: '', held: null, fromVar: null }])
          }
        >
          {addLabel}
        </button>
      </div>
    </div>
  )

  return (
    <div className="mcp-form-body" onKeyDown={onKeyDown}>
      {top}
      {!kindFixed && (
        <div className="mcp-form-row" role="radiogroup" aria-label={s('kind')}>
          <span className="set-field-label">{s('kind')}</span>
          <div className="mcp-kinds">
            {(['remote', 'local'] as const).map((kind) => (
              <label key={kind} className="mcp-check">
                <input
                  type="radio"
                  name="kind"
                  value={kind}
                  checked={f.kind === kind}
                  onChange={() => set('kind', kind)}
                />
                <span>{s(kind === 'remote' ? 'kindRemote' : 'kindLocal')}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="mcp-form-row">
        <span className="set-field-label">{s('name')}</span>
        <span className="set-field-desc">{s('nameHint')}</span>
        <input
          ref={nameRef}
          name="name"
          className="mcp-input"
          spellCheck={false}
          value={f.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </label>
      {(nameProblem || nameTaken) && (
        <div className="mcp-name-fix">
          <div className="set-field-desc mcp-error">
            {s(nameTaken ? 'nameTaken' : NAME_PROBLEM_KEYS[nameProblem!])}
          </div>
          {suggestion && (
            <div className="mcp-actions">
              <span className="set-field-desc">{s('nameSuggest', { name: suggestion })}</span>
              <button type="button" className="set-btn" onClick={() => set('name', suggestion)}>
                {s('nameUse')}
              </button>
            </div>
          )}
          <div className="set-field-desc">{s('nameSkillNote')}</div>
        </div>
      )}

      {local ? (
        <>
          <label className="mcp-form-row">
            <span className="set-field-label">{s('command')}</span>
            <input
              name="command"
              className="mcp-input mcp-code"
              spellCheck={false}
              placeholder="npx"
              value={f.command}
              onChange={(e) => set('command', e.target.value)}
            />
          </label>
          <label className="mcp-form-row">
            <span className="set-field-label">{s('args')}</span>
            <textarea
              name="args"
              className="mcp-input mcp-code"
              rows={3}
              spellCheck={false}
              value={f.args}
              onChange={(e) => set('args', e.target.value)}
            />
          </label>
          <div className="mcp-form-row">
            <span className="set-field-label">{s('env')}</span>
            {rows('env', s('envName'), s('addEnv'), 'env')}
          </div>
        </>
      ) : (
        <>
          <label className="mcp-form-row">
            <span className="set-field-label">{s('url')}</span>
            <input
              name="url"
              className="mcp-input"
              spellCheck={false}
              placeholder="https://"
              value={f.url}
              onChange={(e) => {
                const url = e.target.value
                set('url', url)
                // back to the address confirmed before: that confirmation still holds
                set('allowPlainHttp', f.confirmedUrl !== '' && url.trim() === f.confirmedUrl.trim())
              }}
            />
          </label>
          {publicHttp && (
            <div className="set-field-desc mcp-error" data-testid="mcp-public-http">
              {s('addrPublicHttp')}
            </div>
          )}
          {plain && !publicHttp && (
            <div className="mcp-warn-box">
              {urlChanged && <div data-testid="mcp-http-recheck">{s('httpRecheck')}</div>}
              <div>{s('httpWarn')}</div>
              <label className="mcp-check">
                <input
                  type="checkbox"
                  name="allow-plain-http"
                  checked={f.allowPlainHttp}
                  onChange={(e) => set('allowPlainHttp', e.target.checked)}
                />
                <span>{s('httpConfirm')}</span>
              </label>
            </div>
          )}
          <label className="mcp-form-row">
            <span className="set-field-label">{s('key')}</span>
            {keyHint && <span className="set-field-desc">{keyHint}</span>}
            <input
              ref={keyRef}
              name="key"
              className="mcp-input"
              type="password"
              autoComplete="off"
              placeholder={placeholder(f.keyHeld)}
              value={f.key}
              onChange={(e) => set('key', e.target.value)}
            />
          </label>
          <details
            className="set-intg-details mcp-advanced"
            data-testid="mcp-advanced"
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
          >
            <summary>{s('advanced')}</summary>
            <div className="mcp-form-row">
              <span className="set-field-label">{s('headers')}</span>
              {rows('headers', s('headerName'), s('addHeader'), 'header')}
            </div>
            <label className="mcp-form-row">
              <span className="set-field-label">{s('clientId')}</span>
              <span className="set-field-desc">{s('clientHint')}</span>
              <input
                ref={clientRef}
                name="client-id"
                className="mcp-input"
                spellCheck={false}
                value={f.clientId}
                onChange={(e) => set('clientId', e.target.value)}
              />
            </label>
            <label className="mcp-form-row">
              <span className="set-field-label">{s('clientSecret')}</span>
              <input
                name="client-secret"
                className="mcp-input"
                type="password"
                autoComplete="off"
                placeholder={placeholder(f.clientSecretHeld)}
                value={f.clientSecret}
                onChange={(e) => set('clientSecret', e.target.value)}
              />
            </label>
          </details>
        </>
      )}
      {anyHeld && <div className="set-field-desc">{s('secretKeep')}</div>}

      <div className="mcp-notice" data-testid="mcp-notice">
        <ul>
          <li>{s('noticeSend')}</li>
          <li>{s('noticeReturn')}</li>
          {local && <li>{s('noticeLocal')}</li>}
        </ul>
      </div>
      {error && <div className="set-field-desc mcp-error">{error}</div>}
      <div className="mcp-actions">
        <button type="button" className="set-btn" onClick={onCancel}>
          {s('cancel')}
        </button>
        {onSkip && (
          <button type="button" className="set-btn" disabled={busy} onClick={onSkip}>
            {s('skip')}
          </button>
        )}
        <button
          type="button"
          className="set-btn primary"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
