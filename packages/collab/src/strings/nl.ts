import type { zh } from './zh'

export const nl = {
  button: 'Samenwerken',
  dialogTitle: 'Samenwerken',
  tabShare: 'Dit document delen',
  tabJoin: 'Deelnemen',
  nameLabel: 'Mijn naam',
  nameHint: 'Wordt bij anderen op het scherm naast je cursor weergegeven.',
  colorLabel: 'Mijn kleur',
  colorChoice: 'Kleur {n}',
  shareIntro:
    'Mensen op hetzelfde netwerk (LAN) kunnen dit document samen met jou bekijken en bewerken nadat ze de PIN-code hebben ingevoerd. Het bestand wordt alleen op deze pc opgeslagen.',
  shareStart: 'Delen starten',
  shareStarting: 'Starten…',
  shareStop: 'Delen stoppen',
  pinLabel: 'PIN-code',
  pinNew: 'Nieuwe PIN-code',
  pinChanged:
    'Er zijn te veel onjuiste PIN-codes geprobeerd, daarom is de PIN-code vervangen. Wie al deelneemt, blijft verbonden.',
  addressLabel: 'Adres van deze pc',
  peopleLabel: 'Deelnemers',
  nobodyYet: 'Nog niemand heeft zich aangesloten.',
  you: 'jij',
  hostBadge: 'deelt',
  joinIntro:
    'Voer de PIN-code in die je hebt gekregen van de persoon die deelt. Kies een document dat op dit netwerk is gevonden, of typ het adres.',
  searching: 'Gedeelde documenten op dit netwerk zoeken…',
  foundLabel: 'Gevonden',
  foundBy: 'gedeeld door {name}',
  addressInput: 'Adres',
  addressPlaceholder: 'bijv. 192.168.0.12',
  pinInput: 'PIN-code (6 cijfers)',
  join: 'Deelnemen',
  joining: 'Verbinden…',
  close: 'Sluiten',
  leave: 'Verlaten',
  errPin: 'Die PIN-code klopt niet.',
  errLocked: 'Te veel onjuiste PIN-codes. Deze pc kan het 10 minuten lang niet opnieuw proberen.',
  errFull: 'Deze sessie is vol.',
  errVersion:
    'Op de andere pc draait een andere versie van de app. Werk beide pc’s bij naar dezelfde versie.',
  errUnreachable:
    'Kan geen verbinding maken met dat adres. Controleer het adres, het netwerk en de firewall van de pc die deelt.',
  errTimeout: 'De pc die deelt reageert niet.',
  errInvalid: 'Controleer het adres en de PIN-code.',
  errUnavailable: 'Dit document kan op deze pc niet worden geopend.',
  errShareNetwork:
    'Delen kan op deze pc niet worden gestart. Controleer of een ander programma het netwerk blokkeert.',
  errShareTooLarge: 'Dit document is te groot om te delen.',
  errShareBusy: 'Dit tabblad is al in een sessie.',
  errShareSaveFirst: 'Er zijn niet-opgeslagen wijzigingen. Sla eerst op en deel daarna.',
  errShareEncrypted: 'Een document met een wachtwoord kan niet worden gedeeld.',
  errShareUnsupported: 'Dit document kan nu niet worden gedeeld.',
  endedByHost:
    'De persoon die deelt heeft de sessie beëindigd. Dit document is nu een niet-opgeslagen kopie op deze pc.',
  endedLost:
    'De verbinding met de pc die deelt is verbroken. Dit document is nu een niet-opgeslagen kopie op deze pc.',
  endedLeft: 'Je hebt de sessie verlaten. Dit document is nu een niet-opgeslagen kopie op deze pc.',
  endedHostStopped: 'Delen gestopt.',
  guestSaveBlocked: 'Tijdens een sessie slaat de persoon die deelt het bestand op.',
  guestBlocked: 'Dit is niet beschikbaar tijdens een sessie.',
  hostBlocked: 'Dit is niet beschikbaar zolang anderen aan de sessie deelnemen.',
  viewOnly:
    'In deze indeling kan alleen de persoon die deelt bewerken; deelnemers kijken live mee.',
  lanNotice:
    'Wat je uitwisselt is versleuteld, dus alleen wie de PIN-code invoert kan het lezen. Tijdens het delen zijn je naam en de documenttitel zichtbaar op het netwerk.',
  firewallHint:
    'Als Windows Firewall erom vraagt wanneer je voor het eerst deelt, sta dan toegang toe op privénetwerken.',
  statusHosting: 'Delen · {count}',
  statusGuest: 'In het document van {name}',
  dismiss: 'Begrepen',
} satisfies Record<keyof typeof zh, string>
