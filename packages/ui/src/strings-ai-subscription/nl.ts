import type { zh } from './zh'

export const nl = {
  aiAssistant: 'AI-assistent',
  cardChecking: 'Controleren…',
  cardNotInstalled: 'Niet geïnstalleerd',
  cardSignedOut: 'Niet aangemeld',
  cardSigningIn: 'Bezig met aanmelden…',
  cardReady: 'Verbonden',
  cardReadyPlan: 'Verbonden · {plan}',
  cardMetered: 'Aangemeld, maar niet met een abonnement',
  cardMeteredAccepted: 'In gebruik · betaald per verbruik',
  cardError: 'De verbinding kon niet worden gecontroleerd',
  cardErrNeedsUpdate:
    'Het programma {provider} op deze pc is te oud. Werk het bij en controleer daarna opnieuw.',
  cardErrNeedsUpdateVersion:
    'Het programma {provider} op deze pc ({version}) is te oud; {minimum} of nieuwer is nodig. Voer {command} uit in een terminal en controleer daarna opnieuw.',
  cardErrNeedsUpdatePath: 'Bestand dat deze app uitvoert:',
  cardErrNeedsUpdateWindows:
    'Als je {provider} in WSL (Ubuntu) of in een andere map bijwerkt, verandert dit bestand niet. Voer {command} uit in Windows PowerShell.',
  cardErrTimeout:
    'Het programma {provider} heeft niet op tijd gereageerd. Controleer het zo dadelijk opnieuw.',
  cardErrFailed: 'Er ging iets mis bij het controleren van {provider}. Controleer het opnieuw.',
  actionInstall: 'Installeren',
  actionLogin: 'Aanmelden',
  actionLoginWindow: 'Browser niet geopend?',
  actionRecheck: 'Opnieuw controleren',
  actionAcceptMetered: 'Toch gebruiken',
  actionInstallHelp: 'Officiële installatiehandleiding',
  actionOpenSettings: 'Instellingen openen',
  actionDismiss: 'Sluiten',
  actionSwitchAccount: 'Aanmelden met een ander account',
  actionLogout: 'Afmelden',
  installNote:
    'De officiële installatieopdracht van {vendor} wordt uitgevoerd in een nieuw terminalvenster.',
  loginNote: 'De aanmeldpagina die wordt geopend is van {vendor} zelf.',
  signingInBrowserNote:
    'Meld je in de geopende browser aan bij je {vendor}-account en sta toegang toe. De verbinding komt vanzelf tot stand als je klaar bent.',
  signingInWindowNote:
    'Volg de aanwijzingen bovenaan het aanmeldvenster dat net is geopend. Meld je aan op de pagina van {vendor} die in je browser is geopend: het venster sluit dan vanzelf en de verbinding komt tot stand. Een aanmeldpagina die al eerder open stond, werkt niet meer; sluit die.',
  meteredWarning: 'Dit is geen abonnement: je betaalt voor wat je gebruikt.',
  meteredMeaning:
    'Deze aanmelding gebruikt een API-sleutel of een account met betaling per verbruik, of het type kon niet worden vastgesteld. Met ‘Toch gebruiken’ draait AI via deze verbinding en wordt elk verzoek bij dat account in rekening gebracht.',
  connectTitle: 'Koppel een AI om te beginnen',
  connectBody:
    'AI draait op het Claude- of Codex-abonnement dat je al hebt. Een API-sleutel is niet nodig.',
  connectProviderTitle: 'De verbinding {provider} is nu niet bruikbaar',
  connectKeyBody:
    'De configuratie van {provider} is nog niet af. Rond die af in Instellingen of kies een andere AI.',
  errNotConnected:
    'Er is geen AI verbonden. Koppel eerst een Claude- of Codex-abonnement, of een gratis AI.',
  errNotInstalled: 'Het programma {provider} is niet gevonden op deze pc.',
  errSignedOut: 'De aanmelding bij {provider} is verlopen. Meld je opnieuw aan om door te gaan.',
  errRateLimit: 'De limiet van het abonnement {provider} is bereikt.',
  errRateLimitReset:
    'De limiet van het abonnement {provider} is bereikt. Deze wordt om {time} hersteld.',
  errUnsafeTools:
    'Het programma {provider} is gestart met eigen hulpmiddelen ingeschakeld; de uitvoering is uit veiligheid gestopt.',
  errMeteredNotAccepted:
    'De verbinding {provider} wordt per verbruik betaald en je hebt die nog niet toegestaan. Kies ‘Toch gebruiken’ in de verbindingsinstellingen om deze te gebruiken.',
  errNeedsUpdate:
    'Het programma {provider} is te oud voor deze functie. Werk het bij en probeer het opnieuw.',
  errHeadlessLimit: 'De uurlimiet voor automatische verzoeken is bereikt.',
  errHeadlessLimitReset:
    'De uurlimiet voor automatische verzoeken is bereikt. Verzoeken zijn weer mogelijk om {time}.',
  connectFreeHint:
    'Geen abonnement? In Instellingen koppel je in ongeveer een minuut een gratis AI.',
  actionConnectFree: 'Gratis AI koppelen',
  errFreeLimit:
    'Het gratis tegoed van vandaag is op. Probeer het morgen opnieuw of kies een andere AI in Instellingen.',
  errFreeLimitReset: 'Het gratis tegoed van vandaag is op. Je kunt het weer gebruiken om {time}.',
  continueWith: 'Doorgaan met {provider}',
  continueMeteredNote:
    'De verbinding {provider} is geen abonnement: doorgaan wordt per verbruik in rekening gebracht.',
  usageLine: '{percent}% gebruikt · herstelt om {time}',
  usageWindowFiveHour: 'Limiet per 5 uur',
  usageWindowSevenDay: 'Limiet per 7 dagen',
  noticeTitle: 'Voordat je AI met je abonnement gebruikt',
  noticeSend:
    'De inhoud van het document en je gesprek worden onder je eigen account naar Anthropic of OpenAI verzonden. Elk verzoek bevat ook de naam, titel en beschrijving van elke vaardigheid die op ‘AI beslist’ staat; gebruikte vaardigheden en vaardigheidsbestanden die de AI leest, worden ook verzonden.',
  noticeTraining:
    'Of die inhoud wordt gebruikt om AI te trainen, wordt bepaald door de instellingen van je eigen account bij dat bedrijf.',
  noticeCodexHistory:
    'Deze app zet het opslaan van de gespreksgeschiedenis in Codex uit, maar Codex kan nog steeds eigen diagnostische logboeken op deze pc bewaren.',
  noticePdfWholeDocument:
    'In de pdf-editor kunnen het lezen van pagina’s met AI en het vertalen van documenten afbeeldingen van de pagina’s en de volledige tekst van het document versturen.',
  noticeAck: 'Begrepen',
  codexNotice:
    'Een Codex-abonnement gebruiken in een app is geen methode die OpenAI officieel aanbeveelt.',
  truncatedNotice: 'De invoer was te lang; een deel is afgekapt voordat deze werd verzonden.',
  pickerAuto: 'Automatisch',
  pickerAutoUsing: 'Automatisch · {provider}',
  pickerAutoUsingModel: 'Automatisch · {provider} · {model}',
  pickerDefaultModel: 'Standaardmodel',
  pickerDefaultModelNamed: 'Standaardmodel · {model}',
  pickerSubscription: 'Abonnement',
  pickerPaid: 'Betaald',
  pickerPaidTitle: 'Betaald per verbruik, valt niet onder een abonnement',
  pickerNotConnected: 'AI koppelen',
  guideQuestion: 'Welke AI gebruik je al?',
  guidePathClaudeTitle: 'Ik heb een betaald Claude-abonnement',
  guidePathClaudeBody:
    'Je hebt een Pro- of Max-abonnement nodig. Met een gratis Claude-account lukt verbinden niet.',
  guidePathCodexTitle: 'Ik gebruik ChatGPT',
  guidePathCodexBody:
    'Meld je met je ChatGPT-account aan bij het Codex-programma van OpenAI. Met het gratis abonnement kun je maar weinig gebruiken.',
  guidePathFreeTitle: 'Nog geen van beide',
  guidePathFreeBody:
    'Koppel in ongeveer een minuut een gratis AI. Zolang je die gratis gebruikt, kan wat je verstuurt worden gebruikt om de AI van dat bedrijf te verbeteren.',
  guideBack: 'Een andere manier kiezen',
  guideBadgeReady: 'Verbonden',
  guideBadgeInstalled: 'Geïnstalleerd',
  guideBadgeCheck: 'Controleren',
  guideStepsLabel: 'Verbindingsstappen',
  stepInstall: 'Programma installeren',
  stepLogin: 'Aanmelden',
  stepReady: 'Verbonden',
  installReturnNote:
    'Kom hier terug als de installatie in dat venster klaar is. De app controleert dan vanzelf opnieuw.',
  loginHowNote:
    'Als je erop klikt, opent er een browser. Meld je aan met je {vendor}-account en klik op Toestaan; de verbinding komt vanzelf tot stand.',
  signingInStalledNote:
    'Is er in je browser geen aanmeldpagina geopend, open dan het aanmeldvenster met de knop hieronder. Ben je nog bezig met aanmelden in de browser, maak het dan daar af: de knop stopt die aanmelding en begint helemaal opnieuw.',
  actionLoginWindowOpen: 'Aanmeldvenster openen',
  loginWindowTitle: 'Aanmelden bij {provider}',
  loginWindowIntro:
    'Dit is het aanmeldvenster van het programma {provider}. De Engelse tekst hieronder komt van het programma {provider}.',
  loginWindowStepBrowser:
    'Als de aanmeldpagina van {vendor} in je browser opent, meld je dan aan en sta toegang toe. Dit venster sluit daarna vanzelf.',
  loginWindowStepAddress:
    'Is er geen browser geopend, sleep dan met de muis over het adres hieronder dat met https:// begint om het te selecteren, en klik met de rechtermuisknop om het te kopiëren. Plak het in de adresbalk van je browser om de aanmeldpagina te openen.',
  loginWindowStepCode:
    'Toont de browser na het aanmelden een code, kopieer dan de hele code (gebruik de kopieerknop als die er is). Klik één keer met de rechtermuisknop in dit venster om hem te plakken en druk daarna op Enter. Het is normaal dat de geplakte code niet zichtbaar is.',
  loginWindowStepInvalid:
    'Zie je "Invalid code", dan is de code niet helemaal gekopieerd. Laat dit venster open, kopieer de code opnieuw en plak hem.',
  loginWindowClosing:
    'Het aanmelden is niet voltooid. Druk op Enter om dit venster te sluiten als je de berichten hierboven hebt gelezen. Wil je het opnieuw proberen, klik dan nog een keer op de aanmeldknop.',
  actionCancelLogin: 'Aanmelden annuleren',
  actionUpdate: 'Bijwerken',
  updateNote:
    'Als je erop klikt, wordt de officiële update van {vendor} in een nieuw venster uitgevoerd. Kom hier terug als die daar klaar is.',
  guideInfoHint:
    'Lukt het nog steeds niet? Kopieer de verbindingsgegevens en stuur ze naar degene die je helpt. Er staan geen account en geen bestandspaden in.',
  actionCopyInfo: 'Gegevens kopiëren voor hulp',
  copyInfoDone: 'Gekopieerd',
  actionConnectHelp: 'Bekijk elke stap op het scherm (pagina in het Koreaans)',
} satisfies Record<keyof typeof zh, string>
