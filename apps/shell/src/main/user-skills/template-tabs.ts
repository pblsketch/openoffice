/**
 * Template copies in new tabs (spec 5.6, 5.7), in the shell's main process.
 *
 * - A template skill's document is copied byte for byte into a fresh temp
 *   folder and opened as a NEW, UNTITLED document of its editor (the first
 *   save asks where); the request, its skill chips and, for a template
 *   preview, the pending skill proposal are queued for that tab's AI panel to
 *   take once (`generate-handoff.ts`). That panel runs it through its own send
 *   gate. The skill's folder is only read; nothing is written there.
 * - "Make a blank template" opens the current document's copy the same way, in
 *   a tab titled "Template preview - <title>", and keeps the original bytes in
 *   memory for that tab's "save the original as is". The original tab hears
 *   when the preview ends: saved, or not (the tab closed or its card was
 *   cancelled); nothing is written for an unsaved end.
 *
 * No Electron import: the shell injects file, tab and id operations, so the
 * tests run this as is.
 */
import { extname, join } from 'node:path'
import {
  handoffEditorForFile,
  queueSkillHandoffFor,
  takeSkillHandoff,
  type HandoffEditor,
  type HandoffWebContents,
  type SkillHandoff,
} from '@genoffice/electron-utils/generate-handoff'
import {
  USER_SKILLS_CHANNELS,
  type UserSkillPreviewEnded,
  type UserSkillPreviewInput,
  type UserSkillTemplateOpenInput,
  type UserSkillsFail,
  type UserSkillsFailReason,
  type UserSkillsResult,
} from '@genoffice/electron-utils/user-skills-channels'

/** A byte copy of a document, ready to open in its editor */
export interface TemplateCopy {
  editor: HandoffEditor
  /** the copy on disk, alone in a fresh folder */
  path: string
  /** the folder made for it */
  dir: string
  bytes: Uint8Array
  /** the copy's file name, with the extension */
  fileName: string
  /** the title the new tab shows */
  title: string
}

/** The webContents of a new tab, as far as this module needs it */
export interface CopyTabContents extends HandoffWebContents {
  once(event: 'destroyed', listener: () => void): unknown
}

export interface OpenedCopyTab {
  tabId: string
  contents: CopyTabContents
}

/** The tab that opened a preview (it hears the preview's end) */
export interface PreviewOwner {
  readonly id: number
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
}

export interface TemplateTabsDeps {
  /** a new empty folder for one copy */
  makeCopyDir(): Promise<string>
  writeFile(path: string, bytes: Uint8Array): Promise<void>
  readFile(path: string): Promise<Uint8Array>
  removeDir(path: string): Promise<void>
  /** an enabled skill's template file, or why there is none */
  templateFileOf(
    skillId: string,
  ): Promise<UserSkillsResult<{ path: string; fileName: string; title: string }>>
  /**
   * Open a new untitled tab of the copy's editor on the copy; null when it
   * could not. `ownsCopy` true when the editor removes the folder itself.
   */
  openCopy(copy: TemplateCopy): Promise<(OpenedCopyTab & { ownsCopy?: boolean }) | null>
  /** bring a tab to the front; false when it is gone */
  focusTab(tabId: string): boolean
  /**
   * A skill template's copy opened for the panel of `openerId` (spec 6): the
   * shell lets the new tab follow that panel's project. Not called for a preview.
   */
  copyOpenedFor?(contents: CopyTabContents, openerId: number): void
  newId(): string
  now(): number
}

interface PreviewRecord {
  owner: PreviewOwner
  /** the preview tab's webContents id */
  tabContentsId: number
  original: Uint8Array
  fileName: string
  /** the original's editor reported it may withhold something: "save as is" is refused */
  originalRedacted: boolean
  ended: boolean
}

const fail = (reason: UserSkillsFailReason): UserSkillsFail => ({ ok: false, reason })

/** A file name made from a title: no path characters, not too long */
export function copyFileNameOf(title: string, extension: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 150)
  return `${cleaned || 'template'}${extension}`
}

export function createTemplateTabs(deps: TemplateTabsDeps) {
  const previews = new Map<string, PreviewRecord>()

  const notify = (record: PreviewRecord, ended: UserSkillPreviewEnded) => {
    if (!record.owner.isDestroyed()) {
      record.owner.send(USER_SKILLS_CHANNELS.previewEnded, ended)
    }
  }

  /** Copy the bytes into a fresh folder and open the copy; the hand-off goes with it */
  async function openWithHandoff(
    bytes: Uint8Array,
    fileName: string,
    title: string,
    handoff: (target: HandoffEditor) => SkillHandoff,
  ): Promise<UserSkillsResult<{ tabId: string; contents: CopyTabContents }>> {
    const editor = handoffEditorForFile(fileName)
    if (!editor) return fail('bad-template')
    const dir = await deps.makeCopyDir()
    const path = join(dir, fileName)
    let opened: (OpenedCopyTab & { ownsCopy?: boolean }) | null
    try {
      await deps.writeFile(path, bytes)
      opened = await deps.openCopy({ editor, path, dir, bytes, fileName, title })
    } catch {
      opened = null
    }
    if (!opened) {
      await deps.removeDir(dir).catch(() => undefined)
      return fail('failed')
    }
    queueSkillHandoffFor(opened.contents, handoff(editor))
    if (!opened.ownsCopy) {
      opened.contents.once('destroyed', () => {
        void deps.removeDir(dir).catch(() => undefined)
      })
    }
    return { ok: true, tabId: opened.tabId, contents: opened.contents }
  }

  return {
    /**
     * Spec 5.7: the template of the skill a request names, copied into a new
     * tab of its editor, with the request and every chip handed over.
     */
    async openTemplate(
      input: UserSkillTemplateOpenInput,
      openerId?: number,
    ): Promise<UserSkillsResult<{ tabId: string }>> {
      const template = await deps.templateFileOf(input.skillId)
      if (!template.ok) return template
      let bytes: Uint8Array
      try {
        bytes = await deps.readFile(template.path)
      } catch {
        return fail('no-template')
      }
      const opened = await openWithHandoff(
        bytes,
        template.fileName,
        template.fileName.slice(0, template.fileName.length - extname(template.fileName).length),
        (target) => ({
          id: deps.newId(),
          mode: 'skill',
          target,
          text: input.text,
          chips: input.chips,
          createdAt: deps.now(),
        }),
      )
      if (!opened.ok) return opened
      if (openerId !== undefined) deps.copyOpenedFor?.(opened.contents, openerId)
      return { ok: true, tabId: opened.tabId }
    },

    /**
     * Spec 5.6 "make a blank template": the current document's copy in a
     * preview tab, with the clearing request and the pending proposal handed
     * over. The original bytes stay here for that tab's "save as is".
     */
    async openPreview(
      owner: PreviewOwner,
      input: UserSkillPreviewInput,
    ): Promise<UserSkillsResult<{ tabId: string; previewId: string }>> {
      const extension = extname(input.fileName).toLowerCase()
      if (!handoffEditorForFile(input.fileName)) return fail('bad-template')
      const previewId = deps.newId()
      const opened = await openWithHandoff(
        input.bytes,
        copyFileNameOf(input.tabTitle, extension),
        input.tabTitle,
        (target) => ({
          id: deps.newId(),
          mode: 'skill',
          target,
          text: input.text,
          chips: [],
          preview: {
            previewId,
            title: input.title,
            fileName: input.fileName,
            originalRedacted: input.originalRedacted,
            proposal: input.proposal,
            ...(input.draft !== undefined ? { draft: input.draft } : {}),
          },
          createdAt: deps.now(),
        }),
      )
      if (!opened.ok) return opened
      const record: PreviewRecord = {
        owner,
        tabContentsId: opened.contents.id,
        original: input.bytes,
        fileName: input.fileName,
        originalRedacted: input.originalRedacted !== false,
        ended: false,
      }
      previews.set(previewId, record)
      // spec 9.11: closing the preview tab unsaved ends it as "not saved"
      opened.contents.once('destroyed', () => {
        if (previews.get(previewId) !== record) return
        previews.delete(previewId)
        if (!record.ended) notify(record, { previewId, outcome: 'unsaved' })
      })
      return { ok: true, tabId: opened.tabId, previewId }
    },

    /**
     * Any document's byte copy as a new untitled tab of its editor, with a
     * request (and skill chips) handed to that tab's AI panel: what the two
     * flows above do, for another caller (the agent window).
     */
    async openCopy(input: {
      bytes: Uint8Array
      fileName: string
      title: string
      text: string
      chips: SkillHandoff['chips']
    }): Promise<UserSkillsResult<{ tabId: string }>> {
      const opened = await openWithHandoff(input.bytes, input.fileName, input.title, (target) => ({
        id: deps.newId(),
        mode: 'skill',
        target,
        text: input.text,
        chips: input.chips,
        createdAt: deps.now(),
      }))
      return opened.ok ? { ok: true, tabId: opened.tabId } : opened
    },

    /**
     * The preview tab's "save the original as is": only that tab may ask, and
     * never for an original that may withhold something (the tab's button is
     * off for it too; this holds when a page asks anyway).
     */
    previewOriginal(
      senderId: number,
      previewId: string,
    ): UserSkillsResult<{ bytes: Uint8Array; fileName: string }> {
      const record = previews.get(previewId)
      if (!record || record.tabContentsId !== senderId) return fail('not-found')
      if (record.originalRedacted) return fail('redacted')
      return { ok: true, bytes: record.original, fileName: record.fileName }
    },

    /** The preview tab's card was saved or left unsaved: the original tab hears it */
    finishPreview(senderId: number, ended: UserSkillPreviewEnded): UserSkillsResult {
      const record = previews.get(ended.previewId)
      if (!record || record.tabContentsId !== senderId) return fail('not-found')
      if (record.ended) return { ok: true }
      record.ended = true
      notify(record, ended)
      return { ok: true }
    },

    /** A new tab's AI panel takes its hand-off, once */
    takeHandoff(target: HandoffEditor, senderId: number): SkillHandoff | null {
      return takeSkillHandoff(target, senderId)
    },

    focusTab(tabId: string): UserSkillsResult {
      return deps.focusTab(tabId) ? { ok: true } : fail('not-found')
    },

    /** tests and diagnostics: the previews still open */
    openPreviewIds(): string[] {
      return [...previews.keys()]
    },
  }
}

export type TemplateTabs = ReturnType<typeof createTemplateTabs>
