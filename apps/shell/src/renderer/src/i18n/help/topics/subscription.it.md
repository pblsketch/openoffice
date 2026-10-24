# Connessione con abbonamento

GenOffice fa funzionare l'IA con un abbonamento che hai già: un abbonamento Claude (Anthropic) o un abbonamento Codex (OpenAI). Codex è il programma di OpenAI, e vi accedi con il tuo piano ChatGPT. Non ti serve una chiave API, e GenOffice non ha un proprio account a cui iscriversi.

## Come funziona

- L'IA non è integrata in GenOffice. Su questo PC è installato un programma dell'azienda — **Claude Code** per un abbonamento Claude, **Codex** per un abbonamento ChatGPT — e GenOffice chiede la risposta a quel programma.
- In quel programma l'accesso è effettuato con il tuo account, quindi ogni richiesta viene conteggiata sul tuo piano.
- GenOffice non mostra mai un proprio modulo di accesso e non legge né salva mai le tue credenziali. Accedi nel programma e nella pagina web dell'azienda stessa.

## Prima di iniziare

Ti serve una di queste due cose. Averle entrambe va benissimo.

- Un abbonamento Claude (un piano Pro o Max; con un account Claude gratuito non è possibile collegarsi), e il programma Claude Code installato su questo PC e con l'accesso effettuato.
- Un abbonamento ChatGPT, e il programma Codex installato su questo PC e con l'accesso effettuato.

Se il programma non è ancora installato, o l'accesso non è ancora stato effettuato, ci pensano i pulsanti della sezione successiva.

## Collegamento

1. Apri **Impostazioni** dalla riga in basso a sinistra in Home e scegli **IA**. Sotto **Connessione con abbonamento** ci sono una scheda per Claude e una per Codex.
2. Leggi che cosa dice la scheda e premi il suo pulsante. La tabella qui sotto spiega ogni stato.
3. Torna alla finestra di GenOffice. La scheda si verifica di nuovo da sola, e **Verifica di nuovo** lo fa subito.

Nel secondo passaggio delle schermate di benvenuto al primo avvio, e nel pannello IA quando nessuna IA è collegata, compare prima la domanda «Quale IA usi già?». Scegli un abbonamento Claude a pagamento, ChatGPT o nessuno dei due per ora, e vedrai solo i passaggi di quel percorso (Installa il programma → Accedi → Connesso) e la sua scheda. **Scegli un altro modo** ti permette di scegliere di nuovo, e puoi saltare tutto e fare il collegamento più tardi. Se ancora non si collega, premi **Copia i dati per l’assistenza** e invia quanto copiato a chi ti sta aiutando. Non contiene account né percorsi di file.

| Che cosa dice la scheda                           | Che cosa significa                                                                                                                              | Che cosa fare                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verifica in corso…**                            | GenOffice sta chiedendo al programma a che punto è.                                                                                             | Attendi un momento.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Non installato**                                | Il programma non è stato trovato su questo PC.                                                                                                  | Premi **Installa**. Il comando di installazione ufficiale dell'azienda viene eseguito in una nuova finestra del terminale, così puoi vedere che cosa fa. GenOffice non scarica nulla per conto suo. Se preferisci installare a mano, **Guida ufficiale all’installazione** apre le istruzioni dell'azienda.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Accesso non effettuato**                        | Il programma c'è, ma l'accesso non è stato effettuato.                                                                                          | Premi **Accedi**. Nel browser si apre la pagina di accesso dell'azienda: accedi lì e consenti l'accesso, e la scheda si collega da sola. Fai con calma: l'accesso può richiedere un po' di tempo. Se il browser non si apre affatto, premi **Il browser non si è aperto?** sulla scheda (dopo 25 secondi diventa il pulsante **Apri la finestra di accesso**). Non premerlo mentre stai ancora accedendo nel browser: interrompe quell'accesso e ricomincia da capo. In alto nella finestra di accesso che si apre trovi i passaggi da seguire. Per incollarci un codice, fai clic con il tasto destro dentro la finestra, poi premi Invio. È normale che il codice incollato non compaia; se compare "Invalid code", incolla di nuovo il codice nella stessa finestra. Per interrompere l'accesso, premi **Annulla l’accesso**. |
| **Connesso**                                      | È stato confermato un accesso con abbonamento. Il nome del piano viene mostrato quando il programma lo comunica.                                | Niente. L'IA è pronta all'uso.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Accesso effettuato, ma non con un abbonamento** | Nel programma l'accesso è effettuato con una chiave API o con un account a consumo, oppure non è stato possibile confermare il tipo di accesso. | Vedi «Accessi a consumo» più sotto.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Impossibile verificare la connessione**         | La verifica stessa non è riuscita. Il motivo è indicato sulla scheda.                                                                           | Premi **Verifica di nuovo**. Se dice che il programma è troppo vecchio, premi **Aggiorna**: l’aggiornamento ufficiale dell’azienda viene eseguito in una nuova finestra. Quando lì è finito, torna a GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

La connessione viene verificata all'avvio dell'app, quando apri Impostazioni e quando torni alla finestra dopo aver avviato un'installazione o un accesso.

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

Quando il programma ha effettuato l'accesso, la sua scheda mostra l'account in uso accanto al nome del piano, se il programma lo comunica. Ha anche due pulsanti.

- **Accedi con un altro account** avvia di nuovo l'accesso del programma stesso. Completalo nella finestra che si apre, con l'altro account.
- **Esci** esegue la disconnessione del programma stesso. Dopo, la scheda indica **Accesso non effettuato**.
- Entrambe le azioni valgono per quel programma su tutto questo PC, non solo per GenOffice. Se usi Claude Code o Codex anche in un terminale, anche lì viene disconnesso o passa all'altro account. Per questo GenOffice ti chiede prima una conferma.
- L'account e questi due pulsanti compaiono solo qui, in Impostazioni ▸ IA. GenOffice mostra l'account e non lo salva da nessuna parte.

## Quale IA viene usata

**IA da usare**, in Impostazioni ▸ IA, parte da **Automatico**. Automatico decide in quest'ordine:

1. Claude, quando la sua scheda dice Connesso.
2. Altrimenti Codex, quando la sua scheda dice Connesso.
3. Altrimenti nessuna IA è collegata, e il pannello IA mostra la guida al collegamento invece di un errore.

Automatico non sceglie mai nulla che costi denaro in più: né una chiave API, né un accesso a consumo. Questi vengono usati solo finché li scegli tu.

Puoi anche scegliere tu un'IA, nello stesso punto oppure nell'elenco dei modelli in fondo al pannello IA. Se quella che hai scelto smette di funzionare, GenOffice non passa a un'altra senza dirtelo. Ti dice che cosa è successo e ti mostra come ricollegarti.

L'elenco dei modelli mostra i modelli comunicati dal programma stesso: ciascuno con il suo nome e, accanto, l'ID esatto del modello, mentre **Modello predefinito** indica a quale modello corrisponde in questo momento. Anche l'etichetta in fondo al pannello IA e **IA da usare** indicano quel modello. Leggere l'elenco non chiede nulla all'IA, quindi non incide sul tuo piano. Se il programma è troppo vecchio per comunicare i suoi modelli, al suo posto viene mostrato un breve elenco integrato.

Ovunque si possa scegliere Codex, compare accanto una riga: «Usare un abbonamento Codex all’interno di un’app non è un metodo ufficialmente consigliato da OpenAI.» Decidi tenendone conto.

## Quando una richiesta viene interrotta

Una richiesta si interrompe quando il limite del piano è esaurito, quando l'accesso è scaduto o quando il programma non c'è più. GenOffice non passa da solo a un'altra IA.

- Il motivo viene mostrato nel punto in cui la risposta si è fermata. Per un limite esaurito viene mostrato anche l'orario in cui si azzera, quando il programma lo comunica.
- Se l'altro tuo abbonamento è collegato, compare un pulsante **Continua con …**, per esempio **Continua con Codex**. Premendolo, quella diventa l'IA da usare — l'elenco dei modelli mostra il cambio — e la richiesta viene eseguita di nuovo.
- Se l'unica altra connessione è un accesso a consumo che hai consentito, lo stesso pulsante è accompagnato da una nota sul costo.
- Non c'è mai un pulsante che ti faccia passare a una chiave API.

## La riga di utilizzo

Quando hai usato l'80% o più di un limite, il pannello IA mostra una riga come «85% usato · si azzera alle 15:00». Claude comunica un limite di 5 ore e un limite di 7 giorni, e Codex viene mostrato allo stesso modo quando li comunica. Sotto l'80%, o quando il programma non comunica nulla, non viene mostrata alcuna riga.

## Che cosa viene inviato, e dove

La prima volta che un abbonamento può essere usato, GenOffice mostra un avviso una sola volta. Per rileggerlo, vai in Impostazioni ▸ IA ▸ **Avviso della prima connessione** e premi **Rivedi**. Dice tre cose:

- Il contenuto del documento e la conversazione vengono inviati ad Anthropic o a OpenAI con il tuo account personale.
- L’uso di questi contenuti per addestrare l’IA dipende dalle impostazioni del tuo account presso quell’azienda, non da GenOffice.
- GenOffice disattiva il salvataggio della cronologia delle conversazioni di Codex, ma Codex può comunque conservare i propri log di diagnostica su questo PC.

Tutto ciò che hai nascosto con **Nascondi la selezione all'IA** non viene inviato, qualunque IA tu stia usando.

## Buono a sapersi

- **Velocità.** Una risposta tramite abbonamento parte qualche secondo più tardi rispetto a una tramite chiave API, perché prima deve avviarsi il programma dell'azienda.
- **Piano ChatGPT gratuito.** Risulta Connesso, ma i suoi limiti sono bassi, quindi le richieste si interrompono prima. Per questo piano la riga di utilizzo non compare.
- **Generazione di immagini.** In questa versione un abbonamento non genera immagini, con nessun piano. Serve la chiave di un provider di immagini; vedi [Modelli IA e impostazioni](help://ai-models).
- **Proxy.** Claude Code e Codex non prendono le impostazioni proxy da GenOffice. Usano il proxy impostato per questo PC, per esempio la variabile d'ambiente `HTTPS_PROXY`, proprio come quando li esegui in un terminale. Se non riescono a connettersi in un terminale, non ci riescono nemmeno da qui.
- **Comandi e altri programmi.** Una richiesta che arriva dal comando `ieumoffice` o da un agente di programmazione collegato non usa il tuo abbonamento, a meno che tu non lo consenta. Vedi [Collegare un agente di programmazione](help://mcp).
