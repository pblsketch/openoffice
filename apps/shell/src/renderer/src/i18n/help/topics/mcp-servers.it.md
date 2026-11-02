# Collegare server MCP

Un server MCP è un servizio che offre all’IA strumenti esterni all’app, come la ricerca di leggi o di materiale gestito dal tuo team. Dopo aver collegato un server, le finestre IA di GenOffice possono chiamarne gli strumenti durante una conversazione. Sei tu a decidere, strumento per strumento, che cosa l’IA può usare e come.

## Aggiungere un server

1. Apri **Impostazioni ▸ Integrazioni** e premi **Aggiungi un server** nella scheda **Server MCP**.
2. Scegli come aggiungerlo.
   - **Incolla il testo delle impostazioni**: incolla per intero il testo delle impostazioni dalla guida del server e premi **Leggi**. GenOffice compila i campi. Se un unico testo contiene più server, li confermi uno alla volta. Se il testo legge una chiave o un valore da una variabile del PC (`${NOME}`), quel campo resta vuoto e lo compili tu.
   - **Inserisci a mano**: scrivi un nome e l’indirizzo. Se la guida del server ti fornisce una chiave, inseriscila nel campo **Chiave (facoltativa)**.
3. Leggi l’avviso sopra il pulsante di aggiunta e premi **Aggiungi**.
4. Appena aggiunto, GenOffice verifica subito la connessione e ottiene l’elenco degli strumenti. Un server che richiede un accesso ti aspetta invece di aprire il browser. Premi **Verifica connessione** per vedere l’elenco degli strumenti offerti dal server. Se il server richiede un accesso, premi **Accedi con il browser** e completa l’accesso nel browser.

Il nome di un server usa lettere, cifre, `-` e `_`, fino a 24 caratteri. L’IA vede gli strumenti di questo server con nomi della forma `mcp__name__tool`. Se un’abilità richiama strumenti con nomi di questa forma, aggiungi il server con lo stesso nome usato dall’abilità.

## Server tramite indirizzo e server su questo PC

- Un server **tramite indirizzo** si raggiunge con un indirizzo web. Gli indirizzi su internet devono iniziare con `https://`. `http://` funziona solo per questo PC e per indirizzi di rete privata, a casa o al lavoro, e prima confermi che chiavi e contenuto dei documenti viaggeranno senza cifratura.
- Un server **su questo PC** è un programma che GenOffice esegue su questo PC. La schermata di aggiunta mostra il programma esatto, i suoi argomenti e i nomi delle variabili d’ambiente che gli vengono passate. Viene eseguito per la prima volta solo dopo che premi **Consenti l’esecuzione**. Se il comando cambia in seguito, il server resta fermo finché non lo consenti di nuovo.
- Se un server su questo PC ha bisogno di un programma che questo PC non ha (Node.js, oppure uv per i server Python), GenOffice chiede nella scheda del server, in Impostazioni, se scaricarlo. Mostra la dimensione del download e non scarica nulla finché non premi **Scarica**. I programmi scaricati restano nella cartella dei dati di GenOffice e le impostazioni del tuo PC non vengono modificate.
- Un server su questo PC si avvia quando serve e si ferma dopo 10 minuti di inutilizzo. Si ferma anche quando chiudi GenOffice.

## Scegliere che cosa può fare ogni strumento

- Per ogni strumento, scegli **Consenti sempre**, **Chiedi prima** oppure **Non usare**.
- All’inizio gli strumenti che il server indica come di sola lettura sono su **Consenti sempre**, tutti gli altri su **Chiedi prima**.
- Quando l’IA chiama uno strumento impostato su **Chiedi prima**, nella finestra IA compare una scheda. Guarda che cosa verrà inviato e premi **Consenti solo questa volta**, **Consenti sempre in questa conversazione** oppure **Blocca**. Non viene eseguito nulla finché non premi uno dei pulsanti. Fermare l’IA o chiudere la finestra vale come bloccare.
- Se il server cambia la descrizione di uno strumento o i valori che accetta, quello strumento mostra **Da controllare** e resta nascosto all’IA finché non guardi la modifica e premi **Approva la modifica**. Una modifica alle indicazioni che il server dà all’IA si controlla allo stesso modo.
- I nuovi strumenti di un server vengono attivati con le stesse impostazioni iniziali, e la scheda e il pulsante nella finestra IA mostrano **Nuovi strumenti: n**. Il segno scompare quando apri l’elenco degli strumenti di quel server in Impostazioni.

## Usare i server in una finestra IA

- I server funzionano nelle finestre IA degli editor e in Ask AI della Home. Finché un server è attivo, accanto al campo di inserimento compare il pulsante **Server collegati**.
- Premilo per vedere lo stato di ogni server e per disattivare o attivare un server solo per questa conversazione. Una nuova conversazione parte con tutti i server che hai attivato in Impostazioni. Un server la cui connessione non è mai stata verificata mostra **Non ancora verificato**; verificala nelle Impostazioni per avere i suoi strumenti.
- Se disattivi **Consenti all’IA di usare gli strumenti internet** in **Impostazioni ▸ Media e ricerca IA**, vengono rimossi anche tutti gli strumenti dei server MCP.
- Quando un’abilità si aspetta uno strumento da un server che al momento non puoi usare, l’IA dice nella risposta quale passaggio non ha potuto eseguire. **Impostazioni ▸ Abilità** mostra anche, accanto all’abilità, il server di cui ha bisogno.
- Anche la finestra dell’agente può usare gli strumenti dei server attivi. Valgono le stesse autorizzazioni e una sessione mantiene le impostazioni con cui è partita. Vedi [Modalità agente](help://agent-mode).

## Proteggere ciò che restituisce un server

Ogni server ha l’opzione **Proteggi ciò che restituisce questo server**, attiva all’inizio. Finché è attiva, non appena qualcosa restituito da quel server è presente in una conversazione, gli strumenti che inviano dati fuori dall’app si fermano per quella conversazione: ricerca sul web, lettura di una pagina tramite indirizzo, strumenti di altri server MCP e simili. Gli strumenti dello stesso server continuano a funzionare. Avvia una nuova conversazione per usare di nuovo gli altri. Puoi disattivarla per un server che fornisce solo materiale pubblico.

La finestra dell’agente non può mantenere questa protezione. Quando una sessione parte con un server di questo tipo, la finestra te lo segnala.

## Che cosa va dove

- Quando l’IA chiama uno strumento, un testo scelto dall’IA va a quel server. Può includere contenuto del documento aperto e degli allegati. Le parti nascoste all’IA restano nascoste.
- Ciò che il server restituisce va al fornitore di IA che stai usando. Aggiungi solo server i cui gestori ritieni affidabili.
- Chiavi, accessi e valori delle variabili d’ambiente sono conservati su questo PC con la cifratura del tuo sistema operativo. Se questo PC non può cifrarli, vengono ricordati solo fino alla chiusura dell’app.
- Rimuovendo un server si eliminano le sue chiavi e il suo accesso, e si chiede al server di terminare l’accesso, se lo supporta.
