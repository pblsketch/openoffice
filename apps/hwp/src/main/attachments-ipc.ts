/**
 * Chat attachment IPC of the HWP main process: local files the user hands to the
 * AI panel are validated and read here (the same chain as the other editors;
 * copied from the slides main). The channels carry the hwp: prefix because the
 * shell already registers the global files:* channels through docs.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { showOpenDialogWithMemory } from '@genoffice/electron-utils'
import {
  parseFileToText,
  ATTACHABLE_EXTS,
  ATTACHABLE_IMAGE_EXTS,
  ATTACHABLE_MAX_BYTES,
  ATTACHABLE_IMAGE_MAX_BYTES,
} from '@genoffice/file-parse'
import type {
  AttachmentAddResult,
  AttachmentImageResult,
  AttachmentMeta,
  AttachmentReadResult,
} from '../shared/ipc'
import { HWP_CHANNELS } from '../shared/ipc'
import { tm } from './dialog-strings'

const ATTACHMENT_IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** Extracted-text cache keyed by path; invalidated when mtime+size change */
const attachmentTextCache = new Map<string, { stamp: string; text: string }>()

function statAttachment(filePath: string): { meta?: AttachmentMeta; error?: string } {
  const name = basename(filePath)
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (!ATTACHABLE_EXTS.has(ext)) return { error: `${name}: ${tm('errUnsupportedExt', { ext })}` }
  try {
    const stat = statSync(filePath)
    if (!stat.isFile()) return { error: `${name}: ${tm('errNotFile')}` }
    if (stat.size > ATTACHABLE_MAX_BYTES) {
      return {
        error: `${name}: ${tm('errTooLarge', { mb: Math.round(ATTACHABLE_MAX_BYTES / 1024 / 1024) })}`,
      }
    }
    if (ATTACHABLE_IMAGE_EXTS.has(ext) && stat.size > ATTACHABLE_IMAGE_MAX_BYTES) {
      return { error: `${name}: ${tm('errImageTooLarge')}` }
    }
    return { meta: { path: filePath, name, ext, sizeBytes: stat.size } }
  } catch {
    return { error: `${name}: ${tm('errUnreadable')}` }
  }
}

function collectAttachments(paths: string[]): AttachmentAddResult {
  const accepted: AttachmentMeta[] = []
  const rejected: string[] = []
  for (const p of paths) {
    const { meta, error } = statAttachment(p)
    if (meta) accepted.push(meta)
    else if (error) rejected.push(error)
  }
  return { accepted, rejected }
}

/** Save clipboard-pasted image bytes to a temp file (screenshots/bitmaps without a local path) */
let pastedImageSeq = 0
function savePastedImage(
  data: unknown,
  ext: unknown,
): { path: string } | { error: 'too-large' | 'invalid' } {
  const cleanExt = typeof ext === 'string' ? ext.toLowerCase() : ''
  if (!ATTACHABLE_IMAGE_EXTS.has(cleanExt)) return { error: 'invalid' }
  const bytes =
    data instanceof ArrayBuffer
      ? Buffer.from(data)
      : ArrayBuffer.isView(data)
        ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : null
  if (!bytes || bytes.byteLength === 0) return { error: 'invalid' }
  // Renderer-driven clipboard bytes hit the temp disk: enforce the same 5MB
  // image cap as file attachments so pastes cannot fill the disk.
  if (bytes.byteLength > ATTACHABLE_IMAGE_MAX_BYTES) return { error: 'too-large' }
  const dir = join(app.getPath('temp'), 'genoffice-pasted')
  mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  const filePath = join(dir, `pasted-${stamp}-${++pastedImageSeq}.${cleanExt}`)
  writeFileSync(filePath, bytes)
  return { path: filePath }
}

/** Extract attachment text via @genoffice/file-parse (docx/pdf/pptx/xlsx/plain text) */
async function extractAttachmentText(filePath: string): Promise<string> {
  const stat = statSync(filePath)
  const stamp = `${stat.mtimeMs}:${stat.size}`
  const cached = attachmentTextCache.get(filePath)
  if (cached && cached.stamp === stamp) return cached.text
  if (stat.size > ATTACHABLE_MAX_BYTES) throw new Error(tm('errFileTooLarge'))
  const parsed = await parseFileToText(filePath)
  if (!parsed.ok || parsed.kind !== 'text' || parsed.text == null) {
    throw new Error(parsed.error ?? tm('errParseFailed'))
  }
  attachmentTextCache.set(filePath, { stamp, text: parsed.text })
  // Bounded cache (keeping a few recent files is enough)
  if (attachmentTextCache.size > 8) {
    const oldest = attachmentTextCache.keys().next().value
    if (oldest) attachmentTextCache.delete(oldest)
  }
  return parsed.text
}

/** Register the hwp:files-* attachment channels (called from registerHwpIpc). */
export function registerHwpAttachmentIpc(): void {
  ipcMain.handle(HWP_CHANNELS.filesPick, async (e): Promise<AttachmentAddResult | null> => {
    const parent =
      BrowserWindow.fromWebContents(e.sender) ?? BrowserWindow.getFocusedWindow() ?? undefined
    const options = {
      title: tm('dlgAddAttachment'),
      filters: [
        { name: tm('filterSupported'), extensions: [...ATTACHABLE_EXTS] },
        { name: tm('filterAll'), extensions: ['*'] },
      ],
      properties: ['openFile' as const, 'multiSelections' as const],
    }
    const r = await showOpenDialogWithMemory(dialog, parent, options)
    if (r.canceled || r.filePaths.length === 0) return null
    return collectAttachments(r.filePaths)
  })

  ipcMain.handle(HWP_CHANNELS.filesAdd, (_e, paths: unknown) =>
    collectAttachments(
      Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : [],
    ),
  )

  ipcMain.handle(
    HWP_CHANNELS.filesRead,
    async (
      _e,
      filePath: string,
      offset: number,
      maxChars: number,
    ): Promise<AttachmentReadResult> => {
      const name = basename(filePath)
      const ext = name.split('.').pop()?.toLowerCase() ?? ''
      if (!ATTACHABLE_EXTS.has(ext)) return { ok: false, error: tm('errUnsupportedExt', { ext }) }
      if (ATTACHABLE_IMAGE_EXTS.has(ext)) {
        return { ok: false, error: tm('errImageNoText') }
      }
      try {
        const text = await extractAttachmentText(filePath)
        const start = Math.max(0, Math.floor(offset) || 0)
        const size = Math.min(Math.max(1, Math.floor(maxChars) || 1), 48_000)
        return {
          ok: true,
          name,
          totalChars: text.length,
          offset: start,
          text: text.slice(start, start + size),
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
  )

  // Image attachments read raw bytes -> base64; AiPanel puts them into the user message's images for multimodal
  ipcMain.handle(HWP_CHANNELS.filesReadImage, (_e, filePath: string): AttachmentImageResult => {
    const name = basename(filePath)
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    const mime = ATTACHMENT_IMAGE_MIME[ext]
    if (!mime) return { ok: false, error: `${name}: ${tm('errNotImage')}` }
    try {
      const stat = statSync(filePath)
      if (stat.size > ATTACHABLE_IMAGE_MAX_BYTES) {
        return { ok: false, error: `${name}: ${tm('errImageTooLarge')}` }
      }
      return { ok: true, base64: readFileSync(filePath).toString('base64'), mime }
    } catch {
      return { ok: false, error: `${name}: ${tm('errUnreadable')}` }
    }
  })

  // Clipboard-pasted images (screenshots and other bitmaps without a local path): saved to a temp file then take the regular attachment chain
  ipcMain.handle(
    HWP_CHANNELS.filesAddPastedImage,
    (_e, data: unknown, ext: unknown): AttachmentAddResult => {
      const saved = savePastedImage(data, ext)
      if ('error' in saved) {
        return {
          accepted: [],
          rejected: [saved.error === 'too-large' ? tm('errImageTooLarge') : tm('errNotImage')],
        }
      }
      return collectAttachments([saved.path])
    },
  )
}
