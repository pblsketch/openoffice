import type { zh } from './zh'

export const de = {
  editUndo: 'Rückgängig',
  editRedo: 'Wiederholen',
  editBold: 'Fett',
  editItalic: 'Kursiv',
  editReplace: 'Ersetzen',
  editReplaceWith: 'Ersetzen durch',
  editReplaceOne: 'Ersetzen',
  editReplaceAll: 'Alle ersetzen',
  editReplaceDone: '{count} ersetzt',
  editReplaceSkipped: '{count} in schreibgeschützten Kapiteln übersprungen',
  editReplaceFailed: '{count} konnten nicht ersetzt werden',
  editReplaceNone: 'Nichts zu ersetzen',
  editReplaceNotHere: 'Diese Fundstelle kann nicht ersetzt werden',
  editAutoSave: 'Automatisch speichern',
  editAutoSaveTip: 'Speichert alle 30 Sekunden und wenn das Fenster den Fokus verliert',
  editUnsaved: 'Ungespeicherte Änderungen',
  editLocked: 'Während das Buch übersetzt wird, kann nicht bearbeitet werden',
  editRefused: 'Diese Änderung konnte nicht vorgenommen werden',
  editHistoryFailed: 'Der Rückgängig-Verlauf passte nicht mehr zum Buch und wurde gelöscht',
} satisfies Record<keyof typeof zh, string>
