/**
 * Translated and bilingual trees (spec §1, §8): the same DocumentTree format
 * with text swapped in, so the Markdown / EPUB writers take all three.
 *
 * Translation units and their keys:
 *   heading / paragraph / list item / caption / footnote paragraph → block id
 *   table cell paragraph → `${tableId}#${row}.${col}.${paragraphIndex}`
 * A translated block gets id `${id}@${lang}`, `translationOf` and `lang`.
 * Units without a translation keep the original block unchanged.
 */
import type {
  CaptionBlock,
  DocumentTree,
  FootnoteDef,
  InlineRun,
  ParagraphBlock,
  TableBlock,
  TreeBlock,
} from './types'

export interface TextUnit {
  key: string
  runs: InlineRun[]
  /** the block the unit belongs to (the table for cell units) */
  blockId: string
  page: number
  pageFingerprint: string
}

export type Translations = ReadonlyMap<string, InlineRun[]>

export const cellKey = (tableId: string, row: number, col: number, k: number): string =>
  `${tableId}#${row}.${col}.${k}`

/** every translatable unit in reading order (body, then footnotes) */
export function textUnits(tree: DocumentTree): TextUnit[] {
  const out: TextUnit[] = []
  const add = (
    key: string,
    runs: InlineRun[],
    b: { id: string; page: number; pageFingerprint: string },
  ) => out.push({ key, runs, blockId: b.id, page: b.page, pageFingerprint: b.pageFingerprint })
  for (const b of tree.blocks) {
    if (b.kind === 'heading' || b.kind === 'paragraph' || b.kind === 'listItem')
      add(b.id, b.runs, b)
    if ((b.kind === 'image' || b.kind === 'table') && b.caption)
      add(b.caption.id, b.caption.runs, b.caption)
    if (b.kind === 'table') {
      for (const c of b.table.cells) {
        c.paragraphs.forEach((runs, k) => add(cellKey(b.id, c.row, c.col, k), runs, b))
      }
    }
  }
  for (const f of tree.footnotes) for (const p of f.blocks) add(p.id, p.runs, p)
  return out
}

const marked = <T extends { id: string }>(
  b: T,
  lang: string,
): T & { translationOf: string; lang: string } => ({
  ...b,
  id: `${b.id}@${lang}`,
  translationOf: b.id,
  lang,
})

function translateCaption(
  c: CaptionBlock | undefined,
  lang: string,
  tr: Translations,
): CaptionBlock | undefined {
  const runs = c && tr.get(c.id)
  return c && runs ? { ...marked(c, lang), runs } : undefined
}

/** translated copy of a block, or null when nothing in it is translated */
function translateBlock(b: TreeBlock, lang: string, tr: Translations): TreeBlock | null {
  switch (b.kind) {
    case 'heading':
    case 'paragraph':
    case 'listItem': {
      const runs = tr.get(b.id)
      return runs ? { ...marked(b, lang), runs } : null
    }
    case 'table': {
      let any = false
      const cells = b.table.cells.map((c) => ({
        ...c,
        paragraphs: c.paragraphs.map((runs, k) => {
          const t = tr.get(cellKey(b.id, c.row, c.col, k))
          if (t) any = true
          return t ?? runs
        }),
      }))
      const caption = translateCaption(b.caption, lang, tr)
      if (!any && !caption) return null
      const out: TableBlock = { ...marked(b, lang), table: { ...b.table, cells } }
      if (caption) out.caption = caption
      else delete out.caption
      return out
    }
    case 'image': {
      const caption = translateCaption(b.caption, lang, tr)
      return caption ? { ...marked(b, lang), caption } : null
    }
    default:
      return null
  }
}

function translateFootnote(
  f: FootnoteDef,
  lang: string,
  tr: Translations,
  bilingual: boolean,
): FootnoteDef {
  const blocks: ParagraphBlock[] = []
  for (const p of f.blocks) {
    const runs = tr.get(p.id)
    const translated: ParagraphBlock | null = runs ? { ...marked(p, lang), runs } : null
    if (bilingual) blocks.push(p, ...(translated ? [translated] : []))
    else blocks.push(translated ?? p)
  }
  return { ...f, blocks }
}

/** every translated unit replaces its original text */
export function deriveTranslatedTree(
  tree: DocumentTree,
  lang: string,
  tr: Translations,
): DocumentTree {
  return {
    ...tree,
    variant: 'translated',
    targetLanguage: lang,
    blocks: tree.blocks.map((b) => translateBlock(b, lang, tr) ?? b),
    footnotes: tree.footnotes.map((f) => translateFootnote(f, lang, tr, false)),
  }
}

/**
 * each original block is followed by its translation. Images are not
 * repeated: a translated caption rides on the image as `captionTranslation`.
 */
export function deriveBilingualTree(
  tree: DocumentTree,
  lang: string,
  tr: Translations,
): DocumentTree {
  const blocks: TreeBlock[] = []
  for (const b of tree.blocks) {
    const translated = translateBlock(b, lang, tr)
    if (b.kind === 'image') {
      blocks.push(
        translated?.kind === 'image' ? { ...b, captionTranslation: translated.caption } : b,
      )
      continue
    }
    blocks.push(b)
    if (translated) blocks.push(translated)
  }
  return {
    ...tree,
    variant: 'bilingual',
    targetLanguage: lang,
    blocks,
    footnotes: tree.footnotes.map((f) => translateFootnote(f, lang, tr, true)),
  }
}
