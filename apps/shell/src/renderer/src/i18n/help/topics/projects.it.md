# Progetti

Un progetto è una cartella del tuo PC. Scegli un progetto in un pannello IA e l'IA lavora conoscendo i file, le istruzioni, la memoria e le chat di quella cartella. Tieni in un'unica cartella i documenti di uno stesso lavoro: una chat iniziata in Docs può continuare in Hangul o in Slides, senza dover rispiegare il contesto in ogni documento.

## Scegliere un progetto

- Nel pannello IA di ogni editor e in **Ask AI** della Home, il nome del progetto attuale si trova a sinistra, sotto il campo di input. Se non ne hai scelto nessuno, c'è scritto **Nessun progetto**.
- Fai clic sul nome per aprire l'elenco: progetti **Fissati** e **Recenti**, **Nuovo progetto**, **Aggiungi cartella** e **Nessun progetto**. Scrivi nella casella in alto per cercare; se nessun progetto corrisponde, puoi crearne uno nuovo con quel nome.
- Passando il puntatore su una riga compaiono fissa, **Apri cartella** e **Togli dall'elenco**. Togliere un progetto dall'elenco lascia la cartella e i suoi file come sono.
- Un progetto la cui cartella è stata spostata o eliminata appare attenuato come **Cartella mancante**. Fai clic e scegli la cartella spostata per continuare con lo stesso progetto.
- Se apri un documento che si trova nella cartella di un progetto, quel progetto è già scelto. Se per quel documento passi a **Nessun progetto**, resta così anche la volta successiva che lo apri. Anche il progetto che scegli per un documento fuori dalla cartella viene ricordato per quel documento.
- Il progetto scelto vale dalla richiesta successiva di quel pannello. Cambiarlo a metà di una chat avvia una nuova chat; quella in cui eri rimane dov'era.

## Nuovo progetto e Aggiungi cartella

- **Nuovo progetto**: scrivi un nome e nella tua cartella di salvataggio predefinita (all'inizio `Documenti\GenOffice`; puoi cambiarla nelle Impostazioni) viene creata una cartella con quel nome. **Crea altrove…** ti permette di scegliere un'altra posizione. Se una cartella con quel nome esiste già, ti viene chiesto se usarla come progetto, e **Usa questa cartella** parte da lì. Se quella cartella è già un progetto del tuo elenco, si apre subito, senza domande.
- **Aggiungi cartella** (**Usa una cartella esistente** nella schermata Progetti della Home): usa una cartella che hai già. Le sue sottocartelle sono comprese. Non si possono scegliere un'intera unità, l'intera cartella utente né cartelle che contengono dati di accesso o i dati dell'app.
- Se apri un documento che si trova nella cartella di un progetto non presente nel tuo elenco, sotto il campo di input compare «Questo documento è nella cartella del progetto "…"» con un pulsante **Usa**. Fare clic equivale ad Aggiungi cartella.
- Quando una cartella ricevuta da un'altra persona contiene già istruzioni o memoria, `AGENTS.md` o `CLAUDE.md`, oppure chat scritte su un altro PC, l'app te le mostra una volta e chiede. **Mostra tutto** ti fa leggere tutto prima. **Usa con le istruzioni** prende tutto. **Usa senza istruzioni** tiene quelle istruzioni e quella memoria lontane dall'IA, nasconde le chat degli altri PC e smette di aggiungere memoria; la lettura dei file continua a funzionare. Più tardi puoi cambiare con **Usa anche le istruzioni** dalla pagina del progetto. Se premi **Annulla** o chiudi la domanda senza scegliere, la cartella non viene aggiunta.
- Dopo di che la domanda non torna. Se le istruzioni o la memoria cambiano fuori da GenOffice, il pannello IA mostra una volta «Istruzioni modificate», e **Visualizza** apre quella parte della pagina del progetto.

## Istruzioni e memoria

- Le **istruzioni** sono le regole di questo progetto, per esempio «Scrivi i resoconti per punti e non abbreviare mai il nome dell'ente». Scrivile nella pagina del progetto nella Home e premi **Salva**. Se nella cartella principale ci sono `AGENTS.md` o `CLAUDE.md`, vengono letti anche quelli, e puoi disattivarli dalla pagina del progetto.
- La **memoria** sono appunti che l'IA scrive durante le chat: fatti, preferenze e decisioni che serviranno più avanti, uno per riga con la data. Ogni volta che ne scrive uno, il pannello IA mostra «Ricordato: …» con un pulsante **Elimina**. Se quell'appunto è già stato eliminato, la riga dice «Memoria cancellata: …» e non ha il pulsante **Elimina**. Non ti chiede il permesso prima.
- Quando la memoria si allunga, il pannello IA mostra «La memoria sta diventando lunga» con **Riordina**. Premendolo si uniscono gli appunti che si sovrappongono o non sono più attuali. La versione precedente viene conservata e **Annulla** la ripristina. Il riordino avviene solo quando premi il pulsante, e invia una richiesta all'IA.
- Nella pagina del progetto puoi eliminare appunti, modificare tutta la memoria e disattivarla. Disattivata, non si scrive niente di nuovo e la memoria esistente continua a essere letta.
- Le istruzioni molto lunghe perdono la parte finale, e il pannello IA te lo segnala. La memoria viene sempre inviata per intero, per quanto lunga.

## I file che vede l'IA

- A ogni richiesta l'IA riceve il nome del progetto, le istruzioni, la memoria e un elenco con i nomi dei file della cartella. Quando le serve il contenuto di un file, lo legge da sola, come un allegato, quindi le parti nascoste all'IA restano nascoste.
- Non legge i documenti aperti con modifiche non salvate, i file nascosti il cui nome inizia con un punto né la cartella `.ieumoffice`.
- Per tenere un file lontano dall'IA, premi **Nascondi all'IA** nella sezione File della pagina del progetto. Puoi annullarlo. Il file continua a comparire nei risultati di ricerca della Home.
- Nelle cartelle sincronizzate da OneDrive, Google Drive e servizi simili, i file non scaricati su questo PC appaiono come «Non su questo PC». Quando l'IA vuole leggerne uno, ti viene prima chiesto se scaricarlo.
- Digita `@` nel campo di input e dopo i documenti aperti compare «File di questo progetto». Sceglierne uno lo allega. Vedi [Il pannello dell'assistente IA](help://ai-panel).
- I nuovi documenti che l'IA crea in un progetto vengono salvati nella cartella del documento attuale, oppure nella cartella principale del progetto se la richiesta parte dalla Home. Se il nome è già occupato, viene aggiunto `(2)` così nessun file viene sostituito.

## Chat

- Un pannello IA con un progetto scelto mostra in alto il titolo della chat attuale. Fai clic per vedere l'elenco delle chat di questo progetto, una casella di ricerca e **Nuova chat**. Qualsiasi chat dell'elenco si può riprendere in qualsiasi editor.
- Ciò che è stato fatto in un altro editor appare su una riga sola, per esempio «3 strumenti eseguiti in Hangul "relazione.hwp"». L'IA usa solo gli strumenti dell'editor in cui ti trovi.
- Aprendo un documento compare l'ultima chat usata in quel documento. Se due finestre hanno aperta la stessa chat, un messaggio inviato in una compare subito nell'altra.
- Le chat scritte su un altro PC sono contrassegnate con **Altro PC**.
- Nell'elenco puoi rinominare o eliminare le chat. Una chat eliminata finisce nel cestino.
- Le chat che un documento aveva prima di questa funzione si trovano in fondo all'elenco, sotto **Chat precedenti di questo documento**.
- Le chat con **Nessun progetto** vengono salvate per documento, come prima. In Ask AI della Home senza progetto, la chat finisce quando chiudi l'app.

## La pagina del progetto nella Home

**Progetti**, nella barra laterale della Home, è il posto dove crei un **Nuovo progetto**, scegli **Usa una cartella esistente** e ne apri uno per gestirlo.

- **Intestazione**: il nome (cambiarlo non rinomina la cartella), il percorso della cartella, **Apri in Esplora file** (su Mac **Mostra nel Finder**) e lo stato. Quando il progetto è usato senza istruzioni, compare **Usa anche le istruzioni**.
- **Istruzioni**: la casella delle istruzioni, e gli `AGENTS.md` e `CLAUDE.md` letti insieme.
- **Memoria**: l'elenco degli appunti, **Modifica tutto**, **Riordina**, memoria attiva o disattivata.
- **File**: i file che l'IA vede e quelli tenuti fuori. Fai clic sul nome di un file per aprirlo.
- **Chat**: le chat di questo progetto. Fai clic su una per aprire il documento in cui è stata usata l'ultima volta e continuare in quel pannello IA.
- Questa pagina rilegge la cartella ogni volta che viene mostrata, così un appunto che l'IA ha appena memorizzato compare senza uscirne. Se il file delle istruzioni o della memoria è cambiato fuori da GenOffice mentre lo modificavi, **Salva** chiede prima: **Ricarica** legge il file cambiato e **Salva comunque** lo sovrascrive con le tue modifiche.

## Cosa resta nella cartella, e cose da sapere

- Istruzioni, memoria e chat sono conservate come file di testo in una cartella `.ieumoffice` dentro la cartella del progetto. Se sposti la cartella o la copi su un altro PC, viaggiano con lei. Sull'altro PC, sceglila una volta con **Aggiungi cartella** in un pannello IA o con **Usa una cartella esistente** nella schermata Progetti della Home.
- La cartella `.ieumoffice` viene creata solo quando c'è qualcosa da scrivere. Puoi aprire e modificare i suoi file con il Blocco note.
- Quello che scrivi in una chat può finire nella memoria. Per tenere fuori qualcosa, eliminalo con **Elimina** sulla riga «Ricordato» oppure disattiva la memoria.
- Se scegli una cartella sincronizzata come progetto, anche istruzioni, memoria e chat vengono caricate su quel servizio. L'app te lo dice una volta, la prima volta che la scegli.
- In una cartella condivisa usata da più persone, memoria e chat possono mescolarsi.
- In una cartella in cui l'app non può scrivere, per esempio una di sola lettura, istruzioni e lettura dei file funzionano ancora, ma chat e memoria non vengono salvate. Il pannello IA te lo segnala.
- La finestra dell'agente non usa ancora i progetti. Un agente può modificare anche i file nella cartella `.ieumoffice`, quindi in una cartella con materiale che non conosci usa uno dei modi che chiedono prima. Vedi [Modalità agente](help://agent-mode).
