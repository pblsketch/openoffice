import type { zh } from './zh'

export const de = {
  loading: 'Zeichnung wird geöffnet…',
  openFailedTitle: 'Diese Zeichnung kann nicht geöffnet werden',
  openFailedNotDrawing: 'Diese Datei ist keine Excalidraw-Zeichnung.',
  openFailedUnreadable: 'Diese Datei kann nicht gelesen werden. Sie ist möglicherweise beschädigt.',
  openFailedTooLarge: 'Die Datei ist zu groß zum Öffnen.',
  openFailedError: 'Beim Öffnen der Datei ist ein Fehler aufgetreten.',
  saveFailed: 'Die Zeichnung konnte nicht gespeichert werden.',
  picturesMissing: '{count} Bilder dieser Zeichnung wurden im Tresor der Notiz nicht gefunden.',
  picturesNotInNote:
    'Zu einer Obsidian-Zeichnung können hier noch keine Bilder hinzugefügt werden.',
  linkNotOpened: 'Dieser Link kann nicht geöffnet werden.',
  autoSave: 'Automatisch speichern',
} satisfies Record<keyof typeof zh, string>
