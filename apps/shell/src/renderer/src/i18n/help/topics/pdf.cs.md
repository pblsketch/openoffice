# PDF: čtení, anotování a začerňování

Editor PDF má pět karet na pásku: **Domů / Anotace / Úpravy / Stránky / Zobrazení**. Umí číst i zapisovat: text lze upravovat, obsah začerňovat a podepisovat a formuláře vyplňovat.

## Čtení a navigace

- Levý postranní panel: **miniatury** (kliknutím přeskočíte, viditelný rozsah je zvýrazněn) nebo **osnova** (záložky, pokud jsou k dispozici).
- Přiblížení: ovladač poměru vpravo dole; ctrl+kolečko mění přiblížení po stupních.
- Posun zobrazení: zapněte **nástroj Ruka** (karty Domů a Zobrazení) a tažením posouvejte stránku všemi směry. Dokud je zapnutý, tažení nevybírá text a obyčejné kliknutí odkaz dál otevře. Tažení se stisknutým prostředním tlačítkem (kolečkem) posouvá zobrazení i bez nástroje. Vypne ho Esc nebo výběr jiného nástroje.
- Otáčení: jednotlivé stránky nebo všechny z nabídky Stránky; otočení se při uložení zapíší zpět do souboru.
- Vyhledávání: ctrl+F v celém textu se zvýrazněním všech nálezů.
- Šifrované soubory PDF: otevře je výzva k zadání hesla (v samostatném malém okně); heslo se použije pouze pro tuto relaci. Takový dokument lze upravovat a ukládat; uložení heslo zachová. **Anotace → Chránit** nastaví, změní nebo odebere heslo a to, co smějí čtenáři.

## Výběr textu a značení (Anotace)

Vyzkoušejte na libovolném odstavci:

1. **Přetáhněte myší přes větu** — po puštění se nad textem objeví lišta s anotací:

![Lišta s anotací po výběru textu](img/pdf-highlight.png)

2. Zvolte jednu ze tří barev **zvýraznění**, nebo **podtržení**, **vlnovku** či **přeškrtnutí**. Barvu zvýraznění změníte tak, že na ni kliknete pravým tlačítkem a vyberete novou. Po podtržení, vlnovce nebo přeškrtnutí se na liště otevře řada barev: klepnutím na jinou barvu ji změníte a další značka bude také v této barvě. **Zeptat se AI** odešle výběr spolu s vaší otázkou do panelu AI.
3. Chcete-li anotaci zrušit, znovu přetáhnutím vyberte stejný úsek a klikněte na již aktivní tlačítko na liště (přepínač ve stylu Wordu), nebo výběr vyberte a stiskněte Odstranit.

Co očekávat:

- Přetažení přes text zobrazí místní lištu: **zvýraznění / podtržení / přeškrtnutí / kopírovat / Zeptat se AI**.
- Barvy pocházejí z palety; **použití stejného značení na již označený úsek jej odstraní** (přepínač ve stylu Wordu).
- Značení uložená již v souboru lze vybrat a odstranit (⋯ menu nebo Odstranit).
- **Pozor**: dokud je aktivní nástroj kreslení, textovou vrstvu nelze vybírat — nástroj se po každém umístění sám vypne, takže před další akcí jste opět v režimu výběru.

## Nástroje kreslení (Anotace)

Šest nástrojů: **tuš, obdélník, elipsa, šipka, poznámka**, navíc **začerňovací rameček** na kartě Anotace.

- Každý nástroj je přepínač: kliknutím jej zapnete; **sám se vypne, jakmile je umístěna figura** (chcete-li pokračovat, klikněte na nástroj znovu); kliknutí na již zapnutý nástroj jej rovněž vypne.
- Tuš sleduje šířku tahu; obdélník, elipsa a šipka se táhnou; barvy pocházejí z kreslicí palety.
- Umístěné figury lze vybrat, odstranit, přetáhnout a (obdélník a elipsu) změnit velikost.
- **Začerňování, celý postup** (například skrytí řádku textu):

  1. Karta Anotace ▸ klikněte na **Začernit oblast** (nástroj se zapne).
  2. **Přetáhněte rameček přes obsah** — bude překryt kresbou šrafování a na liště nástrojů se objeví tlačítka **vymazat značky / použít začernění**.

  3. Klikněte na **Použít začernění** a potvrďte — výsledkem je pracovní kopie, ve které je zakrytý text a obrázky fyzicky odstraněny (nikoli jen překryty), a operaci nelze vzít zpět; původní dokument zůstane nedotčen.

  Udělali jste chybu? Tlačítko pro vymazání značek smaže aktuální značky, takže můžete kreslit znovu.

## Připnuté poznámky a vlákna komentářů

- **Nástroj poznámky** umístí špendlík a otevře kartu v okraji pro text (jméno autora lze nastavit); po potvrzení se uloží jako standardní textová anotace PDF.
- Kliknutím na špendlík otevřete vlákno: **odpovědět** (odpovědi tvoří jeden plochý seznam bez vnoření), **upravit** vlastní komentář, **odstranit** jeden komentář nebo celé vlákno.
- Rozpracované úpravy přežijí, dokud uložení nezapíše nový text zpět do téže anotace v souboru, takže řetězce odpovědí zůstanou zachovány.

## Úprava obsahu PDF (Úpravy)

- **Upravit text**: kliknutím na text jej upravíte po blocích (engine pdfium; písma se přiřazují s nejlepším možným přiblížením).
- **Vložit text**: vloží dohledávatelný text s libovolným písmem, velikostí a barvou.
- **Vložit obrázek / razítko**.
- Formuláře: pole AcroForm se vyplňují přímo; hodnoty se zapisují při uložení.

## Podpisy

- **Ruční podpis**: nakreslete jej; lze jej připojit k poli podpisu ve formuláři.
- **Podpis jako obrázek**: umístěte podpis jako obrázek.
- Uložené podpisy lze opakovaně používat.
- **Podpis certifikátem** (karta Anotovat): podepište certifikátem ze systémového úložiště nebo ze souboru .p12/.pfx; volitelně ukážete podpis na stránce a volitelně certifikujete dokument proti pozdějším změnám.
- Podepsání vždy zapíše **nový soubor** (přírůstková aktualizace — dřívější podpisy zůstávají platné) a podepsaná kopie se otevře na místě. Nejdřív uložte: podpis kryje soubor takový, jaký leží na disku.
- Banner nad dokumentem vypíše existující podpisy; **Zobrazit podpisy** ukáže platnost, pokrytí a řetěz certifikátů každého z nich. Odvolání (CRL/OCSP) se nekontroluje.

## Operace se stránkami (Stránky)

- **Otočit / odstranit / přesunout**: tažením miniatur měníte pořadí; odstranění vyžaduje potvrzení.
- **Importovat stránky**: přeneste stránky z jiného souboru PDF. **Vložit prázdnou stránku** přidá prázdnou stránku.
- **Nahradit stránky** nahradí celý rozsah stránkami odjinud; **Oříznout stránky** zkrátí okraje, s možností použít to na všechny stránky.
- **Velikost stránky** přepočítá všechny stránky na jediný rozměr papíru; **Obrátit pořadí** otočí dokument od konce k začátku.
- **Vyjmout stránky**: exportuje vybrané stránky do nového souboru PDF.
- **Rozdělit PDF**: má dvě podoby — rozdělení podle rozsahů na několik souborů nebo rozřezání každé stránky na mřížku menších stránek.
- **Sloučit PDF**: má dvě podoby — připojení dalších souborů PDF nebo spojení několika stránek na jeden list. Velikosti se sčítají **ještě před načtením čehokoli** a soubor o celkové velikosti nad **1 GiB je odmítnut** se srozumitelnou chybou (kvůli omezení paměti).
- Změny na úrovni stránek se zapíší zpět při příštím uložení; Uložit jako… ponechá originál nedotčený.

## Export a tisk

- **Exportovat jako Word… / PowerPoint… / Excel…** v nabídce Soubor, nebo ty stejné tři z **Převodník PDF** na pásku karet — vše lokálně, bez nahrávání. Ze souboru .pptx vyjde jeden snímek na stránku a ze souboru .xlsx jeden list na stránku. U každého se zeptá, kam uložit.
- **Tisk**: aktuální pořadí a otočení přes systémový dialog; podporuje rozsahy stránek.

## Ukládání

- Běžné ukládání, ruční i automatické, zapíše anotace a úpravy zpět do souboru (atomicky).
- **Začerňování prochází vlastním postupem použití** a vytvoří kopii, takže původní dokument zůstane nedotčen a citlivý obsah v něm nezůstane.

## Klávesové zkratky panelu výběru

Dokud je nad vybraným textem vidět panel anotací, jedna klávesa hned provede akci.

| Klávesa | Akce                                   |
| ------- | -------------------------------------- |
| H       | Zvýraznění (už zvýrazněné místo zruší) |
| U       | Podtržení                              |
| S       | Přeškrtnutí                            |
| N       | Poznámka na konci výběru               |
| E       | Vysvětlení AI (karta úryvku)           |
| T       | Překlad AI (karta úryvku)              |
| Enter   | Otevření pole **Zeptat se AI**         |

- Klávesy fungují stejně i při korejské nebo jakékoli jiné metodě zadávání. Nevšímají si jich, když píšete do pole nebo držíte Ctrl či Alt.
- V dokumentu zamčeném proti úpravám (heslo vlastníka zakazuje změny) H, U, S a N nic neudělají a stejně jako tlačítka panelu ukážou důvod.

## Karty úryvků

Stiskněte **E** nebo **T**, případně čipy pro vysvětlení a překlad v poli **Zeptat se AI**, a odpověď se objeví v malé kartě vedle výběru. Karty se uchovávají, takže po novém otevření dokumentu zůstanou, a lze je kopírovat. Když se na stejný úryvek zeptáte znovu, otevře se existující karta a nic se neodešle.

- **Ponechat jako poznámku** vytvoří na tom místě poznámku. Její první řádek zní „Vysvětlení AI“ nebo „Překlad AI“ a autorem je název vašeho účtu v počítači. Do souboru se dostane při uložení PDF; do té doby karta ukazuje „Čeká na uložení“.
- **Ptát se dál v panelu AI** předá úryvek a odpověď do panelu AI bez odeslání; **Přidat do poznámky** je vloží na konec poznámky k tomuto PDF.
- Úryvek znovu odešle do AI jen **Vytvořit znovu**.
- **Smazat** odstraní pouze uchovanou kartu. Už ponechaná poznámka zůstane.
- Jemná tečkovaná čára označuje každý úryvek s kartou; kliknutím na ni se karta znovu otevře. Čára je jen na obrazovce a nikdy se neukládá ani netiskne. Zapnete ji nebo vypnete v Zobrazení ▸ **Značky úryvků**.

## Přehled anotací

- Zobrazení ▸ **Anotace** ukáže v levém postranním panelu seznam zvýraznění, podtržení, přeškrtnutí, poznámek a kreseb dokumentu, ještě neuložených značek a karet úryvků. Značky ukazují text, který překrývají.
- Filtrujte podle druhu, barvy, rozsahu stránek nebo textu a řaďte podle stránky nebo pořadí vytvoření.
- Kliknutí na položku přenese na dané místo s krátkým bliknutím. Poznámka otevře své vlákno na okraji, karta otevře kartu.
- Příkazy nabídky **Kopírovat jako Markdown**, **Otevřít jako dokument Markdown** a **Otevřít jako dokument Word** použijí seznam tak, jak je právě filtrovaný. AI se nepoužívá. Nové dokumenty lze vytvořit jen z PDF otevřeného v GenOffice.

## Překlad vedle sebe

- Zapněte Zobrazení ▸ **Překlad vedle sebe** a vpravo od každé stránky se objeví sloupec s překladem, který se posouvá spolu s ní. Samotné zapnutí nic neposílá do AI. Dokument, který jste už přeložili pomocí **Přeložit dokument**, ukáže překlad hned; odstavce bez překladu se zobrazí jako zašedlý původní text.
- **Přeložit tuto stránku** (nebo **Přeložit zbytek**, když je část hotová) odešle stránku jedním kliknutím, pokud používáte předplatné; vedle tlačítka je vidět název cílové AI. U připojení placeného podle využití se první kliknutí na kartě nejprve zeptá „si za to bude účtovat poplatek · Přeložit / Zrušit“.
- Dvojklikem na přeložený odstavec ho upravíte. Upravené odstavce se uchovají jako prostý text a beze změny se použijí v přeložených souborech PDF, Markdown a EPUB. **Přeložit znovu** u odstavce odešle jen ten odstavec, a pokud jste ho upravili, napřed se zeptá.
- Najetím myší na přeložený odstavec se jeho místo na původní stránce orámuje. Šířku sloupce a velikost písma lze měnit. **Přeložit všechny stránky…** otevře okno **Přeložit dokument**, jehož formát **Jen uložit (bez souboru)** ponechá překlad bez zápisu souboru.
- Nově přeložené odstavce jsou propojené větu po větě. Najetí myší na přeloženou větu zvýrazní tuto větu na stránce originálu a najetí na větu originálu rozsvítí její překlad. Kde se věta na stránce nenajde, a u odstavců přeložených dříve nebo upravených vámi, zůstává propojení po odstavcích.
- Lišta nad sloupcem přepíná mezi **Překlad** a **Jednoduché vysvětlení**. Jednoduché vysvětlení přepíše text běžnými slovy a krátkými větami pro děti, starší lidi nebo ty, kdo se jazyk učí; fakta, čísla a jména zůstanou beze změny. Volba se pamatuje a přepnutí nic neodešle. Dokud je vidět vysvětlení, tlačítka stránky a odstavce i úpravy platí pro ně.
- U jednoduchého vysvětlení otevře **Vysvětlit jednoduše všechny stránky…** okno **Přeložit dokument** s druhem **Jednoduché vysvětlení**. Vysvětlení je delší než originál, a proto z něj nemůže být přeložené PDF; zapisuje se jako Markdown nebo EPUB. Se zapnutou volbou **Originál a pak vysvětlení** následuje za každým odstavcem originálu jeho vysvětlení; když je vypnutá, soubor obsahuje jen vysvětlení. Jazyk je nejprve jazykem rozhraní a může to být i jazyk dokumentu.

## Zvýraznění pomocí AI

- V Domů ▸ **Zvýraznění pomocí AI** vyberte sadu kategorií (Výzkum a zprávy, Smlouvy a podmínky, Učebnice a návody nebo Vlastní) a stránky. Nic se neodešle, dokud nezkontrolujete odhadovaný počet volání a cílovou AI a nestisknete **Spustit**.
- Věty vybrané AI se zobrazí v náhledu jako průsvitné barevné rámečky na stránce. Náhled se nikdy neukládá; zapnete ho nebo vypnete v Zobrazení ▸ **Náhled zvýraznění**.
- V panelu **Anotace** můžete návrhy po jednom **Přijmout** nebo **Zahodit**, případně přijmout celou kategorii. Větu, která se v textu stránky nenašla, přijmout nelze.
- Přijatý návrh se stane zvýrazněním v barvě své kategorie a název kategorie se uloží jako předmět anotace, takže ho jiné prohlížeče PDF ukážou v seznamu komentářů. Do souboru se dostane při uložení PDF.
- V dokumentu zamčeném proti úpravám nelze zvýraznění pomocí AI spustit. Vymyšlené věty, které v textu nejsou, se zahodí, a závěrečná zpráva uvede, kolik jich přišlo a kolik bylo zahozeno.

## Přehled dokumentu a citace odstavců

- Nahoře v panelu AI vytvoří **Přehled dokumentu** ▸ **Vytvořit přehled** shrnutí ve třech větách, shrnutí a klíčové pojmy (s významem a první stránkou). Dlouhý dokument se shrnuje po částech, proto nejprve potvrdíte odhadovaný počet volání.
- Přehled se uchová a po novém otevření tam zůstane; znovu odešle jen **Vytvořit znovu**. Kliknutím na pojem ho vyhledáte v dokumentu; každou část lze zkopírovat nebo přidat do poznámky.
- Když je konverzace prázdná, panel AI nabídne tři navrhované otázky. Kliknutí otázku jednou odešle.
- Kliknutí na odkaz na stránku (p.N), který AI uvede jako doklad, přejde na tu stránku a citovanou větu na dvě sekundy zvýrazní. Pokud se věta nenajde, otevře se jen stránka.

## Poznámka ke každému PDF

- Když poprvé stisknete **Otevřít poznámku** (karta Zobrazení nebo panel **Anotace**), otevře se okno uložení, výchozí je složka PDF a název „název PDF poznámka.md“. Potom se poznámka otevírá rovnou na kartě Markdown.
- Pokud zvolíte soubor, který už existuje, Windows se možná zeptá, zda ho nahradit, soubor se ale nepřepíše: připojí se jako poznámka tak, jak je.
- **Přidat do poznámky** (na kartách, položkách panelu a v přehledu dokumentu) vloží citaci s odkazem na stránku na konec karty poznámky a nechá ji neuloženou; uložíte ji sami na kartě poznámky. Odkaz otevře PDF na dané stránce i v jiných programech, například v prohlížeči.
- U PDF, které nebylo nikdy uloženo, se zobrazí „Nejprve PDF uložte“. Poznámky fungují jen u PDF otevřených v GenOffice.
