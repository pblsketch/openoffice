# Připojení programového agenta

GenOffice mluví protokolem Model Context Protocol, takže programový agent může číst, zapisovat a vykreslovat vaše dokumenty stejnými enginy, jaké používá aplikace. Agent netuší formát souboru: dostane typovaná schémata op ze stejných definic, proti kterým executor validuje.

## Registrace v aplikaci

Uděláte to v **Nastavení ▸ Integrace**. Panel má dvě poloviny a můžete použít jednu, druhou, nebo obě.

**Skill.** Jeden řádek na každého programového agenta nalezeného v tomto počítači — Claude Code, Codex, Cursor, Gemini CLI, Copilot CLI, OpenCode, Windsurf —, každý s **Nainstalovat**, **Aktualizovat** a **Odinstalovat**, navíc **Nainstalovat do jiné složky…**, **Stáhnout skill (zip)** a **Kopírovat cestu**. Pokud váš asistent v seznamu není, ukážte GenOffice složku, ze které čte `SKILL.md`, nebo uložte zip a nechte ho nainstalovat samotný asistent. Skill a MCP mohou stát vedle sebe: asistent si vybere jedno z nich a dělají přesně stejné věci.

**MCP.** Nabízí se dvě cesta: **Spouští asistent (doporučeno)** — tam přidáte zobrazenou konfiguraci do svého klienta a asistent server spustí sám — a **Místní HTTP server**, který spustí aplikace za vás. Tak či onak nakonec asistent mluví s GenOffice a vy nikdy nenapíšete příkaz.

## Registrace z příkazového řádku

Totéž z terminálu — to je pokročilá cesta, po které sáhnete, když je agent tam, kde panel nemůže najít:

```sh
ieumoffice mcp install all
```

Najde programové agenty v tomto počítači a zapíše záznam stdio serveru do vlastní konfigurace každého z nich, zatímco zbytek souboru nechá být, jak ho našel. Záznam se jmenuje `ieumoffice`. Ručně pro Claude Code vypadá stejná registrace takto: `claude mcp add --transport stdio ieumoffice -- ieumoffice mcp`.

```sh
ieumoffice mcp list             # where each agent stands
ieumoffice mcp install cursor    # just one
ieumoffice mcp uninstall cursor  # take it back out
```

Agent nainstalovaný na neobvyklém místě vyžaduje `--dir <path>`; `--force` přepíše záznam, který tam už je.

`ieumoffice mcp --help` ukáže na jedné obrazovce všechno, co server přijímá: tvary pro registraci, odebrání a výpis, poskytování přes HTTP a dva přepínače schémat.

## Spuštění vlastníma rukama

Pro klienta v jiném počítači jej místo toho vystavte přes HTTP:

```sh
ieumoffice mcp --http 8765 --token <secret>
```

`--host <addr>` mění, kde naslouchá. Klientovi předáte stejný token.

Přes HTTP putují i soubory: `PUT /files/<name>` nahraje jeden, každý nástroj bere místo cesty adresu `http(s)` a výstupy se vracejí jako adresy ke stažení — a pokud jsou dost malé, jako vložené zdroje. Op, spec a Markdown se v obou případech předávají přímo v těle.

## Co agent dostane

Každý příkaz je nástroj. Zajímavé jsou tyto:

- **`docs`, `sheet`, `slides`** — čtou a upravují soubor cestou zápisu aplikace, jednu **op** po druhé. Nová prezentace jde přes `deck_start`, `deck_page`, `deck_build`.
- **`render`** — jeden PNG na stránku, vykreslený vykreslovačem aplikace, takže agent se může na snímek podívat, místo aby ho hádal.
- **`pdf`** — textová vrstva PDF, stránka po stránce, bez procesu aplikace.
- **`info`** — metadata a souhrn struktury, obvykle nejlevnější první volání na neznámém souboru.
- **`search`, `image`, `media`** — vyhledávání na webu a vyhledávání obrázků, generování obrázků a analýza médií přes to, co je nastaveno v aplikaci, takže agent nepotřebuje vlastní klíče. Další část říká, co smějí použít.
- **`merge`** — vyplní šablonu `{{key}}`.

## Vyhledávání, obrázky a média: co smí agent použít

Požadavek z příkazu `ieumoffice` nebo od klienta MCP jste v aplikaci nenapsali vy, a proto s ním GenOffice zachází opatrně.

- **Vyhledávání** funguje vždy a ve výchozím stavu je zdarma. Klíč poskytovatele vyhledávání se použije jen tehdy, pokud jste nějaký vybrali.
- **Generování obrázku** potřebuje klíč poskytovatele obrázků. V této verzi předplatné obrázky negeneruje.
- **Popis obrázku** používá poskytovatele s klíčem, pokud je nastaven. Vaše předplatné Claude nebo Codex se **nepoužije, dokud to nepovolíte**.
- **Video a zvuk** potřebují poskytovatele s klíčem, který podporuje video.

Chcete-li používání předplatného povolit, otevřete Nastavení ▸ AI ▸ **Pokročilé** a zapněte **Povolit automatickým požadavkům používat předplatné**. Nejprve se zobrazí varování — „Neexistuje žádný hodinový limit: program může poslat libovolně mnoho požadavků a ty mohou obsahovat celý text dokumentu i obrázky jeho stránek. Ani jedna z obou společností nedoporučuje, aby program používal předplatné automaticky, a váš účet může být omezen.“ — a přepínač se zapne až po volbě **Přesto zapnout**.

I se zapnutým přepínačem platí:

- Požadavky se vyřizují po jednom. Ostatní čekají, až na ně přijde řada.
- Hodinový limit neexistuje. Pořadí se střídá po jednotlivých požadavcích, ne po celých úlohách, takže dlouhý překlad PDF se střídá s ostatními volajícími a nezdržuje je. Přepínač zapnutý podle dřívějšího varování byl vypnut: přečtěte si nové varování a zapněte ho znovu.
- Přihlášení s platbou podle spotřeby, které jste povolili volbou **Přesto použít**, se zde za předplatné nepočítá. Zachází se s ním jako s klíčem: pokud jste ho zvolili jako používanou AI, popisy obrázků jdou přes něj bez ohledu na přepínač, a každý se účtuje.

Je-li přepínač vypnutý a není nastaven žádný klíč, nástroj odpoví, že funkce není dostupná, a uvede toto nastavení. Agent si to může předem ověřit nástrojem `capabilities`; viz [Příkazová řádka a agenti](help://cli).

## Schémata a menší rozpočet

`apply` a `create` oznamují své parametry `ops`, `cells` a `data` s typovaným schématem pro každou op, vygenerovaným z `ieumoffice guide <domain> --json`. Je to přesné a ne malé. Klient s úzkým kontextovým oknem si může místo toho požádat o prostá pole:

```sh
ieumoffice mcp --compact-schemas
GENOFFICE_MCP_COMPACT_SCHEMAS=1 ieumoffice mcp
```

## Proč skill

Agent, který nezná slovní zásobu op, bude hádat. Skill přináší referenční příručku a návrhové průvodce — přesně ty materiály, které vypíše `ieumoffice guide` —, takže asistent píše ops, jejichž specifikaci si opravdu přečetl. Nainstalujte ho z panelu nahoře nebo příkazem `ieumoffice skill` z terminálu.

## Čeho se v aplikaci dostane

Server není omezen na soubory na disku. Dokud GenOffice běží, může agent pracovat i přes okno:

- **`open_in_genoffice`** otevře soubor v kartě a dá jí fokus.
- **`open_documents`** vypíše každý dokument, který máte otevřený — id, typ, cestu a zda v něm jsou neuložené změny — a pak přečte aktuální obsah jednoho z nich, uloží ho na místě, nebo ho zavře, přičemž nejdřív uloží, pokud mu neřeknete, aby změny zahodil.
- **Nástroje pro obsah** berou to id (nebo cestu) jako svůj argument `document`, takže úprava dopadne do karty, kterou už otevřenou máte, a okno se na ni přepne.

Dvě věci zůstávají mimo dosah: není tu panel AI a dialog aktualizace v aplikaci zde neplatí. Pokud nějaký krok potřebuje okno, soubor otevřete.

## Panel místního HTTP serveru

Pod **Místní HTTP server** spouští aplikace server sama, místo aby ho nechala asistentovi: přepínač zapnutí, pole **Port**, ukazatel **Běží / Zastaveno** a **Generování na pozadí** (zapisovat dokumenty rovnou do cesty bez otevírání rozhraní) a **Ukázková konfigurace klienta** ke zkopírování. Rozbalení **Pokročilé** přidá obě připojovací adresy — Streamable HTTP a starší adresu SSE —, adresu pro **Kontrolu stavu** a přepínač **Protokolování**, který zaznamenává činnost serveru a nástrojů do místního souboru, který můžete odtud **Otevřít**, **Obnovit** nebo **Vymazat**. Naslouchá pouze na localhost.
