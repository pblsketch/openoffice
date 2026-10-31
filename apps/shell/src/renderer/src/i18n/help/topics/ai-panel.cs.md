# Panel AI asistenta

Každý editor může vyvolat panel AI: vyberte něco, zadejte pokyn a sledujte výsledek, který se přenáší postupně.

## Otevření a používání

- Panel potřebuje připojenou AI. Není-li žádná připojena, zobrazí místo chyby karty pro připojení; viz [Připojení předplatného](help://subscription).
- Vstupy: **tlačítko AI** na pásku každého editoru, **Zeptat se AI** v kontextových nabídkách nebo Zeptat se AI na liště značení.
- Popište úkol běžnými slovy (přepsat to / udělat z této sloupce procenta / přelayoutovat tuto stránku...) a stiskněte Enter.
- Odpovědi se vykreslují **průběžně**; když AI potřebuje nástroje (přečíst dokument, upravit ho), použije je a pokračuje až do dokončení.
- **Zastavit**: kdykoli přeruší právě probíhající krok.
- **Fronta**: zatímco odpověď běží, Enter zařadí zprávu do fronty, místo aby ji zahodil — pruh nad polem je počítá; rozbalte ho pro úpravu, odebrání, přeřazení, pauzu nebo vymazání. Další zpráva se pošle sama koncem tahu; Esc tahu i nadále ukončuje.

## Která AI odpovídá

- Seznam modelů ve spodní části panelu ukazuje používanou AI a umožňuje zvolit jinou: nejprve vaše předplatná, potom poskytovatele s klíčem, které jste nastavili.
- Jakmile využijete 80 % limitu předplatného nebo více, objeví se v panelu řádek jako „Využito 85 % · obnoví se v 15:00“.
- Pokud se požadavek zastaví — limit je vyčerpán nebo vypršelo přihlášení — panel uvede důvod a sám na jinou AI nepřepne. Je-li připojeno vaše druhé předplatné, nabídne ho tlačítko **Pokračovat s …**.

## Co umí

- **Docs**: přepsat/rozšířit/přeložit/shrnout, vkládat tabulky a obrázky, měnit formátování; každý krok nejprve vytvoří snímek stavu.
- **Sheets**: vzorce, vyplňování dat, hromadné přeměny, formátování.
- **Slides**: vytvoření celé prezentace, úprava rozvržení, přepis textů.
- **PDF**: otázky, odpovědi a shrnutí nad vybraným textem nebo stránkami.
- **Markdown / HTML**: přepsat, rozšířit, přeložit.
- **Domů ▸ Ask AI** odpovídá z vašich souborů s hvězdičkou a cituje je — panel znalostní báze má vlastní sekci v kapitole Domů a AI panel Docs nese tutéž dovednost.

## Připojení otevřených dokumentů

V panelu AI editorů Docs, Sheets, Slides, hangul, HTML a myšlenkových map můžete jako podklad připojit další dokumenty otevřené v GenOffice nebo nedávno otevřené. Připojený dokument se zpracuje úplně stejně jako soubor vybraný z počítače.

- **`@` ve vstupním poli**: napište `@` na začátek pole nebo za mezeru a otevře se seznam dokumentů. Pokud je okno rozdělené, je první dokument z vedlejšího panelu, po něm ostatní otevřené a nedávné dokumenty; dokument, ve kterém právě jste, v seznamu chybí. Zužte ho několika písmeny názvu (mezery nevadí) a vyberte klávesou Enter nebo kliknutím: do pole se vloží `@název dokumentu` a dokument se připojí. **Najít další…** úplně dole otevře okno pro výběr dokumentů popsané níže.
- **Připojit z dokumentů GenOffice**: toto tlačítko vedle tlačítka přílohy otevře stejný seznam v okně, kde můžete zaškrtnout více dokumentů a připojit je najednou.
- Dokumenty s neuloženými změnami a nové dokumenty, které nebyly nikdy uloženy, jsou zašedlé a nelze je vybrat. Uložte je a vyberte znovu — AI čte uložený soubor.
- Když mají dva dokumenty stejný název, ale leží v různých složkách, přidá se název složky bezprostředně nad nimi, například `@plán.docx(2. pololetí)`, a tento název složky dostane i AI.
- Editory PDF a Markdown zatím přílohy nemají, takže tam není k dispozici ani jeden způsob.

## Projekty

- Projekt (jednu složku ve vašem počítači) vyberete kliknutím na název projektu vlevo pod vstupním polem. AI pak odpovídá se znalostí souborů, pokynů a paměti z této složky a konverzace se uloží do složky, takže v ní můžete pokračovat v jiném editoru. Viz [Projekty](help://projects).
- S vybraným projektem se nahoře v panelu zobrazí název aktuální konverzace. Kliknutím na něj otevřete seznam konverzací projektu a **Nová konverzace**.
- Seznam `@` ve vstupním poli ukazuje za otevřenými dokumenty „Soubory v tomto projektu“.
- Požadavek s vybraným projektem posílá AI, kterou používáte, také pokyny projektu (spolu s `AGENTS.md` a `CLAUDE.md` v kořeni složky, které lze vypnout na stránce projektu), jeho paměť a seznam názvů souborů, krátký úryvek z každého souboru, který AI najde při hledání ve složce, a k tomu text každého souboru, který si AI přečte.

## Vrácení zpět a bezpečnost

- Panel v Docs vede **seznam verzí**: jeden snímek na krok, můžete se vrátit k libovolnému a samotný návrat lze zase vrátit pomocí Ctrl+Z. Snímy přežijí i znovu otevření dokumentu.
- Změny od AI procházejí stejnou cestou úprav jako ruční změny (lze je vrátit, vyžadují uložení) — nic neobchází vaše potvrzení uložení.

## Skrýt výběr před AI

- V Slides, HTML a Markdown lze výběr schovat před očima modelu: pravý klik ▸ **Skrýt výběr před AI**, pojmenujte zástupný text a model čte `{{název}}` místo něj. (Markdown položku zapíná přepínačem přeškrtnutého oka na pásu; ta HTML žije v panelu zdroje.)
- Soubor si ponechá skutečný text — uložení, export i tisk zůstávají nedotčené a značka přežije znovuotevření. Tatáž položka skrytí zruší (Markdown má navíc **Znovu ukázat výběr AI**).
- HTML skrývá obsah prvků, hodnoty atributů a řetězcové literály ve skriptech; vykreslená stránka se nikdy nemění.
- Slides skrývá i celé obrázky, videa a audio a snímek se skrytým obsahem nikdy neodchází jako snímek obrazovky: automatická kontrola rozvržení stránku přeskočí a oznámí to.
- Platí to jen pro AI v aplikaci — CLI, nástroje MCP a bezhlavý export čtou soubor přímo a text stále vidí.

## Soukromí

- Pokyny a příslušný obsah dokumentu putují k **AI, kterou používáte**: společnosti Anthropic nebo OpenAI pod vaším vlastním účtem, pokud používáte předplatné, nebo poskytovateli, jehož klíč jste zadali. Není-li připojena žádná AI, nic se neodesílá.
- Zda se obsah odeslaný přes předplatné použije k trénování AI, určuje nastavení vašeho účtu u dané společnosti.
- Místní soubory se nikam jinam neodesílají; klíče API se ukládají do souboru nastavení aplikace na tomto počítači a odesílají pouze v hlavičkách požadavků.
