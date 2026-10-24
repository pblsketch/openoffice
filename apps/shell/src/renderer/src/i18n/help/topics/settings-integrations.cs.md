# Nastavení, jazyk, motiv a integrace MCP

## Otevření nastavení

Řádek vlevo dole na domovské stránce otevře panel nastavení (dokud není připojena žádná AI, ukazuje Připojit AI). Má pět částí: Účet, AI, Obecné, Integrace a O aplikaci.

**Účet** ukazuje, jak jsou na tom vaše předplatná Claude a Codex, a **Spravovat připojení** vás zavede do části AI. AI má vlastní kapitoly: [Připojení předplatného](help://subscription) a [Modely AI a nastavení](help://ai-models).

## Jazyk

- Nastavení nabízí **21 jazyků rozhraní**: angličtina, zjednodušená čínština, japonština, korejština, francouzština, němčina, španělština, thajština, indonéština, ruština, arabština, portugalština, italština, polština, čeština, nizozemština, malajština, hebrejština, hindština, tradiční čínština, vietnamština.
- Změna působí okamžitě a zůstává zachována; nativní pruh nabídek se znovu sestaví v novém jazyce.

## Motiv

Světlý / Tmavý / Podle systému. Volba Podle systému sleduje vzhled operačního systému a editory se přeoblekují současně bez blikání.

## Obecné

- **Pozice postranního panelu AI** (vlevo nebo vpravo), **Velikost textu panelu AI** a **Kontrola pravopisu v chatu AI**.
- **Otevírat panel AI v nových dokumentech** — vypnuto, nový dokument začíná se složeným panelem, na jedno kliknutí.
- **Automaticky ukládat všechny dokumenty** zapne ve výchozím stavu automatické ukládání v každém editoru; pro jedno okno ho můžete i nadále vypnout.
- **Umístění pro ukládání** s tlačítkem **Změnit** a **Výchozí aplikace pro dokumenty Office**, aby GenOffice přebíral .docx / .xlsx / .pptx.

GenOffice neshromažďuje ani neodesílá statistiky používání, takže pro ně není žádný přepínač.

## AI ▸ Pokročilé

Tato část je sbalená, dokud ji neotevřete; většina lidí ji nikdy nepotřebuje. Karta **Model AI** obsahuje klíče API a servery, které provozujete sami, pro chat. Na kartě **AI média a vyhledávání** si každá schopnost vybere dodavatele, který ji poskytuje, a klíč i základní URL dodavatele se zadávají jednou a sdílejí se:

- **Webové vyhledávání**, **Generování obrázků**, **Analýza obrázků** a **Analýza videí**, každá s poskytovatelem, modelem, klíčem a základní URL.
- **Lokální hledání souborů** běží na tomto stroji. Pod ním je **Jev přeřazení výsledků** ve výchozím stavu **vypnuté**. Zapnete-li ho, výtahy top 20 lokálních zásahů — až 1 200 znaků na dokument plus názvy souborů a složek — míří na zvolený rozhodovací endpoint (Jev přes OpenRouter nebo TypeSafe, Perplexity, Liquid AI d1, Cloudflare, lokální engine nebo vlastní URL) a přeřadí se podle relevance. Vypnuté ze zařízení nic neodchází.
- **Povolit automatickým požadavkům používat předplatné** je ve výchozím stavu **vypnuté**. Určuje, zda požadavek z příkazové řádky nebo od připojeného programového agenta smí použít vaše předplatné Claude nebo Codex; viz [Připojení programového agenta](help://mcp).

## O aplikaci

- **Verze**, adresa projektu na GitHubu a řádek, který uvádí open-source projekt, na kterém je tato aplikace založena.
- **Kanál aktualizací**: Stabilní nebo Beta. Změna se projeví ihned a vyvolá kontrolu aktualizace; instalaci z kanálu Beta nevrátí zpět na Stabilní.

## Přiřazení jako výchozí aplikace

Nastavení může zaregistrovat GenOffice jako aplikaci pro soubory .docx / .xlsx / .pptx / .pdf a podobné (registrace výchozí aplikace na úrovni systému; potvrzení, když o něj systém požádá).

## Informace o softwaru třetích stran a aktualizace

- Nápověda ▸ Informace o softwaru třetích stran: úplný přehled licencí open source dodávaných s aplikací.
- Nabídka (☰) ▸ Zkontrolovat aktualizace… (na počítači Mac Nápověda ▸ Zkontrolovat aktualizace…): spustí ruční kontrolu; novější verze vyzve k instalaci.

## Integrace MCP (pro pokročilé uživatele a klienty AI)

**Integrace** je panel, který propojí GenOffice s programovým agentem, a má o tom vlastní kapitolu: Připojení programového agenta. Zkrátka — vyberte cestu (příkazová řádka, nebo MCP), řiďte se danou částí a pak začněte nový chat a zeptejte se.

Pod **Místní HTTP server** umí aplikace server spustit sama — přepínač zapnutí a port — a část **Pokročilé** přidá adresu pro kontrolu stavu a soubor protokolu, místo aby ho nechala na pomocníkovi. Naslouchá pouze na localhostu.

## Přehled příkazů

| Příkaz                | Co dělá                     |
| --------------------- | --------------------------- |
| `ieumoffice <soubor>` | otevře soubor               |
| `ieumoffice mcp`      | spustí místní server MCP    |
| `ieumoffice --help`   | všechny příkazy a přepínače |
