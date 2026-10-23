# De Markdown-editor

De Markdown-editor opent .md / .markdown — en .txt / .json, rechtstreeks in de bronweergave — met bron plus gerenderde voorbeeld.

- **Openen**: vanaf Start of Bestand ▸ Openen…; de opdrachtregel werkt ook.
- **Bewerken**: bewerken in platte tekst; GFM-uitbreidingen (tabellen, takenlijsten, doorhaling, automatische koppelingen) worden in het voorbeeld weergegeven.
- **Voorbeeld**: live; relatieve bronnen zoals afbeeldingen worden naast het document opgezocht.
- **Opslaan**: bytegetrouw — BOM, CRLF en de aanwezigheid van een afsluitende lege regel blijven behouden; opslaan zonder wijzigingen schrijft het bestand niet opnieuw.
- **Zoeken en vervangen**: ctrl+F zoekt in de bron; Alles vervangen schrijft het resultaat terug.
- **AI**: voorinstellingsknoppen laten de assistent het document herschrijven, uitbreiden of vertalen. Een selectie kan voor de AI verborgen worden (zie het hoofdstuk over het AI-paneel).

## De werkbalk

Eén rij knoppen boven de editor (zweef voor tooltips):

- **Bestand en geschiedenis**: Opslaan, Opslaan als…, Ongedaan maken, Opnieuw, Zoeken; de schakelaar **Automatisch opslaan** rechts schrijft wijzigingen op een timer naar schijf.
- **AI-knop**: opent het AI-paneel; ernaast staan de voorinstellingen herschrijven / uitbreiden / vertalen.
- **Alineastijl** (keuzelijst): wisselen tussen bodytekst en de verschillende kopniveaus.
- **Tekstopmaak**: **vet**, _cursief_, ~~doorhaling~~, `inline code`, koppeling.
- **Lijsten**: opsomming, genummerd, takenlijst.
- **Invoegen**: tabel, afbeelding, horizontale lijn.
- **Eigenschappen**: voegt het YAML front matter-blok bovenaan het bestand in of springt erheen.
- **Overzicht**: springen op basis van de kopniveaus.
- **Spellingcontrole**: de spellingcontrole voor dit document aan- of uitzetten.
- **Afbeeldingshost-instellingen**: geplakte en gesleepte afbeeldingen gaan eerst naar uw eigen opslag — S3-compatibel (R2/OSS/COS/MinIO), SM.MS of GitHub — met de lokale assets-kopie als terugval.

Drie snelle voorbeelden:

- **Kop**: zet de cursor op de regel ▸ keuzelijst met alineastijl ▸ "Kop 1".
- **Tabel**: klik op **Tabel invoegen** ▸ sleep het aantal rijen en kolommen ▸ typ in de cellen; het voorbeeld geeft het meteen weer.
- **Takenlijst**: selecteer een paar regels ▸ klik op **Takenlijst** ▸ elke regel wordt `- [ ]`, in het voorbeeld weergegeven als selectievakjes.

## Koppelingen tussen notities

Koppelingen in een notitie volgt u met **Ctrl+klik** (**⌘+klik** op een Mac). Een gewone klik bewerkt nog steeds de tekst.

- **Koppen**: `[tekst](#kop)` en `[[#Kop]]` springen naar die kop in dezelfde notitie.
- **Andere bestanden**: `[tekst](other.md)` of `[tekst](../folder/report.pdf)` opent het bestand in een eigen tabblad, gerekend vanaf de map van de notitie. Een koppeling naar een kop in een andere Markdown-notitie opent die notitie bij de kop.
- **Wikikoppelingen**: `[[Notitie]]`, `[[Notitie#Kop]]` en `[[Notitie|getoonde tekst]]` worden overal in de kluis van de notitie gezocht: de eerste map boven de notitie met `.obsidian`, anders de map van de notitie zelf. Hebben twee bestanden dezelfde naam, dan wint het bestand dat het dichtst bij de notitie staat.
- **Aanvullen**: typ `[[` en kies een notitie uit de kluis in de lijst; die wordt geschreven als `[[Naam]]`.
- **Afbeeldingen**: `![[afbeelding.png]]` toont de afbeelding onder de tekst en `![[afbeelding.png|300]]` stelt de breedte in. Alleen afbeeldingen in de kluis tot 20 MB worden getoond.
- **Wat niet verandert**: wikikoppelingen blijven gewone tekst in het bestand, dus opslaan herschrijft ze nooit. Webkoppelingen openen in uw browser. Netwerkpaden (`\\server\share`), koppelingen in de bronweergave en de AI openen niets.

## Exporteren

Menu Bestand, alles lokaal en alles vraagt waar het resultaat heen moet:

- **Exporteren als Word…** en **Exporteren als PDF…** schrijven een echte .docx of .pdf.
- **Exporteren als ODT…** schrijft een .odt (OpenDocument-tekst) via dezelfde omzetting als de Word-export; verandert er onderweg iets of valt er iets weg, dan ziet u de lijst en bevestigt u eerst.
- **Exporteren als afbeeldingen…** schrijft één PNG per pagina naar een map die u kiest.
- **Converteren en openen in Docs** zet om naar .docx en opent het in het ingebouwde Docs-tabblad hier in de app — het is geen overdracht naar iets in de cloud, en de omgezette kopie staat in een cachemap die na ongeveer een week wordt opgeschoond.

## Bronweergave

Het lint bevat een schakelaar **Bron** (vertalen mee met de app). Zet hem aan en de editor wordt vervangen door de ruwe Markdown: precies de tekst die een opslaactie wegschrijft, niets is opgeschoond, niets wordt eronder genormaliseerd.

- **Bewerken is bytegetrouw.** Een opslaactie vanuit de bronweergave levert dezelfde bytes als een opslaactie vanuit de editor — BOM, CRLF en de aanwezigheid van een afsluitende newline blijven allemaal behouden.
- **Het is hetzelfde document.** Schakel rustig heen en weer; de bron is de eigen tekst van de editor, geen kopie die je zou moeten samenvoegen.
- **De opmaakwerkbalk is niet beschikbaar** zolang de weergave open is, omdat de meeste van die knoppen editorconstructies invoegen die alleen aan de weergegeven kant betekenis hebben. Hij komt terug zodra je de weergave sluit.
- **.txt en .json** openen hier direct in bronweergave: er is niets te renderen, dus de bron _is_ het document.
