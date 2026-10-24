/**
 * Addresses of a book's entries (`epub-asset://<view token>/<entry path>`) and
 * the default names of result books. Pure: the renderer and the main process
 * both use them, so they agree on every address and name.
 */
import { EPUB_ASSET_SCHEME } from './ipc'
import type { EpubTranslationOutputKind } from '@genoffice/epub-engine'

/** The base address of one view's book: the token names the view, never a path. */
export function epubAssetBase(token: string): string {
  return `${EPUB_ASSET_SCHEME}://${token}/`
}

/** The address of a zip entry under `base`, each path segment percent-encoded. */
export function epubAssetUrl(base: string, path: string): string {
  const encoded = path
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${base.endsWith('/') ? base : `${base}/`}${encoded}`
}

/** The file name part of a path, either separator. */
function fileName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
}

/**
 * The default file name of a result book (spec §8): `<name>.<lang>.epub` for
 * the translated book, `<name>.<lang>.bilingual.epub` for the bilingual one.
 */
export function defaultResultName(
  sourcePath: string,
  lang: string,
  kind: EpubTranslationOutputKind,
): string {
  const name = fileName(sourcePath)
  const stem = /\.epub$/i.test(name) ? name.slice(0, -'.epub'.length) : name
  return `${stem || 'book'}.${lang}${kind === 'bilingual' ? '.bilingual' : ''}.epub`
}
