# Diagramy: kreslení a úpravy souborů draw.io

Editor diagramů otevírá soubory draw.io na kartě. Kreslíte v něm vývojové diagramy, diagramy architektury a další diagramy, ukládáte je ve formátu, v jakém přišly, exportujete je jako obrázky nebo PDF a můžete nechat AI, aby je četla, měnila a kreslila. Editor běží celý ve vašem počítači.

## Otevření diagramu

- Editor otevírá soubory `.drawio`, `.dio`, `.drawio.svg` a `.drawio.png`: z dialogu pro otevření, přetažením souboru do okna, ze seznamu nedávných souborů, ze stromu složek a soubory `.drawio` a `.dio` také ze seznamu Disku Google. Ve Windows se po instalaci GenOffice stane programem pro soubory `.drawio` a `.dio`.
- Soubor `.drawio.svg` nebo `.drawio.png` se otevře jen tehdy, když je diagram uložený uvnitř obrázku. Běžný obrázek SVG nebo PNG se jako diagram neotevře. Poškozené soubory se také neotevřou a zobrazí se důvod.
- Soubor Visio (`.vsdx`) se importuje jako nový diagram bez názvu. První uložení nabídne soubor `.drawio` ve složce souboru Visio a samotný soubor Visio se nezmění. Pokud se některé obrázky z něj nepodařilo převést, editor řekne, kolik jich je. Ve Windows se soubory `.vsdx` nabízejí jen v nabídce „Otevřít v programu“.
- Nový prázdný diagram začnete dlaždicí **Diagram** na domovské stránce nebo příkazem Nový v nabídce Soubor.
- Pokud je diagram už otevřený, jeho karta se přesune dopředu.

## Úpravy

- Obrazovka úprav je obrazovka draw.io beze změn: nabídky nahoře, tvary vlevo, panel formátu vpravo a karty stránek dole.
- Uložit (Ctrl+S), Uložit jako (Ctrl+Shift+S) a Tisk (Ctrl+P) obstarává GenOffice. Přepínání karet a další zkratky celé aplikace dál fungují. Všechny ostatní zkratky patří samotnému editoru, včetně vrácení zpět (Ctrl+Z).
- Položka **Nápověda** (F1) v nabídkách editoru otevře tuto stránku.
- Editor používá jazyk GenOffice. Když jazyk změníte, editor se znovu spustí: neuložené změny zůstanou, ale historie vracení zpět se ztratí.
- Editor se řídí motivem GenOffice. V tmavém motivu se kresba také zobrazuje v tmavých barvách, ale uložený soubor, PNG, PDF a výtisky jsou přesně stejné jako ve světlém motivu.

## Ukládání

- Uložit, Uložit jako, **Automatické ukládání** ve stavovém řádku a dotaz před zavřením fungují jako v ostatních editorech.
- Diagram se ukládá ve formátu, ve kterém byl otevřen. Uložit jako nabízí `.drawio`, `.dio`, `.drawio.svg` a `.drawio.png`. Nový diagram se poprvé uloží jako `.drawio`.
- Pokud se nic nezměnilo, soubor se znovu nezapisuje. Stránky, které jsou v souboru uložené komprimovaně, zůstanou komprimované.
- Obrázek souboru `.drawio.png` ukazuje první stránku a celý diagram je uložený v něm.
- Dokud má diagram neuložené změny, uchovává se ve složce dat aplikace kopie pro obnovení, takže práce přečká pád aplikace.

## Export a tisk

- V nabídce Soubor zvolte export do PNG, SVG nebo PDF (položky exportu ve vlastních nabídkách editoru otevřou stejné okno). Potom zvolte **Všechny stránky** (výchozí) nebo **Pouze aktuální stránka**.
- Při volbě všech stránek vytvoří PNG a SVG jeden soubor na každou stránku s názvem `<název>-p<číslo stránky>`. PDF má jeden list na stránku ve velikosti stránky nastavené v diagramu.
- Tisk (Ctrl+P) také tiskne jeden list na stránku. Exporty a výtisky mají vždy světlé barvy bez ohledu na motiv.

## Panel AI

- Požádejte AI, aby nakreslila vývojový diagram, sekvenční diagram nebo organizační schéma, vysvětlila diagram, uspořádala stránku nebo přidala další krok za vybrané tvary.
- AI čte diagram jako text: stránky a u každého tvaru a spojnice jeho id, text, tvar, polohu a propojení, k tomu i to, které tvary jste vybrali. Diagram jako obrázek nevidí.
- Změny od AI se objeví hned. Každá změna je jeden krok vrácení zpět (Ctrl+Z) a seznam „Vrátit kolo AI zpět“ v panelu vezme zpět celé kolo AI. Pokud je kterákoli část změny odmítnuta, diagram zůstane, jaký byl.
- U nového vývojového diagramu, sekvenčního diagramu a podobně AI napíše kód Mermaid a GenOffice ho ve vašem počítači převede na tvary. Rozvržení se může trochu lišit od toho, které vytvoří web draw.io.
- Diagramy lze také připojit v panelu AI ostatních editorů, vybrat přes `@` a najít vyhledáváním souborů na domovské stránce. [Příkazy terminálu](help://cli) diagramy také čtou, upravují a vytvářejí (`ieumoffice diagram read`, `ieumoffice diagram apply`, `ieumoffice create --type drawio`).

## Používání internetu

- Karta diagramu neodesílá nic do internetu. Editor běží ze souborů nainstalovaných spolu s GenOffice a jeho cloudové úložiště, sdílení, pluginy a vlastní AI jsou vypnuté.
- Obrázky a písma, které si diagram bere z internetu, se nenačítají; při otevření souboru na to upozorní poznámka. Webový nebo e-mailový odkaz na tvaru se otevře ve výchozím prohlížeči, jen když na něj kliknete.
- Poznámkový blok, knihovny tvarů, které přidáte, a nedávné barvy zůstávají v tomto počítači, ve složce dat aplikace. Panel AI stejně jako ostatní editory posílá text diagramu AI, kterou jste zvolili.

## Zatím nepodporováno

- Vkládání a úpravy PlantUML. Tvary PlantUML v souboru se zobrazují jako jejich uložený obrázek.
- Automatická rozvržení využívající ELK a spojnice, které obcházejí tvary. Takové spojnice se kreslí jako obyčejné spojnice.
- Staré formáty Visio (`.vsd`, `.vss`) a ukládání zpět do `.vsdx`.
- Cloudové úložiště, sdílení, publikování, pluginy a vlastní funkce AI editoru.
- Skrytí částí diagramu před AI.
