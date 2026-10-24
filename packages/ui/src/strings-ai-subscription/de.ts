import type { zh } from './zh'

export const de = {
  aiAssistant: 'KI-Assistent',
  cardChecking: 'Wird geprüft…',
  cardNotInstalled: 'Nicht installiert',
  cardSignedOut: 'Nicht angemeldet',
  cardSigningIn: 'Anmeldung läuft…',
  cardReady: 'Verbunden',
  cardReadyPlan: 'Verbunden · {plan}',
  cardMetered: 'Angemeldet, aber nicht mit einem Abonnement',
  cardMeteredAccepted: 'In Verwendung · Abrechnung nach Verbrauch',
  cardError: 'Die Verbindung konnte nicht geprüft werden',
  cardErrNeedsUpdate:
    'Das Programm {provider} auf diesem PC ist zu alt. Aktualisieren Sie es und prüfen Sie dann erneut.',
  cardErrNeedsUpdateVersion:
    'Das Programm {provider} auf diesem PC ({version}) ist zu alt; benötigt wird {minimum} oder neuer. Führen Sie im Terminal {command} aus und prüfen Sie dann erneut.',
  cardErrNeedsUpdatePath: 'Von dieser App ausgeführte Datei:',
  cardErrNeedsUpdateWindows:
    'Wenn Sie {provider} in WSL (Ubuntu) oder in einem anderen Ordner aktualisieren, ändert sich diese Datei nicht. Führen Sie {command} in Windows PowerShell aus.',
  cardErrTimeout:
    'Das Programm {provider} hat nicht rechtzeitig geantwortet. Prüfen Sie es gleich noch einmal.',
  cardErrFailed:
    'Bei der Prüfung von {provider} ist ein Problem aufgetreten. Prüfen Sie es erneut.',
  actionInstall: 'Installieren',
  actionLogin: 'Anmelden',
  actionLoginWindow: 'Browser nicht geöffnet?',
  actionRecheck: 'Erneut prüfen',
  actionAcceptMetered: 'Trotzdem verwenden',
  actionInstallHelp: 'Offizielle Installationsanleitung',
  actionOpenSettings: 'Einstellungen öffnen',
  actionDismiss: 'Schließen',
  actionSwitchAccount: 'Mit anderem Konto anmelden',
  actionLogout: 'Abmelden',
  installNote:
    'Der offizielle Installationsbefehl von {vendor} wird in einem neuen Terminalfenster ausgeführt.',
  loginNote: 'Die Anmeldeseite, die sich öffnet, stammt von {vendor}.',
  signingInBrowserNote:
    'Melden Sie sich im geöffneten Browser bei Ihrem {vendor}-Konto an und erlauben Sie den Zugriff. Danach wird die Verbindung von selbst hergestellt.',
  signingInWindowNote:
    'Folgen Sie der Anleitung oben im soeben geöffneten Anmeldefenster. Melden Sie sich auf der Anmeldeseite von {vendor} an, die sich im Browser geöffnet hat: Danach schließt sich das Fenster von selbst, und die Verbindung ist hergestellt. Eine zuvor geöffnete Anmeldeseite funktioniert nicht mehr; schließen Sie sie.',
  meteredWarning: 'Das ist kein Abonnement: Abgerechnet wird nach Verbrauch.',
  meteredMeaning:
    'Diese Anmeldung nutzt einen API-Schlüssel oder ein Konto mit nutzungsbasierter Abrechnung, oder ihre Art ließ sich nicht feststellen. Mit „Trotzdem verwenden“ läuft die KI über diese Verbindung, und jede Anfrage wird diesem Konto berechnet.',
  connectTitle: 'KI verbinden, um loszulegen',
  connectBody:
    'Die KI läuft über Ihr vorhandenes Claude- oder Codex-Abonnement. Ein API-Schlüssel ist nicht nötig.',
  connectProviderTitle: 'Die Verbindung {provider} ist derzeit nicht nutzbar',
  connectKeyBody:
    'Die Einrichtung von {provider} ist noch nicht abgeschlossen. Schließen Sie sie in den Einstellungen ab oder wählen Sie eine andere KI.',
  errNotConnected:
    'Es ist keine KI verbunden. Verbinden Sie zuerst ein Claude- oder Codex-Abonnement oder eine kostenlose KI.',
  errNotInstalled: 'Das Programm {provider} wurde auf diesem PC nicht gefunden.',
  errSignedOut:
    'Die Anmeldung bei {provider} ist abgelaufen. Melden Sie sich erneut an, um fortzufahren.',
  errRateLimit: 'Das Limit des Abonnements {provider} ist aufgebraucht.',
  errRateLimitReset:
    'Das Limit des Abonnements {provider} ist aufgebraucht. Es wird um {time} zurückgesetzt.',
  errUnsafeTools:
    'Das Programm {provider} wurde mit eigenen aktivierten Tools gestartet; der Lauf wurde aus Sicherheitsgründen gestoppt.',
  errMeteredNotAccepted:
    'Die Verbindung {provider} wird nach Verbrauch abgerechnet und ist noch nicht freigegeben. Wählen Sie in den Verbindungseinstellungen „Trotzdem verwenden“, um sie zu nutzen.',
  errNeedsUpdate:
    'Das Programm {provider} ist für diese Funktion zu alt. Aktualisieren Sie es und versuchen Sie es erneut.',
  errHeadlessLimit: 'Das Stundenlimit für automatische Anfragen ist erreicht.',
  errHeadlessLimitReset:
    'Das Stundenlimit für automatische Anfragen ist erreicht. Anfragen sind ab {time} wieder möglich.',
  connectFreeHint:
    'Kein Abonnement? In den Einstellungen verbinden Sie in etwa einer Minute eine kostenlose KI.',
  actionConnectFree: 'Kostenlose KI verbinden',
  errFreeLimit:
    'Das kostenlose Kontingent für heute ist aufgebraucht. Versuchen Sie es morgen erneut oder wählen Sie in den Einstellungen eine andere KI.',
  errFreeLimitReset:
    'Das kostenlose Kontingent für heute ist aufgebraucht. Ab {time} können Sie es wieder nutzen.',
  continueWith: 'Mit {provider} fortfahren',
  continueMeteredNote:
    'Die Verbindung {provider} ist kein Abonnement: Beim Fortfahren wird nach Verbrauch abgerechnet.',
  usageLine: '{percent} % verbraucht · Zurücksetzung um {time}',
  usageWindowFiveHour: '5-Stunden-Limit',
  usageWindowSevenDay: '7-Tage-Limit',
  noticeTitle: 'Bevor Sie die KI mit Ihrem Abonnement nutzen',
  noticeSend:
    'Dokumentinhalte und Ihre Unterhaltung werden über Ihr eigenes Konto an Anthropic oder OpenAI gesendet. Jede Anfrage enthält außerdem Name, Titel und Beschreibung jedes Skills mit der Einstellung „KI entscheidet“; verwendete Skills und Skill-Dateien, die die KI liest, werden mitgesendet.',
  noticeTraining:
    'Ob diese Inhalte zum Training von KI verwendet werden, bestimmen die Einstellungen Ihres eigenen Kontos bei dem jeweiligen Unternehmen.',
  noticeCodexHistory:
    'Diese App schaltet das Speichern des Unterhaltungsverlaufs in Codex ab, Codex kann jedoch weiterhin eigene Diagnoseprotokolle auf diesem PC speichern.',
  noticePdfWholeDocument:
    'Im PDF-Editor können beim KI-Lesen von Seiten und beim Übersetzen von Dokumenten Bilder der Seiten und der gesamte Text des Dokuments gesendet werden.',
  noticeAck: 'Verstanden',
  codexNotice:
    'Ein Codex-Abonnement in einer App zu nutzen, ist keine von OpenAI offiziell empfohlene Methode.',
  truncatedNotice: 'Die Eingabe war zu lang; ein Teil wurde vor dem Senden abgeschnitten.',
  pickerAuto: 'Automatisch',
  pickerAutoUsing: 'Automatisch · {provider}',
  pickerAutoUsingModel: 'Automatisch · {provider} · {model}',
  pickerDefaultModel: 'Standardmodell',
  pickerDefaultModelNamed: 'Standardmodell · {model}',
  pickerSubscription: 'Abonnement',
  pickerPaid: 'Kostenpflichtig',
  pickerPaidTitle: 'Abrechnung nach Verbrauch, nicht durch ein Abonnement gedeckt',
  pickerNotConnected: 'KI verbinden',
  guideQuestion: 'Welche KI nutzen Sie bereits?',
  guidePathClaudeTitle: 'Ich habe ein kostenpflichtiges Claude-Abonnement',
  guidePathClaudeBody:
    'Ein Pro- oder Max-Tarif ist nötig. Mit einem kostenlosen Claude-Konto ist keine Verbindung möglich.',
  guidePathCodexTitle: 'Ich nutze ChatGPT',
  guidePathCodexBody:
    'Melden Sie sich mit Ihrem ChatGPT-Konto beim Codex-Programm von OpenAI an. Der kostenlose Tarif erlaubt nur wenig Nutzung.',
  guidePathFreeTitle: 'Noch keins von beiden',
  guidePathFreeBody:
    'Verbinden Sie in etwa einer Minute eine kostenlose KI. Solange Sie sie kostenlos nutzen, kann das Gesendete zur Verbesserung der KI dieses Unternehmens verwendet werden.',
  guideBack: 'Anderen Weg wählen',
  guideBadgeReady: 'Verbunden',
  guideBadgeInstalled: 'Installiert',
  guideBadgeCheck: 'Prüfung nötig',
  guideStepsLabel: 'Verbindungsschritte',
  stepInstall: 'Programm installieren',
  stepLogin: 'Anmelden',
  stepReady: 'Verbunden',
  installReturnNote:
    'Wenn die Installation in diesem Fenster abgeschlossen ist, kehren Sie hierher zurück. Die App prüft dann von selbst erneut.',
  loginHowNote:
    'Beim Klicken öffnet sich ein Browser. Melden Sie sich mit Ihrem {vendor}-Konto an und klicken Sie auf Zulassen; die Verbindung wird dann von selbst hergestellt.',
  signingInStalledNote:
    'Hat sich im Browser keine Anmeldeseite geöffnet, öffnen Sie mit der Schaltfläche unten das Anmeldefenster. Sind Sie im Browser noch bei der Anmeldung, schließen Sie sie besser dort ab: Die Schaltfläche bricht diese Anmeldung ab und beginnt von vorn.',
  actionLoginWindowOpen: 'Anmeldefenster öffnen',
  loginWindowTitle: 'Anmeldung bei {provider}',
  loginWindowIntro:
    'Dies ist das Anmeldefenster des Programms {provider}. Der englische Text darunter stammt vom Programm {provider}.',
  loginWindowStepBrowser:
    'Wenn sich die Anmeldeseite von {vendor} im Browser öffnet, melden Sie sich an und erlauben Sie den Zugriff. Dieses Fenster schließt sich dann von selbst.',
  loginWindowStepAddress:
    'Hat sich kein Browser geöffnet, markieren Sie die Adresse unten, die mit https:// beginnt, indem Sie mit der Maus darüberziehen, und kopieren Sie sie mit einem Rechtsklick. Fügen Sie sie in die Adressleiste Ihres Browsers ein, um die Anmeldeseite zu öffnen.',
  loginWindowStepCode:
    'Zeigt der Browser nach der Anmeldung einen Code, kopieren Sie den ganzen Code (mit seiner Kopieren-Schaltfläche, falls vorhanden). Klicken Sie einmal mit der rechten Maustaste in dieses Fenster, um ihn einzufügen, und drücken Sie dann die Eingabetaste. Dass der eingefügte Code nicht angezeigt wird, ist normal.',
  loginWindowStepInvalid:
    'Erscheint "Invalid code", wurde der Code nicht vollständig kopiert. Lassen Sie dieses Fenster offen, kopieren Sie den Code erneut und fügen Sie ihn ein.',
  loginWindowClosing:
    'Die Anmeldung wurde nicht abgeschlossen. Wenn Sie die Meldungen oben gelesen haben, drücken Sie die Eingabetaste, um dieses Fenster zu schließen. Um es erneut zu versuchen, klicken Sie noch einmal auf die Schaltfläche zum Anmelden.',
  actionCancelLogin: 'Anmeldung abbrechen',
  actionUpdate: 'Aktualisieren',
  updateNote:
    'Beim Klicken wird das offizielle Update von {vendor} in einem neuen Fenster ausgeführt. Wenn es dort fertig ist, kehren Sie hierher zurück.',
  guideInfoHint:
    'Klappt es immer noch nicht? Kopieren Sie die Verbindungsdaten und senden Sie sie an die Person, die Ihnen hilft. Sie enthalten weder Konto noch Dateipfade.',
  actionCopyInfo: 'Infos für Hilfe kopieren',
  copyInfoDone: 'Kopiert',
  actionConnectHelp: 'Jeden Schritt am Bildschirm ansehen (Seite auf Koreanisch)',
} satisfies Record<keyof typeof zh, string>
