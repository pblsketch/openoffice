import type { zh } from './zh'

export const en = {
  editUndo: 'Undo',
  editRedo: 'Redo',
  editBold: 'Bold',
  editItalic: 'Italic',
  editReplace: 'Replace',
  editReplaceWith: 'Replace with',
  editReplaceOne: 'Replace',
  editReplaceAll: 'Replace all',
  editReplaceDone: 'Replaced {count}',
  editReplaceSkipped: 'Skipped {count} in read-only chapters',
  editReplaceFailed: '{count} could not be replaced',
  editReplaceNone: 'Nothing to replace',
  editReplaceNotHere: 'This match cannot be replaced',
  editAutoSave: 'Auto save',
  editAutoSaveTip: 'Saves every 30 seconds and when the window loses focus',
  editUnsaved: 'Unsaved changes',
  editLocked: 'Editing is not available while the book is being translated',
  editRefused: 'This change could not be made',
  editHistoryFailed: 'The undo history no longer matched the book and was cleared',
} satisfies Record<keyof typeof zh, string>
