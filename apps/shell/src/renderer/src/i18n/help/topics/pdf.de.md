# PDF: lesen, kommentieren und schwärzen

Der PDF-Editor hat fünf Tabs im Menüband: **Start / Anmerken / Bearbeiten / Seiten / Ansicht**. Er liest und schreibt: Text ist bearbeitbar, Inhalte lassen sich schwärzen und signieren, und Formulare lassen sich ausfüllen.

## Lesen und navigieren

- Linke Seitenleiste: **Miniaturen** (anklicken zum Springen, der sichtbare Bereich ist hervorgehoben) oder **Gliederung** (Lesezeichen, sofern vorhanden).
- Zoom: die Verhältnissteuerung unten rechts; Strg+Radrad zoomt stufenweise.
- Ansicht verschieben: Mit dem **Hand-Werkzeug** (Registerkarten Start und Ansicht) verschieben Sie die Seite durch Ziehen in alle Richtungen. Solange es aktiv ist, wird beim Ziehen kein Text markiert, und ein einfacher Klick folgt weiterhin einem Link. Ziehen mit gedrückter mittlerer Taste (Mausrad) verschiebt die Ansicht auch ohne das Werkzeug. Esc oder ein anderes Werkzeug schaltet es aus.
- Drehung: einzelne oder alle Seiten über das Menü „Seiten“; Drehungen werden beim Speichern zurückgeschrieben.
- Suche: Strg+F als Volltextsuche, alle Treffer werden hervorgehoben.
- Verschlüsselte PDFs: Eine Passwortabfrage (in einem eigenen kleinen Fenster) öffnet sie; das Passwort gilt nur für diese Sitzung. Sie können ein solches Dokument bearbeiten und speichern; beim Speichern bleibt das Kennwort erhalten. **Anmerken → Schützen** legt das Kennwort und die erlaubten Aktionen für Leser fest, ändert oder entfernt sie.

## Textauswahl und Markierungen (Anmerken)

Probieren Sie es an einem beliebigen Absatz aus:

1. **Ziehen Sie die Maus über einen Satz** — beim Loslassen schwebt eine Annotationsleiste darüber:

![Die Annotationsleiste nach der Textauswahl](img/pdf-highlight.png)

2. Wählen Sie eine der drei **Hervorheben**-Farben oder **Unterstreichen**, **Wellenlinie** bzw. **Durchstreichen**. Um eine Markerfarbe zu ändern, klicken Sie sie mit der rechten Maustaste an und wählen eine neue. Nach dem Unterstreichen, einer Wellenlinie oder dem Durchstreichen öffnet sich in der Leiste eine Farbreihe: Ein Klick auf eine andere Farbe ändert sie, und die nächste wird ebenfalls in dieser Farbe gezeichnet. **KI fragen** sendet die Auswahl mit Ihrer Frage an den KI-Bereich.
3. Um eine Annotation rückgängig zu machen, wählen Sie dieselbe Stelle erneut durch Ziehen aus und klicken Sie auf die aktive Schaltfläche der Leiste (ein Umschalter im Word-Stil) oder wählen Sie sie aus und drücken Sie Entf.

Referenz:

- Über Text ziehen lässt eine Popup-Leiste erscheinen: **hervorheben / unterstreichen / durchstreichen / kopieren / KI fragen**.
- Die Farben kommen aus der Palette; **dieselbe Markierung erneut auf einen bereits markierten Bereich anzuwenden entfernt sie** (Umschalter im Word-Stil).
- Bereits in der Datei gespeicherte Markierungen lassen sich auswählen und löschen (⋯-Menü oder Entf).
- **Hinweis**: Solange ein Zeichnungswerkzeug aktiviert ist, ist die Textebene nicht auswählbar — das Werkzeug deaktiviert sich nach jeder Platzierung, Sie sind also für den nächsten Schritt wieder im Auswahlmodus.

## Zeichnungswerkzeuge (Anmerken)

Sechs Werkzeuge: **Freihand, Rechteck, Ellipse, Pfeil, Notiz** sowie **Bereich schwärzen** auf dem Tab „Anmerken“.

- Jedes Werkzeug ist ein Umschalter: Klicken Sie, um es zu aktivieren; **es deaktiviert sich, sobald eine Form platziert ist** (für weitere Formen erneut anklicken); ein Klick auf das aktive Werkzeug deaktiviert es ebenfalls.
- Freihand folgt der Strichstärke; Rechteck/Ellipse/Pfeil werden durch Ziehen aufgezogen; die Farben kommen aus der Zeichnungspalette.
- Platzierte Formen lassen sich auswählen, löschen, verschieben und (Rechteck/Ellipse) in der Größe ändern.
- **Schwärzen, der vollständige Ablauf** (um eine Textzeile zu verbergen):

  1. Tab „Anmerken“ ▸ klicken Sie auf **Bereich schwärzen** (das Werkzeug wird aktiviert).
  2. **Ziehen Sie ein Rechteck über den Inhalt** — er wird mit einer Schraffur überdeckt, und die Werkzeugleiste erhält die Schaltflächen **Markierungen löschen / Schwärzungen anwenden**.

  3. Klicken Sie auf **Schwärzungen anwenden** und bestätigen — das Ergebnis ist eine Arbeitskopie, in der der überdeckte Text und die Bilder physisch entfernt sind (nicht bloß verdeckt), und das lässt sich nicht rückgängig machen; das Originaldokument bleibt unberührt.

  Ein Fehler? Die Schaltfläche „Markierungen löschen“ entfernt die aktuellen Markierungen, damit Sie neu zeichnen können.

## Haftnotizen und Kommentarverläufe

- Das **Notiz-Werkzeug** setzt eine Stecknadel und öffnet eine Randkarte für den Text (Autorenname einstellbar); nach dem Bestätigen wird sie als Standard-PDF-Textannotierung gespeichert.
- Klicken Sie auf eine Stecknadel, um den Verlauf zu öffnen: **Antworten** (Antworten bilden eine flache Liste ohne Verschachtelung), **Bearbeiten** Ihres Kommentars, **Löschen** eines Kommentars oder eines ganzen Verlaufs.
- In Bearbeitung befindliche Inhalte bleiben erhalten, bis das Speichern den neuen Text in dieselbe Annotierung der Datei zurückschreibt; so bleiben die Antwortketten intakt.

## PDF-Inhalte bearbeiten (Bearbeiten)

- **Text bearbeiten**: Klicken Sie auf Text, um ihn Block für Block zu bearbeiten (pdfium-Engine; Schriften werden möglichst passend gewählt).
- **Text einfügen**: Setzen Sie durchsuchbaren Text mit Schriftart, Größe und Farbe Ihrer Wahl ab.
- **Bild / Stempel einfügen**.
- Formulare: AcroForm-Felder lassen sich direkt ausfüllen; die Werte werden beim Speichern geschrieben.

## Signaturen

- **Handschriftliche Signatur**: zeichnen Sie sie; sie kann einem Signaturfeld eines Formulars zugeordnet werden.
- **Bildsignatur**: setzen Sie ein Bild als Signatur ab.
- Gespeicherte Signaturen lassen sich wiederverwenden.
- **Zertifikatssignatur** (Annotate-Register): signieren mit einem Zertifikat aus dem Systemspeicher oder einer .p12/.pfx-Datei; optional die Signatur auf der Seite zeigen und optional das Dokument gegen spätere Änderungen zertifizieren.
- Das Signieren schreibt immer eine **neue Datei** (inkrementelles Update — frühere Signaturen bleiben gültig) und öffnet die signierte Kopie an Ort und Stelle. Zuerst speichern: Eine Signatur deckt die Datei ab, wie sie auf der Festplatte steht.
- Ein Banner über dem Dokument listet bestehende Signaturen; **Signaturen anzeigen** zeigt Gültigkeit, Abdeckung und Zertifikatskette jeder einzelnen. Sperrprüfung (CRL/OCSP) findet nicht statt.

## Seitenvorgänge (Seiten)

- **Drehen / löschen / neu anordnen**: Ziehen Sie Miniaturen zum Umsortieren; beim Löschen wird nachgefragt.
- **Seiten importieren**: ziehen Sie Seiten aus einem anderen PDF herein. **Leere Seite einfügen** fügt eine leere Seite hinzu.
- **Seiten ersetzen** tauscht einen Bereich gegen Seiten aus einer anderen Datei; **Seiten zuschneiden** beschneidet, mit der Option, das auf alle Seiten anzuwenden.
- **Seitengröße** skaliert alle Seiten auf ein einziges Papierformat; **Reihenfolge umkehren** dreht das Dokument von hinten nach vorne.
- **Seite extrahieren**: ausgewählte Seiten in ein neues PDF exportieren.
- **PDF aufteilen**: zwei Varianten — nach Bereichen in mehrere Dateien aufteilen oder jede Seite in ein Raster kleinerer Seiten schneiden.
- **PDF zusammenführen**: zwei Varianten — weitere PDFs anhängen oder mehrere Seiten auf ein Blatt legen. Die Größen werden summiert, **bevor** irgendetwas gelesen wird, und **alles über 1 GiB insgesamt wird mit einer lesbaren Fehlermeldung abgelehnt** (so bleibt der Speicher begrenzt).
- Änderungen auf Seitenebene werden beim nächsten Speichern zurückgeschrieben; „Speichern unter“ lässt das Original unberührt.

## Export und Druck

- **Als Word exportieren… / PowerPoint… / Excel…** im Menü Datei, oder dieselben drei über **PDF umwandeln** im Menüband — alles lokal, kein Upload. Die .pptx kommt mit einem Foliensatz pro Seite heraus, die .xlsx mit einem Arbeitsblatt pro Seite. Jede fragt nach dem Speicherort.
- **Druck**: aktuelle Reihenfolge und Drehungen über den Systemdialog; Seitenbereiche werden unterstützt.

## Speichern

- Normales Speichern bzw. AutoSpeichern schreibt Annotationen und Änderungen in die Datei zurück (atomar).
- **Schwärzen läuft über den Ablauf „Anwenden“** und erzeugt eine Kopie, das Original bleibt unberührt — so bleibt sensible Information nicht darin zurück.

## Tastenkürzel der Auswahlleiste

Solange die Anmerkungsleiste über markiertem Text sichtbar ist, löst eine einzelne Taste sofort eine Aktion aus.

| Taste | Aktion                                            |
| ----- | ------------------------------------------------- |
| H     | Hervorheben (entfernt eine vorhandene Markierung) |
| U     | Unterstreichen                                    |
| S     | Durchstreichen                                    |
| N     | Notiz am Ende der Auswahl anlegen                 |
| E     | KI-Erklärung (Passagenkarte)                      |
| T     | KI-Übersetzung (Passagenkarte)                    |
| Enter | Eingabefeld von **KI fragen** öffnen              |

- Die Tasten funktionieren auch mit koreanischer oder jeder anderen Eingabemethode gleich. Während Sie in einem Feld tippen oder Strg bzw. Alt gedrückt halten, werden sie ignoriert.
- In einem gegen Bearbeitung gesperrten Dokument (das Besitzerkennwort verbietet Änderungen) bewirken H, U, S und N nichts und nennen wie die Schaltflächen der Leiste den Grund.

## Passagenkarten

Drücken Sie **E** oder **T** oder die Chips für Erklären und Übersetzen im Feld **KI fragen**: Die Antwort erscheint in einer kleinen Karte neben der Auswahl. Karten werden aufbewahrt, sind also beim erneuten Öffnen noch da, und lassen sich kopieren. Fragen Sie erneut nach derselben Passage, öffnet sich die vorhandene Karte, ohne dass etwas gesendet wird.

- **Als Notiz behalten** legt an dieser Stelle eine Notiz an. Ihre erste Zeile lautet „KI-Erklärung“ oder „KI-Übersetzung“, als Autor steht Ihr PC-Kontoname darin. In die Datei gelangt sie erst beim Speichern des PDFs; bis dahin zeigt die Karte „Wartet auf Speichern“.
- **Im KI-Bereich weiterfragen** übergibt Passage und Antwort an den KI-Bereich, ohne sie zu senden; **Zur Notiz hinzufügen** hängt sie an die Notiz dieses PDFs an.
- Nur **Neu erstellen** schickt die Passage noch einmal an die KI.
- **Löschen** entfernt nur die aufbewahrte Karte. Eine bereits behaltene Notiz bleibt bestehen.
- Eine feine gepunktete Linie kennzeichnet jede Passage mit Karte; ein Klick darauf öffnet die Karte wieder. Die Linie ist nur auf dem Bildschirm zu sehen und wird weder gespeichert noch gedruckt. Ein- und ausschalten unter Ansicht ▸ **Passagenmarken**.

## Anmerkungen im Überblick

- Ansicht ▸ **Anmerkungen** zeigt in der linken Seitenleiste eine Liste aller Hervorhebungen, Unterstreichungen, Durchstreichungen, Notizen und Zeichnungen dieses Dokuments, dazu noch nicht gespeicherte Markierungen und Passagenkarten. Markierungen zeigen den Text, der darunter liegt.
- Filtern Sie nach Art, Farbe, Seitenbereich oder Text und sortieren Sie nach Seite oder Erstellungsreihenfolge.
- Ein Klick auf einen Eintrag springt mit kurzem Aufblinken an die Stelle. Eine Notiz öffnet ihren Randverlauf, eine Karte die Karte.
- Die Menüpunkte **Als Markdown kopieren**, **Als Markdown-Dokument öffnen** und **Als Word-Dokument öffnen** verwenden die gerade gefilterte Liste. Die KI wird dabei nicht gefragt. Neue Dokumente lassen sich nur aus einem PDF anlegen, das in GenOffice geöffnet ist.

## Übersetzung nebeneinander

- Schalten Sie Ansicht ▸ **Übersetzung nebeneinander** ein, erhält jede Seite rechts eine Übersetzungsspalte, die mitscrollt. Das Einschalten allein sendet nichts an die KI. Ein Dokument, das Sie schon mit **Dokument übersetzen** übersetzt haben, zeigt die Übersetzung sofort; Absätze ohne Übersetzung erscheinen als blasser Originaltext.
- **Diese Seite übersetzen** (oder **Rest übersetzen**, wenn ein Teil schon fertig ist) schickt die Seite bei einem Abonnement mit einem Klick ab; neben der Schaltfläche steht, an welche KI. Bei einer nutzungsabhängig abgerechneten Verbindung fragt der erste Klick in einem Tab zuerst „berechnet dafür Kosten · Übersetzen / Abbrechen“.
- Mit einem Doppelklick auf einen übersetzten Absatz bearbeiten Sie ihn. Bearbeitete Absätze werden als reiner Text aufbewahrt und unverändert in übersetzte PDF-, Markdown- und EPUB-Dateien übernommen. **Neu übersetzen** an einem Absatz sendet nur diesen einen und fragt vorher nach, wenn Sie ihn bearbeitet haben.
- Fährt die Maus über einen übersetzten Absatz, wird seine Stelle im Original umrandet. Breite und Schriftgröße der Spalte sind einstellbar. **Alle Seiten übersetzen…** öffnet das Fenster **Dokument übersetzen**; dessen Format **Nur aufbewahren (keine Datei)** behält die Übersetzung, ohne eine Datei zu schreiben.
- Neu übersetzte Absätze sind Satz für Satz verknüpft. Fährt die Maus über einen übersetzten Satz, wird dieser Satz auf der Originalseite markiert; über einem Originalsatz leuchtet seine Übersetzung auf. Wo der Satz auf der Seite nicht zu finden ist, und bei früher übersetzten oder von Ihnen bearbeiteten Absätzen bleibt die Verknüpfung absatzweise.
- Die Leiste über der Spalte wechselt zwischen **Übersetzung** und **Einfache Sprache**. Die Erklärung in einfacher Sprache schreibt den Text mit Wörtern des Alltags und kurzen Sätzen neu, für Kinder, ältere Menschen oder Lernende der Sprache; Fakten, Zahlen und Namen bleiben, wie sie sind. Die Wahl wird gespeichert, und der Wechsel sendet nichts. Solange die Erklärung angezeigt wird, wirken die Seiten- und Absatzschaltflächen und das Bearbeiten auf sie.
- In der einfachen Sprache öffnet **Alle Seiten einfach erklären…** das Fenster **Dokument übersetzen** mit der Art **Einfache Sprache**. Eine Erklärung ist länger als das Original und kann daher keine übersetzte PDF werden; sie wird als Markdown oder EPUB geschrieben. Mit **Original, dann Erklärung** folgt auf jeden Absatz des Originals seine Erklärung; ausgeschaltet enthält die Datei nur die Erklärung. Die Sprache ist zuerst die Sprache der Oberfläche und darf auch die des Dokuments sein.

## KI-Markierung

- Unter Start ▸ **KI-Markierung** wählen Sie einen Kategoriensatz (Forschung & Berichte, Verträge & AGB, Lehrbücher & Anleitungen oder Eigene) und die Seiten. Gesendet wird erst, wenn Sie die geschätzte Zahl der Aufrufe und die Ziel-KI geprüft und **Starten** gedrückt haben.
- Die von der KI gewählten Sätze erscheinen als Vorschau in halbtransparenten farbigen Kästen auf der Seite. Die Vorschau wird nie gespeichert; ein- und ausschalten unter Ansicht ▸ **Markierungsvorschau**.
- Im Bereich **Anmerkungen** können Sie Vorschläge einzeln **Annehmen** oder **Verwerfen** oder eine ganze Kategorie annehmen. Ein Satz, der im Seitentext nicht gefunden wurde, lässt sich nicht annehmen.
- Ein angenommener Vorschlag wird zu einer Hervorhebung in der Farbe seiner Kategorie, und der Kategoriename wird als Betreff der Anmerkung gespeichert, sodass andere PDF-Programme ihn in ihrer Kommentarliste zeigen. In die Datei gelangt er beim Speichern des PDFs.
- In einem gegen Bearbeitung gesperrten Dokument lässt sich die KI-Markierung nicht starten. Erfundene Sätze, die nicht im Text stehen, werden verworfen; der Abschlussbericht nennt, wie viele empfangen und verworfen wurden.

## Dokumentübersicht und Absatzzitate

- Oben im KI-Bereich erzeugt **Dokumentübersicht** ▸ **Übersicht erstellen** eine Zusammenfassung in drei Zeilen, eine Zusammenfassung und Schlüsselbegriffe (mit Bedeutung und erster Seite). Ein langes Dokument wird in Teilen zusammengefasst, deshalb bestätigen Sie zuerst die geschätzte Zahl der Aufrufe.
- Die Übersicht wird aufbewahrt und ist beim erneuten Öffnen noch da; erst **Neu erstellen** sendet wieder. Ein Klick auf einen Begriff sucht ihn im Dokument; jeder Abschnitt lässt sich kopieren oder zur Notiz hinzufügen.
- Ist das Gespräch leer, bietet der KI-Bereich drei vorgeschlagene Fragen an. Ein Klick sendet die Frage einmal.
- Ein Klick auf einen Seitenlink (p.N), den die KI als Beleg angibt, springt zu dieser Seite und hebt den zitierten Satz zwei Sekunden lang hervor. Wird der Satz nicht gefunden, geht es nur zur Seite.

## Eine Notiz pro PDF

- Beim ersten Klick auf **Notiz öffnen** (Registerkarte Ansicht oder Bereich **Anmerkungen**) erscheint ein Speicherdialog, vorbelegt mit dem Ordner des PDFs und dem Namen „PDF-Name Notiz.md“. Danach öffnet sich die Notiz direkt in einem Markdown-Tab.
- Wählen Sie eine bereits vorhandene Datei, fragt Windows womöglich, ob sie ersetzt werden soll. Die Datei wird trotzdem nicht überschrieben, sondern unverändert als Notiz verknüpft.
- **Zur Notiz hinzufügen** (auf Karten, Einträgen im Bereich und in der Dokumentübersicht) setzt ein Zitat mit Seitenlink ans Ende des Notiz-Tabs und lässt es ungespeichert; gespeichert wird im Notiz-Tab von Ihnen selbst. Der Link öffnet das PDF auch in anderen Programmen, etwa einem Browser, auf dieser Seite.
- Ein nie gespeichertes PDF zeigt „Speichern Sie zuerst das PDF“. Notizen gibt es nur für PDFs, die in GenOffice geöffnet sind.
