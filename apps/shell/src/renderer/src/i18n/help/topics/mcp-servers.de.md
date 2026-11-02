# MCP-Server verbinden

Ein MCP-Server ist ein Dienst, der der KI Werkzeuge von außerhalb der App zur Verfügung stellt, etwa die Suche nach Gesetzen oder in Material, das Ihr Team betreibt. Sobald Sie einen Server verbunden haben, können die KI-Bereiche in GenOffice seine Werkzeuge während eines Gesprächs aufrufen. Sie entscheiden Werkzeug für Werkzeug, was die KI verwenden darf und wie.

## Server hinzufügen

1. Öffnen Sie **Einstellungen ▸ Integrationen** und klicken Sie auf der Karte **MCP-Server** auf **Server hinzufügen**.
2. Wählen Sie, wie Sie ihn hinzufügen.
   - **Einstellungstext einfügen**: Fügen Sie den ganzen Einstellungstext aus der Anleitung des Servers ein und klicken Sie auf **Lesen**. GenOffice füllt die Felder aus. Enthält ein Text mehrere Server, bestätigen Sie sie nacheinander. Liest der Text einen Schlüssel oder Wert aus einer PC-Variablen (`${NAME}`), bleibt dieses Feld leer und Sie tragen den Wert selbst ein.
   - **Selbst eingeben**: Geben Sie einen Namen und die Adresse ein. Wenn die Anleitung des Servers einen Schlüssel nennt, tragen Sie ihn ins Feld **Schlüssel (optional)** ein.
3. Lesen Sie den Hinweis über der Schaltfläche zum Hinzufügen und klicken Sie auf **Hinzufügen**.
4. Nach dem Hinzufügen prüft GenOffice die Verbindung sofort und holt die Werkzeugliste. Ein Server, der eine Anmeldung braucht, wartet auf Sie, statt den Browser zu öffnen. Klicken Sie auf **Verbindung prüfen**, um die Liste der Werkzeuge des Servers zu sehen. Braucht der Server eine Anmeldung, klicken Sie auf **Im Browser anmelden** und schließen Sie die Anmeldung dort ab.

Ein Servername besteht aus Buchstaben, Ziffern, `-` und `_` und ist höchstens 24 Zeichen lang. Die KI sieht die Werkzeuge dieses Servers unter Namen der Form `mcp__name__tool`. Ruft ein Skill Werkzeuge unter Namen dieser Form auf, fügen Sie den Server unter demselben Namen hinzu, den der Skill verwendet.

## Server über Adresse und Server auf diesem PC

- Ein Server **über Adresse** wird über eine Webadresse erreicht. Internetadressen müssen mit `https://` beginnen. `http://` funktioniert nur für diesen PC und für Adressen in privaten Netzwerken zu Hause oder im Büro, und Sie bestätigen vorher, dass Schlüssel und Dokumentinhalte unverschlüsselt übertragen werden.
- Ein Server **auf diesem PC** ist ein Programm, das GenOffice auf diesem PC ausführt. Der Bildschirm zum Hinzufügen zeigt das genaue Programm, seine Argumente und die Namen der Umgebungsvariablen, die ihm übergeben werden. Es läuft zum ersten Mal erst, nachdem Sie auf **Ausführen erlauben** geklickt haben. Ändert sich der Befehl später, bleibt der Server gestoppt, bis Sie ihn erneut erlauben.
- Braucht ein Server auf diesem PC ein Programm, das dieser PC nicht hat (Node.js oder uv für Python-Server), fragt GenOffice auf der Serverkarte in den Einstellungen, ob es heruntergeladen werden soll. Die Downloadgröße wird angezeigt, und nichts wird heruntergeladen, bevor Sie auf **Herunterladen** klicken. Heruntergeladene Programme bleiben im Datenordner von GenOffice, und die Einstellungen Ihres PCs werden nicht geändert.
- Ein Server auf diesem PC startet bei Bedarf und stoppt nach 10 Minuten ohne Nutzung. Er stoppt auch, wenn Sie GenOffice schließen.

## Festlegen, was jedes Werkzeug darf

- Wählen Sie für jedes Werkzeug **Immer erlauben**, **Vorher fragen** oder **Nicht verwenden**.
- Anfangs stehen Werkzeuge, die der Server als rein lesend kennzeichnet, auf **Immer erlauben** und alle anderen auf **Vorher fragen**.
- Ruft die KI ein Werkzeug mit **Vorher fragen** auf, erscheint im KI-Bereich eine Karte. Sehen Sie sich an, was gesendet werden soll, und klicken Sie auf **Nur dieses Mal erlauben**, **In diesem Gespräch immer erlauben** oder **Blockieren**. Bis Sie klicken, läuft nichts. Wenn Sie die KI stoppen oder das Fenster schließen, gilt das als Blockieren.
- Ändert der Server die Beschreibung eines Werkzeugs oder die Werte, die es annimmt, zeigt dieses Werkzeug **Prüfung nötig** und bleibt für die KI verborgen, bis Sie sich die Änderung angesehen und auf **Änderung genehmigen** geklickt haben. Eine Änderung an den Hinweisen, die der Server der KI gibt, wird auf dieselbe Weise geprüft.
- Neue Werkzeuge eines Servers werden mit denselben Anfangseinstellungen eingeschaltet, und die Karte sowie die Schaltfläche im KI-Bereich zeigen **Neue Werkzeuge: n**. Die Markierung verschwindet, wenn Sie in den Einstellungen die Werkzeugliste dieses Servers öffnen.

## Server im KI-Bereich nutzen

- Server funktionieren in den KI-Bereichen der Editoren und in Ask AI auf der Startseite. Solange ein Server eingeschaltet ist, erscheint neben dem Eingabefeld die Schaltfläche **Verbundene Server**.
- Klicken Sie darauf, um den Status jedes Servers zu sehen und einen Server nur für dieses Gespräch aus- oder einzuschalten. Ein neues Gespräch beginnt mit allen Servern, die Sie in den Einstellungen eingeschaltet haben. Ein Server, dessen Verbindung nie geprüft wurde, zeigt **Noch nicht geprüft**; prüfen Sie sie in den Einstellungen, um seine Werkzeuge zu erhalten.
- Wenn Sie **KI darf Internet-Tools nutzen** unter **Einstellungen ▸ KI-Medien & Suche** ausschalten, entfallen auch alle Werkzeuge der MCP-Server.
- Erwartet ein Skill ein Werkzeug von einem Server, den Sie gerade nicht nutzen können, sagt die KI in ihrer Antwort, welchen Schritt sie nicht ausführen konnte. **Einstellungen ▸ Skills** zeigt außerdem neben dem Skill den Server, den er braucht.
- Auch das Agentenfenster kann die Werkzeuge eingeschalteter Server nutzen. Es gelten dieselben Berechtigungen, und eine Sitzung behält die Einstellungen, mit denen sie gestartet wurde. Siehe [Agentenmodus](help://agent-mode).

## Schützen, was ein Server zurückgibt

Jeder Server hat die Option **Rückgaben dieses Servers schützen**, anfangs eingeschaltet. Solange sie eingeschaltet ist, gilt: Sobald etwas, das dieser Server zurückgegeben hat, in einem Gespräch steht, stoppen für dieses Gespräch die Werkzeuge, die etwas aus der App heraussenden, etwa die Websuche, das Lesen einer Seite über ihre Adresse und die Werkzeuge anderer MCP-Server. Die Werkzeuge desselben Servers funktionieren weiter. Beginnen Sie ein neues Gespräch, um die anderen wieder zu nutzen. Für einen Server, der nur öffentliches Material liefert, können Sie die Option ausschalten.

Das Agentenfenster kann diesen Schutz nicht einhalten. Startet eine Sitzung mit einem solchen Server, weist das Fenster Sie darauf hin.

## Was wohin gelangt

- Ruft die KI ein Werkzeug auf, geht ein von der KI gewählter Text an diesen Server. Er kann Inhalte aus dem geöffneten Dokument und aus Anhängen enthalten. Teile, die vor der KI verborgen sind, bleiben verborgen.
- Was der Server zurückgibt, geht an den KI-Anbieter, den Sie verwenden. Fügen Sie nur Server hinzu, deren Betreibern Sie vertrauen.
- Schlüssel, Anmeldungen und Werte von Umgebungsvariablen werden auf diesem PC mit der Verschlüsselung Ihres Betriebssystems aufbewahrt. Kann dieser PC sie nicht verschlüsseln, werden sie nur bis zum Schließen der App gemerkt.
- Beim Entfernen eines Servers werden seine Schlüssel und seine Anmeldung gelöscht, und der Server wird gebeten, die Anmeldung zu beenden, wenn er das unterstützt.
