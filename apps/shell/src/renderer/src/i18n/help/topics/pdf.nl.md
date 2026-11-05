# PDF: lezen, annoteren en zwart maken

De pdf-editor heeft vijf linttabs: **Start / Annoteren / Bewerken / Pagina's / Beeld**. Hij leest en schrijft: tekst is bewerkbaar, inhoud kan zwart worden gemaakt en ondertekend en formulieren kunnen worden ingevuld.

## Lezen en navigeren

- Linkerzijbalk: **miniaturen** (klik om te springen, het zichtbare bereik is gemarkeerd) of **overzicht** (bladwijzers, indien aanwezig).
- Zoom: de verhoudingsknop rechtsonder; ctrl+scrollwiel verandert de zoom in stappen.
- De weergave verplaatsen: zet het **Handje** aan (tabbladen Start en Beeld) en sleep om de pagina alle kanten op te verplaatsen. Zolang het aan staat, selecteert slepen geen tekst en opent een gewone klik nog steeds een koppeling. Slepen met de middelste knop (scrollwiel) ingedrukt verplaatst de weergave ook zonder het hulpmiddel. Esc of een ander hulpmiddel zet het uit.
- Draaien: per pagina of voor alle pagina's via het menu Pagina's; draaiingen worden bij opslaan teruggeschreven.
- Zoeken: ctrl+F op volledige tekst met alle treffers gemarkeerd.
- Versleutelde pdf's: een wachtwoordvraag (in een eigen klein venster) opent ze; het wachtwoord wordt alleen voor deze sessie gebruikt. Zo'n document kunt u bewerken en opslaan; bij opslaan blijft het wachtwoord behouden. **Annoteren → Beveiligen** stelt het wachtwoord en wat lezers mogen in, wijzigt of verwijdert ze.

## Tekst selecteren en markeren (Annoteren)

Probeer het op een willekeurige alinea:

1. **Sleep de muis over een zin** — bij loslaten verschijnt boven de tekst een annotatiebalk:

![De annotatiebalk na het selecteren van tekst](img/pdf-highlight.png)

2. Kies een van de drie kleuren voor **markeren**, of **onderstrepen**, **golflijn** of **doorhalen**. Om een markeerkleur te wijzigen, klik je er met rechts op en kies je een nieuwe. Na onderstrepen, een golflijn of doorhalen opent er een rij kleuren op de balk: klik op een andere kleur om die te wijzigen, en de volgende markering krijgt ook die kleur. **Vraag AI** stuurt de selectie met je vraag naar het AI-paneel.
3. Wil je een annotatie ongedaan maken, selecteer dan hetzelfde fragment opnieuw met slepen en klik op de al actieve knop op de balk (een schakelaar in Word-stijl), of selecteer het en druk op Verwijderen.

Verwacht gedrag:

- Slepen over tekst toont een balk: **markeren / onderstrepen / doorhalen / kopiëren / Vraag AI**.
- De kleuren komen uit het palet; **dezelfde markering opnieuw toepassen op een al gemarkeerd bereik verwijdert hem** (schakelaar in Word-stijl).
- Markeringen die al in het bestand staan kunnen worden geselecteerd en verwijderd (⋯-menu of Verwijderen).
- **Let op**: zolang een tekengereedschap actief is, is de tekstlaag niet selecteerbaar — het gereedschap schakelt zichzelf na elke plaatsing uit, zodat je voor de volgende actie weer in selectiemodus bent.

## Tekengereedschappen (Annoteren)

Zes gereedschappen: **inkt, rechthoek, ellips, pijl, notitie**, plus de **zwartmaakvlak** op het tabblad Annoteren.

- Elk gereedschap is een schakelaar: klik om het te activeren; **het schakelt zichzelf uit zodra er een vorm is geplaatst** (klik nogmaals op het gereedschap om door te gaan); klikken op het actieve gereedschap schakelt het ook uit.
- Inkt volgt de lijndikte; rechthoek, ellips en pijl sleep je uit; de kleuren komen uit het tekenpalet.
- Geplaatste vormen kun je selecteren, verwijderen, slepen en (rechthoek en ellips) van grootte veranderen.
- **Zwart maken, de hele werkstroom** (een tekstregel verbergen):

  1. Tabblad Annoteren ▸ klik op **Gebied zwart maken** (het gereedschap wordt actief).
  2. **Sleep een vlak over de inhoud** — die wordt bedekt met een gearceerd merkteken en op de werkbalk verschijnen de knoppen **markeringen wissen / zwart maken toepassen**.

  3. Klik op **Zwart maken toepassen** en bevestig — het resultaat is een werkexemplaar waarin de bedekte tekst en afbeeldingen fysiek zijn verwijderd (niet alleen bedekt) en dit kan niet ongedaan worden gemaakt; het oorspronkelijke document blijft ongewijzigd.

  Een fout gemaakt? De knop om markeringen te wissen haalt de huidige markeringen weg, zodat je opnieuw kunt tekenen.

## Plaknotities en reactiedraden

- Het **notitiegereedschap** zet een speld en opent een kaart in de marge voor de tekst (de auteursnaam is instelbaar); bevestigen slaat het op als een standaard pdf-tekstannotatie.
- Klik op een speld om de draad te openen: **beantwoorden** (antwoorden vormen één platte lijst, zonder nesting), je opmerking **bewerken**, één opmerking of een hele draad **verwijderen**.
- Lopende bewerkingen blijven staan totdat het opslaan de nieuwe tekst in dezelfde annotatie in het bestand terugschrijft, waardoor reactieketens intact blijven.

## Pdf-inhoud bewerken (Bewerken)

- **Tekst bewerken**: klik op tekst om die blok voor blok te bewerken (pdfium-engine; lettertypen worden zo goed mogelijk benaderd).
- **Tekst invoegen**: plaats doorzoekbare tekst met zelfgekozen lettertype, maat en kleur.
- **Afbeelding / stempel invoegen**.
- Formulieren: AcroForm-velden vul je direct in; de waarden worden bij opslaan weggeschreven.

## Ondertekeningen

- **Inkthandtekening**: teken hem; hij kan aan een handtekeningveld van een formulier worden gekoppeld.
- **Afbeeldingshandtekening**: plaats een afbeelding als handtekening.
- Opgeslagen handtekeningen zijn herbruikbaar.
- **Certificaatondertekening** (tabblad Aantekenen): onderteken met een certificaat uit het systeemarchief of een .p12/.pfx-bestand; toon desgewenst de ondertekening op de pagina en certificeer desgewenst het document tegen latere wijzigingen.
- Ondertekenen schrijft altijd een **nieuw bestand** (incrementele update — eerdere ondertekeningen blijven geldig) en opent de ondertekende kopie op zijn plek. Sla eerst op: een ondertekening dekt het bestand zoals het op schijf staat.
- Een banner boven het document somt bestaande ondertekeningen op; **Ondertekeningen bekijken** toont geldigheid, dekking en certificaatketen van elk. Intrekking (CRL/OCSP) wordt niet gecontroleerd.

## Paginabewerkingen (Pagina's)

- **Draaien / verwijderen / herschikken**: sleep miniaturen om te herschikken; verwijderen vraagt bevestiging.
- **Pagina's importeren**: haal pagina's op uit een andere pdf. **Lege pagina invoegen** voegt een lege pagina toe.
- **Pagina's vervangen** wisselt een bereik in voor pagina's uit een ander bestand; **Pagina's bijsnijden** snijdt de randen bij, met een optie om dit op alle pagina's toe te passen.
- **Paginaformaat** schaalt elke pagina naar één en hetzelfde papierformaat; **Volgorde omkeren** draait het document van einde tot begin.
- **Pagina's extraheren**: exporteer geselecteerde pagina's naar een nieuwe pdf.
- **PDF splitsen**: twee varianten — op basis van bereiken in meerdere bestanden, of elke pagina in een raster van kleinere pagina's snijden.
- **PDF's samenvoegen**: twee varianten — andere pdf's toevoegen, of meerdere pagina's op één vel combineren. De groottes worden opgeteld **voordat er iets gelezen wordt** en in totaal meer dan **1 GiB wordt geweigerd** met een leesbare foutmelding (om het geheugengebruik begrensd te houden).
- Wijzigingen op paginaniveau worden bij de volgende keer opslaan teruggeschreven; Opslaan als… laat het origineel ongemoeid.

## Exporteren en afdrukken

- **Exporteren als Word… / PowerPoint… / Excel…** in het menu Bestand, of dezelfde drie via **PDF converteren** in het lintmenu — alles lokaal, geen upload. De .pptx komt eruit met één dia per pagina en de .xlsx met één werkblad per pagina. Elk ervan vraagt waar het opgeslagen moet worden.
- **Afdrukken**: huidige volgorde en draaiingen via het systeemvenster; paginabereiken worden ondersteund.

## Opslaan

- Gewoon opslaan, handmatig of automatisch, schrijft annotaties en bewerkingen terug in het bestand (atomair).
- **Zwart maken loopt via de eigen werkstroom Toepassen** en levert een kopie op, waardoor het origineel ongemoeid blijft en gevoelige inhoud er niet in achterblijft.

## Sneltoetsen van de selectiebalk

Zolang de annotatiebalk boven geselecteerde tekst staat, voert één toets meteen een actie uit.

| Toets | Actie                                          |
| ----- | ---------------------------------------------- |
| H     | Markeren (haalt een bestaande markering weg)   |
| U     | Onderstrepen                                   |
| S     | Doorhalen                                      |
| N     | Notitie toevoegen aan het eind van de selectie |
| E     | AI-uitleg (passagekaart)                       |
| T     | AI-vertaling (passagekaart)                    |
| Enter | Het vak **Vraag AI** openen                    |

- De toetsen werken hetzelfde met een Koreaanse of elke andere invoermethode. Ze worden genegeerd terwijl je in een veld typt of Ctrl of Alt ingedrukt houdt.
- In een document dat tegen bewerken is vergrendeld (het eigenaarswachtwoord verbiedt wijzigingen), doen H, U, S en N niets en tonen ze de reden, net als de knoppen op de balk.

## Passagekaarten

Druk op **E** of **T**, of op de chips voor uitleggen en vertalen in het vak **Vraag AI**, en het antwoord verschijnt in een kleine kaart naast de selectie. Kaarten worden bewaard, dus ze zijn er nog als je het document opnieuw opent, en je kunt ze kopiëren. Vraag je opnieuw naar dezelfde passage, dan opent de bestaande kaart zonder dat er iets wordt verstuurd.

- **Bewaren als notitie** maakt op die plek een notitie. De eerste regel luidt "AI-uitleg" of "AI-vertaling" en de auteur is de naam van je pc-account. Ze komt in het bestand wanneer je de pdf opslaat; tot dan toont de kaart "Wacht op opslaan".
- **Verder vragen in het AI-paneel** geeft de passage en het antwoord door aan het AI-paneel zonder ze te versturen; **Toevoegen aan notitie** zet ze onderaan de notitie van deze pdf.
- Alleen **Opnieuw maken** stuurt de passage nog eens naar de AI.
- **Verwijderen** wist alleen de bewaarde kaart. Een notitie die je al hebt bewaard, blijft staan.
- Een vage stippellijn markeert elke passage met een kaart; klik erop om de kaart weer te openen. De lijn staat alleen op het scherm en wordt nooit opgeslagen of afgedrukt. Zet hem aan of uit via Beeld ▸ **Passagemarkeringen**.

## Overzicht van annotaties

- Beeld ▸ **Annotaties** toont in de linkerzijbalk een lijst met de markeringen, onderstrepingen, doorhalingen, notities en tekeningen van het document, nog niet opgeslagen markeringen en passagekaarten. Markeringen laten de tekst eronder zien.
- Filter op soort, kleur, paginabereik of tekst en sorteer op pagina of op volgorde van aanmaken.
- Klik op een item om er met een korte knippering naartoe te gaan. Een notitie opent haar draad in de marge; een kaart opent de kaart.
- De menuopdrachten **Kopiëren als Markdown**, **Openen als Markdown-document** en **Openen als Word-document** gebruiken de lijst zoals die nu gefilterd is. Er komt geen AI aan te pas. Nieuwe documenten kunnen alleen worden gemaakt vanuit een pdf die in GenOffice is geopend.

## Vertaling naast elkaar

- Zet Beeld ▸ **Vertaling naast elkaar** aan en rechts van elke pagina verschijnt een vertaalkolom die meescrollt. Alleen aanzetten stuurt niets naar de AI. Een document dat je al met **Document vertalen** hebt vertaald, toont de vertaling meteen; alinea’s zonder vertaling verschijnen als vervaagde brontekst.
- **Deze pagina vertalen** (of **De rest vertalen** als een deel al klaar is) verstuurt de pagina met één klik zolang je een abonnement gebruikt; naast de knop staat naar welke AI het gaat. Bij een verbinding die per gebruik betaalt, vraagt de eerste klik in een tabblad eerst "brengt hiervoor kosten in rekening · Vertalen / Annuleren".
- Dubbelklik op een vertaalde alinea om die te bewerken. Bewerkte alinea’s worden als platte tekst bewaard en ongewijzigd gebruikt in vertaalde pdf-, Markdown- en EPUB-bestanden. **Opnieuw vertalen** bij een alinea stuurt alleen die alinea en vraagt het eerst als je haar hebt bewerkt.
- Beweeg je de muis over een vertaalde alinea, dan krijgt haar plek op de bronpagina een kader. Breedte en tekstgrootte van de kolom zijn instelbaar. **Alle pagina’s vertalen…** opent het venster **Document vertalen**, waarvan de indeling **Alleen bewaren (geen bestand)** de vertaling bewaart zonder een bestand te schrijven.
- Nieuw vertaalde alinea’s zijn zin voor zin gekoppeld. Als u de muis op een vertaalde zin houdt, wordt die zin op de bronpagina gemarkeerd; op een bronzin licht de vertaling op. Waar de zin niet op de pagina te vinden is, en bij eerder vertaalde of door u bewerkte alinea’s, blijft de koppeling per alinea.
- De balk boven de kolom wisselt tussen **Vertaling** en **Eenvoudige uitleg**. Een eenvoudige uitleg schrijft de tekst opnieuw met alledaagse woorden en korte zinnen, voor kinderen, ouderen of mensen die de taal leren; feiten, getallen en namen blijven zoals ze zijn. De keuze wordt onthouden, en wisselen verstuurt niets. Zolang de uitleg te zien is, werken de pagina- en alineaknoppen en het bewerken op de uitleg.
- Bij de eenvoudige uitleg opent **Alle pagina’s eenvoudig uitleggen…** het venster **Document vertalen** met de soort **Eenvoudige uitleg**. Een uitleg is langer dan het origineel en kan dus geen vertaalde PDF worden; hij wordt als Markdown of EPUB geschreven. Met **Origineel en dan uitleg** aan volgt op elke oorspronkelijke alinea haar uitleg; uit bevat het bestand alleen de uitleg. De taal is eerst de taal van de interface en mag ook die van het document zijn.

## AI-markering

- Kies onder Start ▸ **AI-markering** een categorieset (Onderzoek en rapporten, Contracten en voorwaarden, Lesboeken en handleidingen, of Eigen) en de pagina’s. Er wordt niets verstuurd tot je het geschatte aantal aanroepen en de AI hebt gecontroleerd en op **Starten** drukt.
- De zinnen die de AI kiest, verschijnen als voorbeeld in doorschijnende gekleurde kaders op de pagina. Het voorbeeld wordt nooit opgeslagen; zet het aan of uit via Beeld ▸ **Voorbeeld van markeringen**.
- In het paneel **Annotaties** kun je suggesties één voor één **Accepteren** of **Negeren**, of een hele categorie accepteren. Een zin die niet in de paginatekst is gevonden, kan niet worden geaccepteerd.
- Een geaccepteerde suggestie wordt een markering in de kleur van haar categorie, en de categorienaam wordt opgeslagen als onderwerp van de annotatie, zodat andere pdf-viewers hem in hun opmerkingenlijst tonen. Ze komt in het bestand wanneer je de pdf opslaat.
- AI-markering kan niet starten in een document dat tegen bewerken is vergrendeld. Verzonnen zinnen die niet in de tekst staan, worden weggegooid, en het eindverslag vermeldt hoeveel er zijn ontvangen en weggegooid.

## Documentoverzicht en alineacitaten

- Boven in het AI-paneel maakt **Documentoverzicht** ▸ **Overzicht maken** een samenvatting in drie regels, een samenvatting en kernbegrippen (met betekenis en eerste pagina). Een lang document wordt in delen samengevat, dus je bevestigt eerst het geschatte aantal aanroepen.
- Het overzicht wordt bewaard en is er nog als je opnieuw opent; alleen **Opnieuw maken** verstuurt opnieuw. Klik op een begrip om het in het document te zoeken; elk onderdeel kan worden gekopieerd of aan de notitie toegevoegd.
- Als het gesprek leeg is, biedt het AI-paneel drie voorgestelde vragen aan. Een klik verstuurt de vraag één keer.
- Een klik op een paginalink (p.N) die de AI als bewijs geeft, springt naar die pagina en licht de geciteerde zin twee seconden op. Wordt de zin niet gevonden, dan ga je alleen naar de pagina.

## Een notitie voor elke pdf

- De eerste keer dat je op **Notitie openen** drukt (tabblad Beeld of paneel **Annotaties**), opent een opslagvenster, standaard in de map van de pdf met de naam "pdf-naam notitie.md". Daarna opent de notitie meteen in een Markdown-tabblad.
- Kies je een bestand dat al bestaat, dan vraagt Windows misschien of het moet worden vervangen, maar het bestand wordt niet overschreven: het wordt zoals het is als notitie gekoppeld.
- **Toevoegen aan notitie** (op kaarten, items in het paneel en het documentoverzicht) zet een citaat met paginalink onderaan het tabblad van de notitie en laat het niet-opgeslagen; je slaat zelf op in dat tabblad. De link opent de pdf op die pagina in andere programma’s, zoals een browser.
- Een pdf die nooit is opgeslagen, toont "Sla eerst de pdf op". Notities werken alleen voor pdf’s die in GenOffice zijn geopend.
