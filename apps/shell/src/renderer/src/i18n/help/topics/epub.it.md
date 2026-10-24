# Libri EPUB: leggere, modificare e tradurre

L’editor di e-book apre i libri EPUB (`.epub`) in una scheda. Puoi leggere il libro, correggerne il testo direttamente sulla pagina, fare domande all’IA e tradurlo in un nuovo file EPUB. Non esiste una schermata per modificare il codice di un capitolo.

## Aprire un libro

- Apri un file `.epub` dalla finestra di apertura, trascinandolo sulla finestra, dai file recenti, dall’albero delle cartelle o dall’elenco di Google Drive. In Windows viene proposto anche in «Apri con». L’installazione di GenOffice non lo rende il programma predefinito per i file `.epub`.
- Se il libro è già aperto, la sua scheda passa in primo piano.
- I libri protetti dalla copia (DRM) non si aprono: aprili nell’app del negozio in cui li hai acquistati. Anche i file danneggiati e quelli che non sono libri EPUB non si aprono, e ne viene mostrato il motivo.
- I **libri a layout fisso** (impaginati pagina per pagina, come i libri illustrati e i fumetti) si aprono solo in lettura. Modifica, modifica con l’IA, sostituzione e traduzione sono disattivate, e la riga di stato spiega perché. Leggere e fare domande all’IA funzionano comunque.
- Un capitolo il cui file è malformato viene mostrato al meglio possibile ma non si può modificare, e lo segnala una nota in cima al capitolo. Viene salvato senza modifiche e resta nella lingua originale nelle traduzioni.

## Leggere

- Il riquadro **Sommario** a sinistra mostra l’indice del libro. Fai clic su una voce per andarci. Un libro che non ne ha uno riceve un elenco dei suoi capitoli.
- Ogni capitolo scorre in alto e in basso. Continua a scorrere oltre la fine di un capitolo per passare al successivo, o oltre il suo inizio per tornare indietro. La riga di stato mostra in quale capitolo ti trovi.
- La scheda **Visualizza** cambia la dimensione del testo e l’interlinea e attiva o disattiva la **Vista scura**. Queste impostazioni cambiano solo lo schermo, mai il libro, e valgono per tutti i libri.
- Il punto in cui hai smesso di leggere viene ricordato per ogni file, nella cartella dei dati dell’app e non nel libro.
- **Trova nel libro** (Ctrl+F) cerca in tutti i capitoli. Fai clic su un risultato per andarci.
- Un collegamento interno al libro porta al punto indicato. I link web ed e-mail si aprono nel browser predefinito; gli altri indirizzi non vengono aperti.
- Gli script del libro non vengono mai eseguiti e nulla viene caricato da internet. Audio e video non vengono riprodotti.

## Modificare il testo

- Fai clic in un paragrafo e scrivi. Si possono modificare paragrafi, titoli, voci di elenco, citazioni, celle di tabella e didascalie delle immagini. Le immagini e la struttura delle tabelle no.
- Incollando si inserisce solo testo semplice.
- **Enter** divide un paragrafo in due e **Shift+Enter** inizia una nuova riga al suo interno. **Backspace** all’inizio di un paragrafo lo unisce a quello precedente, e **Delete** alla fine vi unisce quello successivo. Nelle celle di tabella, nelle didascalie e negli elenchi di definizioni Enter non fa nulla: cambia solo il testo al loro interno.
- **Grassetto** (Ctrl+B) e **Corsivo** (Ctrl+I) si attivano e disattivano. Il testo che il foglio di stile del libro rende grassetto o corsivo resta com’è.
- **Annulla** (Ctrl+Z) e **Ripeti** (Ctrl+Y) continuano a funzionare dopo il salvataggio. Annullare una modifica fatta in un altro capitolo ti porta lì.
- **Sostituisci** (Ctrl+H) percorre tutto il libro, un paragrafo alla volta: una corrispondenza non si estende mai su due paragrafi. I capitoli di sola lettura vengono saltati, e viene mostrato il numero dei punti saltati. **Sostituisci tutto** si annulla in un solo passaggio.

## Salvare

- Salva (Ctrl+S), Salva con nome (Ctrl+Shift+S, solo `.epub`), il **Salvataggio automatico** nella barra multifunzione e la domanda prima della chiusura funzionano come negli altri editor.
- Se non è cambiato nulla, il file non viene riscritto. Quando salvi delle modifiche, vengono riscritti solo i paragrafi che hai cambiato. Immagini, font, stili e tutte le altre parti del libro restano esattamente com’erano. In un libro EPUB 3 viene aggiornata anche la data di «ultima modifica».
- Se un altro programma ha modificato il file dopo che l’hai aperto, il file non viene sovrascritto.

## Pannello IA

- Fai domande sul libro, fatti riassumere un capitolo, oppure fanne correggere o riscrivere il testo. L’IA legge l’indice e i capitoli del libro e vi trova il testo.
- Le modifiche dell’IA compaiono subito, e un solo annullamento (Ctrl+Z) ripristina tutto ciò che ha cambiato in quel turno. L’IA può mettere il testo in grassetto o in corsivo, ma non può aggiungere immagini, tabelle o capitoli.
- Il testo del libro è materiale per l’IA, non istruzioni da seguire.
- Chiedi «Traduci questo libro in francese» e l’IA apre la finestra di traduzione con quella lingua già impostata. Non viene inviato nulla finché non premi **Avvia**.
- I libri EPUB si possono anche allegare nel pannello IA degli altri editor, scegliere con `@` e trovare con la ricerca dei file nella Home.

## Tradurre un libro

1. Nella scheda **Home**, fai clic su **Traduci libro** (oppure File ▸ Traduci libro…).
2. Scegli la lingua, i capitoli (all’inizio sono tutti selezionati) e i risultati: un **Libro tradotto**, un **Libro bilingue** (originale e traduzione) o entrambi. Scegli dove salvare ciascuno.
3. Fai clic su **Avanti**. La conferma mostra il numero stimato di richieste all’IA, l’IA a cui vanno, le parti già tradotte (che non vengono inviate di nuovo) e, su una connessione a consumo, che ci sarà un addebito. Se il libro ha modifiche non salvate, il pulsante diventa **Salva e traduci**.
4. Fai clic su **Avvia**. In alto compaiono l’avanzamento e **Interrompi**. La modifica resta bloccata finché la traduzione non termina; il pannello IA continua a funzionare.
5. Alla fine un resoconto elenca cosa è stato tradotto, cosa è rimasto nella lingua originale e i file prodotti, ciascuno con **Apri**.

- Il libro in sé non cambia. Ogni risultato è un nuovo file EPUB con una propria identità, così le app di libreria per e-book lo tengono distinto dall’originale.
- Vengono tradotti anche il titolo e l’indice. In un libro bilingue ogni paragrafo è seguito dalla sua traduzione; in tabelle, didascalie ed elenchi la traduzione va nella stessa cella o voce. Il suo titolo mostra entrambi, come «Titolo originale (Titolo tradotto)».
- I capitoli che non hai scelto restano nella lingua originale nel risultato.
- Un libro scritto in verticale diventa orizzontale, a meno che non venga tradotto in giapponese, cinese o coreano. Le traduzioni in arabo ed ebraico si leggono da destra a sinistra.
- Quanto è già stato tradotto viene conservato. Se ti fermi, scegli **Esporta quanto tradotto finora** (il resto rimane nella lingua originale) oppure **Continua più tardi**. Quando apri un libro con una traduzione non finita, GenOffice propone di proseguirla. **Traduci di nuovo dall’inizio** elimina prima la traduzione conservata per quella lingua.
- Le traduzioni conservate rientrano in Impostazioni ▸ Generale ▸ **Risultati IA salvati**, insieme a quelle dei documenti PDF, e **Elimina tutto** cancella anche queste.
- La stessa traduzione si può avviare anche dalla [riga di comando](help://cli) con `ieumoffice epub translate`.

## Non ancora supportato

- Aggiungere, eliminare o riordinare capitoli; cambiare titolo, autore o copertina; inserire immagini o tabelle; trasformare un paragrafo in un titolo o in un elenco.
- Modificare o tradurre libri a layout fisso, e aprire libri protetti dalla copia.
- Sfogliare le pagine come in un libro stampato, e creare un nuovo libro vuoto.
- Confrontare l’originale e la traduzione fianco a fianco nell’editor. Apri invece il libro bilingue, e correggi il libro tradotto come qualsiasi altro libro.
- Nascondere all’IA parti di un libro.
