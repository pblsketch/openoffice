/**
 * Transition and animation actions extracted from App.tsx.
 * Functions take the ActionCtx built fresh per call.
 */
import type { ShapeRenderNode } from '@genoffice/pptx-render'
import type { AnimEffectKind, AnimTrigger, AnimationItem, TransitionKind } from '../shared/ipc'
import type { ActionCtx } from './action-context'
import { animClassOf, animGalleryItem } from './animation-play'
import { t } from './i18n/locale'

export async function applyTransition(
  ctx: ActionCtx,
  kind: TransitionKind,
  allSlides: boolean,
): Promise<void> {
  const ok = await window.slidesApi.setTransition({
    slideIndex: allSlides ? -1 : ctx.current,
    kind,
  })
  if (ok) {
    ctx.setTransition(kind)
    ctx.setDirty(true)
    ctx.setStatus(allSlides ? t('appStatusTransitionAll') : t('appStatusTransitionSet'))
  }
}

/** Default durations for each PowerPoint effect. */
export function animDefaultDur(effect: AnimEffectKind): number {
  return effect === 'appear' || effect === 'disappear' || animClassOf(effect) === 'media'
    ? 0
    : effect === 'spin' || effect === 'grow' || effect === 'bounce' || effect === 'motionPath'
      ? 2000
      : effect === 'pulse' || effect === 'teeter'
        ? 1000
        : 500
}

/** Hover preview: play the hovered effect on the selected shapes without committing it */
export function hoverPreviewAnimation(
  ctx: ActionCtx,
  effect: AnimEffectKind,
  motionPath?: string,
): void {
  if (ctx.selectedIds.length === 0) return
  const items: AnimationItem[] = ctx.selectedIds.map((id) => ({
    sourceId: id,
    targetName: '',
    ...animGalleryItem(effect),
    trigger: 'onClick' as AnimTrigger,
    durationMs: animDefaultDur(effect),
    delayMs: 0,
    ...(motionPath ? { motionPath } : {}),
  }))
  ctx.setHoverAnim({ nonce: Date.now(), items })
}

/** Commit the whole page's animation list overwrite-style, then read back on success (target names/stale items per the main process). */
export async function commitAnimations(ctx: ActionCtx, items: AnimationItem[]): Promise<void> {
  const ok = await window.slidesApi.setAnimations({
    slideIndex: ctx.current,
    items: items.map(({ targetName: _t, ...rest }) => rest),
  })
  if (!ok) return
  ctx.setDirty(true)
  ctx.setAnimations(await window.slidesApi.getAnimations(ctx.current))
}

/** Paragraph count of a text-bearing node ("by paragraph" animation splitting). */
export function paraCountOf(ctx: ActionCtx, id: string): number {
  const node = ctx.findNodeCtx(id)?.node
  const text =
    node && (node.type === 'text' || node.type === 'shape')
      ? (node as ShapeRenderNode).text
      : undefined
  if (!text) return 0
  return text.lines.filter((l) => l.paraStart !== false).length
}

/** Gallery click: replace all animations of the selected shape; 'none' only removes. */
export function applyAnimation(ctx: ActionCtx, effect: AnimEffectKind | 'none'): void {
  if (ctx.selectedIds.length === 0) return
  const sel = new Set(ctx.selectedIds)
  const kept = ctx.animations.filter((a) => !sel.has(a.sourceId))
  const added =
    effect === 'none'
      ? []
      : ctx.selectedIds.flatMap((id) => {
          const base = {
            sourceId: id,
            targetName: '',
            ...animGalleryItem(effect),
            trigger: 'onClick' as AnimTrigger,
            durationMs: animDefaultDur(effect),
            delayMs: 0,
          }
          const n = ctx.animByParagraph ? paraCountOf(ctx, id) : 0
          return n > 1 ? Array.from({ length: n }, (_, i) => ({ ...base, paragraph: i })) : [base]
        })
  ctx.setSelAnim(-1)
  void commitAnimations(ctx, [...kept, ...added])
  ctx.setStatus(effect === 'none' ? t('appStatusAnimRemoved') : t('appStatusAnimSet'))
}

/** "Add animation": append at the end of the list (existing animations kept). */
export function addAnimation(ctx: ActionCtx, effect: AnimEffectKind): void {
  if (ctx.selectedIds.length === 0) return
  const added = ctx.selectedIds.flatMap((id) => {
    const base = {
      sourceId: id,
      targetName: '',
      ...animGalleryItem(effect),
      trigger: 'onClick' as AnimTrigger,
      durationMs: animDefaultDur(effect),
      delayMs: 0,
    }
    const n = ctx.animByParagraph ? paraCountOf(ctx, id) : 0
    return n > 1 ? Array.from({ length: n }, (_, i) => ({ ...base, paragraph: i })) : [base]
  })
  void commitAnimations(ctx, [...ctx.animations, ...added])
  ctx.setStatus(t('appStatusAnimAdded'))
}

/** "Motion path": append an animation moving the selected shape along a preset path. */
export function applyMotionPath(ctx: ActionCtx, path: string): void {
  if (ctx.selectedIds.length === 0) return
  const added = ctx.selectedIds.map((id) => ({
    sourceId: id,
    targetName: '',
    effect: 'motionPath' as AnimEffectKind,
    trigger: 'onClick' as AnimTrigger,
    durationMs: animDefaultDur('motionPath'),
    delayMs: 0,
    motionPath: path,
  }))
  void commitAnimations(ctx, [...ctx.animations, ...added])
  ctx.setStatus(t('appStatusMotionPathAdded'))
}

export function patchAnimTiming(
  ctx: ActionCtx,
  patch: { trigger?: AnimTrigger; durationMs?: number; delayMs?: number },
): void {
  if (ctx.timingIdx < 0) return
  const next = ctx.animations.map((a, i) => (i === ctx.timingIdx ? { ...a, ...patch } : a))
  void commitAnimations(ctx, next)
}

export function moveAnimation(ctx: ActionCtx, idx: number, dir: -1 | 1): void {
  const j = idx + dir
  if (idx < 0 || j < 0 || idx >= ctx.animations.length || j >= ctx.animations.length) return
  const next = [...ctx.animations]
  ;[next[idx], next[j]] = [next[j]!, next[idx]!]
  if (ctx.selAnim === idx) ctx.setSelAnim(j)
  else if (ctx.selAnim === j) ctx.setSelAnim(idx)
  void commitAnimations(ctx, next)
}

export function deleteAnimation(ctx: ActionCtx, idx: number): void {
  if (idx < 0 || idx >= ctx.animations.length) return
  if (ctx.selAnim === idx) ctx.setSelAnim(-1)
  else if (ctx.selAnim > idx) ctx.setSelAnim(ctx.selAnim - 1)
  void commitAnimations(
    ctx,
    ctx.animations.filter((_, i) => i !== idx),
  )
}

/**
 * The animations the painter lays onto target: source effects in order, with sourceId
 * moved to the target. A by-paragraph effect (a run of items with the same effect and
 * consecutive paragraph numbers) is spread over the target's own paragraphs — a target
 * without text gets it once for the whole shape. Media commands only reach media targets.
 * Pure function, exported for tests.
 */
export function paintedAnimations(
  source: AnimationItem[],
  targetId: string,
  targetParas: number,
  targetIsMedia: boolean,
): AnimationItem[] {
  const out: AnimationItem[] = []
  const media = new Set<AnimEffectKind>(['mediaPlay', 'mediaPause', 'mediaStop'])
  let i = 0
  while (i < source.length) {
    const first = source[i]!
    if (first.paragraph == null) {
      if (!media.has(first.effect) || targetIsMedia) out.push({ ...first, sourceId: targetId })
      i++
      continue
    }
    const group = [first]
    while (
      i + group.length < source.length &&
      source[i + group.length]!.effect === first.effect &&
      source[i + group.length]!.paragraph === first.paragraph + group.length
    ) {
      group.push(source[i + group.length]!)
    }
    i += group.length
    if (targetParas <= 0) {
      const { paragraph: _p, ...whole } = first
      out.push({ ...whole, sourceId: targetId })
      continue
    }
    for (let p = 0; p < targetParas; p++) {
      const tpl = group[Math.min(p, group.length - 1)]!
      out.push({ ...tpl, sourceId: targetId, paragraph: p })
    }
  }
  return out
}

/** Animation painter button: copy the selected element's animations (once = one target, continuous = until Esc). */
export function armAnimPainter(ctx: ActionCtx, mode: 'once' | 'continuous'): void {
  if (ctx.selectedIds.length !== 1) return
  const src = ctx.selectedIds[0]!
  const items = ctx.animations.filter((a) => a.sourceId === src)
  if (!items.length) {
    ctx.setStatus(t('appStatusAnimPainterNone'))
    return
  }
  ctx.setAnimPainter({ slideIndex: ctx.current, sourceId: src, items, mode })
  ctx.setStatus(t(mode === 'once' ? 'appStatusAnimPainterOnce' : 'appStatusAnimPainterContinuous'))
}

/** Painter click on an element: replace its animations with the copied ones, appended to the end of the sequence (PowerPoint). */
export async function paintAnimationsOnto(ctx: ActionCtx, targetId: string): Promise<void> {
  const painter = ctx.animPainter
  if (!painter) return
  if (painter.slideIndex === ctx.current && targetId === painter.sourceId) return
  const node = ctx.findNodeCtx(targetId)?.node
  if (!node) return
  const copies = paintedAnimations(
    painter.items,
    targetId,
    paraCountOf(ctx, targetId),
    node.type === 'picture' && !!node.media,
  )
  if (!copies.length) return
  await commitAnimations(ctx, [...ctx.animations.filter((a) => a.sourceId !== targetId), ...copies])
  if (painter.mode === 'once') {
    ctx.setAnimPainter(null)
    ctx.setStatus(t('appStatusAnimPainted'))
  }
}
