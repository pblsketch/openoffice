# Projekty

Projekt je jedna složka ve vašem počítači. Když v panelu AI vyberete projekt, AI pracuje se znalostí souborů, pokynů, paměti a konverzací z této složky. Dokumenty k jedné práci mějte v jedné složce: konverzaci začatou v Docs pak můžete dokončit v hangulu nebo Slides a nemusíte v každém dokumentu znovu vysvětlovat souvislosti.

## Výběr projektu

- V panelu AI každého editoru a v **Ask AI** na stránce Domů je název aktuálního projektu vlevo pod vstupním polem. Když žádný vybraný není, stojí tam **Bez projektu**.
- Kliknutím otevřete seznam: projekty **Připnuté** a **Nedávné**, **Nový projekt**, **Přidat složku** a **Bez projektu**. Hledat můžete psaním do pole nahoře; když žádný projekt neodpovídá, můžete rovnou vytvořit nový s tímto názvem.
- Po najetí myší na řádek se objeví připnutí, **Otevřít složku** a **Odebrat ze seznamu**. Odebrání projektu ze seznamu složku ani její soubory nijak nemění.
- Projekt, jehož složka byla přesunuta nebo smazána, je zašedlý a označený **Složka nenalezena**. Klikněte na něj a vyberte přesunutou složku; projekt pak pokračuje beze změny.
- Když otevřete dokument ze složky projektu, je tento projekt už vybraný. Pokud dokument přepnete na **Bez projektu**, zůstane tak i při dalším otevření. Projekt vybraný pro dokument mimo složku si tento dokument také pamatuje.
- Vybraný projekt platí od dalšího požadavku v daném panelu. Pokud ho změníte uprostřed konverzace, začne nová konverzace a ta předchozí zůstane, kde byla.

## Nový projekt a přidání složky

- **Nový projekt**: zadejte název a ve výchozí složce pro ukládání vznikne složka s tímto názvem (zpočátku je to `Dokumenty\GenOffice`, změnit ji lze v Nastavení). Tlačítkem **Vytvořit jinde…** zvolíte jiné umístění. Pokud složka s tímto názvem už existuje, aplikace se zeptá, zda ji použít jako projekt, a **Použít tuto složku** s ní začne. Pokud je tato složka už projektem ve vašem seznamu, rovnou se otevře bez dotazu.
- **Přidat složku** (na obrazovce Projekty na stránce Domů **Použít existující složku**): jako projekt poslouží složka, kterou už máte, i se všemi podsložkami. Nelze vybrat celý disk, celou uživatelskou složku ani složky s přihlašovacími údaji nebo s daty aplikace.
- Když otevřete dokument ze složky projektu, který ve vašem seznamu není, objeví se pod vstupním polem „Tento dokument je ve složce projektu ‚…‘“ a tlačítko **Použít**. Kliknutí na něj má stejný účinek jako Přidat složku.
- Pokud složka, kterou jste od někoho dostali, už obsahuje pokyny nebo paměť, soubory `AGENTS.md` či `CLAUDE.md` nebo konverzace z jiného počítače, aplikace vám je jednou ukáže a zeptá se. Tlačítkem **Zobrazit vše** si nejdřív přečtete všechno. **Použít i s pokyny** převezme vše. **Použít bez pokynů** tyto pokyny a tuto paměť AI neposílá, skryje konverzace z jiných počítačů a do paměti nic nepřidává; čtení souborů funguje dál. Na stránce projektu to můžete později změnit tlačítkem **Použít i pokyny**. Když kliknete na **Zrušit** nebo dotaz zavřete bez volby, složka se nepřidá.
- Potom už se aplikace neptá. Pokud se pokyny nebo paměť změní mimo GenOffice, panel AI jednou zobrazí „Pokyny se změnily“ a tlačítko **Zobrazit** otevře příslušnou část stránky projektu.

## Pokyny a paměť

- **Pokyny** jsou pravidla tohoto projektu, třeba „Zprávy piš v odrážkách a název organizace nikdy nezkracuj“. Napište je na stránce projektu na Domů a stiskněte **Uložit**. Pokud jsou v horní úrovni složky `AGENTS.md` nebo `CLAUDE.md`, načtou se také; na stránce projektu je lze vypnout.
- **Paměť** jsou poznámky, které si AI dělá během konverzací: fakta, preference a rozhodnutí, která se budou později hodit, každá na jednom řádku s datem. Pokaždé, když něco zapíše, ukáže panel AI „Zapamatováno: …“ s tlačítkem **Smazat**. Pokud už byla tato poznámka smazána, řádek zní „Smazáno z paměti: …“ a tlačítko **Smazat** nemá. Předem se neptá.
- Když paměť naroste, panel AI ukáže „Paměť je už dlouhá“ s tlačítkem **Uklidit**. Stisknutím se sloučí poznámky, které se překrývají nebo jsou zastaralé. Předchozí verze se uchová a **Zpět** ji vrátí. Úklid proběhne jen po stisknutí tlačítka a odešle jeden požadavek na AI.
- Na stránce projektu můžete mazat poznámky, upravit celou paměť a paměť vypnout. Když je vypnutá, nic nového se nezapisuje a stávající paměť se dál čte.
- Z velmi dlouhých pokynů se konec vynechá a panel AI vás na to upozorní. Paměť se vždy posílá celá, ať je jakkoli dlouhá.

## Soubory, které AI vidí

- S každým požadavkem dostane AI název projektu, jeho pokyny a paměť a seznam názvů souborů ve složce. Obsah souboru si AI přečte sama, když ho potřebuje, stejným způsobem jako přílohu, takže části skryté před AI zůstanou skryté.
- Nečtou se otevřené dokumenty s neuloženými změnami, skryté soubory, jejichž název začíná tečkou, ani složka `.ieumoffice`.
- Pokud nechcete, aby AI nějaký soubor viděla, stiskněte **Skrýt před AI** v části Soubory na stránce projektu. Dá se to vrátit. Ve výsledcích hledání na Domů se soubor zobrazuje dál.
- Ve složkách synchronizovaných přes OneDrive, Disk Google a podobné služby se soubory, které nejsou stažené do tohoto počítače, zobrazují jako „Není v tomto počítači“. Když je AI chce číst, aplikace se nejprve zeptá, zda je stáhnout.
- Napište do vstupního pole `@` a za otevřenými dokumenty se objeví „Soubory v tomto projektu“. Vybraný soubor se připojí. Viz [Panel AI asistenta](help://ai-panel).
- Nové dokumenty, které AI v projektu vytvoří, se uloží do složky aktuálního dokumentu, nebo do horní úrovně složky projektu, pokud žádáte z Domů. Je-li název obsazený, přidá se `(2)`, takže se žádný soubor nepřepíše.

## Konverzace

- Panel AI s vybraným projektem ukazuje nahoře název aktuální konverzace. Kliknutím na něj otevřete seznam konverzací projektu, pole pro hledání a **Nová konverzace**. Kteroukoli konverzaci ze seznamu můžete znovu otevřít v libovolném editoru.
- Co se dělo v jiném editoru, se ukáže jako jeden řádek, například „Spuštěny 3 nástroje v hangulu ‚zpráva.hwp‘“. AI používá jen nástroje editoru, ve kterém právě jste.
- Při otevření dokumentu se zobrazí konverzace, která v něm byla použita naposledy. Pokud je stejná konverzace otevřená ve dvou oknech, zpráva odeslaná v jednom se hned objeví i ve druhém.
- Konverzace z jiného počítače nesou označení **Jiný počítač**.
- V seznamu můžete konverzace přejmenovat nebo smazat. Smazaná konverzace jde do koše.
- Konverzace, které dokument měl ještě před touto funkcí, jsou na konci seznamu v části **Starší konverzace tohoto dokumentu**.
- Konverzace **Bez projektu** se jako dřív ukládají ke každému dokumentu zvlášť. V Ask AI na Domů bez projektu konverzace skončí zavřením aplikace.

## Stránka projektu na Domů

V položce **Projekty** v postranním panelu Domů vytváříte **Nový projekt**, volíte **Použít existující složku** a otevíráte projekty ke správě.

- **Záhlaví**: název (přejmenováním se složka nepřejmenuje), cesta ke složce, **Otevřít v Průzkumníku souborů** (na Macu **Zobrazit ve Finderu**) a stav. Když se projekt používá bez pokynů, zobrazí se **Použít i pokyny**.
- **Pokyny**: pole pro pokyny a k němu načítané `AGENTS.md` a `CLAUDE.md`.
- **Paměť**: seznam poznámek, **Upravit vše**, **Uklidit**, zapnutí a vypnutí paměti.
- **Soubory**: soubory, které AI vidí, a ty, které jsou před ní skryté. Kliknutím na název souboru ho otevřete.
- **Konverzace**: konverzace tohoto projektu. Kliknutím otevřete dokument, ve kterém byla použita naposledy, a pokračujete v jeho panelu AI.
- Tato stránka načte složku znovu pokaždé, když se zobrazí, takže poznámku, kterou si AI právě zapamatovala, uvidíte, aniž byste stránku opouštěli. Pokud se soubor s pokyny nebo pamětí během úprav změnil mimo GenOffice, **Uložit** se nejdřív zeptá: **Znovu načíst** načte změněný soubor a **Přesto uložit** ho přepíše vašimi úpravami.

## Co zůstává ve složce a co je dobré vědět

- Pokyny, paměť a konverzace se ukládají jako textové soubory ve složce `.ieumoffice` uvnitř složky projektu. Když složku přesunete nebo zkopírujete na jiný počítač, putují s ní. Na jiném počítači ji stačí jednou vybrat přes **Přidat složku** v panelu AI nebo **Použít existující složku** na obrazovce Projekty na stránce Domů.
- Složka `.ieumoffice` vznikne, až když je do ní co zapsat. Její soubory můžete otevřít a upravit v Poznámkovém bloku.
- To, co napíšete do konverzace, se může dostat do paměti. Chcete-li něco vynechat, smažte to tlačítkem **Smazat** na řádku „Zapamatováno“, nebo paměť vypněte.
- Pokud jako projekt vyberete synchronizovanou složku, nahrají se do dané služby i její pokyny, paměť a konverzace. Aplikace na to upozorní jednou, když ji vyberete poprvé.
- Ve sdílené složce, kterou používá více lidí, se paměť a konverzace mohou promíchat.
- Ve složce, do které aplikace nemůže zapisovat, například jen pro čtení, fungují pokyny i čtení souborů, ale konverzace a paměť se neukládají. Panel AI vás na to upozorní.
- Okno agenta zatím projekty nepoužívá. Agent může měnit i soubory ve složce `.ieumoffice`, proto ve složce s neznámým obsahem použijte některý ze způsobů, kdy se nejdřív ptá. Viz [Režim agenta](help://agent-mode).
