import type { zh } from './zh'

export const de = {
  cvToMarkdown: 'PDF in Markdown',
  cvToEpub: 'PDF in EPUB',
  cvTitleMd: 'In Markdown umwandeln',
  cvTitleEpub: 'In EPUB umwandeln',
  cvPages: 'Seiten',
  cvPagesAll: 'Alle Seiten ({count})',
  cvPagesSome: 'Nur diese Seiten',
  cvPagesPlaceholder: 'z. B. 1-5, 8',
  cvPagesEmpty: 'Geben Sie die umzuwandelnden Seiten ein',
  cvPagesSyntax: 'Verwenden Sie Seitenzahlen und Bereiche, etwa 1-5, 8',
  cvPagesOutOfRange: 'Wählen Sie Seiten zwischen {first} und {last}',
  cvTarget: 'Speichern unter',
  cvTargetNone: 'Noch nicht gewählt',
  cvTargetChoose: 'Wählen…',
  cvCover: 'Erste Seite als Titelbild verwenden',
  cvPageBreaks: 'Jede Originalseite auf einem neuen Bildschirm beginnen',
  cvBookTitle: 'Titel',
  cvBookAuthor: 'Autor',
  cvBookLanguage: 'Sprache',
  cvBookLanguageAuto: 'Aus dem Text erkennen',
  cvBookLanguageInvalid: 'Verwenden Sie einen Sprachcode wie de oder en-US',
  cvBookTitleRequired: 'Geben Sie einen Titel ein',
  cvAiFill: 'Mit KI ausfüllen',
  cvAiFillTip:
    'Sendet den Text der ersten Seiten einmal an die KI und trägt den vorgeschlagenen Titel, Autor und die Sprache ein',
  cvAiFilling: 'Die KI liest die ersten Seiten…',
  cvAiFilled: 'Nach dem Vorschlag der KI ausgefüllt. Prüfen und bei Bedarf ändern.',
  cvAiNoText: 'Die ersten Seiten enthalten keinen Text zum Senden.',
  cvAiUnreadable: 'Die Antwort der KI konnte nicht gelesen werden. Versuchen Sie es erneut.',
  cvConvert: 'Umwandeln',
  cvPreparing: 'Wird vorbereitet…',
  cvRunning: 'Wird umgewandelt… Seite {done} von {total}',
  cvCancelled: 'Die Umwandlung wurde abgebrochen.',
  cvDoneMd: 'In Markdown umgewandelt.',
  cvDoneEpub: 'Als EPUB gespeichert.',
  cvOpenMd: 'In Markdown öffnen',
  cvOpenFolder: 'Ordner öffnen',
  cvClose: 'Schließen',
  cvWarnPageAsImage:
    'Als Bild eingefügte Seiten, weil ihr Text nicht gelesen werden konnte: {pages}',
  cvWarnScannedHint:
    'Gescannte Seiten werden zu Text, wenn Sie sie vorher mit der KI lesen lassen.',
  cvWarnAllPagesAsImages:
    'Alle Seiten wurden als Bilder eingefügt. Wenn Sie die Seiten vorher mit der KI lesen lassen, werden sie zu Text.',
  cvWarnFigureWithoutImage: 'Bilder, die nicht extrahiert werden konnten, auf Seiten: {pages}',
  cvWarnFormulaAsCode: 'Als LaTeX-Quelltext belassene Formeln, auf Seiten: {pages}',
  cvWarnFootnoteMissing: 'Fußnotenzeichen ohne Fußnotentext, auf Seiten: {pages}',
  cvWarnFootnoteUnreferenced:
    'Fußnoten, auf die kein Zeichen im Text verweist, auf Seiten: {pages}',
  cvWarnFootnoteLinkFailed:
    'Fußnoten, die nicht mit dem Text verknüpft werden konnten, auf Seiten: {pages}',
  cvErrAssetConflict:
    'Der Ordner assets an diesem Ort enthält bereits eine gleichnamige Datei, die nicht von dieser App stammt, daher wurde nichts geschrieben. Verschieben Sie die Datei oder wählen Sie einen anderen Ort.',
  cvErrCorrupt: 'Das PDF konnte nicht geöffnet werden. Die Datei ist möglicherweise beschädigt.',
  cvErrUnsupported:
    'Dieses PDF verwendet eine Sicherheitsart, die hier nicht geöffnet werden kann.',
  cvErrBusy:
    'Für dieses Dokument läuft bereits ein anderer Auftrag oder es wird an diesen Ort geschrieben. Versuchen Sie es danach erneut.',
  cvErrNotAvailable: 'In diesem Fenster ist keine Umwandlung möglich.',
  cvErrProcessExited:
    'Die Umwandlung wurde unerwartet beendet. Das Dokument ist möglicherweise zu groß für den verfügbaren Speicher.',
  cvErrStoreWrite:
    'Das Ergebnis konnte nicht geschrieben werden. Der Datenträger ist eventuell voll.',
  cvErrTarget: 'Wählen Sie den Speicherort erneut.',
  cvErrTargetOpen:
    'Diese Datei ist in einem Markdown-Tab geöffnet. Schließen Sie den Tab und versuchen Sie es erneut.',
  cvErrFailed: 'Die Umwandlung ist fehlgeschlagen.',
  cvPageImageAlt: 'Seite {page}',
  imgExportWholePages: 'Ganze Seiten',
  imgExportEmbedded: 'Nur die Bilder in den Seiten',
  imgExportEmbeddedTip:
    'Die in den Seiten platzierten Bilder in Originalauflösung als PNG-Dateien speichern',
  imgExportFolderTitle: 'Ordner für den Bildexport',
  imgExportProgress: 'Wird exportiert… {done} / {total}',
  imgExportDone: '{count} Bilder exportiert',
  imgExportNone: 'In den Seiten wurden keine Bilder gefunden',
  imgExportFailed: 'Bildexport fehlgeschlagen: {reason}',
} satisfies Record<keyof typeof zh, string>
