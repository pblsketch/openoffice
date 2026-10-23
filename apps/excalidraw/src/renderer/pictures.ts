/**
 * Which pictures of a note to ask the main process for, and how many the
 * drawing shows that could not be found.
 */
import type { DrawingElement, EmbeddedFileRef } from '@genoffice/excalidraw-engine'

/**
 * Only `[[picture]]` references name a file in the vault. Web links, formulas
 * and embedded notes are not read; their elements show an empty frame.
 */
export function pictureRefsToRead(
  refs: readonly EmbeddedFileRef[],
): Array<{ fileId: string; target: string }> {
  return refs
    .filter((ref) => ref.kind === 'wiki')
    .map((ref) => ({ fileId: ref.fileId, target: ref.target }))
}

/** Live picture elements whose file did not arrive. */
export function missingPictureCount(
  elements: readonly DrawingElement[],
  found: readonly string[],
): number {
  const have = new Set(found)
  return elements.filter(
    (element) =>
      element.type === 'image' &&
      element.isDeleted !== true &&
      typeof element.fileId === 'string' &&
      !have.has(element.fileId),
  ).length
}
