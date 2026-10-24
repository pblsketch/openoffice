import type { zh } from './zh'

export const it = {
  editUndo: 'Annulla',
  editRedo: 'Ripeti',
  editBold: 'Grassetto',
  editItalic: 'Corsivo',
  editReplace: 'Sostituisci',
  editReplaceWith: 'Sostituisci con',
  editReplaceOne: 'Sostituisci',
  editReplaceAll: 'Sostituisci tutto',
  editReplaceDone: '{count} sostituzioni effettuate',
  editReplaceSkipped: '{count} saltate nei capitoli di sola lettura',
  editReplaceFailed: 'Impossibile sostituire {count}',
  editReplaceNone: 'Niente da sostituire',
  editReplaceNotHere: 'Questa corrispondenza non può essere sostituita',
  editAutoSave: 'Salvataggio automatico',
  editAutoSaveTip: 'Salva ogni 30 secondi e quando la finestra perde il focus',
  editUnsaved: 'Modifiche non salvate',
  editLocked: 'Non è possibile modificare mentre il libro viene tradotto',
  editRefused: 'Impossibile applicare questa modifica',
  editHistoryFailed:
    'La cronologia di annullamento non corrispondeva più al libro ed è stata cancellata',
} satisfies Record<keyof typeof zh, string>
