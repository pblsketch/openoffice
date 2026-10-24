import type { zh } from './zh'

export const de = {
  title: 'Dokumente mit nicht gespeichertem Inhalt',
  intro:
    'Diese Dokumente enthalten noch Inhalt, den Sie nicht gespeichert haben. Wählen Sie für jedes, ob es wiederhergestellt oder verworfen wird. Verworfener Inhalt lässt sich nicht zurückholen.',
  restore: 'Wiederherstellen',
  discard: 'Verwerfen',
  restoreAll: 'Alle wiederherstellen',
  discardAll: 'Alle verwerfen',
  confirm: 'Übernehmen',
  later: 'Später entscheiden',
  laterHint:
    'Wenn Sie diese Liste schließen, wird nichts gelöscht; Sie werden später erneut gefragt.',
  untitledFolder: 'Neues Dokument, nie gespeichert',
  lastCopy: 'Gesichert am {time}',
  changedAfter: 'Die Datei wurde danach geändert',
  changedAfterNote:
    'Ein anderes Programm oder eine Cloud-Synchronisierung hat sie möglicherweise geändert. „Verwerfen“ ist ausgewählt, damit die Datei so bleibt, wie sie jetzt ist.',
  missing: 'Originaldatei nicht gefunden',
  missingNote:
    'Beim Wiederherstellen öffnet es sich als neues, unbenanntes Dokument. Beim Speichern wird der ursprüngliche Ort vorgeschlagen.',
  choiceLabel: 'Auswahl für {name}',
} satisfies Record<keyof typeof zh, string>
