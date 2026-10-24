# Impostazioni, lingua, tema e integrazioni MCP

## Apertura delle impostazioni

La riga in basso a sinistra in Home apre il pannello delle impostazioni (finché non è collegata un'IA riporta Collega l’IA). Ha cinque sezioni: Account, IA, Generale, Integrazioni e Informazioni.

**Account** mostra a che punto sono i tuoi abbonamenti Claude e Codex, e **Gestisci connessioni** porta alla sezione IA. L'IA ha i suoi articoli: [Connessione con abbonamento](help://subscription) e [Modelli IA e impostazioni](help://ai-models).

## Lingua

- Le impostazioni offrono **21 lingue per l'interfaccia**: inglese, cinese semplificato, giapponese, coreano, francese, tedesco, spagnolo, thai, indonesiano, russo, arabo, portoghese, italiano, polacco, ceco, olandese, malese, ebraico, hindi, cinese tradizionale, vietnamita.
- Il cambio ha effetto immediato e viene ricordato; la barra dei menu nativa viene ricostruita nella nuova lingua.

## Tema

Chiaro / Scuro / Segui il sistema. L'opzione Segui il sistema segue l'aspetto del sistema operativo e gli editor si adattano in sincronia senza sfarfallii.

## Generale

- **Posizione della barra laterale IA** (sinistra o destra), **Dimensione del testo del pannello IA** e **Controllo ortografico nella chat IA**.
- **Apri il pannello IA nei nuovi documenti** — disattivato, un nuovo documento si apre con il pannello richiuso, a un clic di distanza.
- **Salva automaticamente tutti i documenti** attiva il salvataggio automatico per impostazione predefinita in ogni editor; puoi comunque disattivarlo per una singola finestra.
- **Posizione di salvataggio** con il pulsante **Cambia** e **App predefinita per i documenti Office** per far gestire a GenOffice .docx / .xlsx / .pptx.

GenOffice non raccoglie né invia statistiche di utilizzo, quindi non c'è alcun interruttore.

## IA ▸ Avanzate

Resta chiusa finché non la apri; alla maggior parte delle persone non serve mai. La scheda **Modello IA** contiene le chiavi API e i server che gestisci tu, per la chat. Nella scheda **Media e ricerca IA** ogni capacità sceglie il fornitore che la serve e la chiave e l'URL di base di un fornitore si inseriscono una volta sola e si condividono:

- **Ricerca web**, **Generazione di immagini**, **Analisi di immagini** e **Analisi video**, ciascuna con un provider, un modello, una chiave e un URL di base.
- La **ricerca file locale** gira su questa macchina. Sotto, il **reranking di ricerca Jev** è **disattivato per impostazione predefinita**. Attivandolo, i estratti dei primi 20 risultati locali — fino a 1.200 caratteri per documento, più nomi di file e cartelle — vanno all'endpoint decisionale scelto (Jev via OpenRouter o TypeSafe, Perplexity, Liquid AI d1, Cloudflare, un motore locale o un URL personalizzato) per essere riordinati per rilevanza. Da disattivato, nulla lascia il dispositivo.
- **Consenti alle richieste automatiche di usare un abbonamento** è **disattivato per impostazione predefinita**. Decide se una richiesta che arriva dalla riga di comando o da un agente di programmazione collegato può usare il tuo abbonamento Claude o Codex; vedi [Collegare un agente di programmazione](help://mcp).

## Informazioni

- **Versione**, l'indirizzo GitHub del progetto e una riga che indica il progetto open source su cui si basa questa app.
- **Canale di aggiornamento**: Stabile o Beta. Modificarlo ha effetto immediato e controlla la presenza di un aggiornamento; non riporta un'installazione Beta alla versione Stabile.

## Associazioni come app predefinita

Le impostazioni possono registrare GenOffice come gestore dei file .docx / .xlsx / .pptx / .pdf e simili (registrazione dell'app predefinita a livello di sistema; conferma quando richiesto).

## Note sul software di terze parti e aggiornamenti

- Aiuto ▸ Note sul software di terze parti: l'elenco completo delle licenze open source incluso nell'app.
- Menu (☰) ▸ Controlla aggiornamenti… (su un Mac, Aiuto ▸ Controlla aggiornamenti…): avvia un controllo manuale; se c'è una versione più recente ti propone di installarla.

## Integrazione MCP (per utenti avanzati / client IA)

**Integrazioni** è il riquadro che collega GenOffice a un agente di programmazione, e ha un articolo tutto suo: Collegare un agente di programmazione. In breve — scegli una strada (la riga di comando, oppure MCP), segui quella sezione, poi apri una nuova conversazione e fai la domanda.

Sotto **Server HTTP locale** l'app può anche eseguire il server per conto proprio — un interruttore di attivazione e una porta — e **Avanzato** aggiunge l'URL di controllo integrità e il file di registro, invece di lasciarlo all'assistente. Ascolta solo su localhost.

## Riepilogo rapido dei comandi

| Comando             | Cosa fa                      |
| ------------------- | ---------------------------- |
| `ieumoffice <file>` | apre un file                 |
| `ieumoffice mcp`    | avvia il server MCP locale   |
| `ieumoffice --help` | tutti i comandi e le opzioni |
