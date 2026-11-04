import type { IRange } from '@univerjs/core'

/// What a ribbon merge button does to a selection, given the sheet's merges.
/// Univer's merge refuses any range that touches an existing merge ("The
/// ranges to be merged overlap with the existing merged cells"), so a title
/// row that was already merged made Merge & Center fail outright.
export type RibbonMergePlan =
  | { readonly kind: 'none' }
  | { readonly kind: 'unmerge'; readonly range: IRange }
  | { readonly kind: 'merge'; readonly range: IRange; readonly replacesMerges: boolean }

function intersects(a: IRange, b: IRange): boolean {
  return (
    a.startRow <= b.endRow &&
    b.startRow <= a.endRow &&
    a.startColumn <= b.endColumn &&
    b.startColumn <= a.endColumn
  )
}

function sameArea(a: IRange, b: IRange): boolean {
  return (
    a.startRow === b.startRow &&
    a.endRow === b.endRow &&
    a.startColumn === b.startColumn &&
    a.endColumn === b.endColumn
  )
}

/// The selection grown until no merge straddles its edge — Excel never lets
/// a merge be cut, and a merge that reaches past the selection is folded in.
export function expandOverMerges(selection: IRange, merges: readonly IRange[]): IRange {
  let box = {
    startRow: selection.startRow,
    endRow: selection.endRow,
    startColumn: selection.startColumn,
    endColumn: selection.endColumn,
  }
  let grown = true
  while (grown) {
    grown = false
    for (const merge of merges) {
      if (!intersects(box, merge)) continue
      const next = {
        startRow: Math.min(box.startRow, merge.startRow),
        endRow: Math.max(box.endRow, merge.endRow),
        startColumn: Math.min(box.startColumn, merge.startColumn),
        endColumn: Math.max(box.endColumn, merge.endColumn),
      }
      if (!sameArea(next, box)) {
        box = next
        grown = true
      }
    }
  }
  return box
}

/// Excel's Merge & Center / Merge Cells against what is already merged:
/// - Merge & Center on exactly one merged cell is its toggle: it unmerges.
/// - Merge Cells on exactly one merged cell has nothing left to do.
/// - Merged cells inside a larger selection are replaced by one merge over
///   the whole selection (only the upper-left value survives, as before).
export function planRibbonMerge(
  selection: IRange,
  merges: readonly IRange[],
  mode: 'center' | 'cells',
): RibbonMergePlan {
  const box = expandOverMerges(selection, merges)
  if (merges.some((merge) => sameArea(merge, box))) {
    return mode === 'center' ? { kind: 'unmerge', range: box } : { kind: 'none' }
  }
  if (box.startRow === box.endRow && box.startColumn === box.endColumn) return { kind: 'none' }
  return {
    kind: 'merge',
    range: box,
    replacesMerges: merges.some((merge) => intersects(merge, box)),
  }
}
