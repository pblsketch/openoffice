# Connessione con abbonamento

GenOffice fa funzionare l'IA con un abbonamento che hai già: un abbonamento Claude (Anthropic) o un piano ChatGPT (OpenAI). ChatGPT si collega direttamente in GenOffice; se usi già il programma Codex di OpenAI su questo PC, puoi invece collegarti tramite Codex. Non ti serve una chiave API, e GenOffice non ha un proprio account a cui iscriversi.

## Come funziona

- L'IA non è integrata in GenOffice. Claude passa dal programma **Claude Code** installato su questo PC: GenOffice chiede la risposta a quel programma, e nel programma l'accesso è effettuato con il tuo account, quindi ogni richiesta viene conteggiata sul tuo piano.
- ChatGPT lo collega GenOffice stesso, senza alcun programma. Accedi nella pagina di accesso a ChatGPT di OpenAI che si apre nel browser e consenti a questa app di usare il tuo piano ChatGPT. Le richieste vanno da questo PC direttamente a OpenAI, e l'utilizzo viene conteggiato su quel piano ChatGPT.
- **Codex** è il programma di OpenAI. Quando ChatGPT è collegato tramite Codex, GenOffice chiede la risposta al programma Codex, come con Claude Code.
- GenOffice non ha un proprio modulo di accesso all'interno dell'app. Accedi nel programma dell'azienda stessa, o nella pagina web dell'azienda che si apre nel browser. GenOffice non legge né salva mai le credenziali di Claude Code o Codex. L'unico accesso che GenOffice conserva è quello che OpenAI concede a questa app quando colleghi ChatGPT direttamente, e resta su questo PC (cifrato su Windows). GenOffice non vede mai la tua password di ChatGPT.

## Prima di iniziare

Ti serve una di queste due cose. Averle entrambe va benissimo.

- Un abbonamento Claude (un piano Pro o Max; con un account Claude gratuito non è possibile collegarsi), e il programma Claude Code installato su questo PC e con l'accesso effettuato.
- Un piano ChatGPT. Con il collegamento diretto non c'è nessun programma da installare. Il piano gratuito consente solo un uso limitato. Se usi già il programma Codex su questo PC, puoi invece collegarti tramite Codex.

Se Claude Code o Codex non è ancora installato, o l'accesso non è ancora stato effettuato, ci pensano i pulsanti della sezione successiva.

## Collegamento

1. Apri **Impostazioni** dalla riga in basso a sinistra in Home e scegli **IA**. Sotto **Connessione con abbonamento** ci sono le schede per Claude, ChatGPT e Codex, in quest'ordine. Con un piano ChatGPT, collegati dalla scheda ChatGPT. La scheda Codex è per chi usa il programma Codex su questo PC.
2. Leggi che cosa dice la scheda e premi il suo pulsante. La tabella qui sotto spiega ogni stato.
3. Torna alla finestra di GenOffice. La scheda si verifica di nuovo da sola, e **Verifica di nuovo** lo fa subito.

Nel secondo passaggio delle schermate di benvenuto al primo avvio, e nel pannello IA quando nessuna IA è collegata, compare prima la domanda «Quale IA usi già?». Scegli un abbonamento Claude a pagamento, ChatGPT o nessuno dei due per ora, e vedrai solo i passaggi di quel percorso e la sua scheda. Per Claude i passaggi sono Installa il programma → Accedi → Connesso; per ChatGPT, Accedi → Connesso. Nel percorso ChatGPT, **Usi già il programma Codex su questo PC? Collegati con Codex** passa al percorso Codex (Installa il programma → Accedi → Connesso), e **Collegati direttamente nell’app, senza Codex** in quel percorso ti riporta al collegamento diretto. Se Codex è già collegato, il percorso Codex viene mostrato fin dall'inizio. **Scegli un altro modo** ti permette di scegliere di nuovo, e puoi saltare tutto e fare il collegamento più tardi. Se ancora non si collega, premi **Copia i dati per l’assistenza** e invia quanto copiato a chi ti sta aiutando. Non contiene account né percorsi di file.

| Che cosa dice la scheda                           | Che cosa significa                                                                                                                              | Che cosa fare                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verifica in corso…**                            | GenOffice sta chiedendo al programma a che punto è.                                                                                             | Attendi un momento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Non installato**                                | Il programma non è stato trovato su questo PC.                                                                                                  | Premi **Installa**. Il comando di installazione ufficiale dell'azienda viene eseguito in una nuova finestra del terminale, così puoi vedere che cosa fa. GenOffice non scarica nulla per conto suo. Se preferisci installare a mano, **Guida ufficiale all’installazione** apre le istruzioni dell'azienda.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Accesso non effettuato**                        | Il programma c'è, ma l'accesso non è stato effettuato.                                                                                          | Premi **Accedi**. Nel browser si apre la pagina di accesso dell'azienda: accedi lì e consenti l'accesso, e la scheda si collega da sola. Fai con calma: l'accesso può richiedere un po' di tempo. Se il browser non si apre affatto, premi **Il browser non si è aperto?** sulla scheda (dopo 25 secondi diventa il pulsante **Apri la finestra di accesso**). Non premerlo mentre stai ancora accedendo nel browser: interrompe quell'accesso e ricomincia da capo. In alto nella finestra di accesso che si apre trovi i passaggi da seguire. Per incollarci un codice, fai clic con il tasto destro dentro la finestra, poi premi Invio. È normale che il codice incollato non compaia; se compare "Invalid code", incolla di nuovo il codice nella stessa finestra. Per interrompere l'accesso, premi **Annulla l’accesso**. |
| **Connesso**                                      | È stato confermato un accesso con abbonamento. Il nome del piano viene mostrato quando il programma lo comunica.                                | Niente. L'IA è pronta all'uso.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Accesso effettuato, ma non con un abbonamento** | Nel programma l'accesso è effettuato con una chiave API o con un account a consumo, oppure non è stato possibile confermare il tipo di accesso. | Vedi «Accessi a consumo» più sotto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Impossibile verificare la connessione**         | La verifica stessa non è riuscita. Il motivo è indicato sulla scheda.                                                                           | Premi **Verifica di nuovo**. Se dice che il programma è troppo vecchio, premi **Aggiorna**: l’aggiornamento ufficiale dell’azienda viene eseguito in una nuova finestra. Quando lì è finito, torna a GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Disattivato in questa app**                     | Hai disattivato il programma per questa app nelle impostazioni. L’app non lo controlla e non gli invia nulla.                                   | Premi **Usa di nuovo**. L’app controlla di nuovo il programma e lo usa.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

La scheda ChatGPT non passa da alcun programma, quindi non dice mai **Non installato** né **Accesso effettuato, ma non con un abbonamento**. Quando dice **Accesso non effettuato**, premi **Continua con ChatGPT**: la pagina di accesso a ChatGPT di OpenAI si apre nel browser. Accedi e consenti a questa app di usare il tuo piano ChatGPT, e la scheda passa da sola a **Connesso**. Se non l'hai consentito, o se non è terminato entro 10 minuti, la scheda indica che l'accesso non è terminato; premendo di nuovo il pulsante si ricomincia da capo. Non c'è nessuna finestra di accesso né alcun codice da incollare. Mentre accedi, **Annulla l’accesso** lo interrompe.

La connessione viene verificata all'avvio dell'app, quando apri Impostazioni e quando torni alla finestra dopo aver avviato un'installazione o un accesso.

Se la scheda Claude o Codex indica che un accesso non è terminato, scegli **Apri la finestra di accesso**. Un codice mostrato dal browser va incollato in quella finestra; un codice mostrato prima non è più valido.

Se la pagina del browser o la finestra di accesso mostra `3p_delegated_access_policy_denied`, è possibile che un criterio dell'account Claude abbia bloccato questo accesso. Se riprovando succede lo stesso, chiedi a chi gestisce l'account oppure verifica se funziona con un altro account.

## Senza abbonamento: un'IA gratuita

Non hai un abbonamento a Claude o a ChatGPT? In Impostazioni ▸ IA, **Usa gratis** collega invece un'IA gratuita. Scegliendo **Nessuno dei due, per ora** nel secondo passaggio delle schermate di benvenuto compaiono le stesse schede, e scegliendolo nel pannello IA quando non c'è niente di collegato viene proposto **Collega un’IA gratuita**.

- **OpenRouter**: premi **Collega nel browser**. Il browser apre OpenRouter; registrati o accedi, e consenti l'accesso. Quando il browser dice che il collegamento è riuscito, chiudi quella scheda del browser e torna qui. Non c'è nessuna chiave da copiare, e la scheda in GenOffice mostra quante richieste gratuite restano oggi.
- **Google Gemini**: premi **Ottieni una chiave**, crea una chiave in Google AI Studio, incollala nella scheda e premi **Collega**. Solo per chi ha almeno 18 anni. Una chiave creata in un progetto Google con la fatturazione attiva può comportare addebiti.
- Una volta collegata, quell'IA diventa l'**IA da usare**. Se sono collegate entrambe, **Usa questa IA** su una scheda passa dall'una all'altra. **Scollega** rimuove la chiave da GenOffice.
- I modelli gratuiti sono meno capaci di quelli in abbonamento, e ogni giorno consente un numero limitato di richieste. Una sola modifica a un documento può richiederne diverse. Quando la quota di oggi è esaurita, il pannello IA lo segnala e dice quando si potrà usare di nuovo.
- Finché la usi gratis, ciò che invii può essere usato per migliorare l'IA di quell'azienda. Fai attenzione con i documenti che contengono dati personali.

## Accessi a consumo

Una scheda che dice **Accesso effettuato, ma non con un abbonamento** riporta un avviso: «Non è un abbonamento: paghi in base a quanto usi.»

- GenOffice non usa quell'accesso finché non premi **Usa comunque**. Da quel momento ogni richiesta viene addebitata a quell'account.
- Anche allora non viene mai scelto automaticamente. Sceglilo tu in **IA da usare**, dove è contrassegnato come **A pagamento**.
- Il tuo consenso viene ricordato solo per quel programma. Viene annullato quando esci dal programma o quando il suo accesso cambia.
- Per usare invece il tuo abbonamento, accedi al programma con l'account dell'abbonamento e premi **Verifica di nuovo**.

## Cambiare account o uscire

Una scheda con l'accesso effettuato mostra l'account in uso. Le schede Claude e Codex mostrano anche il nome del piano, se il programma lo comunica. Compaiono inoltre due pulsanti.

- **Accedi con un altro account** avvia di nuovo l'accesso del programma stesso. Completalo nella finestra che si apre, con l'altro account.
- **Esci** esegue la disconnessione del programma stesso. Dopo, la scheda indica **Accesso non effettuato**.
- Sulle schede Claude e Codex, entrambe le azioni valgono per quel programma su tutto questo PC, non solo per GenOffice. Se usi Claude Code o Codex anche in un terminale, anche lì viene disconnesso o passa all'altro account. Per questo GenOffice ti chiede prima una conferma.
- Le schede Claude e Codex hanno anche **Non usare in questa app**. Il programma e il suo accesso restano come sono, e solo GenOffice smette di usarlo: nessun controllo dello stato, nessuna richiesta, e **Automatico** lo salta. L’uso nel terminale non cambia. La scheda mostra allora **Disattivato in questa app**, e **Usa di nuovo** lo riattiva. Nessuna delle due chiede conferma, perché fuori da GenOffice non cambia nulla.
- La scheda ChatGPT è diversa. **Esci** ti chiede di confermare con «Questa operazione scollega ChatGPT da questa app»; una volta confermato, GenOffice chiede a OpenAI di chiudere il collegamento di questa app ed elimina l'accesso che conservava su questo PC. **Accedi con un altro account** apre subito la pagina di accesso nel browser, senza chiedere. Nessuna delle due azioni riguarda gli altri programmi su questo PC, Codex compreso.
- Una scheda ChatGPT collegata dice «L’IA di questa app funziona con il tuo piano ChatGPT» e ha un link **Gestisci utilizzo**. Apre la pagina di utilizzo delle tue impostazioni di ChatGPT, dove puoi vedere quanto usa questa app e impostare un limite solo per questa app.
- L'account e questi due pulsanti compaiono solo qui, in Impostazioni ▸ IA. GenOffice mostra l'account e non lo salva da nessuna parte.

## Quale IA viene usata

**IA da usare**, in Impostazioni ▸ IA, parte da **Automatico**. Automatico decide in quest'ordine:

1. Claude, quando la sua scheda dice Connesso.
2. Altrimenti ChatGPT, quando la sua scheda dice Connesso.
3. Altrimenti Codex, quando la sua scheda dice Connesso.
4. Altrimenti nessuna IA è collegata, e il pannello IA mostra la guida al collegamento invece di un errore.

Automatico non sceglie mai nulla che costi denaro in più: né una chiave API, né un accesso a consumo. Questi vengono usati solo finché li scegli tu.

Puoi anche scegliere tu un'IA, nello stesso punto oppure nell'elenco dei modelli in fondo al pannello IA. Se quella che hai scelto smette di funzionare, GenOffice non passa a un'altra senza dirtelo. Ti dice che cosa è successo e ti mostra come ricollegarti.

L'elenco dei modelli mostra i modelli comunicati dal programma stesso (per ChatGPT, i modelli che OpenAI indica come utilizzabili con il tuo piano; si usa il primo finché non ne scegli uno): ciascuno con il suo nome e, accanto, l'ID esatto del modello, mentre **Modello predefinito** indica a quale modello corrisponde in questo momento. Anche l'etichetta in fondo al pannello IA e **IA da usare** indicano quel modello. Leggere l'elenco non chiede nulla all'IA, quindi non incide sul tuo piano. Se il programma è troppo vecchio per comunicare i suoi modelli, al suo posto viene mostrato un breve elenco integrato.

Ovunque si possa scegliere Codex, compare accanto una riga: «Usare un abbonamento Codex all’interno di un’app non è un metodo ufficialmente consigliato da OpenAI.» Decidi tenendone conto.

## Quando una richiesta viene interrotta

Una richiesta si interrompe quando il limite del piano è esaurito, quando l'accesso è scaduto o quando il programma non c'è più. GenOffice non passa da solo a un'altra IA.

- Il motivo viene mostrato nel punto in cui la risposta si è fermata. Per un limite esaurito viene mostrato anche l'orario in cui si azzera, quando il programma lo comunica.
- ChatGPT collegato direttamente si ferma quando è esaurito il limite del tuo piano, o il limite che hai impostato per questa app nelle impostazioni di ChatGPT. Non viene mostrato alcun orario di azzeramento. Se hai scollegato questa app nelle impostazioni di ChatGPT, la scheda passa ad **Accesso non effettuato**; accedi di nuovo.
- Se l'altro tuo abbonamento è collegato, compare un pulsante **Continua con …**, per esempio **Continua con ChatGPT** o **Continua con Codex**. Premendolo, quella diventa l'IA da usare — l'elenco dei modelli mostra il cambio — e la richiesta viene eseguita di nuovo.
- Se l'unica altra connessione è un accesso a consumo che hai consentito, lo stesso pulsante è accompagnato da una nota sul costo.
- Non c'è mai un pulsante che ti faccia passare a una chiave API.

## La riga di utilizzo

Quando hai usato l'80% o più di un limite, il pannello IA mostra una riga come «85% usato · si azzera alle 15:00». Claude comunica un limite di 5 ore e un limite di 7 giorni, e Codex viene mostrato allo stesso modo quando li comunica. Sotto l'80%, o quando il programma non comunica nulla, non viene mostrata alcuna riga. ChatGPT collegato direttamente non mostra questa riga; per vedere quanto ha usato, apri **Gestisci utilizzo** nella scheda ChatGPT.

## Che cosa viene inviato, e dove

La prima volta che un abbonamento può essere usato, GenOffice mostra un avviso una sola volta. Per rileggerlo, vai in Impostazioni ▸ IA ▸ **Avviso della prima connessione** e premi **Rivedi**. Dice tre cose:

- Il contenuto del documento e la conversazione vengono inviati ad Anthropic o a OpenAI con il tuo account personale.
- L’uso di questi contenuti per addestrare l’IA dipende dalle impostazioni del tuo account presso quell’azienda, non da GenOffice.
- GenOffice disattiva il salvataggio della cronologia delle conversazioni di Codex, ma Codex può comunque conservare i propri log di diagnostica su questo PC.

Le richieste tramite ChatGPT collegato direttamente non passano dal programma Codex; vanno da questo PC direttamente a OpenAI.

Tutto ciò che hai nascosto con **Nascondi la selezione all'IA** non viene inviato, qualunque IA tu stia usando.

## Buono a sapersi

- **Velocità.** Una risposta tramite Claude Code o Codex parte qualche secondo più tardi rispetto a una tramite chiave API, perché prima deve avviarsi il programma. ChatGPT collegato direttamente non avvia alcun programma.
- **Piano ChatGPT gratuito.** Risulta Connesso, ma i suoi limiti sono bassi, quindi le richieste si interrompono prima. Per questo piano la riga di utilizzo non compare.
- **Generazione di immagini.** In questa versione un abbonamento non genera immagini, con nessun piano. Serve la chiave di un provider di immagini; vedi [Modelli IA e impostazioni](help://ai-models).
- **Proxy.** Claude Code e Codex non prendono le impostazioni proxy da GenOffice. Usano il proxy impostato per questo PC, per esempio la variabile d'ambiente `HTTPS_PROXY`, proprio come quando li esegui in un terminale. Se non riescono a connettersi in un terminale, non ci riescono nemmeno da qui.
- **Comandi e altri programmi.** Una richiesta che arriva dal comando `ieumoffice` o da un agente di programmazione collegato non usa il tuo abbonamento, a meno che tu non lo consenta. Anche in quel caso usa Claude Code o Codex, mai ChatGPT collegato direttamente. Vedi [Collegare un agente di programmazione](help://mcp).
- **Modalità agente.** La [Modalità agente](help://agent-mode) esegue Claude Code o Codex su questo PC. ChatGPT collegato direttamente non può eseguire l'agente.
