# Modifica condivisa in rete

Le persone sulla stessa rete (LAN) possono aprire insieme un documento, modificarlo contemporaneamente e vedere i cursori e i nomi degli altri. Non servono server né account: il PC che condivide il documento gestisce la sessione, e solo quel PC salva il file.

## Condividere un documento

1. Apri il documento e fai clic su **Collabora** nella barra degli strumenti dell’editor.
2. Inserisci **Il mio nome** e scegli **Il mio colore**. Gli altri li vedono accanto al tuo cursore.
3. Fai clic su **Avvia condivisione**. Compaiono un **PIN** di 6 cifre e l’**Indirizzo di questo PC**.
4. Comunica il PIN a chi deve partecipare, e anche l’indirizzo se non trova il documento.

Se il documento ha modifiche non salvate, salvalo prima. I documenti protetti da password non possono essere condivisi. **Nuovo PIN** assegna al documento un nuovo PIN; chi è già entrato resta nella sessione.

Per interrompere, riapri **Collabora** e fai clic su **Interrompi condivisione**. Chi ha partecipato conserva una copia non salvata sul proprio PC.

## Partecipare

1. In qualsiasi editor, fai clic su **Collabora** e passa a **Partecipa**.
2. Scegli il documento in **Trovati**, oppure digita l’indirizzo del PC che condivide in **Indirizzo**.
3. Inserisci il PIN e fai clic su **Partecipa**. Il documento condiviso si apre in una nuova scheda.

Mentre partecipi, è chi condivide a salvare il file. Il tuo Salva non fa nulla e te lo segnala, e la scheda non chiede mai di salvare quando la chiudi. **Esci** ti fa uscire dalla sessione. Quando la sessione termina, la scheda resta aperta come copia non salvata, che puoi salvare dove vuoi.

## Modificare insieme

- Il cursore o la selezione di ogni persona compare nel suo colore, con il suo nome.
- Annulla annulla solo le tue modifiche.
- Alcune funzioni sono disattivate durante una sessione, per esempio quelle che cambiano parti del documento diverse dal contenuto. L’editor ti avvisa quando ne rifiuta una.
- Nell’editor Hangul modifica solo chi condivide. Chi partecipa segue le modifiche in tempo reale.
- I file di testo semplice e JSON si aprono nella vista sorgente dell’editor Markdown e non possono ancora essere condivisi.

## Sicurezza

- Il PIN non viene mai inviato in rete. Viene verificato con uno scambio di chiavi, e tutto ciò che segue è cifrato. Gli altri sulla rete non possono leggere il documento, le modifiche né il PIN.
- Dopo 5 PIN errati da uno stesso PC, quel PC deve attendere 10 minuti. Dopo 20 PIN errati in totale, ogni documento condiviso riceve un nuovo PIN e chi condivide viene avvisato.
- Fino a 16 persone possono partecipare a un documento.
- Mentre condividi, il tuo nome e il titolo del documento vengono annunciati sulla rete, così gli altri possono trovarlo.
- La prima volta che condividi, Windows Firewall può chiedere l’autorizzazione. Consenti l’accesso sulle reti private. Se lo blocchi, gli altri PC non potranno connettersi.
