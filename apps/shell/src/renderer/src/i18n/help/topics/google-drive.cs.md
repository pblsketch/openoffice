# Disk Google

Připojte Disk Google, abyste mohli v GenOffice otevírat a upravovat soubory z Disku, které vyberete. Při uložení se soubor vrátí na Disk. GenOffice může otevřít jen soubory vybrané v okně Google; zbytek vašeho Disku nevidí.

## Připojení

1. Otevřete **Nastavení ▸ Integrace**.
2. Přečtěte si **Než použijete soubory z Disku s AI**, vypněte trénování modelů v účtech AI, které používáte se soubory z Disku, a pak tuto položku zaškrtněte.
   - Claude: v Claude v **Nastavení ▸ Soukromí** vypněte trénování modelů.
   - ChatGPT a Codex: v ChatGPT v **Nastavení ▸ Ovládací prvky dat** vypněte **Improve the model for everyone**.
   - Poskytovatelé s klíčem API ve výchozím stavu data z API k trénování nepoužívají.
   - Bezplatná připojení AI (bezplatné modely OpenRouter, Gemini) soubory z Disku nikdy nedostanou.
3. Klikněte na **Připojit Disk Google**. V prohlížeči se otevře přihlašovací stránka Google. Přihlaste se a povolte přístup.
4. Vraťte se do GenOffice. Karta zobrazí připojený účet.

Google nedovoluje posílat soubory z Disku službě AI, která na nich trénuje své modely, proto se dokud položka není zaškrtnutá, nemůžete připojit ani vybírat soubory.

Přihlášení se uloží v tomto počítači a zašifruje prostředky, které operační systém poskytuje vašemu uživatelskému účtu (ochrana Windows, klíčenka macOS nebo klíčenka pracovního prostředí v Linuxu). Pokud ho tento počítač zašifrovat nemůže, připojení trvá jen do zavření aplikace.

## Otevírání souborů z Disku

- Na domovské stránce klikněte v postranním panelu na **Disk Google** a pak na **Vybrat z Disku Google**.
- V prohlížeči se otevře výběr souborů Google. Vyberte soubory, které chcete otevřít (klidně několik najednou); GenOffice se vrátí do popředí a otevře je v příslušném editoru.
- Jednou vybrané soubory zůstanou v seznamu **Vybrané soubory**. Odtud je můžete znovu otevřít nebo v nich hledat podle názvu a obsahu.
- Formáty, které GenOffice neotevře, jsou ztlumené. Dokumenty, Tabulky a Prezentace Google se otevírají jako soubory Word, Excel a PowerPoint.

## Ukládání zpět na Disk

- Ukládejte jako obvykle. Za chvíli se soubor nahraje na Disk.
- Pokud někdo soubor na Disku po otevření změnil, zobrazí se dotaz, zda soubor na Disku přepsat, uložit kopii na Disk, nebo ponechat změnu jen v tomto počítači.
- Soubor, který můžete jen zobrazit, se uloží na Disk jako kopie, nebo zůstane v tomto počítači.
- Dokument Google zůstane beze změny. Vaše změny se uloží jako soubor Office do stejné složky, nebo do složky Můj disk, pokud do té složky nelze zapisovat.
- Pokud nahrání selže, změny zůstanou v tomto počítači a GenOffice to zkusí znovu, také při příštím spuštění aplikace.

## AI a Disk

- V panelu AI editorů Word, Excel, PowerPoint, HTML, myšlenkových map a hangul klikněte vedle tlačítka přílohy na **Připojit z Disku Google**, vyberte soubory v okně Google v prohlížeči a připojte je jako soubory z tohoto počítače. Až 20 najednou.
- Dokud je zapnuto **Nechat AI vyhledávat a číst soubory na Disku** (zapne se při připojení), AI v každém editoru může prohledávat a číst soubory z Disku, které jste vybrali v GenOffice. Například: „Najdi na mém Disku zápis z porady za minulý měsíc a shrň ho.“ Pokud se soubor nenajde, nejdřív ho vyberte na domovské stránce.
- Co AI přečte, odchází poskytovateli AI, kterého používáte. Části skryté před AI zůstávají skryté.
- Pokud je používaná AI bezplatné připojení, připojování z Disku ani čtení Disku pomocí AI nefunguje.
- AI nemůže soubory na Disku měnit, mazat ani sdílet.
- Jakmile konverzace obsahuje obsah přečtený z Disku, přestane používat vyhledávání na webu, vyhledávání obrázků, čtení stránek z webové adresy a vkládání obrázků z webové adresy. Chcete-li je znovu použít, začněte novou konverzaci.

## Odpojení

V **Nastavení ▸ Integrace** klikněte na **Odpojit**. GenOffice odstraní přihlášení z tohoto počítače a požádá Google o odebrání přístupu. Kopie souborů v tomto počítači zůstanou. Přístup můžete kdykoli odebrat také v účtu Google v části **Připojení třetích stran**.
