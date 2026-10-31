# Der KI-Bereich

Jeder Editor kann den KI-Bereich aufrufen: Etwas auswählen, eine Anweisung geben und das gestreamte Ergebnis ansehen.

## Öffnen und verwenden

- Der Bereich braucht eine verbundene KI. Ist keine verbunden, zeigt er statt einer Fehlermeldung die Karten zum Verbinden; siehe [Abonnement-Verbindung](help://subscription).
- Einstiegspunkte: die **KI-Schaltfläche** im Menüband jedes Editors, **KI fragen** in den Kontextmenüs oder KI fragen in der Markierungsleiste.
- Beschreiben Sie die Aufgabe in normaler Sprache (dies umformulieren / diese Spalte in Prozent umrechnen / diese Seite neu setzen …) und drücken Sie die Eingabetaste.
- Antworten werden **gestreamt**; wenn die KI Werkzeuge braucht (Dokument lesen, bearbeiten), führt sie sie aus und macht weiter, bis die Aufgabe erledigt ist.
- **Stopp**: unterbrechen Sie den laufenden Durchgang jederzeit.
- **Warteschlange**: Während eine Antwort läuft, stellt Enter Ihre Nachricht nicht ab, sondern in die Warteschlange — ein Streifen über dem Eingabefeld zählt sie; aufklappen zum Bearbeiten, Entfernen, Umsortieren, Pausieren oder Leeren. Die nächste Nachricht sendet sich selbst, wenn der Zug endet; Esc bricht weiterhin ab.

## Welche KI antwortet

- Die Modellliste unten im Bereich zeigt die verwendete KI und lässt Sie eine andere wählen: zuerst Ihre Abonnements, dann die Anbieter mit Schlüssel, die Sie eingerichtet haben.
- Sobald Sie 80 % oder mehr eines Abonnement-Limits verbraucht haben, erscheint im Bereich eine Zeile wie „85 % verbraucht · Zurücksetzung um 15:00“.
- Wird eine Anfrage gestoppt — das Limit ist aufgebraucht oder die Anmeldung abgelaufen —, nennt der Bereich den Grund und wechselt nicht von sich aus zu einer anderen KI. Ist Ihr anderes Abonnement verbunden, bietet eine Schaltfläche **Mit … fortfahren** es an.

## Was er kann

- **Docs**: umformulieren, ausbauen, übersetzen, zusammenfassen, Tabellen und Bilder einfügen, Formatierung anpassen; jeder Durchgang legt zuerst einen Snapshot an.
- **Sheets**: Formeln, Datenfüllung, Stapeltransformationen, Formatierung.
- **Slides**: Erzeugen eines kompletten Decks, Layout anpassen, Texte umformulieren.
- **PDF**: Fragen und Zusammenfassungen zum ausgewählten Text oder zu ausgewählten Seiten.
- **Markdown / HTML**: umformulieren, ausbauen, übersetzen.
- **Start ▸ Ask AI** antwortet aus Ihren markierten Dateien und nennt die Quellen — das Wissensbasis-Panel hat im Start-Kapitel einen eigenen Abschnitt, und das Docs-KI-Panel beherrscht dieselbe Fähigkeit.

## Geöffnete Dokumente anhängen

Im KI-Bereich der Editoren Docs, Sheets, Slides, Hangul, HTML und Mindmaps können Sie andere in GenOffice geöffnete oder kürzlich geöffnete Dokumente als Material anhängen. Ein angehängtes Dokument wird genau wie eine Datei behandelt, die Sie auf Ihrem PC ausgewählt haben.

- **`@` im Eingabefeld**: Tippen Sie `@` am Anfang des Eingabefelds oder nach einem Leerzeichen, um eine Dokumentenliste zu öffnen. Ist das Fenster geteilt, steht das Dokument im anderen Bereich zuerst, danach die übrigen geöffneten und die zuletzt verwendeten Dokumente; das Dokument, in dem Sie gerade arbeiten, fehlt. Grenzen Sie die Liste mit ein paar Buchstaben des Namens ein (Leerzeichen sind erlaubt) und wählen Sie mit Enter oder per Klick: `@Dokumentname` landet im Eingabefeld, und das Dokument wird angehängt. **Weitere suchen…** ganz unten öffnet die unten beschriebene Dokumentauswahl.
- **Aus GenOffice-Dokumenten anhängen**: Diese Schaltfläche neben der Anhang-Schaltfläche öffnet dieselbe Liste in einem Fenster, in dem Sie mehrere Dokumente anhaken und auf einmal anhängen können.
- Dokumente mit ungespeicherten Änderungen und neue, noch nie gespeicherte Dokumente erscheinen abgeblendet und lassen sich nicht auswählen. Speichern Sie sie und wählen Sie erneut – die KI liest die gespeicherte Datei.
- Haben zwei Dokumente denselben Namen, liegen aber in verschiedenen Ordnern, wird der Name des direkt übergeordneten Ordners angefügt, etwa `@Plan.docx(2. Halbjahr)`, und auch die KI erhält diesen Ordnernamen.
- Die Editoren für PDF und Markdown haben noch keine Anhänge, daher gibt es dort keinen der beiden Wege.

## Projekte

- Klicken Sie links unter dem Eingabefeld auf den Projektnamen, um ein Projekt (einen Ordner auf Ihrem PC) zu wählen. Die KI antwortet dann mit dem Wissen um die Dateien, Anweisungen und Erinnerungen dieses Ordners, und die Unterhaltung wird im Ordner gespeichert, sodass Sie sie in einem anderen Editor fortsetzen können. Siehe [Projekte](help://projects).
- Ist ein Projekt gewählt, steht oben im Bereich der Titel der aktuellen Unterhaltung. Ein Klick darauf zeigt die Liste der Unterhaltungen dieses Projekts und **Neue Unterhaltung**.
- Die `@`-Liste im Eingabefeld zeigt nach den geöffneten Dokumenten „Dateien in diesem Projekt“.
- Eine Anfrage mit gewähltem Projekt sendet zusätzlich die Anweisungen (samt `AGENTS.md` und `CLAUDE.md` oben im Ordner, die Sie auf der Projektseite abschalten können), Erinnerungen und die Liste der Dateinamen dieses Projekts, einen kurzen Auszug aus jeder Datei, die die KI bei einer Suche im Ordner findet, sowie den Text jeder Datei, die die KI liest, an die KI, die Sie verwenden.

## Zurückrollen und Sicherheit

- Der Docs-Bereich führt eine **Versionsliste**: einen Snapshot pro Durchgang, Sie können zu jedem davon zurückrollen, und auch das Zurückrollen selbst lässt sich mit Strg+Z rückgängig machen. Snapshots überstehen das erneute Öffnen des Dokuments.
- KI-Änderungen laufen durch dieselbe Bearbeitungspipeline wie manuelle Änderungen (rückgängig machbar, speichern erforderlich) — nichts umgeht Ihre Speicherbestätigung.

## Eine Auswahl vor der KI verbergen

- In Slides, HTML und Markdown lässt sich eine Auswahl vor den Augen des Modells verbergen: Rechtsklick ▸ **Auswahl vor der KI verbergen**, dem Platzhalter einen Namen geben, und das Modell liest stattdessen `{{Name}}`. (Markdown aktiviert den Eintrag über den Augenaus-Schalter im Menüband; der HTML-Eintrag liegt im Quelltext-Panel.)
- Die Datei behält den echten Text — Speichern, Export und Druck bleiben unberührt, und die Markierung übersteht das erneute Öffnen. Dieselbe Menüposition hebt die Markierung auf (Markdown hat zusätzlich **Auswahl der KI wieder zeigen**).
- HTML verbirgt Elementinhalte, Attributwerte und String-Literale in Skripten; die gerenderte Seite ändert sich nie.
- Slides verbirgt auch ganze Bilder, Videos und Audiodateien; eine Folie mit verborgenem Inhalt wird nie als Screenshot gesendet: Die automatische Layoutprüfung überspringt die Seite und sagt das auch.
- Das gilt nur für die KI in der App — CLI, MCP-Tools und Headless-Export lesen die Datei direkt und sehen den Text weiterhin.

## Datenschutz

- Anweisungen und der betreffende Dokumentinhalt gehen an die **KI, die Sie verwenden**: bei einem Abonnement über Ihr eigenes Konto an Anthropic oder OpenAI, sonst an den Anbieter, dessen Schlüssel Sie eingetragen haben. Ist keine KI verbunden, wird nichts gesendet.
- Ob Inhalte eines Abonnements zum Training von KI verwendet werden, bestimmen die Einstellungen Ihres eigenen Kontos bei dem jeweiligen Unternehmen.
- Lokale Dateien werden nirgendwohin sonst hochgeladen; API-Schlüssel werden in der Einstellungsdatei der App auf diesem Rechner gespeichert und nur in den Anfrage-Headern gesendet.
