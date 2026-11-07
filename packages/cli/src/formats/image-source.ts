import { existsSync, readFileSync } from 'node:fs'
import { extname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MAX_REMOTE_IMAGE_BYTES,
  ResponseTooLargeError,
  fetchRemoteImage,
  readBodyCapped,
} from '@genoffice/electron-utils/remote-image'
import { assertAllowed, type PathContext } from '../fs'
import { imageSize } from './image-size'

export interface ImageSource {
  bytes: Uint8Array
  ext: string
  mime: string | null
}

/**
 * Image bytes for a spec or op field: a data: URL, an http(s) URL genoffice
 * downloads, a file: URL, or a local path (absolute, else relative to the current
 * directory and then to the file the reference came from).
 */
/** Same byte budget as remote image downloads; checked on the encoded text
 *  (x4/3) before a single byte is allocated. */
const MAX_DATA_URL_BASE64_CHARS = Math.ceil((MAX_REMOTE_IMAGE_BYTES * 4) / 3)

export async function readImageSource(
  url: string,
  ctx: PathContext,
  baseDir?: string,
): Promise<ImageSource | null> {
  if (/^data:/i.test(url)) {
    // RFC 2397 allows media type parameters (charset, name, ...) before the base64 marker
    const m = /^data:image\/([a-z0-9.+-]+)(?:;[^;,]+)*;base64,(.*)$/is.exec(url)
    if (!m) return null
    // Size the base64 text before decoding it: Buffer.from allocated the full
    // payload first (measured: a 400 MB data URL peaked at ~1 GB RSS before
    // any cap ran). base64 inflates by 4/3, so the encoded length is checked
    // against the same byte budget the remote branch enforces after decoding.
    if (m[2]!.length > MAX_DATA_URL_BASE64_CHARS) return null
    const bytes = new Uint8Array(Buffer.from(m[2]!, 'base64'))
    return withType(bytes, m[1]!.toLowerCase())
  }
  if (/^https?:\/\//i.test(url)) {
    const resp = await fetchRemoteImage(url)
    if (!resp || !resp.ok) return null
    const bytes = await readBodyCapped(resp, MAX_REMOTE_IMAGE_BYTES).catch((err: unknown) => {
      if (err instanceof ResponseTooLargeError) return null
      throw err
    })
    if (!bytes) return null
    const declared = (resp.headers.get('content-type') ?? '').split('/')[1]?.split(';')[0] ?? ''
    return withType(bytes, declared)
  }
  let local = url
  const isFileUrl = /^file:/i.test(url)
  if (isFileUrl) {
    // a file URL names an absolute path (already percent-decoded); one that cannot is not found
    try {
      local = fileURLToPath(url)
    } catch {
      return null
    }
  }
  const locals = [local]
  if (!isFileUrl) {
    // a ?query or #fragment is not part of the file name (markdown already strips these);
    // tried last, so a file whose literal name holds one of them still wins
    const bare = local.replace(/[?#].*$/s, '')
    if (bare && bare !== local) locals.push(bare)
  }
  const candidates = locals.flatMap((item) =>
    isAbsolute(item)
      ? [item]
      : [resolve(ctx.cwd, item), ...(baseDir ? [resolve(baseDir, item)] : [])],
  )
  const path = candidates.find((p) => existsSync(p))
  if (!path) return null
  assertAllowed(path, ctx.env, 'read')
  const bytes = new Uint8Array(readFileSync(path))
  return withType(bytes, extname(path).slice(1).toLowerCase())
}

/** Sniffed type wins over what the name or header claims (a .jpg holding PNG bytes is common). */
function withType(bytes: Uint8Array, declared: string): ImageSource {
  const mime = imageSize(bytes)?.mime ?? null
  const ext =
    mime === 'image/png'
      ? 'png'
      : mime === 'image/jpeg'
        ? 'jpg'
        : mime === 'image/gif'
          ? 'gif'
          : declared === 'jpeg'
            ? 'jpg'
            : declared || 'png'
  return { bytes, ext, mime }
}
