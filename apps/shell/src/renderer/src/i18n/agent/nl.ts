import type { zh } from './zh'

export const nl = {
  windowTitle: 'Agent',
  homeCardSub: 'Werk in een map met Claude Code of Codex',
  intro:
    'De agent voert je Claude Code of Codex uit in een map die je kiest. Hij kan de bestanden daarin lezen, nieuwe maken, je skills gebruiken, scripts uitvoeren en documenten wijzigen die in GenOffice geopend zijn.',
  folderLabel: 'Projectmap',
  folderPick: 'Kies een map…',
  folderNone: 'Geen map gekozen',
  recentLabel: 'Recente mappen',
  providerLabel: 'Programma',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'Op Windows worden opdrachten die je toestaat zonder afscherming uitgevoerd en kunnen ze bij je hele pc en het internet.',
  providerCodexNote:
    'Opdrachten worden uitgevoerd in de afgeschermde ruimte van Codex: alleen in de projectmap kan worden geschreven en er is geen internet.',
  providerBlocked:
    'Nog niet beschikbaar: Codex kan nog niet worden verhinderd zijn eigen aanmeldbestand te lezen.',
  connChecking: 'Verbinding controleren…',
  connUnavailable: 'Niet verbonden. Meld je aan via Instellingen → AI.',
  connMetered: 'Aangemeld met een login met betalen per gebruik die je hebt geaccepteerd.',
  modeLabel: 'Wanneer je iets vragen',
  modeAskCommands: 'Vragen voor elke opdracht',
  modeAskCommandsDesc:
    'Bestanden in de projectmap lezen en schrijven gebeurt direct. Voor het uitvoeren van een opdracht of script wordt eerst gevraagd.',
  modeAskWrites: 'Vragen voor schrijven en opdrachten',
  modeAskWritesDesc:
    'Alleen lezen gebeurt direct. Voor het schrijven van een bestand en voor het uitvoeren van een opdracht wordt eerst gevraagd.',
  modeTrust: 'Dit project vertrouwen',
  modeTrustDesc:
    'Er wordt niets gevraagd. Codex blijft wel in zijn afgeschermde ruimte; bij Claude Code controleert zijn eigen controleur elke actie in jouw plaats.',
  warningTitle: 'Voordat je begint',
  warningCommands:
    'Opdrachten die de agent uitvoert, kunnen bestanden wijzigen en het internet gebruiken. Een document dat iemand je heeft gestuurd, kan verborgen instructies bevatten.',
  warningRedaction:
    'Delen die je voor AI hebt verborgen, blijven alleen verborgen in documenten die in GenOffice geopend zijn. Bestanden die de agent uit de map leest, worden ongewijzigd verstuurd.',
  warningUsage:
    'Een agent werkt in veel stappen en gebruikt meer van je abonnement dan het AI-paneel.',
  warningAccept: 'Begrepen',
  start: 'Starten',
  starting: 'Starten…',
  stop: 'Stoppen',
  newSession: 'Nieuwe sessie',
  send: 'Versturen',
  inputPlaceholder: 'Wat moet de agent doen?',
  you: 'Jij',
  agent: 'Agent',
  startedLine: '{program} gestart in {folder}',
  skillsLine: '{n} skills beschikbaar',
  skillsLineOne: '{n} skill beschikbaar',
  toolRunning: 'Bezig',
  toolDone: 'Klaar',
  toolFailed: 'Mislukt',
  toolDenied: 'Geweigerd',
  actRead: 'Lezen',
  actWrite: 'Schrijven',
  actCommand: 'Uitvoeren',
  actAppTool: 'Een geopend document bewerken',
  actSkill: 'Een skill gebruiken',
  actOther: 'Een hulpmiddel gebruiken',
  openFile: 'Openen',
  permTitle: 'De agent vraagt om:',
  permCommand: 'Deze opdracht uitvoeren',
  permWrite: 'Dit bestand schrijven',
  permRead: 'Een bestand buiten de projectmap lezen',
  permOther: 'Het hulpmiddel ‘{tool}’ gebruiken',
  permReason: 'Reden: {reason}',
  permAllow: 'Toestaan',
  permDeny: 'Weigeren',
  turnFailed: 'De agent kon dit verzoek niet afronden.',
  ended: 'De sessie is beëindigd.',
  errBadFolder:
    'Deze map kan niet worden gebruikt. Kies een map met je eigen werk: geen hele schijf, niet je gebruikersmap en geen map met aanmeld- of app-gegevens.',
  errNotConnected:
    'Dit programma is niet verbonden. Meld je aan via Instellingen → AI en probeer het opnieuw.',
  errNotAccepted: 'Lees eerst de opmerkingen hierboven en bevestig ze.',
  errUnsafeTools:
    'Het programma startte met hulpmiddelen die de app het niet had gegeven en is daarom gestopt.',
  errRateLimit: 'De limiet van je abonnement is op. Probeer het later opnieuw.',
  errSignedOut: 'Het programma is afgemeld. Meld je aan via Instellingen → AI.',
  errMetered:
    'Het programma is aangemeld met een login met betalen per gebruik die je niet hebt geaccepteerd.',
  errSandboxUnavailable:
    'Codex kan op deze pc de sandbox die zijn opdrachten afschermt niet openen en is daarom niet gestart. Werk Windows bij of kies Claude Code.',
  errNeedsUpdate:
    'Het programma is te oud voor de agentmodus. Werk het bij en probeer het opnieuw.',
  errNotInstalled: 'Het programma is niet geïnstalleerd.',
  errGeneric: 'Er ging iets mis. Probeer het opnieuw.',
  documentsUnprotected:
    'Documenten die na de start van de sessie zijn geopend ({n}) vallen buiten de schrijfbeveiliging van het programma. Stop en start de sessie opnieuw om ze te beschermen.',
} satisfies Record<keyof typeof zh, string>
