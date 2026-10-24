import type { zh } from './zh'

export const en = {
  title: 'Documents with unsaved content',
  intro:
    'These documents still have content you did not save. Choose for each one whether to restore or discard it. Discarded content cannot be recovered.',
  restore: 'Restore',
  discard: 'Discard',
  restoreAll: 'Restore all',
  discardAll: 'Discard all',
  confirm: 'OK',
  later: 'Decide later',
  laterHint: 'Closing this list deletes nothing; you will be asked again later.',
  untitledFolder: 'New document, never saved',
  lastCopy: 'Kept at {time}',
  changedAfter: 'The file changed afterwards',
  changedAfterNote:
    'Another program or cloud sync may have changed it. “Discard” is selected so the file stays as it is now.',
  missing: 'Original file not found',
  missingNote:
    'If you restore it, it opens as a new untitled document. Saving suggests the original location.',
  choiceLabel: 'Choice for {name}',
} satisfies Record<keyof typeof zh, string>
