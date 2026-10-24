# Abilità

Un'abilità è un insieme di istruzioni di lavoro per l'IA. Scrivi una volta sola ciò che fai di continuo — i passaggi per riordinare gli appunti di una riunione, il tono di un rapporto, i punti da controllare ogni volta — e potrai richiamarla nel pannello IA, oppure l'IA la userà da sola quando è adatta. Un'abilità è una cartella con un file `SKILL.md` in un formato aperto, quindi un'abilità creata in GenOffice funziona così com'è anche in Claude Code o in Codex.

## Attivare e disattivare le abilità

**Impostazioni ▸ Abilità** elenca le abilità presenti su questo PC, raggruppate in base alla provenienza. Ogni abilità è mostrata con il suo nome, come fanno gli agenti di programmazione. Con la casella di ricerca in alto puoi trovarne una per nome o descrizione.

| Provenienza                    | Che cosa contiene                                             | All'inizio  |
| ------------------------------ | ------------------------------------------------------------- | ----------- |
| **Integrate**                  | Le 5 abilità fornite con GenOffice                            | Attive      |
| **Le mie abilità**             | Le abilità che hai aggiunto o creato (`~/.ieumoffice/skills`) | Attive      |
| **Cartella abilità di Claude** | Le abilità in `~/.claude/skills`                              | Disattivate |
| **Plugin di Claude**           | Le abilità dei plugin Claude installati                       | Disattivate |
| **Cartella abilità di Codex**  | Le abilità in `~/.agents/skills`                              | Disattivate |

- L'interruttore attiva o disattiva un'abilità. La stessa impostazione vale per il pannello IA di ogni editor, per Ask AI in Home e per la finestra dell'agente.
- Per un'abilità attiva, scegli **Decide l'IA** o **Solo se richiamata**. All'inizio è impostata su Decide l'IA. Con Solo se richiamata, l'abilità viene usata solo quando la richiami tu.
- Abilità di provenienze diverse possono avere lo stesso nome. L'etichetta della provenienza su ogni riga permette di distinguerle.
- Il menu delle altre azioni contiene **Vedi contenuto**, **Modifica** (solo per le mie abilità), **Esporta (zip)** (solo per le mie abilità) e **Apri cartella**.
- **Sposta nel cestino** sposta una delle mie abilità nel cestino del sistema, da cui puoi ripristinarla.
- Un'abilità integrata non si elimina, si nasconde: scegli **Nascondi**. **Mostra di nuovo** in fondo all'elenco la riporta com'era all'inizio.
- Per cambiare un'abilità integrata o una che viene da un altro programma, scegli **Copia nelle mie abilità**. La copia compare tra le mie abilità e l'originale viene disattivato.
- Se esporti un'abilità con un modello, nello zip finisce anche il documento modello. Prima di esportarla, controlla che il documento non contenga dati personali.

## Aggiungere un'abilità

1. In **Impostazioni ▸ Abilità**, fai clic su **Aggiungi**.
2. Scegli **Da una cartella**, **Da un file zip** o **Da un link GitHub**. Per GitHub, inserisci l'indirizzo di un repository pubblico oppure `owner/repo` e fai clic su **Cerca**.
3. Controlla nell'anteprima le abilità trovate. L'anteprima mostra il numero e la dimensione dei file, se ci sono script, gli indirizzi web presenti nel testo e il file della licenza.
4. Spunta solo le abilità da installare e fai clic su **Installa**. Le abilità installate partono attive.

Sotto l'anteprima compare sempre: «Installa abilità solo da fonti affidabili. Un'abilità dà istruzioni all'IA e nella finestra dell'agente può eseguire script». Prima di installare un'abilità di provenienza sconosciuta, leggila.

- Se tra le mie abilità ce n'è già una con lo stesso nome, scegli **Sostituisci** o **Salta** su quella riga.
- Quando scarica da GitHub, GenOffice si collega solo a `github.com`, `api.github.com` e `codeload.github.com` e non invia alcun dato di accesso. Se l'archivio è troppo grande o non supera i controlli di sicurezza, non viene installato nulla.
- **Nuova abilità** apre un editor vuoto in cui scrivi tu nome, descrizione e istruzioni.

## Cercare aggiornamenti

- Per un'abilità installata da GitHub, **Cerca aggiornamenti** nel menu delle altre azioni controlla se c'è un contenuto nuovo. GitHub viene contattato solo quando fai clic.
- Se non è cambiato nulla, compare «Aggiornata». Se qualcosa è cambiato, esamina i file modificati e l'anteprima, poi fai clic su **Aggiorna**.
- Se hai modificato l'abilità dopo averla installata, compare anche «Le tue modifiche andranno perse».
- L'aggiornamento conserva lo stato attivo/disattivo dell'abilità e la scelta tra Decide l'IA e Solo se richiamata.

## Richiamare un'abilità nel pannello IA

1. Digita `/` o `$` all'inizio della casella di input dell'IA o subito dopo uno spazio. Compare l'elenco delle abilità attive.
2. Continua a scrivere per restringere l'elenco. Per esempio, `/meet` trova `meeting-minutes`. Funzionano anche le parole della descrizione, quindi va bene anche `/verb`.
3. Scegline una con i tasti freccia e premi Invio o Tab. L'abilità diventa un chip sopra la casella di input.
4. Scrivi che cosa vuoi e invia. GenOffice aggiunge alla richiesta il contenuto dell'abilità.

- Nel pannello IA di Excel, `$` apre l'elenco solo all'inizio della casella di input, così non intralcia gli indirizzi di cella come `$A$1`.
- Puoi aggiungere più chip e toglierne uno con ×. Esc chiude solo l'elenco, non interrompe un'esecuzione dell'IA.
- **Gestisci abilità…** in fondo all'elenco apre **Impostazioni ▸ Abilità**.
- I chip restano sul messaggio inviato e nella chat salvata. Se riapri una chat e invii di nuovo, il contenuto attuale dell'abilità viene riletto. Un'abilità rimossa o disattivata nel frattempo appare sul suo chip come «Non disponibile».
- Se il testo delle abilità da allegare è troppo lungo, compare «Le abilità sono troppo grandi per essere inviate insieme» e non viene inviato nulla.

## Abilità che l'IA usa da sola

- Delle abilità attive impostate su Decide l'IA, nomi e descrizioni vengono passati all'IA come elenco. Quando una si adatta alla richiesta, l'IA ne prende il contenuto e la usa.
- Quando l'IA usa un'abilità, nella chat compare «Abilità 〈nome〉 usata».
- L'IA decide in base alla descrizione se usare un'abilità. Una descrizione che dice in quali casi l'abilità va usata la aiuta a scegliere bene.

## Creare un'abilità chiedendola

1. Nel pannello IA, scrivi per esempio «Salva come abilità quello che abbiamo appena fatto» oppure «Crea un'abilità che scriva i rapporti nello stile della nostra organizzazione».
2. L'IA individua i passaggi e le regole che vale la pena ripetere e mostra una scheda **Nuova abilità**. I valori usati solo questa volta, come nomi e date, restano fuori dalle istruzioni.
3. Controlla e correggi sulla scheda nome, descrizione e istruzioni. Il nome è quello che compare nell'elenco delle abilità e che scrivi dopo `/`: lettere inglesi minuscole, cifre e trattini.
4. Fai clic su **Salva**. La nuova abilità viene aggiunta alle mie abilità, viene attivata e compare subito nell'elenco di `/`.

- Nessun file viene scritto finché non fai clic su **Salva**. Se fai clic su **Annulla**, la chat la conserva solo come «Proposta di abilità non salvata».
- Puoi anche chiedere di cambiare un'abilità esistente, per esempio «Cambia l'abilità dei verbali come facciamo noi». In quel caso la scheda si intitola **Modifica abilità**. Una delle mie abilità viene sovrascritta con **Sostituisci**; un'abilità integrata o di un altro programma viene salvata come copia tra le mie abilità e l'originale viene disattivato.

## Aggiungere un documento come modello

Quando crei un'abilità nel pannello IA di un editor, il documento attuale può accompagnarla come modello. Spunta **Salva anche questo documento come modello** sulla scheda e il pulsante si sdoppia.

- **Crea un modello vuoto**: una copia del documento si apre in una nuova scheda, «Anteprima del modello - 〈titolo〉», e l'IA di quella scheda svuota i valori compilati come nomi, date e dati personali. Esamina la scheda, cambia altro a mano, poi fai clic su **Salva questa scheda come modello**; la scheda così com'è in quel momento diventa il modello.
- **Salva il documento così com’è**: salva come modello il documento attuale senza modifiche. Se il documento ha parti che hai nascosto all'IA, questo pulsante è bloccato, così il contenuto nascosto non finisce nel modello tale e quale.
- Il modello è conservato come copia del documento nella cartella dell'abilità. Il documento originale non cambia.

## Usare un'abilità con un modello

- Un'abilità con un modello mostra **Con modello** nell'elenco.
- Richiamala come chip e invia: una copia del modello si apre come nuovo documento senza titolo e l'IA di quella scheda prosegue con la tua richiesta. Nel pannello di partenza restano «Si lavora con il modello in una nuova scheda» e **Vai alla scheda**.
- Quando l'IA sceglie da sola un'abilità con modello, nessuna scheda si apre subito. La chat mostra invece il pulsante **Apri un nuovo documento da questo modello**.
- Di solito scegli dove va il nuovo documento la prima volta che lo salvi. Gli editor Markdown e HTML salvano come sempre nella cartella predefinita. Il file modello resta com'era.

## Abilità con script

- Nel pannello IA normale e in Ask AI in Home, gli script di un'abilità non vengono mai eseguiti. All'IA arriva solo il testo dell'abilità.
- Un'abilità con script mostra **Con script · funziona del tutto nella finestra dell'agente**, e quando la aggiungi come chip compare «Gli script di questa abilità non vengono eseguiti nel pannello IA normale». L'invio non viene bloccato.
- Per usare anche gli script, richiama l'abilità nella finestra dell'agente. Vedi [Modalità agente](help://agent-mode).

## Abilità integrate

| Abilità           | Che cosa fa                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `meeting-minutes` | Trasforma gli appunti di una riunione in un verbale con le decisioni e le attività da svolgere |
| `internal-comms`  | Scrive avvisi, newsletter, aggiornamenti sull'avanzamento, FAQ e altri testi interni           |
| `humanizer`       | Trova le espressioni che sembrano scritte da un'IA e le rende naturali                         |
| `copy-editing`    | Rilegge un testo in inglese già scritto e lo rende più chiaro e conciso                        |
| `find-skills`     | Trova nella finestra dell'agente le abilità che ti servono e ne propone l'installazione        |

`copy-editing` è pensata per testi di marketing in inglese. `find-skills` funziona solo nella finestra dell'agente.

## Nella finestra dell'agente

- La finestra dell'agente segue le stesse impostazioni di attivazione di **Impostazioni ▸ Abilità**, e nella sua casella di input richiami le abilità con `/` o `$` allo stesso modo.
- Le abilità che si trovano in `.claude/skills` e `.agents/skills` della cartella del progetto vengono usate in quella sessione senza doverle attivare.
- L'elenco delle abilità viene fissato all'avvio della sessione. Se attivi o disattivi abilità durante una sessione, compare «Le abilità modificate valgono dalla prossima sessione».
- Quando l'agente crea un'abilità, nella finestra compare la stessa scheda. Per il modello, scegli tra i documenti aperti nelle schede e i file della cartella del progetto.
- Quando l'agente trova un'abilità che vale la pena installare, compare una proposta di installazione. Aprila con **Apri anteprima** e fai clic tu stesso su **Installa**; altrimenti non viene installato nulla. Un'abilità installata è disponibile dalla sessione successiva.
