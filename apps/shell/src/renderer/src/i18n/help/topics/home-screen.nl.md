# Het startscherm: waar je bestanden staan

Start is de beginpagina van GenOffice: een navigatiebalk links, bestandslijsten en snelmakenkaarten rechts.

## Navigatie in de zijbalk

- **Recent**: bestanden die je onlangs hebt geopend. Elke rij draagt zijn moment — vandaag, gisteren of de datum.
- **Favorieten**: bestanden die je hebt gemarkeerd. Beweeg over een bestandsrij en klik op de ster om het toe te voegen of te verwijderen. **Naar groep verplaatsen** in het ⋯-menu sorteert bestanden met ster in genoemde groepen; de Sterren-weergave filtert erop.
- **Gebruikershandleiding**: opent deze handleiding.
- **Ask AI**: het kennisbank-paneel — stel vragen en krijg antwoorden met citaten uit uw bestanden met ster (zie beneden).
- **Projecten**: de mappen (projecten) waarmee de AI kan werken. Maak een project of gebruik een bestaande map, en open er een om de instructies, het geheugen, de bestanden en de chats te beheren. Zie [Projecten](help://projects).
- **Mappen**: de mappen die je met **Map toevoegen…** aan de zijbalk toevoegt, of er vanuit je bestandsverkenner naartoe sleep. Elke map wordt een hoofdmap die je kunt openen, er submappen in kunt aanmaken, hernoemen en verwijderen; een map die offline gaat wordt als niet beschikbaar getoond en kan van de lijst worden gehaald. **Nieuwe map** maakt er nog een.
- **De regel onderaan**: toont of er AI is verbonden — **AI koppelen**, of de naam van het verbonden abonnement — en opent Instellingen.

Er is hier geen Prullenbak-item. Verwijderde bestanden belanden in de prullenbak van het systeem, en ze herstellen is zaak van het besturingssysteem.

## De bestandslijst

Elke rij toont een pictogram, de bestandsnaam, de wijzigingstijd en meer. Het **⋯-menu** in de rij biedt:

- **Openen**, en **Tonen in map** om het bestand in je bestandsverkenner te vinden.
- **Pad kopiëren**.
- **Verplaatsen naar map…**: opent een mapkiezer en verplaatst het bestand echt; staat er op de bestemming al een bestand met dezelfde naam, dan kunt u overslaan, overschrijven of hernoemen.
- **Naam wijzigen**: ter plekke hernoemen, de extensie blijft automatisch behouden.
- **Aan favorieten toevoegen / Uit favorieten verwijderen** — favorieten blijven over een herstart heen staan en volgen het bestand als je het hernoemt.
- **Dupliceren**: maakt een kopie in dezelfde map.
- **Verwijderen**: verplaatst het bestand naar de prullenbak van het systeem — dit is geen definitieve verwijdering.
- **Uit lijst verwijderen**, in het bovenste **Recent**-overzicht, om een item te laten verdwijnen zonder het bestand aan te raken.

### Meerdere bestanden tegelijk

Vink het vakje bij een rij aan, of ⌘/ctrl-klik, om een selectie op te bouwen; het vakje in de kop selecteert alles wat er op dit moment staat, en een balk boven de lijst meldt (**{n} geselecteerd**) hoeveel er geselecteerd zijn en biedt **Verplaatsen naar map…** en **Bestanden verwijderen** voor de hele set. Je kunt een meervoudige selectie ook naar een map in de zijbalk slepen.

## Zoeken

Het zoekvak bovenaan filtert op twee dingen tegelijk:

- **Bestandsnamen**: snel filteren op naam.
- **Bestandsinhoud**: GenOffice indexeert je bestanden op de achtergrond (de tekst in docx/odt/xlsx/pptx/pdf/md/html), dus zoeken naar hoofdtekst vindt ook bestanden. Het bereik en de schakelaars staan in de zoekinstellingen.

## Snelstartkaarten

De kaarten boven de lijsten maken met één stap een nieuw document. Klikken op een kaart maakt een bestand van dat type en opent de bijbehorende editor — je kunt meteen gaan typen of de AI een eerste opzet laten maken (elke editor heeft een **AI-knop** op het lint en **Vraag AI** in het contextmenu van de selectie).

Het nieuwe bestand komt in de map die op dat moment in de zijbalk geselecteerd is; is er geen selectie, dan gaat het naar de standaardmap.

Wat elke kaart doet:

- **AI Docs** (.docx): een leeg tekstdocument in de Docs-editor. Het bestand wordt pas bij de **eerste keer opslaan** naar schijf geschreven; nieuwe documenten openen met het AI-paneel uitgeklapt (zet dat uit in Instellingen → "AI-paneel openen in nieuwe documenten").
- **AI Sheets** (.xlsx): een leeg spreadsheet in de Sheets-editor. Zolang je niet opslaat bestaat er geen bestand op schijf — de naam is gereserveerd voor de eerste keer opslaan; na de eerste AI-generatie kan het bestand ook automatisch op basis van de inhoud worden hernoemd.
- **AI Slides** (.pptx): een lege presentatie in de Slides-editor.
- **AI Markdown** (.md): een leeg Markdown-document in de Markdown-editor.
- **AI HTML** (.html): een lege webpagina in de HTML-editor.
- **AI PDF** (.pdf): anders dan de rest — maakt **onmiddellijk** een echt leeg pdf-bestand van één pagina in de doelmap en opent het als gewoon bestand (de pdf-editor werkt met echte bestanden). Handig om aantekeningen te maken, gebieden zwart te maken of tekst toe te voegen; bij de eerste keer opslaan kan het bestand automatisch op basis van de inhoud worden hernoemd.
- **Lokaal bestand openen**: een systeemkiezer voor Word (.docx/.doc/.odt), Excel (.xlsx/.xlsm/.xls/.csv/.tsv), PowerPoint (.pptx/.ppt), pdf, Markdown (.md/.markdown) en webpagina's (.html/.htm). Je kunt meerdere bestanden selecteren; elk bestand krijgt een eigen tabblad. Tekstbestanden (.txt, .json) openen hier ook — ze landen in de bronweergave van de Markdown-editor.

> Tip: Bestand ▸ Nieuw in de menubalk maakt dezelfde soort documenten (⌘N/Ctrl+N maakt standaard een tekstdocument); een bestand naar het venster slepen opent het.

## Vraag het uw kennisbank

- Zet eerst een ster bij bestanden (elk type dat de app leest); de kop van het paneel telt het corpus, en een lege kennisbank vraagt u eerst een ster te zetten.
- Antwoorden citeren de bronbestanden; klik op een citaat om het bestand in zijn editor te openen.
- Heeft een verbonden AI nodig; zie [Abonnementsverbinding](help://subscription). Het gesprek leeft alleen in het geheugen — de app sluiten beëindigt het.
- Kies een project onder het invoerveld en de bestanden in die map worden ook doorzocht en gelezen; de chat wordt dan in die map bewaard, zodat je in een andere editor verder kunt. Zonder project leeft de chat alleen in het geheugen, zoals hierboven.
- Zoeken draait op de lokale bestandsindex, zoals bij Start; verdwenen bestanden vallen geruisloos uit het corpus.
- Groepen organiseren alleen de Sterren-lijst — de kennisbank beslaat altijd alle bestanden met ster.
