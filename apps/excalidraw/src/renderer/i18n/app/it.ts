import type { zh } from './zh'

export const it = {
  loading: 'Apertura del disegno…',
  openFailedTitle: 'Impossibile aprire questo disegno',
  openFailedNotDrawing: 'Questo file non è un disegno di Excalidraw.',
  openFailedUnreadable: 'Impossibile leggere il file. Potrebbe essere danneggiato.',
  openFailedTooLarge: 'Il file è troppo grande per essere aperto.',
  openFailedError: 'Si è verificato un problema durante l’apertura del file.',
  saveFailed: 'Impossibile salvare il disegno.',
  picturesMissing:
    '{count} immagini usate da questo disegno non sono state trovate nel vault della nota.',
  picturesNotInNote: 'Qui non è ancora possibile aggiungere immagini a un disegno di Obsidian.',
  linkNotOpened: 'Impossibile aprire questo link.',
  autoSave: 'Salvataggio automatico',
} satisfies Record<keyof typeof zh, string>
