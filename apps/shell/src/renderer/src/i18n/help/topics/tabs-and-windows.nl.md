# Tabbladen en vensterbeheer

Alle geopende bestanden delen één venster; de tabbladenbalk bovenaan wisselt tussen ze, op de manier van een browser.

![De tabbladenbalk: Start plus twee documenten](img/tabs.png)

## De basis

- **Wisselen**: klik op een tabblad, druk op **Ctrl+Tab** (volgende) / **Ctrl+Shift+Tab** (vorige), of scroll met het muiswiel over de balk.
- **Sluiten**: de × op het tabblad, of ⌘W/ctrl+W. Bij onopgeslagen wijzigingen wordt eerst gevraagd.
- **Nieuw**: de + aan het rechtereinde van de balk.
- **Activering is direct**: een tabblad indrukken wisselt meteen om, zonder te wachten tot de klik klaar is.

## Hernoemen: dubbelklik op een tabblad

**Dubbelklik op een willekeurig bestandstabblad** en de titel verandert in een veld ter plekke: Enter bevestigt, Esc annuleert, focusverlies bevestigt; de Enter waarmee je een IME-kandidaat bevestigt wordt niet verward met een bevestiging. Het hernoemen loopt door dezelfde veiligheidscontroles als het hernoemen van een rij op Start (ongeldige tekens, naamconflicten), hernoemt het bestand op schijf en ververst de lijst met recente bestanden.

## Slepen om te herschikken

Houd een tabblad ingedrukt en sleep het opzij om de volgorde te wijzigen; buren schuiven direct uit de weg en de volgorde valt vast zodra je loslaat. Een dode zone van 4 pixels voorkomt dat gewone klikken de tabbladen laten wankelen.

## Contextmenu

Rechtermuisklik op een tabblad voor **Openen in nieuw venster** — aangeboden op elk documenttabblad dat losgemaakt kan worden — en **Sluiten**, grijs op een tabblad dat niet gesloten kan worden. Beide volgen de taal van de app.

## Losmaken in een eigen venster

**Sleep een tabblad buiten de balk** (of gebruik Openen in nieuw venster) en het wordt een eigen venster met het actieve document; sleep het terug om het weer aan de balk te docken. Een losgemaakt venster is een volwaardig venster — je kunt daar gewoon blijven bewerken en opslaan.

## De lijst met alle tabbladen

Als de tabbladen niet allemaal passen, opent het kleine tabbalkenpictogram aan het rechtereinde de volledige lijst (een systeemmenu, nooit afgedekt door het inhoudsgebied); kies met de pijltoetsen.

## De werkbalk in elke editor

Elk editortabblad heeft bovenaan een werkbalk (de precieze indeling verschilt licht per editor):

- **Opslaan** (⌘S/ctrl+S) en **Opslaan als…**.
- **Ongedaan maken / Opnieuw**: met meerdere niveaus; elke editor bewaart zijn eigen geschiedenis.
- **Zoeken** (ctrl+F): opent het zoekpaneel van die editor.
- Schakelaar **Automatisch opslaan**: aan betekent dat wijzigingen op een timer naar schijf worden geschreven; uit betekent dat alleen handmatig opslaan schrijft (de markering voor onopgeslagen wijzigingen op het tabblad of in de titel herinnert je eraan).

## Het Start-tabblad

Het meest linkse Start-tabblad kan niet worden gesloten; klik erop of gebruik Bestand ▸ **Terug naar start** om vanuit een willekeurige editor terug te keren.

## Gesplitste weergave: twee deelvensters

**Sleep een tabblad naar de rechterrand van het venster**: het tabblad volgt als een klein zwevend kopietje, bij de rand verschijnt de aanwijzing 'Hier splitsen' en als je het daar neerzet krijg je twee deelvensters naast elkaar. Zet je het op de onderrand neer, dan krijg je twee deelvensters boven elkaar. Het rechtermuisknopmenu van het tabblad biedt hetzelfde met **Rechts splitsen** en **Onder splitsen**, en **Splitsing opheffen** bij een tabblad dat in een deelvenster zit.

- Het gesleepte tabblad komt in het deelvenster waar je het neerzette; het andere deelvenster houdt het document dat je net bekeek.
- Is er maar één document open, dan komt een kopie van hetzelfde document in beide deelvensters, zodat je begin en eind samen kunt bekijken. Een nieuw document dat nog nooit is opgeslagen kan ook worden gesplitst.
- Sleep de **scheiding** tussen de deelvensters om hun verhouding te wijzigen, dubbelklik erop voor half om half, of duw hem naar een uiteinde om dat deelvenster te sluiten; het document blijft open als tabblad.

## Eén AI-venster dat de focus volgt

- Er is maar één AI-venster te zien. Het deelvenster waarin je werkt toont het zijne; dat van het andere deelvenster klapt in tot een rail, en door op een deelvenster te klikken komt het bijbehorende AI-venster naar voren.
- Terwijl het is ingeklapt, blijven het gesprek van dat deelvenster en lopend AI-werk leven. Gesprekken worden per document bewaard.
- **Twee kopieën van hetzelfde document**: na opslaan in het ene deelvenster vraagt opslaan vanuit het andere eerst 'Dit document is elders gewijzigd'. Automatisch opslaan wacht stil.
- Na een gewone afsluiting brengt **de app opnieuw starten zonder bestand** het laatst gesplitste documentenpaar precies zo terug als het was; met een bestand erbij wordt alleen dat bestand geopend. Na een plotselinge uitval komen de vorige tabbladen terug zoals hieronder beschreven.
- De tabbladen Start, Help en Presentatie (voorbeeld) kunnen niet in een deelvenster. Zolang een daarvan open is, verbergen de twee deelvensters zich even en komen ze terug zodra je weer op een documenttabblad bent.

Drie of meer deelvensters, splitsen in een losgekoppeld venster en het live synchroniseren van de twee kopieën blijven voor later.

## Als de app of de pc plotseling uitvalt

Zolang een document niet-opgeslagen wijzigingen heeft, bewaart GenOffice ongeveer elke 30 seconden een herstelkopie ervan in de eigen gegevensmap van de app. Alle editors doen dit, ook voor een nieuw document dat nog nooit is opgeslagen. Je bestand zelf verandert pas als je opslaat.

- **Je tabbladen komen terug**: als de app of de pc uitviel zonder normaal af te sluiten (stroomuitval, een crash, de app geforceerd gesloten, de pc uitgeschakeld of herstart voor een update), komen de geopende documenttabbladen terug zodra je GenOffice weer start, in dezelfde volgorde en met de gesplitste weergave als je die had. Dat gebeurt ook als je de app start door een bestand te openen.
- **Eén lijst op de startpagina**: documenten met nog niet-opgeslagen inhoud staan samen op het startscherm. Kies voor elk **Herstellen** of **Verwerpen**, of gebruik **Alles herstellen** of **Alles verwerpen**, en druk dan op **Toepassen**. Heeft een ander programma of een synchronisatiedienst het bestand daarna gewijzigd, dan staat **Verwerpen** al geselecteerd zodat het bestand blijft zoals het nu is. Is het oorspronkelijke bestand niet meer te vinden, dan opent herstellen de inhoud als nieuw naamloos document.
- **Later beslissen**: de lijst sluiten verwijdert niets. Als je een van die documenten voor het eerst opent, vraagt een venster met de naam ervan het opnieuw; op Esc drukken of het venster sluiten betekent herstellen. Heb je de herstelde inhoud niet nodig, sluit het document dan met **Niet opslaan**.
- **Tabbladen laden bij openen**: herstelde tabbladen tonen meteen hun titel, maar elk document laadt pas als je voor het eerst op het tabblad klikt. Alles tegelijk openen kan een pc met te weinig geheugen opnieuw laten uitvallen.
- **Als de pc wordt uitgeschakeld**: zijn er niet-opgeslagen documenten, dan vraagt GenOffice niet of ze moeten worden opgeslagen. De app bewaart de kopieën, sluit af en biedt ze aan bij de volgende start.
- **Documenten zonder kopie**: met een wachtwoord beveiligde Excel-, HWP- en PDF-bestanden krijgen geen herstelkopie, dus hun niet-opgeslagen wijzigingen zijn niet te herstellen; een melding zegt dit één keer bij het openen van zo'n document. Sla die vaak op. Met een wachtwoord beveiligde Word- en PowerPoint-documenten krijgen een kopie die met hetzelfde wachtwoord is vergrendeld.
- **CSV-, oudere .xls- en .tsv-bestanden**: de spreadsheeteditor bewaart hun kopie als naamloze werkmap. Na herstel opent die als naamloze werkmap, en bij de eerste keer opslaan worden de map en naam van het oorspronkelijke bestand als .xlsx voorgesteld.

Een kopie wordt verwijderd als je het document opslaat, het sluit met **Niet opslaan** of **Verwerpen** kiest, en ook na 30 dagen zonder wijziging. Na een gewone afsluiting start GenOffice zoals voorheen en komen er geen tabbladen terug.

**Dit is geen automatisch opslaan.** Automatisch opslaan schrijft je wijzigingen in het bestand zelf, en pas nadat je het één keer hebt opgeslagen. Een herstelkopie raakt je bestand nooit aan; ze bewaart alleen wat je nog niet hebt opgeslagen, tot je het opslaat of verwerpt.
