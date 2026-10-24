# Připojení předplatného

GenOffice používá AI přes předplatné, které už máte: předplatné Claude (Anthropic) nebo předplatné Codex (OpenAI). Codex je program společnosti OpenAI a přihlašujete se do něj svým tarifem ChatGPT. Nepotřebujete klíč API a GenOffice nemá žádný vlastní účet, který byste si museli zakládat.

## Jak to funguje

- AI není součástí GenOffice. V tomto počítači je nainstalován program dané společnosti — **Claude Code** pro předplatné Claude, **Codex** pro předplatné ChatGPT — a GenOffice si o odpověď říká tomuto programu.
- Program je přihlášen vaším vlastním účtem, takže se každý požadavek počítá do vašeho vlastního tarifu.
- GenOffice nikdy nezobrazuje vlastní přihlašovací formulář a vaše přihlašovací údaje nikdy nečte ani neukládá. Přihlašujete se přímo v programu a na webové stránce dané společnosti.

## Než začnete

Potřebujete jedno z následujícího. Můžete mít i obojí.

- Předplatné Claude (tarif Pro nebo Max; bezplatný účet Claude se připojit nedá) a program Claude Code nainstalovaný a přihlášený v tomto počítači.
- Předplatné ChatGPT a program Codex nainstalovaný a přihlášený v tomto počítači.

Pokud program ještě není nainstalovaný nebo přihlášený, postarají se o to tlačítka popsaná v další části.

## Připojení

1. Otevřete **Nastavení** z řádku vlevo dole na domovské stránce a zvolte **AI**. V části **Připojení předplatného** je jedna karta pro Claude a jedna pro Codex.
2. Přečtěte si, co karta říká, a stiskněte její tlačítko. Jednotlivé stavy vysvětluje tabulka níže.
3. Vraťte se do okna GenOffice. Karta provede kontrolu znovu sama a tlačítko **Zkontrolovat znovu** ji spustí hned.

Ve druhém kroku uvítacích obrazovek při prvním spuštění a v panelu AI, když není připojena žádná AI, se nejprve zobrazí otázka „Jakou AI už používáte?“. Zvolte placené předplatné Claude, ChatGPT, nebo „zatím žádnou“, a uvidíte jen kroky této cesty (Instalace programu → Přihlášení → Připojeno) a její jedinou kartu. Tlačítkem **Zvolit jiný způsob** můžete volit znovu a vše můžete přeskočit a připojit se později. Pokud se ani tak nepřipojíte, stiskněte **Kopírovat informace pro pomoc** a zkopírovaný obsah pošlete tomu, kdo vám pomáhá. Neobsahuje účet ani cesty k souborům.

| Co karta říká                          | Co to znamená                                                                                                       | Co udělat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Probíhá kontrola…**                  | GenOffice se programu ptá, v jakém je stavu.                                                                        | Chvíli počkejte.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Není nainstalováno**                 | Program nebyl v tomto počítači nalezen.                                                                             | Stiskněte **Nainstalovat**. Oficiální instalační příkaz dané společnosti se spustí v novém okně terminálu, takže vidíte, co dělá. GenOffice sám nic nestahuje. Chcete-li instalovat ručně, tlačítko **Oficiální návod k instalaci** otevře pokyny dané společnosti.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Nepřihlášeno**                       | Program je nainstalovaný, ale není v něm nikdo přihlášen.                                                           | Stiskněte **Přihlásit se**. V prohlížeči se otevře přihlašovací stránka dané společnosti: přihlaste se tam a povolte přístup, karta se pak připojí sama. Nespěchejte, přihlášení může chvíli trvat. Pokud se prohlížeč vůbec neotevře, stiskněte na kartě **Prohlížeč se neotevřel?** (po 25 sekundách se změní na tlačítko **Otevřít přihlašovací okno**). Dokud se v prohlížeči ještě přihlašujete, nepoužívejte ho: rozpracované přihlášení by se zastavilo a začalo znovu od začátku. V horní části otevřeného přihlašovacího okna je postupně vypsáno, co udělat. Chcete-li do něj vložit kód, klikněte pravým tlačítkem myši uvnitř okna a pak stiskněte Enter. Je normální, že se vložený kód nezobrazí; pokud se objeví "Invalid code", vložte kód znovu do stejného okna. Přihlašování ukončíte tlačítkem **Zrušit přihlášení**. |
| **Připojeno**                          | Bylo potvrzeno přihlášení přes předplatné. Název tarifu se zobrazí, pokud ho program hlásí.                         | Nic. AI je připravena k použití.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Přihlášeno, ale ne přes předplatné** | Program je přihlášen klíčem API nebo účtem s platbou podle spotřeby, případně se typ přihlášení nepodařilo zjistit. | Viz „Přihlášení s platbou podle spotřeby“ níže.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Připojení se nepodařilo ověřit**     | Selhala samotná kontrola. Důvod je uveden na kartě.                                                                 | Stiskněte **Zkontrolovat znovu**. Pokud karta hlásí, že je program příliš starý, stiskněte **Aktualizovat**: oficiální aktualizace společnosti se spustí v novém okně. Až tam skončí, vraťte se do GenOffice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Připojení se kontroluje při spuštění aplikace, při otevření Nastavení a při návratu do okna poté, co jste spustili instalaci nebo přihlášení.

## Bez předplatného: AI zdarma

Nemáte předplatné Claude ani ChatGPT? V Nastavení ▸ AI můžete v části **Používat zdarma** připojit místo toho bezplatnou AI. Když ve druhém kroku uvítacích obrazovek zvolíte **Zatím žádnou**, zobrazí se stejné karty, a pokud tuto možnost zvolíte v panelu AI ve chvíli, kdy není nic připojeno, panel nabídne **Připojit bezplatnou AI**.

- **OpenRouter**: stiskněte **Připojit v prohlížeči**. V prohlížeči se otevře OpenRouter; zaregistrujte se nebo se přihlaste a povolte přístup. Až prohlížeč ohlásí, že je připojeno, zavřete kartu prohlížeče a vraťte se. Žádný klíč není třeba kopírovat a karta v GenOffice ukazuje, kolik bezplatných požadavků dnes zbývá.
- **Google Gemini**: stiskněte **Získat klíč**, vytvořte klíč v Google AI Studio, vložte ho do karty a stiskněte **Připojit**. Jen pro osoby od 18 let. Klíč vytvořený v projektu Google se zapnutou fakturací může být zpoplatněn.
- Po připojení se tato AI nastaví jako **Používaná AI**. Když jsou připojené obě, přepínáte mezi nimi tlačítkem **Použít tuto AI** na kartě. **Odpojit** odstraní klíč z GenOffice.
- Bezplatné modely jsou slabší než modely v předplatném a počet požadavků za den je omezený. Jedna úprava dokumentu jich může spotřebovat několik. Když je dnešní limit vyčerpán, panel AI to oznámí a uvede, kdy ji půjde znovu použít.
- Dokud ji používáte zdarma, může být to, co odešlete, použito ke zlepšování AI dané společnosti. Buďte opatrní u dokumentů s osobními údaji.

## Přihlášení s platbou podle spotřeby

Karta se stavem **Přihlášeno, ale ne přes předplatné** obsahuje varování: „Toto není předplatné: platíte podle skutečné spotřeby.“

- GenOffice toto přihlášení nepoužije, dokud nestisknete **Přesto použít**. Od té chvíle se každý požadavek účtuje tomuto účtu.
- Ani potom se nikdy nevybere automaticky. Zvolte ho sami v nabídce **Používaná AI**, kde je označeno jako **Placené**.
- Váš souhlas se pamatuje jen pro tento program. Zruší se, když se program odhlásí nebo se jeho přihlášení změní.
- Chcete-li místo toho používat předplatné, přihlaste program účtem s předplatným a stiskněte **Zkontrolovat znovu**.

## Změna účtu a odhlášení

Když je program přihlášený, jeho karta ukazuje vedle názvu tarifu účet, kterým je přihlášený, pokud ho program hlásí. Má také dvě tlačítka.

- **Přihlásit se jiným účtem** znovu spustí přihlášení samotného programu. Dokončete ho v okně, které se otevře, druhým účtem.
- **Odhlásit se** spustí odhlášení samotného programu. Karta pak ukazuje **Nepřihlášeno**.
- Obojí platí pro daný program v celém tomto počítači, nejen pro GenOffice. Pokud Claude Code nebo Codex používáte i v terminálu, odhlásí se nebo přejde na druhý účet i tam. GenOffice si proto nejdřív vyžádá potvrzení.
- Účet a tato dvě tlačítka jsou jen tady, v Nastavení ▸ AI. GenOffice účet jen zobrazuje a nikam ho neukládá.

## Která AI se používá

Volba **Používaná AI** v Nastavení ▸ AI je zpočátku nastavena na **Automaticky**. Automatický režim rozhoduje v tomto pořadí:

1. Claude, pokud jeho karta hlásí Připojeno.
2. Jinak Codex, pokud jeho karta hlásí Připojeno.
3. Jinak není připojena žádná AI a panel AI místo chyby zobrazí průvodce připojením.

Automatický režim nikdy nevybere nic, co stojí peníze navíc: ani klíč API, ani přihlášení s platbou podle spotřeby. Ty se používají jen tehdy, když je zvolíte sami.

Jednu AI si můžete zvolit i sami, na stejném místě nebo v seznamu modelů ve spodní části panelu AI. Pokud vámi zvolená AI přestane fungovat, GenOffice potichu nepřejde na jinou. Oznámí, co se stalo, a ukáže, jak se znovu připojit.

Seznam modelů ukazuje modely, které hlásí sám program: každý s názvem a vedle něj s přesným identifikátorem, a u položky **Výchozí model** je uvedeno, kterému modelu právě odpovídá. Tento model uvádí i štítek dole v panelu AI a volba **Používaná AI**. Načtení seznamu se AI na nic neptá, takže se nezapočítává do vašeho tarifu. Pokud je program příliš starý na to, aby své modely hlásil, zobrazí se místo toho krátký vestavěný seznam.

Všude, kde lze zvolit Codex, je u něj uveden jeden řádek: „Používání předplatného Codex uvnitř aplikace není způsob, který OpenAI oficiálně doporučuje.“ Při rozhodování na to pamatujte.

## Když se požadavek zastaví

Požadavek se zastaví, když je vyčerpán limit tarifu, když vypršelo přihlášení nebo když program už v počítači není. GenOffice sám na jinou AI nepřepne.

- Důvod je uveden v místě, kde se odpověď zastavila. U vyčerpaného limitu je uveden i čas, kdy se obnoví, pokud ho program hlásí.
- Je-li připojeno vaše druhé předplatné, objeví se tlačítko **Pokračovat s …**, například **Pokračovat s Codex**. Jeho stisknutím se z něj stane používaná AI — změnu ukáže seznam modelů — a požadavek se spustí znovu.
- Je-li jediným dalším připojením přihlášení s platbou podle spotřeby, které jste povolili, je u stejného tlačítka poznámka o nákladech.
- Nikdy se nezobrazí tlačítko, které by vás převedlo na klíč API.

## Řádek využití

Jakmile využijete 80 % limitu nebo více, zobrazí panel AI řádek jako „Využito 85 % · obnoví se v 15:00“. Claude hlásí 5hodinový a 7denní limit a Codex se zobrazuje stejně, pokud je hlásí. Pod 80 %, nebo když program nic nehlásí, se žádný řádek nezobrazí.

## Co se odesílá a kam

Když lze předplatné použít poprvé, zobrazí GenOffice jednorázové upozornění. Chcete-li si ho přečíst znovu, přejděte do Nastavení ▸ AI ▸ **Upozornění při prvním připojení** a stiskněte **Zobrazit znovu**. Říká tři věci:

- Obsah dokumentu a konverzace se odesílají společnosti Anthropic nebo OpenAI pod vaším vlastním účtem.
- Zda se tento obsah použije k trénování AI, určuje nastavení vašeho účtu u dané společnosti, nikoli GenOffice.
- GenOffice vypíná ukládání historie konverzací v Codexu, Codex však může v tomto počítači dál uchovávat vlastní diagnostické protokoly.

Co jste skryli příkazem **Skrýt výběr před AI**, se neodesílá, ať už používáte kteroukoli AI.

## Dobré vědět

- **Rychlost.** Odpověď přes předplatné začne o několik sekund později než odpověď přes klíč API, protože se nejdřív musí spustit program dané společnosti.
- **Bezplatný tarif ChatGPT.** Zobrazuje se jako Připojeno, ale má malé limity, takže se požadavky zastaví dřív. Řádek využití se u něj nezobrazuje.
- **Generování obrázků.** V této verzi předplatné obrázky negeneruje, a to v žádném tarifu. K tomu je potřeba klíč poskytovatele obrázků; viz [Modely AI a nastavení](help://ai-models).
- **Proxy.** Claude Code a Codex nepřebírají nastavení proxy z GenOffice. Používají proxy nastavenou pro tento počítač, například proměnnou prostředí `HTTPS_PROXY`, stejně jako když je spustíte v terminálu. Pokud se nepřipojí v terminálu, nepřipojí se ani odsud.
- **Příkazy a jiné programy.** Požadavek, který přijde z příkazu `ieumoffice` nebo od připojeného programového agenta, vaše předplatné nepoužije, dokud to nepovolíte. Viz [Připojení programového agenta](help://mcp).
