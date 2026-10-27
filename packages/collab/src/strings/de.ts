import type { zh } from './zh'

export const de = {
  button: 'Zusammenarbeiten',
  dialogTitle: 'Zusammenarbeiten',
  tabShare: 'Dieses Dokument freigeben',
  tabJoin: 'Beitreten',
  nameLabel: 'Mein Name',
  nameHint: 'Wird bei allen anderen auf dem Bildschirm neben Ihrem Cursor angezeigt.',
  colorLabel: 'Meine Farbe',
  colorChoice: 'Farbe {n}',
  shareIntro:
    'Personen im selben Netzwerk (LAN) können dieses Dokument nach Eingabe der PIN gemeinsam mit Ihnen ansehen und bearbeiten. Die Datei wird nur auf diesem PC gespeichert.',
  shareStart: 'Freigabe starten',
  shareStarting: 'Wird gestartet…',
  shareStop: 'Freigabe beenden',
  pinLabel: 'PIN',
  pinNew: 'Neue PIN',
  pinChanged:
    'Es wurden zu viele falsche PINs eingegeben, daher wurde die PIN ersetzt. Bereits verbundene Personen bleiben dabei.',
  addressLabel: 'Adresse dieses PCs',
  peopleLabel: 'Teilnehmende',
  nobodyYet: 'Bisher ist niemand beigetreten.',
  you: 'Sie',
  hostBadge: 'gibt frei',
  joinIntro:
    'Geben Sie die PIN ein, die Sie von der freigebenden Person erhalten haben. Wählen Sie ein in diesem Netzwerk gefundenes Dokument aus, oder geben Sie die Adresse ein.',
  searching: 'Freigegebene Dokumente in diesem Netzwerk werden gesucht…',
  foundLabel: 'Gefunden',
  foundBy: 'freigegeben von {name}',
  addressInput: 'Adresse',
  addressPlaceholder: 'z. B. 192.168.0.12',
  pinInput: 'PIN (6 Ziffern)',
  join: 'Beitreten',
  joining: 'Verbindung wird hergestellt…',
  close: 'Schließen',
  leave: 'Verlassen',
  errPin: 'Diese PIN ist falsch.',
  errLocked:
    'Zu viele falsche PINs. Von diesem PC aus ist 10 Minuten lang kein weiterer Versuch möglich.',
  errFull: 'Diese Sitzung ist voll.',
  errVersion:
    'Auf dem anderen PC läuft eine andere Version der App. Aktualisieren Sie beide PCs auf dieselbe Version.',
  errUnreachable:
    'Mit dieser Adresse konnte keine Verbindung hergestellt werden. Prüfen Sie die Adresse, das Netzwerk und die Firewall des freigebenden PCs.',
  errTimeout: 'Der freigebende PC antwortet nicht.',
  errInvalid: 'Prüfen Sie die Adresse und die PIN.',
  errUnavailable: 'Dieses Dokument konnte auf diesem PC nicht geöffnet werden.',
  errShareNetwork:
    'Die Freigabe konnte auf diesem PC nicht gestartet werden. Prüfen Sie, ob ein anderes Programm das Netzwerk blockiert.',
  errShareTooLarge: 'Dieses Dokument ist zu groß für die Freigabe.',
  errShareBusy: 'Diese Registerkarte ist bereits in einer Sitzung.',
  errShareSaveFirst:
    'Es gibt nicht gespeicherte Änderungen. Speichern Sie zuerst, und geben Sie das Dokument dann frei.',
  errShareEncrypted: 'Kennwortgeschützte Dokumente können nicht freigegeben werden.',
  errShareUnsupported: 'Dieses Dokument kann derzeit nicht freigegeben werden.',
  endedByHost:
    'Die freigebende Person hat die Sitzung beendet. Dieses Dokument ist jetzt eine nicht gespeicherte Kopie auf diesem PC.',
  endedLost:
    'Die Verbindung zum freigebenden PC wurde getrennt. Dieses Dokument ist jetzt eine nicht gespeicherte Kopie auf diesem PC.',
  endedLeft:
    'Sie haben die Sitzung verlassen. Dieses Dokument ist jetzt eine nicht gespeicherte Kopie auf diesem PC.',
  endedHostStopped: 'Freigabe beendet.',
  guestSaveBlocked: 'Während einer Sitzung speichert die freigebende Person die Datei.',
  guestBlocked: 'Diese Funktion ist während einer Sitzung nicht verfügbar.',
  hostBlocked: 'Diese Funktion ist nicht verfügbar, solange andere an der Sitzung teilnehmen.',
  viewOnly:
    'In diesem Format kann nur die freigebende Person bearbeiten. Wer beitritt, sieht die Änderungen live.',
  lanNotice:
    'Die übertragenen Inhalte sind verschlüsselt, nur Personen mit der PIN können sie lesen. Während der Freigabe sind Ihr Name und der Dokumenttitel im Netzwerk sichtbar.',
  firewallHint:
    'Wenn die Windows-Firewall beim ersten Freigeben nachfragt, lassen Sie den Zugriff in privaten Netzwerken zu.',
  statusHosting: 'Freigegeben · {count}',
  statusGuest: 'Im Dokument von {name}',
  dismiss: 'Verstanden',
} satisfies Record<keyof typeof zh, string>
