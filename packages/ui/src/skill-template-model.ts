import type { SkillProposal } from '@genoffice/agent-core'
import type { SkillCardDraft } from './skill-card-model'
import { skillDisplayName, type SkillChipRef, type SkillChipView } from './skill-picker-model'

/**
 * The template flow of the person's skills (spec 5.6, 5.7) as plain rules: the
 * editors a template copy opens in, which chip's template a request uses, and
 * the shapes that cross the shell's bridge. The shell copies the template
 * file and opens the tab; the screens only ask.
 */

/** the editors a template copy or a hand-off opens in (the shell's HandoffEditor) */
export type TemplateEditor =
  'docs' | 'sheets' | 'slides' | 'pdf' | 'markdown' | 'html' | 'mindmap' | 'hwp'

export const TEMPLATE_EDITORS: readonly TemplateEditor[] = Object.freeze([
  'docs',
  'sheets',
  'slides',
  'pdf',
  'markdown',
  'html',
  'mindmap',
  'hwp',
])

/**
 * The current document of an editor tab, as the template buttons need it.
 * A panel passes one only while its document can be a template (spec 5.7).
 */
export interface TemplateDocument {
  /** the file name the template is saved under, with its extension */
  fileName: string
  /** the title the tab shows */
  title: string
  /** the document as edited now (not the file on disk); null when it cannot be read */
  bytes: () => Promise<Uint8Array | null>
  /**
   * The document has redaction marks the editor recognizes (docs/security.md).
   * Editors that recognize none answer false.
   */
  redacted: () => boolean | Promise<boolean>
}

/** The calls of `window.aiOfficeUserSkills` the template flow uses */
export interface SkillTemplateBridge {
  openTemplate(input: { skillId: string; text: string; chips: SkillChipRef[] }): Promise<unknown>
  openPreview(input: {
    bytes: Uint8Array
    fileName: string
    title: string
    tabTitle: string
    text: string
    originalRedacted: boolean
    proposal: unknown
    draft?: unknown
  }): Promise<unknown>
  previewOriginal(previewId: string): Promise<unknown>
  finishPreview(
    previewId: string,
    outcome: 'saved' | 'unsaved',
    saved?: { skillId: string; title: string },
  ): Promise<unknown>
  takeHandoff(target: TemplateEditor): Promise<unknown>
  focusTab(tabId: string): Promise<unknown>
  onPreviewEnded(listener: (ended: unknown) => void): () => void
  aiRead(id: string): Promise<unknown>
}

/** The template calls of this window's skills bridge, or null (tests, an older preload) */
export function skillTemplateBridge(): SkillTemplateBridge | null {
  const b = (globalThis as { aiOfficeUserSkills?: Partial<SkillTemplateBridge> }).aiOfficeUserSkills
  const calls: Array<keyof SkillTemplateBridge> = [
    'openTemplate',
    'openPreview',
    'previewOriginal',
    'finishPreview',
    'takeHandoff',
    'focusTab',
    'onPreviewEnded',
    'aiRead',
  ]
  return b && calls.every((name) => typeof b[name] === 'function')
    ? (b as SkillTemplateBridge)
    : null
}

/**
 * Which template a request with chips uses (spec 5.7): the first chip that
 * names a template; `several` when more than one does (the panel says whose
 * template it uses). Every chip's text still goes along.
 */
export function templateChoice(request: {
  skill: SkillChipView
  chips: readonly SkillChipView[]
}): { skill: SkillChipView; several: boolean } {
  const withTemplate = request.chips.filter((chip) => chip.template || chip.templateMissing)
  return { skill: withTemplate[0] ?? request.skill, several: withTemplate.length > 1 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** A chip as it travels: identifier, source and title only */
export function chipRefOf(chip: SkillChipRef): SkillChipRef {
  return { id: chip.id, source: chip.source, title: chip.title }
}

/** The chip of a skill the model used on its own (its identifier starts with the source) */
export function chipRefForSkill(skill: { id: string; name: string; title: string }): SkillChipRef {
  const source = skill.id.slice(0, Math.max(0, skill.id.indexOf(':'))) || 'app'
  const title = skillDisplayName(source === 'builtin' ? { name: skill.name } : skill)
  return { id: skill.id, source, title }
}

export type TemplateOpenResult = { ok: true; tabId: string } | { ok: false; reason: string }

/** An `openTemplate` answer that crossed the preload boundary */
export function templateOpenResultOf(raw: unknown): TemplateOpenResult {
  if (isRecord(raw) && raw.ok === true && typeof raw.tabId === 'string' && raw.tabId) {
    return { ok: true, tabId: raw.tabId }
  }
  const reason = isRecord(raw) && typeof raw.reason === 'string' ? raw.reason : 'failed'
  return { ok: false, reason }
}

/** The template file is not there (deleted, or the skill went away): nothing is sent */
export function isTemplateMissing(reason: string): boolean {
  return reason === 'no-template' || reason === 'not-found'
}

export type PreviewOpenResult =
  { ok: true; tabId: string; previewId: string } | { ok: false; reason: string }

export function previewOpenResultOf(raw: unknown): PreviewOpenResult {
  if (
    isRecord(raw) &&
    raw.ok === true &&
    typeof raw.tabId === 'string' &&
    typeof raw.previewId === 'string' &&
    raw.tabId &&
    raw.previewId
  ) {
    return { ok: true, tabId: raw.tabId, previewId: raw.previewId }
  }
  return {
    ok: false,
    reason: isRecord(raw) && typeof raw.reason === 'string' ? raw.reason : 'failed',
  }
}

/** A `previewOriginal` answer: the original document's bytes and file name */
export function previewOriginalOf(raw: unknown): { bytes: Uint8Array; fileName: string } | null {
  if (!isRecord(raw) || raw.ok !== true) return null
  if (!(raw.bytes instanceof Uint8Array) || typeof raw.fileName !== 'string' || !raw.fileName) {
    return null
  }
  return { bytes: raw.bytes, fileName: raw.fileName }
}

/** A preview's end as the original tab hears it */
export interface PreviewEnded {
  previewId: string
  outcome: 'saved' | 'unsaved'
  skillId?: string | undefined
  title?: string | undefined
}

export function previewEndedOf(raw: unknown): PreviewEnded | null {
  if (!isRecord(raw) || typeof raw.previewId !== 'string' || !raw.previewId) return null
  if (raw.outcome !== 'saved' && raw.outcome !== 'unsaved') return null
  return {
    previewId: raw.previewId,
    outcome: raw.outcome,
    ...(typeof raw.skillId === 'string' ? { skillId: raw.skillId } : {}),
    ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
  }
}

/** A pending proposal as it came through the shell, or null */
export function handedProposalOf(raw: unknown): SkillProposal | null {
  if (!isRecord(raw)) return null
  const { key, title, name, description, body } = raw
  if (typeof key !== 'string' || !key || typeof title !== 'string') return null
  if (typeof description !== 'string' || typeof body !== 'string') return null
  let target: SkillProposal['target']
  if (isRecord(raw.target)) {
    const t = raw.target
    if (
      typeof t.id !== 'string' ||
      typeof t.name !== 'string' ||
      typeof t.title !== 'string' ||
      typeof t.source !== 'string'
    ) {
      return null
    }
    target = { id: t.id, name: t.name, title: t.title, owned: t.owned === true, source: t.source }
  }
  return {
    key,
    title,
    name: typeof name === 'string' ? name : '',
    description,
    body,
    wantsTemplate: true,
    target,
  }
}

/** The card's fields as the person left them in the original tab */
export function handedDraftOf(raw: unknown): Partial<SkillCardDraft> | undefined {
  if (!isRecord(raw)) return undefined
  const draft: Partial<SkillCardDraft> = {}
  for (const field of ['title', 'name', 'description', 'body'] as const) {
    const value = raw[field]
    if (typeof value === 'string') draft[field] = value
  }
  if (raw.invoke === 'auto' || raw.invoke === 'manual') draft.invoke = raw.invoke
  return draft
}

/** The template preview a tab took over (spec 5.6) */
export interface HandedPreview {
  previewId: string
  /** the original document's title */
  title: string
  /** the file name the template is saved under */
  fileName: string
  /** the original document had redaction marks */
  originalRedacted: boolean
  proposal: SkillProposal
  draft?: Partial<SkillCardDraft> | undefined
}

/** What a new tab's AI panel takes over */
export interface HandedRequest {
  id: string
  text: string
  chips: SkillChipRef[]
  preview?: HandedPreview | undefined
}

/** A taken hand-off as the panel reads it; null for none or a malformed one */
export function handedRequestOf(raw: unknown, target: TemplateEditor): HandedRequest | null {
  if (!isRecord(raw) || raw.mode !== 'skill' || raw.target !== target) return null
  if (typeof raw.id !== 'string' || typeof raw.text !== 'string') return null
  const chips: SkillChipRef[] = []
  if (Array.isArray(raw.chips)) {
    for (const chip of raw.chips) {
      if (
        isRecord(chip) &&
        typeof chip.id === 'string' &&
        typeof chip.source === 'string' &&
        typeof chip.title === 'string'
      ) {
        chips.push({ id: chip.id, source: chip.source, title: chip.title })
      }
    }
  }
  let preview: HandedPreview | undefined
  if (isRecord(raw.preview)) {
    const p = raw.preview
    const proposal = handedProposalOf(p.proposal)
    if (
      proposal &&
      typeof p.previewId === 'string' &&
      typeof p.title === 'string' &&
      typeof p.fileName === 'string' &&
      p.fileName
    ) {
      const draft = handedDraftOf(p.draft)
      preview = {
        previewId: p.previewId,
        title: p.title,
        fileName: p.fileName,
        originalRedacted: p.originalRedacted !== false,
        proposal,
        ...(draft ? { draft } : {}),
      }
    }
  }
  return { id: raw.id, text: raw.text, chips, ...(preview ? { preview } : {}) }
}

/**
 * The file name a document goes under `assets/` with (spec 5.6): its own file
 * name, or its title with the editor's extension for a document not saved yet.
 */
export function templateFileNameFor(
  filePathOrName: string | null | undefined,
  title: string,
  extension: string,
): string {
  const name = (filePathOrName ?? '').split(/[\\/]/).pop() ?? ''
  if (name && /\.[^.]+$/.test(name)) return name
  const base = (title || name).replace(/\.[^.]+$/, '').trim() || 'template'
  return `${base}.${extension.replace(/^\./, '')}`
}

export interface TemplateDocumentInput {
  /** the document's file; null or empty for a document not saved yet */
  filePath: string | null | undefined
  /** the extensions (lowercase, no dot) of this editor's files that can be templates */
  extensions: readonly string[]
  /** the extension a document without a file goes under `assets/` with */
  defaultExtension: string
  /** the extension the bytes have for a file of this extension (sheets: a .csv's bytes are .xlsx) */
  savedExtension?: ((fileExtension: string) => string) | undefined
  /** the title of a document without a file, read when a button is pressed */
  untitledTitle: () => string
  /** the document as edited now; null when it cannot be read */
  bytes: () => Promise<Uint8Array | null>
  /** the editor recognizes a redaction mark in it; editors that recognize none leave it out */
  redacted?: (() => boolean | Promise<boolean>) | undefined
}

function fileBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * An editor's current document as the template buttons see it, or null when
 * its file is not a format a template can be (spec 5.7). The file name and
 * the title are read when a button is pressed, so an untitled document's
 * title follows its content.
 */
export function templateDocumentOf(input: TemplateDocumentInput): TemplateDocument | null {
  const name = input.filePath ? fileBaseName(input.filePath) : ''
  const fileExtension = name ? extensionOf(name) : ''
  if (name && !input.extensions.includes(fileExtension)) return null
  const saved = (ext: string) => input.savedExtension?.(ext) ?? ext
  const title = () =>
    name ? name.slice(0, name.length - fileExtension.length - 1) || name : input.untitledTitle()
  return {
    get fileName() {
      const ext = name ? saved(fileExtension) : input.defaultExtension
      return `${title().trim() || 'template'}.${ext}`
    },
    get title() {
      return title()
    },
    bytes: input.bytes,
    redacted: input.redacted ?? (() => false),
  }
}
