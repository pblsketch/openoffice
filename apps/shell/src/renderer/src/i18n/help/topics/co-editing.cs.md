# Společné úpravy v síti

Lidé ve stejné síti (LAN) mohou společně otevřít jeden dokument, současně ho upravovat a vidět navzájem své kurzory a jména. Není potřeba žádný server ani účet: relaci řídí počítač, který dokument sdílí, a soubor ukládá jen on.

## Sdílení dokumentu

1. Otevřete dokument a v pruhu nástrojů editoru klikněte na **Spolupráce**.
2. Zadejte **Moje jméno** a vyberte **Moje barva**. Ostatní je uvidí vedle vašeho kurzoru.
3. Klikněte na **Zahájit sdílení**. Zobrazí se 6místný **PIN** a **Adresa tohoto počítače**.
4. Sdělte PIN lidem, kteří se připojí, a pokud dokument nenajdou, i adresu.

Pokud dokument obsahuje neuložené změny, nejprve ho uložte. Dokumenty chráněné heslem nelze sdílet. **Nový PIN** dá dokumentu nový PIN; lidé, kteří se již připojili, zůstávají.

Chcete-li sdílení ukončit, znovu otevřete **Spolupráce** a klikněte na **Ukončit sdílení**. Každému, kdo se připojil, zůstane v počítači neuložená kopie.

## Připojení

1. V libovolném editoru klikněte na **Spolupráce** a přepněte na **Připojit se**.
2. Vyberte dokument v části **Nalezeno**, nebo do pole **Adresa** zadejte adresu sdílejícího počítače.
3. Zadejte PIN a klikněte na **Připojit se**. Sdílený dokument se otevře na nové kartě.

Dokud jste připojeni, soubor ukládá sdílející osoba. Vaše Uložit nic neudělá a upozorní vás na to, a karta se při zavírání nikdy neptá na uložení. Tlačítkem **Odejít** relaci opustíte. Když relace skončí, karta zůstane otevřená jako neuložená kopie, kterou můžete uložit kamkoli.

## Společná práce na dokumentu

- Kurzor nebo výběr každého člověka se zobrazuje v jeho barvě a s jeho jménem.
- Zpět vrací jen vaše vlastní úpravy.
- Některé funkce jsou během relace vypnuté, například ty, které mění jiné části dokumentu než jeho obsah. Když editor některou z nich odmítne, upozorní vás.
- V editoru hangul může upravovat jen sdílející osoba. Ostatní účastníci sledují změny živě.
- Soubory s prostým textem a JSON se otevírají v zobrazení zdroje editoru Markdown a zatím je nelze sdílet.

## Zabezpečení

- PIN se nikdy neposílá po síti. Ověřuje se výměnou klíčů a vše, co následuje, je šifrované. Ostatní v síti nemohou přečíst dokument, úpravy ani PIN.
- Po 5 nesprávných PIN kódech z jednoho počítače musí tento počítač 10 minut počkat. Po celkem 20 nesprávných PIN kódech dostane každý sdílený dokument nový PIN a sdílející osoba je upozorněna.
- K jednomu dokumentu se může připojit až 16 lidí.
- Během sdílení se v síti oznamuje vaše jméno a název dokumentu, aby ho ostatní mohli najít.
- Při prvním sdílení může brána Windows Firewall požádat o povolení. Povolte přístup v privátních sítích. Pokud ho zablokujete, ostatní počítače se nebudou moci připojit.
