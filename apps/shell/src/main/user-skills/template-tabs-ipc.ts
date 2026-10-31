/**
 * The template flow's channels (spec 5.6, 5.7): any editor's AI panel and the
 * home ask panel may open a template skill's copy; an editor tab may open a
 * preview of its document; only a preview tab may read its original's bytes
 * or end the preview; a tab takes only its own hand-off. Every request is
 * checked again here.
 */
import { ipcMain } from 'electron'
import {
  USER_SKILLS_CHANNELS as C,
  handoffTargetOf,
  previewEndedOf,
  previewInputOf,
  templateOpenInputOf,
  type UserSkillsFail,
} from '@genoffice/electron-utils/user-skills-channels'
import type { TemplateTabs } from './template-tabs'

const invalid: UserSkillsFail = { ok: false, reason: 'invalid' }
const failed: UserSkillsFail = { ok: false, reason: 'failed' }

export function registerTemplateTabsIpc(tabs: TemplateTabs): void {
  ipcMain.handle(C.openTemplate, async (event, raw: unknown) => {
    const input = templateOpenInputOf(raw)
    if (!input) return invalid
    // the asking panel's window: the copy's tab follows its project (spec 6)
    return tabs.openTemplate(input, event.sender.id).catch(() => failed)
  })

  ipcMain.handle(C.openPreview, async (event, raw: unknown) => {
    const input = previewInputOf(raw)
    if (!input) return invalid
    const owner = event.sender
    return tabs
      .openPreview(
        {
          id: owner.id,
          isDestroyed: () => owner.isDestroyed(),
          send: (channel, payload) => owner.send(channel, payload),
        },
        input,
      )
      .catch(() => failed)
  })

  ipcMain.handle(C.previewOriginal, (event, previewId: unknown) => {
    if (typeof previewId !== 'string' || previewId.length > 128) return invalid
    return tabs.previewOriginal(event.sender.id, previewId)
  })

  ipcMain.handle(C.finishPreview, (event, raw: unknown) => {
    const ended = previewEndedOf(raw)
    if (!ended) return invalid
    return tabs.finishPreview(event.sender.id, ended)
  })

  ipcMain.handle(C.takeHandoff, (event, target: unknown) => {
    const editor = handoffTargetOf(target)
    return editor ? tabs.takeHandoff(editor, event.sender.id) : null
  })

  ipcMain.handle(C.focusTab, (_event, tabId: unknown) => {
    if (typeof tabId !== 'string' || tabId.length > 64) return invalid
    return tabs.focusTab(tabId)
  })
}
