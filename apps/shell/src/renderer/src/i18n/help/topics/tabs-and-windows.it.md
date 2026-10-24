# Schede e gestione delle finestre

Tutti i file aperti condividono una sola finestra; la barra delle schede in alto passa da uno all'altro, in stile browser.

![La barra delle schede: Home più due documenti](img/tabs.png)

## Nozioni di base

- **Cambia scheda**: fai clic su una scheda, premi **Ctrl+Tab** (successiva) / **Ctrl+Shift+Tab** (precedente), oppure scorri la rotellina del mouse sulla barra.
- **Chiudi**: la × sulla scheda, oppure ⌘W/ctrl+W. Se ci sono modifiche non salvate ti viene prima chiesto.
- **Nuova**: il + all'estremità destra della barra.
- **L'attivazione è immediata**: premendo una scheda il cambio avviene subito, senza attendere che il clic finisca.

## Rinomina: fai doppio clic su una scheda

**Fai doppio clic su una qualsiasi scheda di file** e il titolo si trasforma in un campo di modifica in linea: Invio conferma, Esc annulla, la perdita del fuoco conferma; l'Invio con cui si conferma un candidato dell'IME non viene scambiato con una conferma. La rinomina passa dagli stessi controlli di sicurezza della rinomina di una riga in Home (caratteri non ammessi, nomi in conflitto), rinomina il file su disco e aggiorna l'elenco dei file recenti.

## Trascina per riordinare

Tieni premuta una scheda e trascinala di lato per riordinarla; le schede vicine si spostano in tempo reale e l'ordine si assesta al rilascio. Una zona morta di 4 pixel impedisce che i clic normali facciano oscillare le schede.

## Menu contestuale

Fai clic destro su una scheda per **Apri in una nuova finestra** — disponibile su ogni scheda documento che si può staccare — e **Chiudi**, disabilitato su una scheda che non può essere chiusa. Entrambe seguono la lingua dell'app.

## Stacca in una finestra

**Trascina una scheda fuori dalla barra** (oppure usa Apri in una nuova finestra) e diventa una finestra a sé stante che contiene il documento attivo; trascinala di nuovo per agganciarla alla barra. Una finestra staccata è una finestra pari a tutte le altre: puoi continuare a modificarla e salvarla da lì.

## L'elenco di tutte le schede

Quando le schede non entrano tutte nella barra, la piccola icona della barra delle schede all'estremità destra apre l'elenco completo (un menu nativo, mai coperto dall'area di contenuto); seleziona con i tasti freccia.

## La barra degli strumenti dentro ogni editor

Ogni scheda di editor ha in alto una riga di strumenti (la disposizione esatta varia leggermente da un editor all'altro):

- **Salva** (⌘S/ctrl+S) e **Salva con nome…**.
- **Annulla / Ripeti**: a più livelli; ogni editor mantiene la propria cronologia.
- **Trova** (ctrl+F): apre il pannello di ricerca di quell'editor.
- Interruttore **Salvataggio automatico**: quando è attivo, le modifiche vengono scritte su disco a intervalli regolari; quando è spento si scrive solo salvando manualmente (l'indicatore di modifiche non salvate sulla scheda o sul titolo te lo ricorda).

## La scheda Home

La scheda Home, all'estrema sinistra, non può essere chiusa; per tornarci da un qualsiasi editor, cliccala oppure usa File ▸ **Torna alla Home**.

## Visualizzazione divisa: due riquadri

**Trascina una scheda sul bordo destro della finestra**: la scheda segue come una piccola copia flottante, vicino al bordo compare l'avviso «Dividi qui» e, se la lasci, ottieni due riquadri affiancati. Se la lasci sul bordo inferiore, ottieni due riquadri impilati. Il menu contestuale della scheda offre lo stesso con **Dividi a destra** e **Dividi in basso**, e **Annulla divisione** su una scheda che si trova in un riquadro.

- La scheda trascinata finisce nel riquadro in cui l'hai lasciata; l'altro riquadro conserva il documento che stavi guardando poco prima.
- Se è aperto un solo documento, una copia dello stesso documento va in entrambi i riquadri, per guardarne insieme l'inizio e la fine. Anche un documento nuovo mai salvato si può dividere.
- Trascina il **divisore** tra i riquadri per cambiarne la proporzione, fai doppio clic per metà e metà, oppure spingilo fino a un'estremità per chiudere quel riquadro; il documento resta aperto come scheda.

## Una sola finestra IA che segue il fuoco

- Si vede una sola finestra IA. Il riquadro su cui stai lavorando mostra la sua; quella dell'altro riquadro si ripiega in una barra laterale, e un clic su un riquadro porta davanti la sua finestra IA.
- Mentre è ripiegata, la conversazione di quel riquadro e il lavoro IA in corso restano vivi. Le conversazioni sono conservate per documento.
- **Due copie dello stesso documento**: dopo aver salvato in un riquadro, salvando dall'altro viene prima chiesto «Questo documento è cambiato altrove». Il salvataggio automatico aspetta in silenzio.
- Dopo una chiusura normale, **riavviando l'applicazione senza file** torna l'ultima coppia di documenti divisi esattamente com'era; avviandola con un file si apre solo quel file. Dopo uno spegnimento improvviso, le schede precedenti tornano come descritto più sotto.
- Le schede Home, Guida e Presentazione (anteprima) non possono entrare in un riquadro; mentre una è aperta, i due riquadri si nascondono per un momento e tornano quando si rientra in una scheda di documento.

Tre o più riquadri, la divisione dentro una finestra staccata e la sincronizzazione in tempo reale delle due copie sono rimandate.

## Quando l'app o il PC si spengono all'improvviso

Finché un documento ha modifiche non salvate, GenOffice ne conserva una copia di recupero circa ogni 30 secondi nella cartella dati dell'applicazione stessa. Lo fanno tutti gli editor, anche per un documento nuovo mai salvato. Il tuo file non cambia finché non salvi.

- **Le schede tornano**: se l'app o il PC si sono spenti senza una chiusura normale (un'interruzione di corrente, un arresto anomalo, l'app chiusa forzatamente, il PC spento o riavviato per un aggiornamento), al successivo avvio di GenOffice tornano le schede dei documenti aperti, nello stesso ordine e con la vista divisa se c'era. Succede anche se lo avvii aprendo un file.
- **Un solo elenco nella Home**: i documenti che hanno ancora contenuto non salvato compaiono insieme nella schermata Home. Scegli **Ripristina** o **Scarta** per ciascuno, oppure usa **Ripristina tutto** o **Scarta tutto**, poi premi **Conferma**. Se un altro programma o un servizio di sincronizzazione ha modificato il file in seguito, **Scarta** è già selezionato perché il file resti com'è ora. Se il file originale non si trova più, il ripristino apre il contenuto come nuovo documento senza titolo.
- **Decidi più tardi**: chiudere l'elenco non cancella nulla. La prima volta che apri uno di quei documenti, una finestra con il suo nome lo chiede di nuovo; premere Esc o chiudere la finestra lo ripristina. Se il contenuto ripristinato non ti serve, chiudi il documento con **Non salvare**.
- **Le schede si caricano quando le apri**: le schede ripristinate mostrano subito il titolo, ma ogni documento si carica solo al primo clic sulla sua scheda. Aprire tutto in una volta potrebbe far spegnere di nuovo un PC con poca memoria.
- **Quando il PC si spegne**: se ci sono documenti non salvati, GenOffice non chiede se salvarli. Conserva le copie, si chiude e le propone al successivo avvio.
- **Documenti senza copia**: i file Excel, HWP e PDF protetti da password non hanno una copia di recupero, quindi le loro modifiche non salvate non si possono ripristinare; un avviso lo segnala una volta quando si apre un documento del genere. Salvali spesso. I documenti Word e PowerPoint protetti da password hanno una copia bloccata con la stessa password.
- **File CSV, vecchi .xls e .tsv**: l'editor di fogli di calcolo conserva la loro copia come cartella di lavoro senza titolo. Una volta ripristinata si apre come cartella di lavoro senza titolo, e il primo salvataggio propone la cartella e il nome del file originale come .xlsx.

Una copia viene cancellata quando salvi il documento, lo chiudi con **Non salvare** o scegli **Scarta**, e anche dopo 30 giorni senza modifiche. Dopo una chiusura normale, GenOffice si avvia come prima e non riporta indietro schede.

**Non è il salvataggio automatico.** Il salvataggio automatico scrive le modifiche nel file stesso, e solo dopo che lo hai salvato una volta. Una copia di recupero non tocca mai il tuo file; conserva solo ciò che non hai ancora salvato, finché non salvi o scarti.
