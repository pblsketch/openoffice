/**
 * A picture file dragged from the desktop onto a topic of the map.
 *
 * The drop goes the way an AI picture does (`setTopicImage`): the bytes become
 * a new entry of the document, and the topic takes the reference through the
 * library tree, `MapController.edit` and reconciling, as one step of the undo
 * history. Nothing here writes to the source tree.
 *
 * The bytes are read from the dropped `File` in this window; no path crosses
 * to the main process. A drag that carries no picture is left alone, so a
 * document dropped on the map still opens through the shell's drop-open
 * bridge (`installDropOpenBridge`): this zone cancels only the drops it takes.
 */
import type { Topic } from 'mind-elixir'
import { MAX_PICTURE_BYTES } from '../ai/image-tools'
import { setTopicImage, type MapAiHost, type PictureBytes } from '../ai/map-tools'
import { pictureType } from './images'

/** File names a picture drop takes: any picture, so an unsupported one is answered rather than ignored. */
const PICTURE_NAME = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?|ico)$/i

/** Whether a file looks like a picture by its type or its name. */
export function isPictureFile(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type.startsWith('image/') || PICTURE_NAME.test(file.name)
}

/**
 * Whether a drag carries a picture. While the drag is over the page only the
 * item kinds and types can be read, not the files themselves.
 */
export function dragCarriesPicture(transfer: DataTransfer | null): boolean {
  if (!transfer || !transfer.types.includes('Files')) return false
  return Array.from(transfer.items ?? []).some(
    (item) => item.kind === 'file' && item.type.startsWith('image/'),
  )
}

/** The topic element under a drag, or null over the empty map. */
export function topicAt(target: EventTarget | null): Topic | null {
  const element = target instanceof Element ? target : null
  const topic = element?.closest('me-tpc') as Topic | null | undefined
  return topic?.nodeObj ? topic : null
}

/** What reading a dropped file gives: the bytes the map keeps, or why it cannot keep them. */
export type ReadPicture =
  { ok: true; picture: PictureBytes } | { ok: false; reason: 'too-large' | 'unsupported' }

/** The bytes of a dropped picture, told by their first bytes rather than by the file name. */
export async function readDroppedPicture(file: Blob): Promise<ReadPicture> {
  if (file.size > MAX_PICTURE_BYTES) return { ok: false, reason: 'too-large' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.byteLength === 0) return { ok: false, reason: 'unsupported' }
  if (bytes.byteLength > MAX_PICTURE_BYTES) return { ok: false, reason: 'too-large' }
  const type = pictureType(bytes)
  const ext =
    type === 'image/png'
      ? 'png'
      : type === 'image/jpeg'
        ? 'jpg'
        : type === 'image/gif'
          ? 'gif'
          : null
  if (!ext) return { ok: false, reason: 'unsupported' }
  return { ok: true, picture: { bytes, ext } }
}

/** How a drop ended, for the status line. */
export type PictureDropOutcome =
  | 'done'
  /** a topic holds one picture: the first one went in, the rest were left out */
  | 'done-first-only'
  | 'no-topic'
  | 'too-large'
  | 'unsupported'
  | 'failed'

/**
 * Puts the first picture of a drop on a topic: the one under the pointer, or
 * the selected one when the drop missed every topic. A topic that already
 * shows a picture takes the new one in its place.
 */
export async function dropPicture(
  host: MapAiHost,
  topicId: string | null,
  files: readonly File[],
): Promise<PictureDropOutcome> {
  const pictures = files.filter(isPictureFile)
  const first = pictures[0]
  if (!first) return 'unsupported'
  if (topicId === null) return 'no-topic'
  const read = await readDroppedPicture(first)
  if (!read.ok) return read.reason
  const result = await setTopicImage(host, { topicId }, read.picture, null)
  if (result.isError) return 'failed'
  return pictures.length > 1 ? 'done-first-only' : 'done'
}
