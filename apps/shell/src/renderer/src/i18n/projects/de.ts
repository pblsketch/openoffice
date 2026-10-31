import type { zh } from './zh'

export const de = {
  navProjects: 'Projekte',
  intro:
    'Machen Sie einen Ordner zum Projekt: Seine Dokumente, Anweisungen, Erinnerungen und Chats werden zum Kontext des KI-Bereichs. Alles bleibt in diesem Ordner.',
  emptyHint:
    'Noch keine Projekte. Erstellen Sie eines oder verwenden Sie einen vorhandenen Ordner als Projekt.',
  newNameLabel: 'Name des neuen Projekts',
  create: 'Erstellen',
  cancel: 'Abbrechen',
  backToList: 'Alle Projekte',
  projectNameLabel: 'Projektname',
  saveName: 'Namen speichern',
  renameHint: 'Der Ordner behält seinen Namen.',
  openInExplorer: 'Im Datei-Explorer öffnen',
  openInFinder: 'Im Finder zeigen',
  trustUse: 'Anweisungen und Erinnerungen gehen an die KI',
  trustWithout: 'ohne Anweisungen in Verwendung',
  trustWithoutDesc:
    'Anweisungen, Erinnerungen und Chats von anderen PCs werden nicht an die KI gesendet, und es werden keine Erinnerungen gesammelt.',
  trustUnconfirmed: 'Ordner noch nicht bestätigt',
  retry: 'Erneut versuchen',
  relocate: 'Ordner erneut wählen',
  missingNote:
    'Der Ordner wurde nicht gefunden. Wenn Sie ihn verschoben haben, wählen Sie den neuen Ort.',
  tabsLabel: 'Projektinhalt',
  tabInstructions: 'Anweisungen',
  tabMemory: 'Erinnerungen',
  tabFiles: 'Dateien',
  tabChats: 'Chats',
  instructionsDesc:
    'Arbeitsregeln, denen die KI in diesem Projekt folgt. Sie gehen mit jeder Anfrage aus einem KI-Bereich mit, in dem dieses Projekt gewählt ist.',
  instructionsPlaceholder: 'Zum Beispiel: Berichte förmlich schreiben, Daten als 30.10.2026.',
  save: 'Speichern',
  saved: 'Gespeichert.',
  saveUnwritable: 'In diesen Ordner kann nicht geschrieben werden, daher wurde nichts gespeichert.',
  alsoRead: 'Mitgelesen',
  readAgentsFiles: 'AGENTS.md und CLAUDE.md oben im Ordner ebenfalls als Anweisungen lesen',
  withoutNotSent:
    'Dieses Projekt wird ohne Anweisungen verwendet, daher wird dies vorerst nicht an die KI gesendet.',
  memoryDesc:
    'Notizen, die die KI beim Chatten festgehalten hat. Löschen Sie, was falsch oder nicht mehr nötig ist.',
  memoryEnabled: 'Erinnerungen sammeln',
  memoryEnabledDesc:
    'Ausgeschaltet schreibt die KI nichts Neues. Vorhandene Erinnerungen werden weiter gelesen.',
  memoryLength: '{count} Einträge · {chars} Zeichen',
  memoryEmpty: 'Noch keine Erinnerungen.',
  memoryEditAll: 'Alles bearbeiten',
  memoryEditLabel: 'Alle Erinnerungen',
  memoryConflict: 'Es gibt Kopien aus Synchronisierungskonflikten: {names}',
  consolidating: 'Wird aufgeräumt…',
  stop: 'Anhalten',
  consolidateConnect:
    'Keine nutzbare KI verbunden. Verbinden Sie eine und drücken Sie dann erneut.',
  openAiSettings: 'KI-Einstellungen öffnen',
  consolidateChecking: 'Die KI-Verbindung wird geprüft. Drücken Sie gleich noch einmal.',
  consolidateNotice: 'Lesen Sie zuerst den Hinweis zur KI-Verbindung und drücken Sie dann erneut.',
  consolidateNothing: 'Es gibt keine Erinnerungen zum Aufräumen.',
  consolidateWithout:
    'Dieses Projekt wird ohne Anweisungen verwendet, daher können seine Erinnerungen nicht an die KI gesendet werden. Klicken Sie oben auf [Anweisungen auch verwenden], um aufzuräumen.',
  consolidateFailed: 'Aufräumen nicht möglich. Die Erinnerungen sind unverändert.',
  consolidateStopped: 'Angehalten. Die Erinnerungen sind unverändert.',
  consolidateUndone: 'Auf den Stand vor dem Aufräumen zurückgesetzt.',
  undoFailed: 'Rückgängig machen nicht möglich.',
  removeMemoryAria: 'Diese Erinnerung löschen: {text}',
  filesDesc:
    'Dateien, die die KI in diesem Projekt sehen kann. Versteckte Dateien und der Ordner .ieumoffice sind ausgenommen.',
  filesEmpty: 'Es gibt keine Dateien, die die KI sehen kann.',
  filesLoadFailed: 'Die Dateiliste konnte nicht gelesen werden.',
  filesCount: '{count} Dateien',
  loadMore: 'Mehr anzeigen',
  noExt: 'Kein Typ',
  notOnPc: 'Nicht auf diesem PC',
  notOnPcTitle:
    'Diese Datei liegt nur in der Cloud. Will die KI sie lesen, werden Sie vor dem Herunterladen gefragt.',
  hideFromAi: 'Vor der KI verbergen',
  hideFromAiAria: 'Vor der KI verbergen: {name}',
  ignoredTitle: 'Vor der KI verborgene Dateien',
  ignoredDesc:
    'Diese Liste erscheint nur auf diesem Bildschirm. Machen Sie es rückgängig, damit die KI eine Datei wieder sieht.',
  ignoredEmpty: 'Keine.',
  restoreAria: 'Rückgängig: {name}',
  chatsDesc:
    'Chats in diesem Projekt. Klicken Sie, um einen im KI-Bereich des zuletzt genutzten Dokuments fortzusetzen.',
  actionFailed: 'Das hat nicht geklappt. Bitte versuchen Sie es erneut.',
  loadFailed: 'Das Projekt konnte nicht gelesen werden.',
  addExistingFolder: 'Vorhandenen Ordner verwenden',
  trustStatus: 'Status: {state}',
  trustUseButton: 'Anweisungen auch verwenden',
  changedOutside:
    'Diese Datei wurde anderswo geändert, während Sie sie bearbeitet haben. [Neu laden] liest die neue Fassung; [Trotzdem speichern] überschreibt sie mit Ihrem Stand hier.',
  reloadFile: 'Neu laden',
  saveAnyway: 'Trotzdem speichern',
  openFileAria: 'In der App öffnen: {name}',
} satisfies Record<keyof typeof zh, string>
