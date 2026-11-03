/** File names of picture exports (spec 5, 9.3), apart from Electron so the tests read them. */
import { basename, dirname, extname, join } from 'node:path'
import { safeFileNameBase } from '../shared/formats'

/**
 * Where the pictures of an export go. Every page (`perPage`: the export of all
 * pages, `convert` without `--page`) is one file per page, `<base>-p<n>.<ext>`
 * beside the chosen file, a one-page diagram too. One page picked (the page on
 * screen, `--page`) is the chosen file itself.
 */
export function pageFilePaths(
  chosen: string,
  ext: 'png' | 'svg',
  pageNumbers: readonly number[],
  perPage: boolean,
): string[] {
  if (!perPage && pageNumbers.length === 1) return [chosen]
  const dir = dirname(chosen)
  let base = basename(chosen)
  if (extname(base).toLowerCase() === `.${ext}`) base = base.slice(0, -ext.length - 1)
  base = safeFileNameBase(base) || 'diagram'
  return pageNumbers.map((n) => join(dir, `${base}-p${n}.${ext}`))
}
