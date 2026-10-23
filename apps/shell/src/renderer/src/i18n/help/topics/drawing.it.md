# L'editor di disegni

L'editor di disegni apre i disegni di Excalidraw in una scheda tutta loro e li salva nello stesso file.

- **Cosa apre**: le note di disegno create con il plugin Excalidraw di Obsidian (`.excalidraw.md`, oppure un `.md` il cui front matter contiene `excalidraw-plugin`) e i file `.excalidraw` dell'app web di Excalidraw.
- **Nuovo disegno**: la scheda **Disegno Excalidraw** in Home, oppure **File ▸ Nuovo**. Un nuovo disegno è una nota di disegno di Obsidian (`.excalidraw.md`) e gli dai un nome al primo salvataggio.
- **Disegnare**: forme, frecce, linee, disegno a mano libera e testo, con la barra degli strumenti e le scorciatoie proprie della tela. ctrl+Z annulla.
- **Salvataggio**: ctrl+S. Un file viene salvato nel formato in cui è stato aperto. Il salvataggio automatico scrive ogni 30 secondi e quando la finestra perde il focus, ma salta un disegno che non ha ancora un nome di file. Un disegno che hai solo guardato viene salvato byte per byte com'era.

## Note di disegno di Obsidian

- Il salvataggio riscrive solo l'elenco dei testi della nota e i dati del disegno. Il front matter, il testo che hai scritto nella nota e i suoi collegamenti restano com'erano, così la nota si apre allo stesso modo in Obsidian.
- Le immagini a cui la nota rimanda (`[[immagine.png]]` sotto Embedded Files) vengono mostrate quando si trovano nella cassaforte della nota: la prima cartella sopra la nota che contiene una cartella `.obsidian`, altrimenti la cartella della nota. Le immagini oltre 20 MB, nelle cartelle nascoste o fuori dalla cassaforte non vengono mostrate.
- Non puoi ancora aggiungere nuove immagini a una nota. Lo strumento immagine è disattivato e il rilascio di file sulla tela è bloccato, perché un'immagine conservata solo dentro la nota potrebbe non comparire in Obsidian.

## Cosa non fa ancora

- Non c'è un pannello IA. L'IA non può leggere né modificare i disegni.
- Non c'è l'esportazione in PNG o SVG.
- L'editor resta fuori dalla rete. I suoi caratteri sono integrati, e le librerie condivise, la collaborazione dal vivo e i contenuti web incorporati sono disattivati. Un collegamento in un disegno si apre nel browser solo quando è un indirizzo web o di posta.

## Aprire i disegni da Esplora file

Il programma di installazione aggiunge l'app ad **Apri con** per i file `.excalidraw`, senza farla diventare il programma predefinito. Una nota di disegno è un file `.md`, quindi si apre ovunque si apra un file Markdown nell'app e finisce nell'editor di disegni invece che nell'editor Markdown.
