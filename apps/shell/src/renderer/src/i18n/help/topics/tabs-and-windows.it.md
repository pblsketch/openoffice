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
- **Riavviando l'applicazione senza file** torna l'ultima coppia di documenti divisi esattamente com'era; avviandola con un file si apre solo quel file.
- Le schede Home, Guida e Presentazione (anteprima) non possono entrare in un riquadro; mentre una è aperta, i due riquadri si nascondono per un momento e tornano quando si rientra in una scheda di documento.

Tre o più riquadri, la divisione dentro una finestra staccata e la sincronizzazione in tempo reale delle due copie sono rimandate.
