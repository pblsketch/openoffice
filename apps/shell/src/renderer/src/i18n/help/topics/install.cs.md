# Instalace GenOffice

Každá verze je zveřejněna na [stránce Releases](https://github.com/pblsketch/openoffice/releases/latest) projektu na GitHubu. Tato verze vychází pro Windows.

## Vyberte soubor pro svůj počítač

| Platforma   | Požadavky                                   | Soubor                          |
| ----------- | ------------------------------------------- | ------------------------------- |
| **Windows** | Windows 10 nebo novější, 64bitový Intel/AMD | `GenOffice-Setup-<version>.exe` |

Starší verze zůstávají na stránce Releases.

## V systému Windows

1. Stáhněte soubor `GenOffice-Setup-<version>.exe` ze stránky Releases.
2. Spusťte ho. Instalátor není digitálně podepsaný, takže Windows může nejprve zobrazit modré okno „Systém Windows ochránil váš počítač“. Zvolte **Další informace** a potom **Přesto spustit**. Přesné znění závisí na verzi Windows.
3. Projděte instalátor až do konce.

Instalátor umístí GenOffice do nabídky Start a zaregistruje `.docx`, `.xlsx`, `.pptx`, `.pdf` a podobné, takže dvojklik na soubor jej otevře.

Protože instalátor není podepsaný, spouštějte jen ten, který jste stáhli z výše uvedené stránky Releases.

## Aktualizace

- GenOffice hledá novější verzi na stejné stránce Releases na GitHubu. Jakmile je nějaká zveřejněna, nabídne ji **Nastavení ▸ O aplikaci**: stiskněte **Aktualizovat na …**, počkejte na stažení a potom stiskněte **Restartovat a nainstalovat**.
- **Nabídka (☰) ▸ Zkontrolovat aktualizace…** provede kontrolu, kdykoli o ni požádáte. Na počítači Mac je to **Nápověda ▸ Zkontrolovat aktualizace…**.
- Když kontrola selže — chybí síť, nebo ještě nic nebylo zveřejněno — nic se nestane a aplikace funguje dál jako dosud.
- **Kanál aktualizací**, rovněž v Nastavení ▸ O aplikaci, je Stabilní nebo Beta. Změna se projeví ihned a vyvolá kontrolu aktualizace; instalaci z kanálu Beta nevrátí zpět na Stabilní.
- Ani aktualizace nejsou digitálně podepsané. Před instalací aplikace porovná stažený soubor s kontrolním součtem zveřejněným u daného vydání.

## Sestavení, které právě běží

**Nastavení ▸ O aplikaci** je místo, kde aplikace oznamuje verzi, kterou máte, kanál, který sleduje, a kde projekt sídlí. Uvádí také open-source projekt, na kterém je tato aplikace založena.

## Příkazová řádka je součástí

Každá instalace obsahuje příkaz `ieumoffice`, který mluví se stejnými enginy jako okno, takže se oba na souboru vždy shodnou. `ieumoffice install-cli` jej umístí do vaší `PATH`. Co umí, se dozvíte v kapitole [Příkazová řádka a agenti](help://cli).
