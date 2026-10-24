# Skills

Ein Skill ist eine Arbeitsanleitung für die KI. Schreiben Sie einmal auf, was Sie immer wieder tun — die Schritte, mit denen Sie Besprechungsnotizen aufräumen, den Ton eines Berichts, die Punkte, die jedes Mal zu prüfen sind —, und Sie können ihn im KI-Bereich aufrufen, oder die KI greift von selbst darauf zurück, wenn er passt. Ein Skill ist ein Ordner mit einer Datei `SKILL.md` in einem offenen Format; ein in GenOffice erstellter Skill funktioniert daher unverändert auch in Claude Code oder Codex.

## Skills ein- und ausschalten

**Einstellungen ▸ Skills** listet die Skills auf diesem PC auf, gruppiert nach ihrer Herkunft. Jeder Skill wird mit seinem Namen angezeigt, so wie Coding-Agenten es tun. Über das Suchfeld oben finden Sie einen Skill nach Name oder Beschreibung.

| Herkunft                 | Inhalt                                                                   | Anfangs |
| ------------------------ | ------------------------------------------------------------------------ | ------- |
| **Integriert**           | Die 5 Skills, die mit GenOffice geliefert werden                         | Ein     |
| **Meine Skills**         | Skills, die Sie hinzugefügt oder erstellt haben (`~/.ieumoffice/skills`) | Ein     |
| **Claude-Skills-Ordner** | Die Skills in `~/.claude/skills`                                         | Aus     |
| **Claude-Plugins**       | Die Skills installierter Claude-Plugins                                  | Aus     |
| **Codex-Skills-Ordner**  | Die Skills in `~/.agents/skills`                                         | Aus     |

- Der Schalter schaltet einen Skill ein oder aus. Dieselbe Einstellung gilt für den KI-Bereich jedes Editors, für Ask AI auf der Startseite und für das Agentenfenster.
- Wählen Sie für einen eingeschalteten Skill **KI entscheidet** oder **Nur auf Aufruf**. Anfangs ist KI entscheidet eingestellt. Bei Nur auf Aufruf wird der Skill nur verwendet, wenn Sie ihn selbst aufrufen.
- Skills aus verschiedenen Quellen können denselben Namen tragen. Die Herkunftsangabe in jeder Zeile unterscheidet sie.
- Das Mehr-Menü enthält **Inhalt ansehen**, **Bearbeiten** (nur meine Skills), **Exportieren (zip)** (nur meine Skills) und **Ordner öffnen**.
- **In den Papierkorb** verschiebt einen meiner Skills in den Papierkorb des Systems, wo Sie ihn wiederherstellen können.
- Ein integrierter Skill wird ausgeblendet statt entfernt: Wählen Sie **Ausblenden**. **Wieder einblenden** unten in der Liste holt ihn im ursprünglichen Zustand zurück.
- Um einen integrierten Skill oder einen aus einem anderen Programm zu ändern, wählen Sie **In meine Skills kopieren**. Die Kopie erscheint unter meinen Skills, und das Original wird ausgeschaltet.
- Wenn Sie einen Skill mit Vorlage exportieren, kommt das Vorlagendokument mit in die zip-Datei. Prüfen Sie vor dem Export, dass das Dokument keine persönlichen Daten enthält.

## Einen Skill hinzufügen

1. Klicken Sie unter **Einstellungen ▸ Skills** auf **Hinzufügen**.
2. Wählen Sie **Aus einem Ordner**, **Aus einer zip-Datei** oder **Über einen GitHub-Link**. Geben Sie für GitHub die Adresse eines öffentlichen Repositorys oder `owner/repo` ein und klicken Sie auf **Suchen**.
3. Prüfen Sie die gefundenen Skills in der Vorschau. Sie zeigt Anzahl und Größe der Dateien, ob Skripte enthalten sind, die Webadressen im Text und die Lizenzdatei.
4. Haken Sie nur die Skills an, die installiert werden sollen, und klicken Sie auf **Installieren**. Installierte Skills sind sofort eingeschaltet.

Unter der Vorschau steht immer: „Installieren Sie Skills nur aus Quellen, denen Sie vertrauen. Ein Skill gibt der KI Anweisungen und kann im Agent-Fenster Skripte ausführen.“ Lesen Sie einen Skill aus unbekannter Quelle, bevor Sie ihn installieren.

- Gibt es unter meinen Skills schon einen mit demselben Namen, wählen Sie in dieser Zeile **Ersetzen** oder **Überspringen**.
- Beim Herunterladen von GitHub verbindet sich GenOffice nur mit `github.com`, `api.github.com` und `codeload.github.com` und sendet keine Anmeldedaten. Ist das Archiv zu groß oder besteht es die Sicherheitsprüfungen nicht, wird nichts installiert.
- **Neuer Skill** öffnet einen leeren Editor, in dem Sie Name, Beschreibung und Anleitung selbst schreiben.

## Nach Updates suchen

- Bei einem von GitHub installierten Skill sucht **Nach Updates suchen** im Mehr-Menü nach neuen Inhalten. GitHub wird nur kontaktiert, wenn Sie darauf klicken.
- Hat sich nichts geändert, erscheint „Aktuell“. Hat sich etwas geändert, prüfen Sie die geänderten Dateien und die Vorschau und klicken dann auf **Aktualisieren**.
- Haben Sie den Skill nach der Installation selbst bearbeitet, erscheint zusätzlich „Ihre eigenen Änderungen gehen verloren“.
- Beim Aktualisieren bleiben der Ein/Aus-Zustand des Skills und die Wahl zwischen KI entscheidet und Nur auf Aufruf erhalten.

## Einen Skill im KI-Bereich aufrufen

1. Tippen Sie `/` oder `$` am Anfang des KI-Eingabefelds oder direkt nach einem Leerzeichen. Die Liste der eingeschalteten Skills erscheint.
2. Tippen Sie weiter, um die Liste einzugrenzen. Zum Beispiel findet `/meet` den Skill `meeting-minutes`. Wörter aus der Beschreibung funktionieren auch, also findet ihn auch `/bespr`.
3. Wählen Sie einen Skill mit den Pfeiltasten und drücken Sie Enter oder Tab. Der Skill wird zu einem Chip über dem Eingabefeld.
4. Schreiben Sie, was Sie möchten, und senden Sie. GenOffice fügt den Inhalt des Skills der Anfrage hinzu.

- Im KI-Bereich von Excel öffnet `$` die Liste nur ganz am Anfang des Eingabefelds, damit es Zelladressen wie `$A$1` nicht in die Quere kommt.
- Sie können mehrere Chips hinzufügen und einen mit × entfernen. Esc schließt nur die Liste; einen laufenden KI-Vorgang hält es nicht an.
- **Skills verwalten…** unten in der Liste öffnet **Einstellungen ▸ Skills**.
- Chips bleiben an der gesendeten Nachricht und im gespeicherten Chat erhalten. Wenn Sie einen Chat wieder öffnen und erneut senden, wird der aktuelle Inhalt des Skills neu gelesen. Ein Skill, der zwischenzeitlich entfernt oder ausgeschaltet wurde, erscheint auf seinem Chip als „Nicht verfügbar“.
- Ist der mitzusendende Skill-Text zu lang, erscheint „Die Skills sind zu groß, um mitgesendet zu werden“, und es wird nichts gesendet.

## Skills, die die KI von selbst nutzt

- Für eingeschaltete Skills mit KI entscheidet erhält die KI Namen und Beschreibungen als Liste. Passt einer zur Anfrage, holt sich die KI dessen Inhalt und nutzt ihn.
- Wenn die KI einen Skill nutzt, steht im Chat „Skill 〈Name〉 verwendet“.
- Ob sie einen Skill nutzt, entscheidet die KI anhand der Beschreibung. Eine Beschreibung, die sagt, wofür der Skill gedacht ist, hilft ihr bei der Wahl.

## Einen Skill auf Zuruf erstellen

1. Sagen Sie im KI-Bereich etwa „Speichere, was wir gerade gemacht haben, als Skill“ oder „Erstelle einen Skill, der Berichte in unserem Hausstil schreibt“.
2. Die KI zieht die Schritte und Regeln heraus, die sich zu wiederholen lohnen, und zeigt eine Karte **Neuer Skill**. Werte, die nur dieses eine Mal gebraucht wurden, etwa Namen und Daten, bleiben aus der Anleitung heraus.
3. Prüfen und bearbeiten Sie Name, Beschreibung und Anleitung auf der Karte. Der Name erscheint in der Skill-Liste, und Sie tippen ihn nach `/`: englische Kleinbuchstaben, Ziffern und Bindestriche.
4. Klicken Sie auf **Speichern**. Der neue Skill wird zu meinen Skills hinzugefügt, eingeschaltet und erscheint sofort in der `/`-Liste.

- Bis Sie auf **Speichern** klicken, wird keine Datei geschrieben. Klicken Sie auf **Abbrechen**, behält der Chat ihn nur als „Nicht gespeicherter Skill-Vorschlag“.
- Sie können auch darum bitten, einen vorhandenen Skill zu ändern, etwa „Passe den Protokoll-Skill an unsere Arbeitsweise an“. Die Karte heißt dann **Skill ändern**. Einer meiner Skills wird mit **Ersetzen** überschrieben; ein integrierter Skill oder einer aus einem anderen Programm wird als Kopie unter meinen Skills gespeichert, und das Original wird ausgeschaltet.

## Ein Dokument als Vorlage mitgeben

Wenn Sie im KI-Bereich eines Editors einen Skill erstellen, kann das aktuelle Dokument als Vorlage mitgehen. Haken Sie auf der Karte **Dieses Dokument als Vorlage mitspeichern** an, dann werden aus der Schaltfläche zwei.

- **Leere Vorlage erstellen**: Eine Kopie des Dokuments öffnet sich in einem neuen Tab „Vorlagenvorschau - 〈Titel〉“, und die KI in diesem Tab leert die ausgefüllten Werte wie Namen, Daten und persönliche Angaben. Sehen Sie den Tab durch, ändern Sie bei Bedarf von Hand weiter und klicken Sie dann auf **Diesen Tab als Vorlage speichern**; der Tab in genau diesem Zustand wird zur Vorlage.
- **Dokument unverändert speichern**: speichert das aktuelle Dokument ohne Änderung als Vorlage. Enthält das Dokument Stellen, die Sie vor der KI verborgen haben, ist diese Schaltfläche gesperrt, damit verborgene Inhalte nicht unverändert in die Vorlage gelangen.
- Die Vorlage wird als Kopie des Dokuments im Skill-Ordner aufbewahrt. Das Originaldokument ändert sich nicht.

## Einen Skill mit Vorlage verwenden

- Ein Skill mit Vorlage zeigt in der Liste **Mit Vorlage**.
- Rufen Sie ihn als Chip auf und senden Sie, öffnet sich eine Kopie der Vorlage als neues, unbenanntes Dokument; die KI in diesem Tab arbeitet Ihre Anfrage weiter ab. Im ursprünglichen Bereich bleiben „Die Vorlage wird in einem neuen Tab bearbeitet“ und **Zum Tab** stehen.
- Wählt die KI einen Skill mit Vorlage von selbst, öffnet sich nicht sofort ein Tab. Stattdessen zeigt der Chat die Schaltfläche **Neues Dokument aus dieser Vorlage öffnen**.
- Wo das neue Dokument abgelegt wird, bestimmen Sie meist beim ersten Speichern. Die Markdown- und HTML-Editoren speichern wie gewohnt im Standardordner. Die Vorlagendatei selbst bleibt, wie sie war.

## Skills mit Skripten

- Im normalen KI-Bereich und bei Ask AI auf der Startseite laufen die Skripte eines Skills nie. Nur der Text des Skills erreicht die KI.
- Ein Skill mit Skripten zeigt **Mit Skripten · funktioniert vollständig im Agent-Fenster**, und wenn Sie ihn als Chip hinzufügen, erscheint „Die Skripte dieses Skills laufen im normalen KI-Bereich nicht“. Das Senden wird nicht blockiert.
- Um auch die Skripte zu nutzen, rufen Sie den Skill im Agentenfenster auf. Siehe [Agentenmodus](help://agent-mode).

## Integrierte Skills

| Skill             | Was er tut                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| `meeting-minutes` | Macht aus Besprechungsnotizen ein Protokoll, das Beschlüsse und Aufgaben zeigt   |
| `internal-comms`  | Schreibt Mitteilungen, Newsletter, Statusberichte, FAQs und andere interne Texte |
| `humanizer`       | Findet Formulierungen, die nach KI klingen, und macht sie natürlich              |
| `copy-editing`    | Geht einen fertigen englischen Text durch und macht ihn klarer und knapper       |
| `find-skills`     | Findet im Agentenfenster benötigte Skills und schlägt ihre Installation vor      |

`copy-editing` ist für englische Marketingtexte gedacht. `find-skills` funktioniert nur im Agentenfenster.

## Im Agentenfenster

- Das Agentenfenster folgt denselben Ein/Aus-Einstellungen unter **Einstellungen ▸ Skills**, und Skills rufen Sie in seinem Eingabefeld genauso mit `/` oder `$` auf.
- Skills in `.claude/skills` und `.agents/skills` des Projektordners werden in dieser Sitzung verwendet, ohne dass sie eingeschaltet sein müssen.
- Die Skill-Liste wird beim Start der Sitzung festgelegt. Schalten Sie während einer Sitzung Skills ein oder aus, erscheint „Geänderte Skills gelten ab der nächsten Sitzung“.
- Erstellt der Agent einen Skill, erscheint dieselbe Karte im Fenster. Als Vorlage wählen Sie aus den in Tabs geöffneten Dokumenten und den Dateien im Projektordner.
- Findet der Agent einen Skill, der sich zu installieren lohnt, erscheint ein Installationsvorschlag. Öffnen Sie ihn mit **Vorschau öffnen** und klicken Sie selbst auf **Installieren**; sonst wird nichts installiert. Ein installierter Skill ist ab der nächsten Sitzung verfügbar.
