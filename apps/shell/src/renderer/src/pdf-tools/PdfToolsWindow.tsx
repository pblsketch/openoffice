import { useState } from 'react'
import type { Lang, Params } from '@genoffice/i18n'
import {
  PDF_TOOL_PAPERS,
  type PdfEditorToolId,
  type PdfInputProblem,
  type PdfToolError,
  type PdfToolId,
  type PdfToolInput,
  type PdfToolOptions,
  type PdfToolPaper,
} from '../../../shared/pdf-tools-api'
import { pdfToolsText, type PdfToolsStringKey } from '../i18n/strings-pdf-tools'
import { formatBytes } from '../generate/format'

/** Home groups of the tools the window runs itself (decision 0030) */
const GROUPS: { label: PdfToolsStringKey; tools: PdfToolId[] }[] = [
  { label: 'groupOrganize', tools: ['merge', 'split', 'extract', 'reverse', 'rotate'] },
  { label: 'groupPrint', tools: ['nup', 'pageSize', 'splitPages'] },
]

const EDITOR_TOOLS: PdfEditorToolId[] = ['stamps', 'crop', 'exportImages', 'convert', 'edit']

const TOOL_TEXT: Record<PdfToolId | PdfEditorToolId, [PdfToolsStringKey, PdfToolsStringKey]> = {
  merge: ['toolMerge', 'descMerge'],
  split: ['toolSplit', 'descSplit'],
  extract: ['toolExtract', 'descExtract'],
  reverse: ['toolReverse', 'descReverse'],
  rotate: ['toolRotate', 'descRotate'],
  nup: ['toolNup', 'descNup'],
  pageSize: ['toolPageSize', 'descPageSize'],
  splitPages: ['toolSplitPages', 'descSplitPages'],
  stamps: ['toolStamps', 'descStamps'],
  crop: ['toolCrop', 'descCrop'],
  exportImages: ['toolExportImages', 'descExportImages'],
  convert: ['toolConvert', 'descConvert'],
  edit: ['toolEdit', 'descEdit'],
}

const ERROR_TEXT: Record<PdfToolError, PdfToolsStringKey> = {
  'no-input': 'errNoInput',
  'need-two': 'errNeedTwo',
  missing: 'errMissing',
  'too-large': 'errTooLarge',
  range: 'errRange',
  'same-as-source': 'errSameAsSource',
  'unsaved-target': 'errUnsavedTarget',
  busy: 'errBusy',
  failed: 'errFailed',
}

const REJECT_TEXT: Record<PdfInputProblem, PdfToolsStringKey> = {
  encrypted: 'rejectEncrypted',
  unreadable: 'rejectUnreadable',
  'too-large': 'rejectTooLarge',
}

const PER_SHEET = [2, 4, 6, 8, 9, 16]

const DEFAULT_OPTIONS: PdfToolOptions = {
  chunkSize: 1,
  pages: '',
  perSheet: 2,
  direction: 'horizontal',
  separator: false,
  rotation: 90,
  paper: 'A4',
  perPage: 2,
}

type View =
  { kind: 'home' } | { kind: 'tool'; tool: PdfToolId } | { kind: 'editor'; tool: PdfEditorToolId }

type Outcome =
  | { kind: 'done'; outputs: { id: string; name: string }[] }
  | { kind: 'error'; message: string }
  | null

function ToolIcon({ group }: { group: 'organize' | 'print' | 'editor' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="pt-card-icon">
      <path
        d="M5 2.5h7l3.5 3.5v11.5H5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {group === 'organize' && (
        <path d="M8 9h5M8 12h5M8 15h3" stroke="currentColor" strokeWidth="1.3" />
      )}
      {group === 'print' && (
        <path d="M7.5 9h2.5v3H7.5zM11 9h2.5v3H11zM7.5 13h2.5v3H7.5z" fill="currentColor" />
      )}
      {group === 'editor' && (
        <path d="m8 15 1-3 5-5 2 2-5 5z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      )}
    </svg>
  )
}

export function PdfToolsWindow({ lang }: { lang: Lang }) {
  const api = window.aiOfficePdfTools
  const t = (key: PdfToolsStringKey, params?: Params) => pdfToolsText(lang, key, params)
  const [view, setView] = useState<View>({ kind: 'home' })
  const [inputs, setInputs] = useState<PdfToolInput[]>([])
  const [rejected, setRejected] = useState<string[]>([])
  const [options, setOptions] = useState<PdfToolOptions>(DEFAULT_OPTIONS)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>(null)

  const openTool = (next: View) => {
    setView(next)
    setInputs([])
    setRejected([])
    setOptions(DEFAULT_OPTIONS)
    setOutcome(null)
  }

  const pick = async (tool: PdfToolId) => {
    const many = tool === 'merge'
    const result = await api.pickInputs(many)
    setRejected(result.rejected.map((r) => t(REJECT_TEXT[r.problem], { name: r.name })))
    if (result.inputs.length === 0) return
    setOutcome(null)
    setInputs((prev) => (many ? [...prev, ...result.inputs] : result.inputs.slice(0, 1)))
  }

  const move = (index: number, by: -1 | 1) => {
    setInputs((prev) => {
      const next = [...prev]
      const target = index + by
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }

  const runTool = async (tool: PdfToolId) => {
    setBusy(true)
    setOutcome(null)
    try {
      const result = await api.run({ tool, inputIds: inputs.map((i) => i.id), options })
      if (result.ok) setOutcome({ kind: 'done', outputs: result.outputs })
      else if ('error' in result)
        setOutcome({ kind: 'error', message: t(ERROR_TEXT[result.error]) })
    } finally {
      setBusy(false)
    }
  }

  const set = (patch: PdfToolOptions) => setOptions((prev) => ({ ...prev, ...patch }))

  return (
    <div className="pt">
      <header className="pt-head">
        <h1 className="pt-title">{t('windowTitle')}</h1>
        <p className="pt-intro">{t('intro')}</p>
        <p className="pt-local">{t('localNote')}</p>
      </header>
      <main className="pt-body">
        {view.kind === 'home' && (
          <>
            {GROUPS.map((group) => (
              <section className="pt-section" key={group.label}>
                <h2 className="pt-label">{t(group.label)}</h2>
                <div className="pt-cards">
                  {group.tools.map((tool) => (
                    <button
                      key={tool}
                      type="button"
                      className="pt-card"
                      onClick={() => openTool({ kind: 'tool', tool })}
                    >
                      <ToolIcon group={group.label === 'groupPrint' ? 'print' : 'organize'} />
                      <span className="pt-card-text">
                        <span className="pt-card-title">{t(TOOL_TEXT[tool][0])}</span>
                        <span className="pt-card-desc">{t(TOOL_TEXT[tool][1])}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <section className="pt-section">
              <h2 className="pt-label">{t('groupEditor')}</h2>
              <div className="pt-cards">
                {EDITOR_TOOLS.map((tool) => (
                  <button
                    key={tool}
                    type="button"
                    className="pt-card pt-card-editor"
                    onClick={() => openTool({ kind: 'editor', tool })}
                  >
                    <ToolIcon group="editor" />
                    <span className="pt-card-text">
                      <span className="pt-card-title">{t(TOOL_TEXT[tool][0])}</span>
                      <span className="pt-card-desc">{t(TOOL_TEXT[tool][1])}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {view.kind === 'editor' && (
          <section className="pt-section">
            <button type="button" className="pt-back" onClick={() => openTool({ kind: 'home' })}>
              <span className="pt-back-arrow">←</span> {t('back')}
            </button>
            <h2 className="pt-tool-title">{t(TOOL_TEXT[view.tool][0])}</h2>
            <p className="pt-hint">{t(TOOL_TEXT[view.tool][1])}</p>
            <p className="pt-hint">{t('editorHint')}</p>
            <div className="pt-actions">
              <button
                type="button"
                className="pt-btn pt-btn-primary"
                onClick={() => void api.openInEditor()}
              >
                {t('openInEditor')}
              </button>
            </div>
          </section>
        )}

        {view.kind === 'tool' && (
          <ToolPanel
            lang={lang}
            tool={view.tool}
            t={t}
            inputs={inputs}
            rejected={rejected}
            options={options}
            busy={busy}
            outcome={outcome}
            onBack={() => openTool({ kind: 'home' })}
            onPick={() => void pick(view.tool)}
            onRemove={(id) => setInputs((prev) => prev.filter((i) => i.id !== id))}
            onMove={move}
            onOptions={set}
            onRun={() => void runTool(view.tool)}
            onOpen={(id) => void api.openResult(id)}
            onReveal={(id) => void api.revealResult(id)}
          />
        )}
      </main>
      <footer className="pt-foot">
        <button type="button" className="pt-btn" onClick={() => void api.close()}>
          {t('close')}
        </button>
      </footer>
    </div>
  )
}

interface ToolPanelProps {
  lang: Lang
  tool: PdfToolId
  t: (key: PdfToolsStringKey, params?: Params) => string
  inputs: PdfToolInput[]
  rejected: string[]
  options: PdfToolOptions
  busy: boolean
  outcome: Outcome
  onBack(): void
  onPick(): void
  onRemove(id: string): void
  onMove(index: number, by: -1 | 1): void
  onOptions(patch: PdfToolOptions): void
  onRun(): void
  onOpen(id: string): void
  onReveal(id: string): void
}

function ToolPanel(p: ToolPanelProps) {
  const { t, tool, inputs, options } = p
  const many = tool === 'merge'
  const first = inputs[0]
  const ready = many ? inputs.length >= 2 : inputs.length === 1
  const pickLabel: PdfToolsStringKey =
    inputs.length === 0 ? 'pickFiles' : many ? 'addMore' : 'replaceFile'
  const done = p.outcome?.kind === 'done' ? p.outcome.outputs : null
  const firstOutput = done?.[0]

  return (
    <section className="pt-section">
      <button type="button" className="pt-back" onClick={p.onBack}>
        <span className="pt-back-arrow">←</span> {t('back')}
      </button>
      <h2 className="pt-tool-title">{t(TOOL_TEXT[tool][0])}</h2>
      <p className="pt-hint">{t(many ? 'hintMerge' : 'hintOne')}</p>

      {inputs.length > 0 && (
        <ul className="pt-list">
          {inputs.map((input, index) => (
            <li className="pt-item" key={input.id}>
              <span className="pt-item-name" title={input.name}>
                {input.name}
              </span>
              <span className="pt-item-meta">
                {t('pageCount', { n: input.pages })} · {formatBytes(input.size, p.lang)}
              </span>
              {many && (
                <>
                  <button
                    type="button"
                    className="pt-icon-btn"
                    aria-label={t('moveUp')}
                    title={t('moveUp')}
                    disabled={index === 0}
                    onClick={() => p.onMove(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="pt-icon-btn"
                    aria-label={t('moveDown')}
                    title={t('moveDown')}
                    disabled={index === inputs.length - 1}
                    onClick={() => p.onMove(index, 1)}
                  >
                    ↓
                  </button>
                </>
              )}
              <button
                type="button"
                className="pt-icon-btn"
                aria-label={t('remove')}
                title={t('remove')}
                onClick={() => p.onRemove(input.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="pt-actions pt-actions-start">
        <button type="button" className="pt-btn" onClick={p.onPick} disabled={p.busy}>
          {t(pickLabel)}
        </button>
      </div>
      {p.rejected.map((line) => (
        <p className="pt-note pt-note-error" key={line} role="alert">
          {line}
        </p>
      ))}

      {first && (
        <Options tool={tool} t={t} options={options} pages={first.pages} onChange={p.onOptions} />
      )}

      <div className="pt-actions">
        <button
          type="button"
          className="pt-btn pt-btn-primary"
          disabled={!ready || p.busy}
          onClick={p.onRun}
        >
          {p.busy ? t('running') : t('run')}
        </button>
      </div>

      {p.outcome?.kind === 'error' && (
        <p className="pt-note pt-note-error" role="alert">
          {p.outcome.message}
        </p>
      )}
      {done && firstOutput && (
        <div className="pt-note pt-note-done" role="status">
          <span>
            {done.length === 1
              ? t('doneOne', { name: firstOutput.name })
              : t('doneMany', { n: done.length })}
          </span>
          <span className="pt-done-actions">
            {done.length === 1 && (
              <button type="button" className="pt-btn" onClick={() => p.onOpen(firstOutput.id)}>
                {t('openResult')}
              </button>
            )}
            <button type="button" className="pt-btn" onClick={() => p.onReveal(firstOutput.id)}>
              {t('reveal')}
            </button>
          </span>
        </div>
      )}
    </section>
  )
}

interface OptionsProps {
  tool: PdfToolId
  t: (key: PdfToolsStringKey, params?: Params) => string
  options: PdfToolOptions
  pages: number
  onChange(patch: PdfToolOptions): void
}

function Options({ tool, t, options, pages, onChange }: OptionsProps) {
  switch (tool) {
    case 'split':
      return (
        <label className="pt-field">
          <span className="pt-field-label">{t('optChunk')}</span>
          <input
            type="number"
            className="pt-input pt-input-short"
            min={1}
            max={pages}
            value={options.chunkSize ?? 1}
            onChange={(e) =>
              onChange({ chunkSize: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
            }
          />
        </label>
      )
    case 'extract':
      return (
        <label className="pt-field">
          <span className="pt-field-label">{t('optRange')}</span>
          <input
            type="text"
            className="pt-input"
            value={options.pages ?? ''}
            placeholder={`1-${pages}`}
            onChange={(e) => onChange({ pages: e.target.value })}
          />
        </label>
      )
    case 'nup':
      return (
        <div className="pt-fields">
          <label className="pt-field">
            <span className="pt-field-label">{t('optPerSheet')}</span>
            <select
              className="pt-input pt-input-short"
              value={options.perSheet ?? 2}
              onChange={(e) => onChange({ perSheet: Number(e.target.value) })}
            >
              {PER_SHEET.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="pt-field pt-choices">
            <legend className="pt-field-label">{t('optDirection')}</legend>
            <Choice
              name="direction"
              checked={options.direction !== 'vertical'}
              label={t('optHorizontal')}
              onPick={() => onChange({ direction: 'horizontal' })}
            />
            <Choice
              name="direction"
              checked={options.direction === 'vertical'}
              label={t('optVertical')}
              onPick={() => onChange({ direction: 'vertical' })}
            />
          </fieldset>
          <label className="pt-check">
            <input
              type="checkbox"
              checked={options.separator === true}
              onChange={(e) => onChange({ separator: e.target.checked })}
            />
            {t('optSeparator')}
          </label>
        </div>
      )
    case 'rotate':
      return (
        <fieldset className="pt-field pt-choices">
          <legend className="pt-field-label">{t('optRotation')}</legend>
          <Choice
            name="rotation"
            checked={options.rotation === 90}
            label={t('optRotateRight')}
            onPick={() => onChange({ rotation: 90 })}
          />
          <Choice
            name="rotation"
            checked={options.rotation === 270}
            label={t('optRotateLeft')}
            onPick={() => onChange({ rotation: 270 })}
          />
          <Choice
            name="rotation"
            checked={options.rotation === 180}
            label={t('opt180')}
            onPick={() => onChange({ rotation: 180 })}
          />
        </fieldset>
      )
    case 'pageSize':
      return (
        <label className="pt-field">
          <span className="pt-field-label">{t('optPaper')}</span>
          <select
            className="pt-input pt-input-short"
            value={options.paper ?? 'A4'}
            onChange={(e) => onChange({ paper: e.target.value as PdfToolPaper })}
          >
            {PDF_TOOL_PAPERS.map((paper) => (
              <option key={paper} value={paper}>
                {paper}
              </option>
            ))}
          </select>
        </label>
      )
    case 'splitPages':
      return (
        <fieldset className="pt-field pt-choices">
          <legend className="pt-field-label">{t('optPerPage')}</legend>
          {([2, 4, 9] as const).map((n) => (
            <Choice
              key={n}
              name="perPage"
              checked={(options.perPage ?? 2) === n}
              label={String(n)}
              onPick={() => onChange({ perPage: n })}
            />
          ))}
        </fieldset>
      )
    default:
      return null
  }
}

function Choice(props: { name: string; checked: boolean; label: string; onPick(): void }) {
  return (
    <label className="pt-choice">
      <input type="radio" name={props.name} checked={props.checked} onChange={props.onPick} />
      {props.label}
    </label>
  )
}
