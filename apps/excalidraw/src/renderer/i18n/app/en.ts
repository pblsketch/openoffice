import type { zh } from './zh'

export const en = {
  loading: 'Opening the drawing…',
  openFailedTitle: "This drawing can't be opened",
  openFailedNotDrawing: 'This file is not an Excalidraw drawing.',
  openFailedUnreadable: "This file can't be read. It may be damaged.",
  openFailedTooLarge: 'This file is too large to open.',
  openFailedError: 'Something went wrong while opening the file.',
  saveFailed: "The drawing couldn't be saved.",
  picturesMissing: "{count} pictures this drawing uses weren't found in the note's vault.",
  picturesNotInNote: "Pictures can't be added to an Obsidian drawing here yet.",
  linkNotOpened: "This link can't be opened.",
  autoSave: 'Auto save',
} satisfies Record<keyof typeof zh, string>
