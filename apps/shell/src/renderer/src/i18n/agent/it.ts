import type { zh } from './zh'

export const it = {
  windowTitle: 'Agente',
  homeCardSub: 'Lavora in una cartella con Claude Code o Codex',
  intro:
    'L’agente esegue il tuo Claude Code o Codex in una cartella che scegli tu. Può leggere i file che contiene, crearne di nuovi, usare le tue skill, eseguire script e modificare i documenti aperti in GenOffice.',
  folderLabel: 'Cartella del progetto',
  folderPick: 'Scegli una cartella…',
  folderNone: 'Nessuna cartella scelta',
  recentLabel: 'Cartelle recenti',
  providerLabel: 'Programma',
  providerClaude: 'Claude Code',
  providerCodex: 'Codex',
  providerClaudeNote:
    'Su Windows i comandi che consenti vengono eseguiti senza isolamento e possono raggiungere tutto il PC e internet.',
  providerCodexNote:
    'I comandi vengono eseguiti nello spazio isolato di Codex: si può scrivere solo nella cartella del progetto e non c’è accesso a internet.',
  providerBlocked:
    'Non ancora disponibile: non è ancora possibile impedire a Codex di leggere il proprio file di accesso.',
  connChecking: 'Verifica della connessione…',
  connUnavailable: 'Non connesso. Accedi da Impostazioni → IA.',
  connMetered: 'Connesso con un accesso a consumo che hai accettato.',
  modeLabel: 'Quando chiederti conferma',
  modeAskCommands: 'Chiedi prima di ogni comando',
  modeAskCommandsDesc:
    'La lettura e la scrittura dei file nella cartella del progetto avvengono subito. Prima di eseguire un comando o uno script, l’agente chiede.',
  modeAskWrites: 'Chiedi prima di scrivere e di eseguire comandi',
  modeAskWritesDesc:
    'Solo la lettura avviene subito. Prima di scrivere un file e prima di eseguire un comando, l’agente chiede.',
  modeTrust: 'Fidati di questo progetto',
  modeTrustDesc:
    'Non viene chiesto nulla. Codex resta comunque nel suo spazio isolato; per Claude Code è il suo stesso revisore a controllare ogni azione al posto tuo.',
  warningTitle: 'Prima di iniziare',
  warningCommands:
    'I comandi eseguiti dall’agente possono modificare file e usare internet. Un documento che ti ha mandato qualcuno può contenere istruzioni nascoste.',
  warningRedaction:
    'Le parti che hai nascosto all’AI restano nascoste solo nei documenti aperti in GenOffice. I file che l’agente legge dalla cartella vengono inviati così come sono.',
  warningUsage:
    'Un agente lavora in molti passaggi e consuma più del tuo abbonamento rispetto al pannello AI.',
  warningAccept: 'Ho capito',
  start: 'Avvia',
  starting: 'Avvio…',
  stop: 'Interrompi',
  newSession: 'Nuova sessione',
  send: 'Invia',
  inputPlaceholder: 'Che cosa deve fare l’agente?',
  you: 'Tu',
  agent: 'Agente',
  startedLine: '{program} avviato in {folder}',
  skillsLine: '{n} skill disponibili',
  skillsLineOne: '{n} skill disponibile',
  toolRunning: 'In corso',
  toolDone: 'Fatto',
  toolFailed: 'Non riuscito',
  toolDenied: 'Rifiutato',
  actRead: 'Leggi',
  actWrite: 'Scrivi',
  actCommand: 'Esegui',
  actAppTool: 'Modifica un documento aperto',
  actSkill: 'Usa una skill',
  actOther: 'Usa uno strumento',
  openFile: 'Apri',
  permTitle: 'L’agente chiede di:',
  permCommand: 'Eseguire questo comando',
  permWrite: 'Scrivere in questo file',
  permRead: 'Leggere un file fuori dalla cartella del progetto',
  permOther: 'Usare lo strumento «{tool}»',
  permReason: 'Motivo: {reason}',
  permAllow: 'Consenti',
  permDeny: 'Rifiuta',
  turnFailed: 'L’agente non è riuscito a completare questa richiesta.',
  ended: 'La sessione è terminata.',
  errBadFolder:
    'Questa cartella non può essere usata. Scegli una cartella con il tuo lavoro: non un’intera unità, non la tua cartella utente e non una cartella di dati di accesso o delle app.',
  errNotConnected: 'Questo programma non è connesso. Accedi da Impostazioni → IA e riprova.',
  errNotAccepted: 'Leggi prima le note qui sopra e confermale.',
  errUnsafeTools:
    'Il programma si è avviato con strumenti che l’app non gli ha dato, quindi è stato fermato.',
  errRateLimit: 'Il limite del tuo abbonamento è esaurito. Riprova più tardi.',
  errSignedOut: 'Il programma è disconnesso. Accedi da Impostazioni → IA.',
  errMetered: 'Il programma è connesso con un accesso a consumo che non hai accettato.',
  errSandboxUnavailable:
    'Codex non riesce ad aprire su questo PC la sandbox che isola i suoi comandi, quindi non è stato avviato. Aggiorna Windows oppure scegli Claude Code.',
  errNeedsUpdate: 'Il programma è troppo vecchio per la modalità agente. Aggiornalo e riprova.',
  errNotInstalled: 'Il programma non è installato.',
  errGeneric: 'Si è verificato un problema. Riprova.',
  documentsUnprotected:
    'I documenti aperti dopo l’avvio della sessione ({n}) non sono coperti dalla protezione in scrittura del programma. Interrompi e riavvia la sessione per proteggerli.',
} satisfies Record<keyof typeof zh, string>
