# Installare GenOffice

Ogni versione viene pubblicata sulla [pagina Releases](https://github.com/pblsketch/openoffice/releases/latest) del progetto su GitHub. La versione per Windows viene pubblicata insieme alle versioni per Mac e Linux, rilasciate in beta. Lo sviluppatore non può provare direttamente le versioni per Mac e Linux; vengono confermate dalle segnalazioni degli utenti.

## Scegli il file giusto per il tuo computer

| Piattaforma                               | Requisiti                                    | File                              |
| ----------------------------------------- | -------------------------------------------- | --------------------------------- |
| **Windows**                               | Windows 10 o successivo, Intel/AMD a 64 bit  | `GenOffice-Setup-<version>.exe`   |
| **Mac (beta)**, Apple Silicon             | macOS 12 o successivo, chip M1 o più recente | `GenOffice-<version>-arm64.dmg`   |
| **Mac (beta)**, Intel                     | macOS 12 o successivo, processore Intel      | `GenOffice-<version>-x64.dmg`     |
| **Linux (beta)**, qualsiasi distribuzione | 64 bit (x86_64)                              | `GenOffice-<version>.AppImage`    |
| **Linux (beta)**, famiglia Ubuntu/Debian  | 64 bit (x86_64)                              | `ieumoffice_<version>_amd64.deb`  |
| **Linux (beta)**, Fedora/RHEL/openSUSE    | 64 bit (x86_64)                              | `ieumoffice-<version>.x86_64.rpm` |

Per sapere che Mac hai, apri il menu Apple ▸ **Informazioni su questo Mac**. Se alla voce «Chip» c'è Apple M…, prendi il file che termina con `-arm64.dmg`; se alla voce «Processore» c'è Intel …, prendi quello che termina con `-x64.dmg`. Gli altri file della pagina Releases (`.zip`, `.yml`, `.blockmap`) sono quelli che l'app stessa usa per aggiornarsi; non devi scaricarli. Le versioni più vecchie restano sulla pagina Releases.

## Su Windows

1. Scarica `GenOffice-Setup-<version>.exe` dalla pagina Releases.
2. Eseguilo. Il programma di installazione non ha una firma digitale, quindi Windows può mostrare prima una finestra blu «PC protetto da Windows». Scegli **Ulteriori informazioni**, poi **Esegui comunque**. Il testo esatto dipende dalla tua versione di Windows.
3. Segui il programma di installazione fino alla fine.

Inserisce GenOffice nel menu Start e registra `.docx`, `.xlsx`, `.pptx`, `.pdf` e simili, così un doppio clic su un file lo apre.

Poiché il programma di installazione non è firmato, esegui solo quello che hai scaricato dalla pagina Releases indicata sopra.

## Quando Windows blocca il download o l'installazione

### Edge dice che il file «non viene scaricato comunemente»

Microsoft Defender SmartScreen avvisa così per un file che non ha visto scaricare da molte persone. La guida di Microsoft per mantenere il file è questa:

1. Apri l'elenco dei download di Edge (**Ctrl+J**), premi **…** accanto al file e scegli **Mantieni**.
2. Nella finestra che si apre, premi **Mostra altro**, poi **Mantieni comunque**. Il file resta nella cartella Download.

Quella finestra ha anche un pulsante che segnala il file come sicuro. Apre soltanto la pagina di segnalazione di Microsoft (`feedback.smartscreen.microsoft.com`) e non mantiene il file. Chiudi quella pagina e premi invece **Mostra altro** nella finestra.

Se la finestra non ha **Mostra altro** o non ha **Mantieni comunque**:

- Su un PC gestito da una scuola o da un'azienda, l'amministratore può impedire di ignorare questi avvisi (un criterio di Edge). In quel caso nessuno su quel PC può mantenere il file; chiedi all'amministratore di installarlo o di consentirlo.
- Scaricando dalla pagina Releases con un altro browser ottieni lo stesso file.
- Se nessuna delle due soluzioni funziona e il PC è tuo, la guida di Microsoft alla risoluzione dei problemi di download consente, come ultima risorsa, di disattivare per un momento Microsoft Defender SmartScreen: in Edge apri **Impostazioni e altro (…) ▸ Impostazioni ▸ Privacy, ricerca e servizi ▸ Sicurezza**, disattiva **Microsoft Defender SmartScreen**, scarica di nuovo il file, poi riattivalo subito. Finché è disattivato, Edge non ti avvisa né sui download né sui siti pericolosi come le pagine di phishing.

### Compare una finestra «PC protetto da Windows»

Microsoft Defender SmartScreen mostra questa finestra la prima volta che vede un programma di installazione non firmato. Premi **Ulteriori informazioni** e compare un pulsante **Esegui comunque**. Su un PC gestito da una scuola o da un'azienda, un'impostazione dell'amministratore può nascondere quel pulsante; chiedi all'amministratore.

### Il Controllo intelligente delle app lo blocca

Quando il Controllo intelligente delle app di Windows 11 è attivo, blocca i programmi di installazione non firmati e non offre il percorso di **Ulteriori informazioni**. Microsoft afferma che non c'è modo di consentire una singola app: l'unica opzione è disattivare il Controllo intelligente delle app, in **Sicurezza di Windows ▸ Controllo app e browser ▸ Impostazioni di Controllo intelligente delle app**. Così questa protezione viene tolta anche a tutte le altre app. Con gli aggiornamenti recenti di Windows si può riattivare senza reinstallare Windows.

## Su un Mac (beta)

Serve macOS 12 (Monterey) o successivo. La versione per Mac non ha una firma da sviluppatore Apple, quindi la prima volta che la apri macOS dice che non può verificare che l'app sia priva di malware e non la apre. Consentila una sola volta, come indicato sotto.

1. Apri il dmg e trascina `GenOffice.app` nella cartella **Applicazioni**.
2. Apri GenOffice dalla cartella Applicazioni. Quando compare l'avviso, premi **Fine**.
3. Apri **Impostazioni di Sistema ▸ Privacy e sicurezza**. Verso il fondo, accanto alla riga che dice che GenOffice è stato bloccato, premi **Apri comunque** e inserisci la password del Mac. Il pulsante compare per circa un'ora dopo che hai provato ad aprire l'app.
4. Nella finestra che compare di nuovo, premi **Apri**. Da quel momento si apre senza avvisi.

Su macOS 12 il percorso è **Preferenze di Sistema ▸ Sicurezza e Privacy ▸ Generali**, e lì il pulsante è **Apri comunque**.

Se macOS dice che l'app «è danneggiata e non può essere aperta», non spostarla nel Cestino. Esegui la riga qui sotto nel Terminale, poi apri di nuovo l'app e consentila come sopra. Rimuove il contrassegno che macOS applica ai file scaricati da internet.

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

Se macOS dice che l'app non è supportata su questo Mac, controlla due cose:

- Un Mac Intel non può eseguire il file per Apple Silicon (`-arm64.dmg`). Controlla «Processore» in **Informazioni su questo Mac**, elimina l'app che hai installato e installa invece il file `-x64.dmg`.
- macOS 11 o precedente non può eseguire GenOffice. **Informazioni su questo Mac** mostra anche la versione di macOS.

Sempre su un Mac:

- Le schede di connessione IA non hanno un pulsante di installazione. Segui il link alla guida ufficiale di installazione sulla scheda per installare Claude Code o Codex. L'app desktop di Claude non è Claude Code, quindi Claude Code va installato anche se l'app desktop è già presente.
- L'accesso si completa nel browser. Se il browser ti chiede di incollare un codice, esegui tu stesso `claude auth login` o `codex login` nel Terminale. Vedi [Connessione con abbonamento](help://subscription).

## Su Linux (beta)

- **AppImage**: rendilo eseguibile (`chmod +x GenOffice-<version>.AppImage`) e avvia il file. Non ci sono passaggi di installazione.
- **deb**: installa con `sudo apt install ./ieumoffice_<version>_amd64.deb`.
- **rpm**: installa con `sudo dnf install ./ieumoffice-<version>.x86_64.rpm`. Su openSUSE usa `sudo zypper install ./ieumoffice-<version>.x86_64.rpm`.

I pacchetti deb e rpm si installano in `/opt/GenOffice` e collegano il comando da terminale `/usr/bin/ieumoffice`. Come su un Mac, le schede di connessione IA non hanno un pulsante di installazione e, quando un accesso chiede un codice, esegui tu stesso `claude auth login` o `codex login` in un terminale.

## Aggiornamenti

- GenOffice cerca una versione più recente sulla stessa pagina Releases di GitHub. Quando ne viene pubblicata una, **Impostazioni ▸ Informazioni** la propone: premi **Aggiorna alla versione …**, attendi il download, poi premi **Riavvia e installa**. Su Windows una finestra mostra l'avanzamento dell'installazione; al termine GenOffice si riapre con i documenti che avevi aperti. Su Mac l'app si chiude, viene sostituita dalla nuova versione e si riapre con i documenti che avevi aperto. Funziona per un'app nella cartella Applicazioni; un'app aperta direttamente dall'immagine disco ti rimanda invece alla pagina di download. L'aggiornamento si installa solo quando premi quel pulsante, mai alla semplice chiusura dell'app.
- Su Linux si aggiorna da solo solo l'AppImage. Con un'installazione deb o rpm l'app segnala la nuova versione e apre la pagina di download; installa il nuovo file allo stesso modo.
- **Menu (☰) ▸ Controlla aggiornamenti…** controlla ogni volta che lo chiedi. Su un Mac è **Aiuto ▸ Controlla aggiornamenti…**.
- Quando il controllo non riesce — manca la rete, o non è ancora stato pubblicato nulla — non succede niente e l'app continua a funzionare come prima.
- **Canale di aggiornamento**, sempre in Impostazioni ▸ Informazioni, è Stabile o Beta. Modificarlo ha effetto immediato e controlla la presenza di un aggiornamento; non riporta un'installazione Beta alla versione Stabile.
- Nemmeno gli aggiornamenti hanno una firma digitale. Prima di installarne uno, l'app confronta il file scaricato con il checksum pubblicato insieme a quella versione.
- Se **Riavvia e installa** chiude l'app ma la nuova versione non compare, all'avvio successivo l'app lo segnala e propone di nuovo l'aggiornamento. Questa volta il programma di installazione si apre in una finestra propria, così puoi seguirlo e rispondere a una richiesta di autorizzazione dell'amministratore. Se non funziona neanche così, la finestra di aggiornamento indica la pagina di download; installare con il file scaricato da lì mantiene impostazioni e documenti. Ciò che ha fatto l'aggiornamento è scritto in `update-log.txt` nella cartella dati dell'app (digita `%APPDATA%\GenOffice` nella barra degli indirizzi di Esplora file per aprirla). Allega questo file quando segnali il problema.

## La build che stai eseguendo

**Impostazioni ▸ Informazioni** è dove l'app riporta la versione che hai, il canale che segue e dove vive il progetto. Indica anche il progetto open source su cui si basa questa app.

## La riga di comando è inclusa

Ogni installazione include il comando `ieumoffice`, che comunica con gli stessi motori della finestra, così i due non si contraddicono mai su un file. `ieumoffice install-cli` lo mette sul tuo `PATH`. Vedi [Riga di comando e agenti](help://cli) per scoprire cosa può fare.
