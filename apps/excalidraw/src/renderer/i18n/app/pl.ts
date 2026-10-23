import type { zh } from './zh'

export const pl = {
  loading: 'Otwieranie rysunku…',
  openFailedTitle: 'Nie można otworzyć tego rysunku',
  openFailedNotDrawing: 'Ten plik nie jest rysunkiem Excalidraw.',
  openFailedUnreadable: 'Nie można odczytać tego pliku. Może być uszkodzony.',
  openFailedTooLarge: 'Plik jest zbyt duży, aby go otworzyć.',
  openFailedError: 'Podczas otwierania pliku wystąpił problem.',
  saveFailed: 'Nie udało się zapisać rysunku.',
  picturesMissing: 'Nie znaleziono w sejfie notatki obrazów używanych przez ten rysunek: {count}.',
  picturesNotInNote: 'Do rysunku Obsidian nie można tu jeszcze dodawać obrazów.',
  linkNotOpened: 'Nie można otworzyć tego linku.',
  autoSave: 'Autozapis',
} satisfies Record<keyof typeof zh, string>
