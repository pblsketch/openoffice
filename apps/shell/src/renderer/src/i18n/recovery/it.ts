import type { zh } from './zh'

export const it = {
  title: 'Documenti con contenuto non salvato',
  intro:
    'Questi documenti contengono ancora contenuto che non hai salvato. Scegli per ciascuno se ripristinarlo o scartarlo. Il contenuto scartato non può essere recuperato.',
  restore: 'Ripristina',
  discard: 'Scarta',
  restoreAll: 'Ripristina tutto',
  discardAll: 'Scarta tutto',
  confirm: 'Conferma',
  later: 'Decidi più tardi',
  laterHint: 'Chiudere questo elenco non elimina nulla; te lo chiederemo di nuovo più tardi.',
  untitledFolder: 'Nuovo documento, mai salvato',
  lastCopy: 'Conservato il {time}',
  changedAfter: 'Il file è stato modificato in seguito',
  changedAfterNote:
    'Un altro programma o la sincronizzazione cloud potrebbe averlo modificato. È selezionato «Scarta» per lasciare il file com’è ora.',
  missing: 'File originale non trovato',
  missingNote:
    'Se lo ripristini, si apre come nuovo documento senza titolo. Al salvataggio viene proposta la posizione originale.',
  choiceLabel: 'Scelta per {name}',
} satisfies Record<keyof typeof zh, string>
