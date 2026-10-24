# Instellingen, taal, thema en MCP-integraties

## Instellingen openen

De regel linksonder op Start opent het instellingenpaneel (er staat AI koppelen tot er een AI is verbonden). Het paneel heeft vijf secties: Account, AI, Algemeen, Integraties en Over.

**Account** laat zien hoe het met je Claude- en Codex-abonnement staat, en **Verbindingen beheren** brengt je naar de sectie AI. Over AI zijn er eigen artikelen: [Abonnementsverbinding](help://subscription) en [AI-modellen en instellingen](help://ai-models).

## Taal

- De instellingen bieden **21 interfacetalen**: Engels, vereenvoudigd Chinees, Japans, Koreaans, Frans, Duits, Spaans, Thais, Indonesisch, Russisch, Arabisch, Portugees, Italiaans, Pools, Tsjechisch, Nederlands, Maleis, Hebreeuws, Hindi, traditioneel Chinees, Vietnamees.
- Wisselen gaat meteen in en blijft behouden; de systeemenubalk wordt in de nieuwe taal opgebouwd.

## Thema

Licht / Donker / Systeem volgen. Systeem volgen volgt het uiterlijk van het besturingssysteem en de editors veranderen mee zonder te flikkeren.

## Algemeen

- **Positie AI-zijbalk** (links of rechts), **Tekstgrootte AI-paneel** en **Spellingcontrole in AI-chat**.
- **AI-paneel openen in nieuwe documenten** — uit, een nieuw document begint met het paneel ingeklapt, één klik verderop.
- **Alle documenten automatisch opslaan** zet AutoSave standaard aan in elke editor; u kunt het voor één venster nog steeds uitschakelen.
- **Opslaglocatie** met de knop **Wijzigen** en **Standaardapp voor Office-documenten** om .docx / .xlsx / .pptx aan GenOffice toe te kennen.

GenOffice verzamelt of verstuurt geen gebruiksstatistieken, dus er is ook geen schakelaar voor.

## AI ▸ Geavanceerd

Dicht tot je het opent; de meeste mensen hebben het nooit nodig. Het tabblad **AI-model** bevat API-sleutels en servers die je zelf draait, voor chat. Op het tabblad **AI-media en zoeken** kiest elke functie de leverancier die haar bedient, en de sleutel en basis-URL van een leverancier worden eenmaal ingevuld en gedeeld:

- **Zoeken op het web**, **Afbeeldingen genereren**, **Afbeeldingsanalyse** en **Video-analyse**, elk met een provider, een model, een sleutel en een basis-URL.
- **Lokaal bestanden zoeken** draait op deze machine. Daaronder staat **Jev-herordenen van zoekresultaten** **standaard uit**. Zet u het aan, dan gaan de uittreksels van de top 20 lokale treffers — tot 1.200 tekens per document, plus bestands- en mapnamen — naar het beslis-eindpunt dat u kiest (Jev via OpenRouter of TypeSafe, Perplexity, Liquid AI d1, Cloudflare, een lokale motor of een eigen URL) om op relevantie te herordenen. Uit staat blijft niets het apparaat verlaten.
- **Automatische verzoeken een abonnement laten gebruiken** staat **standaard uit**. Het bepaalt of een verzoek vanaf de opdrachtregel of van een verbonden coding agent je Claude- of Codex-abonnement mag gebruiken; zie [Verbinden met een coding agent](help://mcp).

## Over

- **Versie**, het GitHub-adres van het project en een regel die vermeldt op welk opensourceproject deze app is gebaseerd.
- **Updatekanaal**: Stabiel of Bèta. Wijzigen gaat meteen in en controleert op een update; een Bèta-installatie wordt niet teruggezet naar Stabiel.

## Standaardapp-koppelingen

Met de instellingen kun je GenOffice registreren als verwerker van .docx / .xlsx / .pptx / .pdf en vergelijkbare bestanden (registratie van de standaardapp op systeemniveau; bevestiging wanneer daarom wordt gevraagd).

## Mededelingen over software van derden en updates

- Help ▸ Kennisgevingen over software van derden: het volledige overzicht van opensourcelicenties dat met de app is meegeleverd.
- Menu (☰) ▸ Controleren op updates… (op een Mac Help ▸ Controleren op updates…): start een handmatige controle; bij een nieuwere versie wordt je gevraagd die te installeren.

## MCP-integratie (voor gevorderde gebruikers / AI-clients)

**Integraties** is het paneel dat GenOffice met een coding agent verbindt, en daarvoor is er een eigen artikel: Verbinden met een coding agent. De korte versie — kies een route (de opdrachtregel, of MCP), volg dat onderdeel en start daarna een nieuw gesprek en stel je vraag.

Onder **Lokale HTTP-server** kan de app de server ook zelf draaien — een inschakelschakelaar en een poort —, terwijl **Geavanceerd** de URL voor de statuscontrole en het logbestand toevoegt, in plaats van hem over te laten aan de assistent. Hij luistert alleen op localhost.

## Commandoregel in één oogopslag

| Opdracht               | Wat het doet               |
| ---------------------- | -------------------------- |
| `ieumoffice <bestand>` | opent een bestand          |
| `ieumoffice mcp`       | start de lokale MCP-server |
| `ieumoffice --help`    | alle opdrachten en opties  |
