import type { zh } from './zh'

export const it = {
  aiAssistant: 'Assistente IA',
  cardChecking: 'Verifica in corso…',
  cardNotInstalled: 'Non installato',
  cardSignedOut: 'Accesso non effettuato',
  cardSigningIn: 'Accesso in corso…',
  cardReady: 'Connesso',
  cardReadyPlan: 'Connesso · {plan}',
  cardMetered: 'Accesso effettuato, ma non con un abbonamento',
  cardMeteredAccepted: 'In uso · addebito a consumo',
  cardError: 'Impossibile verificare la connessione',
  cardErrNeedsUpdate:
    'Il programma {provider} su questo PC è troppo vecchio. Aggiornalo, poi verifica di nuovo.',
  cardErrNeedsUpdateVersion:
    'Il programma {provider} su questo PC ({version}) è troppo vecchio; serve la {minimum} o successiva. Esegui {command} in un terminale, poi verifica di nuovo.',
  cardErrNeedsUpdatePath: 'File eseguito da questa app:',
  cardErrNeedsUpdateWindows:
    'Aggiornare {provider} dentro WSL (Ubuntu) o in un’altra cartella non modifica questo file. Esegui {command} in Windows PowerShell.',
  cardErrTimeout:
    'Il programma {provider} non ha risposto in tempo. Verifica di nuovo tra un momento.',
  cardErrFailed:
    'Si è verificato un problema durante la verifica di {provider}. Verifica di nuovo.',
  actionInstall: 'Installa',
  actionLogin: 'Accedi',
  actionLoginWindow: 'Il browser non si è aperto?',
  actionRecheck: 'Verifica di nuovo',
  actionAcceptMetered: 'Usa comunque',
  actionInstallHelp: 'Guida ufficiale all’installazione',
  actionOpenSettings: 'Apri impostazioni',
  actionDismiss: 'Chiudi',
  actionSwitchAccount: 'Accedi con un altro account',
  actionLogout: 'Esci',
  installNote:
    'Il comando di installazione ufficiale di {vendor} viene eseguito in una nuova finestra del terminale.',
  loginNote: 'La pagina di accesso che si apre è quella di {vendor}.',
  signingInBrowserNote:
    'Accedi al tuo account {vendor} nel browser che si è aperto e consenti l’accesso. La connessione avviene da sola quando hai finito.',
  signingInWindowNote:
    'Segui le indicazioni in alto nella finestra di accesso appena aperta. Accedi nella pagina di {vendor} che si è aperta nel browser: la finestra si chiude da sola e la connessione si completa. Una pagina di accesso aperta prima non funziona più; chiudila.',
  meteredWarning: 'Non è un abbonamento: paghi in base a quanto usi.',
  meteredMeaning:
    'Questo accesso usa una chiave API o un account a consumo, oppure non è stato possibile confermarne il tipo. Con “Usa comunque” l’IA funziona su questa connessione e ogni richiesta viene addebitata a quell’account.',
  connectTitle: 'Collega un’IA per iniziare',
  connectBody:
    'L’IA funziona con l’abbonamento Claude o Codex che hai già. Non serve alcuna chiave API.',
  connectProviderTitle: 'La connessione {provider} non è utilizzabile al momento',
  connectKeyBody:
    'La configurazione di {provider} non è completa. Completala nelle Impostazioni oppure scegli un’altra IA.',
  errNotConnected:
    'Nessuna IA è collegata. Collega prima un abbonamento Claude o Codex, oppure un’IA gratuita.',
  errNotInstalled: 'Il programma {provider} non è stato trovato su questo PC.',
  errSignedOut: 'L’accesso a {provider} è scaduto. Accedi di nuovo per continuare.',
  errRateLimit: 'Il limite dell’abbonamento {provider} è stato raggiunto.',
  errRateLimitReset:
    'Il limite dell’abbonamento {provider} è stato raggiunto. Si azzera alle {time}.',
  errUnsafeTools:
    'Il programma {provider} è stato avviato con i propri strumenti attivi, quindi l’esecuzione è stata interrotta per sicurezza.',
  errMeteredNotAccepted:
    'La connessione {provider} è a consumo e non l’hai ancora consentita. Scegli “Usa comunque” nelle impostazioni di connessione per usarla.',
  errNeedsUpdate:
    'Il programma {provider} è troppo vecchio per questa funzione. Aggiornalo e riprova.',
  errHeadlessLimit: 'È stato raggiunto il limite orario delle richieste automatiche.',
  errHeadlessLimitReset:
    'È stato raggiunto il limite orario delle richieste automatiche. Saranno di nuovo possibili alle {time}.',
  connectFreeHint:
    'Non hai un abbonamento? Puoi collegare un’IA gratuita nelle Impostazioni in circa un minuto.',
  actionConnectFree: 'Collega un’IA gratuita',
  errFreeLimit:
    'La quota gratuita di oggi è esaurita. Riprova domani oppure scegli un’altra IA nelle Impostazioni.',
  errFreeLimitReset: 'La quota gratuita di oggi è esaurita. Potrai usarla di nuovo alle {time}.',
  continueWith: 'Continua con {provider}',
  continueMeteredNote:
    'La connessione {provider} non è un abbonamento: continuando paghi a consumo.',
  usageLine: '{percent}% usato · si azzera alle {time}',
  usageWindowFiveHour: 'Limite di 5 ore',
  usageWindowSevenDay: 'Limite di 7 giorni',
  noticeTitle: 'Prima di usare l’IA con il tuo abbonamento',
  noticeSend:
    "Il contenuto del documento e la conversazione vengono inviati ad Anthropic o a OpenAI con il tuo account personale. Ogni richiesta porta anche nome, titolo e descrizione di ogni abilità impostata su “Decide l'IA”; vengono inviate anche le abilità in uso e i file delle abilità letti dall’IA.",
  noticeTraining:
    'L’uso di questi contenuti per addestrare l’IA dipende dalle impostazioni del tuo account presso quell’azienda.',
  noticeCodexHistory:
    'Questa app disattiva il salvataggio della cronologia delle conversazioni di Codex, ma Codex può comunque conservare i propri log di diagnostica su questo PC.',
  noticePdfWholeDocument:
    'Nell’editor PDF, la lettura delle pagine con l’IA e la traduzione dei documenti possono inviare le immagini delle pagine e l’intero testo del documento.',
  noticeAck: 'Ho capito',
  codexNotice:
    'Usare un abbonamento Codex all’interno di un’app non è un metodo ufficialmente consigliato da OpenAI.',
  truncatedNotice: 'L’input era troppo lungo, quindi una parte è stata tagliata prima dell’invio.',
  pickerAuto: 'Automatico',
  pickerAutoUsing: 'Automatico · {provider}',
  pickerAutoUsingModel: 'Automatico · {provider} · {model}',
  pickerDefaultModel: 'Modello predefinito',
  pickerDefaultModelNamed: 'Modello predefinito · {model}',
  pickerSubscription: 'Abbonamento',
  pickerPaid: 'A pagamento',
  pickerPaidTitle: 'Addebito a consumo, non coperto da un abbonamento',
  pickerNotConnected: 'Collega l’IA',
  guideQuestion: 'Quale IA usi già?',
  guidePathClaudeTitle: 'Ho un abbonamento Claude a pagamento',
  guidePathClaudeBody:
    'Serve un piano Pro o Max. Con un account Claude gratuito non è possibile collegarsi.',
  guidePathCodexTitle: 'Uso ChatGPT',
  guidePathCodexBody:
    'Accedi al programma Codex di OpenAI con il tuo account ChatGPT. Il piano gratuito consente solo un uso limitato.',
  guidePathFreeTitle: 'Nessuno dei due, per ora',
  guidePathFreeBody:
    'Collega un’IA gratuita in circa un minuto. Finché la usi gratis, ciò che invii può essere usato per migliorare l’IA di quell’azienda.',
  guideBack: 'Scegli un altro modo',
  guideBadgeReady: 'Connesso',
  guideBadgeInstalled: 'Installato',
  guideBadgeCheck: 'Da verificare',
  guideStepsLabel: 'Passaggi di connessione',
  stepInstall: 'Installa il programma',
  stepLogin: 'Accedi',
  stepReady: 'Connesso',
  installReturnNote:
    'Quando l’installazione in quella finestra è finita, torna qui. L’app verifica di nuovo da sola.',
  loginHowNote:
    'Premendo si apre un browser. Accedi con il tuo account {vendor} e premi Consenti: la connessione si completa da sola.',
  signingInStalledNote:
    'Se nel browser non si è aperta nessuna pagina di accesso, apri la finestra di accesso con il pulsante qui sotto. Se stai ancora effettuando l’accesso nel browser, completalo lì: il pulsante interrompe quell’accesso e ricomincia da capo.',
  actionLoginWindowOpen: 'Apri la finestra di accesso',
  loginWindowTitle: 'Accesso a {provider}',
  loginWindowIntro:
    'Questa è la finestra di accesso del programma {provider}. Il testo in inglese qui sotto viene dal programma {provider}.',
  loginWindowStepBrowser:
    'Quando nel browser si apre la pagina di accesso di {vendor}, accedi e consenti l’accesso. Poi questa finestra si chiude da sola.',
  loginWindowStepAddress:
    'Se non si è aperto nessun browser, seleziona l’indirizzo qui sotto che inizia con https:// trascinandoci sopra il mouse, poi fai clic con il tasto destro per copiarlo. Incollalo nella barra degli indirizzi del browser per aprire la pagina di accesso.',
  loginWindowStepCode:
    'Se dopo l’accesso il browser mostra un codice, copia il codice intero (usa il suo pulsante di copia, se c’è). Fai clic una volta con il tasto destro dentro questa finestra per incollarlo, poi premi Invio. È normale che il codice incollato non compaia.',
  loginWindowStepInvalid:
    'Se compare "Invalid code", il codice non è stato copiato per intero. Lascia aperta questa finestra, copia di nuovo il codice e incollalo.',
  loginWindowClosing:
    'L’accesso non è stato completato. Dopo aver letto i messaggi qui sopra, premi Invio per chiudere questa finestra. Per riprovare, premi di nuovo il pulsante di accesso.',
  actionCancelLogin: 'Annulla l’accesso',
  actionUpdate: 'Aggiorna',
  updateNote:
    'Premendo, l’aggiornamento ufficiale di {vendor} viene eseguito in una nuova finestra. Quando lì è finito, torna qui.',
  guideInfoHint:
    'Ancora niente? Copia i dati di connessione e inviali a chi ti sta aiutando. Non contengono account né percorsi di file.',
  actionCopyInfo: 'Copia i dati per l’assistenza',
  copyInfoDone: 'Copiato',
  actionConnectHelp: 'Guarda ogni passaggio sullo schermo (pagina in coreano)',
} satisfies Record<keyof typeof zh, string>
