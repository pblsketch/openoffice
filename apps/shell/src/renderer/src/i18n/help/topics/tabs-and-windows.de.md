# Tabs und Fensterverwaltung

Alle geöffneten Dateien teilen sich ein Fenster; die Tab-Leiste oben wechselt wie im Browser zwischen ihnen.

![Die Tab-Leiste: Startseite plus zwei Dokumente](img/tabs.png)

## Grundlagen

- **Wechseln**: Klicken Sie auf einen Tab, drücken Sie **Strg+Tab** (weiter) / **Strg+Umschalt+Tab** (zurück), oder scrollen Sie mit dem Mausrad über die Leiste.
- **Schließen**: das × am Tab oder ⌘W/ctrl+W. Bei ungespeicherten Änderungen wird nachgefragt.
- **Neu**: das + am rechten Ende der Leiste.
- **Die Aktivierung erfolgt sofort**: Ein Tabwechsel passiert beim Drücken, ohne auf das Ende des Klicks zu warten.

## Umbenennen: Tab doppelklicken

**Doppelklicken Sie auf einen beliebigen Dateitab**, und der Titel wird zu einem Eingabefeld an Ort und Stelle: Eingabetaste bestätigt, Esc bricht ab, Verlust des Fokus bestätigt; die Eingabetaste, die einen IME-Kandidaten bestätigt, wird nicht als Bestätigung missverstanden. Das Umbenennen durchläuft dieselben Sicherheitsprüfungen wie das Umbenennen einer Zeile auf der Startseite (unzulässige Zeichen, Namenskonflikte), benennt die Datei auf dem Datenträger um und aktualisiert die Zuletzt-verwendet-Liste.

## Zum Neusortieren ziehen

Halten Sie einen Tab und ziehen Sie ihn seitwärts, um die Reihenfolge zu ändern; die Nachbarn weichen live aus und die Reihenfolge steht beim Loslassen fest. Eine 4 Pixel große Toleranzzone verhindert, dass einfache Klicks die Tabs verrücken.

## Kontextmenü

Ein Rechtsklick auf einen Tab bietet **„In neuem Fenster öffnen“** — bei jedem Dokument-Tab, der sich abtrennen lässt — und **Schließen**, das auf einem Tab, der nicht geschlossen werden kann, ausgegraut ist. Beide folgen der Sprache der App.

## In ein Fenster abtrennen

**Ziehen Sie einen Tab aus der Leiste heraus** (oder verwenden Sie „In neuem Fenster öffnen“), und er wird zu einem eigenen Fenster mit dem lebenden Dokument; ziehen Sie ihn zurück, um ihn wieder anzudocken. Ein abgetrenntes Fenster ist vollwertig — Sie können dort weiter bearbeiten und speichern.

## Die Liste aller Tabs

Wenn die Tabs überlaufen, öffnet das kleine Symbol der Tableiste am rechten Ende die vollständige Liste (ein natives Menü, das nie vom Inhaltsbereich verdeckt wird); auswählen mit den Pfeiltasten.

## Die Werkzeugleiste in jedem Editor

Jeder Editor-Tab hat oben eine Werkzeugleiste (die genaue Anordnung variiert je Editor etwas):

- **Speichern** (⌘S/ctrl+S) und **Speichern unter**.
- **Rückgängig / Wiederholen**: mehrstufig; jeder Editor führt seine eigene Historie.
- **Suchen** (ctrl+F): öffnet die Suchleiste dieses Editors.
- **AutoSpeichern**-Schalter: eingeschaltet werden Änderungen in regelmäßigen Abständen auf den Datenträger geschrieben, ausgeschaltet nur beim manuellen Speichern (die Markierung „nicht gespeichert“ am Tab oder im Titel erinnert Sie daran).

## Der Start-Tab

Der Start-Tab ganz links lässt sich nicht schließen; um aus einem beliebigen Editor zurückzukehren, klicken Sie darauf oder verwenden Sie Datei ▸ **Zurück zur Startseite**.

## Geteilte Ansicht: zwei Bereiche

**Ziehen Sie einen Tab an den rechten Fensterrand**: Der Tab folgt als kleine schwebende Kopie, nahe dem Rand erscheint der Hinweis „Hier teilen“, und beim Loslassen entstehen zwei Bereiche nebeneinander. Lassen Sie ihn am unteren Rand los, entstehen zwei Bereiche übereinander. Das Kontextmenü des Tabs bietet dasselbe mit **Nach rechts teilen** und **Nach unten teilen** und bei einem Tab in einem Bereich zusätzlich **Teilung aufheben**.

- Der gezogene Tab landet in dem Bereich, auf dem Sie ihn abgelegt haben; der andere Bereich behält das Dokument, das Sie gerade eben gesehen haben.
- Ist nur ein Dokument geöffnet, wird eine Kopie desselben Dokuments in beide Bereiche gelegt, sodass Sie Anfang und Ende zusammen sehen. Auch ein noch nie gespeichertes neues Dokument lässt sich teilen.
- Ziehen Sie den **Trennsteg** zwischen den Bereichen, um ihr Verhältnis zu ändern; ein Doppelklick teilt halb und halb, und bis an ein Ende geschoben schließt er diesen Bereich. Das Dokument bleibt als Tab offen.

## Ein KI-Fenster, das dem Fokus folgt

- Es ist nur ein KI-Fenster sichtbar. Der Bereich, in dem Sie gerade arbeiten, zeigt seins; das des anderen Bereichs klappt zu einer Leiste ein, und ein Klick auf einen Bereich holt dessen KI-Fenster nach vorn.
- Während es eingeklappt ist, bleiben die Unterhaltung dieses Bereichs und laufende KI-Arbeiten am Leben. Unterhaltungen werden je Dokument gespeichert.
- **Zwei Kopien desselben Dokuments**: Nach dem Speichern im einen Bereich fragt das Speichern im anderen zuerst „Dieses Dokument wurde anderswo geändert“. Automatisches Speichern wartet still.
- Nach einem normalen Beenden kehrt beim **Neustart ohne Datei** das zuletzt geteilte Dokumentpaar genau so zurück, wie es geteilt war; mit einer Datei gestartet, öffnet sich nur diese Datei. Nach einem plötzlichen Abbruch kommen die vorherigen Tabs wie unten beschrieben zurück.
- Start-, Hilfe- und Präsentations-(Vorschau-)Tabs können nicht in einen Bereich. Während einer davon offen ist, verbergen sich die beiden Bereiche kurz und kehren zurück, sobald Sie wieder auf einem Dokumenttab sind.

Drei oder mehr Bereiche, das Teilen in einem abgelösten Fenster und die Live-Synchronisierung der beiden Kopien sind zurückgestellt.

## Wenn die App oder der PC plötzlich ausgeht

Solange ein Dokument ungespeicherte Änderungen hat, legt GenOffice etwa alle 30 Sekunden eine Wiederherstellungskopie davon im eigenen Datenordner der App an. Das tun alle Editoren, auch für ein neues Dokument, das nie gespeichert wurde. Ihre Datei selbst ändert sich erst, wenn Sie speichern.

- **Ihre Tabs kommen zurück**: Wurde die App oder der PC nicht normal beendet (Stromausfall, Absturz, erzwungenes Beenden der App, Herunterfahren oder Neustart für ein Update), kehren die offenen Dokument-Tabs beim nächsten Start von GenOffice in derselben Reihenfolge zurück, samt geteilter Ansicht, falls Sie eine hatten. Das gilt auch, wenn Sie die App durch Öffnen einer Datei starten.
- **Eine Liste auf der Startseite**: Dokumente mit noch ungespeichertem Inhalt erscheinen gemeinsam auf der Startseite. Wählen Sie für jedes **Wiederherstellen** oder **Verwerfen**, oder nutzen Sie **Alle wiederherstellen** bzw. **Alle verwerfen**, und drücken Sie dann **Übernehmen**. Hat ein anderes Programm oder ein Synchronisierungsdienst die Datei danach geändert, ist zunächst **Verwerfen** gewählt, damit die Datei so bleibt, wie sie jetzt ist. Ist die Originaldatei nicht mehr auffindbar, öffnet das Wiederherstellen den Inhalt als neues Dokument ohne Namen.
- **Später entscheiden**: Das Schließen der Liste löscht nichts. Wenn Sie eines dieser Dokumente zum ersten Mal öffnen, fragt ein Fenster mit seinem Namen erneut; Esc oder das Schließen des Fensters stellt es wieder her. Brauchen Sie den wiederhergestellten Inhalt nicht, schließen Sie das Dokument mit **Nicht speichern**.
- **Tabs laden beim Öffnen**: Wiederhergestellte Tabs zeigen sofort ihren Titel, doch jedes Dokument wird erst geladen, wenn Sie seinen Tab zum ersten Mal anklicken. Alles auf einmal zu öffnen könnte einen PC mit knappem Speicher erneut ausgehen lassen.
- **Beim Herunterfahren des PCs**: Sind Dokumente ungespeichert, fragt GenOffice nicht, ob gespeichert werden soll. Es behält die Kopien, beendet sich und bietet sie beim nächsten Start an.
- **Dokumente ohne Kopie**: Passwortgeschützte Excel-, HWP- und PDF-Dateien erhalten keine Wiederherstellungskopie, ihre ungespeicherten Änderungen lassen sich also nicht wiederherstellen; ein Hinweis sagt das einmal, wenn ein solches Dokument geöffnet wird. Speichern Sie diese oft. Passwortgeschützte Word- und PowerPoint-Dokumente erhalten eine Kopie, die mit demselben Passwort gesperrt ist.
- **CSV-, ältere .xls- und .tsv-Dateien**: Der Tabelleneditor bewahrt ihre Kopie als unbenannte Arbeitsmappe auf. Wiederhergestellt öffnet sie sich als unbenannte Arbeitsmappe, und das erste Speichern schlägt Ordner und Namen der Originaldatei als .xlsx vor.

Eine Kopie wird gelöscht, wenn Sie das Dokument speichern, es mit **Nicht speichern** schließen oder **Verwerfen** wählen, und außerdem nach 30 Tagen ohne Änderung. Nach einem normalen Beenden startet GenOffice wie bisher und bringt keine Tabs zurück.

**Das ist nicht AutoSpeichern.** AutoSpeichern schreibt Ihre Änderungen in die Datei selbst, und erst nachdem Sie einmal gespeichert haben. Eine Wiederherstellungskopie berührt Ihre Datei nie; sie hält nur fest, was Sie noch nicht gespeichert haben, bis Sie speichern oder verwerfen.
