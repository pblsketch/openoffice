# Připojení serverů MCP

Server MCP je služba, která nabízí AI nástroje mimo aplikaci, například vyhledávání zákonů nebo materiálů, které vede váš tým. Jakmile server připojíte, okna AI v GenOffice mohou jeho nástroje volat během konverzace. U každého nástroje sami rozhodnete, co smí AI použít a jak.

## Přidání serveru

1. Otevřete **Nastavení ▸ Integrace** a na kartě **Servery MCP** klikněte na **Přidat server**.
2. Vyberte, jak server přidat.
   - **Vložit text nastavení**: vložte celý text nastavení z návodu serveru a klikněte na **Načíst**. GenOffice vyplní pole. Pokud je v jednom textu více serverů, potvrzujete je jeden po druhém. Pokud text čte klíč nebo hodnotu z proměnné počítače (`${NÁZEV}`), zůstane to pole prázdné a vyplníte ho sami.
   - **Zadat ručně**: zadejte název a adresu. Pokud vám návod serveru dává klíč, vložte ho do pole **Klíč (volitelné)**.
3. Přečtěte si upozornění nad tlačítkem pro přidání a klikněte na **Přidat**.
4. Po přidání GenOffice hned ověří připojení a načte seznam nástrojů. Server, který vyžaduje přihlášení, na vás počká a prohlížeč sám neotevře. Kliknutím na **Zkontrolovat připojení** zobrazíte seznam nástrojů, které server nabízí. U serveru, který vyžaduje přihlášení, klikněte na **Přihlásit se v prohlížeči** a přihlášení dokončete tam.

Název serveru tvoří písmena, číslice, `-` a `_`, nejvýše 24 znaků. AI vidí nástroje tohoto serveru pod názvy ve tvaru `mcp__name__tool`. Pokud dovednost volá nástroje podle názvů tohoto tvaru, přidejte server pod stejným názvem, jaký dovednost používá.

## Servery podle adresy a servery na tomto počítači

- Server **podle adresy** se připojuje přes webovou adresu. Internetové adresy musí začínat `https://`. `http://` funguje jen pro tento počítač a pro adresy v soukromé síti doma nebo v práci a nejprve potvrdíte, že klíče a obsah dokumentů budou putovat bez šifrování.
- Server **na tomto počítači** je program, který GenOffice na tomto počítači spouští. Obrazovka přidání ukazuje přesný program, jeho argumenty a názvy proměnných prostředí, které dostane. Poprvé se spustí až po kliknutí na **Povolit spuštění**. Pokud se příkaz později změní, server zůstane zastavený, dokud spuštění znovu nepovolíte.
- Pokud server na tomto počítači potřebuje program, který počítač nemá (Node.js, nebo uv pro servery v Pythonu), GenOffice se na kartě serveru v nastavení zeptá, zda ho stáhnout. Ukáže velikost stahování a nic se nestáhne, dokud nekliknete na **Stáhnout**. Stažené programy zůstávají jen ve složce dat GenOffice a nastavení vašeho počítače se nemění.
- Server na tomto počítači se spustí, když je potřeba, a po 10 minutách bez použití se zastaví. Zastaví se také při zavření GenOffice.

## Určení, co smí každý nástroj

- U každého nástroje zvolte **Vždy povolit**, **Nejprve se zeptat** nebo **Nepoužívat**.
- Na začátku mají nástroje, které server označil jako pouze čtoucí, nastaveno **Vždy povolit** a všechny ostatní **Nejprve se zeptat**.
- Když AI zavolá nástroj s nastavením **Nejprve se zeptat**, v okně AI se objeví karta. Podívejte se, co se odešle, a klikněte na **Povolit jen tentokrát**, **V této konverzaci povolit vždy** nebo **Zablokovat**. Dokud nekliknete, nic se nespustí. Zastavení AI nebo zavření okna se počítá jako zablokování.
- Pokud server změní popis nástroje nebo hodnoty, které přijímá, ukáže se u nástroje **Vyžaduje kontrolu** a nástroj je před AI skrytý, dokud změnu neprohlédnete a nekliknete na **Schválit změnu**. Změna v pokynech, které server dává AI, se kontroluje stejně.
- Nové nástroje na serveru se zapnou se stejným výchozím nastavením a karta i tlačítko v okně AI ukážou **Nové nástroje: n**. Značka zmizí, když v nastavení otevřete seznam nástrojů tohoto serveru.

## Použití serverů v okně AI

- Servery fungují v oknech AI editorů a v Ask AI na stránce Domů. Dokud je server zapnutý, objeví se vedle vstupního pole tlačítko **Připojené servery**.
- Kliknutím na ně uvidíte stav každého serveru a můžete server vypnout nebo zapnout jen pro tuto konverzaci. Nová konverzace začíná se všemi servery, které jste zapnuli v nastavení. Server, jehož připojení nikdy nebylo ověřeno, má stav **Zatím neověřeno**; ověřte ho v Nastavení, abyste získali jeho nástroje.
- Vypnutí volby **Povolit AI internetové nástroje** v **Nastavení ▸ AI média a vyhledávání** odebere také všechny nástroje serverů MCP.
- Když dovednost očekává nástroj ze serveru, který teď nemůžete použít, AI v odpovědi řekne, který krok nemohla provést. **Nastavení ▸ Dovednosti** také ukazuje u každé dovednosti server, který potřebuje.
- Okno agenta může používat nástroje zapnutých serverů také. Platí stejná oprávnění a relace si ponechá nastavení, se kterým začala. Viz [Režim agenta](help://agent-mode).

## Ochrana toho, co server vrací

Každý server má volbu **Chránit to, co server vrací**, zpočátku zapnutou. Když je zapnutá, jakmile se v konverzaci objeví něco, co tento server vrátil, přestanou v ní fungovat nástroje, které posílají data mimo aplikaci: webové vyhledávání, čtení stránky podle adresy, nástroje jiných serverů MCP a podobně. Nástroje téhož serveru fungují dál. Chcete-li ostatní používat znovu, začněte novou konverzaci. U serveru, který poskytuje jen veřejné materiály, ji můžete vypnout.

Okno agenta tuto ochranu zachovat nedokáže. Když relace začne s takovým serverem, okno vám to oznámí.

## Co kam putuje

- Když AI zavolá nástroj, na tento server odejde text, který AI zvolila. Může obsahovat obsah otevřeného dokumentu a příloh. Části skryté před AI zůstávají skryté.
- To, co server vrátí, jde poskytovateli AI, kterého používáte. Přidávejte jen servery, jejichž provozovatelům důvěřujete.
- Klíče, přihlášení a hodnoty proměnných prostředí se na tomto počítači ukládají se šifrováním operačního systému. Pokud je počítač nedokáže zašifrovat, pamatují se jen do zavření aplikace.
- Odebráním serveru se smažou jeho klíče a přihlášení a server se požádá o ukončení přihlášení, pokud to podporuje.
