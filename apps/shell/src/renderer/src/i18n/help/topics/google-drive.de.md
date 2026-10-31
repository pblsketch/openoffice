# Google Drive

Verbinden Sie Google Drive, um die Drive-Dateien, die Sie auswählen, in GenOffice zu öffnen und zu bearbeiten. Beim Speichern geht die Datei zurück in Drive. GenOffice kann nur die Dateien öffnen, die Sie im Google-Fenster auswählen; den Rest Ihres Drive sieht es nicht.

## Verbinden

1. Öffnen Sie **Einstellungen ▸ Integrationen**.
2. Lesen Sie **Bevor Sie Drive-Dateien mit KI verwenden**, schalten Sie das Modelltraining in den KI-Konten aus, die Sie mit Drive-Dateien nutzen, und haken Sie dann diesen Punkt an.
   - Claude: Schalten Sie in Claude unter **Einstellungen ▸ Datenschutz** das Modelltraining aus.
   - ChatGPT und Codex: Schalten Sie in ChatGPT unter **Einstellungen ▸ Datenkontrollen** die Option **Das Modell für alle verbessern** aus.
   - Anbieter mit API-Schlüssel verwenden API-Daten standardmäßig nicht zum Training.
   - Kostenlose KI-Verbindungen (kostenlose Modelle von OpenRouter, Gemini) erhalten nie Drive-Dateien.
3. Klicken Sie auf **Google Drive verbinden**. Im Browser öffnet sich die Anmeldeseite von Google. Melden Sie sich an und erlauben Sie den Zugriff.
4. Kehren Sie zu GenOffice zurück. Die Karte zeigt das verbundene Konto.

Google erlaubt nicht, dass Drive-Dateien an einen KI-Dienst gehen, der damit seine Modelle trainiert. Deshalb können Sie erst verbinden oder Dateien auswählen, wenn der Punkt angehakt ist.

Die Anmeldung wird auf diesem PC mit der Verschlüsselung gespeichert, die Ihr Betriebssystem für Ihr Benutzerkonto bereitstellt (der Schutz von Windows, der macOS-Schlüsselbund oder ein Desktop-Schlüsselbund unter Linux). Kann dieser PC sie nicht verschlüsseln, hält die Verbindung nur, bis Sie die App schließen.

## Drive-Dateien öffnen

- Klicken Sie in der Seitenleiste der Startseite auf **Google Drive** und dann auf **Aus Google Drive auswählen**.
- Im Browser öffnet sich die Dateiauswahl von Google. Wählen Sie die Dateien aus, die Sie öffnen möchten (auch mehrere auf einmal); GenOffice kommt zurück und öffnet sie im passenden Editor.
- Einmal ausgewählte Dateien bleiben in der Liste **Ausgewählte Dateien**. Dort können Sie sie wieder öffnen oder nach Name und Inhalt durchsuchen.
- Formate, die GenOffice nicht öffnen kann, sind ausgegraut. Google Docs, Tabellen und Präsentationen öffnen sich als Word-, Excel- und PowerPoint-Dateien.

## Zurück in Drive speichern

- Speichern Sie wie gewohnt. Kurz darauf wird die Datei in Drive hochgeladen.
- Hat jemand die Datei in Drive geändert, nachdem Sie sie geöffnet haben, werden Sie gefragt, ob die Datei in Drive überschrieben, eine Kopie in Drive gespeichert oder die Änderung nur auf diesem PC behalten werden soll.
- Eine Datei, die Sie nur ansehen dürfen, wird als Kopie in Drive gespeichert oder auf diesem PC behalten.
- Ein Google-Dokument bleibt unverändert. Ihre Änderungen werden als Office-Datei im selben Ordner gespeichert, oder in „Meine Ablage“, wenn in diesen Ordner nicht geschrieben werden kann.
- Schlägt ein Hochladen fehl, bleiben Ihre Änderungen auf diesem PC, und GenOffice versucht es erneut, auch beim nächsten Start der App.

## KI und Drive

- Klicken Sie im KI-Bereich der Editoren für Word, Excel, PowerPoint, HTML, Mindmaps und Hangul neben der Anhang-Schaltfläche auf **Aus Google Drive anhängen**, um Dateien im Google-Fenster Ihres Browsers auszuwählen und wie Dateien von diesem PC anzuhängen. Bis zu 20 auf einmal.
- Solange **KI darf Dateien in Drive suchen und lesen** aktiviert ist (es wird beim Verbinden aktiviert), kann die KI in jedem Editor die Drive-Dateien durchsuchen und lesen, die Sie in GenOffice ausgewählt haben. Zum Beispiel: „Such in meinem Drive das Besprechungsprotokoll vom letzten Monat und fass es zusammen.“ Wird die Datei nicht gefunden, wählen Sie sie zuerst auf der Startseite aus.
- Was die KI liest, geht an den KI-Anbieter, den Sie nutzen. Vor der KI verborgene Teile bleiben verborgen.
- Ist die genutzte KI eine kostenlose Verbindung, funktionieren weder das Anhängen aus Drive noch das Lesen von Drive durch die KI.
- Die KI kann Drive-Dateien nicht ändern, löschen oder freigeben.
- Sobald ein Chat aus Drive gelesene Inhalte enthält, nutzt er keine Websuche, Bildsuche, kein Lesen von Seiten per Webadresse und kein Einfügen von Bildern per Webadresse mehr. Starten Sie einen neuen Chat, um sie wieder zu nutzen.

## Trennen

Klicken Sie in **Einstellungen ▸ Integrationen** auf **Trennen**. GenOffice entfernt die Anmeldung von diesem PC und bittet Google, den Zugriff zu widerrufen. Kopien von Dateien auf diesem PC bleiben erhalten. Sie können den Zugriff auch jederzeit in Ihrem Google-Konto unter **Verbindungen mit Drittanbietern** entfernen.
