# Il pannello dell'assistente IA

Ogni editor può richiamare il pannello IA: seleziona qualcosa, dai un'istruzione, guarda il risultato che arriva in streaming.

## Come aprirlo e usarlo

- Il pannello ha bisogno di un'IA collegata. Se non ce n'è nessuna, mostra le schede di collegamento invece di un errore; vedi [Connessione con abbonamento](help://subscription).
- Punti d'ingresso: il **pulsante AI** nella barra multifunzione di ogni editor, **Chiedi all'IA** nei menu contestuali oppure Chiedi all'IA sulla barra di annotazione.
- Descrivi l'attività in linguaggio naturale (riscrivi questo / trasforma questa colonna in percentuali / riorganizza l'impaginazione di questa pagina...) e premi Invio.
- Le risposte vengono renderizzate **in streaming**; quando l'IA ha bisogno di strumenti (leggere il documento, modificarlo) li usa e prosegue fino alla fine.
- **Interrompi**: interrompe il turno in corso in qualsiasi momento.
- **Coda**: mentre arriva una risposta, Invio mette in coda il messaggio invece di scartarlo — una striscia sopra il campo di input li conta; aprila per modificare, rimuovere, riordinare, sospendere o svuotare. Il messaggio successivo parte da solo a fine turno; Esc ferma comunque il turno.

## Quale IA risponde

- L'elenco dei modelli in fondo al pannello mostra l'IA in uso e ti permette di sceglierne un'altra: prima i tuoi abbonamenti, poi i provider con chiave che hai configurato.
- Quando hai usato l'80% o più del limite di un abbonamento, nel pannello compare una riga come «85% usato · si azzera alle 15:00».
- Se una richiesta viene interrotta — il limite è esaurito, o l'accesso è scaduto — il pannello dice perché e non passa da solo a un'altra IA. Quando l'altro tuo abbonamento è collegato, un pulsante **Continua con …** lo propone.

## Cosa sa fare

- **Docs**: riscrivere/espandere/tradurre/riassumere, inserire tabelle e immagini, modificare la formattazione; ogni turno crea prima uno snapshot.
- **Sheets**: formule, riempimento dei dati, trasformazioni in blocco, formattazione.
- **Slides**: generazione dell'intera presentazione, regolazione del layout, riscrittura dei testi.
- **PDF**: domande e risposte e riassunti sul testo o sulle pagine selezionate.
- **Markdown / HTML**: riscrivere, estendere, tradurre.
- **Home ▸ Ask AI** risponde dai tuoi file preferiti e li cita — il pannello della base di conoscenza ha una sua sezione nel capitolo Home, e il pannello IA di Docs porta la stessa capacità.

## Allegare documenti aperti

Nel pannello IA degli editor Docs, Sheets, Slides, Hangul, HTML e mappe mentali puoi allegare come materiale altri documenti aperti in GenOffice o aperti di recente. Un documento allegato viene trattato esattamente come un file scelto dal tuo PC.

- **`@` nel campo di input**: digita `@` all'inizio del campo o dopo uno spazio per aprire un elenco di documenti. Se la finestra è divisa, viene prima il documento dell'altro riquadro, poi gli altri documenti aperti e quelli recenti; il documento in cui ti trovi non compare. Restringi l'elenco con qualche lettera del nome (gli spazi vanno bene) e scegli con Invio o con un clic: nel campo compare `@nome documento` e il documento viene allegato. **Cerca altri…** in fondo apre la finestra di scelta dei documenti descritta sotto.
- **Allega da documenti GenOffice**: questo pulsante accanto al pulsante di allegato apre lo stesso elenco in una finestra, dove puoi spuntare più documenti e allegarli in una volta.
- I documenti con modifiche non salvate e i documenti nuovi mai salvati appaiono attenuati e non si possono scegliere. Salvali e sceglili di nuovo: l'IA legge il file salvato.
- Se due documenti hanno lo stesso nome ma stanno in cartelle diverse, viene aggiunto il nome della cartella immediatamente superiore, come in `@piano.docx(2° quadrimestre)`, e anche l'IA riceve quel nome di cartella.
- Gli editor PDF e Markdown non hanno ancora gli allegati, quindi nessuno dei due modi è disponibile lì.

## Progetti

- Fai clic sul nome del progetto, a sinistra sotto il campo di input, per scegliere un progetto (una cartella del tuo PC). L'IA risponde allora conoscendo i file, le istruzioni e la memoria di quella cartella, e la chat viene conservata lì così puoi continuare in un altro editor. Vedi [Progetti](help://projects).
- Con un progetto scelto, il titolo della chat attuale compare in cima al pannello. Fai clic per vedere l'elenco delle chat del progetto e **Nuova chat**.
- L'elenco di `@` nel campo di input mostra «File di questo progetto» dopo i documenti aperti.
- Una richiesta con un progetto scelto invia all'IA che stai usando anche le istruzioni (insieme ad `AGENTS.md` e `CLAUDE.md` in cima alla cartella, che puoi disattivare nella pagina del progetto), la memoria e l'elenco dei nomi dei file di quel progetto, un breve estratto di ogni file che l'IA trova cercando nella cartella, oltre al testo di ogni file che l'IA legge.

## Ripristino e sicurezza

- Il pannello di Docs mantiene un **elenco delle versioni**: uno snapshot per turno, puoi tornare a qualunque versione e il ripristino stesso è annullabile con Ctrl+Z. Gli snapshot sopravvivono alla riapertura del documento.
- Le modifiche dell'IA passano dalla stessa pipeline di modifica di quelle manuali (annullabili, subordinate al salvataggio) — niente aggira la tua conferma di salvataggio.

## Nascondere una selezione all'IA

- In Slides, HTML e Markdown una selezione può essere tolta dagli occhi del modello: clic destro ▸ **Nascondi la selezione all'IA**, dai un nome al segnaposto, e il modello legge `{{nome}}` al suo posto. (Markdown abilita la voce con l'interruttore occhio-barrato della barra; quella di HTML sta nel pannello sorgente.)
- Il file conserva il testo vero — salvataggio, esportazione e stampa restano intatti, e il segno sopravvive alla riapertura. La stessa voce annulla la soppressione (Markdown ha anche **Mostra di nuovo la selezione all'IA**).
- HTML nasconde contenuti di elementi, valori di attributi e letterali stringa degli script; la pagina renderizzata non cambia mai.
- Slides nasconde anche intere immagini, video e audio, e una diapositiva con contenuto nascosto non viene mai inviata come screenshot: il controllo automatico del layout salta la pagina e lo dichiara.
- Vale solo per l'IA dell'app — CLI, strumenti MCP ed esportazione headless leggono il file direttamente e continuano a vedere il testo.

## Privacy

- Le istruzioni e il contenuto del documento pertinente vengono inviati all'**IA che stai usando**: ad Anthropic o a OpenAI con il tuo account quando usi un abbonamento, oppure al provider di cui hai inserito la chiave. Se nessuna IA è collegata, non viene inviato nulla.
- L'uso dei contenuti di un abbonamento per addestrare l'IA dipende dalle impostazioni del tuo account presso quell'azienda.
- I file locali non vengono caricati da nessun'altra parte; le chiavi API sono memorizzate nel file delle impostazioni dell'app su questa macchina e inviate solo nelle intestazioni delle richieste.
