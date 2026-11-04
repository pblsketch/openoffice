import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { numberedExportPaths } from '@genoffice/electron-utils/numbered-export-paths'

export function isValidExportPageNumber(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

export function hasValidExportPageNumbers(
  value: unknown,
  expectedLength: number,
): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === expectedLength &&
    value.every((pageNumber) => isValidExportPageNumber(pageNumber)) &&
    // duplicate pages would write two exports over one target file
    new Set(value).size === value.length
  )
}

export function buildExportImagePaths(
  dir: string,
  baseName: unknown,
  pageNumbers: readonly unknown[],
  ext: 'png' | 'jpg',
): string[] {
  const root = resolve(dir)
  const safeBase = String(baseName || 'page').replace(/[/\\:*?"<>|]/g, '_')
  return pageNumbers.map((pageNumber) => {
    if (!isValidExportPageNumber(pageNumber)) throw new Error('pdf: invalid page numbers')
    const target = join(root, `${safeBase}-p${pageNumber}.${ext}`)
    const fromRoot = relative(root, target)
    if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
      throw new Error('pdf: invalid export path')
    }
    return target
  })
}

/**
 * Save As › PNG page images: the files written for the one name the shell's
 * save dialog picked. One page keeps the name; more get `name-01.png`, … in
 * the same folder. Null when the target is not an absolute .png path.
 */
export function buildSaveAsImagePaths(target: string, count: number): string[] | null {
  if (!isAbsolute(target) || !/\.png$/i.test(target)) return null
  return numberedExportPaths(target, count)
}
