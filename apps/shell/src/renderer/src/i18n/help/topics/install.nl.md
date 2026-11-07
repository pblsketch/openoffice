# GenOffice installeren

Elke versie wordt gepubliceerd op de [Releases-pagina](https://github.com/pblsketch/openoffice/releases/latest) van het project op GitHub. De Windows-versie wordt gepubliceerd samen met Mac- en Linux-versies, die als bèta worden uitgebracht. De ontwikkelaar kan de Mac- en Linux-versies niet rechtstreeks testen; ze worden bevestigd via meldingen van gebruikers.

## Kies het bestand voor je computer

| Platform                                | Vereisten                                | Bestand                           |
| --------------------------------------- | ---------------------------------------- | --------------------------------- |
| **Windows**                             | Windows 10 of nieuwer, 64-bits Intel/AMD | `GenOffice-Setup-<version>.exe`   |
| **Mac (bèta)**, Apple Silicon           | macOS 12 of nieuwer, M1-chip of nieuwer  | `GenOffice-<version>-arm64.dmg`   |
| **Mac (bèta)**, Intel                   | macOS 12 of nieuwer, Intel-processor     | `GenOffice-<version>-x64.dmg`     |
| **Linux (bèta)**, elke distributie      | 64-bits (x86_64)                         | `GenOffice-<version>.AppImage`    |
| **Linux (bèta)**, Ubuntu/Debian-familie | 64-bits (x86_64)                         | `ieumoffice_<version>_amd64.deb`  |
| **Linux (bèta)**, Fedora/RHEL/openSUSE  | 64-bits (x86_64)                         | `ieumoffice-<version>.x86_64.rpm` |

Om te zien welke Mac je hebt, open je het Apple-menu ▸ **Over deze Mac**. Staat bij "Chip" Apple M…, neem dan het bestand dat eindigt op `-arm64.dmg`; staat bij "Processor" Intel …, neem dan het bestand dat eindigt op `-x64.dmg`. De andere bestanden op de Releases-pagina (`.zip`, `.yml`, `.blockmap`) gebruikt de app zelf om bij te werken; die hoef je niet te downloaden. Oudere versies blijven op de Releases-pagina staan.

## Op Windows

1. Download `GenOffice-Setup-<version>.exe` van de Releases-pagina.
2. Voer het uit. Het installatieprogramma heeft geen digitale handtekening, dus Windows kan eerst een blauw venster "Uw pc wordt beschermd" tonen. Kies **Meer informatie** en daarna **Toch uitvoeren**. De precieze tekst hangt af van je Windows-versie.
3. Volg het installatieprogramma tot het einde.

Het zet GenOffice in het Startmenu en registreert `.docx`, `.xlsx`, `.pptx`, `.pdf` en soortgelijke, zodat een dubbelklik op een bestand het opent.

Omdat het installatieprogramma niet is ondertekend, voer je alleen een exemplaar uit dat je van de Releases-pagina hierboven hebt gedownload.

## Als Windows de download of de installatie blokkeert

### Edge zegt dat het bestand "niet vaak wordt gedownload"

Microsoft Defender SmartScreen waarschuwt zo voor een bestand dat het nog niet door veel mensen heeft zien downloaden. De handleiding van Microsoft om het bestand te behouden is:

1. Open de downloadlijst van Edge (**Ctrl+J**), druk naast het bestand op **…** en kies **Behouden**.
2. Druk in het venster dat opent op **Meer weergeven** en daarna op **Toch behouden**. Het bestand blijft in je map Downloads staan.

Dat venster heeft ook een knop die het bestand als veilig meldt. Die opent alleen de meldpagina van Microsoft (`feedback.smartscreen.microsoft.com`) en behoudt het bestand niet. Sluit die pagina en druk in plaats daarvan op **Meer weergeven** in het venster.

Heeft het venster geen **Meer weergeven** of geen **Toch behouden**:

- Op een pc die door een school of bedrijf wordt beheerd, kan de beheerder het overslaan van deze waarschuwingen uitschakelen (een Edge-beleid). Dan kan niemand op die pc het bestand behouden; vraag de beheerder het te installeren of toe te staan.
- Download je van de Releases-pagina in een andere browser, dan krijg je hetzelfde bestand.
- Helpt geen van beide en is het je eigen pc, dan staat de handleiding van Microsoft voor downloadproblemen als laatste redmiddel toe Microsoft Defender SmartScreen even uit te zetten: open in Edge **Instellingen en meer (…) ▸ Instellingen ▸ Privacy, zoeken en services ▸ Beveiliging**, zet **Microsoft Defender SmartScreen** uit, download het bestand opnieuw en zet het meteen weer aan. Zolang het uit staat, waarschuwt Edge je niet bij downloads en ook niet voor gevaarlijke sites zoals phishingpagina's.

### Er verschijnt een venster "Uw pc wordt beschermd"

Microsoft Defender SmartScreen toont dit venster de eerste keer dat het een installatieprogramma zonder handtekening ziet. Druk op **Meer informatie** en er verschijnt een knop **Toch uitvoeren**. Op een pc die door een school of bedrijf wordt beheerd, kan een beheerdersinstelling die knop verbergen; vraag het de beheerder.

### Slim app-beheer blokkeert het

Als Slim app-beheer van Windows 11 aan staat, houdt het installatieprogramma's zonder handtekening tegen en biedt het geen route via **Meer informatie**. Microsoft zegt dat er geen manier is om één enkele app toe te staan: de enige optie is Slim app-beheer uit te schakelen, onder **Windows-beveiliging ▸ App- en browserbeheer ▸ Instellingen voor Slim app-beheer**. Daarmee verdwijnt deze bescherming ook voor alle andere apps. Met recente Windows-updates kan het weer worden ingeschakeld zonder Windows opnieuw te installeren.

## Op een Mac (bèta)

Je hebt macOS 12 (Monterey) of nieuwer nodig. De Mac-versie heeft geen ontwikkelaarshandtekening van Apple, dus de eerste keer dat je hem opent, zegt macOS dat niet kan worden gecontroleerd of de app vrij is van malware en opent het hem niet. Sta hem eenmalig toe, zoals hieronder.

1. Open het dmg-bestand en sleep `GenOffice.app` naar de map **Programma's**.
2. Open GenOffice vanuit de map Programma's. Druk op **Gereed** wanneer de waarschuwing verschijnt.
3. Open **Systeeminstellingen ▸ Privacy en beveiliging**. Druk onderaan, naast de regel die zegt dat GenOffice is geblokkeerd, op **Open toch** en voer je Mac-wachtwoord in. De knop is ongeveer een uur zichtbaar nadat je de app probeerde te openen.
4. Druk in het venster dat opnieuw verschijnt op **Open**. Vanaf dan opent hij zonder waarschuwing.

Op macOS 12 is de plek **Systeemvoorkeuren ▸ Beveiliging en privacy ▸ Algemeen**, en daar heet de knop **Open toch**.

Zegt macOS dat de app "beschadigd is en niet kan worden geopend", verplaats hem dan niet naar de prullenmand. Voer de onderstaande regel uit in Terminal, open de app opnieuw en sta hem toe zoals hierboven. Die regel verwijdert de markering die macOS aan van internet gedownloade bestanden hangt.

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

Zegt macOS dat de app niet wordt ondersteund op deze Mac, controleer dan twee dingen:

- Een Intel-Mac kan het Apple Silicon-bestand (`-arm64.dmg`) niet uitvoeren. Kijk bij "Processor" onder **Over deze Mac**, verwijder de app die je hebt geïnstalleerd en installeer in plaats daarvan het `-x64.dmg`-bestand.
- macOS 11 of ouder kan GenOffice niet uitvoeren. **Over deze Mac** toont ook de macOS-versie.

Verder op een Mac:

- De AI-verbindingskaarten hebben geen installatieknop. Volg de link naar de officiële installatiegids op de kaart om Claude Code of Codex te installeren. De Claude-desktopapp is niet Claude Code, dus Claude Code moet je ook apart installeren als de desktopapp er al is.
- Inloggen wordt in de browser afgerond. Vraagt de browser je een code te plakken, voer dan zelf `claude auth login` of `codex login` uit in Terminal. Zie [Abonnementsverbinding](help://subscription).

## Op Linux (bèta)

- **AppImage**: maak het uitvoerbaar (`chmod +x GenOffice-<version>.AppImage`) en voer het bestand uit. Er is geen installatiestap.
- **deb**: installeer met `sudo apt install ./ieumoffice_<version>_amd64.deb`.
- **rpm**: installeer met `sudo dnf install ./ieumoffice-<version>.x86_64.rpm`. Gebruik op openSUSE `sudo zypper install ./ieumoffice-<version>.x86_64.rpm`.

De deb- en rpm-pakketten installeren naar `/opt/GenOffice` en koppelen het terminalcommando `/usr/bin/ieumoffice`. Net als op een Mac hebben de AI-verbindingskaarten geen installatieknop, en als inloggen om een code vraagt, voer je zelf `claude auth login` of `codex login` uit in een terminal.

## Updates

- GenOffice zoekt op dezelfde Releases-pagina op GitHub naar een nieuwere versie. Zodra er een is gepubliceerd, biedt **Instellingen ▸ Over** die aan: druk op **Bijwerken naar …**, wacht tot de download klaar is en druk dan op **Herstarten en installeren**. Op Windows toont een venster de voortgang van de installatie; daarna opent GenOffice opnieuw met de documenten die u open had. Op een Mac sluit de app, wordt die vervangen door de nieuwe versie en opent hij opnieuw met de documenten die u open had. Dat werkt voor een app in de map Apps; een app die rechtstreeks vanuit de schijfkopie is geopend, verwijst in plaats daarvan naar de downloadpagina. De update wordt alleen geïnstalleerd als u op die knop drukt, nooit bij het gewoon sluiten van de app.
- Op Linux werkt alleen de AppImage zichzelf bij. Bij een deb- of rpm-installatie meldt de app de nieuwe versie en opent hij de downloadpagina; installeer het nieuwe bestand op dezelfde manier.
- **Menu (☰) ▸ Controleren op updates…** controleert wanneer jij dat wilt. Op een Mac is het **Help ▸ Controleren op updates…**.
- Mislukt de controle — geen netwerk, of er is nog niets gepubliceerd — dan gebeurt er niets en blijft de app werken zoals voorheen.
- **Updatekanaal**, ook onder Instellingen ▸ Over, staat op Stabiel of Bèta. Wijzigen gaat meteen in en controleert op een update; een Bèta-installatie wordt niet teruggezet naar Stabiel.
- Ook updates hebben geen digitale handtekening. Vóór het installeren vergelijkt de app het gedownloade bestand met de controlesom die bij die release is gepubliceerd.
- Als **Herstarten en installeren** de app sluit maar de nieuwe versie niet verschijnt, meldt de volgende start dat en biedt de update opnieuw aan. Deze keer opent het installatieprogramma in een eigen venster, zodat u het kunt volgen en een vraag om beheerderstoestemming kunt beantwoorden. Lukt ook dat niet, dan verwijst het updatevenster naar de downloadpagina; installeren met het bestand van daar behoudt uw instellingen en documenten. Wat de updater heeft gedaan, staat in `update-log.txt` in de gegevensmap van de app (typ `%APPDATA%\GenOffice` in de adresbalk van Verkenner om die te openen). Voeg dat bestand toe wanneer u het probleem meldt.

## De build die je draait

**Instellingen ▸ Over** is waar de app meldt welke versie je hebt, welk kanaal hij volgt en waar het project woont. Daar staat ook op welk opensourceproject deze app is gebaseerd.

## De opdrachtregel zit erbij

Elke installatie bevat een `ieumoffice`-commando dat met dezelfde engines praat als het venster, zodat de twee nooit over een bestand het oneens zijn. `ieumoffice install-cli` zet het in je `PATH`. Wat het kan doen, lees je in [Opdrachtregel en agents](help://cli).
