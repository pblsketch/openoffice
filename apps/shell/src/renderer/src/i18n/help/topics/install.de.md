# GenOffice installieren

Jede Version wird auf der [Releases-Seite](https://github.com/pblsketch/openoffice/releases/latest) des Projekts auf GitHub veröffentlicht. Diese Version erscheint für Windows.

## Die Datei für Ihren Rechner wählen

| Plattform   | Voraussetzungen                         | Datei                           |
| ----------- | --------------------------------------- | ------------------------------- |
| **Windows** | Windows 10 oder neuer, 64-Bit Intel/AMD | `GenOffice-Setup-<version>.exe` |

Ältere Versionen bleiben auf der Releases-Seite.

## Unter Windows

1. Laden Sie `GenOffice-Setup-<version>.exe` von der Releases-Seite herunter.
2. Führen Sie die Datei aus. Das Installationsprogramm ist nicht codesigniert; Windows zeigt deshalb möglicherweise zuerst ein blaues Fenster „Der Computer wurde durch Windows geschützt“. Wählen Sie **Weitere Informationen** und dann **Trotzdem ausführen**. Der genaue Wortlaut hängt von Ihrer Windows-Version ab.
3. Folgen Sie dem Installationsprogramm bis zum Ende.

Es legt GenOffice im Startmenü ab und registriert `.docx`, `.xlsx`, `.pptx`, `.pdf` und Verwandte, sodass ein Doppelklick auf eine Datei sie öffnet.

Weil das Installationsprogramm nicht signiert ist, führen Sie nur eines aus, das Sie von der oben genannten Releases-Seite heruntergeladen haben.

## Updates

- GenOffice sucht auf derselben GitHub-Releases-Seite nach einer neueren Version. Sobald eine veröffentlicht ist, bietet **Einstellungen ▸ Über** sie an: Klicken Sie auf **Auf … aktualisieren**, warten Sie den Download ab und klicken Sie dann auf **Neustarten & installieren**.
- **Menü (☰) ▸ Nach Updates suchen** prüft, wann immer Sie möchten. Auf dem Mac ist es **Hilfe ▸ Nach Updates suchen**.
- Schlägt die Prüfung fehl — kein Netz oder noch nichts veröffentlicht —, passiert nichts, und die App arbeitet weiter wie zuvor.
- **Update-Kanal**, ebenfalls unter Einstellungen ▸ Über, ist Stabil oder Beta. Eine Änderung wirkt sofort und prüft auf ein Update; eine Beta-Installation wird nicht auf Stabil zurückgestuft.
- Auch Updates sind nicht codesigniert. Vor der Installation vergleicht die App die heruntergeladene Datei mit der Prüfsumme, die mit dieser Version veröffentlicht wurde.

## Der Build, den Sie ausführen

**Einstellungen ▸ Über** ist der Ort, an dem die App meldet, welche Version Sie haben, welchem Kanal sie folgt und wo das Projekt zu Hause ist. Dort steht auch, auf welchem Open-Source-Projekt diese App basiert.

## Die Kommandozeile ist dabei

Jede Installation bringt den Befehl `ieumoffice` mit, der mit denselben Engines spricht wie das Fenster: Die beiden können sich bei einer Datei also nicht widersprechen. `ieumoffice install-cli` legt ihn in Ihren `PATH`. Was er kann, steht in [Kommandozeile und Agenten](help://cli).
