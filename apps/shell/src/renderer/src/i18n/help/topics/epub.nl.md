# EPUB-e-boeken: lezen, bewerken en vertalen

De e-boekeditor opent EPUB-boeken (`.epub`) in een tabblad. Je leest het boek, verbetert de tekst direct op de pagina, stelt de AI er vragen over en vertaalt het naar een nieuw EPUB-bestand. Een scherm om de code van een hoofdstuk te bewerken is er niet.

## Een boek openen

- Open een `.epub`-bestand via het openvenster, door het naar het venster te slepen, vanuit recente bestanden, de mappenstructuur of de lijst van Google Drive. In Windows staat het ook onder "Openen met". Door GenOffice te installeren wordt het niet het standaardprogramma voor `.epub`-bestanden.
- Is het boek al geopend, dan komt het tabblad ervan naar voren.
- Boeken met kopieerbeveiliging (DRM) gaan niet open: open ze in de app van de winkel waar je ze hebt gekocht. Beschadigde bestanden en bestanden die geen EPUB-boek zijn, gaan ook niet open; de reden wordt getoond.
- **Boeken met vaste opmaak** (pagina voor pagina opgemaakt, zoals prentenboeken en strips) openen alleen om te lezen. Bewerken, bewerken met AI, vervangen en vertalen staan uit, en de statusregel zegt waarom. Lezen en de AI vragen stellen werken nog wel.
- Een hoofdstuk waarvan het bestand onjuist is opgebouwd, wordt zo goed mogelijk getoond maar kan niet worden bewerkt; een melding bovenaan het hoofdstuk zegt dat. Het wordt ongewijzigd opgeslagen en blijft in vertalingen in de oorspronkelijke taal.

## Lezen

- Het deelvenster **Inhoud** links toont de inhoudsopgave van het boek. Klik op een item om erheen te gaan. Een boek zonder inhoudsopgave krijgt een lijst van zijn hoofdstukken.
- Elk hoofdstuk scrolt omhoog en omlaag. Scrol verder voorbij het einde van een hoofdstuk om naar het volgende te gaan, of voorbij het begin om terug te gaan. De statusregel laat zien in welk hoofdstuk je bent.
- Het tabblad **Beeld** wijzigt de tekstgrootte en regelafstand en zet **Donkere weergave** aan en uit. Deze instellingen veranderen alleen het scherm, nooit het boek, en gelden voor alle boeken.
- De plek waar je bent gestopt met lezen, wordt per bestand onthouden, in de gegevensmap van de app en niet in het boek.
- **Zoeken in boek** (Ctrl+F) doorzoekt alle hoofdstukken. Klik op een resultaat om erheen te gaan.
- Een koppeling in het boek brengt je naar die plek. Web- en e-mailkoppelingen openen in je standaardbrowser; andere adressen worden niet geopend.
- Scripts in het boek zelf worden nooit uitgevoerd en er wordt niets van internet geladen. Geluid en video worden niet afgespeeld.

## Tekst bewerken

- Klik in een alinea en typ. Alinea's, koppen, lijstitems, citaten, tabelcellen en bijschriften bij afbeeldingen zijn te bewerken. Afbeeldingen en de opmaak van tabellen niet.
- Plakken voegt alleen platte tekst in.
- **Enter** splitst een alinea in tweeën en **Shift+Enter** begint een nieuwe regel binnen de alinea. **Backspace** aan het begin van een alinea voegt die samen met de vorige, en **Delete** aan het einde voegt de volgende eraan toe. In tabelcellen, bijschriften en definitielijsten doet Enter niets: alleen de tekst erin verandert.
- **Vet** (Ctrl+B) en **Cursief** (Ctrl+I) zet je aan en uit. Tekst die door het stijlblad van het boek vet of cursief is, blijft zoals hij is.
- **Ongedaan maken** (Ctrl+Z) en **Opnieuw** (Ctrl+Y) blijven werken nadat je hebt opgeslagen. Maak je een wijziging in een ander hoofdstuk ongedaan, dan ga je naar dat hoofdstuk.
- **Vervangen** (Ctrl+H) werkt door het hele boek, één alinea tegelijk: een overeenkomst loopt nooit over twee alinea's. Alleen-lezen hoofdstukken worden overgeslagen en het aantal overgeslagen plekken wordt getoond. **Alles vervangen** maak je in één stap ongedaan.

## Opslaan

- Opslaan (Ctrl+S), Opslaan als (Ctrl+Shift+S, alleen `.epub`), **Automatisch opslaan** op het lint en de vraag voor het sluiten werken zoals in de andere editors.
- Als er niets is veranderd, wordt het bestand niet opnieuw geschreven. Sla je wijzigingen op, dan worden alleen de alinea's herschreven die je hebt gewijzigd. Afbeeldingen, lettertypen, stijlen en alle andere delen van het boek blijven precies zoals ze waren. In een EPUB 3-boek wordt ook de datum "laatst gewijzigd" bijgewerkt.
- Als een ander programma het bestand heeft gewijzigd nadat je het opende, wordt het bestand niet overschreven.

## AI-paneel

- Stel vragen over het boek, laat een hoofdstuk samenvatten of laat de tekst ervan verbeteren of herschrijven. De AI leest de inhoudsopgave en hoofdstukken van het boek en zoekt er tekst in.
- Wijzigingen van de AI verschijnen meteen, en één keer ongedaan maken (Ctrl+Z) draait alles terug wat de AI in die beurt heeft veranderd. De AI kan tekst vet of cursief maken, maar geen afbeeldingen, tabellen of hoofdstukken toevoegen.
- De tekst van het boek is materiaal voor de AI, geen opdracht.
- Vraag "Vertaal dit boek naar het Frans" en de AI opent het vertaalvenster met die taal al ingevuld. Er wordt niets verzonden tot je op **Starten** klikt.
- EPUB-boeken kun je ook als bijlage toevoegen in het AI-paneel van de andere editors, kiezen met `@` en vinden met het zoeken naar bestanden op Start.

## Een boek vertalen

1. Klik op het tabblad **Start** op **Boek vertalen** (of Bestand ▸ Boek vertalen…).
2. Kies de taal, de hoofdstukken (eerst zijn ze allemaal gekozen) en de resultaten: een **Vertaald boek**, een **Tweetalig boek (origineel en vertaling)** of allebei. Kies voor elk waar het wordt opgeslagen.
3. Klik op **Volgende**. De bevestiging toont het geschatte aantal AI-verzoeken, naar welke AI ze gaan, de delen die al vertaald zijn (die niet opnieuw worden verzonden) en, bij een verbinding die per gebruik wordt gefactureerd, dat er kosten in rekening worden gebracht. Heeft het boek niet-opgeslagen wijzigingen, dan heet de knop **Opslaan en vertalen**.
4. Klik op **Starten**. Bovenaan verschijnen de voortgang en **Stoppen**. Bewerken is vergrendeld tot de vertaling klaar is; het AI-paneel blijft werken.
5. Aan het einde toont een verslag wat er is vertaald, wat in de oorspronkelijke taal is gebleven en de resultaatbestanden, elk met **Openen**.

- Het boek zelf verandert niet. Elk resultaat is een nieuw EPUB-bestand met een eigen identiteit, zodat apps voor e-boekbibliotheken het gescheiden houden van het origineel.
- Ook de titel en de inhoudsopgave worden vertaald. In een tweetalig boek volgt na elke alinea de vertaling; in tabellen, bijschriften en lijsten komt de vertaling in dezelfde cel of hetzelfde item. De titel ervan toont beide, als "Oorspronkelijke titel (Vertaalde titel)".
- Hoofdstukken die je niet hebt gekozen, blijven in het resultaat in de oorspronkelijke taal.
- Een verticaal geschreven boek wordt horizontaal, tenzij het naar het Japans, Chinees of Koreaans wordt vertaald. Arabische en Hebreeuwse vertalingen lees je van rechts naar links.
- Wat al vertaald is, wordt bewaard. Als je stopt, kies je **Exporteren wat tot nu toe vertaald is** (de rest blijft in de oorspronkelijke taal) of **Later verdergaan**. Open je een boek met een onafgemaakte vertaling, dan biedt GenOffice aan om ermee verder te gaan. **Opnieuw vertalen vanaf het begin** verwijdert eerst de bewaarde vertaling voor die taal.
- Bewaarde vertalingen tellen mee onder Instellingen ▸ Algemeen ▸ **Opgeslagen AI-resultaten**, samen met die van pdf-documenten, en **Alles verwijderen** wist ook deze.
- Dezelfde vertaling kun je ook starten met de [terminalopdrachten](help://cli) als `ieumoffice epub translate`.

## Nog niet ondersteund

- Hoofdstukken toevoegen, verwijderen of de volgorde ervan wijzigen; de titel, auteur of omslag wijzigen; afbeeldingen of tabellen invoegen; een alinea omzetten in een kop of een lijst.
- Boeken met vaste opmaak bewerken of vertalen, en boeken met kopieerbeveiliging openen.
- Bladeren zoals in een gedrukt boek, en een nieuw, leeg boek maken.
- Het origineel en de vertaling naast elkaar vergelijken in de editor. Open in plaats daarvan het tweetalige boek, en verbeter het vertaalde boek zoals elk ander boek.
- Delen van een boek verbergen voor de AI.
