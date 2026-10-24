# Collegare un agente di programmazione

GenOffice parla il Model Context Protocol, così un agente di programmazione può leggere, scrivere e renderizzare i tuoi documenti attraverso gli stessi motori che usa l'app. L'agente non sta indovinando un formato di file: ottiene gli schemi tipizzati delle op dalle stesse definizioni contro cui l'executor valida.

## Registrarlo dall'app

È in **Impostazioni ▸ Integrazioni** che si fa questa cosa. Il pannello ha due metà, e puoi usare una sola o entrambe.

**La skill.** Una riga per ogni agente di programmazione trovato su questa macchina — Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf —, ognuna con **Installa**, **Aggiorna** e **Disinstalla**, più **Installa in un'altra cartella…**, **Scarica skill (zip)** e **Copia percorso**. Se il tuo assistente non è in elenco, indica a GenOffice una cartella da cui legge `SKILL.md`, oppure salva lo zip e lascia che lo installi l'assistente. Skill e MCP possono stare fianco a fianco: l'assistente sceglie uno dei due, e fanno esattamente le stesse cose.

**MCP.** Sono offerti due percorsi: **Avviato dall'assistente (consigliato)**, dove aggiungi la configurazione mostrata al tuo client e l'assistente avvia da solo il server, e il **Server HTTP locale**, che l'app esegue al posto tuo. In entrambi i casi l'assistente finisce per parlare con GenOffice e tu non digiti mai un comando.

## Registrarlo dalla riga di comando

La stessa cosa da un terminale: questo è il percorso avanzato, quello da usare quando l'agente si trova dove il pannello non può cercarlo:

```sh
ieumoffice mcp install all
```

Trova gli agenti di programmazione su questa macchina e scrive la voce del server stdio nella configurazione di ciascuno, lasciando intatto tutto il resto del file. La voce si chiama `ieumoffice`. Fatta a mano per Claude Code, la stessa registrazione è `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`.

```sh
ieumoffice mcp list             # where each agent stands
ieumoffice mcp install cursor    # just one
ieumoffice mcp uninstall cursor  # take it back out
```

Un agente installato in una posizione non convenzionale richiede `--dir <path>`; `--force` riscrive una voce già presente.

`ieumoffice mcp --help` mette su una sola schermata tutto ciò che il server accetta: le forme per installare, rimuovere e elencare, l'erogazione via HTTP e le due opzioni sugli schemi.

## Eseguirlo senza un assistente

Per un client su un'altra macchina, pubblicalo via HTTP:

```sh
ieumoffice mcp --http 8765 --token <secret>
```

`--host <addr>` cambia l'indirizzo su cui è in ascolto. Passa lo stesso token al client.

Anche i file viaggiano via HTTP: `PUT /files/<name>` ne carica uno, ogni strumento accetta un URL `http(s)` al posto di un percorso e gli output tornano come URL di download — e, quando sono abbastanza piccoli, come risorse incorporate. In ogni caso, op, spec e Markdown vengono passati in linea.

## Cosa ottiene l'agente

Ogni comando è uno strumento. Quelli più interessanti:

- **`docs`, `sheet`, `slides`** — leggono e modificano un file attraverso il percorso di scrittura dell'app, una **op** alla volta. Un nuovo deck segue `deck_start`, `deck_page`, `deck_build`.
- **`render`** — un PNG per pagina, impaginato dal renderer dell'app, così l'agente può guardare una slide invece di indovinarla.
- **`pdf`** — il livello di testo di un PDF, pagina per pagina, senza processi dell'app.
- **`info`** — metadati e un riepilogo della struttura, di solito la chiamata più economica su un file non noto.
- **`search`, `image`, `media`** — ricerca web e di immagini, generazione di immagini e analisi dei media tramite ciò che è configurato nell'app, così l'agente non ha bisogno delle proprie chiavi. La sezione successiva dice che cosa possono usare.
- **`merge`** — compila un modello `{{key}}`.

## Ricerca, immagini e media: che cosa può usare un agente

Una richiesta che arriva dal comando `ieumoffice` o da un client MCP non l'hai digitata tu nell'app, quindi GenOffice la tratta con cautela.

- **La ricerca** funziona sempre ed è gratuita per impostazione predefinita. La chiave di un provider di ricerca viene usata solo se ne hai selezionata una.
- **Generare un'immagine** richiede la chiave di un provider di immagini. In questa versione un abbonamento non genera immagini.
- **Descrivere un'immagine** usa un provider con chiave quando ce n'è uno configurato. Il tuo abbonamento Claude o Codex **non viene usato a meno che tu non lo consenta**.
- **Video e audio** richiedono un provider con chiave che supporta i video.

Per consentire l'uso dell'abbonamento, apri Impostazioni ▸ IA ▸ **Avanzate** e attiva **Consenti alle richieste automatiche di usare un abbonamento**. Prima compare un avviso — «Non c’è un limite orario: un programma può inviare tutte le richieste che vuole, e queste possono contenere l’intero testo di un documento e le immagini delle sue pagine. Nessuna delle due aziende consiglia di lasciare che un programma usi automaticamente il tuo abbonamento, e il tuo account potrebbe subire limitazioni.» — e l'interruttore si attiva solo dopo **Attiva comunque**.

Anche con l'interruttore attivo:

- Le richieste vengono gestite una alla volta. Le altre aspettano il proprio turno.
- Non c'è un limite orario. Il turno passa da una richiesta all'altra, non da un'attività all'altra, quindi una lunga traduzione di un PDF si alterna con gli altri chiamanti invece di bloccarli. Un interruttore attivato con l'avviso precedente è stato spento: leggi il nuovo avviso e riattivalo.
- Un accesso a consumo che hai consentito con **Usa comunque** qui non conta come abbonamento. Viene trattato come una chiave: se lo hai scelto come IA da usare, le descrizioni di immagini passano da lì qualunque cosa dica l'interruttore, e ognuna viene addebitata.

Con l'interruttore disattivato e nessuna chiave configurata, lo strumento risponde che la funzione non è disponibile e indica questa impostazione. Un agente può controllare prima con lo strumento `capabilities`; vedi [Riga di comando e agenti](help://cli).

## Schemi e un budget più piccolo

`apply` e `create` annunciano i loro parametri `ops`, `cells` e `data` con lo schema tipizzato per ogni op, generato da `ieumoffice guide <domain> --json`. È preciso e non è piccolo. Un client con una finestra di contesto ridotta può chiedere invece semplici array:

```sh
ieumoffice mcp --compact-schemas
GENOFFICE_MCP_COMPACT_SCHEMAS=1 ieumoffice mcp
```

## Perché la skill

Un agente che non conosce il vocabolario delle op indovinerà. La skill porta con sé il riferimento e le guide di progettazione — lo stesso materiale che stampa `ieumoffice guide` —, così l'assistente scrive op di cui ha davvero letto la specifica. Installala dal pannello qui sopra, oppure con `ieumoffice skill` da un terminale.

## Che cosa raggiunge nell'app

Il server non è limitato ai file su disco. Finché GenOffice è in esecuzione, l'agente può lavorare anche attraverso la finestra:

- **`open_in_genoffice`** apre un file in una scheda e la porta in primo piano.
- **`open_documents`** elenca ogni documento che hai aperto — id, tipo, percorso e se ha modifiche non salvate — e poi legge il contenuto attuale di uno, lo salva sul posto o lo chiude, salvando prima a meno che tu non gli chieda di scartare.
- **Gli strumenti di contenuto** prendono quell'id (o il percorso) come argomento `document`, così una modifica finisce nella scheda che hai già aperto e la finestra passa a mostrarla.

Restano fuori portata due cose: non c'è il pannello IA e la finestra di aggiornamento dell'app non si applica.

## Il pannello Server HTTP locale

Sotto **Server HTTP locale**, l'app esegue il server per conto suo invece di lasciarlo all'assistente: un interruttore di attivazione, un campo **Porta**, un indicatore **In esecuzione / Non in esecuzione** e la **Generazione in background** (scrivere i documenti direttamente in un percorso senza aprire l'interfaccia) e l'**Esempio di configurazione client** da copiare. Aprire **Avanzato** aggiunge i due URL di connessione — Streamable HTTP e quello vecchio di SSE —, un URL di **Controllo di integrità** e un interruttore di **Registrazione** che annota l'attività del server e degli strumenti in un file locale che puoi **Aprire**, **Aggiornare** o **Svuotare** da lì. Ascolta solo su localhost.
