import type { zh } from './zh'

export const de = {
  windowTitle: 'Agent',
  homeCardSub: 'In einem Ordner mit Claude Code oder Codex arbeiten',
  intro:
    'Der Agent führt Ihr Claude Code oder Codex in einem Ordner Ihrer Wahl aus. Er kann die Dateien darin lesen, neue erstellen, Ihre Skills nutzen, Skripte ausführen und in GenOffice geöffnete Dokumente ändern.',
  folderLabel: 'Projektordner',
  folderPick: 'Ordner wählen…',
  folderNone: 'Kein Ordner gewählt',
  recentLabel: 'Zuletzt verwendete Ordner',
  providerLabel: 'Programm',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'Unter Windows laufen Befehle, die Sie erlauben, ohne Abschottung und können auf Ihren ganzen PC und das Internet zugreifen.',
  providerCodexNote:
    'Befehle laufen im abgeschotteten Bereich von Codex: Nur in den Projektordner kann geschrieben werden, und es gibt kein Internet.',
  providerBlocked:
    'Noch nicht verfügbar: Codex kann noch nicht daran gehindert werden, seine eigene Anmeldedatei zu lesen.',
  connChecking: 'Verbindung wird geprüft…',
  connUnavailable: 'Nicht verbunden. Melden Sie sich unter Einstellungen → KI an.',
  connMetered:
    'Angemeldet mit einem nutzungsabhängig abgerechneten Login, den Sie akzeptiert haben.',
  modeLabel: 'Wann nachfragen',
  modeAskCommands: 'Vor jedem Befehl fragen',
  modeAskCommandsDesc:
    'Dateien im Projektordner werden ohne Rückfrage gelesen und geschrieben. Vor dem Ausführen eines Befehls oder Skripts wird gefragt.',
  modeAskWrites: 'Vor Schreiben und Befehlen fragen',
  modeAskWritesDesc:
    'Nur Lesen geschieht ohne Rückfrage. Vor dem Schreiben einer Datei und vor jedem Befehl wird gefragt.',
  modeTrust: 'Diesem Projekt vertrauen',
  modeTrustDesc:
    'Es wird nicht mehr gefragt. Codex bleibt trotzdem in seinem abgeschotteten Bereich; bei Claude Code prüft dessen eigener Prüfer jede Aktion an Ihrer Stelle.',
  warningTitle: 'Bevor Sie beginnen',
  warningCommands:
    'Befehle, die der Agent ausführt, können Dateien ändern und das Internet nutzen. Ein Dokument, das Ihnen jemand geschickt hat, kann versteckte Anweisungen enthalten.',
  warningRedaction:
    'Teile, die Sie vor der AI verborgen haben, bleiben nur in Dokumenten verborgen, die in GenOffice geöffnet sind. Dateien, die der Agent aus dem Ordner liest, werden unverändert gesendet.',
  warningUsage:
    'Ein Agent arbeitet in vielen Schritten und verbraucht mehr von Ihrem Abo als der AI-Bereich.',
  warningAccept: 'Verstanden',
  start: 'Starten',
  starting: 'Wird gestartet…',
  stop: 'Stoppen',
  newSession: 'Neue Sitzung',
  send: 'Senden',
  inputPlaceholder: 'Was soll der Agent tun?',
  you: 'Sie',
  agent: 'Agent',
  startedLine: '{program} in {folder} gestartet',
  skillsLine: '{n} Skills verfügbar',
  skillsLineOne: '{n} Skill verfügbar',
  toolRunning: 'Läuft',
  toolDone: 'Fertig',
  toolFailed: 'Fehlgeschlagen',
  toolDenied: 'Abgelehnt',
  actRead: 'Lesen',
  actWrite: 'Schreiben',
  actCommand: 'Ausführen',
  actAppTool: 'Geöffnetes Dokument bearbeiten',
  actSkill: 'Skill verwenden',
  actOther: 'Werkzeug verwenden',
  openFile: 'Öffnen',
  permTitle: 'Der Agent bittet darum:',
  permCommand: 'Diesen Befehl ausführen',
  permWrite: 'In diese Datei schreiben',
  permRead: 'Eine Datei außerhalb des Projektordners lesen',
  permOther: 'Das Werkzeug „{tool}“ verwenden',
  permReason: 'Grund: {reason}',
  permAllow: 'Erlauben',
  permDeny: 'Ablehnen',
  turnFailed: 'Der Agent konnte diese Anfrage nicht abschließen.',
  ended: 'Die Sitzung ist beendet.',
  errBadFolder:
    'Dieser Ordner kann nicht verwendet werden. Wählen Sie einen Ordner mit Ihrer eigenen Arbeit: kein ganzes Laufwerk, nicht Ihren Benutzerordner und keinen Ordner mit Anmelde- oder App-Daten.',
  errNotConnected:
    'Dieses Programm ist nicht verbunden. Melden Sie sich unter Einstellungen → KI an und versuchen Sie es erneut.',
  errNotAccepted: 'Lesen und bestätigen Sie zuerst die Hinweise oben.',
  errUnsafeTools:
    'Das Programm wurde mit Werkzeugen gestartet, die die App ihm nicht gegeben hat, und wurde deshalb gestoppt.',
  errRateLimit: 'Das Limit Ihres Abos ist aufgebraucht. Versuchen Sie es später erneut.',
  errSignedOut: 'Das Programm ist abgemeldet. Melden Sie sich unter Einstellungen → KI an.',
  errMetered:
    'Das Programm ist mit einem nutzungsabhängig abgerechneten Login angemeldet, den Sie nicht akzeptiert haben.',
  errSandboxUnavailable:
    'Codex kann auf diesem PC die Sandbox, die seine Befehle abschottet, nicht öffnen und wurde daher nicht gestartet. Aktualisieren Sie Windows oder wählen Sie Claude Code.',
  errNeedsUpdate:
    'Das Programm ist zu alt für den Agentenmodus. Aktualisieren Sie es und versuchen Sie es erneut.',
  errNotInstalled: 'Das Programm ist nicht installiert.',
  errGeneric: 'Etwas ist schiefgelaufen. Versuchen Sie es erneut.',
  documentsUnprotected:
    'Nach dem Sitzungsstart geöffnete Dokumente ({n}) stehen nicht unter dem Schreibschutz des Programms. Beenden und starten Sie die Sitzung erneut, um sie zu schützen.',
} satisfies Record<keyof typeof zh, string>
