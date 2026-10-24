# Abonnementsverbinding

GenOffice laat zijn AI draaien op een abonnement dat je al hebt: een Claude-abonnement (Anthropic) of een Codex-abonnement (OpenAI). Codex is het programma van OpenAI, en je meldt je erbij aan met je ChatGPT-abonnement. Je hebt geen API-sleutel nodig, en GenOffice heeft geen eigen account waarvoor je je moet registreren.

## Hoe het werkt

- De AI zit niet in GenOffice ingebouwd. Op deze pc staat een programma van het bedrijf zelf — **Claude Code** bij een Claude-abonnement, **Codex** bij een ChatGPT-abonnement — en GenOffice vraagt dat programma om het antwoord.
- Dat programma is aangemeld met je eigen account, dus elk verzoek telt mee voor je eigen abonnement.
- GenOffice toont nooit een eigen aanmeldformulier en leest of bewaart je aanmeldgegevens nooit. Je meldt je aan in het programma en op de webpagina van het bedrijf zelf.

## Voordat je begint

Je hebt een van deze twee nodig. Allebei mag ook.

- Een Claude-abonnement (een Pro- of Max-abonnement; met een gratis Claude-account lukt verbinden niet), en het programma Claude Code dat op deze pc is geïnstalleerd en aangemeld.
- Een ChatGPT-abonnement, en het programma Codex dat op deze pc is geïnstalleerd en aangemeld.

Is het programma nog niet geïnstalleerd of nog niet aangemeld, dan regel je dat met de knoppen uit het volgende onderdeel.

## Verbinden

1. Open **Instellingen** via de regel linksonder op Start en kies **AI**. Onder **Abonnementsverbinding** staat een kaart voor Claude en een voor Codex.
2. Lees wat er op de kaart staat en druk op de knop. De tabel hieronder legt elke status uit.
3. Ga terug naar het venster van GenOffice. De kaart controleert vanzelf opnieuw, en met **Opnieuw controleren** gebeurt dat meteen.

In de tweede stap van de welkomstschermen bij de eerste start, en in het AI-paneel wanneer er geen AI is verbonden, krijg je eerst de vraag "Welke AI gebruik je al?". Kies een betaald Claude-abonnement, ChatGPT of nog geen van beide, en je ziet alleen de stappen van die route (Programma installeren → Aanmelden → Verbonden) en de bijbehorende kaart. Met **Een andere manier kiezen** kies je opnieuw, en je kunt alles overslaan en later verbinden. Lukt verbinden nog steeds niet, druk dan op **Gegevens kopiëren voor hulp** en stuur wat er gekopieerd is naar degene die je helpt. Er staan geen account en geen bestandspaden in.

| Wat er op de kaart staat                        | Wat het betekent                                                                                                                             | Wat je doet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Controleren…**                                | GenOffice vraagt het programma hoe het ervoor staat.                                                                                         | Even wachten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Niet geïnstalleerd**                          | Het programma is niet gevonden op deze pc.                                                                                                   | Druk op **Installeren**. De officiële installatieopdracht van het bedrijf wordt uitgevoerd in een nieuw terminalvenster, zodat je kunt zien wat er gebeurt. GenOffice downloadt zelf niets. Wil je liever met de hand installeren, dan opent **Officiële installatiehandleiding** de instructies van het bedrijf.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Niet aangemeld**                              | Het programma is er, maar er is niemand aangemeld.                                                                                           | Druk op **Aanmelden**. De aanmeldpagina van het bedrijf opent in je browser: meld je daar aan en sta toegang toe, dan maakt de kaart vanzelf verbinding. Neem de tijd; aanmelden kan even duren. Opent er helemaal geen browser, druk dan op de kaart op **Browser niet geopend?** (na 25 seconden wordt dat een knop **Aanmeldvenster openen**). Druk er niet op terwijl je nog in de browser bezig bent met aanmelden: dan stopt die aanmelding en begint alles opnieuw. Bovenaan het aanmeldvenster dat opent, staat wat je moet doen. Om er een code in te plakken, klik je met de rechtermuisknop in het venster en druk je daarna op Enter. Het is normaal dat de geplakte code niet zichtbaar is; staat er "Invalid code", plak de code dan opnieuw in hetzelfde venster. Wil je stoppen met aanmelden, druk dan op **Aanmelden annuleren**. |
| **Verbonden**                                   | Er is een aanmelding met een abonnement bevestigd. De naam van het abonnement staat erbij als het programma die doorgeeft.                   | Niets. De AI is klaar voor gebruik.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Aangemeld, maar niet met een abonnement**     | Het programma is aangemeld met een API-sleutel of een account met betaling per verbruik, of het type aanmelding kon niet worden vastgesteld. | Zie "Aanmeldingen met betaling per verbruik" hieronder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **De verbinding kon niet worden gecontroleerd** | De controle zelf is mislukt. De reden staat op de kaart.                                                                                     | Druk op **Opnieuw controleren**. Staat er dat het programma te oud is, druk dan op **Bijwerken**: de officiële update van het bedrijf wordt in een nieuw venster uitgevoerd. Kom terug naar GenOffice als die daar klaar is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

De verbinding wordt gecontroleerd wanneer de app start, wanneer je Instellingen opent en wanneer je naar het venster terugkeert nadat je een installatie of een aanmelding hebt gestart.

## Zonder abonnement: gratis AI

Geen abonnement op Claude of ChatGPT? Onder Instellingen ▸ AI verbind je met **Gratis gebruiken** in plaats daarvan een gratis AI. Kies je **Nog geen van beide** in de tweede stap van de welkomstschermen, dan zie je dezelfde kaarten, en kies je het in het AI-paneel wanneer er niets is verbonden, dan biedt het **Gratis AI koppelen** aan.

- **OpenRouter**: druk op **Verbinden in browser**. Je browser opent OpenRouter; maak een account of meld je aan, en geef toegang. Zegt de browser dat de verbinding er is, sluit dan het tabblad en kom terug. Er is geen sleutel om te kopiëren, en de kaart toont hoeveel gratis verzoeken er vandaag nog over zijn.
- **Google Gemini**: druk op **Sleutel aanmaken**, maak een sleutel in Google AI Studio, plak die in de kaart en druk op **Verbinden**. Alleen voor wie 18 jaar of ouder is. Een sleutel uit een Google-project waarin facturering aanstaat, kan kosten opleveren.
- Na het verbinden wordt die AI de **AI die wordt gebruikt**. Zijn ze allebei verbonden, dan wissel je met **Deze AI gebruiken** op een kaart tussen de twee. **Verbinding verbreken** verwijdert de sleutel uit GenOffice.
- Gratis modellen zijn zwakker dan die van een abonnement, en het aantal verzoeken per dag is beperkt. Eén bewerking van een document kan er meerdere kosten. Is het tegoed van vandaag op, dan meldt het AI-paneel dat, en ook wanneer je de AI weer kunt gebruiken.
- Zolang je het gratis gebruikt, kan wat je verstuurt worden gebruikt om de AI van dat bedrijf te verbeteren. Wees voorzichtig met documenten die persoonsgegevens bevatten.

## Aanmeldingen met betaling per verbruik

Een kaart met **Aangemeld, maar niet met een abonnement** bevat een waarschuwing: "Dit is geen abonnement: je betaalt voor wat je gebruikt."

- GenOffice gebruikt die aanmelding pas nadat je op **Toch gebruiken** hebt gedrukt. Vanaf dat moment wordt elk verzoek bij dat account in rekening gebracht.
- Ook dan wordt die nooit automatisch gekozen. Kies die zelf onder **AI die wordt gebruikt**, waar er **Betaald** bij staat.
- Je toestemming wordt alleen voor dat programma onthouden. Die vervalt zodra het programma wordt afgemeld of de aanmelding verandert.
- Wil je toch je abonnement gebruiken, meld het programma dan aan met het account van je abonnement en druk op **Opnieuw controleren**.

## Van account wisselen of afmelden

Als het programma is aangemeld, toont de kaart het account waarmee het is aangemeld, naast de naam van het abonnement, als het programma dat doorgeeft. Er staan ook twee knoppen op.

- **Aanmelden met een ander account** start de aanmelding van het programma zelf opnieuw. Rond die af in het venster dat opent, met het andere account.
- **Afmelden** voert de afmelding van het programma zelf uit. Daarna staat op de kaart **Niet aangemeld**.
- Beide gelden voor dat programma op deze hele pc, niet alleen voor GenOffice. Gebruik je Claude Code of Codex ook in een terminal, dan wordt het daar ook afgemeld of naar het andere account overgezet. GenOffice vraagt je daarom eerst om bevestiging.
- Het account en deze twee knoppen staan alleen hier, onder Instellingen ▸ AI. GenOffice toont het account en slaat het nergens op.

## Welke AI wordt gebruikt

**AI die wordt gebruikt**, onder Instellingen ▸ AI, staat eerst op **Automatisch**. Automatisch beslist in deze volgorde:

1. Claude, als op de kaart Verbonden staat.
2. Anders Codex, als op die kaart Verbonden staat.
3. Anders is er geen AI verbonden, en toont het AI-paneel de verbindingshulp in plaats van een foutmelding.

Automatisch kiest nooit iets wat extra geld kost: geen API-sleutel en geen aanmelding met betaling per verbruik. Die worden alleen gebruikt zolang je ze zelf kiest.

Je kunt ook zelf één AI kiezen, op dezelfde plek of in de modellenlijst onder in het AI-paneel. Werkt de AI die je hebt gekozen niet meer, dan stapt GenOffice niet stilletjes over op een andere. Het meldt wat er is gebeurd en laat zien hoe je opnieuw verbindt.

De modellenlijst toont de modellen die het programma zelf doorgeeft: elk met zijn naam en de exacte model-ID ernaast, en bij **Standaardmodel** staat voor welk model het op dit moment staat. Het label onder in het AI-paneel en **AI die wordt gebruikt** noemen dat model ook. Het lezen van de lijst vraagt de AI niets en telt dus niet mee voor je abonnement. Is het programma te oud om zijn modellen door te geven, dan wordt in plaats daarvan een korte ingebouwde lijst getoond.

Overal waar je Codex kunt kiezen, staat er één regel bij: "Een Codex-abonnement gebruiken in een app is geen methode die OpenAI officieel aanbeveelt." Houd daar rekening mee bij je keuze.

## Als een verzoek wordt gestopt

Een verzoek stopt wanneer de limiet van het abonnement is bereikt, wanneer de aanmelding is verlopen of wanneer het programma er niet meer is. GenOffice schakelt niet vanzelf over op een andere AI.

- De reden staat op de plek waar het antwoord is gestopt. Bij een bereikte limiet staat er ook het tijdstip waarop die wordt hersteld, als het programma dat doorgeeft.
- Is je andere abonnement verbonden, dan verschijnt er een knop **Doorgaan met …**, bijvoorbeeld **Doorgaan met Codex**. Als je erop drukt, wordt dat de AI die wordt gebruikt — de modellenlijst laat de wijziging zien — en wordt het verzoek opnieuw uitgevoerd.
- Is de enige andere verbinding een aanmelding met betaling per verbruik die je hebt toegestaan, dan staat er bij dezelfde knop een opmerking over de kosten.
- Er is nooit een knop die je naar een API-sleutel overzet.

## De verbruiksregel

Zodra je 80% of meer van een limiet hebt gebruikt, toont het AI-paneel een regel zoals "85% gebruikt · herstelt om 15:00". Claude meldt een limiet per 5 uur en een limiet per 7 dagen, en Codex wordt op dezelfde manier getoond wanneer het die meldt. Onder de 80%, of als het programma niets meldt, staat er geen regel.

## Wat er wordt verzonden, en waarheen

De eerste keer dat een abonnement kan worden gebruikt, toont GenOffice eenmalig een melding. Wil je die nog eens lezen, ga dan naar Instellingen ▸ AI ▸ **Melding bij de eerste verbinding** en druk op **Opnieuw bekijken**. Er staan drie dingen in:

- De inhoud van het document en je gesprek worden onder je eigen account naar Anthropic of OpenAI verzonden.
- Of die inhoud wordt gebruikt om AI te trainen, wordt bepaald door de instellingen van je eigen account bij dat bedrijf, niet door GenOffice.
- GenOffice zet het opslaan van de gespreksgeschiedenis in Codex uit, maar Codex kan nog steeds eigen diagnostische logboeken op deze pc bewaren.

Wat je met **Selectie voor AI verbergen** hebt verborgen, wordt niet verzonden, welke AI je ook gebruikt.

## Goed om te weten

- **Snelheid.** Een antwoord via een abonnement begint een paar seconden later dan een antwoord via een API-sleutel, omdat het programma van het bedrijf eerst moet opstarten.
- **De gratis versie van ChatGPT.** Die wordt als Verbonden getoond, maar de limieten zijn klein, dus verzoeken stoppen eerder. De verbruiksregel verschijnt er niet bij.
- **Afbeeldingen genereren.** In deze versie genereert een abonnement geen afbeeldingen, welk abonnement je ook hebt. Daarvoor is een sleutel van een afbeeldingsprovider nodig; zie [AI-modellen en instellingen](help://ai-models).
- **Proxy's.** Claude Code en Codex nemen geen proxy-instellingen over van GenOffice. Ze gebruiken de proxy die voor deze pc is ingesteld, bijvoorbeeld de omgevingsvariabele `HTTPS_PROXY`, net als wanneer je ze in een terminal uitvoert. Krijgen ze in een terminal geen verbinding, dan lukt het vanuit hier ook niet.
- **Opdrachten en andere programma's.** Een verzoek dat binnenkomt via de opdracht `ieumoffice` of via een verbonden coding agent gebruikt je abonnement niet, tenzij je dat toestaat. Zie [Verbinden met een coding agent](help://mcp).
