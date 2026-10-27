import type { zh } from './zh'

export const it = {
  button: 'Collabora',
  dialogTitle: 'Collabora',
  tabShare: 'Condividi questo documento',
  tabJoin: 'Partecipa',
  nameLabel: 'Il mio nome',
  nameHint: 'Viene mostrato accanto al tuo cursore sullo schermo degli altri.',
  colorLabel: 'Il mio colore',
  colorChoice: 'Colore {n}',
  shareIntro:
    'Le persone sulla stessa rete (LAN) possono visualizzare e modificare questo documento con te dopo aver inserito il PIN. Il file viene salvato solo su questo PC.',
  shareStart: 'Avvia condivisione',
  shareStarting: 'Avvio in corso…',
  shareStop: 'Interrompi condivisione',
  pinLabel: 'PIN',
  pinNew: 'Nuovo PIN',
  pinChanged:
    'Sono stati provati troppi PIN errati, quindi il PIN è stato sostituito. Chi è già entrato resta nella sessione.',
  addressLabel: 'Indirizzo di questo PC',
  peopleLabel: 'Partecipanti',
  nobodyYet: 'Non è ancora entrato nessuno.',
  you: 'tu',
  hostBadge: 'condivide',
  joinIntro:
    'Inserisci il PIN che ti ha dato chi condivide. Scegli un documento trovato su questa rete o digita l’indirizzo.',
  searching: 'Ricerca di documenti condivisi su questa rete…',
  foundLabel: 'Trovati',
  foundBy: 'condiviso da {name}',
  addressInput: 'Indirizzo',
  addressPlaceholder: 'es. 192.168.0.12',
  pinInput: 'PIN (6 cifre)',
  join: 'Partecipa',
  joining: 'Connessione in corso…',
  close: 'Chiudi',
  leave: 'Esci',
  errPin: 'Il PIN non è corretto.',
  errLocked: 'Troppi PIN errati. Questo PC non può riprovare per 10 minuti.',
  errFull: 'Questa sessione è al completo.',
  errVersion:
    'L’altro PC usa una versione diversa dell’app. Aggiorna entrambi i PC alla stessa versione.',
  errUnreachable:
    'Impossibile connettersi a quell’indirizzo. Controlla l’indirizzo, la rete e il firewall del PC che condivide.',
  errTimeout: 'Il PC che condivide non risponde.',
  errInvalid: 'Controlla l’indirizzo e il PIN.',
  errUnavailable: 'Impossibile aprire questo documento su questo PC.',
  errShareNetwork:
    'Impossibile avviare la condivisione su questo PC. Controlla se un altro programma sta bloccando la rete.',
  errShareTooLarge: 'Questo documento è troppo grande per essere condiviso.',
  errShareBusy: 'Questa scheda è già in una sessione.',
  errShareSaveFirst: 'Ci sono modifiche non salvate. Salva prima, poi condividi.',
  errShareEncrypted: 'Un documento protetto da password non può essere condiviso.',
  errShareUnsupported: 'Al momento questo documento non può essere condiviso.',
  endedByHost:
    'Chi condivide ha terminato la sessione. Ora questo documento è una copia non salvata su questo PC.',
  endedLost:
    'La connessione al PC che condivide si è interrotta. Ora questo documento è una copia non salvata su questo PC.',
  endedLeft: 'Hai lasciato la sessione. Ora questo documento è una copia non salvata su questo PC.',
  endedHostStopped: 'Condivisione interrotta.',
  guestSaveBlocked: 'Durante una sessione, il file viene salvato da chi condivide.',
  guestBlocked: 'Questa funzione non è disponibile durante una sessione.',
  hostBlocked: 'Questa funzione non è disponibile mentre altre persone sono nella sessione.',
  viewOnly:
    'In questo formato solo chi condivide può modificare; chi partecipa segue le modifiche in tempo reale.',
  lanNotice:
    'I contenuti scambiati sono cifrati: solo chi inserisce il PIN può leggerli. Durante la condivisione, il tuo nome e il titolo del documento sono visibili in rete.',
  firewallHint:
    'Se Windows Firewall lo chiede la prima volta che condividi, consenti l’accesso sulle reti private.',
  statusHosting: 'In condivisione · {count}',
  statusGuest: 'Nel documento di {name}',
  dismiss: 'Ho capito',
} satisfies Record<keyof typeof zh, string>
