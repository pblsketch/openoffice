# Dovednosti

Dovednost je sada pracovních pokynů pro AI. Jednou si zapište, co děláte stále znovu — postup úpravy poznámek z porady, tón zprávy, body, které pokaždé kontrolujete — a pak ji můžete vyvolat v panelu AI, nebo ji AI použije samo, když se hodí. Dovednost je složka se souborem `SKILL.md` v otevřeném formátu, takže dovednost vytvořená v GenOffice funguje beze změny i v Claude Code nebo Codex.

## Zapínání a vypínání dovedností

**Nastavení ▸ Dovednosti** ukazuje dovednosti na tomto počítači, seskupené podle původu. Každá dovednost se zobrazuje pod svým jménem, stejně jako ji ukazují agenti pro programování. Pomocí vyhledávacího pole nahoře najdete dovednost podle jména nebo popisu.

| Původ                        | Co obsahuje                                                            | Na začátku |
| ---------------------------- | ---------------------------------------------------------------------- | ---------- |
| **Vestavěné**                | 5 dovedností dodávaných s GenOffice                                    | Zapnuté    |
| **Moje dovednosti**          | Dovednosti, které jste přidali nebo vytvořili (`~/.ieumoffice/skills`) | Zapnuté    |
| **Složka dovedností Claude** | Dovednosti v `~/.claude/skills`                                        | Vypnuté    |
| **Pluginy Claude**           | Dovednosti nainstalovaných pluginů Claude                              | Vypnuté    |
| **Složka dovedností Codex**  | Dovednosti v `~/.agents/skills`                                        | Vypnuté    |

- Přepínač dovednost zapíná nebo vypíná. Stejné nastavení platí pro panel AI každého editoru, pro Ask AI na stránce Domů i pro okno agenta.
- U zapnuté dovednosti zvolte **Rozhoduje AI** nebo **Jen na vyvolání**. Na začátku je nastaveno Rozhoduje AI. S volbou Jen na vyvolání se dovednost použije jen tehdy, když ji vyvoláte sami.
- Dovednosti z různých zdrojů mohou mít stejný název. Rozlišíte je podle štítku původu na každém řádku.
- V nabídce dalších akcí jsou **Zobrazit obsah**, **Upravit** (jen moje dovednosti), **Exportovat (zip)** (jen moje dovednosti) a **Otevřít složku**.
- **Přesunout do koše** přesune jednu z mých dovedností do systémového koše, odkud ji můžete obnovit.
- Vestavěná dovednost se neodstraňuje, ale skrývá: zvolte **Skrýt**. **Znovu zobrazit** dole v seznamu ji vrátí do původního stavu.
- Chcete-li změnit vestavěnou dovednost nebo dovednost z jiného programu, zvolte **Kopírovat do mých dovedností**. Kopie se objeví v mých dovednostech a originál se vypne.
- Při exportu dovednosti se šablonou se do zipu přibalí i dokument šablony. Před exportem zkontrolujte, že dokument neobsahuje osobní údaje.

## Přidání dovednosti

1. V **Nastavení ▸ Dovednosti** klikněte na **Přidat**.
2. Zvolte **Ze složky**, **Ze souboru zip** nebo **Z odkazu na GitHub**. U GitHubu zadejte adresu veřejného repozitáře nebo `owner/repo` a klikněte na **Najít**.
3. V náhledu zkontrolujte nalezené dovednosti. Náhled ukazuje počet a velikost souborů, zda obsahují skripty, webové adresy v textu a soubor s licencí.
4. Zaškrtněte jen dovednosti, které chcete nainstalovat, a klikněte na **Nainstalovat**. Nainstalované dovednosti jsou hned zapnuté.

Pod náhledem je vždy uvedeno: „Instalujte dovednosti jen ze zdrojů, kterým důvěřujete. Dovednost dává AI pokyny a v okně agenta může spouštět skripty“. Dovednost z neznámého zdroje si před instalací přečtěte.

- Pokud už mezi mými dovednostmi je jedna se stejným názvem, zvolte na tom řádku **Nahradit** nebo **Přeskočit**.
- Při stahování z GitHubu se GenOffice připojuje jen k `github.com`, `api.github.com` a `codeload.github.com` a neposílá žádné přihlašovací údaje. Pokud je archiv příliš velký nebo neprojde bezpečnostními kontrolami, nic se nenainstaluje.
- **Nová dovednost** otevře prázdný editor, do kterého sami napíšete jméno, popis a pokyny.

## Kontrola aktualizací

- U dovednosti nainstalované z GitHubu hledá **Zkontrolovat aktualizace** v nabídce dalších akcí nový obsah. GitHub se kontaktuje jen tehdy, když na to kliknete.
- Pokud se nic nezměnilo, zobrazí se „Aktuální“. Pokud se něco změnilo, prohlédněte si změněné soubory a náhled a klikněte na **Aktualizovat**.
- Pokud jste dovednost po instalaci sami upravili, zobrazí se také „Vaše úpravy budou ztraceny“.
- Aktualizace zachová zapnutí či vypnutí dovednosti i volbu mezi Rozhoduje AI a Jen na vyvolání.

## Vyvolání dovednosti v panelu AI

1. Napište `/` nebo `$` na začátek vstupního pole AI nebo hned za mezeru. Objeví se seznam zapnutých dovedností.
2. Pište dál a seznam se zúží. Například `/meet` najde `meeting-minutes`. Fungují i slova z popisu, takže stačí i `/záp`.
3. Vyberte dovednost šipkami a stiskněte Enter nebo Tab. Dovednost se stane štítkem nad vstupním polem.
4. Napište, co chcete, a odešlete. GenOffice k žádosti přidá obsah dovednosti.

- V panelu AI Excelu otevírá `$` seznam jen na úplném začátku vstupního pole, aby nepřekážel v adresách buněk jako `$A$1`.
- Můžete přidat více štítků a jeden odebrat pomocí ×. Esc jen zavře seznam; běh AI nezastaví.
- **Spravovat dovednosti…** dole v seznamu otevře **Nastavení ▸ Dovednosti**.
- Štítky zůstávají u odeslané zprávy i v uloženém rozhovoru. Když rozhovor znovu otevřete a znovu odešlete, aktuální obsah dovednosti se načte znovu. Dovednost, která byla mezitím odebrána nebo vypnuta, má na štítku „Nedostupné“.
- Pokud je text dovedností k odeslání příliš dlouhý, zobrazí se „Dovednosti jsou příliš velké, než aby se odeslaly spolu“ a nic se neodešle.

## Dovednosti, které AI použije samo

- Jména a popisy zapnutých dovedností nastavených na Rozhoduje AI dostane AI jako seznam. Když některá odpovídá žádosti, AI si vezme její obsah a použije ji.
- Když AI dovednost použije, v rozhovoru se zobrazí „Použita dovednost 〈jméno〉“.
- AI se podle popisu rozhoduje, zda dovednost použít. Popis, který říká, kdy je dovednost určena k použití, mu pomůže dobře vybrat.

## Vytvoření dovednosti na požádání

1. V panelu AI napište například „Ulož to, co jsme právě udělali, jako dovednost“ nebo „Vytvoř dovednost, která píše zprávy v našem firemním stylu“.
2. AI vybere kroky a pravidla, která se vyplatí opakovat, a zobrazí kartu **Nová dovednost**. Hodnoty použité jen tentokrát, jako jména a data, do pokynů nepatří.
3. Zkontrolujte a upravte na kartě jméno, popis a pokyny. Jméno se zobrazuje v seznamu dovedností a píšete ho za `/`: malá anglická písmena, číslice a spojovníky.
4. Klikněte na **Uložit**. Nová dovednost se přidá do mých dovedností, zapne se a hned se objeví v seznamu `/`.

- Dokud nekliknete na **Uložit**, žádný soubor se nezapíše. Pokud kliknete na **Zrušit**, rozhovor ji ponechá jen jako „Neuložený návrh dovednosti“.
- Můžete také požádat o změnu existující dovednosti, například „Uprav dovednost pro zápisy tak, jak to děláme my“. Karta se pak jmenuje **Změnit dovednost**. Jedna z mých dovedností se přepíše tlačítkem **Nahradit**; vestavěná dovednost nebo dovednost z jiného programu se uloží jako kopie do mých dovedností a originál se vypne.

## Přidání dokumentu jako šablony

Když vytváříte dovednost v panelu AI editoru, může s ní jako šablona jít i aktuální dokument. Zaškrtněte na kartě **Uložit i tento dokument jako šablonu** a z tlačítka budou dvě.

- **Vytvořit prázdnou šablonu**: kopie dokumentu se otevře na nové kartě „Náhled šablony - 〈nadpis〉“ a AI na této kartě vyprázdní vyplněné hodnoty, jako jsou jména, data a osobní údaje. Kartu si prohlédněte, další věci upravte ručně a pak klikněte na **Uložit tuto kartu jako šablonu**; šablonou se stane karta v podobě, jakou má v tu chvíli.
- **Uložit dokument tak, jak je**: uloží aktuální dokument jako šablonu beze změny. Pokud má dokument části, které jste před AI skryli, je toto tlačítko zablokované, aby se skrytý obsah nedostal do šablony tak, jak je.
- Šablona se uchovává jako kopie dokumentu ve složce dovednosti. Původní dokument se nemění.

## Použití dovednosti se šablonou

- Dovednost se šablonou má v seznamu označení **Obsahuje šablonu**.
- Vyvolejte ji jako štítek a odešlete: kopie šablony se otevře jako nový dokument bez názvu a AI na té kartě pokračuje ve vaší žádosti. V původním panelu zůstane „Práce se šablonou pokračuje na nové kartě“ a **Přejít na kartu**.
- Když AI vybere dovednost se šablonou samo, karta se hned neotevře. Rozhovor místo toho ukáže tlačítko **Otevřít nový dokument z této šablony**.
- Kam se nový dokument uloží, obvykle zvolíte při prvním uložení. Editory Markdown a HTML ale ukládají do výchozí složky jako vždy. Samotný soubor šablony zůstává beze změny.

## Dovednosti se skripty

- V běžném panelu AI a v Ask AI na stránce Domů se skripty dovednosti nikdy nespouštějí. K AI se dostane jen text dovednosti.
- Dovednost se skripty má označení **Obsahuje skripty · plně funguje v okně agenta** a po jejím přidání jako štítku se zobrazí „Skripty této dovednosti se v běžném panelu AI nespouštějí“. Odeslání se neblokuje.
- Chcete-li použít i skripty, vyvolejte dovednost v okně agenta. Viz [Režim agenta](help://agent-mode).

## Vestavěné dovednosti

| Dovednost         | Co dělá                                                                         |
| ----------------- | ------------------------------------------------------------------------------- |
| `meeting-minutes` | Udělá z poznámek z porady zápis s rozhodnutími a úkoly                          |
| `internal-comms`  | Píše oznámení, zpravodaje, zprávy o postupu, časté dotazy a další interní texty |
| `humanizer`       | Najde obraty, které působí jako psané AI, a upraví je přirozeně                 |
| `copy-editing`    | Projde anglický text, který jste napsali, a udělá ho jasnějším a stručnějším    |
| `find-skills`     | Najde v okně agenta dovednosti, které potřebujete, a navrhne jejich instalaci   |

`copy-editing` je určena pro anglické marketingové texty. `find-skills` funguje jen v okně agenta.

## V okně agenta

- Okno agenta se řídí stejným zapnutím a vypnutím v **Nastavení ▸ Dovednosti** a dovednosti v jeho vstupním poli vyvoláváte stejně, pomocí `/` nebo `$`.
- Dovednosti v `.claude/skills` a `.agents/skills` složky projektu se v dané relaci použijí, aniž by je bylo třeba zapnout.
- Seznam dovedností se ustálí při zahájení relace. Pokud během relace dovednosti zapnete nebo vypnete, zobrazí se „Změněné dovednosti platí od další relace“.
- Když agent vytvoří dovednost, objeví se v okně stejná karta. Jako šablonu vyberte některý z dokumentů otevřených na kartách nebo soubor ve složce projektu.
- Když agent najde dovednost, kterou se vyplatí nainstalovat, objeví se návrh instalace. Otevřete ho pomocí **Otevřít náhled** a na **Nainstalovat** klikněte sami; jinak se nic nenainstaluje. Nainstalovaná dovednost je k dispozici od další relace.
