# Der Zeichnungseditor

Der Zeichnungseditor öffnet Excalidraw-Zeichnungen in einem eigenen Tab und speichert sie in dieselbe Datei zurück.

- **Was er öffnet**: Zeichnungsnotizen aus dem Excalidraw-Plugin von Obsidian (`.excalidraw.md` oder eine `.md`, deren Front Matter `excalidraw-plugin` enthält) und `.excalidraw`-Dateien aus der Excalidraw-Web-App.
- **Neue Zeichnung**: die Karte **Excalidraw-Zeichnung** auf der Startseite oder **Datei ▸ Neu**. Eine neue Zeichnung ist eine Obsidian-Zeichnungsnotiz (`.excalidraw.md`), und Sie geben ihr beim ersten Speichern einen Namen.
- **Zeichnen**: Formen, Pfeile, Linien, Freihandzeichnen und Text, mit der eigenen Werkzeugleiste und den Tastenkürzeln der Zeichenfläche. ctrl+Z macht rückgängig.
- **Speichern**: ctrl+S. Eine Datei wird in dem Format gespeichert, in dem sie geöffnet wurde. AutoSpeichern schreibt alle 30 Sekunden und wenn das Fenster den Fokus verliert, lässt aber eine Zeichnung ohne Dateinamen aus. Eine Zeichnung, die Sie nur angesehen haben, wird Byte für Byte so gespeichert, wie sie war.

## Obsidian-Zeichnungsnotizen

- Beim Speichern werden nur die Textliste der Notiz und die Zeichnungsdaten neu geschrieben. Front Matter, der Text, den Sie in die Notiz geschrieben haben, und ihre Links bleiben, wie sie waren, sodass sich die Notiz in Obsidian genauso öffnet.
- Bilder, auf die die Notiz verweist (`[[bild.png]]` unter Embedded Files), werden angezeigt, wenn sie im Tresor der Notiz liegen: dem nächsten Ordner oberhalb der Notiz, der einen `.obsidian`-Ordner enthält, sonst dem Ordner der Notiz. Bilder über 20 MB, in versteckten Ordnern oder außerhalb des Tresors werden nicht angezeigt.
- Neue Bilder lassen sich einer Notiz noch nicht hinzufügen. Das Bildwerkzeug ist aus und das Ablegen von Dateien auf der Zeichenfläche ist gesperrt, weil ein Bild, das nur in der Notiz steckt, in Obsidian womöglich nicht erscheint.

## Was er noch nicht kann

- Es gibt keinen KI-Bereich. Die KI kann Zeichnungen weder lesen noch ändern.
- Es gibt keinen Export als PNG oder SVG.
- Der Editor bleibt vom Netzwerk fern. Seine Schriften sind eingebaut, und geteilte Bibliotheken, Live-Zusammenarbeit und Web-Einbettungen sind aus. Ein Link in einer Zeichnung öffnet sich nur dann im Browser, wenn er eine Web- oder E-Mail-Adresse ist.

## Zeichnungen aus dem Datei-Explorer öffnen

Das Installationsprogramm nimmt die App für `.excalidraw`-Dateien in **Öffnen mit** auf, ohne sie zum Standardprogramm zu machen. Eine Zeichnungsnotiz ist eine `.md`-Datei; sie öffnet sich also überall dort, wo sich in der App eine Markdown-Datei öffnet, und landet im Zeichnungseditor statt im Markdown-Editor.
