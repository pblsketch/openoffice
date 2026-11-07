# Instalace GenOffice

Každá verze je zveřejněna na [stránce Releases](https://github.com/pblsketch/openoffice/releases/latest) projektu na GitHubu. Verze pro Windows vychází spolu s verzemi pro Mac a Linux, které vycházejí jako beta. Verze pro Mac a Linux vývojář nemůže přímo testovat; potvrzují se hlášeními uživatelů.

## Vyberte soubor pro svůj počítač

| Platforma                              | Požadavky                                   | Soubor                            |
| -------------------------------------- | ------------------------------------------- | --------------------------------- |
| **Windows**                            | Windows 10 nebo novější, 64bitový Intel/AMD | `GenOffice-Setup-<version>.exe`   |
| **Mac (beta)**, Apple Silicon          | macOS 12 nebo novější, čip M1 nebo novější  | `GenOffice-<version>-arm64.dmg`   |
| **Mac (beta)**, Intel                  | macOS 12 nebo novější, procesor Intel       | `GenOffice-<version>-x64.dmg`     |
| **Linux (beta)**, libovolná distribuce | 64bitový (x86_64)                           | `GenOffice-<version>.AppImage`    |
| **Linux (beta)**, rodina Ubuntu/Debian | 64bitový (x86_64)                           | `ieumoffice_<version>_amd64.deb`  |
| **Linux (beta)**, Fedora/RHEL/openSUSE | 64bitový (x86_64)                           | `ieumoffice-<version>.x86_64.rpm` |

Chcete-li zjistit, jaký máte Mac, otevřete nabídku Apple ▸ **O tomto Macu**. Pokud je u položky „Čip“ uvedeno Apple M…, vezměte soubor končící na `-arm64.dmg`; pokud je u položky „Procesor“ uvedeno Intel …, vezměte soubor končící na `-x64.dmg`. Ostatní soubory na stránce Releases (`.zip`, `.yml`, `.blockmap`) používá k aktualizaci sama aplikace; stahovat je nemusíte. Starší verze zůstávají na stránce Releases.

## V systému Windows

1. Stáhněte soubor `GenOffice-Setup-<version>.exe` ze stránky Releases.
2. Spusťte ho. Instalátor není digitálně podepsaný, takže Windows může nejprve zobrazit modré okno „Systém Windows ochránil váš počítač“. Zvolte **Další informace** a potom **Přesto spustit**. Přesné znění závisí na verzi Windows.
3. Projděte instalátor až do konce.

Instalátor umístí GenOffice do nabídky Start a zaregistruje `.docx`, `.xlsx`, `.pptx`, `.pdf` a podobné, takže dvojklik na soubor jej otevře.

Protože instalátor není podepsaný, spouštějte jen ten, který jste stáhli z výše uvedené stránky Releases.

## Když Windows zablokuje stažení nebo instalaci

### Edge hlásí, že soubor „se obvykle nestahuje“

Microsoft Defender SmartScreen takto varuje před souborem, který zatím stáhlo jen málo lidí. Podle návodu Microsoftu soubor zachováte takto:

1. Otevřete seznam stahování v Edge (**Ctrl+J**), stiskněte vedle souboru **…** a zvolte **Zachovat**.
2. V okně, které se otevře, stiskněte **Zobrazit více** a potom **Přesto zachovat**. Soubor zůstane ve složce Stažené soubory.

V tomto okně je také tlačítko, které soubor nahlásí jako bezpečný. Jen otevře stránku Microsoftu pro hlášení (`feedback.smartscreen.microsoft.com`) a soubor nezachová. Tu stránku zavřete a místo toho v okně stiskněte **Zobrazit více**.

Pokud v okně chybí **Zobrazit více** nebo **Přesto zachovat**:

- Na počítači, který spravuje škola nebo firma, může správce přeskakování těchto varování vypnout (zásada Edge). Pak soubor na tomto počítači nezachová nikdo; požádejte správce, aby aplikaci nainstaloval nebo ji povolil.
- Když soubor stáhnete ze stránky Releases v jiném prohlížeči, získáte stejný soubor.
- Pokud nepomůže ani jedno a jde o váš vlastní počítač, návod Microsoftu k řešení potíží se stahováním dovoluje jako poslední možnost Microsoft Defender SmartScreen na chvíli vypnout. V Edge otevřete **Nastavení a další (…) ▸ Nastavení ▸ Ochrana osobních údajů, vyhledávání a služby ▸ Zabezpečení**, vypněte **Microsoft Defender SmartScreen**, stáhněte soubor znovu a hned ochranu zase zapněte. Dokud je vypnutá, Edge vás nevaruje ani před stahováním, ani před nebezpečnými weby, jako jsou phishingové stránky.

### Zobrazí se okno „Systém Windows ochránil váš počítač“

Microsoft Defender SmartScreen zobrazí toto okno, když poprvé vidí nepodepsaný instalátor. Stiskněte **Další informace** a objeví se tlačítko **Přesto spustit**. Na počítači, který spravuje škola nebo firma, může toto tlačítko skrýt nastavení správce; obraťte se na správce.

### Blokuje ho inteligentní ovládání aplikací

Když je ve Windows 11 zapnuté inteligentní ovládání aplikací (Smart App Control), zastavuje nepodepsané instalátory a nenabízí cestu přes **Další informace**. Microsoft uvádí, že jednu aplikaci povolit nelze: jedinou možností je inteligentní ovládání aplikací vypnout, a to v **Zabezpečení Windows ▸ Ovládání aplikací a prohlížeče ▸ Nastavení inteligentního ovládání aplikací**. Tím tuto ochranu odeberete i všem ostatním aplikacím. S nejnovějšími aktualizacemi Windows ho lze znovu zapnout bez přeinstalace Windows.

## Na Macu (beta)

Potřebujete macOS 12 (Monterey) nebo novější. Verze pro Mac nemá vývojářský podpis Apple, takže při prvním otevření macOS oznámí, že nemůže ověřit, zda aplikace neobsahuje malware, a neotevře ji. Povolíte ji jednou, jak je uvedeno níže.

1. Otevřete soubor dmg a přetáhněte `GenOffice.app` do složky **Aplikace**.
2. Otevřete GenOffice ze složky Aplikace. Když se objeví varování, stiskněte **Hotovo**.
3. Otevřete **Nastavení systému ▸ Soukromí a zabezpečení**. Dole vedle řádku, který říká, že GenOffice byl zablokován, stiskněte **Přesto otevřít** a zadejte heslo k Macu. Tlačítko se zobrazuje asi hodinu od chvíle, kdy jste se aplikaci pokusili otevřít.
4. V okně, které se znovu objeví, stiskněte **Otevřít**. Od té doby se otevírá bez varování.

V macOS 12 je to místo **Předvolby systému ▸ Zabezpečení a soukromí ▸ Obecné** a tlačítko je tam také **Přesto otevřít**.

Pokud macOS hlásí, že aplikace „je poškozená a nelze ji otevřít“, nepřesouvejte ji do Koše. Spusťte v Terminálu řádek níže, potom aplikaci znovu otevřete a povolte ji jako výše. Odstraní značku, kterou macOS připojuje k souborům staženým z internetu.

```sh
xattr -dr com.apple.quarantine /Applications/GenOffice.app
```

Pokud macOS hlásí, že aplikace na tomto Macu není podporována, zkontrolujte dvě věci:

- Mac s procesorem Intel nedokáže spustit soubor pro Apple Silicon (`-arm64.dmg`). Podívejte se na „Procesor“ v okně **O tomto Macu**, nainstalovanou aplikaci smažte a místo ní nainstalujte soubor `-x64.dmg`.
- V macOS 11 nebo starším GenOffice nespustíte. Verzi macOS také ukazuje **O tomto Macu**.

Dále na Macu:

- Karty připojení AI nemají tlačítko instalace. Claude Code nebo Codex nainstalujete podle odkazu na oficiální návod k instalaci na kartě. Desktopová aplikace Claude není Claude Code, takže Claude Code je potřeba nainstalovat zvlášť, i když desktopovou aplikaci už máte.
- Přihlášení se dokončí v prohlížeči. Pokud vás prohlížeč požádá o vložení kódu, spusťte sami v Terminálu `claude auth login` nebo `codex login`. Viz [Připojení předplatného](help://subscription).

## V Linuxu (beta)

- **AppImage**: nastavte mu právo ke spuštění (`chmod +x GenOffice-<version>.AppImage`) a soubor spusťte. Žádný krok instalace není.
- **deb**: nainstalujte příkazem `sudo apt install ./ieumoffice_<version>_amd64.deb`.
- **rpm**: nainstalujte příkazem `sudo dnf install ./ieumoffice-<version>.x86_64.rpm`. V openSUSE použijte `sudo zypper install ./ieumoffice-<version>.x86_64.rpm`.

Balíčky deb a rpm se instalují do `/opt/GenOffice` a propojují příkaz terminálu `/usr/bin/ieumoffice`. Stejně jako na Macu nemají karty připojení AI tlačítko instalace, a když přihlášení požádá o kód, spustíte sami v terminálu `claude auth login` nebo `codex login`.

## Aktualizace

- GenOffice hledá novější verzi na stejné stránce Releases na GitHubu. Jakmile je nějaká zveřejněna, nabídne ji **Nastavení ▸ O aplikaci**: stiskněte **Aktualizovat na …**, počkejte na stažení a potom stiskněte **Restartovat a nainstalovat**. Ve Windows se zobrazí okno s průběhem instalace; po dokončení se GenOffice znovu otevře i s dokumenty, které jste měli otevřené. Na Macu se aplikace zavře, nahradí se novou verzí a znovu se otevře s dokumenty, které jste měli otevřené. Platí to pro aplikaci ve složce Aplikace; aplikace otevřená přímo z obrazu disku místo toho odkáže na stránku pro stažení. Aktualizace se nainstaluje jen po stisknutí tohoto tlačítka, nikdy při pouhém zavření aplikace.
- V Linuxu se sama aktualizuje jen AppImage. U instalace z deb nebo rpm vás aplikace na novou verzi upozorní a otevře stránku pro stažení; nový soubor nainstalujte stejným způsobem.
- **Nabídka (☰) ▸ Zkontrolovat aktualizace…** provede kontrolu, kdykoli o ni požádáte. Na počítači Mac je to **Nápověda ▸ Zkontrolovat aktualizace…**.
- Když kontrola selže — chybí síť, nebo ještě nic nebylo zveřejněno — nic se nestane a aplikace funguje dál jako dosud.
- **Kanál aktualizací**, rovněž v Nastavení ▸ O aplikaci, je Stabilní nebo Beta. Změna se projeví ihned a vyvolá kontrolu aktualizace; instalaci z kanálu Beta nevrátí zpět na Stabilní.
- Ani aktualizace nejsou digitálně podepsané. Před instalací aplikace porovná stažený soubor s kontrolním součtem zveřejněným u daného vydání.
- Pokud **Restartovat a nainstalovat** aplikaci zavře, ale nová verze se neobjeví, při dalším spuštění to aplikace oznámí a nabídne aktualizaci znovu. Tentokrát se instalátor otevře ve vlastním okně, takže uvidíte jeho průběh a můžete odpovědět na žádost o oprávnění správce. Pokud ani to nepomůže, okno aktualizace odkáže na stránku pro stažení; instalace ze souboru staženého odtud zachová vaše nastavení i dokumenty. Co aktualizace udělala, se zapisuje do `update-log.txt` ve složce dat aplikace (zadejte `%APPDATA%\GenOffice` do adresního řádku Průzkumníka souborů a otevře se). Při hlášení problému tento soubor přiložte.

## Sestavení, které právě běží

**Nastavení ▸ O aplikaci** je místo, kde aplikace oznamuje verzi, kterou máte, kanál, který sleduje, a kde projekt sídlí. Uvádí také open-source projekt, na kterém je tato aplikace založena.

## Příkazová řádka je součástí

Každá instalace obsahuje příkaz `ieumoffice`, který mluví se stejnými enginy jako okno, takže se oba na souboru vždy shodnou. `ieumoffice install-cli` jej umístí do vaší `PATH`. Co umí, se dozvíte v kapitole [Příkazová řádka a agenti](help://cli).
