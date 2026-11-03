# Diagrammi: disegnare e modificare file draw.io

L’editor di diagrammi apre i file draw.io in una scheda. Ci disegni diagrammi di flusso, diagrammi di architettura e altri diagrammi, li salvi nel formato in cui sono arrivati, li esporti come immagini o PDF e lasci che l’IA li legga, li modifichi e li disegni. L’editor funziona interamente sul tuo PC.

## Aprire un diagramma

- L’editor apre i file `.drawio`, `.dio`, `.drawio.svg` e `.drawio.png`: dalla finestra di apertura, trascinando un file sulla finestra, dai file recenti, dall’albero delle cartelle o (per `.drawio` e `.dio`) dall’elenco di Google Drive. In Windows, l’installazione di GenOffice lo rende il programma per i file `.drawio` e `.dio`.
- Un file `.drawio.svg` o `.drawio.png` si apre solo se il diagramma è salvato dentro l’immagine. Una normale immagine SVG o PNG non viene aperta come diagramma. Nemmeno i file danneggiati si aprono, e viene mostrato il motivo.
- Un file di Visio (`.vsdx`) viene importato come nuovo diagramma senza titolo. Il primo salvataggio propone un file `.drawio` nella cartella del file di Visio, che resta invariato. Se alcune immagini al suo interno non si sono potute convertire, l’editor dice quante sono. In Windows i file `.vsdx` vengono proposti solo in «Apri con».
- Un nuovo diagramma vuoto si crea dal riquadro **Diagramma** nella Home o da Nuovo nel menu File.
- Se il diagramma è già aperto, la sua scheda passa in primo piano.

## Modificare

- La schermata di modifica è quella di draw.io così com’è: i menu in alto, le forme a sinistra, il pannello del formato a destra e le schede delle pagine in basso.
- Salva (Ctrl+S), Salva con nome (Ctrl+Shift+S) e Stampa (Ctrl+P) sono gestiti da GenOffice. Il cambio di scheda e le altre scorciatoie dell’app continuano a funzionare. Tutte le altre scorciatoie sono dell’editor, compreso l’annullamento (Ctrl+Z).
- **Aiuto** (F1), nei menu dell’editor, apre questa pagina.
- L’editor usa la lingua di GenOffice. Quando cambi lingua, l’editor si riavvia: le modifiche non salvate restano, ma la cronologia degli annullamenti va persa.
- L’editor segue il tema di GenOffice. Con il tema scuro anche il disegno appare in colori scuri, ma il file salvato, i PNG, i PDF e le stampe sono identici a quelli del tema chiaro.

## Salvare

- Salva, Salva con nome, il **Salvataggio automatico** nella barra di stato e la domanda prima della chiusura funzionano come negli altri editor.
- Un diagramma viene salvato nel formato con cui è stato aperto. Salva con nome propone `.drawio`, `.dio`, `.drawio.svg` e `.drawio.png`. Un nuovo diagramma viene salvato la prima volta come `.drawio`.
- Se non è cambiato nulla, il file non viene riscritto. Le pagine salvate in forma compressa nel file restano compresse.
- L’immagine di un file `.drawio.png` mostra la prima pagina; l’intero diagramma è salvato al suo interno.
- Finché un diagramma ha modifiche non salvate, una copia di ripristino viene tenuta nella cartella dati dell’app, così il lavoro sopravvive a un arresto anomalo.

## Esportare e stampare

- Scegli l’esportazione in PNG, SVG o PDF nel menu File (le voci di esportazione nei menu dell’editor aprono la stessa finestra). Poi scegli **Tutte le pagine** (l’impostazione predefinita) o **Solo la pagina corrente**.
- Con tutte le pagine, PNG e SVG producono un file per pagina, chiamato `<nome>-p<numero di pagina>`. Un PDF ha un foglio per pagina, nel formato di pagina impostato nel diagramma.
- Stampa (Ctrl+P) stampa anch’essa un foglio per pagina. Esportazioni e stampe usano sempre colori chiari, qualunque sia il tema.

## Pannello IA

- Chiedi all’IA di disegnare un diagramma di flusso, un diagramma di sequenza o un organigramma, di spiegare il diagramma, di riordinare una pagina o di aggiungere il passo successivo dopo le forme selezionate.
- L’IA legge il diagramma come testo: le pagine e, per ogni forma e connettore, l’id, il testo, la forma, la posizione e i collegamenti, oltre a quali forme hai selezionato. Non vede il diagramma come immagine.
- Le modifiche dell’IA compaiono subito. Ogni modifica è un passo di annullamento (Ctrl+Z), e l’elenco dei turni nel pannello annulla un intero turno dell’IA. Se una qualsiasi parte di una modifica viene rifiutata, il diagramma resta com’era.
- Per un nuovo diagramma di flusso, un diagramma di sequenza o simili, l’IA scrive Mermaid e GenOffice lo trasforma in forme sul tuo PC. La disposizione può differire un po’ da quella che produce il sito web di draw.io.
- I diagrammi si possono anche allegare nel pannello IA degli altri editor, scegliere con `@` e trovare con la ricerca dei file nella Home. Anche i [comandi da terminale](help://cli) leggono, modificano e creano diagrammi (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Uso di Internet

- La scheda del diagramma non invia nulla su Internet. L’editor funziona con file installati insieme a GenOffice, e l’archiviazione cloud, la condivisione, i plugin e l’IA propria dell’editor sono disattivati.
- Le immagini e i font che un diagramma prende da Internet non vengono caricati; un avviso lo segnala all’apertura del file. Un link web o e-mail su una forma si apre nel browser predefinito solo quando ci fai clic.
- Il blocco appunti, le librerie di forme che aggiungi e i colori recenti restano su questo PC, nella cartella dati dell’app. Il pannello IA invia il testo del diagramma all’IA che hai scelto, come negli altri editor.

## Non disponibile

- Inserire o modificare PlantUML. Le forme PlantUML di un file vengono mostrate come l’immagine salvata.
- I layout automatici che usano ELK e i connettori che girano attorno alle forme. Questi connettori vengono disegnati come connettori normali.
- I vecchi formati di Visio (`.vsd`, `.vss`) e il salvataggio di nuovo in `.vsdx`.
- Archiviazione cloud, condivisione, pubblicazione, plugin e le funzioni IA proprie dell’editor.
- Nascondere all’IA parti di un diagramma.
