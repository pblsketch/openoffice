# EPUB-E-Books: lesen, bearbeiten und übersetzen

Der E-Book-Editor öffnet EPUB-Bücher (`.epub`) in einem Tab. Sie lesen das Buch, korrigieren den Text direkt auf der Seite, stellen der KI Fragen dazu und übersetzen es in eine neue EPUB-Datei. Eine Ansicht, in der Sie den Code eines Kapitels bearbeiten, gibt es nicht.

## Ein Buch öffnen

- Öffnen Sie eine `.epub`-Datei über den Öffnen-Dialog, indem Sie sie auf das Fenster ziehen, aus den zuletzt verwendeten Dateien, dem Ordnerbaum oder der Google-Drive-Liste. Unter Windows wird sie auch unter „Öffnen mit“ angeboten. Durch die Installation wird GenOffice nicht zum Standardprogramm für `.epub`-Dateien.
- Ist das Buch bereits geöffnet, wird sein Tab nach vorn geholt.
- Kopiergeschützte Bücher (DRM) lassen sich nicht öffnen: Öffnen Sie sie in der App des Shops, in dem Sie sie gekauft haben. Beschädigte Dateien und Dateien, die keine EPUB-Bücher sind, öffnen sich ebenfalls nicht, und der Grund wird angezeigt.
- **Bücher mit festem Layout** (Seite für Seite gestaltet, etwa Bilderbücher und Comics) öffnen sich nur zum Lesen. Bearbeiten, Bearbeiten durch die KI, Ersetzen und Übersetzen sind ausgeschaltet, und die Statuszeile nennt den Grund. Lesen und Fragen an die KI funktionieren weiterhin.
- Ein Kapitel, dessen Datei fehlerhaft aufgebaut ist, wird so gut wie möglich angezeigt, lässt sich aber nicht bearbeiten; ein Hinweis oben im Kapitel sagt das. Es wird unverändert gespeichert und bleibt in Übersetzungen in der Originalsprache.

## Lesen

- Der Bereich **Inhalt** links zeigt das Inhaltsverzeichnis des Buchs. Klicken Sie auf einen Eintrag, um dorthin zu springen. Hat ein Buch keins, erhält es eine Liste seiner Kapitel.
- Jedes Kapitel wird nach oben und unten gescrollt. Scrollen Sie über das Ende eines Kapitels hinaus, um zum nächsten zu gelangen, oder über seinen Anfang hinaus, um zurückzugehen. Die Statuszeile zeigt, in welchem Kapitel Sie sich befinden.
- Auf dem Tab **Ansicht** ändern Sie Schriftgröße und Zeilenabstand und schalten die **Dunkle Ansicht** ein und aus. Diese Einstellungen betreffen nur den Bildschirm, nie das Buch, und gelten für alle Bücher.
- Die Stelle, an der Sie aufgehört haben zu lesen, wird für jede Datei gemerkt, und zwar im Datenordner der App, nicht im Buch.
- **Im Buch suchen** (Ctrl+F) durchsucht alle Kapitel. Klicken Sie auf ein Ergebnis, um dorthin zu springen.
- Ein Link innerhalb des Buchs führt an die verlinkte Stelle. Web- und E-Mail-Links öffnen sich in Ihrem Standardbrowser; andere Adressen werden nicht geöffnet.
- Die eigenen Skripte des Buchs laufen nie, und nichts wird aus dem Internet geladen. Ton und Video werden nicht abgespielt.

## Text bearbeiten

- Klicken Sie in einen Absatz und tippen Sie. Absätze, Überschriften, Listenpunkte, Zitate, Tabellenzellen und Bildunterschriften lassen sich bearbeiten. Bilder und der Aufbau von Tabellen nicht.
- Beim Einfügen wird nur reiner Text eingefügt.
- **Enter** teilt einen Absatz in zwei, **Shift+Enter** beginnt darin eine neue Zeile. **Backspace** am Anfang eines Absatzes verbindet ihn mit dem vorherigen, **Delete** am Ende holt den nächsten heran. In Tabellenzellen, Bildunterschriften und Definitionslisten bewirkt Enter nichts: Es ändert sich nur der Text darin.
- **Fett** (Ctrl+B) und **Kursiv** (Ctrl+I) werden ein- und ausgeschaltet. Text, den das Stylesheet des Buchs fett oder kursiv setzt, bleibt, wie er ist.
- **Rückgängig** (Ctrl+Z) und **Wiederholen** (Ctrl+Y) funktionieren auch nach dem Speichern weiter. Wird eine Änderung in einem anderen Kapitel rückgängig gemacht, springen Sie dorthin.
- **Ersetzen** (Ctrl+H) arbeitet das ganze Buch Absatz für Absatz ab: Ein Treffer reicht nie über zwei Absätze. Schreibgeschützte Kapitel werden übersprungen, und die Zahl der übersprungenen Stellen wird angezeigt. **Alle ersetzen** lässt sich in einem Schritt rückgängig machen.

## Speichern

- Speichern (Ctrl+S), Speichern unter (Ctrl+Shift+S, nur `.epub`), **Automatisch speichern** im Menüband und die Nachfrage vor dem Schließen funktionieren wie in den anderen Editoren.
- Hat sich nichts geändert, wird die Datei nicht neu geschrieben. Wenn Sie Änderungen speichern, werden nur die geänderten Absätze neu geschrieben. Bilder, Schriften, Formatvorlagen und alle übrigen Teile des Buchs bleiben genau so, wie sie waren. In einem EPUB 3-Buch wird außerdem das Datum der „letzten Änderung“ aktualisiert.
- Hat ein anderes Programm die Datei geändert, nachdem Sie sie geöffnet haben, wird sie nicht überschrieben.

## KI-Panel

- Stellen Sie Fragen zum Buch, lassen Sie ein Kapitel zusammenfassen oder seinen Text korrigieren oder umschreiben. Die KI liest Inhaltsverzeichnis und Kapitel des Buchs und findet Text darin.
- Änderungen der KI erscheinen sofort, und ein einziges Rückgängig (Ctrl+Z) nimmt alles zurück, was sie in diesem Durchgang geändert hat. Die KI kann Text fett oder kursiv setzen, aber keine Bilder, Tabellen oder Kapitel hinzufügen.
- Der Text des Buchs ist Material für die KI, keine Anweisung an sie.
- Bitten Sie „Übersetze dieses Buch ins Französische“, und die KI öffnet das Übersetzungsfenster mit dieser Sprache bereits eingetragen. Es wird nichts gesendet, bevor Sie auf **Starten** klicken.
- EPUB-Bücher lassen sich auch im KI-Panel der anderen Editoren anhängen, mit `@` auswählen und über die Dateisuche auf der Startseite finden.

## Ein Buch übersetzen

1. Klicken Sie auf dem Tab **Start** auf **Buch übersetzen** (oder Datei ▸ Buch übersetzen…).
2. Wählen Sie die Sprache, die Kapitel (anfangs sind alle ausgewählt) und die Ergebnisse: ein **Übersetztes Buch**, ein **Zweisprachiges Buch** (Original und Übersetzung) oder beides. Legen Sie fest, wo jedes gespeichert wird.
3. Klicken Sie auf **Weiter**. Die Bestätigung zeigt die geschätzte Zahl der KI-Anfragen, an welche KI sie gehen, die bereits übersetzten Teile (die nicht erneut gesendet werden) und, bei einer nach Nutzung abgerechneten Verbindung, dass Kosten entstehen. Hat das Buch ungespeicherte Änderungen, heißt die Schaltfläche **Speichern und übersetzen**.
4. Klicken Sie auf **Starten**. Oben erscheinen der Fortschritt und **Anhalten**. Bis die Übersetzung fertig ist, ist das Bearbeiten gesperrt; das KI-Panel arbeitet weiter.
5. Am Ende listet ein Bericht auf, was übersetzt wurde, was in der Originalsprache geblieben ist und welche Ergebnisdateien entstanden sind, jeweils mit **Öffnen**.

- Das Buch selbst ändert sich nicht. Jedes Ergebnis ist eine neue EPUB-Datei mit eigener Identität, sodass E-Book-Bibliotheks-Apps es vom Original unterscheiden.
- Auch der Titel und das Inhaltsverzeichnis werden übersetzt. In einem zweisprachigen Buch folgt auf jeden Absatz seine Übersetzung; in Tabellen, Bildunterschriften und Listen steht die Übersetzung in derselben Zelle bzw. demselben Eintrag. Sein Titel zeigt beides, als „Originaltitel (Übersetzter Titel)“.
- Kapitel, die Sie nicht ausgewählt haben, bleiben im Ergebnis in der Originalsprache.
- Ein senkrecht gesetztes Buch wird waagerecht, es sei denn, es wird ins Japanische, Chinesische oder Koreanische übersetzt. Übersetzungen ins Arabische und Hebräische laufen von rechts nach links.
- Bereits Übersetztes bleibt erhalten. Wenn Sie anhalten, wählen Sie **Bisher Übersetztes exportieren** (der Rest bleibt in der Originalsprache) oder **Später fortsetzen**. Öffnen Sie ein Buch mit einer unfertigen Übersetzung, bietet GenOffice an, sie fortzusetzen. **Von vorn neu übersetzen** löscht zuerst die aufbewahrte Übersetzung für diese Sprache.
- Aufbewahrte Übersetzungen werden unter Einstellungen ▸ Allgemein ▸ **Gespeicherte KI-Ergebnisse** zusammen mit denen von PDF-Dokumenten gezählt, und **Alle löschen** entfernt auch sie.
- Dieselbe Übersetzung lässt sich auch über die [Kommandozeile](help://cli) mit `ieumoffice epub translate` ausführen.

## Noch nicht unterstützt

- Kapitel hinzufügen, löschen oder umsortieren; Titel, Autor oder Cover ändern; Bilder oder Tabellen einfügen; einen Absatz in eine Überschrift oder Liste umwandeln.
- Bücher mit festem Layout bearbeiten oder übersetzen und kopiergeschützte Bücher öffnen.
- Umblättern wie in einem gedruckten Buch und ein neues, leeres Buch anlegen.
- Original und Übersetzung im Editor nebeneinander vergleichen. Öffnen Sie stattdessen das zweisprachige Buch, und korrigieren Sie das übersetzte Buch wie jedes andere.
- Teile eines Buchs vor der KI verbergen.
