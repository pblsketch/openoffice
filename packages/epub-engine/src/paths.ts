/**
 * Zip-safe path handling for hrefs found inside a book (spec §3 "Resources").
 *
 * Every href is resolved against the zip entry that contains it. `..` stops at
 * the zip root, so no resolved path can name anything outside the archive, and
 * a target that carries a URL scheme (`https:`, `file:`, `data:`, a drive
 * letter) or is protocol-relative (`//host`) is never a zip entry at all.
 */

/** A zip entry path plus the fragment that pointed into it. */
export interface ResolvedHref {
  /** normalised zip entry path, without a leading slash */
  path: string
  /** the part after `#`, percent-decoded; null when there was none or it was empty */
  fragment: string | null
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** True when `href` points outside the zip: it has a scheme or is protocol-relative. */
export function hasUrlScheme(href: string): boolean {
  const trimmed = href.trim()
  return SCHEME.test(trimmed) || /^[/\\]{2}/.test(trimmed)
}

/**
 * Collapses `.`, `..` and empty segments. `..` at the top is dropped: it
 * stops at the zip root. A leading slash means the zip root as well.
 */
export function normalizeZipPath(path: string): string {
  const out: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      out.pop()
      continue
    }
    out.push(segment)
  }
  return out.join('/')
}

/** The folder part of a zip entry path, with a trailing slash; empty at the root. */
export function directoryOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '' : path.slice(0, slash + 1)
}

/** The last segment of a zip entry path. */
export function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function percentDecode(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * Resolves `href`, found in the entry `basePath`, to a zip entry path.
 * Returns null for a target with a scheme. An empty href or a bare fragment
 * names `basePath` itself.
 */
export function resolveHref(basePath: string, href: string): ResolvedHref | null {
  const trimmed = href.trim()
  if (hasUrlScheme(trimmed)) return null
  const hash = trimmed.indexOf('#')
  const beforeHash = hash < 0 ? trimmed : trimmed.slice(0, hash)
  const rawFragment = hash < 0 ? '' : trimmed.slice(hash + 1)
  const query = beforeHash.indexOf('?')
  const rawPath = query < 0 ? beforeHash : beforeHash.slice(0, query)
  const fragment = rawFragment === '' ? null : percentDecode(rawFragment)
  if (rawPath === '') return { path: normalizeZipPath(basePath), fragment }
  const decoded = percentDecode(rawPath)
  const joined = decoded.startsWith('/') ? decoded : directoryOf(basePath) + decoded
  return { path: normalizeZipPath(joined), fragment }
}
