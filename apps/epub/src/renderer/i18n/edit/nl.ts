import type { zh } from './zh'

export const nl = {
  editUndo: 'Ongedaan maken',
  editRedo: 'Opnieuw',
  editBold: 'Vet',
  editItalic: 'Cursief',
  editReplace: 'Vervangen',
  editReplaceWith: 'Vervangen door',
  editReplaceOne: 'Vervangen',
  editReplaceAll: 'Alles vervangen',
  editReplaceDone: '{count} vervangen',
  editReplaceSkipped: '{count} overgeslagen in alleen-lezen hoofdstukken',
  editReplaceFailed: '{count} konden niet worden vervangen',
  editReplaceNone: 'Niets te vervangen',
  editReplaceNotHere: 'Deze overeenkomst kan niet worden vervangen',
  editAutoSave: 'Automatisch opslaan',
  editAutoSaveTip: 'Slaat elke 30 seconden op en wanneer het venster de focus verliest',
  editUnsaved: 'Niet-opgeslagen wijzigingen',
  editLocked: 'Bewerken kan niet terwijl het boek wordt vertaald',
  editRefused: 'Deze wijziging kon niet worden aangebracht',
  editHistoryFailed:
    'De geschiedenis voor ongedaan maken klopte niet meer met het boek en is gewist',
} satisfies Record<keyof typeof zh, string>
