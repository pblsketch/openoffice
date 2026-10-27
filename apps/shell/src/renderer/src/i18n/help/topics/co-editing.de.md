# Gemeinsam bearbeiten im Netzwerk

Personen im selben Netzwerk (LAN) können ein Dokument gemeinsam öffnen, gleichzeitig bearbeiten und die Cursor und Namen der anderen sehen. Es gibt keinen Server und kein Konto: Der PC, der das Dokument freigibt, führt die Sitzung, und nur dieser PC speichert die Datei.

## Ein Dokument freigeben

1. Öffnen Sie das Dokument und klicken Sie in der Werkzeugleiste des Editors auf **Zusammenarbeiten**.
2. Geben Sie unter **Mein Name** Ihren Namen ein und wählen Sie **Meine Farbe**. Andere sehen beides neben Ihrem Cursor.
3. Klicken Sie auf **Freigabe starten**. Eine 6-stellige **PIN** und die **Adresse dieses PCs** werden angezeigt.
4. Teilen Sie den Personen, die beitreten, die PIN mit und auch die Adresse, falls sie das Dokument nicht finden.

Speichern Sie das Dokument zuerst, wenn es nicht gespeicherte Änderungen enthält. Kennwortgeschützte Dokumente können nicht freigegeben werden. **Neue PIN** gibt dem Dokument eine neue PIN; wer bereits beigetreten ist, bleibt dabei.

Zum Beenden öffnen Sie erneut **Zusammenarbeiten** und klicken auf **Freigabe beenden**. Alle, die beigetreten waren, behalten eine nicht gespeicherte Kopie auf ihrem PC.

## Beitreten

1. Klicken Sie in einem beliebigen Editor auf **Zusammenarbeiten** und wechseln Sie zu **Beitreten**.
2. Wählen Sie das Dokument unter **Gefunden** aus, oder geben Sie unter **Adresse** die Adresse des freigebenden PCs ein.
3. Geben Sie die PIN ein und klicken Sie auf **Beitreten**. Das freigegebene Dokument öffnet sich in einem neuen Tab.

Solange Sie dabei sind, speichert die freigebende Person die Datei. Ihr Speichern bewirkt nichts und weist Sie darauf hin, und beim Schließen fragt der Tab nie nach dem Speichern. Mit **Verlassen** verlassen Sie die Sitzung. Wenn die Sitzung endet, bleibt der Tab als nicht gespeicherte Kopie geöffnet, die Sie an beliebiger Stelle speichern können.

## Zusammen am Dokument arbeiten

- Cursor oder Auswahl jeder Person erscheinen in ihrer Farbe und mit ihrem Namen.
- Rückgängig macht nur Ihre eigenen Änderungen rückgängig.
- Einige Funktionen sind während einer Sitzung deaktiviert, zum Beispiel solche, die andere Teile des Dokuments als seinen Inhalt ändern. Der Editor sagt Ihnen, wenn er eine davon ablehnt.
- Im Hangul-Editor bearbeitet nur die freigebende Person. Wer beitritt, sieht die Änderungen live.
- Nur-Text- und JSON-Dateien öffnen sich in der Quelltextansicht des Markdown-Editors und können noch nicht freigegeben werden.

## Sicherheit

- Die PIN wird nie über das Netzwerk gesendet. Sie wird per Schlüsselaustausch geprüft, und alles danach ist verschlüsselt. Andere im Netzwerk können weder das Dokument noch die Änderungen noch die PIN lesen.
- Nach 5 falschen PINs von einem PC muss dieser PC 10 Minuten warten. Nach insgesamt 20 falschen PINs erhält jedes freigegebene Dokument eine neue PIN, und die freigebende Person wird benachrichtigt.
- Bis zu 16 Personen können einem Dokument beitreten.
- Während Sie freigeben, werden Ihr Name und der Dokumenttitel im Netzwerk bekannt gegeben, damit andere das Dokument finden können.
- Beim ersten Freigeben fragt die Windows-Firewall möglicherweise nach einer Berechtigung. Lassen Sie den Zugriff in privaten Netzwerken zu. Wenn Sie ihn blockieren, können andere PCs keine Verbindung herstellen.
