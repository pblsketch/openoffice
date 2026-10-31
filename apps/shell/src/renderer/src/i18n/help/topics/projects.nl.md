# Projecten

Een project is één map op je pc. Kies je in een AI-paneel een project, dan werkt de AI met kennis van de bestanden, instructies, het geheugen en de chats in die map. Bewaar de documenten voor één klus in één map, en een chat die in Docs begon kan verder in Hangul of Slides, zonder dat je de achtergrond in elk document opnieuw hoeft uit te leggen.

## Een project kiezen

- In het AI-paneel van elke editor en in **Ask AI** op Start staat de naam van het huidige project links, onder het invoerveld. Is er niets gekozen, dan staat er **Geen project**.
- Klik erop om de lijst te openen: **Vastgemaakte** en **Recente** projecten, **Nieuw project**, **Map toevoegen** en **Geen project**. Typ in het vak bovenaan om te zoeken; past er geen project bij, dan kun je een nieuw project met die naam maken.
- Beweeg over een rij voor vastmaken, **Map openen** en **Uit lijst verwijderen**. Een project uit de lijst halen laat de map en de bestanden erin met rust.
- Een project waarvan de map is verplaatst of verwijderd, staat gedimd als **Map ontbreekt**. Klik erop en kies de verplaatste map om met hetzelfde project verder te gaan.
- Open je een document dat in een projectmap staat, dan is dat project al gekozen. Zet je dat document op **Geen project**, dan blijft dat zo de volgende keer dat je het opent. Een project dat je kiest voor een document buiten de map, wordt ook voor dat document onthouden.
- Het gekozen project geldt vanaf het volgende verzoek in dat paneel. Wissel je midden in een chat, dan begint er een nieuwe chat; de chat waar je in zat blijft staan waar hij stond.

## Nieuw project en Map toevoegen

- **Nieuw project**: typ een naam en er wordt een map met die naam gemaakt in je standaard opslagmap (eerst `Documenten\GenOffice`; dit kun je wijzigen in Instellingen). Met **Ergens anders maken…** kies je een andere plek. Bestaat er al een map met die naam, dan wordt gevraagd of je die als project wilt gebruiken, en **Deze map gebruiken** begint ermee. Is die map al een project in je lijst, dan gaat hij meteen open, zonder vraag.
- **Map toevoegen** (**Bestaande map gebruiken** op het scherm Projecten van Start): gebruik een map die je al hebt. De submappen horen erbij. Een hele schijf, je hele gebruikersmap en mappen met aanmeldgegevens of de gegevens van de app kun je niet kiezen.
- Open je een document in een projectmap die niet in je lijst staat, dan verschijnt onder het invoerveld 'Dit document staat in de projectmap "…"' met een knop **Gebruiken**. Klikken daarop is hetzelfde als Map toevoegen.
- Bevat een map die je van iemand anders hebt gekregen al instructies of geheugen, `AGENTS.md` of `CLAUDE.md`, of chats die op een andere pc zijn geschreven, dan laat de app die één keer zien en vraagt wat je wilt. Met **Alles bekijken** lees je eerst alles. **Gebruiken met instructies** neemt alles mee. **Gebruiken zonder instructies** houdt die instructies en dat geheugen weg bij de AI, verbergt chats van andere pc's en voegt geen geheugen meer toe; bestanden lezen werkt nog gewoon. Later kun je op de projectpagina overstappen met **Instructies ook gebruiken**. Klik je op **Annuleren** of sluit je de vraag zonder te kiezen, dan wordt de map niet toegevoegd.
- Daarna wordt het niet meer gevraagd. Veranderen de instructies of het geheugen buiten GenOffice, dan toont het AI-paneel één keer 'Instructies gewijzigd', en **Bekijken** opent dat deel van de projectpagina.

## Instructies en geheugen

- **Instructies** zijn de regels voor dit project, zoals 'Schrijf verslagen in opsommingstekens en kort de naam van de organisatie nooit af'. Schrijf ze op de projectpagina in Start en druk op **Opslaan**. Staat er bovenin de map een `AGENTS.md` of `CLAUDE.md`, dan worden die ook gelezen; je kunt ze uitzetten op de projectpagina.
- **Geheugen** zijn notities die de AI tijdens chats maakt: feiten, voorkeuren en beslissingen die later van pas komen, elk op één regel met de datum. Telkens als de AI er een schrijft, toont het AI-paneel 'Onthouden: …' met een knop **Verwijderen**. Is die notitie al verwijderd, dan staat er 'Geheugen gewist: …' zonder knop **Verwijderen**. Er wordt niet eerst om toestemming gevraagd.
- Wordt het geheugen lang, dan toont het AI-paneel 'Het geheugen wordt lang' met **Opruimen**. Daarop drukken voegt notities samen die elkaar overlappen of verouderd zijn. De vorige versie blijft bewaard en **Ongedaan maken** zet die terug. Opruimen gebeurt alleen als je op de knop drukt, en het stuurt één AI-verzoek.
- Op de projectpagina kun je notities verwijderen, het hele geheugen bewerken en het geheugen uitzetten. Staat het uit, dan wordt er niets nieuws geschreven en wordt het bestaande geheugen nog wel gelezen.
- Bij heel lange instructies valt het laatste deel weg, en het AI-paneel meldt dat. Het geheugen wordt altijd volledig verstuurd, hoe lang ook.

## Bestanden die de AI ziet

- Bij elk verzoek krijgt de AI de naam van het project, de instructies en het geheugen, en een lijst met de namen van de bestanden in de map. De inhoud van een bestand leest de AI zelf als dat nodig is, op dezelfde manier als een bijlage, dus delen die voor de AI verborgen zijn blijven verborgen.
- Geopende documenten met niet-opgeslagen wijzigingen, verborgen bestanden waarvan de naam met een punt begint en de map `.ieumoffice` worden niet gelezen.
- Wil je een bestand bij de AI weghouden, druk dan op **Verbergen voor AI** in het onderdeel Bestanden van de projectpagina. Dat kun je terugdraaien. Het bestand staat nog wel in de zoekresultaten op Start.
- In mappen die worden gesynchroniseerd door OneDrive, Google Drive en dergelijke, staan bestanden die niet naar deze pc zijn gedownload als 'Niet op deze pc'. Wil de AI er een lezen, dan wordt eerst gevraagd of het mag worden gedownload.
- Typ `@` in het invoerveld en na de geopende documenten verschijnt 'Bestanden in dit project'. Kies er een om het bij te voegen. Zie [Het AI-assistentpaneel](help://ai-panel).
- Nieuwe documenten die de AI in een project maakt, worden opgeslagen in de map van het huidige document, of bovenin de projectmap als je het vanuit Start vraagt. Is de naam al bezet, dan komt er `(2)` achter, zodat er geen bestand wordt vervangen.

## Chats

- Een AI-paneel met een gekozen project toont bovenaan de titel van de huidige chat. Klik erop voor de chatlijst van dit project, een zoekvak en **Nieuwe chat**. Elke chat in de lijst kun je in elke editor weer oppakken.
- Wat in een andere editor is gedaan, staat op één regel, zoals '3 hulpmiddelen uitgevoerd in Hangul "verslag.hwp"'. De AI gebruikt alleen de hulpmiddelen van de editor waarin je zit.
- Open je een document, dan zie je de chat die daar het laatst is gebruikt. Hebben twee vensters dezelfde chat open, dan verschijnt een bericht dat in het ene wordt verstuurd meteen ook in het andere.
- Chats die op een andere pc zijn geschreven, krijgen het label **Andere pc**.
- In de lijst kun je chats hernoemen of verwijderen. Een verwijderde chat gaat naar de prullenbak.
- Chats die een document al had voordat deze functie er was, staan onderaan de lijst onder **Eerdere chats in dit document**.
- Chats met **Geen project** worden zoals vroeger per document opgeslagen. In Ask AI op Start zonder project eindigt de chat zodra je de app sluit.

## De projectpagina in Start

**Projecten** in de zijbalk van Start is waar je een **Nieuw project** maakt, **Bestaande map gebruiken** kiest en er een opent om te beheren.

- **Kop**: de naam (die wijzigen hernoemt de map niet), het pad van de map, **Openen in Verkenner** (op een Mac **Tonen in Finder**) en de status. Wordt het project zonder instructies gebruikt, dan staat er **Instructies ook gebruiken**.
- **Instructies**: het vak voor instructies, en de `AGENTS.md` en `CLAUDE.md` die erbij worden gelezen.
- **Geheugen**: de lijst met notities, **Alles bewerken**, **Opruimen**, geheugen aan of uit.
- **Bestanden**: de bestanden die de AI ziet en die welke ervoor verborgen zijn. Klik op een bestandsnaam om het bestand te openen.
- **Chats**: de chats van dit project. Klik op een chat om het document te openen waarin hij het laatst is gebruikt en ga verder in dat AI-paneel.
- Deze pagina leest de map opnieuw telkens als ze verschijnt, dus een notitie die de AI net heeft onthouden zie je zonder de pagina te verlaten. Is het bestand met instructies of geheugen buiten GenOffice gewijzigd terwijl je het bewerkte, dan vraagt **Opslaan** eerst: **Opnieuw laden** leest het gewijzigde bestand, **Toch opslaan** overschrijft het met jouw wijzigingen.

## Wat er in de map blijft, en goed om te weten

- Instructies, geheugen en chats worden als tekstbestanden bewaard in een map `.ieumoffice` binnen de projectmap. Verplaats je de map of kopieer je hem naar een andere pc, dan gaan ze mee. Kies hem op die andere pc één keer met **Map toevoegen** in een AI-paneel of met **Bestaande map gebruiken** op het scherm Projecten van Start.
- De map `.ieumoffice` wordt pas gemaakt als er iets te schrijven is. Je kunt de bestanden erin openen en bewerken in Kladblok.
- Wat je in een chat typt, kan in het geheugen terechtkomen. Wil je iets erbuiten houden, verwijder het dan met **Verwijderen** op de regel 'Onthouden' of zet het geheugen uit.
- Kies je een gesynchroniseerde map als project, dan worden de instructies, het geheugen en de chats ook naar die dienst geüpload. De app meldt dat één keer, de eerste keer dat je de map kiest.
- In een gedeelde map die door meerdere mensen wordt gebruikt, kunnen geheugen en chats door elkaar raken.
- In een map waarin de app niet kan schrijven, zoals een alleen-lezen map, werken instructies en bestanden lezen nog, maar worden chats en geheugen niet opgeslagen. Het AI-paneel meldt dat.
- Het agentvenster gebruikt nog geen projecten. Een agent kan ook de bestanden in de map `.ieumoffice` wijzigen, dus gebruik in een map met materiaal dat je niet kent een van de manieren die eerst vragen. Zie [Agentmodus](help://agent-mode).
