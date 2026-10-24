import type { zh } from './zh'

export const fr = {
  editUndo: 'Annuler',
  editRedo: 'Rétablir',
  editBold: 'Gras',
  editItalic: 'Italique',
  editReplace: 'Remplacer',
  editReplaceWith: 'Remplacer par',
  editReplaceOne: 'Remplacer',
  editReplaceAll: 'Tout remplacer',
  editReplaceDone: '{count} remplacement(s) effectué(s)',
  editReplaceSkipped: '{count} occurrence(s) ignorée(s) dans des chapitres en lecture seule',
  editReplaceFailed: '{count} occurrence(s) n’ont pas pu être remplacées',
  editReplaceNone: 'Rien à remplacer',
  editReplaceNotHere: 'Cette occurrence ne peut pas être remplacée',
  editAutoSave: 'Enregistrement automatique',
  editAutoSaveTip: 'Enregistre toutes les 30 secondes et quand la fenêtre perd le focus',
  editUnsaved: 'Modifications non enregistrées',
  editLocked: 'La modification est impossible pendant la traduction du livre',
  editRefused: 'Cette modification n’a pas pu être appliquée',
  editHistoryFailed: 'L’historique d’annulation ne correspondait plus au livre et a été effacé',
} satisfies Record<keyof typeof zh, string>
