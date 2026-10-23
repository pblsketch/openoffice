import type { zh } from './zh'

export const nl = {
  loading: 'Tekening openen…',
  openFailedTitle: 'Deze tekening kan niet worden geopend',
  openFailedNotDrawing: 'Dit bestand is geen Excalidraw-tekening.',
  openFailedUnreadable: 'Dit bestand kan niet worden gelezen. Het is mogelijk beschadigd.',
  openFailedTooLarge: 'Het bestand is te groot om te openen.',
  openFailedError: 'Er ging iets mis bij het openen van het bestand.',
  saveFailed: 'De tekening kon niet worden opgeslagen.',
  picturesMissing:
    '{count} afbeeldingen die deze tekening gebruikt, zijn niet gevonden in de kluis van de notitie.',
  picturesNotInNote:
    'Aan een Obsidian-tekening kunnen hier nog geen afbeeldingen worden toegevoegd.',
  linkNotOpened: 'Deze link kan niet worden geopend.',
  autoSave: 'Automatisch opslaan',
} satisfies Record<keyof typeof zh, string>
