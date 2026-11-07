# Schnellstart: die Oberfläche und die Grundlagen

GenOffice ist ein Office-Paket, das auf Ihrem Rechner läuft: ein Fenster, eine Reihe von Tabs, darin acht Editoren — Docs (Textverarbeitung), Sheets (Tabellenkalkulation), Slides (Präsentationen), PDF, Markdown und reiner Text, HTML, HWP/HWPX (Hangul-Dokumente) und Mindmaps (.xmind). Jeder Editor öffnet und speichert Dateien in seinem Format: .docx, .xlsx, .pptx, .pdf, .md, .html, .hwp/.hwpx und .xmind. Zum Bearbeiten ist kein Netzwerk nötig, für die KI-Funktionen schon. Der Mindmap-Editor importiert außerdem FreeMind- und Freeplane-Dateien (.mm) als neue Maps, die als .xmind gespeichert werden.

## Überblick über die Oberfläche

Das Fenster besteht aus drei Teilen:

- **Tab-Leiste (oben)**: Jede geöffnete Datei ist ein Tab. Der Start-Tab ganz links ist immer vorhanden und lässt sich nicht schließen; die übrigen Tabs sind Ihre Dokumente. Ein Doppelklick auf einen Tab benennt die Datei direkt dort um.
- **Inhaltsbereich**: der zum aktiven Tab gehörende Editor (oder die Startseite).
- **Menü**: unter macOS in der Systemmenüleiste, unter Windows/Linux oben im Fenster. Die Menüs Datei/Bearbeiten/Ansicht wechseln passend zum aktiven Editor.

## Ein Dokument anlegen

Eines davon genügt:

- Klicken Sie auf eine Schnellerstellungskarte im Bereich [Schnellstart](help://getting-started) der **Startseite** (AI Docs, AI Sheets, AI Slides, …).
- Menü **Datei ▸ Neu**: Docs (⌘N/ctrl+N), Sheets, Slides, Markdown, HTML oder PDF.
- Ziehen Sie eine Datei auf das Fenster oder doppelklicken Sie sie im Dateimanager (wenn GenOffice die Standard-App ist).

Ein neues Dokument öffnet sich ohne Namen; die Datei auf dem Datenträger entsteht erst beim ersten Speichern.

## Dateien öffnen

- Menü **Datei ▸ Öffnen** (⌘O/ctrl+O) öffnet die Systemauswahl: .docx / .doc / .odt / .xlsx / .xls / .csv / .tsv / .pptx / .ppt / .pdf / .md / .html.
- Klicken Sie auf einen Eintrag in der Liste **Zuletzt verwendet** auf der Startseite.
- `ieumoffice <file>` in einem Terminal öffnet Dateien ebenfalls.

## ODT-Dokumente

.odt-Dateien (OpenDocument-Text, das Format, das Hancom Office, LibreOffice und andere speichern) öffnen sich im Docs-Tab, und zwar überall dort, wo sich eine .docx öffnen lässt. Ein neues Dokument ist weiterhin eine .docx.

- **Funktioniert wie gewohnt**: Text bearbeiten, Zeichen- und Absatzformate, Tabellen (Zeilen und Spalten einfügen und löschen, Zellen verbinden und teilen), Bilder, Kopf- und Fußzeilen, Fuß- und Endnoten, Seiteneinrichtung und Abschnitte, Aufzählungen und Nummerierung, Überschriftenformate, Links, Suchen und Ersetzen, Rechtschreibung, Drucken, PDF- und HTML-Export sowie Bearbeiten mit der KI.
- **In ODT ausgeschaltet**: Kommentare, Änderungen nachverfolgen, Vergleichen, Wasserzeichen, Freihand, Inhaltsverzeichnis, Einfügen von Formeln, Formen, Textfeldern oder Diagrammen, Spalten, Zitate und Literaturverzeichnis, Beschriftungen und Querverweise, Seitenfarbe, Kennwort und Bearbeitungsbeschränkung, Schreibschutz empfehlen, Designschriftarten und -farben, gegenüberliegende Seitenränder. Ihre Schaltflächen sind ausgegraut; speichern Sie als .docx, um sie zu nutzen.
- **Bleibt, wie es war**: Formeln, Diagramme und Zeichnungen aus dem Original erscheinen als gesperrte Bilder, die sich löschen, aber nicht bearbeiten lassen, und gesperrte Tabellenzellen bleiben gesperrt. Teile, die Sie nicht anfassen, werden unverändert zurückgeschrieben. Ein kennwortgeschütztes ODT öffnet sich nicht; entfernen Sie zuerst das Kennwort.
- **Speichern unter** bietet .docx und .odt an. Vor einem Formatwechsel wird aufgelistet, was sich ändert oder wegfällt; danach öffnet sich der Tab mit der neuen Datei. Markdown und HTML bieten außerdem **Als ODT exportieren…**.

## Das Speichermodell

- **Manuelles Speichern**: ⌘S/ctrl+S oder Datei ▸ Speichern / Speichern unter. Beim ersten Speichern werden Ort und Name abgefragt.
- **AutoSpeichern** folgt dem Schalter des jeweiligen Editors (und dem appweiten Standard). Eine nur gelesene PDF wird nie stillschweigend neu geschrieben; ein neues Dokument ohne eigene Datei speichert erst nach dem ersten Speichern automatisch.
- Beim Schließen eines Tabs mit ungespeicherten Änderungen wird zuerst gefragt: Speichern / Verwerfen / Abbrechen.
- Jeder Schreibvorgang erfolgt atomar (temporäre Datei plus Umbenennung), sodass ein Stromausfall keine halbe Datei hinterlässt.

## Häufige Tastenkürzel

| Aktion                 | macOS | Windows / Linux |
| ---------------------- | ----- | --------------- |
| Neues Dokument         | ⌘N    | ctrl+N          |
| Öffnen                 | ⌘O    | ctrl+O          |
| Speichern              | ⌘S    | ctrl+S          |
| Tab schließen          | ⌘W    | ctrl+W          |
| Dieses Handbuch öffnen | F1    | F1              |
| Menüband reduzieren    | ⌥⌘R   | Ctrl+F1         |

**Das Reduzieren des Menübands** funktioniert in jedem Editor. Die Registerreihen bleibt stehen, und das Befehlsband darunter wird ausgeblendet; die ausgewählte Registerkarte dient zugleich als Reduzierungsschalter – solange das Menüband reduziert ist, ist keine Registerkarte ausgewählt, und ein Klick auf eine beliebige Karte holt das Band zurück. Ein Doppelklick auf eine Registerkarte tut dasselbe. Wie Sie es zuletzt hatten, wird pro Editor gemerkt. Docs fügt eine mittlere Dichte hinzu: **⌥⌘K** / Ctrl+Alt+K staucht das Band auf reine Icons, ebenfalls gemerkt.

Tastenkürzel innerhalb der einzelnen Editoren (Format übertragen, Suchen und Ersetzen, Tabellenbefehle, …) stehen in den jeweiligen Kapiteln; Docs bringt zusätzlich einen durchsuchbaren Dialog für Tastenkombinationen (**⌘/**) mit (siehe sein Kapitel).

## Die Tastenkürzel mit Option+Befehl

Option+Befehl ist die Ebene, die Word für strukturierte Sprünge reserviert, und GenOffice füllt sie auf dieselbe Weise. Docs nimmt den größten Teil davon, Sheets zwei eigene für die Excel-Parität; eine Kombination funktioniert überall.

**Docs**

| Tastenkombination (macOS) | Wirkung               | Windows / Linux    |
| ------------------------- | --------------------- | ------------------ |
| ⌥⌘1 / ⌥⌘2 / ⌥⌘3           | Überschrift 1 / 2 / 3 | Ctrl+Alt+1 / 2 / 3 |
| ⌥⌘0                       | Standard              | Ctrl+Alt+0         |
| ⌥⌘M                       | Absatz                | Ctrl+Alt+M         |
| ⌥⌘A                       | Neuer Kommentar       | Ctrl+Alt+A         |
| ⌥⌘F                       | Fußnote einfügen      | Ctrl+Alt+F         |
| ⌥⌘E                       | Endnote einfügen      | Ctrl+Alt+D         |
| ⌥⌘G                       | Gehe zu               | Ctrl+G             |

Zwei davon rücken unter Windows weiter, aus demselben Grund, aus dem Word sie trennt. **macOS hat sich ⌥⌘D gesichert** – sie blendet das Dock ein und aus –, deshalb ist die Endnote auf dem Mac ⌥⌘E und überall sonst Ctrl+Alt+D. Und **Gehe zu** lässt die Alt-Taste weg: Ctrl+G, wo die Mac-Tastenkombination sie mitschleppt.

**Sheets**, solange das Raster den Fokus hat

| Tastenkombination (macOS) | Wirkung             | Windows / Linux |
| ------------------------- | ------------------- | --------------- |
| ⌥⌘0                       | Äußere Rahmenlinien | Ctrl+Shift+7    |
| ⌥⌘−                       | Kein Rahmen         | Ctrl+Shift+−    |

Windows ist keine Neuschreibung des Mac-Paars. Excel für Mac gibt Sheets **beide** — ⌘⇧7 und ⌥⌘0 sind zwei Tasten für dieselben äußeren Rahmenlinien —, also behält der Befehl unter Windows den Ctrl+Shift-Platz, den er ohnehin schon hatte, und die Option-Ebene fehlt einfach.

Beachten Sie, dass **⌥⌘0 in Docs „Standard" und in Sheets „Äußere Rahmenlinien" bedeutet**. Beide tauchen nie im selben Editor auf, es kollidiert also nichts im Alltag, aber ⌥⌘0 ist vergeben und nicht als globale Tastenkombination verfügbar.

**Jeder Editor**: **⌥⌘R / Ctrl+F1** klappt das Menüband zu, wie oben beschrieben.

Damit bleibt ⌥⌘D auf macOS frei, falls GenOffice ihn irgendwann für einen neuen Befehl braucht.

## Wie Sie weiterfahren

- Wo Dateien liegen: [Der Startbildschirm](help://home-screen).
- Viele geöffnete Dateien verwalten: [Tabs und Fensterverwaltung](help://tabs-and-windows).
- Die KI die Arbeit machen lassen: [Der KI-Bereich](help://ai-panel).
- Zuerst die KI verbinden: [Abonnement-Verbindung](help://subscription).
- Sprache, Design, Standard-Apps: [Einstellungen, Sprache, Design und MCP-Integrationen](help://settings-integrations).
