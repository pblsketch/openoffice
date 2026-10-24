import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from '@genoffice/i18n'
import type {
  UserSkillImportPreview,
  UserSkillInvokeValue,
  UserSkillView,
  UserSkillsFailReason,
} from '@genoffice/electron-utils/user-skills-channels'
import { useI18n } from '../locale'
import { skillsText, type SkillsStringKey } from '../i18n/strings-skills'
import { MenuButton } from './SkillDialog'
import { SkillEditor, type SkillEditorMode } from './SkillEditor'
import { GitHubImportDialog, SkillImportPreviewDialog, type SkillsNotice } from './SkillImport'
import { SkillUpdateDialog, type ChangedUpdate } from './SkillUpdate'
import {
  actionLabelKey,
  failureKey,
  groupLabelKey,
  groupSkills,
  hiddenBuiltinCount,
  listedCount,
  skillDisplayDesc,
  skillDisplayTitle,
  skillMenuActions,
  sourceLabel,
  unreadableKey,
  userSkillsApi,
  type SkillMenuAction,
} from './skills-model'
import './skills.css'

/** The help topic the intro links to (written with the in-app manual) */
export const SKILLS_HELP_TOPIC = 'skills'

type Text = (key: SkillsStringKey, params?: Record<string, string | number>) => string

type Dialog =
  | { kind: 'editor'; mode: SkillEditorMode; view?: UserSkillView }
  | { kind: 'github' }
  | { kind: 'preview'; preview: UserSkillImportPreview }
  | { kind: 'update'; view: UserSkillView; check: ChangedUpdate }

/** a question asked under a row before a change goes through */
type RowConfirm = { id: string; kind: 'remove' | 'hide' | 'export' | 'overwrite' }

const CONFIRM_BUTTON: Record<RowConfirm['kind'], SkillsStringKey> = {
  remove: 'actRemove',
  hide: 'actHide',
  export: 'exportContinue',
  overwrite: 'overwrite',
}

/** Settings → Skills (spec 5.1): every skill of every source with its state */
export function SkillsPane() {
  const { lang, dateLocale } = useI18n()
  const s: Text = (key, params) => skillsText(lang, key, params)
  const api = userSkillsApi()
  const [views, setViews] = useState<UserSkillView[] | null>(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<SkillsNotice | null>(null)
  /** a status line while a slow call runs */
  const [busyKey, setBusyKey] = useState<SkillsStringKey | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [confirm, setConfirm] = useState<RowConfirm | null>(null)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    const bridge = userSkillsApi()
    const list = bridge ? await bridge.list() : []
    if (alive.current) setViews(list)
  }, [])

  useEffect(() => {
    alive.current = true
    void refresh()
    const off = userSkillsApi()?.onChanged(() => void refresh())
    return () => {
      alive.current = false
      off?.()
    }
  }, [refresh])

  const say = (tone: SkillsNotice['tone'], text: string) => {
    if (alive.current) setNotice({ tone, text })
  }

  const fail = (reason: UserSkillsFailReason, context: 'import' | 'other' = 'other') => {
    const key = failureKey(reason, context)
    if (key) say('error', s(key))
  }

  /** run a slow call with a status line, then clear it */
  const slow = async <T,>(key: SkillsStringKey, work: Promise<T>): Promise<T> => {
    setNotice(null)
    setBusyKey(key)
    try {
      return await work
    } finally {
      if (alive.current) setBusyKey(null)
    }
  }

  if (!api) {
    return (
      <>
        <h3 className="set-pane-title">{s('navLabel')}</h3>
        <p className="set-field-desc skl-intro">{s('intro')}</p>
        <p className="set-field-desc">{s('empty')}</p>
      </>
    )
  }

  const setState = async (
    view: UserSkillView,
    patch: { enabled?: boolean; invoke?: UserSkillInvokeValue },
  ) => {
    setViews((list) => list?.map((v) => (v.id === view.id ? { ...v, ...patch } : v)) ?? list)
    const answer = await api.setState(view.id, patch)
    if (!answer.ok) fail(answer.reason)
    void refresh()
  }

  const copyToMine = async (view: UserSkillView, overwrite: boolean) => {
    const answer = await api.copyToMine(view.id, overwrite)
    if (answer.ok) {
      setConfirm(null)
      say('ok', s('copied'))
      void refresh()
      return
    }
    if (answer.reason === 'exists' && !overwrite) {
      setConfirm({ id: view.id, kind: 'overwrite' })
      return
    }
    setConfirm(null)
    fail(answer.reason)
  }

  const exportZip = async (view: UserSkillView) => {
    setConfirm(null)
    const answer = await api.exportZip(view.id)
    if (answer.ok) say('ok', s('exported', { path: answer.path }))
    else fail(answer.reason)
  }

  const startExport = async (view: UserSkillView) => {
    setNotice(null)
    const info = await api.exportInfo(view.id)
    if (!info.ok) {
      fail(info.reason)
      return
    }
    if (info.includesTemplate) setConfirm({ id: view.id, kind: 'export' })
    else await exportZip(view)
  }

  const checkUpdate = async (view: UserSkillView) => {
    const answer = await slow('checking', api.checkUpdate(view.id))
    if (!answer.ok) {
      fail(answer.reason, 'import')
      return
    }
    if (answer.status === 'up-to-date') say('ok', s('upToDate'))
    else if (alive.current) setDialog({ kind: 'update', view, check: answer })
  }

  const runAction = (view: UserSkillView, action: SkillMenuAction) => {
    setConfirm(null)
    switch (action) {
      case 'view':
      case 'edit':
        setDialog({ kind: 'editor', mode: action, view })
        return
      case 'copyToMine':
        void copyToMine(view, false)
        return
      case 'export':
        void startExport(view)
        return
      case 'checkUpdate':
        void checkUpdate(view)
        return
      case 'openFolder':
        void api.openFolder(view.id).then((answer) => {
          if (!answer.ok) fail(answer.reason)
        })
        return
      case 'remove':
      case 'hide':
        setNotice(null)
        setConfirm({ id: view.id, kind: action })
        return
    }
  }

  const confirmRow = async (view: UserSkillView, kind: RowConfirm['kind']) => {
    if (kind === 'export') {
      await exportZip(view)
      return
    }
    if (kind === 'overwrite') {
      await copyToMine(view, true)
      return
    }
    setConfirm(null)
    const answer = kind === 'remove' ? await api.remove(view.id) : await api.hideBuiltin(view.id)
    if (!answer.ok) fail(answer.reason)
    void refresh()
  }

  const importFrom = async (source: 'folder' | 'zip') => {
    const answer = await slow(
      'importReading',
      source === 'folder' ? api.importFolder() : api.importZip(),
    )
    if (answer.ok) {
      if (alive.current) setDialog({ kind: 'preview', preview: answer.preview })
      return
    }
    fail(answer.reason, 'import')
  }

  const unhide = async () => {
    const answer = await api.unhideBuiltins()
    if (!answer.ok) fail(answer.reason)
    void refresh()
  }

  const finishDialog = (next: SkillsNotice | null) => {
    setDialog(null)
    if (next) say(next.tone, next.text)
    void refresh()
  }

  const openHelp = () => {
    void window.aiOffice?.openHelp?.(SKILLS_HELP_TOPIC)
  }

  const groups = views ? groupSkills(views, query, lang) : []
  const hidden = views ? hiddenBuiltinCount(views) : 0

  const confirmText = (view: UserSkillView, kind: RowConfirm['kind']) => {
    const title = skillDisplayTitle(view)
    switch (kind) {
      case 'remove':
        return s('confirmRemove', { title })
      case 'hide':
        return s('confirmHide', { title })
      case 'export':
        return s('exportNotice')
      case 'overwrite':
        return s('confirmOverwrite', { name: view.name })
    }
  }

  return (
    <>
      <div className="set-pane-head">
        <h3 className="set-pane-title">{s('navLabel')}</h3>
        <div className="set-pane-actions">
          <MenuButton
            label={s('add')}
            items={[
              { key: 'folder', label: s('addFolder'), onPick: () => void importFrom('folder') },
              { key: 'zip', label: s('addZip'), onPick: () => void importFrom('zip') },
              {
                key: 'github',
                label: s('addGitHub'),
                onPick: () => {
                  setNotice(null)
                  setDialog({ kind: 'github' })
                },
              },
            ]}
          />
          <button
            type="button"
            className="set-btn primary"
            onClick={() => {
              setNotice(null)
              setDialog({ kind: 'editor', mode: 'new' })
            }}
          >
            {s('create')}
          </button>
        </div>
      </div>

      <p className="set-field-desc skl-intro">
        {s('intro')}{' '}
        <button
          type="button"
          className="set-link"
          data-help-topic={SKILLS_HELP_TOPIC}
          onClick={openHelp}
        >
          {s('helpLink')}
        </button>
      </p>

      <input
        type="search"
        className="skl-input skl-search"
        aria-label={s('searchLabel')}
        placeholder={s('searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {busyKey && (
        <p className="set-field-desc skl-notice" role="status">
          {s(busyKey)}
        </p>
      )}
      {!busyKey && notice && (
        <p className={`skl-notice${notice.tone === 'error' ? ' skl-error' : ''}`} role="status">
          {notice.text}
        </p>
      )}

      {views === null ? (
        <p className="set-field-desc">{s('loading')}</p>
      ) : listedCount(views) === 0 ? (
        <p className="set-field-desc skl-empty">{s('empty')}</p>
      ) : groups.length === 0 ? (
        <p className="set-field-desc skl-empty">{s('noMatch', { query: query.trim() })}</p>
      ) : (
        groups.map((group) => (
          <section key={group.id} className="skl-group" data-group={group.id}>
            <h4 className="set-pane-subtitle skl-group-title">{s(groupLabelKey(group.id))}</h4>
            {group.skills.map((view) => (
              <SkillRow
                key={view.id}
                view={view}
                lang={lang}
                text={s}
                onToggle={() => void setState(view, { enabled: !view.enabled })}
                onInvoke={(invoke) => void setState(view, { invoke })}
                onAction={(action) => runAction(view, action)}
                confirm={
                  confirm?.id === view.id
                    ? {
                        text: confirmText(view, confirm.kind),
                        button: s(CONFIRM_BUTTON[confirm.kind]),
                        danger: confirm.kind === 'remove' || confirm.kind === 'overwrite',
                        onConfirm: () => void confirmRow(view, confirm.kind),
                        onCancel: () => setConfirm(null),
                      }
                    : undefined
                }
              />
            ))}
          </section>
        ))
      )}

      {hidden > 0 && (
        <div className="skl-hidden-footer">
          <span className="set-field-desc">{s('hiddenFooter', { n: hidden })}</span>
          <button type="button" className="set-btn" onClick={() => void unhide()}>
            {s('unhide')}
          </button>
        </div>
      )}

      {dialog?.kind === 'editor' && (
        <SkillEditor
          api={api}
          mode={dialog.mode}
          view={dialog.view}
          lang={lang}
          locale={dateLocale}
          onClose={() => setDialog(null)}
          onSaved={() => finishDialog({ tone: 'ok', text: s('saved') })}
        />
      )}
      {dialog?.kind === 'github' && (
        <GitHubImportDialog
          api={api}
          lang={lang}
          onPreview={(preview) => setDialog({ kind: 'preview', preview })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'preview' && (
        <SkillImportPreviewDialog
          api={api}
          preview={dialog.preview}
          lang={lang}
          locale={dateLocale}
          onDone={finishDialog}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'update' && (
        <SkillUpdateDialog
          api={api}
          title={skillDisplayTitle(dialog.view)}
          check={dialog.check}
          lang={lang}
          locale={dateLocale}
          onDone={finishDialog}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}

interface RowConfirmProps {
  text: string
  button: string
  danger: boolean
  onConfirm: () => void
  onCancel: () => void
}

function SkillRow({
  view,
  lang,
  text,
  onToggle,
  onInvoke,
  onAction,
  confirm,
}: {
  view: UserSkillView
  lang: Lang
  text: Text
  onToggle: () => void
  onInvoke: (invoke: UserSkillInvokeValue) => void
  onAction: (action: SkillMenuAction) => void
  confirm: RowConfirmProps | undefined
}) {
  const title = skillDisplayTitle(view)
  const desc = skillDisplayDesc(view, lang)
  const unreadable = view.unreadable
  const actions = skillMenuActions(view)
  const badges: SkillsStringKey[] = []
  if (view.template && view.templateExists) badges.push('badgeTemplate')
  if (view.hasScripts) badges.push('badgeScripts')
  if (view.agentOnly) badges.push('badgeAgentOnly')

  return (
    <div
      className={`skl-row${unreadable ? ' dimmed' : ''}`}
      data-skill-id={view.id}
      data-unreadable={unreadable ? 'true' : undefined}
    >
      <div className="skl-row-main">
        <div className="skl-row-text">
          <div className="skl-row-head">
            <span className="skl-row-title">{title}</span>
            <span className="skl-source">{sourceLabel(view, text)}</span>
          </div>
          {desc && (
            <div className="skl-row-desc" data-tip={desc}>
              {desc}
            </div>
          )}
          {unreadable && (
            <div className="set-field-desc skl-row-problem">
              {text('unreadableNote', { reason: text(unreadableKey(unreadable)) })}
            </div>
          )}
          {badges.length > 0 && (
            <div className="skl-badges">
              {badges.map((key) => (
                <span key={key} className="skl-badge">
                  {text(key)}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="skl-row-controls">
          {view.enabled && !unreadable && (
            <div className="skl-invoke" role="group" aria-label={text('invokeLabel', { title })}>
              {(['auto', 'manual'] as const).map((invoke) => (
                <button
                  key={invoke}
                  type="button"
                  className={`skl-invoke-option${view.invoke === invoke ? ' active' : ''}`}
                  aria-pressed={view.invoke === invoke}
                  onClick={() => {
                    if (view.invoke !== invoke) onInvoke(invoke)
                  }}
                >
                  {text(invoke === 'auto' ? 'invokeAuto' : 'invokeManual')}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            role="switch"
            className="set-switch"
            aria-checked={view.enabled && !unreadable}
            aria-label={text('switchLabel', { title })}
            disabled={!!unreadable}
            onClick={onToggle}
          />
          {actions.length > 0 ? (
            <MenuButton
              className="skl-more"
              label={
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <circle cx="3" cy="7" r="1.2" fill="currentColor" />
                  <circle cx="7" cy="7" r="1.2" fill="currentColor" />
                  <circle cx="11" cy="7" r="1.2" fill="currentColor" />
                </svg>
              }
              ariaLabel={text('moreLabel', { title })}
              items={actions.map((action) => ({
                key: action,
                label: text(actionLabelKey(action)),
                onPick: () => onAction(action),
              }))}
            />
          ) : (
            <span className="skl-more-gap" aria-hidden="true" />
          )}
        </div>
      </div>
      {confirm && (
        <div className="skl-confirm" role="group">
          <span className="set-field-desc">{confirm.text}</span>
          <div className="skl-confirm-actions">
            <button type="button" className="set-btn" onClick={confirm.onCancel}>
              {text('cancel')}
            </button>
            <button
              type="button"
              className={`set-btn ${confirm.danger ? 'danger' : 'primary'}`}
              onClick={confirm.onConfirm}
            >
              {confirm.button}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
