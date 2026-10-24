# E-knihy EPUB: čtení, úpravy a překlad

Editor e-knih otevírá knihy EPUB (`.epub`) na kartě. Knihu můžete číst, opravovat její text přímo na stránce, ptát se na ni AI a přeložit ji do nového souboru EPUB. Obrazovka pro úpravu kódu kapitoly tu není.

## Otevření knihy

- Soubor `.epub` otevřete z dialogu pro otevření, přetažením do okna, ze seznamu nedávných souborů, ze stromu složek nebo ze seznamu Disku Google. Ve Windows se nabízí také v nabídce „Otevřít v programu“. Instalace GenOffice z něj neudělá výchozí program pro soubory `.epub`.
- Pokud je kniha už otevřená, její karta se přesune dopředu.
- Knihy chráněné proti kopírování (DRM) se neotevřou: otevřete je v aplikaci obchodu, kde jste je koupili. Neotevřou se ani poškozené soubory a soubory, které nejsou knihami EPUB; aplikace zobrazí důvod.
- **Knihy s pevným rozvržením** (sázené stránku po stránce, jako obrázkové knihy a komiksy) se otevřou jen ke čtení. Úpravy, úpravy pomocí AI, nahrazování a překlad jsou vypnuté a stavový řádek vysvětlí proč. Čtení a dotazy na AI fungují dál.
- Kapitola s chybně utvořeným souborem se zobrazí, jak nejlépe to jde, ale upravit ji nelze; upozorní na to poznámka na jejím začátku. Uloží se beze změny a v překladech zůstane v původním jazyce.

## Čtení

- Panel **Obsah** vlevo zobrazuje obsah knihy. Kliknutím na položku na ni přejdete. Kniha bez obsahu dostane seznam svých kapitol.
- Každá kapitola se posouvá nahoru a dolů. Když budete posouvat dál za konec kapitoly, přejdete na další, a za jejím začátkem se vrátíte na předchozí. Stavový řádek ukazuje, ve které kapitole jste.
- Karta **Zobrazení** mění velikost textu a řádkování a zapíná a vypíná **Tmavé zobrazení**. Tato nastavení mění jen obrazovku, nikdy knihu, a platí pro všechny knihy.
- Místo, kde jste přestali číst, se pamatuje pro každý soubor zvlášť, a to ve složce dat aplikace, ne v knize.
- **Hledat v knize** (Ctrl+F) prohledá všechny kapitoly. Kliknutím na výsledek na něj přejdete.
- Odkaz v knize vás přesune na dané místo. Webové a e-mailové odkazy se otevřou ve výchozím prohlížeči; jiné adresy se neotevírají.
- Vlastní skripty knihy se nikdy nespouštějí a nic se nenačítá z internetu. Zvuk a video se nepřehrávají.

## Úpravy textu

- Klikněte do odstavce a pište. Upravovat lze odstavce, nadpisy, položky seznamů, citace, buňky tabulek a popisky obrázků. Obrázky a rozvržení tabulek upravit nelze.
- Vložení ze schránky vloží jen prostý text.
- **Enter** rozdělí odstavec na dva a **Shift+Enter** začne uvnitř něj nový řádek. **Backspace** na začátku odstavce ho spojí s předchozím a **Delete** na konci k němu připojí následující. V buňkách tabulek, popiscích a seznamech definic Enter nedělá nic: mění se jen text uvnitř.
- **Tučné** (Ctrl+B) a **Kurzíva** (Ctrl+I) se zapínají a vypínají. Text, který je tučný nebo kurzívou díky šabloně stylů knihy, zůstane, jak je.
- **Zpět** (Ctrl+Z) a **Znovu** (Ctrl+Y) fungují i po uložení. Vrácení změny v jiné kapitole vás do této kapitoly přenese.
- **Nahradit** (Ctrl+H) prochází celou knihu po jednotlivých odstavcích: shoda nikdy nezasahuje do dvou odstavců. Kapitoly jen pro čtení se přeskočí a zobrazí se počet přeskočených míst. **Nahradit vše** se vrací jedním krokem.

## Ukládání

- Uložit (Ctrl+S), Uložit jako (Ctrl+Shift+S, jen `.epub`), **Automatické ukládání** na pásu karet a dotaz před zavřením fungují jako v ostatních editorech.
- Pokud se nic nezměnilo, soubor se znovu nezapisuje. Při uložení změn se přepíšou jen odstavce, které jste změnili. Obrázky, písma, styly a všechny ostatní části knihy zůstanou přesně takové, jaké byly. V knize EPUB 3 se navíc aktualizuje datum „poslední změny“.
- Pokud soubor po vašem otevření změnil jiný program, soubor se nepřepíše.

## Panel AI

- Ptejte se na knihu, nechte si shrnout kapitolu nebo opravit či přepsat její text. AI čte obsah a kapitoly knihy a vyhledává v ní text.
- Změny od AI se objeví hned a jedno vrácení (Ctrl+Z) vezme zpět vše, co AI v daném kole změnila. AI umí text zvýraznit tučně nebo kurzívou, ale nemůže přidávat obrázky, tabulky ani kapitoly.
- Text knihy je pro AI materiál, ne pokyny.
- Napište „Přelož tuto knihu do francouzštiny“ a AI otevře okno překladu s tímto jazykem už vyplněným. Dokud nestisknete **Spustit**, nic se neodešle.
- Knihy EPUB lze také připojit v panelu AI ostatních editorů, vybrat přes `@` a najít vyhledáváním souborů na domovské stránce.

## Překlad knihy

1. Na kartě **Domů** klikněte na **Přeložit knihu** (nebo Soubor ▸ Přeložit knihu…).
2. Vyberte jazyk, kapitoly (zpočátku jsou vybrané všechny) a výsledky: **Přeložená kniha**, **Dvojjazyčná kniha (originál a překlad)** nebo obojí. U každého výsledku zvolte, kam se uloží.
3. Klikněte na **Další**. Potvrzení ukáže odhadovaný počet požadavků na AI, AI, které je dostane, části už přeložené (znovu se neodesílají) a u připojení účtovaného podle využití také to, že se bude platit. Pokud má kniha neuložené změny, tlačítko se jmenuje **Uložit a přeložit**.
4. Klikněte na **Spustit**. Nahoře se objeví průběh a tlačítko **Zastavit**. Úpravy jsou zamčené, dokud překlad neskončí; panel AI funguje dál.
5. Na konci zpráva vypíše, co se přeložilo, co zůstalo v původním jazyce, a výsledné soubory, každý s tlačítkem **Otevřít**.

- Kniha samotná se nemění. Každý výsledek je nový soubor EPUB s vlastní identitou, takže ho aplikace pro knihovny e-knih drží odděleně od originálu.
- Přeloží se i název a obsah. V dvojjazyčné knize následuje za každým odstavcem jeho překlad; v tabulkách, popiscích a seznamech jde překlad do stejné buňky nebo položky. Její název ukazuje obojí ve tvaru „Původní název (Přeložený název)“.
- Kapitoly, které jste nevybrali, zůstanou ve výsledku v původním jazyce.
- Kniha psaná svisle se změní na vodorovnou, pokud se nepřekládá do japonštiny, čínštiny nebo korejštiny. Překlady do arabštiny a hebrejštiny se čtou zprava doleva.
- Co už je přeložené, se uchovává. Když překlad zastavíte, zvolte **Exportovat dosud přeložené** (zbytek zůstane v původním jazyce) nebo **Pokračovat později**. Když otevřete knihu s nedokončeným překladem, GenOffice nabídne, že v něm bude pokračovat. **Přeložit znovu od začátku** nejprve smaže uchovaný překlad do daného jazyka.
- Uchované překlady se započítávají v Nastavení ▸ Obecné ▸ **Uložené výsledky AI** spolu s výsledky dokumentů PDF a **Smazat vše** odstraní i je.
- Stejný překlad lze spustit i z [příkazů terminálu](help://cli) jako `ieumoffice epub translate`.

## Zatím nepodporováno

- Přidávání, mazání a změna pořadí kapitol; změna názvu, autora nebo obálky; vkládání obrázků a tabulek; změna odstavce na nadpis nebo seznam.
- Úpravy a překlad knih s pevným rozvržením a otevírání knih chráněných proti kopírování.
- Obracení stránek jako v tištěné knize a vytvoření nové prázdné knihy.
- Porovnání originálu a překladu vedle sebe přímo v editoru. Místo toho otevřete dvojjazyčnou knihu a přeloženou knihu opravujte jako kteroukoli jinou.
- Skrytí částí knihy před AI.
