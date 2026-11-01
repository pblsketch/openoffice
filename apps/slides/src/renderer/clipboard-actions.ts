/**
 * Clipboard and format-painter actions extracted from App.tsx:
 * element copy/cut/paste/duplicate, slide copy/paste, external clipboard
 * ingestion, and the format painter. Functions take the ActionCtx built fresh per call.
 */
import type { ActionCtx } from './action-context'
import type { PasteSlideMode, PasteSlideResult } from '../shared/ipc'
import { rangeSelection } from '../shared/slide-selection'
import { mergeSlideUpdate } from '../shared/slide-update'
import { FIT_WIDTH } from './app-constants'
import { renderSlidesToPngBase64 } from './export-render'
import { renderSelectionToPngBase64 } from './selection-image'
import type { RenderSlide } from '@genoffice/pptx-render'
import { extractBrushFormat, computeBrushApply, type BrushFormat } from './format-brush'
import { batched } from './history-batch'
import { t } from './i18n/locale'
import { rememberRepeat } from './repeat-action'
import { applySelectionRunFormat, selectionRunFormat } from './TextEditOverlay'

export async function deleteSelected(ctx: ActionCtx): Promise<void> {
  if (ctx.selectedIds.length) {
    const updated = await window.slidesApi.deleteElements({
      slideIndex: ctx.current,
      sourceIds: ctx.selectedIds,
    })
    if (updated) ctx.applySlide(ctx.current, updated)
  }
  ctx.setSelectedIds([])
}

export async function copySelected(ctx: ActionCtx): Promise<void> {
  if (ctx.selectedIds.length === 0) return
  const clipboardToken = crypto.randomUUID()
  const sourceIds = [...ctx.selectedIds]
  const n = await window.slidesApi.copyElements({
    slideIndex: ctx.current,
    sourceIds,
    clipboardToken,
  })
  if (n > 0) {
    ctx.setHasClipboard(true)
    ctx.setStatus(t('appStatusCopied', { count: n }))
    if (ctx.slide) {
      try {
        const png = await renderSelectionToPngBase64(ctx.slide, sourceIds, ctx.images)
        await window.slidesApi.copyElementsImage(clipboardToken, png)
      } catch {
        // The editable copy is already available if rendering or image decoding fails.
      }
    }
  }
}

export async function cutSelected(ctx: ActionCtx): Promise<void> {
  if (ctx.selectedIds.length === 0) return
  const n = await window.slidesApi.copyElements({
    slideIndex: ctx.current,
    sourceIds: ctx.selectedIds,
    cut: true,
  })
  if (n > 0) {
    ctx.setHasClipboard(true)
    await deleteSelected(ctx)
    ctx.setStatus(t('appStatusCut', { count: n }))
  }
}

/** Insert an external image at PowerPoint's dpi-aware size (main's pictureFrame), centered on the page or `atPx`. */
export async function insertExternalImage(
  ctx: ActionCtx,
  base64: string,
  ext: string,
  atPx?: { x: number; y: number },
): Promise<void> {
  const naturalPx = await new Promise<{ width: number; height: number }>((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 320, height: img.naturalHeight || 240 })
    img.onerror = () => resolve({ width: 320, height: 240 })
    img.src = `data:image/${ext};base64,${base64}`
  })
  const r = await window.slidesApi.addImageBytes({
    slideIndex: ctx.current,
    base64,
    ext,
    naturalPx,
    ...(atPx ? { centerPx: atPx } : {}),
    fitWidthPx: FIT_WIDTH,
  })
  if (!r) return
  if ('error' in r) {
    ctx.setSelectedIds([])
    ctx.setStatus(t('appStatusImageUnsupported', { ext: r.ext.toUpperCase() }))
    return
  }
  ctx.applySlide(ctx.current, r.slide)
  ctx.setSelectedIds([r.sourceId])
}

export async function copySlides(ctx: ActionCtx, indexes: number[]): Promise<void> {
  const sel = [...new Set(indexes)].sort((a, b) => a - b).filter((i) => ctx.slides[i])
  if (!sel.length) return
  // Renderings ride along for 'picture'-mode pastes (the source deck may be
  // gone by paste time). Copy still succeeds if the capture fails.
  let pngs: string[] | undefined
  try {
    pngs = await renderSlidesToPngBase64(
      sel.map((i) => ctx.slides[i]!),
      ctx.images,
    )
  } catch {
    pngs = undefined
  }
  const ok = await window.slidesApi.copySlides({ slideIndexes: sel, ...(pngs ? { pngs } : {}) })
  ctx.setCanPasteSlide(ok)
  ctx.setStatus(ok ? t('appStatusSlideCopied') : t('appStatusSlideCopyFailed'))
}

function applySlidePaste(ctx: ActionCtx, r: PasteSlideResult, mode: PasteSlideMode): void {
  ctx.setSlides((slides) => mergeSlideUpdate(slides, r))
  ctx.setCurrent(r.index)
  ctx.setSelectedSlides(rangeSelection(r.index, r.index + Math.max(r.count - 1, 0)))
  ctx.setSelectedIds(r.sourceIds ?? [])
  ctx.setEditing(null)
  ctx.setDirty(true)
  ctx.setPasteFloater({ index: r.index, mode })
}

export async function pasteSlideAfter(
  ctx: ActionCtx,
  index: number,
  mode: PasteSlideMode = 'theme',
): Promise<void> {
  const r = await window.slidesApi.pasteSlide({ afterIndex: index, fitWidthPx: FIT_WIDTH, mode })
  if (!r) {
    ctx.setStatus(t('appStatusSlidePasteFailed'))
    return
  }
  applySlidePaste(ctx, r, mode)
}

/** Paste-options floater: redo the just-completed paste with another mode. */
export async function repasteSlideAs(ctx: ActionCtx, mode: PasteSlideMode): Promise<void> {
  if (ctx.pasteFloater?.mode === mode) return
  const r = await window.slidesApi.repasteSlide({ mode, fitWidthPx: FIT_WIDTH })
  if (!r) {
    ctx.setPasteFloater(null)
    ctx.setStatus(t('appStatusPasteOptionsExpired'))
    return
  }
  applySlidePaste(ctx, r, mode)
}

/**
 * Paste: whole slide (slide marker newest) → app elements (element marker not
 * overwritten externally) → external images → external text into a text box
 */
/**
 * OS clipboard text is attacker-influenced input: cap the expansion before
 * building the addElement op (a multi-MB paste would blow up IPC + engine).
 */
export const MAX_PASTE_TEXT_CHARS = 1_000_000
export const MAX_PASTE_PARAGRAPHS = 50_000

export function pasteParagraphs(text: string): {
  paragraphs: { runs: { text: string }[] }[]
  truncated: boolean
} {
  const lines = text.slice(0, MAX_PASTE_TEXT_CHARS).split(/\r?\n/)
  const kept = lines.slice(0, MAX_PASTE_PARAGRAPHS)
  return {
    paragraphs: kept.map((line) => ({ runs: [{ text: line }] })),
    truncated: text.length > MAX_PASTE_TEXT_CHARS || kept.length < lines.length,
  }
}

export async function pasteClipboard(ctx: ActionCtx): Promise<void> {
  const external = await window.slidesApi.clipboardExternal()
  if (external.kind === 'slide') {
    await pasteSlideAfter(ctx, Math.max(...ctx.selectedSlides, ctx.current))
    return
  }
  if (external.kind === 'image') {
    await insertExternalImage(ctx, external.base64, external.ext)
    return
  }
  if (external.kind === 'text') {
    const w = 400
    const { paragraphs, truncated } = pasteParagraphs(external.text)
    const r = await window.slidesApi.addElement({
      slideIndex: ctx.current,
      kind: 'textbox',
      xPx: ((ctx.slide?.widthPx ?? FIT_WIDTH) - w) / 2,
      yPx: (ctx.slide?.heightPx ?? FIT_WIDTH * 0.5625) / 2 - 40,
      wPx: w,
      hPx: 80,
      fitWidthPx: FIT_WIDTH,
      paragraphs,
    })
    if (r) {
      ctx.applySlide(ctx.current, r.slide)
      ctx.setSelectedIds([r.sourceId])
      if (truncated) ctx.setStatus(t('appStatusPasteTruncated'))
    }
    return
  }
  const r = await window.slidesApi.pasteElements({ slideIndex: ctx.current, fitWidthPx: FIT_WIDTH })
  if (r) {
    ctx.applySlide(ctx.current, r.slide)
    ctx.setSelectedIds(r.sourceIds)
    ctx.setEditing(null)
  }
}

/** Duplicate in place (⌘D / Option+drag copy): doesn't touch the app clipboard, the copy becomes selected. */
export async function duplicateSelected(
  ctx: ActionCtx,
  ids: string[],
  dxPx = 16,
  dyPx = 16,
): Promise<void> {
  if (!ids.length) return
  // F4 repeats with the same offset (a drag copy then F4 steps out a row of copies)
  rememberRepeat((c) => duplicateSelected(c, c.selectedIds, dxPx, dyPx))
  const r = await window.slidesApi.duplicateElements({
    slideIndex: ctx.current,
    sourceIds: ids,
    dxPx,
    dyPx,
    fitWidthPx: FIT_WIDTH,
  })
  if (r) {
    ctx.applySlide(ctx.current, r.slide)
    ctx.setSelectedIds(r.sourceIds)
  }
}

// ── Format painter operations ───────────────────────────────────────────────

/**
 * What the painter picks up: while editing with text selected, the character format of
 * that text (PowerPoint copies the selection's format, not the box's); otherwise the
 * format of the single selected element. null when nothing paintable is selected.
 */
function selectedFormat(ctx: ActionCtx): BrushFormat | null {
  if (ctx.editing || ctx.editingCell) {
    const run = selectionRunFormat()
    if (run) {
      return {
        sourceType: 'text',
        run: {
          ...(run.fontFamily ? { fontFamily: run.fontFamily } : {}),
          ...(run.fontSizePt ? { fontSize: run.fontSizePt } : {}),
          bold: run.bold,
          italic: run.italic,
          underline: run.underline,
          strike: run.strike,
          ...(run.color ? { color: run.color } : {}),
        },
      }
    }
  }
  if (ctx.selectedIds.length !== 1 || !ctx.slide) return null
  const node = ctx.findNodeCtx(ctx.selectedIds[0]!)?.node
  return node ? extractBrushFormat(node, ctx.slide.scale) : null
}

/**
 * Paint fmt onto the given elements as one undo step. Group children go through their
 * group; effects have no in-group path, so a group child keeps its own effects.
 */
async function paintElements(ctx: ActionCtx, fmt: BrushFormat, ids: string[]): Promise<void> {
  const slideIndex = ctx.current
  const api = window.slidesApi
  let last: RenderSlide | null = null
  const keep = (r: RenderSlide | null) => {
    if (r) last = r
  }
  await batched(async () => {
    for (const id of ids) {
      const found = ctx.findNodeCtx(id)
      if (!found) continue
      const plan = computeBrushApply(fmt, found.node)
      const g = found.groupId ? { groupId: found.groupId } : {}
      if (plan.fill !== undefined) {
        keep(await api.editFill({ slideIndex, sourceId: id, fill: plan.fill, ...g }))
      }
      if (plan.stroke !== undefined) {
        keep(await api.editStroke({ slideIndex, sourceId: id, stroke: plan.stroke, ...g }))
      }
      if (plan.effects && !found.groupId) {
        keep(await api.setEffects({ slideIndex, sourceId: id, effects: plan.effects }))
      }
      if (plan.runFormat) {
        const r = plan.runFormat
        keep(
          await api.setElementFont({
            slideIndex,
            sourceIds: [id],
            ...(r.fontFamily ? { fontFamily: r.fontFamily } : {}),
            ...(r.fontSize ? { fontSizePt: r.fontSize } : {}),
            bold: !!r.bold,
            italic: !!r.italic,
            underline: !!r.underline,
            strike: !!r.strike,
            ...(r.color ? { color: r.color.slice(0, 7) } : {}),
            ...g,
          }),
        )
      }
      if (plan.align) {
        keep(
          await api.setElementParagraphFormat({
            slideIndex,
            sourceIds: [id],
            align: plan.align,
            ...g,
          }),
        )
      }
    }
  })
  if (last) {
    ctx.applySlide(slideIndex, last)
    ctx.setDirty(true)
  }
}

/** ⌘⇧C: copy the selected single element's format to the clipboard (without entering paste mode) */
export function copyFormat(ctx: ActionCtx): void {
  const fmt = selectedFormat(ctx)
  if (fmt) {
    ctx.setBrushFormat(fmt)
    ctx.setStatus(t('appStatusFormatCopied'))
  }
}

/** ⌘⇧V: paste format onto selected elements (format must have been copied first) */
export async function pasteFormat(ctx: ActionCtx): Promise<void> {
  const fmt = ctx.brushFormat
  if (!fmt || ctx.selectedIds.length === 0 || !ctx.slide) return
  rememberRepeat((c) => paintElements(c, fmt, c.selectedIds))
  await paintElements(ctx, fmt, ctx.selectedIds)
  ctx.setStatus(t('appStatusFormatPasted'))
}

/** Format painter button single click: copy current format + enter single-paste mode */
export function onFormatBrushClick(ctx: ActionCtx): void {
  const fmt = selectedFormat(ctx)
  if (!fmt) return
  ctx.setBrushFormat(fmt)
  ctx.setBrushMode('once')
  ctx.setStatus(t('appStatusBrushOnce'))
}

/** Format painter button double click: enter continuous mode */
export function onFormatBrushDoubleClick(ctx: ActionCtx): void {
  const fmt = selectedFormat(ctx)
  if (!fmt) return
  ctx.setBrushFormat(fmt)
  ctx.setBrushMode('continuous')
  ctx.setStatus(t('appStatusBrushContinuous'))
}

/**
 * Painter armed while editing: a finished text selection takes the copied character
 * format. Returns whether it painted.
 */
export function applyBrushToTextSelection(ctx: ActionCtx): boolean {
  const run = ctx.brushFormat?.run
  if (!run || !(ctx.editing || ctx.editingCell)) return false
  const painted = applySelectionRunFormat({
    ...(run.fontFamily ? { fontFamily: run.fontFamily } : {}),
    ...(run.fontSize ? { fontSizePt: run.fontSize } : {}),
    bold: !!run.bold,
    italic: !!run.italic,
    underline: !!run.underline,
    strike: !!run.strike,
    ...(run.color ? { color: run.color.slice(0, 7) } : {}),
  })
  if (painted && ctx.brushMode === 'once') {
    ctx.setBrushMode(null)
    ctx.setStatus(t('appStatusFormatApplied'))
  }
  return painted
}

/** Apply format when an element is clicked in format painter mode */
export async function applyBrushToElement(ctx: ActionCtx, targetId: string): Promise<void> {
  const fmt = ctx.brushFormat
  if (!fmt || !ctx.slide) return
  rememberRepeat((c) => paintElements(c, fmt, c.selectedIds))
  await paintElements(ctx, fmt, [targetId])

  if (ctx.brushMode === 'once') {
    ctx.setBrushMode(null)
    ctx.setStatus(t('appStatusFormatApplied'))
  }
}
