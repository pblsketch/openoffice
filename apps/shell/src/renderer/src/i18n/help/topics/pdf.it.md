# PDF: lettura, annotazione e oscuramento

L'editor PDF ha cinque schede nella barra multifunzione: **Home / Annota / Modifica / Pagine / Visualizza**. Legge e scrive: il testo è modificabile, il contenuto può essere oscurato e firmato e i moduli si possono compilare.

## Lettura e navigazione

- Barra laterale sinistra: ** miniature** (fai clic per saltare, con l'intervallo visibile evidenziato) oppure **struttura** (segnalibri, quando presenti).
- Zoom: il controllo del rapporto in basso a destra; ctrl+rotellina cambia lo zoom a scatti.
- Spostare la vista: attiva lo **Strumento Mano** (schede Home e Visualizza) e trascina per spostare la pagina in ogni direzione. Finché è attivo, il trascinamento non seleziona testo e un semplice clic apre comunque i link. Trascinare tenendo premuto il tasto centrale (rotellina) sposta la vista anche senza lo strumento. Esc o un altro strumento lo disattiva.
- Rotazione: per singola pagina o per tutte dal menu Pagine; le rotazioni vengono riscritte al salvataggio.
- Ricerca: ctrl+F a testo completo con tutte le occorrenze evidenziate.
- PDF cifrati: una richiesta della password (in una piccola finestra separata) li apre; la password viene usata solo per questa sessione. Puoi modificare e salvare un documento così; il salvataggio mantiene la password. **Annota → Proteggi** imposta, cambia o rimuove la password e ciò che i lettori possono fare.

## Selezione del testo e marcatura (Annota)

Prova su un qualsiasi paragrafo:

1. **Trascina il mouse su una frase** — al rilascio sopra il testo compare una barra di annotazione:

![La barra di annotazione dopo aver selezionato il testo](img/pdf-highlight.png)

2. Scegli uno dei tre colori di **evidenziazione**, oppure **sottolineatura**, **ondulato** o **barratura**. Per cambiare un colore di evidenziazione, fai clic destro su di esso e scegline uno nuovo. Dopo una sottolineatura, un'ondulata o una barratura, sulla barra si apre una fila di colori: fai clic su un altro colore per cambiarlo, e il segno successivo userà anch'esso quel colore. **Chiedi all'IA** invia la selezione insieme alla tua domanda al pannello IA.
3. Per annullare un'annotazione, riseleziona con il trascinamento lo stesso passaggio e fai clic sul pulsante già attivo sulla barra (un interruttore in stile Word), oppure selezionalo e premi Canc.

Per sapere cosa aspettarti:

- Trascinando sul testo compare una barra a comparsa: **evidenziazione / sottolineatura / barratura / copia / Chiedi all'IA**.
- I colori vengono dalla tavolozza; **applicare la stessa marcatura a un intervallo già marcato la rimuove** (interruttore in stile Word).
- Le marcature già salvate nel file possono essere selezionate ed eliminate (⋯ menu o Canc).
- **Nota**: mentre è attivo uno strumento di disegno, il livello di testo non è selezionabile — lo strumento si disattiva da solo dopo ogni inserimento, così torni in modalità selezione per l'azione successiva.

## Strumenti di disegno (Annota)

Sei strumenti: **inchiostro, rettangolo, ellisse, freccia, nota**, più il **riquadro di oscuramento** nella scheda Annota.

- Ogni strumento è un interruttore: fai clic per attivarlo; **si disattiva da solo una volta posizionata una forma** (per continuare, fai clic di nuovo sullo strumento); fare clic sullo strumento già attivo lo disattiva comunque.
- L'inchiostro segue lo spessore del tratto; rettangolo, ellisse e freccia si trascinano; i colori vengono dalla tavolozza di disegno.
- Le forme posizionate si possono selezionare, eliminare, trascinare e (rettangolo ed ellisse) ridimensionare.
- **L'oscuramento, il flusso completo** (per nascondere una riga di testo):

  1. Scheda Annota ▸ fai clic su **Oscura area** (lo strumento si attiva).
  2. **Trascina un riquadro sul contenuto** — viene coperto da un segno tratteggiato e nella barra degli strumenti compaiono i pulsanti **cancella contrassegni / applica oscuramenti**.

  3. Fai clic su **Applica oscuramenti** e conferma — il risultato è una copia di lavoro in cui il testo e le immagini coperti vengono rimossi fisicamente (non semplicemente coperti) e l'operazione non è annullabile; il documento originale resta intatto.

  Hai sbagliato? Il pulsante cancella contrassegni elimina i segni attuali, così puoi ridisegnare.

## Post-it e fili di commenti

- Lo **strumento nota** posiziona un puntino e apre una scheda a margine per il testo (il nome dell'autore è configurabile); confermando, viene salvata come annotazione di testo PDF standard.
- Fai clic su un puntino per aprire il filo: **rispondi** (le risposte formano un unico elenco piatto, senza annidamento), **modifica** il tuo commento, **elimina** un commento o l'intero filo.
- Le modifiche in corso restano valide finché il salvataggio non riscrive il nuovo testo nella stessa annotazione nel file, mantenendo intatte le catene di risposte.

## Modifica del contenuto PDF (Modifica)

- **Modifica testo**: fai clic sul testo per modificarlo blocco per blocco (motore pdfium; caratteri abbinati per quanto possibile).
- **Inserisci testo**: inserisci testo ricercabile con il carattere, la dimensione e il colore che preferisci.
- **Inserisci immagine / timbro**.
- Moduli: i campi AcroForm si compilano direttamente; i valori vengono scritti al salvataggio.

## Firme

- **Firma a inchiostro**: disegnala; può essere collegata a un campo firma di un modulo.
- **Firma come immagine**: posiziona un'immagine come firma.
- Le firme salvate si possono riutilizzare.
- **Firma con certificato** (scheda Annota): firma con un certificato dall'archivio di sistema o da un file .p12/.pfx; mostra facoltativamente la firma sulla pagina e certifica facoltativamente il documento contro modifiche successive.
- Firmare scrive sempre un **nuovo file** (aggiornamento incrementale — le firme precedenti restano valide) e apre la copia firmata al suo posto. Salva prima: una firma copre il file così come è su disco.
- Un banner sopra il documento elenca le firme esistenti; **Visualizza firme** mostra validità, copertura e catena di certificati di ciascuna. La revoca (CRL/OCSP) non è verificata.

## Operazioni sulle pagine (Pagine)

- **Ruota / elimina / riordina**: trascina le miniature per riordinarle; l'eliminazione chiede conferma.
- **Importa pagine**: porta pagine da un altro PDF nel documento. **Inserisci pagina vuota** aggiunge una pagina vuota.
- **Sostituisci pagine** scambia un intervallo con pagine provenienti da altrove; **Ritaglia pagine** ritaglia i bordi, con l'opzione di applicarlo a tutte le pagine.
- **Dimensioni pagina** ridimensiona ogni pagina a un unico formato carta; **Inverti ordine** capovolge il documento da fine a inizio.
- **Estrai pagine**: esporta le pagine selezionate in un nuovo PDF.
- **Dividi PDF**: due forme — dividere per intervalli in più file, oppure ritagliare ogni pagina in una griglia di pagine più piccole.
- **Unisci PDF**: due forme — aggiungere altri PDF, oppure combinare più pagine su un unico foglio. Le dimensioni sono sommate **prima** che venga letto qualsiasi contenuto e un totale oltre **1 GiB viene rifiutato** con un errore leggibile (per mantenere limitata la memoria).
- Le modifiche a livello di pagina vengono riscritte al salvataggio successivo; Salva con nome… lascia intatto l'originale.

## Esportazione e stampa

- **Esporta come Word… / PowerPoint… / Excel…** nel menu File, oppure le stesse tre da **Converti PDF** nella barra multifunzione — tutto in locale, senza caricamenti. Il .pptx esce con una diapositiva per pagina e il .xlsx con un foglio di lavoro per pagina. Ognuno chiede dove salvare.
- **Stampa**: ordine e rotazioni correnti tramite la finestra di sistema; sono supportati gli intervalli di pagine.

## Salvataggio

- Il normale salvataggio, manuale o automatico, riscrive annotazioni e modifiche nel file (in modo atomico).
- **L'oscuramento passa dal proprio flusso di applicazione** e produce una copia, lasciando intatto l'originale, così il contenuto sensibile non resta in esso.

## Scorciatoie della barra di selezione

Finché la barra delle annotazioni è visibile sopra il testo selezionato, un solo tasto esegue subito un’azione.

| Tasto | Azione                                         |
| ----- | ---------------------------------------------- |
| H     | Evidenzia (toglie l’evidenziazione se c’è già) |
| U     | Sottolinea                                     |
| S     | Barra                                          |
| N     | Aggiunge una nota alla fine della selezione    |
| E     | Spiegazione IA (scheda del passaggio)          |
| T     | Traduzione IA (scheda del passaggio)           |
| Invio | Apre la casella **Chiedi all'IA**              |

- I tasti funzionano allo stesso modo anche con un metodo di input coreano o di qualsiasi altra lingua. Vengono ignorati mentre scrivi in un campo o tieni premuto Ctrl o Alt.
- In un documento bloccato alla modifica (la password del proprietario vieta le modifiche), H, U, S e N non fanno nulla e mostrano il motivo, come i pulsanti della barra.

## Schede dei passaggi

Premi **E** o **T**, oppure i chip di spiegazione e traduzione nella casella **Chiedi all'IA**, e la risposta compare in una piccola scheda accanto alla selezione. Le schede vengono conservate, quindi restano anche quando riapri il documento, e si possono copiare. Se chiedi di nuovo lo stesso passaggio, si apre la scheda esistente senza inviare nulla.

- **Tieni come nota** crea una nota in quel punto. La prima riga dice «Spiegazione IA» o «Traduzione IA» e l’autore è il nome del tuo account sul PC. Entra nel file quando salvi il PDF; fino ad allora la scheda mostra «In attesa di salvataggio».
- **Continua nel pannello IA** passa il passaggio e la risposta al pannello IA senza inviarli; **Aggiungi alla nota** li mette in fondo alla nota di questo PDF.
- Solo **Rigenera** invia di nuovo il passaggio all’IA.
- **Elimina** cancella soltanto la scheda conservata. Una nota già tenuta resta dov’è.
- Una sottile linea tratteggiata segna ogni passaggio che ha una scheda; facendo clic sulla linea la scheda si riapre. La linea esiste solo sullo schermo e non viene mai salvata né stampata. Attivala o disattivala da Visualizza ▸ **Segni dei passaggi**.

## Panoramica delle annotazioni

- Visualizza ▸ **Annotazioni** elenca nella barra laterale sinistra evidenziazioni, sottolineature, barrature, note e disegni del documento, i segni non ancora salvati e le schede dei passaggi. I segni mostrano il testo che coprono.
- Filtra per tipo, colore, intervallo di pagine o testo, e ordina per pagina o per ordine di creazione.
- Un clic su una voce porta in quel punto con un breve lampeggio. Una nota apre il suo filo a margine; una scheda apre la scheda.
- Le voci di menu **Copia come Markdown**, **Apri come documento Markdown** e **Apri come documento Word** usano l’elenco così come è filtrato. L’IA non viene coinvolta. I nuovi documenti si possono creare solo da un PDF aperto dentro GenOffice.

## Traduzione a fronte

- Attiva Visualizza ▸ **Traduzione a fronte** e a destra di ogni pagina compare una colonna di traduzione che scorre insieme alla pagina. Attivarla non invia nulla all’IA. Un documento già tradotto con **Traduci documento** mostra subito la traduzione; i paragrafi senza traduzione appaiono come testo originale sbiadito.
- **Traduci questa pagina** (o **Traduci il resto** se una parte è già fatta) invia la pagina con un solo clic quando usi un abbonamento; accanto al pulsante compare il nome dell’IA a cui va. Su una connessione a consumo, il primo clic in una scheda chiede prima «addebiterà questo servizio · Traduci / Annulla».
- Fai doppio clic su un paragrafo tradotto per modificarlo. I paragrafi modificati sono conservati come testo semplice e usati così come sono nei file PDF, Markdown ed EPUB tradotti. **Traduci di nuovo** su un paragrafo invia solo quel paragrafo e chiede conferma se lo avevi modificato.
- Passando il mouse su un paragrafo tradotto, il suo punto nella pagina originale viene contornato. Larghezza e dimensione del testo della colonna sono regolabili. **Traduci tutte le pagine…** apre la finestra **Traduci documento**, il cui formato **Solo conservare (nessun file)** tiene la traduzione senza scrivere file.
- I paragrafi tradotti da ora in poi sono collegati frase per frase. Passando il mouse su una frase tradotta, quella frase viene evidenziata nella pagina originale; passandolo su una frase originale, si illumina la sua traduzione. Dove la frase non si trova nella pagina, e per i paragrafi tradotti in precedenza o modificati da te, il collegamento resta per paragrafo.
- La barra sopra la colonna passa da **Traduzione** a **Spiegazione semplice**. La spiegazione semplice riscrive il testo con parole di tutti i giorni e frasi brevi, per bambini, anziani o chi sta imparando la lingua; fatti, numeri e nomi restano com’erano. La scelta viene ricordata e cambiare non invia nulla. Mentre è mostrata la spiegazione, i pulsanti di pagina e di paragrafo e la modifica agiscono su di essa.
- Con la spiegazione semplice, **Spiega tutte le pagine in modo semplice…** apre la finestra **Traduci documento** con la modalità **Spiegazione semplice**. Una spiegazione è più lunga dell’originale, quindi non può diventare un PDF tradotto; si scrive in Markdown o EPUB. Con **Originale e poi spiegazione** attivo, ogni paragrafo originale è seguito dalla sua spiegazione; disattivato, il file contiene solo la spiegazione. La lingua all’inizio è quella dell’interfaccia e può essere anche quella del documento.

## Evidenziazione IA

- In Home ▸ **Evidenziazione IA** scegli un insieme di categorie (Ricerca e rapporti, Contratti e condizioni, Libri di testo e manuali, oppure Personalizzato) e le pagine. Non viene inviato nulla finché non controlli il numero stimato di chiamate e l’IA di destinazione e premi **Avvia**.
- Le frasi scelte dall’IA vengono mostrate in anteprima come riquadri colorati traslucidi sulla pagina. L’anteprima non viene mai salvata; attivala o disattivala da Visualizza ▸ **Anteprima evidenziazioni**.
- Nel pannello **Annotazioni** puoi **Accetta** o **Scarta** i suggerimenti uno alla volta, oppure accettare un’intera categoria. Una frase non trovata nel testo della pagina non può essere accettata.
- Un suggerimento accettato diventa un’evidenziazione del colore della sua categoria, e il nome della categoria viene salvato come oggetto dell’annotazione, così gli altri visualizzatori PDF lo mostrano nell’elenco dei commenti. Entra nel file quando salvi il PDF.
- L’evidenziazione IA non può partire in un documento bloccato alla modifica. Le frasi inventate che non compaiono nel testo vengono scartate, e il resoconto finale dice quante sono state ricevute e quante scartate.

## Panoramica del documento e citazioni di paragrafo

- In cima al pannello IA, **Panoramica del documento** ▸ **Crea panoramica** produce un riassunto in tre righe, un riassunto e i termini chiave (con significato e prima pagina). Un documento lungo viene riassunto a parti, quindi prima confermi il numero stimato di chiamate.
- La panoramica viene conservata e ricompare alla riapertura; solo **Rigenera** invia di nuovo. Un clic su un termine lo cerca nel documento; ogni sezione si può copiare o aggiungere alla nota.
- Quando la conversazione è vuota, il pannello IA propone tre domande suggerite. Un clic invia la domanda una volta.
- Un clic su un link di pagina (p.N) che l’IA fornisce come prova porta a quella pagina ed evidenzia la frase citata per due secondi. Se la frase non viene trovata, si va solo alla pagina.

## Una nota per ogni PDF

- La prima volta che premi **Apri nota** (scheda Visualizza o pannello **Annotazioni**) si apre una finestra di salvataggio, di base nella cartella del PDF con il nome «nome del PDF nota.md». In seguito la nota si apre subito in una scheda Markdown.
- Se scegli un file che esiste già, Windows può chiedere se sostituirlo, ma il file non viene sovrascritto: viene collegato come nota così com’è.
- **Aggiungi alla nota** (su schede, voci del pannello e panoramica del documento) mette una citazione e un link di pagina in fondo alla scheda della nota e la lascia non salvata; il salvataggio lo fai tu nella scheda della nota. Il link apre il PDF a quella pagina anche in altri programmi, come un browser.
- Un PDF mai salvato mostra «Salva prima il PDF». Le note funzionano solo con PDF aperti dentro GenOffice.
