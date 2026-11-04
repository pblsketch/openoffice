# Diagrammen: draw.io-bestanden tekenen en bewerken

De diagrameditor opent draw.io-bestanden in een tabblad. Je tekent er stroomdiagrammen, architectuurdiagrammen en andere diagrammen in, slaat ze op in het formaat waarin ze binnenkwamen, exporteert ze als afbeelding of PDF en laat de AI ze lezen, wijzigen en tekenen. De editor draait volledig op je pc.

## Een diagram openen

- De editor opent `.drawio`-, `.dio`-, `.drawio.svg`- en `.drawio.png`-bestanden: via het openvenster, door een bestand naar het venster te slepen, vanuit recente bestanden, de mappenstructuur of (voor `.drawio` en `.dio`) de lijst van Google Drive. In Windows wordt GenOffice na de installatie het programma voor `.drawio`- en `.dio`-bestanden.
- Een `.drawio.svg`- of `.drawio.png`-bestand gaat alleen open als het diagram in de afbeelding is opgeslagen. Een gewone SVG- of PNG-afbeelding wordt niet als diagram geopend. Beschadigde bestanden gaan ook niet open, en de reden wordt getoond.
- Een Visio-bestand (`.vsdx`) wordt geïmporteerd als een nieuw diagram zonder titel. Bij de eerste keer opslaan wordt een `.drawio`-bestand in de map van het Visio-bestand voorgesteld, en het Visio-bestand zelf blijft ongewijzigd. Konden sommige afbeeldingen erin niet worden omgezet, dan meldt de editor hoeveel. In Windows staan `.vsdx`-bestanden alleen onder "Openen met".
- Een nieuw, leeg diagram begin je met de tegel **Diagram** op Start of met Nieuw in het menu Bestand.
- Is het diagram al geopend, dan komt het tabblad ervan naar voren.

## Bewerken

- Het bewerkingsscherm is het draw.io-scherm zoals het is: de menu's bovenaan, de vormen links, het opmaakpaneel rechts en de paginatabbladen onderaan.
- Opslaan (Ctrl+S), Opslaan als (Ctrl+Shift+S) en Afdrukken (Ctrl+P) worden door GenOffice afgehandeld. Tussen tabbladen wisselen en de andere sneltoetsen van de hele app blijven werken. Alle andere sneltoetsen zijn die van de editor zelf, ook ongedaan maken (Ctrl+Z).
- **Help** (F1) in de menu's van de editor opent deze pagina.
- De editor gebruikt de taal van GenOffice. Wijzig je de taal, dan start de editor opnieuw: niet-opgeslagen wijzigingen blijven bewaard, maar de geschiedenis voor ongedaan maken gaat verloren.
- De editor volgt het thema van GenOffice. In het donkere thema wordt de tekening ook in donkere kleuren getoond, maar het opgeslagen bestand, PNG, PDF en afdrukken zijn precies hetzelfde als in het lichte thema.

## Opslaan

- Opslaan, Opslaan als, **Automatisch opslaan** in de statusbalk en de vraag voor het sluiten werken zoals in de andere editors.
- Een diagram wordt opgeslagen in het formaat waarin het is geopend. Opslaan als biedt `.drawio`, `.dio`, `.drawio.svg` en `.drawio.png`. Een nieuw diagram wordt de eerste keer opgeslagen als `.drawio`.
- Als er niets is veranderd, wordt het bestand niet opnieuw geschreven. Pagina's die gecomprimeerd in het bestand staan, blijven gecomprimeerd.
- De afbeelding van een `.drawio.png`-bestand toont de eerste pagina; het hele diagram zit erin opgeslagen.
- Zolang een diagram niet-opgeslagen wijzigingen heeft, wordt er een herstelkopie bewaard in de gegevensmap van de app, zodat je werk een crash overleeft.

## Exporteren en afdrukken

- Kies in het menu Bestand de export naar PNG, SVG of PDF (de exportopdrachten in de eigen menu's van de editor openen hetzelfde venster). Kies daarna **Alle pagina's** (de standaard) of **Alleen huidige pagina**.
- Met alle pagina's leveren PNG en SVG één bestand per pagina op, met de naam `<naam>-p<paginanummer>`. Een PDF heeft één vel per pagina, in het paginaformaat dat in het diagram is ingesteld.
- Afdrukken (Ctrl+P) drukt ook één vel per pagina af. Exports en afdrukken gebruiken altijd lichte kleuren, welk thema je ook hebt.

## AI-paneel

- Vraag de AI om een stroomdiagram, een sequentiediagram of een organigram te tekenen, het diagram uit te leggen, een pagina op te ruimen of de volgende stap toe te voegen na de vormen die je hebt geselecteerd.
- De AI leest het diagram als tekst: de pagina's en, voor elke vorm en verbindingslijn, de id, tekst, vorm, positie en verbindingen, plus welke vormen je hebt geselecteerd. Het diagram als afbeelding ziet de AI niet.
- Wijzigingen van de AI verschijnen meteen. Elke wijziging is één stap ongedaan maken (Ctrl+Z), en de lijst "Een AI-beurt ongedaan maken" in het paneel draait een hele beurt van de AI terug. Wordt een deel van een wijziging geweigerd, dan blijft het diagram zoals het was.
- Voor een nieuw stroomdiagram, sequentiediagram en dergelijke schrijft de AI Mermaid en zet GenOffice dat op je pc om in vormen. De indeling kan iets afwijken van wat de website van draw.io maakt.
- Diagrammen kun je ook als bijlage toevoegen in het AI-paneel van de andere editors, kiezen met `@` en vinden met het zoeken naar bestanden op Start. Ook de [terminalopdrachten](help://cli) lezen, bewerken en maken diagrammen (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Internetgebruik

- Het diagramtabblad stuurt niets naar het internet. De editor draait vanuit bestanden die met GenOffice zijn geïnstalleerd, en de eigen cloudopslag, het delen, de plug-ins en de eigen AI ervan zijn uitgeschakeld.
- Afbeeldingen en lettertypen die een diagram van het internet haalt, worden niet geladen; een melding zegt dit wanneer het bestand opent. Een web- of e-maillink op een vorm opent pas in je standaardbrowser als je erop klikt.
- Het kladblok, de vormbibliotheken die je toevoegt en recente kleuren blijven op deze pc, in de gegevensmap van de app. Het AI-paneel stuurt de tekst van het diagram naar de AI die je hebt gekozen, net als de andere editors.

## Nog niet ondersteund

- PlantUML invoegen of bewerken. PlantUML-vormen in een bestand worden getoond als hun opgeslagen afbeelding.
- Automatische indelingen die ELK gebruiken, en verbindingslijnen die om vormen heen lopen. Zulke lijnen worden als gewone verbindingslijnen getekend.
- Oude Visio-formaten (`.vsd`, `.vss`) en terug opslaan naar `.vsdx`.
- Cloudopslag, delen, publiceren, plug-ins en de eigen AI-functies van de editor.
- Delen van een diagram verbergen voor de AI.
