# Karty a správa oken

Všechny otevřené soubory sdílejí jedno okno; pruh karet nahoře se mezi nimi přepíná jako v prohlížeči.

![Pruh karet: Domů a dva dokumenty](img/tabs.png)

## Základy

- **Přepínání**: klikněte na kartu, stiskněte **Ctrl+Tab** (další) / **Ctrl+Shift+Tab** (předchozí), nebo otáčejte kolečkem myši nad pruhem.
- **Zavřít**: × na kartě nebo ⌘W/ctrl+W. U neuložených změn se nejdřív zeptá.
- **Nová**: + na pravém konci pruhu.
- **Aktivace je okamžitá**: stisknutí karty přepne hned, bez čekání na dokončení kliknutí.

## Přejmenování: dvojklik na kartu

**Dvojklikem na libovolnou kartu souboru** se titul změní na pole pro úpravu přímo na místě: Enter potvrdí, Esc zruší, ztráta fokusu potvrdí; Enter potvrzující kandidáta v klávesnici IME se nesmí zaměnit s potvrzením. Přejmenování prochází stejnými kontrolami bezpečnosti jako přejmenování řádku na domovské stránce (nepovolené znaky, konflikty názvů), přejmenuje soubor na disku a obnoví seznam nedávných souborů.

## Přetažení a změna pořadí

Podržte kartu a přetáhněte ji do strany, čímž změníte pořadí; sousední karty se průběžně rozestupují a pořadí se ustálí po puštění. Nepásná zóna o šířce 4 pixelů brání tomu, aby běžné kliknutí karty rozhodilo.

## Kontextová nabídka

Kliknutím pravým tlačítkem na kartu získáte **Otevřít v novém okně** — nabízí se na každé kartě dokumentu, kterou lze odlomit — a **Zavřít**, které je na kartě, již nelze zavřít, ztlumené. Obě položky se lokalizují podle jazyku aplikace.

## Odlomení do samostatného okna

**Přetáhněte kartu mimo pruh** (nebo použijte Otevřít v novém okně) a stane se samostatným oknem s živým dokumentem; přetáhněte ji zpět, abyste ji připojili k pruhu. Odlomené okno je plnohodnotné okno — můžete v něm dál upravovat a ukládat.

## Seznam všech karet

Když se karty nevejdou, malá ikona pruhu karet na pravém konci otevře úplný seznam (nativní nabídka, kterou obsahová plocha nikdy nezakryje); vyberte šipkami.

## Pruh nástrojů v každém editoru

Každá karta editoru má nahoře pruh nástrojů (přesné rozvržení se mezi editory mírně liší):

- **Uložit** (⌘S/ctrl+S) a **Uložit jako…**.
- **Zpět / Znovu**: víceúrovňové; každý editor si drží vlastní historii.
- **Najít** (ctrl+F): otevře panel hledání daného editoru.
- Přepínač **Automatické ukládání**: když je zapnutý, změny se v pravidelných intervalech zapisují na disk; když je vypnutý, zapisuje se pouze při ručním uložení (připomíná to značka neuložených změn na kartě nebo v názvu).

## Karta Domů

Karta Domů, úplně vlevo, nelze zavřít; chcete-li se z libovolného editoru vrátit, klikněte na ni nebo použijte Soubor ▸ **Zpět na domovskou stránku**.

## Rozdělené zobrazení: dva panely

**Přetáhněte kartu na pravý okraj okna**: karta se promění v malou plovoucí kopii, u okraje se objeví nápověda „Zde rozdělit” a po puštění vzniknou dva panely vedle sebe. Puštění na dolním okraji vytvoří dva panely nad sebou. Nabídka karty po kliknutí pravým tlačítkem nabízí totéž přes **Rozdělit vpravo** a **Rozdělit dolů**, a na kartě v panelu navíc **Zrušit rozdělení**.

- Přetažená karta zůstane v panelu, kam jste ji pustili; druhý panel si ponechá dokument, který jste právě prohlíželi.
- Je-li otevřený jen jeden dokument, umístí se kopie téhož dokumentu do obou panelů — můžete vidět začátek i konec zároveň. Rozdělit lze i nový, dosud neuložený dokument.
- Přetažením **přepážky** mezi panely změníte jejich poměr, dvojklikem je rozdělíte na polovinu a dotlačením k okraji jeden panel zavřete; dokument zůstává otevřený jako karta.

## Jedno okno AI, které sleduje fokus

- Je vidět jen jedno okno AI. Panel, ve kterém právě pracujete, ukazuje to svoje; okno druhého panelu se sbalí do lišty a kliknutím na panel se jeho okno AI dostane dopředu.
- Dokud je sbalené, rozhovor toho panelu a běžící práce AI zůstávají živé. Rozhovory se ukládají pro každý dokument zvlášť.
- **Dvě kopie téhož dokumentu**: po uložení v jednom panelu se uložení z druhého nejprve zeptá „Tento dokument se změnil jinde”. Automatické ukládání tiše počká.
- Po běžném zavření **restart aplikace bez souboru** vrátí poslední dvojici rozdělených dokumentů přesně tak, jak byla rozdělena; spuštění se souborem otevře jen tento soubor. Po náhlém vypnutí se předchozí karty vrátí tak, jak je popsáno níže.
- Karty Domů, Nápověda a Prezentace (náhled) nemohou do panelu. Dokud je některá otevřená, oba panely se na chvíli skryjí a vrátí se při návratu na kartu dokumentu.

Tři a více panelů, rozdělování v odděleném okně a živé sladění obou kopií zůstávají na později.

## Když se aplikace nebo počítač náhle vypne

Dokud má dokument neuložené změny, GenOffice si přibližně každých 30 sekund ukládá jeho kopii pro obnovení do vlastní datové složky aplikace. Dělají to všechny editory, i u nového dokumentu, který nikdy nebyl uložen. Samotný soubor se nezmění, dokud ho neuložíte.

- **Karty se vrátí**: pokud se aplikace nebo počítač vypnuly bez běžného zavření (výpadek proudu, pád, vynucené ukončení aplikace, vypnutí počítače nebo restart kvůli aktualizaci), při dalším spuštění GenOffice se otevřené karty dokumentů vrátí ve stejném pořadí, i s rozdělením obrazovky, pokud bylo. Platí to i při spuštění otevřením souboru.
- **Jeden seznam na domovské stránce**: dokumenty, v nichž zůstal neuložený obsah, se zobrazí společně na domovské obrazovce. U každého zvolte **Obnovit** nebo **Zahodit**, případně použijte **Obnovit vše** či **Zahodit vše**, a pak stiskněte **Potvrdit**. Pokud soubor potom změnil jiný program nebo synchronizační služba, je předem vybráno **Zahodit**, aby soubor zůstal takový, jaký je teď. Pokud původní soubor už nelze najít, obnovení otevře obsah jako nový dokument bez názvu.
- **Rozhodnout později**: zavření seznamu nic nesmaže. Až některý z těchto dokumentů poprvé otevřete, okno s jeho názvem se zeptá znovu; stisk Esc nebo zavření okna znamená obnovení. Pokud obnovený obsah nepotřebujete, zavřete dokument tlačítkem **Neukládat**.
- **Karty se načtou při otevření**: obnovené karty hned ukazují název, ale každý dokument se načte až při prvním kliknutí na jeho kartu. Otevření všeho najednou by mohlo počítač s nedostatkem paměti znovu vypnout.
- **Při vypnutí počítače**: pokud jsou dokumenty neuložené, GenOffice se neptá, zda je uložit. Ponechá kopie, zavře se a nabídne je při dalším spuštění.
- **Dokumenty bez kopie**: soubory Excel, HWP a PDF chráněné heslem kopii pro obnovení nedostanou, takže jejich neuložené změny nelze obnovit; při otevření takového dokumentu na to jednou upozorní oznámení. Ukládejte je často. Dokumenty Word a PowerPoint chráněné heslem mají kopii zamčenou stejným heslem.
- **Soubory CSV, starší .xls a .tsv**: tabulkový editor uchová jejich kopii jako sešit bez názvu. Po obnovení se otevře jako sešit bez názvu a první uložení nabídne složku a název původního souboru jako .xlsx.

Kopie se smaže, když dokument uložíte, zavřete ho tlačítkem **Neukládat** nebo zvolíte **Zahodit**, a také po 30 dnech beze změny. Po běžném zavření se GenOffice spustí jako dřív a žádné karty nevrací.

**Nejde o automatické ukládání.** Automatické ukládání zapisuje změny přímo do souboru, a to až poté, co jste ho jednou uložili. Kopie pro obnovení se vašeho souboru nikdy nedotkne; uchovává jen to, co jste ještě neuložili, dokud to neuložíte nebo nezahodíte.
