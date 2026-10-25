/**
 * Chapter split (spec §5): one XHTML file per level-1 heading; level 2 when
 * there is no level-1 heading; one file when there is neither.
 */
import type { HeadingBlock, TreeBlock } from '../tree/types'

export interface Chapter {
  /** the heading that opened the chapter; absent on front matter / single-file books */
  heading?: HeadingBlock
  blocks: TreeBlock[]
}

/**
 * a bilingual tree's translated block right after its original: it belongs
 * with the original (same chapter, same nav entry, same list item)
 */
export const isPairedTranslation = (block: TreeBlock, previous: TreeBlock | undefined): boolean =>
  block.translationOf !== undefined && previous?.id === block.translationOf

/** iterate blocks with the previous non-page-break block */
export function* withPrevious(
  blocks: readonly TreeBlock[],
): Generator<[TreeBlock, TreeBlock | undefined]> {
  let previous: TreeBlock | undefined
  for (const b of blocks) {
    yield [b, previous]
    if (b.kind !== 'pageBreak') previous = b
  }
}

export function splitLevel(blocks: readonly TreeBlock[]): 1 | 2 | undefined {
  let has2 = false
  for (const [b, prev] of withPrevious(blocks)) {
    if (b.kind !== 'heading' || isPairedTranslation(b, prev)) continue
    if (b.level === 1) return 1
    if (b.level === 2) has2 = true
  }
  return has2 ? 2 : undefined
}

/**
 * One XHTML file per original page (the "start each page on a new screen"
 * option). A page marker opens the next file; markers before any content of
 * the chapter (the carry in splitChapters) stay with the chapter's first
 * page, and consecutive markers (an empty page) merge into the next page.
 */
export function splitPages(chapters: readonly Chapter[]): Chapter[] {
  const out: Chapter[] = []
  for (const ch of chapters) {
    let current: Chapter = {
      ...(ch.heading ? { heading: ch.heading } : {}),
      blocks: [],
    }
    for (const b of ch.blocks) {
      if (b.kind === 'pageBreak' && current.blocks.some((x) => x.kind !== 'pageBreak')) {
        out.push(current)
        current = { blocks: [b] }
      } else {
        current.blocks.push(b)
      }
    }
    out.push(current)
  }
  return out
}

export function splitChapters(blocks: readonly TreeBlock[]): Chapter[] {
  const level = splitLevel(blocks)
  const chapters: Chapter[] = []
  let current: Chapter = { blocks: [] }
  for (const [b, prev] of withPrevious(blocks)) {
    if (level && b.kind === 'heading' && b.level === level && !isPairedTranslation(b, prev)) {
      // page markers right before the heading open the new chapter
      const carry: TreeBlock[] = []
      while (current.blocks[current.blocks.length - 1]?.kind === 'pageBreak') {
        carry.unshift(current.blocks.pop()!)
      }
      if (current.heading || current.blocks.length > 0) chapters.push(current)
      current = { heading: b, blocks: [...carry, b] }
    } else {
      current.blocks.push(b)
    }
  }
  if (current.heading || current.blocks.length > 0 || chapters.length === 0) chapters.push(current)
  return chapters
}
