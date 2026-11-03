# Diagramme: draw.io-Dateien zeichnen und bearbeiten

Der Diagramm-Editor öffnet draw.io-Dateien in einem Tab. Sie zeichnen darin Flussdiagramme, Architekturdiagramme und andere Diagramme, speichern sie im Format, in dem sie vorlagen, exportieren sie als Bild oder PDF und lassen die KI sie lesen, ändern und zeichnen. Der Editor läuft vollständig auf Ihrem PC.

## Ein Diagramm öffnen

- Der Editor öffnet `.drawio`-, `.dio`-, `.drawio.svg`- und `.drawio.png`-Dateien: über den Öffnen-Dialog, indem Sie eine Datei auf das Fenster ziehen, aus den zuletzt verwendeten Dateien, dem Ordnerbaum oder (bei `.drawio` und `.dio`) der Google-Drive-Liste. Unter Windows wird GenOffice durch die Installation zum Programm für `.drawio`- und `.dio`-Dateien.
- Eine `.drawio.svg`- oder `.drawio.png`-Datei öffnet sich nur, wenn das Diagramm im Bild gespeichert ist. Ein gewöhnliches SVG- oder PNG-Bild wird nicht als Diagramm geöffnet. Beschädigte Dateien öffnen sich ebenfalls nicht, und der Grund wird angezeigt.
- Eine Visio-Datei (`.vsdx`) wird als neues, unbenanntes Diagramm importiert. Beim ersten Speichern wird eine `.drawio`-Datei im Ordner der Visio-Datei vorgeschlagen; die Visio-Datei selbst bleibt unverändert. Konnten einige Bilder darin nicht umgewandelt werden, nennt der Editor deren Anzahl. Unter Windows werden `.vsdx`-Dateien nur unter „Öffnen mit“ angeboten.
- Ein neues, leeres Diagramm beginnt mit der Kachel **Diagramm** auf der Startseite oder mit Neu im Menü Datei.
- Ist das Diagramm bereits geöffnet, kommt sein Tab nach vorn.

## Bearbeiten

- Die Bearbeitungsansicht ist die unveränderte draw.io-Oberfläche: oben die Menüs, links die Formen, rechts der Formatbereich und unten die Seiten-Tabs.
- Speichern (Ctrl+S), Speichern unter (Ctrl+Shift+S) und Drucken (Ctrl+P) übernimmt GenOffice. Das Wechseln zwischen Tabs und die übrigen app-weiten Tastenkürzel funktionieren weiter. Alle anderen Tastenkürzel gehören dem Editor selbst, auch Rückgängig (Ctrl+Z).
- **Hilfe** (F1) in den Menüs des Editors öffnet diese Seite.
- Der Editor verwendet die Sprache von GenOffice. Wenn Sie die Sprache wechseln, startet der Editor neu: Ungespeicherte Änderungen bleiben erhalten, der Rückgängig-Verlauf geht aber verloren.
- Der Editor folgt dem Design von GenOffice. Im dunklen Design erscheint auch die Zeichnung in dunklen Farben, die gespeicherte Datei, PNG, PDF und Ausdrucke sind aber genau dieselben wie im hellen Design.

## Speichern

- Speichern, Speichern unter, **Automatisch speichern** in der Statusleiste und die Nachfrage vor dem Schließen funktionieren wie in den anderen Editoren.
- Ein Diagramm wird im Format gespeichert, in dem es geöffnet wurde. Speichern unter bietet `.drawio`, `.dio`, `.drawio.svg` und `.drawio.png` an. Ein neues Diagramm wird zuerst als `.drawio` gespeichert.
- Hat sich nichts geändert, wird die Datei nicht neu geschrieben. Seiten, die in der Datei komprimiert abgelegt sind, bleiben komprimiert.
- Das Bild einer `.drawio.png`-Datei zeigt die erste Seite; das gesamte Diagramm ist darin gespeichert.
- Solange ein Diagramm ungespeicherte Änderungen hat, liegt eine Wiederherstellungskopie im Datenordner der App, damit die Arbeit einen Absturz übersteht.

## Exportieren und drucken

- Wählen Sie im Menü Datei den Export als PNG, SVG oder PDF (die Exportbefehle in den Menüs des Editors öffnen dasselbe Fenster). Wählen Sie dann **Alle Seiten** (Standard) oder **Nur aktuelle Seite**.
- Bei allen Seiten ergeben PNG und SVG eine Datei pro Seite mit dem Namen `<Name>-p<Seitennummer>`. Ein PDF enthält ein Blatt pro Seite, in der im Diagramm eingestellten Seitengröße.
- Drucken (Ctrl+P) gibt ebenfalls ein Blatt pro Seite aus. Exporte und Ausdrucke verwenden unabhängig vom Design immer helle Farben.

## KI-Panel

- Bitten Sie die KI, ein Flussdiagramm, ein Sequenzdiagramm oder ein Organigramm zu zeichnen, das Diagramm zu erklären, eine Seite aufzuräumen oder nach den ausgewählten Formen den nächsten Schritt anzufügen.
- Die KI liest das Diagramm als Text: die Seiten und für jede Form und jeden Verbinder dessen ID, Text, Form, Position und Verbindungen, dazu die Formen, die Sie ausgewählt haben. Als Bild sieht sie das Diagramm nicht.
- Änderungen der KI erscheinen sofort. Jede Änderung ist ein Rückgängig-Schritt (Ctrl+Z), und die Durchgangsliste im Panel nimmt einen ganzen KI-Durchgang zurück. Wird ein Teil einer Änderung abgelehnt, bleibt das Diagramm, wie es war.
- Für ein neues Flussdiagramm, Sequenzdiagramm oder Ähnliches schreibt die KI Mermaid, und GenOffice macht daraus auf Ihrem PC Formen. Die Anordnung kann etwas von dem abweichen, was die draw.io-Website erzeugt.
- Diagramme lassen sich auch im KI-Panel der anderen Editoren anhängen, mit `@` auswählen und über die Dateisuche auf der Startseite finden. Auch die [Terminalbefehle](help://cli) lesen, bearbeiten und erstellen Diagramme (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Internetnutzung

- Der Diagramm-Tab sendet nichts ins Internet. Der Editor läuft aus Dateien, die mit GenOffice installiert wurden, und sein Cloud-Speicher, das Teilen, die Plugins und seine eigene KI sind abgeschaltet.
- Bilder und Schriften, die ein Diagramm aus dem Internet bezieht, werden nicht geladen; ein Hinweis meldet das beim Öffnen der Datei. Ein Web- oder E-Mail-Link an einer Form öffnet sich erst dann in Ihrem Standardbrowser, wenn Sie darauf klicken.
- Der Notizblock, die von Ihnen hinzugefügten Formbibliotheken und die zuletzt verwendeten Farben bleiben auf diesem PC, im Datenordner der App. Das KI-Panel sendet den Text des Diagramms an die von Ihnen gewählte KI, wie in den anderen Editoren.

## Nicht verfügbar

- PlantUML einfügen oder bearbeiten. PlantUML-Formen in einer Datei werden als ihr gespeichertes Bild angezeigt.
- Automatische Layouts mit ELK und Verbinder, die um Formen herumgeführt werden. Solche Verbinder werden als gewöhnliche Verbinder gezeichnet.
- Ältere Visio-Formate (`.vsd`, `.vss`) und das Zurückspeichern als `.vsdx`.
- Cloud-Speicher, Teilen, Veröffentlichen, Plugins und die eigenen KI-Funktionen des Editors.
- Teile eines Diagramms vor der KI verbergen.
