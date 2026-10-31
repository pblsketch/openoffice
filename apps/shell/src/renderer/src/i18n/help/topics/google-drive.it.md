# Google Drive

Collega Google Drive per aprire in GenOffice i file di Drive che scegli e modificarli. Quando salvi, il file torna su Drive. GenOffice può aprire solo i file che scegli nella finestra di Google; il resto del tuo Drive non lo vede.

## Collegare

1. Apri **Impostazioni ▸ Integrazioni**.
2. Leggi **Prima di usare i file di Drive con l'IA**, disattiva l'addestramento dei modelli negli account IA che usi con i file di Drive, poi seleziona quella voce.
   - Claude: in **Impostazioni ▸ Privacy** di Claude, disattiva l'addestramento dei modelli.
   - ChatGPT e Codex: in **Impostazioni ▸ Controlli dati** di ChatGPT, disattiva **Migliora il modello per tutti**.
   - I fornitori con chiave API non usano i dati dell'API per l'addestramento per impostazione predefinita.
   - Le connessioni IA gratuite (modelli gratuiti di OpenRouter, Gemini) non ricevono mai file di Drive.
3. Fai clic su **Collega Google Drive**. La pagina di accesso di Google si apre nel browser. Accedi e consenti l'accesso.
4. Torna a GenOffice. La scheda mostra l'account collegato.

Google non consente di inviare i file di Drive a un servizio di IA che li usa per addestrare i suoi modelli, quindi non puoi collegarti né scegliere file finché la voce non è selezionata.

L'accesso è conservato su questo PC con la cifratura che il sistema operativo fornisce al tuo account utente (la protezione di Windows, il portachiavi di macOS o un portachiavi del desktop su Linux). Se questo PC non può cifrarlo, il collegamento dura solo finché non chiudi l'app.

## Aprire i file di Drive

- Fai clic su **Google Drive** nella barra laterale della Home, poi su **Scegli da Google Drive**.
- Il selettore di file di Google si apre nel browser. Scegli i file da aprire (anche più di uno alla volta); GenOffice torna in primo piano e li apre nell'editor giusto.
- I file scelti una volta restano nell'elenco **File scelti**. Puoi riaprirli da lì o cercarli per nome e contenuto.
- I formati che GenOffice non può aprire sono in grigio. Documenti, Fogli e Presentazioni Google si aprono come file Word, Excel e PowerPoint.

## Salvare di nuovo su Drive

- Salva come sempre. Poco dopo il file viene caricato su Drive.
- Se qualcuno ha modificato il file su Drive dopo che l'hai aperto, ti viene chiesto se sovrascrivere il file su Drive, salvare una copia su Drive o tenere la modifica solo su questo PC.
- Un file che puoi solo visualizzare viene salvato su Drive come copia, oppure resta su questo PC.
- Un documento Google resta com'è. Le modifiche vengono salvate come file Office nella stessa cartella, oppure in Il mio Drive se in quella cartella non si può scrivere.
- Se un caricamento non riesce, le modifiche restano su questo PC e GenOffice riprova, anche al prossimo avvio dell'app.

## L'IA e Drive

- Nel pannello IA degli editor di Word, Excel, PowerPoint, HTML, mappe mentali e Hangul, fai clic su **Allega da Google Drive**, accanto al pulsante di allegato, per scegliere i file nella finestra di Google del browser e allegarli come file di questo PC. Fino a 20 alla volta.
- Finché **Consenti all'IA di trovare e leggere i file in Drive** è attivo (si attiva quando ti colleghi), l'IA di ogni editor può cercare e leggere i file di Drive che hai scelto in GenOffice. Ad esempio: "Trova nel mio Drive il verbale della riunione del mese scorso e riassumilo." Se il file non viene trovato, sceglilo prima nella Home.
- Ciò che l'IA legge va al fornitore di IA che usi. Le parti nascoste all'IA restano nascoste.
- Se l'IA in uso è una connessione gratuita, l'allegato da Drive e la lettura di Drive da parte dell'IA non funzionano.
- L'IA non può modificare, eliminare né condividere i file di Drive.
- Quando una chat contiene qualcosa letto da Drive, quella chat smette di usare la ricerca web, la ricerca di immagini, la lettura di pagine tramite indirizzo web e l'inserimento di immagini tramite indirizzo web. Avvia una nuova chat per usarle di nuovo.

## Scollegare

Fai clic su **Scollega** in **Impostazioni ▸ Integrazioni**. GenOffice rimuove l'accesso da questo PC e chiede a Google di revocare il suo accesso. Le copie dei file già su questo PC restano. Puoi anche rimuovere l'accesso in qualsiasi momento in **Connessioni di terze parti** del tuo Account Google.
