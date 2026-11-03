/** File names of picture exports (spec 5), apart from Electron so the tests read them. */
import { basename, dirname, extname, join } from 'node:path'
import { safeFileNameBase } from '../shared/formats'

/** Where each page of a several-page export goes: `<base>-p<n>.<ext>` beside the chosen file. */
export function pageFilePaths(
  chosen: string,
  ext: 'png' | 'svg',
  pageNumbers: readonly number[],
): string[] {
  if (pageNumbers.length === 1) return [chosen]
  const dir = dirname(chosen)
  let base = basename(chosen)
  if (extname(base).toLowerCase() === `.${ext}`) base = base.slice(0, -ext.length - 1)
  base = safeFileNameBase(base) || 'diagram'
  return pageNumbers.map((n) => join(dir, `${base}-p${n}.${ext}`))
}
