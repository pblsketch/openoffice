/**
 * Whether a plain `.md` file is an Obsidian drawing note. Obsidian lets a user
 * rename `Drawing.excalidraw.md` to `Drawing.md`; the plugin still knows it by
 * the `excalidraw-plugin` key of its front matter. Such a file opens in the
 * drawing editor: the Markdown editor would rewrite the drawing's data block.
 *
 * Only the start of the file is read: the front matter is at the top, and a
 * large note must not be read whole just to be routed.
 */
import { closeSync, openSync, readSync } from 'node:fs'
import { looksLikeDrawingNote } from '@genoffice/excalidraw-engine'

const HEAD_BYTES = 8 * 1024

export function isDrawingNoteFile(path: string): boolean {
  let fd: number | undefined
  try {
    fd = openSync(path, 'r')
    const head = Buffer.alloc(HEAD_BYTES)
    const read = readSync(fd, head, 0, HEAD_BYTES, 0)
    // a multi-byte character cut at the end decodes as a replacement character: harmless here
    return looksLikeDrawingNote(head.subarray(0, read).toString('utf8'))
  } catch {
    return false
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}
