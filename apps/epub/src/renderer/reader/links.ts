/**
 * Where a link in a chapter goes (spec §4 "links"). A link that resolves to a
 * chapter of the open book moves the reader there; one to another entry of
 * the book (a picture, a style) does nothing; anything else is an outside
 * address, handed to the main process, which opens only safe ones.
 */

export type LinkRoute =
  | { kind: 'chapter'; spineIndex: number; fragment: string | null }
  | { kind: 'entry' }
  | { kind: 'outside'; url: string }
  | { kind: 'none' }

const decode = (text: string): string => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * Routes the `href` written in a chapter.
 *
 * @param href the attribute as written
 * @param chapterUrl the chapter's own `epub-asset:` address (its base)
 * @param assetBase the book's `epub-asset:` base, with its trailing slash
 * @param spinePaths zip entry path of each spine item, in order
 */
export function routeLink(
  href: string | null,
  chapterUrl: string,
  assetBase: string,
  spinePaths: readonly string[],
): LinkRoute {
  if (href === null || href.trim() === '') return { kind: 'none' }
  let resolved: string
  try {
    resolved = new URL(href.trim(), chapterUrl).href
  } catch {
    return { kind: 'none' }
  }
  if (!resolved.startsWith(assetBase)) return { kind: 'outside', url: href.trim() }
  const rest = resolved.slice(assetBase.length)
  const hash = rest.indexOf('#')
  const beforeHash = hash < 0 ? rest : rest.slice(0, hash)
  const rawFragment = hash < 0 ? '' : rest.slice(hash + 1)
  const query = beforeHash.indexOf('?')
  const rawPath = query < 0 ? beforeHash : beforeHash.slice(0, query)
  const path = rawPath
    .split('/')
    .map((segment) => decode(segment))
    .join('/')
  const spineIndex = spinePaths.indexOf(path)
  if (spineIndex < 0) return { kind: 'entry' }
  return { kind: 'chapter', spineIndex, fragment: rawFragment === '' ? null : decode(rawFragment) }
}
