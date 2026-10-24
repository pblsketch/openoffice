# Installare GenOffice

Ogni versione viene pubblicata sulla [pagina Releases](https://github.com/pblsketch/openoffice/releases/latest) del progetto su GitHub. Questa versione è rilasciata per Windows.

## Scegli il file giusto per il tuo computer

| Piattaforma | Requisiti                                   | File                            |
| ----------- | ------------------------------------------- | ------------------------------- |
| **Windows** | Windows 10 o successivo, Intel/AMD a 64 bit | `GenOffice-Setup-<version>.exe` |

Le versioni più vecchie restano sulla pagina Releases.

## Su Windows

1. Scarica `GenOffice-Setup-<version>.exe` dalla pagina Releases.
2. Eseguilo. Il programma di installazione non ha una firma digitale, quindi Windows può mostrare prima una finestra blu «PC protetto da Windows». Scegli **Ulteriori informazioni**, poi **Esegui comunque**. Il testo esatto dipende dalla tua versione di Windows.
3. Segui il programma di installazione fino alla fine.

Inserisce GenOffice nel menu Start e registra `.docx`, `.xlsx`, `.pptx`, `.pdf` e simili, così un doppio clic su un file lo apre.

Poiché il programma di installazione non è firmato, esegui solo quello che hai scaricato dalla pagina Releases indicata sopra.

## Aggiornamenti

- GenOffice cerca una versione più recente sulla stessa pagina Releases di GitHub. Quando ne viene pubblicata una, **Impostazioni ▸ Informazioni** la propone: premi **Aggiorna alla versione …**, attendi il download, poi premi **Riavvia e installa**.
- **Menu (☰) ▸ Controlla aggiornamenti…** controlla ogni volta che lo chiedi. Su un Mac è **Aiuto ▸ Controlla aggiornamenti…**.
- Quando il controllo non riesce — manca la rete, o non è ancora stato pubblicato nulla — non succede niente e l'app continua a funzionare come prima.
- **Canale di aggiornamento**, sempre in Impostazioni ▸ Informazioni, è Stabile o Beta. Modificarlo ha effetto immediato e controlla la presenza di un aggiornamento; non riporta un'installazione Beta alla versione Stabile.
- Nemmeno gli aggiornamenti hanno una firma digitale. Prima di installarne uno, l'app confronta il file scaricato con il checksum pubblicato insieme a quella versione.

## La build che stai eseguendo

**Impostazioni ▸ Informazioni** è dove l'app riporta la versione che hai, il canale che segue e dove vive il progetto. Indica anche il progetto open source su cui si basa questa app.

## La riga di comando è inclusa

Ogni installazione include il comando `ieumoffice`, che comunica con gli stessi motori della finestra, così i due non si contraddicono mai su un file. `ieumoffice install-cli` lo mette sul tuo `PATH`. Vedi [Riga di comando e agenti](help://cli) per scoprire cosa può fare.
