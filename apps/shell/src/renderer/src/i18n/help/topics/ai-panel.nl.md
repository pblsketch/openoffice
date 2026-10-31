# Het AI-assistentpaneel

Elke editor kan het AI-paneel oproepen: selecteer iets, geef een instructie en zie het gestreamde resultaat.

## Openen en gebruiken

- Het paneel heeft een verbonden AI nodig. Is er geen verbonden, dan toont het de verbindingskaarten in plaats van een foutmelding; zie [Abonnementsverbinding](help://subscription).
- Instappen: de **AI-knop** op het lint van elke editor, **Vraag AI** in contextmenu's, of Vraag AI op de markeringsbalk.
- Beschrijf de taak in gewone taal (herschrijf dit / maak deze kolom percentages / herbereken deze pagina...) en druk op Enter.
- Antwoorden worden **gestreamd** weergegeven; heeft de AI gereedschap nodig (het document lezen, het bewerken), dan voert het dat uit en gaat het door tot het klaar is.
- **Stop**: onderbreek de huidige beurt op elk moment.
- **Wachtrij**: terwijl een antwoord binnenstroomt, zet Enter uw bericht in de wachtrij in plaats van het weg te gooien — een strook boven het invoerveld telt ze; open hem om te bewerken, verwijderen, herordenen, pauzeren of wissen. Het volgende bericht verstuurt zichzelf wanneer de beurt eindigt; Esc stopt nog steeds de beurt.

## Welke AI antwoordt

- De modellenlijst onder in het paneel toont de AI die in gebruik is en laat je een andere kiezen: eerst je abonnementen, daarna de providers met een sleutel die je hebt ingesteld.
- Zodra je 80% of meer van een abonnementslimiet hebt gebruikt, verschijnt in het paneel een regel zoals "85% gebruikt · herstelt om 15:00".
- Wordt een verzoek gestopt — de limiet is bereikt of de aanmelding is verlopen — dan zegt het paneel waarom en schakelt het niet vanzelf over op een andere AI. Is je andere abonnement verbonden, dan biedt een knop **Doorgaan met …** dat aan.

## Wat het kan

- **Docs**: herschrijven/uitbreiden/vertalen/samenvatten, tabellen en afbeeldingen invoegen, opmaak aanpassen; elke beurt maakt eerst een momentopname.
- **Sheets**: formules, gegevens invullen, bulktransformaties, opmaak.
- **Slides**: de hele presentatie genereren, indeling bijstellen, teksten herschrijven.
- **PDF**: vragen en antwoorden en samenvattingen op basis van geselecteerde tekst of pagina's.
- **Markdown / HTML**: herschrijven, uitbreiden, vertalen.
- **Start ▸ Ask AI** antwoordt uit uw bestanden met ster en citeert ze — het kennisbank-paneel heeft een eigen sectie in het hoofdstuk Start, en het AI-paneel van Docs heeft dezelfde vaardigheid.

## Geopende documenten bijvoegen

In het AI-paneel van de editors Docs, Sheets, Slides, Hangul, HTML en mindmaps kunt u andere documenten die u in GenOffice open hebt, of onlangs hebt geopend, als materiaal bijvoegen. Een bijgevoegd document wordt precies zo behandeld als een bestand dat u op uw pc kiest.

- **`@` in het invoerveld**: typ `@` aan het begin van het invoerveld of na een spatie om een lijst met documenten te openen. Is het venster gesplitst, dan staat het document in het andere deelvenster bovenaan, daarna de overige geopende en de recente documenten; het document waarin u werkt staat er niet bij. Verfijn met een paar letters van de naam (spaties mogen) en kies met Enter of een klik: `@documentnaam` komt in het invoerveld en het document wordt bijgevoegd. **Meer zoeken…** onderaan opent de documentkiezer die hieronder staat beschreven.
- **Bijvoegen uit GenOffice-documenten**: deze knop naast de bijlageknop opent dezelfde lijst in een venster, waar u meerdere documenten kunt aanvinken en in één keer kunt bijvoegen.
- Documenten met niet-opgeslagen wijzigingen en nieuwe documenten die nooit zijn opgeslagen, worden gedimd weergegeven en zijn niet te kiezen. Sla ze op en kies opnieuw: de AI leest het opgeslagen bestand.
- Hebben twee documenten dezelfde naam maar staan ze in verschillende mappen, dan wordt de naam van de map direct erboven toegevoegd, zoals in `@plan.docx(2e semester)`, en ook de AI krijgt die mapnaam door.
- De editors voor PDF en Markdown hebben nog geen bijlagen, dus daar is geen van beide manieren beschikbaar.

## Projecten

- Klik op de projectnaam links onder het invoerveld om een project te kiezen (één map op uw pc). De AI antwoordt dan met kennis van de bestanden, instructies en het geheugen van die map, en de chat wordt in de map bewaard, zodat u in een andere editor verder kunt. Zie [Projecten](help://projects).
- Met een gekozen project staat de titel van de huidige chat bovenaan het paneel. Klik erop voor de chatlijst van dit project en **Nieuwe chat**.
- De `@`-lijst in het invoerveld toont na de geopende documenten 'Bestanden in dit project'.
- Een verzoek met een gekozen project stuurt ook de instructies (met `AGENTS.md` en `CLAUDE.md` bovenin de map, die u op de projectpagina kunt uitzetten), het geheugen en de lijst met bestandsnamen van dat project, een kort fragment van elk bestand dat de AI vindt bij zoeken in de map, en de tekst van elk bestand dat de AI leest, naar de AI die u gebruikt.

## Terugdraaien en veiligheid

- Het paneel in Docs houdt een **versielijst** bij: één momentopname per beurt, je kunt naar elke terug en die terugstap is zelf met Ctrl+Z ongedaan te maken. Momentopnamen blijven bestaan als je het document opnieuw opent.
- AI-bewerkingen lopen via dezelfde bewerkingsroute als handmatige bewerkingen (ongedaan te maken, pas bij opslaan vastgelegd) — niets slaat je opslagbevestiging over.

## Een selectie voor de AI verbergen

- In Slides, HTML en Markdown kan een selectie uit het zicht van het model worden gehouden: rechtsklik ▸ **Selectie voor AI verbergen**, geef de placeholder een naam, en het model leest `{{naam}}` op zijn plaats. (Markdown activeert het item met de oog-uit-schakelaar op zijn lint; die van HTML zit in het bronpaneel.)
- Het bestand houdt de echte tekst — opslaan, exporteren en afdrukken blijven onaangetast, en de markering overleeft het opnieuw openen. Hetzelfde item maakt zichtbaar (Markdown krijgt een apart item **Selectie weer aan AI tonen**).
- HTML verbergt elementinhouden, attribuutwaarden en stringliteraalss in scripts; de gerenderde pagina verandert nooit.
- Slides verbergt ook hele afbeeldingen, video's en audio, en een dia met verborgen inhoud wordt nooit als screenshot verstuurd: de automatische lay-outcontrole slaat de pagina over en meldt dat.
- Dit geldt alleen voor de AI in de app — de CLI, MCP-tools en headless-export lezen het bestand rechtstreeks en zien de tekst nog steeds.

## Privacy

- Instructies en de relevante documentinhoud gaan naar de **AI die je gebruikt**: naar Anthropic of OpenAI onder je eigen account als je een abonnement gebruikt, of naar de provider waarvan je de sleutel hebt ingevuld. Is er geen AI verbonden, dan wordt er niets verstuurd.
- Of de inhoud bij een abonnement wordt gebruikt om AI te trainen, wordt bepaald door de instellingen van je eigen account bij dat bedrijf.
- Lokale bestanden worden nergens anders heen geüpload; API-sleutels worden opgeslagen in het instellingenbestand van de app op deze machine en alleen in aanvraagheaders verzonden.
