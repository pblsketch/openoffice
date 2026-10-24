# Einen Coding-Agenten anbinden

GenOffice spricht das Model Context Protocol: Ein Coding-Agent kann Ihre Dokumente also über dieselben Engines lesen, schreiben und rendern wie die App. Der Agent rät nicht an einem Dateiformat — er erhält die typisierten op-Schemas aus genau den Definitionen, gegen die der Executor prüft.

## In der App einrichten

**Einstellungen ▸ Integrationen** ist der Ort dafür. Der Bereich hat zwei Hälften, und Sie können eine davon oder beide nutzen.

**Der Skill.** Eine Zeile pro Coding-Agent, der auf diesem Rechner gefunden wurde — Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf —, jede mit **Installieren**, **Aktualisieren** und **Deinstallieren**, dazu **In anderen Ordner installieren …**, **Skill herunterladen (zip)** und **Pfad kopieren**. Steht Ihr Assistent nicht in der Liste, zeigen Sie GenOffice auf einen Ordner, aus dem er `SKILL.md` liest, oder speichern Sie das Zip und lassen Sie den Assistenten es installieren. Skill und MCP können nebeneinander liegen: Der Assistent nimmt eines davon, und beide tun genau dieselben Dinge.

**MCP.** Zwei Wege stehen bereit: **Vom Assistenten gestartet (empfohlen)** — dort tragen Sie die angezeigte Konfiguration in Ihren Client ein, und der Assistent startet den Server selbst —, und **Lokaler HTTP-Server**, den die App für Sie betreibt. So oder so redet der Assistent am Ende mit GenOffice, und Sie tippen nie einen Befehl.

## Über die Kommandozeile einrichten

Dasselbe aus einem Terminal — das ist der fortgeschrittene Weg, und der richtige, wenn der Agent dort liegt, wo der Bereich ihn nicht findet:

```sh
ieumoffice mcp install all
```

Er findet die Coding-Agenten auf diesem Rechner und schreibt den Eintrag für den stdio-Server in die Konfiguration jedes einzelnen; den Rest der Datei lässt er, wie er ihn vorgefunden hat. Der Eintrag heißt `ieumoffice`. Von Hand für Claude Code vorgenommen, lautet dieselbe Registrierung `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`.

```sh
ieumoffice mcp list             # where each agent stands
ieumoffice mcp install cursor    # just one
ieumoffice mcp uninstall cursor  # take it back out
```

Einen Agent, den Sie an einem ungewöhnlichen Ort installiert haben, erreicht man mit `--dir <path>`; `--force` überschreibt einen Eintrag, der schon vorhanden ist.

`ieumoffice mcp --help` zeigt alles, was der Server annimmt, auf einem Bildschirm: die Formen zum Registrieren, Entfernen und Auflisten, das Bereitstellen über HTTP und die beiden Schema-Schalter.

## Ohne Assistenten ausführen

Für einen Client auf einem anderen Rechner: Stattdessen über HTTP bereitstellen:

```sh
ieumoffice mcp --http 8765 --token <secret>
```

`--host <addr>` legt fest, wo er lauscht. Geben Sie demselben Client dasselbe Token.

Auch über HTTP wandern Dateien: `PUT /files/<name>` lädt eine hoch, jedes Werkzeug nimmt anstelle eines Pfads eine `http(s)`-URL entgegen, und Ausgaben kommen als Download-URLs zurück — und, wenn sie klein genug sind, als eingebettete Ressourcen. Ops, Specs und Markdown werden in beiden Fällen inline übergeben.

## Was der Agent bekommt

Jeder Befehl ist ein Werkzeug. Die interessanten:

- **`docs`, `sheet`, `slides`** — eine Datei über den Schreibpfad der App lesen und bearbeiten, einen **op** nach dem anderen. Eine neue Präsentation läuft über `deck_start`, `deck_page`, `deck_build`.
- **`render`** — eine PNG-Datei pro Seite, vom Renderer der App gesetzt, sodass der Agent eine Folie ansieht, statt zu raten.
- **`pdf`** — die Textebene einer PDF-Datei, Seite für Seite, ohne App-Prozess.
- **`info`** — Metadaten und eine Strukturübersicht, meist der billigste erste Aufruf bei einer unbekannten Datei.
- **`search`, `image`, `media`** — Web- und Bildsuche, Bildgenerierung und Medienanalyse über das, was in der App eingerichtet ist, sodass der Agent keine eigenen Schlüssel braucht. Der nächste Abschnitt sagt, was sie nutzen dürfen.
- **`merge`** — eine `{{key}}`-Vorlage füllen.

## Suche, Bilder und Medien: was ein Agent nutzen darf

Eine Anfrage vom Befehl `ieumoffice` oder von einem MCP-Client haben Sie nicht selbst in der App eingetippt; deshalb geht GenOffice vorsichtig damit um.

- **Die Suche** funktioniert immer und ist standardmäßig kostenlos. Der Schlüssel eines Suchanbieters wird nur verwendet, wenn Sie einen ausgewählt haben.
- **Ein Bild erzeugen** setzt den Schlüssel eines Bildanbieters voraus. In dieser Version erzeugt ein Abonnement keine Bilder.
- **Ein Bild beschreiben** läuft über einen Anbieter mit Schlüssel, wenn einer eingerichtet ist. Ihr Claude- oder Codex-Abonnement wird **nur verwendet, wenn Sie es erlauben**.
- **Video und Audio** brauchen einen Anbieter mit Schlüssel, der Video unterstützt.

Um die Nutzung des Abonnements zu erlauben, öffnen Sie Einstellungen ▸ KI ▸ **Erweitert** und schalten Sie **Automatische Anfragen dürfen ein Abonnement nutzen** ein. Zuerst erscheint eine Warnung — „Es gibt kein stündliches Limit: Ein Programm kann beliebig viele Anfragen senden, und diese können den gesamten Text eines Dokuments und Bilder seiner Seiten enthalten. Keines der beiden Unternehmen empfiehlt, ein Programm das Abonnement automatisch nutzen zu lassen, und Ihr Konto kann eingeschränkt werden.“ —, und der Schalter wird erst nach **Trotzdem einschalten** aktiv.

Auch bei eingeschaltetem Schalter gilt:

- Anfragen werden einzeln nacheinander bearbeitet. Weitere warten, bis sie an der Reihe sind.
- Es gibt kein Stundenlimit. Die Reihenfolge wechselt nach jeder einzelnen Anfrage, nicht nach jedem Auftrag, sodass auch eine lange PDF-Übersetzung sich mit anderen Aufrufern abwechselt, statt sie aufzuhalten. Ein Schalter, der unter der früheren Warnung eingeschaltet wurde, ist wieder aus: Lesen Sie die neue Warnung und schalten Sie ihn erneut ein.
- Eine Anmeldung mit Abrechnung nach Verbrauch, die Sie mit **Trotzdem verwenden** freigegeben haben, zählt hier nicht als Abonnement. Sie wird wie ein Schlüssel behandelt: Haben Sie sie als verwendete KI gewählt, laufen Bildbeschreibungen unabhängig vom Schalter darüber, und jede wird berechnet.

Ist der Schalter aus und kein Schlüssel eingerichtet, antwortet das Werkzeug, dass die Funktion nicht verfügbar ist, und nennt diese Einstellung. Ein Agent kann das vorab mit dem Werkzeug `capabilities` prüfen; siehe [Kommandozeile und Agenten](help://cli).

## Schemas und ein kleineres Budget

`apply` und `create` geben ihre Parameter `ops`, `cells` und `data` mit dem typisierten Schema pro op bekannt, erzeugt aus `ieumoffice guide <domain> --json`. Das ist präzise und nicht klein. Ein Client mit knappem Kontextfenster kann stattdessen einfache Arrays anfordern:

```sh
ieumoffice mcp --compact-schemas
GENOFFICE_MCP_COMPACT_SCHEMAS=1 ieumoffice mcp
```

## Wozu der Skill gut ist

Ein Agent, der das op-Vokabular nicht kennt, wird raten. Der Skill bringt die Referenz und die Design-Leitfäden mit — dasselbe Material, das `ieumoffice guide` ausgibt —, damit der Assistent Ops schreibt, deren Spezifikation er wirklich gelesen hat. Installieren Sie ihn aus dem Bereich oben oder mit `ieumoffice skill` aus einem Terminal.

## Was er in der App erreichen kann

Der Server ist nicht auf Dateien auf der Festplatte beschränkt. Solange GenOffice läuft, kann der Agent auch durch das Fenster arbeiten:

- **`open_in_genoffice`** öffnet eine Datei in einem Tab und holt ihn in den Vordergrund.
- **`open_documents`** listet jedes Dokument auf, das Sie geöffnet haben — id, Typ, Pfad und ob es ungespeicherte Änderungen gibt —, und liest dann den aktuellen Inhalt eines Dokuments, speichert es an Ort und Stelle, oder schließt es, wobei vorher gesichert wird, sofern Sie es nicht dem Verwerfen überlassen.
- **Die Inhaltswerkzeuge** nehmen diese id (oder den Pfad) als ihr `document`-Argument, sodass eine Änderung in dem Tab landet, den Sie ohnehin geöffnet haben, und das Fenster darauf umschaltet.

Zwei Dinge bleiben außer Reichweite: Es gibt keinen KI-Bereich, und der Aktualisierungsdialog in der App gilt hierfür nicht.

## Der Bereich „Lokaler HTTP-Server“

Unter **Lokaler HTTP-Server** betreibt die App den Server selbst, statt ihn dem Assistenten zu überlassen: ein Schalter zum Aktivieren, ein Feld **Port**, eine Anzeige **Läuft / Gestoppt** und **Hintergrund-Generierung** (Dokumente direkt an einen Pfad schreiben, ohne die Oberfläche zu öffnen) sowie ein **Beispielkonfiguration für Clients** zum Kopieren. **Erweitert** fügt die beiden Verbindungsadressen — Streamable HTTP und die ältere SSE-Adresse —, eine **Zustandsprüfung**-URL und einen Schalter für die **Protokollierung** hinzu, der Server- und Werkzeugaktivität in einer lokalen Datei aufzeichnet, die Sie von dort **Öffnen**, **Aktualisieren** oder **Leeren** können. Er lauscht nur auf localhost.
