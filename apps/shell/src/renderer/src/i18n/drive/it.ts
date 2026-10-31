import type { zh } from './zh'

export const it = {
  driveNav: 'Google Drive',
  driveDesc:
    'Scegli i file in Google Drive, poi aprili e modificali in GenOffice; salvando tornano su Drive. GenOffice può aprire solo i file che scegli.',
  driveConnect: 'Collega Google Drive',
  driveConnecting: 'Accedi con il tuo account Google nel browser e consenti l’accesso…',
  driveCancel: 'Annulla',
  driveConnectedAs: 'Collegato come {email}',
  driveDisconnect: 'Scollega',
  driveDisconnectConfirm:
    'L’accesso a Drive verrà rimosso da questo PC e Google riceverà la richiesta di revocare l’accesso di GenOffice. Le copie già su questo PC restano.',
  driveDisconnectYes: 'Scollega',
  driveNotPersisted:
    'Questo PC non può conservare l’accesso in forma cifrata, quindi il collegamento termina alla chiusura dell’app.',
  driveExpired:
    'Google ha chiuso il collegamento: l’accesso è stato revocato o è scaduto. Collegati di nuovo.',
  driveAiAccess: 'Consenti all’IA di trovare e leggere i file in Drive',
  driveAiAccessDesc:
    'Se attivo, l’IA degli editor può cercare e leggere i file di Drive che hai scelto qui. Ciò che legge va al fornitore di IA che usi. L’IA non può modificare, eliminare né condividere i file di Drive.',
  drivePrivacy:
    'Elenchi e contenuti dei file passano solo tra questo PC e Google. Non transitano mai da un server degli autori di GenOffice.',
  driveFailDenied: 'Il collegamento non è riuscito perché Google non lo ha consentito.',
  driveFailScope:
    'Il collegamento non è riuscito perché l’accesso a Drive non era selezionato. Collegati di nuovo e seleziona la voce Drive.',
  driveFailTimeout: 'L’accesso non è stato completato entro 10 minuti. Riprova.',
  driveFailNetwork:
    'Impossibile raggiungere Google. Controlla la connessione a internet e riprova.',
  driveRecent: 'File scelti',
  driveSearchPlaceholder: 'Cerca nei file scelti',
  driveSearchResults: 'Risultati per “{q}”',
  driveRefresh: 'Aggiorna',
  driveNotConnectedTitle: 'Google Drive non è collegato',
  driveNotConnectedBody:
    'Una volta collegato, puoi scegliere i file di Drive, aprirli e modificarli qui, e salvando tornano su Drive.',
  driveOpenSettings: 'Collega nelle Impostazioni',
  driveEmpty: 'Ancora nessun file. Fai clic su “Scegli da Google Drive” per sceglierne qualcuno.',
  driveLoading: 'Caricamento…',
  driveLoadMore: 'Mostra altro',
  driveOpening: 'Apertura…',
  driveGoogleBadge: 'Formato Google',
  driveGoogleNote:
    'Un documento Google si apre come file Office. Salvando, l’originale resta com’è e un file Office viene salvato accanto, oppure in Il mio Drive.',
  driveReadOnly: 'Sola lettura',
  driveReadOnlyNote:
    'Non puoi modificare questo file. Al salvataggio ti verrà chiesto se salvare una copia su Drive.',
  driveUnsupported: 'Questa app non può aprire questo tipo di file.',
  driveErrNotConnected: 'Google Drive è scollegato. Collegalo di nuovo nelle Impostazioni.',
  driveErrNotFound: 'File non trovato. È stato eliminato, oppure questo account non può vederlo.',
  driveErrForbidden: 'Questo account non può scaricare questo file.',
  driveErrTooLarge: 'Il file è troppo grande per essere aperto.',
  driveErrRateLimit: 'Google sta trattenendo le richieste per un momento. Riprova tra poco.',
  driveErrNetwork: 'Impossibile raggiungere Google Drive. Controlla la connessione a internet.',
  driveErrDisk: 'Impossibile salvare il file su questo PC.',
  drivePick: 'Scegli da Google Drive',
  drivePicking: 'Scegli i file nella finestra di Google che si è aperta nel browser…',
  drivePickNote:
    'GenOffice può aprire solo i file di Drive che scegli nella finestra di Google. I file scelti una volta restano in questo elenco.',
  driveTrainingTitle: 'Prima di usare i file di Drive con l’IA',
  driveTrainingBody:
    'Google non consente di inviare i file di Drive a un servizio di IA che li usa per addestrare i suoi modelli. I piani personali di Claude, ChatGPT e Codex possono usare le tue chat per l’addestramento se non lo disattivi: in Claude in Impostazioni → Privacy, in ChatGPT in Impostazioni → Controlli dati → “Migliora il modello per tutti”. I fornitori con chiave API non addestrano sui dati dell’API per impostazione predefinita. Le connessioni IA gratuite non ricevono mai file di Drive.',
  driveTrainingAck:
    'L’addestramento dei modelli è disattivato negli account IA che uso con i file di Drive',
  driveFailTraining: 'Prima seleziona la voce sull’addestramento dei modelli qui sopra.',
} satisfies Record<keyof typeof zh, string>
