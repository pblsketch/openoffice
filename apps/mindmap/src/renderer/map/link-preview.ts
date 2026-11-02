/**
 * A link's preview put on its topic: the picture and the title the web page
 * names for itself, fetched once by the main process when the person ticked
 * "fetch a preview" in the link dialog (decision 0099).
 *
 * The picture becomes a new entry of the map file and goes the way every
 * picture goes (`setTopicPicture`: the library tree, `MapController.edit`,
 * reconciling), together with the title as one step of the undo history.
 * After that the map shows the picture from its own file: it never asks the
 * page again.
 */
import { MAX_PICTURE_BYTES } from '../ai/image-tools'
import { setTopicPicture, type MapAiHost, type PictureBytes } from '../ai/map-tools'
import type { LinkPreviewResult } from '../../shared/ipc'
import { pictureType } from './images'

/** The long side a re-encoded picture is drawn at, at most; a page's picture is rarely larger. */
const REENCODE_MAX_SIDE = 1600

/** Whether the dialog offers a preview for this address: a web page written out in full. */
export function previewableLink(address: string): boolean {
  return /^https?:\/\/\S+$/i.test(address.trim())
}

/**
 * The title a topic takes from the page: only when the topic has none of its
 * own yet, that is when it is blank, still the new-topic title, or the address
 * itself. A title the person wrote stays.
 */
export function previewTitle(
  current: string,
  pageTitle: string | null,
  address: string,
  newTopicName: string,
): string | null {
  if (!pageTitle) return null
  const now = current.trim()
  const bare = (url: string) =>
    url
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/$/, '')
  const placeholder = now === '' || now === newTopicName || bare(now) === bare(address)
  return placeholder && pageTitle !== now ? pageTitle : null
}

/** Draws a picture the map cannot keep as it is into a PNG, its long side at most `REENCODE_MAX_SIDE`. */
async function reencodeAsPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart]))
  } catch {
    return null
  }
  try {
    const scale = Math.min(1, REENCODE_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } finally {
    bitmap.close()
  }
}

/**
 * The bytes the map keeps for a downloaded picture: PNG, JPG and GIF as they
 * came, WebP and BMP (and a picture too large as it came) drawn into a PNG.
 * Null for anything else, SVG included.
 */
export async function previewPicture(
  base64: string,
  toPng: (bytes: Uint8Array) => Promise<Uint8Array | null> = reencodeAsPng,
): Promise<PictureBytes | null> {
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  } catch {
    return null
  }
  if (bytes.byteLength === 0) return null
  const type = pictureType(bytes)
  const ext =
    type === 'image/png'
      ? 'png'
      : type === 'image/jpeg'
        ? 'jpg'
        : type === 'image/gif'
          ? 'gif'
          : null
  if (ext && bytes.byteLength <= MAX_PICTURE_BYTES) return { bytes, ext }
  // SVG and anything else that is markup is never drawn here
  if (!ext && type !== 'image/webp' && type !== 'image/bmp') return null
  // drawn smaller, a picture too large to keep as it came usually fits
  const png = await toPng(bytes)
  return png && png.byteLength > 0 && png.byteLength <= MAX_PICTURE_BYTES
    ? { bytes: png, ext: 'png' }
    : null
}

/** How fetching a preview ended, for the status line. */
export type LinkPreviewOutcome = 'done' | 'title-only' | 'nothing' | 'failed'

/**
 * Asks the main process for the page's preview and puts it on the topic. The
 * link itself is already on the topic: a preview that cannot be had leaves it
 * there and changes nothing else.
 */
export async function applyLinkPreview(
  host: MapAiHost,
  topicId: string,
  address: string,
  options: {
    read(url: string): Promise<LinkPreviewResult>
    newTopicName: string
    toPng?: (bytes: Uint8Array) => Promise<Uint8Array | null>
  },
): Promise<LinkPreviewOutcome> {
  const result = await options.read(address.trim())
  if (!result.ok) return 'failed'
  const picture = result.picture ? await previewPicture(result.picture.base64, options.toPng) : null
  const retitle = (current: string) =>
    previewTitle(current, result.title, address, options.newTopicName)
  const change = await setTopicPicture(host, { topicId }, { picture, retitle }, null)
  if (change.isError) return 'failed'
  if (!change.mutated) return 'nothing'
  return picture ? 'done' : 'title-only'
}
