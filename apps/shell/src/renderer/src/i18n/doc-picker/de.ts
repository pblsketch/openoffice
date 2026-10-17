import type { zh } from './zh'

export const de = {
  docPickTitle: 'Aus GenOffice-Dokumenten anhängen',
  docPickOpen: 'Geöffnete Dokumente',
  docPickRecent: 'Zuletzt verwendete Dokumente',
  docPickEmpty: 'Es gibt keine Dokumente zum Anhängen.',
  docPickMissing: 'Die Datei wurde nicht gefunden.',
  docPickUnsaved: 'Bitte zuerst speichern.',
  docPickUnavailable: 'Die Dokumentliste konnte nicht gelesen werden.',
  docPickLimit: 'Es lassen sich höchstens 20 Dokumente auswählen.',
  docPickSelected: '{n} ausgewählt',
  docPickAttach: 'Anhängen',
  docPickCancel: 'Abbrechen',
  docPickWorking: 'Wird angehängt…',
} satisfies Record<keyof typeof zh, string>
