/**
 * The pages a document job was confirmed with, remembered in this app's
 * renderer storage so the resume offer can bring them back (the store's job
 * record keeps only the progress). Page numbers only, no document content.
 * Carried to the new document hash after an in-app save, like the results.
 */
import type { JobKind } from '../../../../../packages/pdf-structure/src/store/store'

const PREFIX = 'genoffice-pdf-job-pages'

/** an easy explanation's list is kept apart from the plain translation's of the same language */
const keyOf = (docHash: string, kind: JobKind, lang?: string, mode?: 'easy'): string =>
  `${PREFIX}:${docHash}:${kind}${lang ? `:${lang}` : ''}${mode === 'easy' ? ':easy' : ''}`

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function rememberJobPages(
  docHash: string,
  kind: JobKind,
  lang: string | undefined,
  pages: readonly number[],
  mode?: 'easy',
): void {
  try {
    storage()?.setItem(keyOf(docHash, kind, lang, mode), JSON.stringify([...pages]))
  } catch {
    // a full or missing storage only costs the resume offer its page list
  }
}

/** the remembered pages, or null when there are none or they are unreadable */
export function recallJobPages(
  docHash: string,
  kind: JobKind,
  lang?: string,
  mode?: 'easy',
): number[] | null {
  try {
    const raw = storage()?.getItem(keyOf(docHash, kind, lang, mode))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const pages = parsed.filter((p): p is number => Number.isSafeInteger(p) && p >= 1)
    return pages.length > 0 ? pages : null
  } catch {
    return null
  }
}

/** copy every remembered list of `oldDocHash` to `newDocHash` (after an in-app save) */
export function carryJobPages(oldDocHash: string, newDocHash: string): void {
  const s = storage()
  if (!s || oldDocHash === newDocHash) return
  try {
    const from = `${PREFIX}:${oldDocHash}:`
    const keys: string[] = []
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i)
      if (key?.startsWith(from)) keys.push(key)
    }
    for (const key of keys) {
      const value = s.getItem(key)
      if (value !== null) s.setItem(`${PREFIX}:${newDocHash}:${key.slice(from.length)}`, value)
    }
  } catch {
    // best effort, like rememberJobPages
  }
}

/** forget the remembered lists of a document (its stored results were deleted) */
export function forgetJobPages(docHash: string): void {
  const s = storage()
  if (!s) return
  try {
    const from = `${PREFIX}:${docHash}:`
    const keys: string[] = []
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i)
      if (key?.startsWith(from)) keys.push(key)
    }
    for (const key of keys) s.removeItem(key)
  } catch {
    // best effort
  }
}
