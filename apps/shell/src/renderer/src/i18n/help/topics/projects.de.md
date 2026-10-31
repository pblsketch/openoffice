# Projekte

Ein Projekt ist ein Ordner auf Ihrem PC. Wählen Sie in einem KI-Bereich ein Projekt, dann arbeitet die KI mit dem Wissen um die Dateien, Anweisungen, Erinnerungen und Unterhaltungen dieses Ordners. Legen Sie die Dokumente für eine Aufgabe in einen gemeinsamen Ordner: Eine Unterhaltung, die in Docs begonnen hat, lässt sich dann in Hangul oder Slides fortsetzen, ohne dass Sie den Hintergrund in jedem Dokument neu erklären müssen.

## Ein Projekt wählen

- Im KI-Bereich jedes Editors und unter **KI fragen** auf der Startseite steht links unter dem Eingabefeld der Name des aktuellen Projekts. Ist keins gewählt, steht dort **Kein Projekt**.
- Ein Klick darauf öffnet die Liste: **Angeheftete** und **Zuletzt verwendete** Projekte, **Neues Projekt**, **Ordner hinzufügen** und **Kein Projekt**. Tippen Sie oben in das Feld, um zu suchen; passt kein Projekt, können Sie mit diesem Namen ein neues anlegen.
- Fahren Sie mit der Maus über eine Zeile, erscheinen Anheften, **Ordner öffnen** und **Aus der Liste entfernen**. Wird ein Projekt aus der Liste entfernt, bleiben der Ordner und seine Dateien unverändert.
- Ein Projekt, dessen Ordner verschoben oder gelöscht wurde, erscheint abgeblendet als **Ordner fehlt**. Klicken Sie darauf und wählen Sie den verschobenen Ordner, um mit demselben Projekt weiterzuarbeiten.
- Öffnen Sie ein Dokument aus einem Projektordner, ist dieses Projekt bereits gewählt. Stellen Sie das Dokument auf **Kein Projekt** um, bleibt es auch beim nächsten Öffnen dabei. Ein Projekt, das Sie für ein Dokument außerhalb des Ordners wählen, merkt sich das Dokument ebenfalls.
- Das gewählte Projekt gilt ab der nächsten Anfrage in diesem Bereich. Wechseln Sie es mitten in einer Unterhaltung, beginnt eine neue; die bisherige bleibt, wo sie war.

## Neues Projekt und Ordner hinzufügen

- **Neues Projekt**: Geben Sie einen Namen ein, und in Ihrem Standard-Speicherordner (anfangs `Dokumente\GenOffice`, in den Einstellungen änderbar) wird ein Ordner mit diesem Namen angelegt. Mit **An anderem Ort erstellen…** wählen Sie einen anderen Speicherort. Gibt es schon einen Ordner dieses Namens, werden Sie gefragt, ob er als Projekt dienen soll; **Diesen Ordner verwenden** startet mit ihm. Ist dieser Ordner schon ein Projekt auf Ihrer Liste, öffnet er sich ohne Nachfrage.
- **Ordner hinzufügen** (unter **Projekte** auf der Startseite: **Vorhandenen Ordner verwenden**): Nutzt einen Ordner, den Sie schon haben, samt Unterordnern. Ein ganzes Laufwerk, Ihr gesamter Benutzerordner und Ordner mit Anmeldedaten oder den Daten der App lassen sich nicht wählen.
- Öffnen Sie ein Dokument in einem Projektordner, der nicht auf Ihrer Liste steht, erscheint unter dem Eingabefeld „Dieses Dokument liegt im Projektordner ‚…‘“ mit der Schaltfläche **Verwenden**. Ein Klick darauf wirkt wie Ordner hinzufügen.
- Enthält ein Ordner, den Sie von jemand anderem bekommen haben, bereits Anweisungen oder Erinnerungen, eine `AGENTS.md` oder `CLAUDE.md` oder Unterhaltungen von einem anderen PC, zeigt die App sie Ihnen einmal und fragt nach. Mit **Alles anzeigen** lesen Sie zuerst alles. **Mit Anweisungen verwenden** übernimmt alles. **Ohne Anweisungen verwenden** hält diese Anweisungen und Erinnerungen von der KI fern, blendet Unterhaltungen von anderen PCs aus und legt keine neuen Erinnerungen an; Dateien lesen funktioniert weiterhin. Auf der Seite des Projekts können Sie später mit **Anweisungen auch verwenden** wechseln. Klicken Sie auf **Abbrechen** oder schließen Sie die Frage, ohne zu wählen, wird der Ordner nicht hinzugefügt.
- Danach fragt die App nicht mehr. Ändern sich Anweisungen oder Erinnerungen außerhalb von GenOffice, zeigt der KI-Bereich einmal „Anweisungen geändert“, und **Ansehen** öffnet den betreffenden Teil der Projektseite.

## Anweisungen und Erinnerungen

- **Anweisungen** sind die Regeln für dieses Projekt, etwa „Berichte in Stichpunkten schreiben und den Namen der Organisation nie abkürzen“. Schreiben Sie sie auf der Seite des Projekts auf der Startseite und klicken Sie auf **Speichern**. Liegt oben im Ordner eine `AGENTS.md` oder `CLAUDE.md`, wird sie ebenfalls gelesen; auf der Projektseite können Sie das abschalten.
- **Erinnerungen** sind Notizen, die die KI während der Unterhaltungen anlegt: Fakten, Vorlieben und Entscheidungen, die später helfen, jeweils eine Zeile mit Datum. Jedes Mal, wenn sie eine schreibt, zeigt der KI-Bereich „Gemerkt: …“ mit der Schaltfläche **Löschen**. Wurde diese Notiz schon gelöscht, lautet die Zeile „Erinnerung gelöscht: …“ und hat keine Schaltfläche **Löschen**. Vorher fragt sie Sie nicht.
- Werden die Erinnerungen lang, zeigt der KI-Bereich „Die Erinnerungen werden lang“ mit **Aufräumen**. Ein Klick darauf fasst Notizen zusammen, die sich überschneiden oder veraltet sind. Der vorherige Stand bleibt erhalten, und **Rückgängig** stellt ihn wieder her. Aufgeräumt wird nur, wenn Sie die Schaltfläche drücken, und dabei geht eine Anfrage an die KI.
- Auf der Projektseite können Sie Notizen löschen, die gesamten Erinnerungen bearbeiten und die Erinnerungen abschalten. Abgeschaltet kommt nichts Neues hinzu, die vorhandenen Erinnerungen werden aber weiter gelesen.
- Bei sehr langen Anweisungen fällt das Ende weg, und der KI-Bereich weist Sie darauf hin. Erinnerungen werden immer vollständig gesendet, ganz gleich, wie lang sie sind.

## Welche Dateien die KI sieht

- Mit jeder Anfrage erhält die KI den Namen des Projekts, seine Anweisungen und Erinnerungen sowie eine Liste der Dateinamen im Ordner. Den Inhalt einer Datei liest sie selbst, wenn sie ihn braucht, auf dieselbe Weise wie einen Anhang; vor der KI verborgene Teile bleiben also verborgen.
- Nicht gelesen werden geöffnete Dokumente mit ungespeicherten Änderungen, versteckte Dateien, deren Name mit einem Punkt beginnt, und der Ordner `.ieumoffice`.
- Soll die KI eine Datei nicht sehen, klicken Sie im Bereich Dateien der Projektseite auf **Vor der KI verbergen**. Das lässt sich rückgängig machen. In den Suchergebnissen der Startseite erscheint die Datei weiterhin.
- In Ordnern, die OneDrive, Google Drive oder ähnliche Dienste synchronisieren, erscheinen nicht auf diesen PC heruntergeladene Dateien als „Nicht auf diesem PC“. Will die KI eine davon lesen, werden Sie zuerst gefragt, ob sie heruntergeladen werden soll.
- Tippen Sie `@` ins Eingabefeld, erscheint nach den geöffneten Dokumenten „Dateien in diesem Projekt“. Wählen Sie eine aus, wird sie angehängt. Siehe [Der KI-Bereich](help://ai-panel).
- Neue Dokumente, die die KI in einem Projekt erstellt, werden im Ordner des aktuellen Dokuments gespeichert, bei einer Anfrage von der Startseite oben im Projektordner. Ist der Name schon vergeben, wird `(2)` angehängt, sodass keine Datei ersetzt wird.

## Unterhaltungen

- Ein KI-Bereich mit gewähltem Projekt zeigt oben den Titel der aktuellen Unterhaltung. Ein Klick darauf bringt die Liste der Unterhaltungen dieses Projekts, ein Suchfeld und **Neue Unterhaltung**. Jede Unterhaltung aus der Liste lässt sich in jedem Editor wieder aufnehmen.
- Was in einem anderen Editor geschehen ist, erscheint als eine Zeile, etwa „3 Werkzeuge in Hangul ‚Bericht.hwp‘ ausgeführt“. Die KI nutzt nur die Werkzeuge des Editors, in dem Sie gerade sind.
- Beim Öffnen eines Dokuments erscheint die Unterhaltung, die zuletzt in diesem Dokument genutzt wurde. Haben zwei Fenster dieselbe Unterhaltung offen, erscheint eine Nachricht aus dem einen sofort auch im anderen.
- Unterhaltungen von einem anderen PC sind mit **Anderer PC** gekennzeichnet.
- In der Liste können Sie Unterhaltungen umbenennen oder löschen. Gelöschte Unterhaltungen landen im Papierkorb.
- Unterhaltungen, die ein Dokument schon vor dieser Funktion hatte, finden Sie ganz unten in der Liste unter **Frühere Unterhaltungen in diesem Dokument**.
- Unterhaltungen mit **Kein Projekt** werden wie bisher pro Dokument gespeichert. In KI fragen auf der Startseite endet die Unterhaltung ohne Projekt, wenn Sie die App schließen.

## Die Seite des Projekts auf der Startseite

Unter **Projekte** in der Seitenleiste der Startseite legen Sie ein **Neues Projekt** an, wählen mit **Vorhandenen Ordner verwenden** einen Ordner, den Sie schon haben, und öffnen ein Projekt, um es zu verwalten.

- **Kopfzeile**: der Name (eine Umbenennung ändert den Ordnernamen nicht), der Ordnerpfad, **Im Datei-Explorer öffnen** (auf dem Mac **Im Finder zeigen**) und der Status. Wird das Projekt ohne Anweisungen verwendet, erscheint **Anweisungen auch verwenden**.
- **Anweisungen**: das Feld für die Anweisungen sowie die mitgelesenen `AGENTS.md` und `CLAUDE.md`.
- **Erinnerungen**: die Liste der Notizen, **Alles bearbeiten**, **Aufräumen**, Erinnerungen ein oder aus.
- **Dateien**: die Dateien, die die KI sieht, und die, die vor ihr verborgen sind. Ein Klick auf einen Dateinamen öffnet die Datei.
- **Unterhaltungen**: die Unterhaltungen dieses Projekts. Ein Klick öffnet das Dokument, in dem eine Unterhaltung zuletzt genutzt wurde, und Sie setzen sie in dessen KI-Bereich fort.
- Diese Seite liest den Ordner jedes Mal neu, wenn sie angezeigt wird. Eine Erinnerung, die die KI gerade angelegt hat, erscheint also, ohne dass Sie die Seite verlassen. Wurde die Datei mit den Anweisungen oder Erinnerungen außerhalb von GenOffice geändert, während Sie sie bearbeitet haben, fragt **Speichern** zuerst nach: **Neu laden** liest die geänderte Datei, **Trotzdem speichern** überschreibt sie mit Ihren Änderungen.

## Was im Ordner bleibt, und was Sie wissen sollten

- Anweisungen, Erinnerungen und Unterhaltungen liegen als Textdateien in einem Ordner `.ieumoffice` innerhalb des Projektordners. Verschieben Sie den Ordner oder kopieren Sie ihn auf einen anderen PC, wandern sie mit. Auf dem anderen PC wählen Sie ihn einmal mit **Ordner hinzufügen** in einem KI-Bereich oder mit **Vorhandenen Ordner verwenden** unter **Projekte** auf der Startseite.
- Der Ordner `.ieumoffice` entsteht erst, wenn es etwas zu schreiben gibt. Seine Dateien können Sie im Editor von Windows öffnen und bearbeiten.
- Was Sie in einer Unterhaltung eingeben, kann in den Erinnerungen landen. Um etwas herauszuhalten, löschen Sie es mit **Löschen** in der Zeile „Gemerkt“, oder schalten Sie die Erinnerungen ab.
- Wählen Sie einen synchronisierten Ordner als Projekt, werden dessen Anweisungen, Erinnerungen und Unterhaltungen ebenfalls zu diesem Dienst hochgeladen. Die App weist Sie einmal darauf hin, wenn Sie ihn zum ersten Mal wählen.
- In einem freigegebenen Ordner, den mehrere Personen nutzen, können sich Erinnerungen und Unterhaltungen vermischen.
- In einem Ordner, in den die App nicht schreiben kann, etwa einem schreibgeschützten, funktionieren Anweisungen und das Lesen von Dateien weiterhin, Unterhaltungen und Erinnerungen werden aber nicht gespeichert. Der KI-Bereich weist Sie darauf hin.
- Das Agentenfenster nutzt noch keine Projekte. Ein Agent kann auch die Dateien im `.ieumoffice` eines Ordners ändern; verwenden Sie daher in einem Ordner mit Material, das Sie nicht kennen, eine der Arbeitsweisen, die vorher fragen. Siehe [Agentenmodus](help://agent-mode).
