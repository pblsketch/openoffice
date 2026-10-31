/**
 * The Drive v3 REST calls the app makes. Every call takes its access token
 * from the connection and its fetch from the caller, so tests never reach
 * Google. Calls do not throw: a failure is a `DriveError` with a kind the
 * screen translates.
 */
import type { FetchLike } from './oauth'
import { FOLDER_MIME, SHORTCUT_MIME } from './formats'

export const DRIVE_API = 'https://www.googleapis.com/drive/v3'
export const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

const REQUEST_TIMEOUT_MS = 30_000
const TRANSFER_TIMEOUT_MS = 10 * 60 * 1000

/** Largest file the app downloads to open, and the most the AI may read in one go */
export const MAX_OPEN_BYTES = 300 * 1024 * 1024
export const MAX_READ_BYTES = 30 * 1024 * 1024

/**
 * not-connected: no Drive connection, or Google ended it; not-found: the file
 * is gone or this account cannot see it; forbidden: the account may see the
 * file but not do this (read-only share, download blocked by the owner);
 * too-large: past the app's limit, or past Google's export limit for its own
 * documents; rate-limit: Google asked to slow down; network: anything else.
 */
export type DriveErrorKind =
  'not-connected' | 'not-found' | 'forbidden' | 'too-large' | 'rate-limit' | 'network'

export interface DriveError {
  ok: false
  kind: DriveErrorKind
}

export type DriveResult<T> = ({ ok: true } & T) | DriveError

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  /** ISO time */
  modifiedTime: string
  /** bytes; absent for Google's own documents and folders */
  size?: number
  /** content hash of a stored file; absent for Google's own documents */
  md5Checksum?: string
  parents?: string[]
  /** the account may change the file's content */
  canEdit: boolean
  /** a shortcut's target, when this entry is a shortcut */
  shortcutTarget?: { id: string; mimeType: string }
}

export interface DriveAccount {
  displayName: string
  emailAddress: string
}

/** Gives a valid access token, refreshing when needed; null when not connected */
export type AccessTokenSource = (signal?: AbortSignal) => Promise<string | null>

export interface DriveApiOptions {
  token: AccessTokenSource
  fetch: FetchLike
}

const FILE_FIELDS =
  'id,name,mimeType,modifiedTime,size,md5Checksum,parents,capabilities/canEdit,shortcutDetails'

interface RawFile {
  id?: unknown
  name?: unknown
  mimeType?: unknown
  modifiedTime?: unknown
  size?: unknown
  md5Checksum?: unknown
  parents?: unknown
  capabilities?: { canEdit?: unknown }
  shortcutDetails?: { targetId?: unknown; targetMimeType?: unknown }
}

function fileFrom(raw: RawFile): DriveFile | null {
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null
  if (typeof raw.mimeType !== 'string') return null
  const file: DriveFile = {
    id: raw.id,
    name: raw.name,
    mimeType: raw.mimeType,
    modifiedTime: typeof raw.modifiedTime === 'string' ? raw.modifiedTime : '',
    canEdit: raw.capabilities?.canEdit === true,
  }
  const size = typeof raw.size === 'string' ? Number(raw.size) : NaN
  if (Number.isFinite(size) && size >= 0) file.size = size
  if (typeof raw.md5Checksum === 'string') file.md5Checksum = raw.md5Checksum
  if (Array.isArray(raw.parents)) {
    file.parents = raw.parents.filter((p): p is string => typeof p === 'string')
  }
  const target = raw.shortcutDetails
  if (
    raw.mimeType === SHORTCUT_MIME &&
    typeof target?.targetId === 'string' &&
    typeof target.targetMimeType === 'string'
  ) {
    file.shortcutTarget = { id: target.targetId, mimeType: target.targetMimeType }
  }
  return file
}

function timeout(ms: number, signal?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, t]) : t
}

async function kindOf(response: Response): Promise<DriveErrorKind> {
  if (response.status === 401) return 'not-connected'
  if (response.status === 404) return 'not-found'
  if (response.status === 429) return 'rate-limit'
  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { errors?: { reason?: unknown }[] }
    }
    const reasons = (body.error?.errors ?? []).map((e) => e.reason)
    if (reasons.includes('exportSizeLimitExceeded')) return 'too-large'
    if (reasons.some((r) => r === 'userRateLimitExceeded' || r === 'rateLimitExceeded')) {
      return 'rate-limit'
    }
    return 'forbidden'
  }
  return 'network'
}

/** Quote a value for a Drive query string */
export function queryLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/**
 * What a list shows: the files the app may open, most recently viewed first,
 * or a search among them. With the `drive.file` scope Google answers only
 * with files the person picked in its picker or the app made (decision 0085),
 * so neither list reaches the rest of the Drive.
 */
export type DriveListing = { kind: 'recent' } | { kind: 'search'; text: string }

export function listingQuery(listing: DriveListing): { q: string; orderBy: string } {
  switch (listing.kind) {
    case 'recent':
      return {
        q: `mimeType != ${queryLiteral(FOLDER_MIME)} and trashed = false`,
        orderBy: 'viewedByMeTime desc',
      }
    case 'search': {
      const text = queryLiteral(listing.text)
      return {
        q: `(name contains ${text} or fullText contains ${text}) and trashed = false`,
        // Drive refuses an ordering on full-text searches
        orderBy: '',
      }
    }
  }
}

export class DriveApi {
  constructor(private readonly options: DriveApiOptions) {}

  private async call(
    url: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
    ms = REQUEST_TIMEOUT_MS,
  ): Promise<Response | DriveError> {
    const token = await this.options.token(signal)
    if (!token) return { ok: false, kind: 'not-connected' }
    try {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${token}`)
      const response = await this.options.fetch(url, {
        ...init,
        headers,
        signal: timeout(ms, signal),
      })
      if (!response.ok) return { ok: false, kind: await kindOf(response) }
      return response
    } catch {
      return { ok: false, kind: 'network' }
    }
  }

  async account(signal?: AbortSignal): Promise<DriveResult<{ account: DriveAccount }>> {
    const res = await this.call(
      `${DRIVE_API}/about?fields=user(displayName,emailAddress)`,
      {},
      signal,
    )
    if (!(res instanceof Response)) return res
    const body = (await res.json().catch(() => ({}))) as {
      user?: { displayName?: unknown; emailAddress?: unknown }
    }
    return {
      ok: true,
      account: {
        displayName: typeof body.user?.displayName === 'string' ? body.user.displayName : '',
        emailAddress: typeof body.user?.emailAddress === 'string' ? body.user.emailAddress : '',
      },
    }
  }

  async list(
    listing: DriveListing,
    options: { pageToken?: string | undefined; pageSize?: number | undefined } = {},
    signal?: AbortSignal,
  ): Promise<DriveResult<{ files: DriveFile[]; nextPageToken?: string }>> {
    const { q, orderBy } = listingQuery(listing)
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: String(Math.min(Math.max(options.pageSize ?? 100, 1), 1000)),
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'user',
    })
    if (orderBy) params.set('orderBy', orderBy)
    if (options.pageToken) params.set('pageToken', options.pageToken)
    const res = await this.call(`${DRIVE_API}/files?${params.toString()}`, {}, signal)
    if (!(res instanceof Response)) return res
    const body = (await res.json().catch(() => ({}))) as {
      files?: RawFile[]
      nextPageToken?: unknown
    }
    const files = (body.files ?? []).map(fileFrom).filter((f): f is DriveFile => f !== null)
    return typeof body.nextPageToken === 'string'
      ? { ok: true, files, nextPageToken: body.nextPageToken }
      : { ok: true, files }
  }

  async file(id: string, signal?: AbortSignal): Promise<DriveResult<{ file: DriveFile }>> {
    const params = new URLSearchParams({ fields: FILE_FIELDS, supportsAllDrives: 'true' })
    const res = await this.call(
      `${DRIVE_API}/files/${encodeURIComponent(id)}?${params.toString()}`,
      {},
      signal,
    )
    if (!(res instanceof Response)) return res
    const file = fileFrom((await res.json().catch(() => ({}))) as RawFile)
    return file ? { ok: true, file } : { ok: false, kind: 'network' }
  }

  /** A stored file's bytes, refusing past `maxBytes` */
  async download(
    id: string,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<DriveResult<{ bytes: Uint8Array }>> {
    const params = new URLSearchParams({ alt: 'media', supportsAllDrives: 'true' })
    const res = await this.call(
      `${DRIVE_API}/files/${encodeURIComponent(id)}?${params.toString()}`,
      {},
      signal,
      TRANSFER_TIMEOUT_MS,
    )
    if (!(res instanceof Response)) return res
    return readCapped(res, maxBytes)
  }

  /** A Google document's bytes in another format */
  async export(
    id: string,
    mime: string,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<DriveResult<{ bytes: Uint8Array }>> {
    const params = new URLSearchParams({ mimeType: mime })
    const res = await this.call(
      `${DRIVE_API}/files/${encodeURIComponent(id)}/export?${params.toString()}`,
      {},
      signal,
      TRANSFER_TIMEOUT_MS,
    )
    if (!(res instanceof Response)) return res
    return readCapped(res, maxBytes)
  }

  /**
   * Upload through a resumable session, in one piece: `existingId` replaces
   * that file's content (keeping its id, sharing and history); without it a new
   * file is made in `parentId`.
   */
  async upload(
    target: { existingId: string } | { name: string; parentId?: string | undefined },
    bytes: Uint8Array,
    mime: string,
    signal?: AbortSignal,
  ): Promise<DriveResult<{ file: DriveFile }>> {
    const params = new URLSearchParams({
      uploadType: 'resumable',
      supportsAllDrives: 'true',
      fields: FILE_FIELDS,
    })
    const existing = 'existingId' in target
    const metadata = existing
      ? {}
      : { name: target.name, ...(target.parentId ? { parents: [target.parentId] } : {}) }
    const start = await this.call(
      existing
        ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(target.existingId)}?${params.toString()}`
        : `${DRIVE_UPLOAD_API}/files?${params.toString()}`,
      {
        method: existing ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': mime,
          'X-Upload-Content-Length': String(bytes.byteLength),
        },
        body: JSON.stringify(metadata),
      },
      signal,
    )
    if (!(start instanceof Response)) return start
    const session = start.headers.get('Location')
    // the session address must stay on Google's upload host before the bytes go to it
    if (!session || !session.startsWith(`${DRIVE_UPLOAD_API}/`)) {
      return { ok: false, kind: 'network' }
    }
    const put = await this.call(
      session,
      {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: bytes as unknown as BodyInit,
      },
      signal,
      TRANSFER_TIMEOUT_MS,
    )
    if (!(put instanceof Response)) return put
    const file = fileFrom((await put.json().catch(() => ({}))) as RawFile)
    return file ? { ok: true, file } : { ok: false, kind: 'network' }
  }
}

async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<DriveResult<{ bytes: Uint8Array }>> {
  const declared = Number(response.headers.get('Content-Length') ?? NaN)
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => {})
    return { ok: false, kind: 'too-large' }
  }
  if (!response.body) return { ok: true, bytes: new Uint8Array(await response.arrayBuffer()) }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        return { ok: false, kind: 'too-large' }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, kind: 'network' }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, bytes }
}
