/**
 * One open generate window's state and actions, without Electron: the window
 * module wires the dependencies (file reads, the open tabs, the new tab) and
 * pushes `state()` to the renderer after every change.
 *
 * Rules held here:
 * - "make" re-reads every material first and goes ahead only with at least
 *   one readable material, none open with unsaved changes, and no more than
 *   the cap (8.3, 8.4). Unreadable ones are left out with their reasons.
 * - A document never saved cannot be material; it is listed with that reason,
 *   and once it is saved (its tab now has a path) it becomes a normal row.
 * - "make" opens the new tab with the request queued for it, once, and closes
 *   the window. A second press while one is in flight does nothing. No run
 *   starts here.
 * - A conversion without AI (8.6) is offered only while exactly one material
 *   is listed and its type is the conversion's source. "Make" then reads that
 *   one material again (8.4 applies), converts it, and opens the result as a
 *   new unsaved tab; a failed read converts nothing and says why. A chosen
 *   conversion that is no longer offered never turns into an AI request.
 */
import type { Lang } from '@genoffice/i18n'
import type {
  AiTargetKind,
  ConvertKind,
  ConvertProblem,
  GenerateHandoff,
  GenerateMode,
  GenerateWindowState,
  MaterialView,
} from '../../shared/generate-api'
import { defaultGeneratePrompt } from '../../shared/generate-default-prompts'
import { MAX_IMAGE_MATERIAL_BYTES, MAX_MATERIAL_BYTES, MAX_MATERIALS } from './limits'
import {
  materialKey,
  materialMaxBytes,
  summarizeMaterials,
  untitledMaterial,
  type MaterialStatus,
} from './materials'
import {
  availableConversions,
  isAiTargetKind,
  isConvertKind,
  prepareGenerateRequest,
} from './request'
import type { ConvertedDocument, ConvertResult } from './convert'
import { MAX_OUTLINE_SLIDES } from '../mcp/pptx-outline'

/** where a row came from: a file, or an open document that was never saved */
export type MaterialRef = { path: string } | { untitled: { webContentsId: number; title: string } }

export interface GenerateSessionDeps {
  lang(): Lang
  inspect(path: string): Promise<MaterialStatus>
  /**
   * For a never-saved document: its path now (it was saved since), null while
   * it is still untitled.
   */
  pathOfUntitled(webContentsId: number): Promise<string | null>
  /** whether this path's open document can be saved in place, or only shown */
  saveActionFor(path: string): Promise<'save' | 'show'>
  /** save the open document behind `path`; `shown` = its tab was brought forward instead */
  saveMaterial(path: string): Promise<'saved' | 'shown' | 'failed'>
  /** bring a never-saved document's tab forward so the user can save it */
  showUntitled(webContentsId: number): Promise<void>
  /** open the new untitled tab with the request queued for it (throws when it cannot) */
  openTargetTab(handoff: GenerateHandoff): void
  /**
   * 8.6: run a conversion without AI on one material (read only through the
   * redaction-aware reader). Conversions are offered only when this and
   * `openConvertedTab` are given.
   */
  convert?(kind: ConvertKind, path: string): Promise<ConvertResult>
  /** open a conversion's result as a new unsaved tab (throws when it cannot) */
  openConvertedTab?(doc: ConvertedDocument): void
  /** whether converting this markdown file carries withheld spans over as their labels */
  redactionNotice?(path: string): Promise<boolean>
  push(state: GenerateWindowState): void
  close(): void
  newId(): string
  now(): number
  /** a dirty flag can lag a save by a beat: when to look again (tests pass 0) */
  recheckDelayMs?: number
}

interface Row {
  key: string
  ref: MaterialRef
  /** null while being read */
  status: MaterialStatus | null
  saveAction?: 'save' | 'show'
  /** a markdown file with withheld spans (asked only when it could be converted) */
  marked?: boolean
}

function keyOf(ref: MaterialRef): string {
  return 'path' in ref ? materialKey(ref.path) : `untitled:${ref.untitled.webContentsId}`
}

export class GenerateSession {
  private rows: Row[] = []
  private kind: AiTargetKind
  private making = false
  private closed = false
  private readonly saving = new Set<string>()
  private failure: GenerateWindowState['failure'] = null
  private convertProblem: ConvertProblem | null = null
  private inFlight = 0
  private mode: GenerateMode = 'ai'
  private convertKind: ConvertKind | null = null

  constructor(
    private readonly deps: GenerateSessionDeps,
    init: { refs: readonly MaterialRef[]; kind?: AiTargetKind },
  ) {
    this.kind = init.kind ?? 'slides'
    this.appendRefs(init.refs)
  }

  get isClosed(): boolean {
    return this.closed
  }

  /** start over with a new set of materials (the window was opened again from an entry point) */
  async reset(refs: readonly MaterialRef[], kind?: AiTargetKind): Promise<void> {
    this.rows = []
    if (kind) this.kind = kind
    this.failure = null
    this.convertProblem = null
    this.mode = 'ai'
    this.convertKind = null
    this.appendRefs(refs)
    await this.refresh()
  }

  state(): GenerateWindowState {
    const statuses = this.rows.flatMap((r) => (r.status ? [r.status] : []))
    const summary = summarizeMaterials(statuses, this.kind)
    const checking = this.inFlight > 0 || this.rows.some((r) => !r.status)
    const materials: MaterialView[] = this.rows.map((row) => this.viewOf(row))
    const conversions = this.conversions()
    const convertKind = this.chosenConversion(conversions)
    // a conversion picked and then taken away by the list: "make" waits rather than run the AI
    const lostConversion = this.mode === 'convert' && !convertKind
    return {
      lang: this.deps.lang(),
      kind: this.kind,
      mode: convertKind ? 'convert' : 'ai',
      convertKind,
      conversions,
      redactionNotice:
        convertKind === 'markdown-to-mindmap' && this.listedRows()[0]?.marked === true,
      materials,
      readyCount: summary.ready.length,
      totalBytes: summary.totalBytes,
      // no AI, no plan usage: the AI notices do not apply to a conversion
      notices: convertKind ? { usage: false, longMaterial: false } : summary.notices,
      tooMany: summary.tooMany,
      canMake:
        summary.canMake && !checking && !this.making && this.saving.size === 0 && !lostConversion,
      checking,
      making: this.making,
      saving: [...this.saving],
      failure: this.failure,
      convertProblem: this.failure === 'convert' ? this.convertProblem : null,
      limits: {
        maxMaterials: MAX_MATERIALS,
        maxMaterialMb: Math.round(MAX_MATERIAL_BYTES / 1024 / 1024),
        maxImageMb: Math.round(MAX_IMAGE_MATERIAL_BYTES / 1024 / 1024),
        maxConvertSlides: MAX_OUTLINE_SLIDES,
      },
    }
  }

  private viewOf(row: Row): MaterialView {
    const name = 'path' in row.ref ? (row.status?.name ?? row.ref.path) : row.ref.untitled.title
    const path = 'path' in row.ref ? row.ref.path : undefined
    const s = row.status
    if (!s) return { key: row.key, name, ...(path ? { path } : {}), state: 'checking' }
    const base = {
      key: row.key,
      name: s.name,
      ...(path ? { path } : {}),
      ...(s.sizeBytes !== undefined ? { sizeBytes: s.sizeBytes } : {}),
    }
    if (s.problem) {
      const limit = materialMaxBytes(s.ext)
      return {
        ...base,
        state: 'excluded',
        problem: s.problem,
        ...(s.problem === 'too-large' ? { limitMb: Math.round(limit / 1024 / 1024) } : {}),
        ...(s.problem === 'untitled' ? { saveAction: 'show' as const } : {}),
      }
    }
    if (s.unsaved) return { ...base, state: 'unsaved', saveAction: row.saveAction ?? 'show' }
    return { ...base, state: 'ready' }
  }

  private push(): void {
    if (!this.closed) this.deps.push(this.state())
  }

  /** the rows that count as listed material: not left out (or still being read) */
  private listedRows(): Row[] {
    return this.rows.filter((r) => !r.status?.problem)
  }

  /** 8.6: the conversions on offer — exactly one listed material, of a matching type */
  private conversions(): ConvertKind[] {
    if (!this.deps.convert || !this.deps.openConvertedTab) return []
    const listed = this.listedRows()
    if (listed.length !== 1 || !('path' in listed[0]!.ref)) return []
    return availableConversions([listed[0]!.ref.path])
  }

  /** the chosen conversion while it is still on offer */
  private chosenConversion(conversions: readonly ConvertKind[]): ConvertKind | null {
    return this.mode === 'convert' && this.convertKind && conversions.includes(this.convertKind)
      ? this.convertKind
      : null
  }

  private appendRefs(refs: readonly MaterialRef[]): Row[] {
    const added: Row[] = []
    for (const ref of refs) {
      if ('path' in ref && (typeof ref.path !== 'string' || !ref.path)) continue
      const key = keyOf(ref)
      if (this.rows.some((r) => r.key === key)) continue
      const row: Row = { key, ref, status: null }
      this.rows.push(row)
      added.push(row)
    }
    return added
  }

  /** read one row again; a row removed meanwhile is left alone */
  private async inspectRow(row: Row): Promise<void> {
    if ('untitled' in row.ref) {
      const { webContentsId, title } = row.ref.untitled
      const savedPath = await this.deps.pathOfUntitled(webContentsId).catch(() => null)
      if (savedPath) {
        const key = materialKey(savedPath)
        if (this.rows.some((r) => r !== row && r.key === key)) {
          this.rows = this.rows.filter((r) => r !== row)
          return
        }
        row.ref = { path: savedPath }
        row.key = key
      } else {
        row.status = untitledMaterial(webContentsId, title)
        return
      }
    }
    const path = (row.ref as { path: string }).path
    const status = await this.deps.inspect(path)
    const saveAction = status.unsaved
      ? await this.deps.saveActionFor(path).catch(() => 'show' as const)
      : undefined
    // only a markdown file that could be converted to a map is asked about its withheld spans
    const notice = this.deps.redactionNotice
    const marked =
      !!notice &&
      !status.problem &&
      !status.unsaved &&
      availableConversions([path]).includes('markdown-to-mindmap')
        ? await notice(path).catch(() => false)
        : false
    if (!this.rows.includes(row)) return
    row.status = { ...status, key: row.key }
    row.saveAction = saveAction
    row.marked = marked
  }

  private async inspectRows(rows: readonly Row[]): Promise<void> {
    this.inFlight++
    this.push()
    try {
      await Promise.all(rows.map((row) => this.inspectRow(row)))
    } finally {
      this.inFlight--
      this.push()
    }
  }

  /** read every row again (window focus, after a save, before "make") */
  async refresh(): Promise<void> {
    await this.inspectRows([...this.rows])
  }

  setKind(kind: unknown): void {
    if (!isAiTargetKind(kind) || this.making) return
    this.kind = kind
    this.mode = 'ai'
    this.failure = null
    this.push()
  }

  /** 8.6: choose a conversion on offer, or null for back to the AI kinds */
  setConvert(kind: unknown): void {
    if (this.making) return
    if (kind === null) {
      this.mode = 'ai'
    } else {
      if (!isConvertKind(kind) || !this.conversions().includes(kind)) return
      this.mode = 'convert'
      this.convertKind = kind
    }
    this.failure = null
    this.convertProblem = null
    this.push()
  }

  async addPaths(paths: readonly unknown[]): Promise<void> {
    if (this.making) return
    this.failure = null
    const refs = paths
      .filter((p): p is string => typeof p === 'string' && !!p)
      .map((path) => ({ path }))
    const added = this.appendRefs(refs)
    if (added.length > 0) await this.inspectRows(added)
    else this.push()
  }

  remove(key: unknown): void {
    if (typeof key !== 'string' || this.making) return
    this.rows = this.rows.filter((r) => r.key !== key)
    this.failure = null
    this.push()
  }

  async save(key: unknown): Promise<void> {
    const row = this.rows.find((r) => r.key === key)
    if (!row || this.making || this.saving.has(row.key)) return
    this.failure = null
    if ('untitled' in row.ref) {
      await this.deps.showUntitled(row.ref.untitled.webContentsId)
      this.push()
      return
    }
    const rowKey = row.key
    this.saving.add(rowKey)
    this.push()
    let result: 'saved' | 'shown' | 'failed'
    try {
      result = await this.deps.saveMaterial(row.ref.path)
    } catch {
      result = 'failed'
    }
    this.saving.delete(rowKey)
    if (result === 'failed') this.failure = 'save'
    await this.inspectRows([row])
    // a tab can report its clean state a moment after the write lands
    if (result === 'saved' && row.status?.unsaved) {
      await new Promise((r) => setTimeout(r, this.deps.recheckDelayMs ?? 600))
      if (this.rows.includes(row)) await this.inspectRows([row])
    }
  }

  /**
   * "make": read everything again, then open the new tab with the request
   * queued for it and close the window. False (and nothing opened) when the
   * materials do not allow it any more.
   */
  async make(text: unknown): Promise<boolean> {
    if (this.closed || this.making || typeof text !== 'string') return false
    this.making = true
    this.failure = null
    this.push()
    try {
      await this.refresh()
      if (this.mode === 'convert') {
        const convertKind = this.chosenConversion(this.conversions())
        return convertKind ? await this.convertAndOpen(convertKind) : this.stopMaking(false)
      }
      const candidates = this.rows.filter((r) => r.status && !r.status.problem && 'path' in r.ref)
      const prepared = await prepareGenerateRequest(
        {
          mode: 'ai',
          kind: this.kind,
          materials: candidates.map((r) => (r.ref as { path: string }).path),
          text,
        },
        (path) => this.deps.inspect(path),
      )
      if (!prepared.ok) return this.stopMaking(false)
      const trimmed = text.trim()
      const handoff: GenerateHandoff = {
        id: this.deps.newId(),
        mode: 'ai',
        target: this.kind,
        materials: prepared.ready.map((s) => ({ path: s.path!, name: s.name })),
        text: trimmed || defaultGeneratePrompt(this.deps.lang(), this.kind),
        defaultText: !trimmed,
        createdAt: this.deps.now(),
      }
      this.deps.openTargetTab(handoff)
      this.closed = true
      this.deps.close()
      return true
    } catch {
      this.failure = 'make'
      return this.stopMaking(false)
    }
  }

  /**
   * 8.6: the one material, read again just now (8.4: not open with unsaved
   * changes, saved at least once), converted without AI and opened as a new
   * unsaved tab. A failed conversion opens nothing and keeps the window.
   */
  private async convertAndOpen(kind: ConvertKind): Promise<boolean> {
    const [row] = this.listedRows()
    if (!row || !('path' in row.ref) || !this.deps.convert || !this.deps.openConvertedTab) {
      return this.stopMaking(false)
    }
    const prepared = await prepareGenerateRequest(
      { mode: 'convert', kind, materials: [row.ref.path], text: '' },
      (path) => this.deps.inspect(path),
    )
    if (!prepared.ok) return this.stopMaking(false)
    const source = prepared.request.materials[0]!
    const result = await this.deps.convert(kind, source)
    if (!result.ok) {
      this.failure = 'convert'
      this.convertProblem = result.problem
      return this.stopMaking(false)
    }
    this.deps.openConvertedTab({
      id: this.deps.newId(),
      content: result.content,
      sources: [source],
      createdAt: this.deps.now(),
    })
    this.closed = true
    this.deps.close()
    return true
  }

  private stopMaking(result: boolean): boolean {
    this.making = false
    this.push()
    return result
  }
}
