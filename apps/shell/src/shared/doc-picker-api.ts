/**
 * The "Attach a document" window: an editor's AI panel asks the shell for
 * documents to attach, the shell opens this window, the person ticks open or
 * recent documents, and the shell validates the ids, resolves them to paths,
 * and hands those paths back to the editor. This file only defines the shape
 * of what crosses the window↔shell boundary (channel names and data shapes);
 * validating the ids is the shell backend's job.
 */
import type { Lang } from '@genoffice/i18n'

export const DOC_PICKER_CHANNELS = {
  getInit: 'doc-picker:get-init',
  list: 'doc-picker:list',
  choose: 'doc-picker:choose',
  cancel: 'doc-picker:cancel',
} as const

export const DOC_PICKER_PAGE_KEY = 'aiOfficeDocPicker'

export type DocPickerTheme = 'light' | 'dark' | 'system'

export interface DocPickerInit {
  lang: Lang
  theme: DocPickerTheme
}

export type DocItemGroup = 'open' | 'recent'
export type DocItemState = 'ok' | 'missing' | 'unsaved'

export interface DocListItem {
  /** 저장됐으면 그 경로. 저장 안 한 문서면 'unsaved:<탭 식별자>' */
  id: string
  /** 파일 이름, 저장 전이면 문서 이름 */
  title: string
  /** 폴더(표시용). 없으면 '' */
  dir: string
  state: DocItemState
  group: DocItemGroup
}

export type DocListResult = { ok: true; items: DocListItem[] } | { ok: false; kind: 'unavailable' }
export type DocPickerChooseResult = { ok: true } | { ok: false; kind: 'unavailable' }

/** The picker window's window.aiOfficeDocPicker */
export interface DocPickerApi {
  getInit(): Promise<DocPickerInit>
  onThemeChanged(handler: (theme: DocPickerTheme) => void): () => void
  list(): Promise<DocListResult>
  choose(ids: string[]): Promise<DocPickerChooseResult>
  cancel(): Promise<void>
}
