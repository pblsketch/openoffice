# Google Drive

Koppel Google Drive om de Drive-bestanden die je kiest in GenOffice te openen en te bewerken. Bij opslaan gaat het bestand terug naar Drive. GenOffice kan alleen de bestanden openen die je in het venster van Google kiest; de rest van je Drive ziet het niet.

## Koppelen

1. Open **Instellingen ▸ Integraties**.
2. Lees **Voordat je Drive-bestanden met AI gebruikt**, zet modeltraining uit in de AI-accounts die je met Drive-bestanden gebruikt en vink dat item daarna aan.
   - Claude: zet in Claude onder **Instellingen ▸ Privacy** modeltraining uit.
   - ChatGPT en Codex: zet in ChatGPT onder **Instellingen ▸ Gegevensbeheer** de optie **Improve the model for everyone** uit.
   - Aanbieders met een API-sleutel gebruiken API-gegevens standaard niet voor training.
   - Gratis AI-verbindingen (gratis modellen van OpenRouter, Gemini) krijgen nooit Drive-bestanden.
3. Klik op **Google Drive koppelen**. De aanmeldpagina van Google opent in je browser. Meld je aan en geef toegang.
4. Ga terug naar GenOffice. De kaart toont het gekoppelde account.

Google staat niet toe dat Drive-bestanden naar een AI-dienst gaan die ze gebruikt om zijn modellen te trainen. Daarom kun je pas koppelen of bestanden kiezen als het item is aangevinkt.

De aanmelding wordt op deze pc bewaard met de versleuteling die je besturingssysteem voor je gebruikersaccount biedt (de eigen beveiliging van Windows, de sleutelhanger van macOS of een sleutelbos van het bureaublad onder Linux). Als deze pc dat niet kan versleutelen, blijft de koppeling alleen bestaan tot je de app sluit.

## Drive-bestanden openen

- Klik in de zijbalk van de startpagina op **Google Drive** en daarna op **Kiezen uit Google Drive**.
- De bestandskiezer van Google opent in je browser. Kies de bestanden die je wilt openen (meerdere tegelijk kan ook); GenOffice komt terug en opent ze in de juiste editor.
- Bestanden die je eenmaal hebt gekozen, blijven in de lijst **Gekozen bestanden**. Open ze daar opnieuw, of zoek ze op naam en inhoud.
- Indelingen die GenOffice niet kan openen, zijn grijs. Google Documenten, Spreadsheets en Presentaties openen als Word-, Excel- en PowerPoint-bestanden.

## Terug opslaan in Drive

- Sla op zoals gewoonlijk. Even later wordt het bestand naar Drive geüpload.
- Als iemand het bestand in Drive heeft gewijzigd nadat je het opende, wordt gevraagd of het Drive-bestand moet worden overschreven, of er een kopie in Drive moet worden opgeslagen, of dat de wijziging alleen op deze pc blijft.
- Een bestand dat je alleen mag bekijken, wordt als kopie in Drive opgeslagen of blijft op deze pc.
- Een Google-document blijft ongewijzigd. Je wijzigingen worden als Office-bestand in dezelfde map opgeslagen, of in Mijn Drive als er in die map niet geschreven kan worden.
- Als een upload mislukt, blijven je wijzigingen op deze pc en probeert GenOffice het opnieuw, ook de volgende keer dat de app start.

## AI en Drive

- Klik in het AI-paneel van de editors voor Word, Excel, PowerPoint, HTML, mindmaps en Hangul op **Bijvoegen uit Google Drive** naast de bijlageknop om bestanden te kiezen in het venster van Google in je browser en ze bij te voegen als bestanden van deze pc. Tot 20 tegelijk.
- Zolang **De AI bestanden in Drive laten zoeken en lezen** aan staat (het gaat aan bij het koppelen), kan de AI in elke editor de Drive-bestanden doorzoeken en lezen die je in GenOffice hebt gekozen. Bijvoorbeeld: "Zoek in mijn Drive de notulen van vorige maand en vat ze samen." Als het bestand niet wordt gevonden, kies het dan eerst op de startpagina.
- Wat de AI leest, gaat naar de AI-aanbieder die je gebruikt. Delen die voor de AI verborgen zijn, blijven verborgen.
- Zolang de AI die je gebruikt een gratis verbinding is, werken bijvoegen uit Drive en het lezen van Drive door de AI niet.
- De AI kan Drive-bestanden niet wijzigen, verwijderen of delen.
- Zodra een chat inhoud bevat die uit Drive is gelezen, gebruikt die chat geen zoeken op internet, zoeken naar afbeeldingen, pagina's lezen via een webadres en afbeeldingen invoegen via een webadres meer. Begin een nieuwe chat om ze weer te gebruiken.

## Ontkoppelen

Klik op **Ontkoppelen** in **Instellingen ▸ Integraties**. GenOffice verwijdert de aanmelding van deze pc en vraagt Google de toegang in te trekken. Kopieën van bestanden op deze pc blijven bewaard. Je kunt de toegang ook altijd verwijderen onder **Verbindingen met derden** in je Google-account.
