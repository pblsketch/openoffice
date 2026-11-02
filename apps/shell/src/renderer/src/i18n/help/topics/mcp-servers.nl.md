# MCP-servers koppelen

Een MCP-server is een dienst die de AI hulpmiddelen van buiten de app aanbiedt, zoals wetten opzoeken of zoeken in materiaal dat jouw team beheert. Zodra je een server hebt gekoppeld, kunnen de AI-vensters in GenOffice de hulpmiddelen ervan tijdens een gesprek aanroepen. Per hulpmiddel bepaal je zelf wat de AI mag gebruiken en hoe.

## Een server toevoegen

1. Open **Instellingen ▸ Integraties** en klik op de kaart **MCP-servers** op **Server toevoegen**.
2. Kies hoe je de server toevoegt.
   - **Instellingstekst plakken**: plak de hele instellingstekst uit de handleiding van de server en klik op **Lezen**. GenOffice vult de velden in. Staan er in één tekst meerdere servers, dan bevestig je ze een voor een. Leest de tekst een sleutel of waarde uit een pc-variabele (`${NAAM}`), dan blijft dat veld leeg en vult u het zelf in.
   - **Zelf invoeren**: typ een naam en het adres. Geeft de handleiding van de server je een sleutel, vul die dan in bij **Sleutel (optioneel)**.
3. Lees de melding boven de knop om toe te voegen en klik op **Toevoegen**.
4. Na het toevoegen controleert GenOffice meteen de verbinding en haalt de lijst met hulpmiddelen op. Een server die een aanmelding nodig heeft, wacht op u in plaats van de browser te openen. Klik op **Verbinding controleren** om de lijst met hulpmiddelen van de server te zien. Heeft de server een aanmelding nodig, klik dan op **Aanmelden via de browser** en rond het aanmelden daar af.

Een servernaam bestaat uit letters, cijfers, `-` en `_`, tot 24 tekens. De AI ziet de hulpmiddelen van deze server onder namen van de vorm `mcp__name__tool`. Roept een vaardigheid hulpmiddelen aan onder namen van die vorm, voeg de server dan toe onder dezelfde naam als de vaardigheid gebruikt.

## Servers via een adres en servers op deze pc

- Een server **via een adres** wordt bereikt met een webadres. Internetadressen moeten met `https://` beginnen. `http://` werkt alleen voor deze pc en voor adressen in een privénetwerk, thuis of op het werk, en je bevestigt eerst dat sleutels en documentinhoud onversleuteld worden verstuurd.
- Een server **op deze pc** is een programma dat GenOffice op deze pc uitvoert. Het scherm voor toevoegen toont het exacte programma, de argumenten en de namen van de omgevingsvariabelen die eraan worden doorgegeven. Het wordt pas voor het eerst uitgevoerd nadat je op **Uitvoeren toestaan** hebt geklikt. Verandert de opdracht later, dan blijft de server gestopt tot je hem opnieuw toestaat.
- Heeft een server op deze pc een programma nodig dat deze pc niet heeft (Node.js, of uv voor Python-servers), dan vraagt GenOffice op de serverkaart in Instellingen of het gedownload moet worden. De downloadgrootte wordt getoond en er wordt niets gedownload voordat je op **Downloaden** klikt. Gedownloade programma’s blijven in de gegevensmap van GenOffice en de instellingen van je pc veranderen niet.
- Een server op deze pc start wanneer hij nodig is en stopt na 10 minuten zonder gebruik. Hij stopt ook als je GenOffice sluit.

## Kiezen wat elk hulpmiddel mag doen

- Kies per hulpmiddel **Altijd toestaan**, **Eerst vragen** of **Niet gebruiken**.
- In het begin staan hulpmiddelen die de server als alleen-lezen aanmerkt op **Altijd toestaan** en alle andere op **Eerst vragen**.
- Roept de AI een hulpmiddel met **Eerst vragen** aan, dan verschijnt er een kaart in het AI-venster. Bekijk wat er verstuurd wordt en klik op **Alleen deze keer toestaan**, **Altijd toestaan in dit gesprek** of **Blokkeren**. Er wordt niets uitgevoerd voordat je klikt. De AI stoppen of het venster sluiten telt als blokkeren.
- Verandert de server de beschrijving van een hulpmiddel of de waarden die het aanneemt, dan toont dat hulpmiddel **Controle nodig** en blijft het voor de AI verborgen tot je de wijziging hebt bekeken en op **Wijziging goedkeuren** hebt geklikt. Een wijziging in de aanwijzingen die de server aan de AI geeft, wordt op dezelfde manier gecontroleerd.
- Nieuwe hulpmiddelen van een server worden aangezet met dezelfde beginwaarden, en de kaart en de knop in het AI-venster tonen **Nieuwe hulpmiddelen: n**. De markering verdwijnt als je in Instellingen de lijst met hulpmiddelen van die server opent.

## Servers gebruiken in een AI-venster

- Servers werken in de AI-vensters van de editors en in Ask AI op Start. Zolang een server aanstaat, verschijnt naast het invoerveld de knop **Verbonden servers**.
- Klik erop om de status van elke server te zien en om een server alleen voor dit gesprek uit of aan te zetten. Een nieuw gesprek begint met alle servers die je in Instellingen hebt aangezet. Een server waarvan de verbinding nooit is gecontroleerd, toont **Nog niet gecontroleerd**; controleer die in Instellingen om de hulpmiddelen te krijgen.
- Zet je **AI internettools laten gebruiken** onder **Instellingen ▸ AI-media en zoeken** uit, dan verdwijnen ook alle hulpmiddelen van MCP-servers.
- Verwacht een vaardigheid een hulpmiddel van een server die je nu niet kunt gebruiken, dan zegt de AI in zijn antwoord welke stap hij niet kon uitvoeren. **Instellingen ▸ Vaardigheden** toont naast de vaardigheid ook de server die ze nodig heeft.
- Ook het agentvenster kan de hulpmiddelen van servers die aanstaan gebruiken. Dezelfde toestemmingen gelden en een sessie houdt de instellingen aan waarmee ze begon. Zie [Agentmodus](help://agent-mode).

## Beschermen wat een server teruggeeft

Elke server heeft de optie **Beschermen wat deze server teruggeeft**, in het begin aan. Zolang die aanstaat, stoppen voor dat gesprek de hulpmiddelen die iets de app uit sturen zodra er iets in een gesprek staat dat die server teruggaf: zoeken op het web, een pagina lezen via het adres, de hulpmiddelen van andere MCP-servers en dergelijke. De hulpmiddelen van dezelfde server blijven werken. Begin een nieuw gesprek om de andere weer te gebruiken. Voor een server die alleen openbaar materiaal geeft, kun je de optie uitzetten.

Het agentvenster kan deze bescherming niet handhaven. Begint een sessie met zo’n server, dan laat het venster dat weten.

## Wat waarheen gaat

- Roept de AI een hulpmiddel aan, dan gaat tekst die de AI koos naar die server. Die kan inhoud van het geopende document en van bijlagen bevatten. Delen die voor de AI verborgen zijn, blijven verborgen.
- Wat de server teruggeeft, gaat naar de AI-aanbieder die je gebruikt. Voeg alleen servers toe waarvan je de beheerders vertrouwt.
- Sleutels, aanmeldingen en waarden van omgevingsvariabelen worden op deze pc bewaard met de versleuteling van je besturingssysteem. Kan deze pc ze niet versleutelen, dan worden ze alleen onthouden tot je de app sluit.
- Als je een server verwijdert, worden zijn sleutels en aanmelding gewist, en wordt de server gevraagd de aanmelding te beëindigen als hij dat ondersteunt.
