# GenOffice installieren

Jede Version wird auf der [Releases-Seite](https://github.com/pblsketch/openoffice/releases/latest) des Projekts auf GitHub veröffentlicht. Zur Windows-Version gibt es Mac- und Linux-Versionen, die als Beta erscheinen. Die Mac- und Linux-Versionen kann der Entwickler nicht selbst testen; sie werden anhand von Rückmeldungen der Nutzer bestätigt.

## Die Datei für Ihren Rechner wählen

| Plattform                                | Voraussetzungen                         | Datei                             |
| ---------------------------------------- | --------------------------------------- | --------------------------------- |
| **Windows**                              | Windows 10 oder neuer, 64-Bit Intel/AMD | `GenOffice-Setup-<version>.exe`   |
| **Mac (Beta)**, Apple Silicon            | macOS 12 oder neuer, Chip M1 oder neuer | `GenOffice-<version>-arm64.dmg`   |
| **Mac (Beta)**, Intel                    | macOS 12 oder neuer, Intel-Prozessor    | `GenOffice-<version>-x64.dmg`     |
| **Linux (Beta)**, jede Distribution      | 64-Bit (x86_64)                         | `GenOffice-<version>.AppImage`    |
| **Linux (Beta)**, Ubuntu-/Debian-Familie | 64-Bit (x86_64)                         | `ieumoffice_<version>_amd64.deb`  |
| **Linux (Beta)**, Fedora/RHEL/openSUSE   | 64-Bit (x86_64)                         | `ieumoffice-<version>.x86_64.rpm` |

Welchen Mac Sie haben, sehen Sie im Apple-Menü unter **Über diesen Mac**. Steht bei „Chip“ Apple M…, nehmen Sie die Datei, die auf `-arm64.dmg` endet; steht bei „Prozessor“ Intel …, die Datei, die auf `-x64.dmg` endet. Die übrigen Dateien auf der Releases-Seite (`.zip`, `.yml`, `.blockmap`) verwendet die App selbst für Updates; Sie müssen sie nicht herunterladen. Ältere Versionen bleiben auf der Releases-Seite.

## Unter Windows

1. Laden Sie `GenOffice-Setup-<version>.exe` von der Releases-Seite herunter.
2. Führen Sie die Datei aus. Das Installationsprogramm ist nicht codesigniert; Windows zeigt deshalb möglicherweise zuerst ein blaues Fenster „Der Computer wurde durch Windows geschützt“. Wählen Sie **Weitere Informationen** und dann **Trotzdem ausführen**. Der genaue Wortlaut hängt von Ihrer Windows-Version ab.
3. Folgen Sie dem Installationsprogramm bis zum Ende.

Es legt GenOffice im Startmenü ab und registriert `.docx`, `.xlsx`, `.pptx`, `.pdf` und Verwandte, sodass ein Doppelklick auf eine Datei sie öffnet.

Weil das Installationsprogramm nicht signiert ist, führen Sie nur eines aus, das Sie von der oben genannten Releases-Seite heruntergeladen haben.

## Wenn Windows den Download oder die Installation blockiert

### Edge meldet, die Datei werde „nicht häufig heruntergeladen“

So warnt Microsoft Defender SmartScreen vor einer Datei, die bisher nur wenige Menschen heruntergeladen haben. Laut der Anleitung von Microsoft behalten Sie die Datei so:

1. Öffnen Sie die Download-Liste von Edge (**Strg+J**), klicken Sie neben der Datei auf **…** und wählen Sie **Beibehalten**.
2. Klicken Sie in dem Fenster, das sich öffnet, auf **Mehr anzeigen** und dann auf **Trotzdem beibehalten**. Die Datei bleibt in Ihrem Ordner „Downloads“.

Dieses Fenster hat außerdem eine Schaltfläche, mit der Sie die Datei als sicher melden. Sie öffnet nur die Meldeseite von Microsoft (`feedback.smartscreen.microsoft.com`) und behält die Datei nicht. Schließen Sie diese Seite und klicken Sie stattdessen im Fenster auf **Mehr anzeigen**.

Fehlt im Fenster **Mehr anzeigen** oder **Trotzdem beibehalten**:

- Auf einem PC, den eine Schule oder Firma verwaltet, kann der Administrator das Übergehen dieser Warnungen abschalten (eine Edge-Richtlinie). Dann kann niemand auf diesem PC die Datei behalten; bitten Sie den Administrator, sie zu installieren oder freizugeben.
- Wenn Sie die Datei in einem anderen Browser von der Releases-Seite herunterladen, erhalten Sie dieselbe Datei.
- Hilft beides nicht und ist es Ihr eigener PC, erlaubt die Microsoft-Anleitung zur Behebung von Downloadproblemen als letzten Ausweg, Microsoft Defender SmartScreen kurz auszuschalten: Öffnen Sie in Edge **Einstellungen und mehr (…) ▸ Einstellungen ▸ Datenschutz, Suche und Dienste ▸ Sicherheit**, schalten Sie **Microsoft Defender SmartScreen** aus, laden Sie die Datei erneut herunter und schalten Sie es sofort wieder ein. Solange es aus ist, warnt Edge weder bei Downloads noch vor gefährlichen Websites wie Phishing-Seiten.

### Ein Fenster „Der Computer wurde durch Windows geschützt“ erscheint

Microsoft Defender SmartScreen zeigt dieses Fenster, wenn es ein nicht signiertes Installationsprogramm zum ersten Mal sieht. Klicken Sie auf **Weitere Informationen**, dann erscheint die Schaltfläche **Trotzdem ausführen**. Auf einem PC, den eine Schule oder Firma verwaltet, kann eine Administratoreinstellung diese Schaltfläche ausblenden; wenden Sie sich dann an den Administrator.

### Die Intelligente App-Steuerung blockiert es

Ist die Intelligente App-Steuerung von Windows 11 eingeschaltet, hält sie nicht signierte Installationsprogramme an und bietet keinen Weg über **Weitere Informationen** an. Laut Microsoft lässt sich keine einzelne App zulassen: Die einzige Möglichkeit ist, die Intelligente App-Steuerung unter **Windows-Sicherheit ▸ App- & Browsersteuerung ▸ Einstellungen für intelligente App-Steuerung** auszuschalten. Dadurch entfällt dieser Schutz auch für alle anderen Apps. Mit aktuellen Windows-Updates lässt sie sich wieder einschalten, ohne Windows neu zu installieren.

## Auf einem Mac (Beta)

Sie benötigen macOS 12 (Monterey) oder neuer. Die Mac-Version hat keine Entwicklersignatur von Apple. Deshalb meldet macOS beim ersten Öffnen, es könne nicht überprüfen, ob die App frei von Schadsoftware ist, und öffnet sie nicht. Erlauben Sie sie einmalig, wie unten beschrieben.

1. Öffnen Sie die dmg-Datei und ziehen Sie `GenOffice.app` in den Ordner **Programme**.
2. Öffnen Sie GenOffice aus dem Ordner „Programme“. Wenn die Warnung erscheint, klicken Sie auf **Fertig**.
3. Öffnen Sie **Systemeinstellungen ▸ Datenschutz & Sicherheit**. Klicken Sie weiter unten neben der Zeile, die besagt, dass GenOffice blockiert wurde, auf **Dennoch öffnen** und geben Sie Ihr Mac-Passwort ein. Die Schaltfläche erscheint etwa eine Stunde lang, nachdem Sie versucht haben, die App zu öffnen.
4. Klicken Sie im erneut erscheinenden Fenster auf **Öffnen**. Danach öffnet sie sich ohne Warnung.

Unter macOS 12 finden Sie die Stelle unter **Systemeinstellungen ▸ Sicherheit ▸ Allgemein**, und die Schaltfläche heißt dort ebenfalls **Dennoch öffnen**.

Meldet macOS, die App „ist beschädigt und kann nicht geöffnet werden“, legen Sie sie nicht in den Papierkorb. Führen Sie die Zeile unten im Terminal aus, öffnen Sie die App erneut und erlauben Sie sie wie oben. Sie entfernt die Markierung, die macOS an aus dem Internet geladene Dateien anhängt.

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

Meldet macOS, die App werde auf diesem Mac nicht unterstützt, prüfen Sie zwei Dinge:

- Ein Intel-Mac kann die Datei für Apple Silicon (`-arm64.dmg`) nicht ausführen. Sehen Sie unter **Über diesen Mac** bei „Prozessor“ nach, löschen Sie die installierte App und installieren Sie stattdessen die Datei `-x64.dmg`.
- Unter macOS 11 oder älter läuft GenOffice nicht. **Über diesen Mac** zeigt auch die macOS-Version.

Außerdem auf dem Mac:

- Die KI-Verbindungskarten haben keine Installationsschaltfläche. Folgen Sie dem Link zur offiziellen Installationsanleitung auf der Karte, um Claude Code oder Codex zu installieren. Die Claude-Desktop-App ist nicht Claude Code, daher muss Claude Code auch dann eigens installiert werden, wenn die Desktop-App vorhanden ist.
- Die Anmeldung wird im Browser abgeschlossen. Fordert der Browser Sie auf, einen Code einzufügen, führen Sie `claude auth login` oder `codex login` selbst im Terminal aus. Siehe [Abonnement-Verbindung](help://subscription).

## Unter Linux (Beta)

- **AppImage**: Machen Sie die Datei ausführbar (`chmod +x GenOffice-<version>.AppImage`) und starten Sie sie. Es gibt keinen Installationsschritt.
- **deb**: Installieren Sie mit `sudo apt install ./ieumoffice_<version>_amd64.deb`.
- **rpm**: Installieren Sie mit `sudo dnf install ./ieumoffice-<version>.x86_64.rpm`. Unter openSUSE verwenden Sie `sudo zypper install ./ieumoffice-<version>.x86_64.rpm`.

Die Pakete deb und rpm werden nach `/opt/GenOffice` installiert und verknüpfen den Terminal-Befehl `/usr/bin/ieumoffice`. Wie auf dem Mac haben die KI-Verbindungskarten keine Installationsschaltfläche, und wenn eine Anmeldung nach einem Code fragt, führen Sie `claude auth login` oder `codex login` selbst in einem Terminal aus.

## Updates

- GenOffice sucht auf derselben GitHub-Releases-Seite nach einer neueren Version. Sobald eine veröffentlicht ist, bietet **Einstellungen ▸ Über** sie an: Klicken Sie auf **Auf … aktualisieren**, warten Sie den Download ab und klicken Sie dann auf **Neustarten & installieren**. Unter Windows zeigt ein Fenster den Installationsfortschritt; danach öffnet sich GenOffice wieder mit den Dokumenten, die Sie geöffnet hatten. Auf dem Mac wird die App geschlossen, durch die neue Version ersetzt und mit den geöffneten Dokumenten wieder geöffnet. Das gilt für eine App im Ordner „Programme“; eine direkt aus dem Disk-Image geöffnete App verweist stattdessen auf die Download-Seite. Das Update wird nur installiert, wenn Sie diese Schaltfläche drücken, nicht beim bloßen Schließen der App.
- Unter Linux aktualisiert sich nur das AppImage selbst. Bei einer Installation per deb oder rpm weist die App auf die neue Version hin und öffnet die Download-Seite; installieren Sie die neue Datei auf dieselbe Weise.
- **Menü (☰) ▸ Nach Updates suchen** prüft, wann immer Sie möchten. Auf dem Mac ist es **Hilfe ▸ Nach Updates suchen**.
- Schlägt die Prüfung fehl — kein Netz oder noch nichts veröffentlicht —, passiert nichts, und die App arbeitet weiter wie zuvor.
- **Update-Kanal**, ebenfalls unter Einstellungen ▸ Über, ist Stabil oder Beta. Eine Änderung wirkt sofort und prüft auf ein Update; eine Beta-Installation wird nicht auf Stabil zurückgestuft.
- Auch Updates sind nicht codesigniert. Vor der Installation vergleicht die App die heruntergeladene Datei mit der Prüfsumme, die mit dieser Version veröffentlicht wurde.
- Wenn **Neustarten & installieren** die App schließt, die neue Version aber nicht erscheint, meldet der nächste Start das und bietet das Update erneut an. Diesmal öffnet sich das Installationsprogramm in einem eigenen Fenster, sodass Sie es verfolgen und eine Administratorabfrage beantworten können. Klappt auch das nicht, verweist das Update-Fenster auf die Download-Seite; eine Installation mit der Datei von dort behält Ihre Einstellungen und Dokumente. Was der Updater getan hat, steht in `update-log.txt` im Datenordner der App (geben Sie `%APPDATA%\GenOffice` in die Adressleiste des Datei-Explorers ein, um ihn zu öffnen). Hängen Sie diese Datei an, wenn Sie das Problem melden.

## Der Build, den Sie ausführen

**Einstellungen ▸ Über** ist der Ort, an dem die App meldet, welche Version Sie haben, welchem Kanal sie folgt und wo das Projekt zu Hause ist. Dort steht auch, auf welchem Open-Source-Projekt diese App basiert.

## Die Kommandozeile ist dabei

Jede Installation bringt den Befehl `ieumoffice` mit, der mit denselben Engines spricht wie das Fenster: Die beiden können sich bei einer Datei also nicht widersprechen. `ieumoffice install-cli` legt ihn in Ihren `PATH`. Was er kann, steht in [Kommandozeile und Agenten](help://cli).
