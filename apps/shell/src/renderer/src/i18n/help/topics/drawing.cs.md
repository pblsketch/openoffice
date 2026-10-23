# Editor kreseb

Editor kreseb otevírá kresby Excalidraw ve vlastní kartě a ukládá je zpět do stejného souboru.

- **Co otevírá**: poznámky s kresbou vytvořené pluginem Excalidraw pro Obsidian (`.excalidraw.md` nebo `.md`, jehož front matter obsahuje `excalidraw-plugin`) a soubory `.excalidraw` z webové aplikace Excalidraw.
- **Nová kresba**: karta **Kresba Excalidraw** na domovské stránce nebo **Soubor ▸ Nový**. Nová kresba je poznámka s kresbou pro Obsidian (`.excalidraw.md`) a název jí dáte při prvním uložení.
- **Kreslení**: tvary, šipky, čáry, kreslení od ruky a text, s vlastním panelem nástrojů a klávesovými zkratkami plátna. ctrl+Z vrací zpět.
- **Ukládání**: ctrl+S. Soubor se uloží ve formátu, ve kterém byl otevřen. Automatické ukládání zapisuje každých 30 sekund a při ztrátě fokusu okna, ale vynechá kresbu, která ještě nemá název souboru. Kresba, kterou jste si jen prohlíželi, se uloží bajt po bajtu tak, jak byla.

## Poznámky s kresbou z Obsidianu

- Uložení přepíše jen seznam textů poznámky a data kresby. Front matter, text, který jste do poznámky napsali, i její odkazy zůstanou beze změny, takže se poznámka v Obsidianu otevře stejně jako dřív.
- Obrázky, na které poznámka odkazuje (`[[obrazek.png]]` v části Embedded Files), se zobrazí, pokud leží v trezoru poznámky: v první složce nad poznámkou, která obsahuje složku `.obsidian`, jinak ve složce samotné poznámky. Obrázky větší než 20 MB, ve skrytých složkách nebo mimo trezor se nezobrazí.
- Nové obrázky do poznámky zatím přidat nelze. Nástroj obrázku je vypnutý a přetahování souborů na plátno je zablokované, protože obrázek uložený jen uvnitř poznámky by se v Obsidianu nemusel zobrazit.

## Co zatím neumí

- Není tu panel AI. AI nemůže kresby číst ani měnit.
- Není tu export do PNG ani SVG.
- Editor se nepřipojuje k síti. Písma jsou vestavěná a sdílené knihovny, spolupráce v reálném čase i vkládání webových stránek jsou vypnuté. Odkaz v kresbě se otevře v prohlížeči, jen pokud jde o webovou nebo e-mailovou adresu.

## Otevírání kreseb z Průzkumníka souborů

Instalační program přidá aplikaci do nabídky **Otevřít v programu** pro soubory `.excalidraw`, ale nenastaví ji jako výchozí program. Poznámka s kresbou je soubor `.md`, takže se otevře všude, kde aplikace otevírá soubor Markdown, a místo do editoru Markdown se dostane do editoru kreseb.
