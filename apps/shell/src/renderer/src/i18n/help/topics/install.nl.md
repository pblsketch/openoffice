# GenOffice installeren

Elke versie wordt gepubliceerd op de [Releases-pagina](https://github.com/pblsketch/openoffice/releases/latest) van het project op GitHub. Deze versie wordt uitgebracht voor Windows.

## Kies het bestand voor je computer

| Platform    | Vereisten                                | Bestand                         |
| ----------- | ---------------------------------------- | ------------------------------- |
| **Windows** | Windows 10 of nieuwer, 64-bits Intel/AMD | `GenOffice-Setup-<version>.exe` |

Oudere versies blijven op de Releases-pagina staan.

## Op Windows

1. Download `GenOffice-Setup-<version>.exe` van de Releases-pagina.
2. Voer het uit. Het installatieprogramma heeft geen digitale handtekening, dus Windows kan eerst een blauw venster "Uw pc wordt beschermd" tonen. Kies **Meer informatie** en daarna **Toch uitvoeren**. De precieze tekst hangt af van je Windows-versie.
3. Volg het installatieprogramma tot het einde.

Het zet GenOffice in het Startmenu en registreert `.docx`, `.xlsx`, `.pptx`, `.pdf` en soortgelijke, zodat een dubbelklik op een bestand het opent.

Omdat het installatieprogramma niet is ondertekend, voer je alleen een exemplaar uit dat je van de Releases-pagina hierboven hebt gedownload.

## Updates

- GenOffice zoekt op dezelfde Releases-pagina op GitHub naar een nieuwere versie. Zodra er een is gepubliceerd, biedt **Instellingen ▸ Over** die aan: druk op **Bijwerken naar …**, wacht tot de download klaar is en druk dan op **Herstarten en installeren**.
- **Menu (☰) ▸ Controleren op updates…** controleert wanneer jij dat wilt. Op een Mac is het **Help ▸ Controleren op updates…**.
- Mislukt de controle — geen netwerk, of er is nog niets gepubliceerd — dan gebeurt er niets en blijft de app werken zoals voorheen.
- **Updatekanaal**, ook onder Instellingen ▸ Over, staat op Stabiel of Bèta. Wijzigen gaat meteen in en controleert op een update; een Bèta-installatie wordt niet teruggezet naar Stabiel.
- Ook updates hebben geen digitale handtekening. Vóór het installeren vergelijkt de app het gedownloade bestand met de controlesom die bij die release is gepubliceerd.

## De build die je draait

**Instellingen ▸ Over** is waar de app meldt welke versie je hebt, welk kanaal hij volgt en waar het project woont. Daar staat ook op welk opensourceproject deze app is gebaseerd.

## De opdrachtregel zit erbij

Elke installatie bevat een `ieumoffice`-commando dat met dezelfde engines praat als het venster, zodat de twee nooit over een bestand het oneens zijn. `ieumoffice install-cli` zet het in je `PATH`. Wat het kan doen, lees je in [Opdrachtregel en agents](help://cli).
