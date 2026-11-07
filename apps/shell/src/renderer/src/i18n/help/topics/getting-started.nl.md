# Snel starten: de interface en de basis

GenOffice is een kantoorsuite die op je eigen computer draait: één venster, één rij tabbladen, met acht editors — Docs (tekstverwerking), Sheets (spreadsheets), Slides (presentaties), PDF, Markdown en platte tekst, HTML, HWP/HWPX (Hangul-documenten) en mindmaps (.xmind). Elke editor opent en bewaart bestanden in zijn eigen formaat: .docx, .xlsx, .pptx, .pdf, .md, .html, .hwp/.hwpx en .xmind. Voor bewerken is geen netwerk nodig; voor de AI-functies wel. De mindmap-editor importeert ook FreeMind- en Freeplane-bestanden (.mm) als nieuwe maps, die als .xmind worden opgeslagen.

## Overzicht van de interface

Het venster bestaat uit drie delen:

- **Tabbladenbalk (boven)**: elk geopend bestand is een tabblad. Het meest linkse Start-tabblad is er altijd en kan niet worden gesloten; de andere tabbladen zijn je documenten. Dubbelklik op een tabblad om de bestandsnaam ter plekke te hernoemen.
- **Inhoudsgebied**: de editor (of Start) die bij het actieve tabblad hoort.
- **Menubalk**: op macOS in de systeemmenubalk, op Windows/Linux bovenaan het venster. De menu's Bestand/Bewerken/Beeld passen zich aan aan de actieve editor.

## Een document maken

Een van de volgende:

- Klik op een snelmakenkaart in het onderdeel [Snel starten](help://getting-started) van **Start** (AI Docs, AI Sheets, AI Slides, ...).
- Menu **Bestand ▸ Nieuw**: Docs (⌘N/ctrl+N), Sheets, Slides, Markdown, HTML of PDF.
- Sleep een bestand naar het venster, of dubbelklik erop in je bestandsverkenner (als GenOffice de standaardapp is).

Een nieuw document opent zonder titel; het bestand op schijf wordt pas aangemaakt bij de eerste keer opslaan.

## Bestanden openen

- Menu **Bestand ▸ Openen…** (⌘O/ctrl+O) opent de systeemkiezer: .docx / .doc / .odt / .xlsx / .xls / .csv / .tsv / .pptx / .ppt / .pdf / .md / .html.
- Klik op een willekeurig item in de lijst **Recent** op Start.
- Ook `ieumoffice <bestand>` in een terminal opent bestanden.

## ODT-documenten

.odt-bestanden (OpenDocument-tekst, het formaat dat Hancom Office, LibreOffice en andere programma's opslaan) openen in het Docs-tabblad, vanaf elke plek waar een .docx opent. Een nieuw document blijft een .docx.

- **Werkt zoals altijd**: tekst bewerken, teken- en alinea-opmaak, tabellen (rijen en kolommen invoegen en verwijderen, cellen samenvoegen en splitsen), afbeeldingen, kop- en voetteksten, voetnoten en eindnoten, pagina-instelling en secties, opsommingstekens en nummering, kopstijlen, koppelingen, zoeken en vervangen, spelling, afdrukken, exporteren naar PDF en HTML, en bewerken met AI.
- **Uitgeschakeld in ODT**: opmerkingen, wijzigingen bijhouden, vergelijken, watermerk, inkt, inhoudsopgave, vergelijkingen, vormen, tekstvakken of grafieken invoegen, kolommen, citaten en bibliografie, bijschriften en kruisverwijzingen, paginakleur, wachtwoord en bewerkingsbeperking, alleen-lezen aanbevelen, themalettertypen en -kleuren, gespiegelde marges. Hun knoppen zijn grijs; sla op als .docx om ze te gebruiken.
- **Blijft zoals het was**: vergelijkingen, grafieken en tekeningen uit het origineel verschijnen als vergrendelde afbeeldingen die u kunt verwijderen maar niet bewerken, en vergrendelde tabelcellen blijven vergrendeld. Delen die u niet aanraakt, worden ongewijzigd teruggeschreven. Een ODT met wachtwoord opent niet; verwijder eerst het wachtwoord.
- **Opslaan als** biedt .docx en .odt. Voordat het formaat wisselt, ziet u wat verandert of wegvalt; daarna opent het tabblad opnieuw met het nieuwe bestand. Markdown en HTML bieden ook **Exporteren als ODT…**.

## Het opslagmodel

- **Handmatig opslaan**: ⌘S/ctrl+S, of Bestand ▸ Opslaan / Opslaan als… Bij de eerste keer opslaan wordt om locatie en naam gevraagd.
- **Automatisch opslaan** volgt de schakelaar van elke editor (en de appbrede standaard). Een PDF die je alleen leest, wordt nooit stilletjes overschreven; een nieuw document zonder eigen bestand wordt pas na de eerste keer opslaan automatisch opgeslagen.
- Een tabblad met onopgeslagen wijzigingen sluiten vraagt eerst om Opslaan / Weggooien / Annuleren.
- Elke schrijfactie is atomair (tijdelijk bestand + hernoemen), zodat een stroomstoring nooit een half bestand achterlaat.

## Veelgebruikte sneltoetsen

| Actie                   | macOS | Windows / Linux |
| ----------------------- | ----- | --------------- |
| Nieuw document          | ⌘N    | ctrl+N          |
| Openen                  | ⌘O    | ctrl+O          |
| Opslaan                 | ⌘S    | ctrl+S          |
| Tabblad sluiten         | ⌘W    | ctrl+W          |
| Deze handleiding openen | F1    | F1              |
| Het lint samenvouwen    | ⌥⌘R   | Ctrl+F1         |

**Het lint samenvouwen** werkt in elke editor. De tabbalk blijft staan en de opdrachtbalk eronder verdwijnt; het geselecteerde tabblad dient tegelijk als het besturingselement om het lint te vouwen, dus zolang het lint samengevouwen is, is er geen tabblad geselecteerd en drukken op een willekeurig tabblad brengt de balk terug. Een dubbelklik op een tabblad doet hetzelfde. Hoe u het hebt gelaten, wordt per editor onthouden. Docs voegt een middendichtheid toe: **⌥⌘K** / Ctrl+Alt+K comprimeert de band tot alleen pictogrammen, ook onthouden.

Sneltoetsen binnen elke editor (opmaakpenseel, zoeken en vervangen, tabelbewerkingen, ...) staan in de bijbehorende hoofdstukken; Docs heeft bovendien een doorzoekbaar dialoogvenster met sneltoetsen (**⌘/**) (zie dat hoofdstuk).

## De Option+Command-sneltoetsen

Option+Command is de laag die Word reserveert voor gestructureerde sprongen, en GenOffice vult die op dezelfde manier. Docs neemt daar het grootste deel van in, Sheets neemt er twee van zichzelf om met Excel gelijk te lopen; één sneltoets werkt overal.

**Docs**

| Sneltoets (macOS) | Wat het doet      | Windows / Linux    |
| ----------------- | ----------------- | ------------------ |
| ⌥⌘1 / ⌥⌘2 / ⌥⌘3   | Kop 1 / 2 / 3     | Ctrl+Alt+1 / 2 / 3 |
| ⌥⌘0               | Standaard         | Ctrl+Alt+0         |
| ⌥⌘M               | Alinea            | Ctrl+Alt+M         |
| ⌥⌘A               | Nieuwe opmerking  | Ctrl+Alt+A         |
| ⌥⌘F               | Voetnoot invoegen | Ctrl+Alt+F         |
| ⌥⌘E               | Eindnoot invoegen | Ctrl+Alt+D         |
| ⌥⌘G               | Ga naar           | Ctrl+G             |

Twee daarvan veranderen op Windows, om dezelfde reden waarom Word ze opsplitst. **macOS bezet ⌥⌘D** — die toont en verbergt het Dock —, waardoor de eindnoot ⌥⌘E is op de Mac en Ctrl+Alt+D overal elders. En **Ga naar** laat Alt vallen: Ctrl+G, waar de Mac-sneltoets hem wel meeneemt.

**Sheets**, zolang het raster de focus heeft

| Sneltoets (macOS) | Wat het doet | Windows / Linux |
| ----------------- | ------------ | --------------- |
| ⌥⌘0               | Buitenranden | Ctrl+Shift+7    |
| ⌥⌘−               | Geen rand    | Ctrl+Shift+−    |

Windows is geen herschrijving van het Mac-paar. Excel voor Mac geeft Sheets **allebei** — ⌘⇧7 en ⌥⌘0 zijn twee toetsen voor dezelfde buitenranden —, dus op Windows houdt de opdracht de Ctrl+Shift-plek die het al had, en de Option-laag is er simpelweg niet.

Let op: **⌥⌘0 betekent Standaard in Docs en Buitenranden in Sheets**. Ze komen nooit in dezelfde editor voor, dus in gebruik botst er niets, maar ⌥⌘0 is al bezet en is niet beschikbaar als globale sneltoets.

**Elke editor**: **⌥⌘R / Ctrl+F1** vouwt het lint samen, zoals hierboven beschreven.

Daarmee blijft ⌥⌘D vrij voor GenOffice om op macOS te gebruiken, als een toekomstige opdracht hem nodig heeft.

## Waar nu heen

- Waar je bestanden staan: [Het startscherm](help://home-screen).
- Veel geopende bestanden beheren: [Tabbladen en vensterbeheer](help://tabs-and-windows).
- Het werk door de AI laten doen: [Het AI-assistentpaneel](help://ai-panel).
- Eerst de AI verbinden: [Abonnementsverbinding](help://subscription).
- Taal, thema, standaardapps: [Instellingen, taal, thema en MCP-integraties](help://settings-integrations).
