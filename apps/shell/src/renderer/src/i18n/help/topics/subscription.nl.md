# Abonnementsverbinding

GenOffice laat zijn AI draaien op een abonnement dat je al hebt: een Claude-abonnement (Anthropic) of een ChatGPT-abonnement (OpenAI). ChatGPT verbind je rechtstreeks in GenOffice; gebruik je het Codex-programma van OpenAI al op deze pc, dan kun je in plaats daarvan via Codex verbinden. Je hebt geen API-sleutel nodig, en GenOffice heeft geen eigen account waarvoor je je moet registreren.

## Hoe het werkt

- De AI zit niet in GenOffice ingebouwd. Claude loopt via het programma **Claude Code** dat op deze pc is geïnstalleerd: GenOffice vraagt dat programma om het antwoord, en het programma is aangemeld met je eigen account, dus elk verzoek telt mee voor je eigen abonnement.
- ChatGPT verbindt GenOffice zelf, zonder programma. Meld je aan op de ChatGPT-aanmeldpagina van OpenAI die in je browser opent, en geef deze app toestemming om je ChatGPT-abonnement te gebruiken. Verzoeken gaan van deze pc rechtstreeks naar OpenAI, en het gebruik gaat af van dat ChatGPT-abonnement.
- **Codex** is het programma van OpenAI. Is ChatGPT via Codex verbonden, dan vraagt GenOffice het Codex-programma om het antwoord, net als bij Claude Code.
- GenOffice heeft in de app geen eigen aanmeldformulier. Je meldt je aan in het programma van het bedrijf zelf, of op de webpagina van het bedrijf die in je browser opent. GenOffice leest of bewaart de aanmelding van Claude Code of Codex nooit. De enige aanmelding die GenOffice bewaart, is die welke OpenAI aan deze app geeft wanneer je ChatGPT rechtstreeks verbindt, en die blijft op deze pc (versleuteld op Windows). GenOffice ziet je ChatGPT-wachtwoord nooit.

## Voordat je begint

Je hebt een van deze twee nodig. Allebei mag ook.

- Een Claude-abonnement (een Pro- of Max-abonnement; met een gratis Claude-account lukt verbinden niet), en het programma Claude Code dat op deze pc is geïnstalleerd en aangemeld.
- Een ChatGPT-abonnement. Bij een rechtstreekse verbinding hoef je geen programma te installeren. Het gratis abonnement laat maar weinig gebruik toe. Gebruik je het Codex-programma al op deze pc, dan kun je in plaats daarvan via Codex verbinden.

Is Claude Code of Codex nog niet geïnstalleerd of nog niet aangemeld, dan regel je dat met de knoppen uit het volgende onderdeel.

## Verbinden

1. Open **Instellingen** via de regel linksonder op Start en kies **AI**. Onder **Abonnementsverbinding** staan kaarten voor Claude, ChatGPT en Codex, in die volgorde. Met een ChatGPT-abonnement verbind je op de ChatGPT-kaart. De Codex-kaart is voor wie het Codex-programma op deze pc gebruikt.
2. Lees wat er op de kaart staat en druk op de knop. De tabel hieronder legt elke status uit.
3. Ga terug naar het venster van GenOffice. De kaart controleert vanzelf opnieuw, en met **Opnieuw controleren** gebeurt dat meteen.

In de tweede stap van de welkomstschermen bij de eerste start, en in het AI-paneel wanneer er geen AI is verbonden, krijg je eerst de vraag "Welke AI gebruik je al?". Kies een betaald Claude-abonnement, ChatGPT of nog geen van beide, en je ziet alleen de stappen van die route en de bijbehorende kaart. Voor Claude zijn de stappen Programma installeren → Aanmelden → Verbonden; voor ChatGPT Aanmelden → Verbonden. Op de ChatGPT-route schakel je met **Gebruik je het Codex-programma al op deze pc? Verbinden via Codex** over naar de Codex-route (Programma installeren → Aanmelden → Verbonden), en met **Rechtstreeks in de app verbinden, zonder Codex** op die route ga je terug naar de rechtstreekse verbinding. Is Codex al verbonden, dan zie je de Codex-route meteen vanaf het begin. Met **Een andere manier kiezen** kies je opnieuw, en je kunt alles overslaan en later verbinden. Lukt verbinden nog steeds niet, druk dan op **Gegevens kopiëren voor hulp** en stuur wat er gekopieerd is naar degene die je helpt. Er staan geen account en geen bestandspaden in.

| Wat er op de kaart staat                        | Wat het betekent                                                                                                                             | Wat je doet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Controleren…**                                | GenOffice vraagt het programma hoe het ervoor staat.                                                                                         | Even wachten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Niet geïnstalleerd**                          | Het programma is niet gevonden op deze pc.                                                                                                   | Druk op **Installeren**. De officiële installatieopdracht van het bedrijf wordt uitgevoerd in een nieuw terminalvenster, zodat je kunt zien wat er gebeurt. GenOffice downloadt zelf niets. Wil je liever met de hand installeren, dan opent **Officiële installatiehandleiding** de instructies van het bedrijf.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Niet aangemeld**                              | Het programma is er, maar er is niemand aangemeld.                                                                                           | Druk op **Aanmelden**. De aanmeldpagina van het bedrijf opent in je browser: meld je daar aan en sta toegang toe, dan maakt de kaart vanzelf verbinding. Neem de tijd; aanmelden kan even duren. Opent er helemaal geen browser, druk dan op de kaart op **Browser niet geopend?** (na 25 seconden wordt dat een knop **Aanmeldvenster openen**). Druk er niet op terwijl je nog in de browser bezig bent met aanmelden: dan stopt die aanmelding en begint alles opnieuw. Bovenaan het aanmeldvenster dat opent, staat wat je moet doen. Om er een code in te plakken, klik je met de rechtermuisknop in het venster en druk je daarna op Enter. Het is normaal dat de geplakte code niet zichtbaar is; staat er "Invalid code", plak de code dan opnieuw in hetzelfde venster. Wil je stoppen met aanmelden, druk dan op **Aanmelden annuleren**. |
| **Verbonden**                                   | Er is een aanmelding met een abonnement bevestigd. De naam van het abonnement staat erbij als het programma die doorgeeft.                   | Niets. De AI is klaar voor gebruik.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Aangemeld, maar niet met een abonnement**     | Het programma is aangemeld met een API-sleutel of een account met betaling per verbruik, of het type aanmelding kon niet worden vastgesteld. | Zie "Aanmeldingen met betaling per verbruik" hieronder.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **De verbinding kon niet worden gecontroleerd** | De controle zelf is mislukt. De reden staat op de kaart.                                                                                     | Druk op **Opnieuw controleren**. Staat er dat het programma te oud is, druk dan op **Bijwerken**: de officiële update van het bedrijf wordt in een nieuw venster uitgevoerd. Kom terug naar GenOffice als die daar klaar is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Uit in deze app**                             | Je hebt het programma in de instellingen voor deze app uitgezet. De app controleert het niet en stuurt het niets.                            | Klik op **Weer gebruiken**. De app controleert het programma opnieuw en gebruikt het.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

De ChatGPT-kaart loopt niet via een programma, dus daarop staat nooit **Niet geïnstalleerd** of **Aangemeld, maar niet met een abonnement**. Staat er **Niet aangemeld**, druk dan op **Doorgaan met ChatGPT**: de ChatGPT-aanmeldpagina van OpenAI opent in je browser. Meld je aan en geef deze app toestemming om je ChatGPT-abonnement te gebruiken, dan springt de kaart vanzelf op **Verbonden**. Heb je geen toestemming gegeven, of was het niet binnen 10 minuten klaar, dan meldt de kaart dat de aanmelding niet is afgerond; druk je opnieuw op de knop, dan begint alles opnieuw. Er is geen aanmeldvenster en geen code om te plakken. Tijdens het aanmelden stop je het met **Aanmelden annuleren**.

De verbinding wordt gecontroleerd wanneer de app start, wanneer je Instellingen opent en wanneer je naar het venster terugkeert nadat je een installatie of een aanmelding hebt gestart.

Meldt de Claude- of Codex-kaart dat een aanmelding niet is afgerond, kies dan **Aanmeldvenster openen**. Een code die de browser toont, moet in dat venster worden geplakt; een eerder getoonde code werkt niet meer.

Toont de browserpagina of het aanmeldvenster `3p_delegated_access_policy_denied`, dan heeft een beleid op het Claude-account deze aanmelding mogelijk tegengehouden. Gebeurt bij een nieuwe poging hetzelfde, vraag het dan aan wie het account beheert, of kijk of het met een ander account wel lukt.

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

Een aangemelde kaart toont het account waarmee is aangemeld. De Claude- en Codex-kaart tonen ook de naam van het abonnement, als het programma die doorgeeft. Er verschijnen ook twee knoppen.

- **Aanmelden met een ander account** start de aanmelding van het programma zelf opnieuw. Rond die af in het venster dat opent, met het andere account.
- **Afmelden** voert de afmelding van het programma zelf uit. Daarna staat op de kaart **Niet aangemeld**.
- Op de Claude- en Codex-kaart gelden beide voor dat programma op deze hele pc, niet alleen voor GenOffice. Gebruik je Claude Code of Codex ook in een terminal, dan wordt het daar ook afgemeld of naar het andere account overgezet. GenOffice vraagt je daarom eerst om bevestiging.
- Op de Claude- en Codex-kaart staat ook **Niet gebruiken in deze app**. Het programma en de aanmelding blijven zoals ze zijn, alleen GenOffice gebruikt het niet meer: geen statuscontrole, geen verzoeken, en **Automatisch** slaat het over. Gebruik in een terminal verandert niet. De kaart toont dan **Uit in deze app**, en met **Weer gebruiken** zet je het weer aan. Geen van beide vraagt om bevestiging, omdat er buiten GenOffice niets verandert.
- De ChatGPT-kaart werkt anders. **Afmelden** vraagt om bevestiging met "Hiermee wordt ChatGPT losgekoppeld van deze app"; bevestig je dat, dan vraagt GenOffice OpenAI om de verbinding van deze app te beëindigen en wist het de aanmelding die het op deze pc bewaarde. **Aanmelden met een ander account** opent de aanmeldpagina meteen in je browser, zonder te vragen. Geen van beide heeft invloed op andere programma's op deze pc, ook niet op Codex.
- Op een verbonden ChatGPT-kaart staat "AI in deze app draait op je ChatGPT-abonnement" en een link **Gebruik beheren**. Die opent de gebruikspagina in je ChatGPT-instellingen, waar je ziet hoeveel deze app gebruikt en een limiet alleen voor deze app kunt instellen.
- Het account en deze twee knoppen staan alleen hier, onder Instellingen ▸ AI. GenOffice toont het account en slaat het nergens op.

## Welke AI wordt gebruikt

**AI die wordt gebruikt**, onder Instellingen ▸ AI, staat eerst op **Automatisch**. Automatisch beslist in deze volgorde:

1. Claude, als op de kaart Verbonden staat.
2. Anders ChatGPT, als op die kaart Verbonden staat.
3. Anders Codex, als op die kaart Verbonden staat.
4. Anders is er geen AI verbonden, en toont het AI-paneel de verbindingshulp in plaats van een foutmelding.

Automatisch kiest nooit iets wat extra geld kost: geen API-sleutel en geen aanmelding met betaling per verbruik. Die worden alleen gebruikt zolang je ze zelf kiest.

Je kunt ook zelf één AI kiezen, op dezelfde plek of in de modellenlijst onder in het AI-paneel. Werkt de AI die je hebt gekozen niet meer, dan stapt GenOffice niet stilletjes over op een andere. Het meldt wat er is gebeurd en laat zien hoe je opnieuw verbindt.

De modellenlijst toont de modellen die het programma zelf doorgeeft (bij ChatGPT de modellen die je abonnement volgens OpenAI mag gebruiken; het eerste daarvan wordt gebruikt tot je er een kiest): elk met zijn naam en de exacte model-ID ernaast, en bij **Standaardmodel** staat voor welk model het op dit moment staat. Het label onder in het AI-paneel en **AI die wordt gebruikt** noemen dat model ook. Het lezen van de lijst vraagt de AI niets en telt dus niet mee voor je abonnement. Is het programma te oud om zijn modellen door te geven, dan wordt in plaats daarvan een korte ingebouwde lijst getoond.

Overal waar je Codex kunt kiezen, staat er één regel bij: "Een Codex-abonnement gebruiken in een app is geen methode die OpenAI officieel aanbeveelt." Houd daar rekening mee bij je keuze.

## Als een verzoek wordt gestopt

Een verzoek stopt wanneer de limiet van het abonnement is bereikt, wanneer de aanmelding is verlopen of wanneer het programma er niet meer is. GenOffice schakelt niet vanzelf over op een andere AI.

- De reden staat op de plek waar het antwoord is gestopt. Bij een bereikte limiet staat er ook het tijdstip waarop die wordt hersteld, als het programma dat doorgeeft.
- Rechtstreeks verbonden ChatGPT stopt wanneer de limiet van je abonnement is bereikt, of de limiet die je in je ChatGPT-instellingen voor deze app hebt ingesteld. Er wordt geen hersteltijdstip getoond. Heb je deze app in je ChatGPT-instellingen losgekoppeld, dan springt de kaart op **Niet aangemeld**; meld je dan opnieuw aan.
- Is je andere abonnement verbonden, dan verschijnt er een knop **Doorgaan met …**, bijvoorbeeld **Doorgaan met ChatGPT** of **Doorgaan met Codex**. Als je erop drukt, wordt dat de AI die wordt gebruikt — de modellenlijst laat de wijziging zien — en wordt het verzoek opnieuw uitgevoerd.
- Is de enige andere verbinding een aanmelding met betaling per verbruik die je hebt toegestaan, dan staat er bij dezelfde knop een opmerking over de kosten.
- Er is nooit een knop die je naar een API-sleutel overzet.

## De verbruiksregel

Zodra je 80% of meer van een limiet hebt gebruikt, toont het AI-paneel een regel zoals "85% gebruikt · herstelt om 15:00". Claude meldt een limiet per 5 uur en een limiet per 7 dagen, en Codex wordt op dezelfde manier getoond wanneer het die meldt. Onder de 80%, of als het programma niets meldt, staat er geen regel. Rechtstreeks verbonden ChatGPT toont zo'n regel niet; wat het heeft gebruikt, zie je via **Gebruik beheren** op de ChatGPT-kaart.

## Wat er wordt verzonden, en waarheen

De eerste keer dat een abonnement kan worden gebruikt, toont GenOffice eenmalig een melding. Wil je die nog eens lezen, ga dan naar Instellingen ▸ AI ▸ **Melding bij de eerste verbinding** en druk op **Opnieuw bekijken**. Er staan drie dingen in:

- De inhoud van het document en je gesprek worden onder je eigen account naar Anthropic of OpenAI verzonden.
- Of die inhoud wordt gebruikt om AI te trainen, wordt bepaald door de instellingen van je eigen account bij dat bedrijf, niet door GenOffice.
- GenOffice zet het opslaan van de gespreksgeschiedenis in Codex uit, maar Codex kan nog steeds eigen diagnostische logboeken op deze pc bewaren.

Verzoeken via rechtstreeks verbonden ChatGPT gaan niet via het Codex-programma; ze gaan van deze pc rechtstreeks naar OpenAI.

Wat je met **Selectie voor AI verbergen** hebt verborgen, wordt niet verzonden, welke AI je ook gebruikt.

## Goed om te weten

- **Snelheid.** Een antwoord via Claude Code of Codex begint een paar seconden later dan een antwoord via een API-sleutel, omdat het programma eerst moet opstarten. Rechtstreeks verbonden ChatGPT start geen programma.
- **De gratis versie van ChatGPT.** Die wordt als Verbonden getoond, maar de limieten zijn klein, dus verzoeken stoppen eerder. De verbruiksregel verschijnt er niet bij.
- **Afbeeldingen genereren.** In deze versie genereert een abonnement geen afbeeldingen, welk abonnement je ook hebt. Daarvoor is een sleutel van een afbeeldingsprovider nodig; zie [AI-modellen en instellingen](help://ai-models).
- **Proxy's.** Claude Code en Codex nemen geen proxy-instellingen over van GenOffice. Ze gebruiken de proxy die voor deze pc is ingesteld, bijvoorbeeld de omgevingsvariabele `HTTPS_PROXY`, net als wanneer je ze in een terminal uitvoert. Krijgen ze in een terminal geen verbinding, dan lukt het vanuit hier ook niet.
- **Opdrachten en andere programma's.** Een verzoek dat binnenkomt via de opdracht `ieumoffice` of via een verbonden coding agent gebruikt je abonnement niet, tenzij je dat toestaat. Ook dan gebruikt het Claude Code of Codex, nooit rechtstreeks verbonden ChatGPT. Zie [Verbinden met een coding agent](help://mcp).
- **Agentmodus.** [Agentmodus](help://agent-mode) draait Claude Code of Codex op deze pc. Rechtstreeks verbonden ChatGPT kan de agent niet uitvoeren.
