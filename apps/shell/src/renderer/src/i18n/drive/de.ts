import type { zh } from './zh'

export const de = {
  driveNav: 'Google Drive',
  driveDesc:
    'Wählen Sie Dateien in Google Drive aus, öffnen und bearbeiten Sie sie in GenOffice; beim Speichern gehen sie zurück in Drive. GenOffice kann nur die Dateien öffnen, die Sie auswählen.',
  driveConnect: 'Google Drive verbinden',
  driveConnecting:
    'Melden Sie sich im Browser mit Ihrem Google-Konto an und erlauben Sie den Zugriff…',
  driveCancel: 'Abbrechen',
  driveConnectedAs: 'Verbunden als {email}',
  driveDisconnect: 'Trennen',
  driveDisconnectConfirm:
    'Damit wird die Drive-Anmeldung von diesem PC entfernt und Google gebeten, den Zugriff von GenOffice zu widerrufen. Kopien auf diesem PC bleiben erhalten.',
  driveDisconnectYes: 'Trennen',
  driveNotPersisted:
    'Dieser PC kann die Anmeldung nicht verschlüsselt speichern, daher endet die Verbindung beim Schließen der App.',
  driveExpired:
    'Google hat die Verbindung beendet: Der Zugriff wurde entzogen oder die Anmeldung ist abgelaufen. Verbinden Sie erneut.',
  driveAiAccess: 'KI darf Dateien in Drive suchen und lesen',
  driveAiAccessDesc:
    'Wenn aktiviert, kann die KI in den Editoren die hier ausgewählten Drive-Dateien durchsuchen und lesen. Was sie liest, geht an den KI-Anbieter, den Sie nutzen. Die KI kann Drive-Dateien nicht ändern, löschen oder freigeben.',
  drivePrivacy:
    'Dateilisten und -inhalte werden nur zwischen diesem PC und Google übertragen. Sie laufen nie über einen Server der Macher von GenOffice.',
  driveFailDenied: 'Die Verbindung kam nicht zustande, weil Google sie nicht erlaubt hat.',
  driveFailScope:
    'Die Verbindung kam nicht zustande, weil der Drive-Zugriff nicht angehakt war. Verbinden Sie erneut und haken Sie Drive an.',
  driveFailTimeout:
    'Die Anmeldung wurde nicht innerhalb von 10 Minuten abgeschlossen. Versuchen Sie es erneut.',
  driveFailNetwork:
    'Google ist nicht erreichbar. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.',
  driveRecent: 'Ausgewählte Dateien',
  driveSearchPlaceholder: 'In ausgewählten Dateien suchen',
  driveSearchResults: 'Ergebnisse für „{q}“',
  driveRefresh: 'Aktualisieren',
  driveNotConnectedTitle: 'Google Drive ist nicht verbunden',
  driveNotConnectedBody:
    'Nach dem Verbinden können Sie Drive-Dateien auswählen und hier öffnen und bearbeiten; beim Speichern gehen sie zurück in Drive.',
  driveOpenSettings: 'In den Einstellungen verbinden',
  driveEmpty:
    'Noch keine Dateien. Klicken Sie auf „Aus Google Drive auswählen“, um welche auszuwählen.',
  driveLoading: 'Wird geladen…',
  driveLoadMore: 'Mehr anzeigen',
  driveOpening: 'Wird geöffnet…',
  driveGoogleBadge: 'Google-Format',
  driveGoogleNote:
    'Ein Google-Dokument wird als Office-Datei geöffnet. Beim Speichern bleibt das Original unverändert, und daneben oder in „Meine Ablage“ wird eine Office-Datei gespeichert.',
  driveReadOnly: 'Nur ansehen',
  driveReadOnlyNote:
    'Sie dürfen diese Datei nicht bearbeiten. Beim Speichern werden Sie gefragt, ob eine Kopie in Drive gespeichert werden soll.',
  driveUnsupported: 'Diese App kann diese Art von Datei nicht öffnen.',
  driveErrNotConnected: 'Google Drive ist getrennt. Verbinden Sie es in den Einstellungen erneut.',
  driveErrNotFound:
    'Datei nicht gefunden. Sie wurde gelöscht, oder dieses Konto kann sie nicht sehen.',
  driveErrForbidden: 'Dieses Konto darf diese Datei nicht herunterladen.',
  driveErrTooLarge: 'Die Datei ist zu groß zum Öffnen.',
  driveErrRateLimit: 'Google hält Anfragen kurz zurück. Versuchen Sie es gleich noch einmal.',
  driveErrNetwork: 'Google Drive ist nicht erreichbar. Prüfen Sie Ihre Internetverbindung.',
  driveErrDisk: 'Die Datei konnte nicht auf diesem PC gespeichert werden.',
  drivePick: 'Aus Google Drive auswählen',
  drivePicking:
    'Wählen Sie die Dateien in dem Google-Fenster aus, das sich im Browser geöffnet hat…',
  drivePickNote:
    'GenOffice kann nur die Drive-Dateien öffnen, die Sie im Google-Fenster auswählen. Einmal ausgewählte Dateien bleiben in dieser Liste.',
  driveTrainingTitle: 'Bevor Sie Drive-Dateien mit KI verwenden',
  driveTrainingBody:
    'Google erlaubt nicht, dass Drive-Dateien an einen KI-Dienst gehen, der damit seine Modelle trainiert. Private Claude-, ChatGPT- und Codex-Tarife können Ihre Chats zum Training verwenden, wenn Sie das nicht ausschalten: in Claude unter Einstellungen → Datenschutz, in ChatGPT unter Einstellungen → Datenkontrollen → „Das Modell für alle verbessern“. Anbieter mit API-Schlüssel trainieren standardmäßig nicht mit API-Daten. Kostenlose KI-Verbindungen erhalten nie Drive-Dateien.',
  driveTrainingAck:
    'Das Modelltraining ist in den KI-Konten, die ich mit Drive-Dateien nutze, ausgeschaltet',
  driveFailTraining: 'Haken Sie zuerst oben den Punkt zum Modelltraining an.',
} satisfies Record<keyof typeof zh, string>
