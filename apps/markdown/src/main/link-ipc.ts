/**
 * IPC for internal links: following a link from a note, `[[` completion and
 * the pictures `![[…]]` embeds show. The renderer sends link text only; paths
 * are resolved here against the file the view has open (see link-resolve.ts).
 */
import { resolve } from 'node:path'
import { ipcMain } from 'electron'
import { MARKDOWN_CHANNELS } from '../shared/ipc'
import { MAX_LINK_TEXT } from '../shared/internal-links'
import type { NoteSuggestion, OpenLinkResult } from '../shared/internal-links'
import {
  VaultIndexCache,
  resolveEmbedImage,
  resolveLinkPath,
  resolveWikiTarget,
  suggestNotes,
} from './link-resolve'
import type { ResolveResult } from './link-resolve'

/** the part of a WebContents the link heading hand-off uses */
interface LinkView {
  readonly id: number
  isDestroyed(): boolean
  send(channel: string): void
}

export interface LinkIpcDeps {
  /** the file a view shows; null for an untitled view */
  documentPath(wcId: number): string | null
  /** every Markdown view and the file it shows */
  views(): Iterable<[view: LinkView, path: string]>
  /** the shell's document router: focuses the file's tab or opens one; false = not opened */
  openPath(path: string): boolean
}

/** Pictures embeds resolved for each view (real paths); md-asset:// serves these too */
const embedGrantsByWc = new Map<number, Set<string>>()
/** The heading a followed link asked each view to show, taken once by its renderer */
const linkHeadingByWc = new Map<number, string>()
const vaultIndexes = new VaultIndexCache()

const MARKDOWN_TEXT_RE = /\.(md|markdown)$/i

function samePath(a: string, b: string): boolean {
  const x = resolve(a)
  const y = resolve(b)
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y
}

function linkText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_LINK_TEXT
    ? value
    : null
}

/** true when an embed of some open view resolved to this picture */
export function isEmbedGranted(path: string): boolean {
  for (const granted of embedGrantsByWc.values()) {
    if (granted.has(path)) return true
  }
  return false
}

/** a view closed: drop what it was granted and anything left for it */
export function forgetLinkState(wcId: number): void {
  embedGrantsByWc.delete(wcId)
  linkHeadingByWc.delete(wcId)
}

/** Leave `heading` for every Markdown view showing `path` and tell it to look. */
function leaveLinkHeading(deps: LinkIpcDeps, path: string, heading: string): void {
  for (const [view, shown] of deps.views()) {
    if (view.isDestroyed() || !samePath(shown, path)) continue
    linkHeadingByWc.set(view.id, heading)
    view.send(MARKDOWN_CHANNELS.linkHeadingReady)
  }
}

/** Follow a link from the note `wcId` shows. */
export async function followLink(
  deps: LinkIpcDeps,
  wcId: number,
  raw: unknown,
): Promise<OpenLinkResult> {
  const request = raw as { kind?: unknown; path?: unknown; target?: unknown; heading?: unknown }
  const notePath = deps.documentPath(wcId)
  const heading = linkText(request?.heading)
  let found: ResolveResult
  if (request?.kind === 'path') {
    const path = linkText(request.path)
    if (!path) return { ok: false, reason: 'not-found' }
    found = await resolveLinkPath(notePath, path)
  } else if (request?.kind === 'wiki') {
    const target = linkText(request.target)
    if (!target) return { ok: false, reason: 'not-found' }
    found = await resolveWikiTarget(notePath, target, vaultIndexes)
  } else {
    return { ok: false, reason: 'not-found' }
  }
  if (!found.ok) return found
  // the shell router opens only formats an editor owns; nothing is launched
  if (!deps.openPath(found.path)) return { ok: false, reason: 'blocked' }
  if (heading && MARKDOWN_TEXT_RE.test(found.path)) leaveLinkHeading(deps, found.path, heading)
  return { ok: true }
}

export function registerMarkdownLinkIpc(deps: LinkIpcDeps): void {
  ipcMain.handle(MARKDOWN_CHANNELS.openLink, (e, request: unknown) =>
    followLink(deps, e.sender.id, request),
  )

  ipcMain.handle(MARKDOWN_CHANNELS.suggestNotes, (e, query: unknown): Promise<NoteSuggestion[]> =>
    suggestNotes(
      deps.documentPath(e.sender.id),
      typeof query === 'string' ? query.slice(0, 200) : '',
      vaultIndexes,
    ),
  )

  ipcMain.handle(MARKDOWN_CHANNELS.resolveEmbed, async (e, target: unknown) => {
    const name = linkText(target)
    if (!name) return null
    const wcId = e.sender.id
    const picture = await resolveEmbedImage(deps.documentPath(wcId), name, vaultIndexes)
    if (!picture || e.sender.isDestroyed()) return null
    const granted = embedGrantsByWc.get(wcId) ?? new Set<string>()
    granted.add(picture)
    embedGrantsByWc.set(wcId, granted)
    return picture
  })

  ipcMain.handle(MARKDOWN_CHANNELS.linkHeadingTake, (e): string | null => {
    const heading = linkHeadingByWc.get(e.sender.id) ?? null
    linkHeadingByWc.delete(e.sender.id)
    return heading
  })
}
