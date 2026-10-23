# Edytor rysunków

Edytor rysunków otwiera rysunki Excalidraw we własnej karcie i zapisuje je z powrotem do tego samego pliku.

- **Co otwiera**: notatki z rysunkami utworzone wtyczką Excalidraw do Obsidiana (`.excalidraw.md` albo `.md`, którego front matter zawiera `excalidraw-plugin`) oraz pliki `.excalidraw` z aplikacji internetowej Excalidraw.
- **Nowy rysunek**: karta **Rysunek Excalidraw** na stronie głównej albo **Plik ▸ Nowy**. Nowy rysunek jest notatką z rysunkiem Obsidiana (`.excalidraw.md`), a nazwę nadajesz mu przy pierwszym zapisie.
- **Rysowanie**: kształty, strzałki, linie, rysunek odręczny i tekst, z paskiem narzędzi i skrótami samego płótna. ctrl+Z cofa.
- **Zapisywanie**: ctrl+S. Plik jest zapisywany w formacie, w którym go otwarto. Autozapis zapisuje co 30 sekund i gdy okno traci fokus, ale pomija rysunek, który nie ma jeszcze nazwy pliku. Rysunek, który tylko oglądano, zostaje zapisany bajt w bajt taki, jaki był.

## Notatki z rysunkami Obsidiana

- Zapis przepisuje tylko listę tekstów notatki i dane rysunku. Front matter, tekst napisany w notatce i jej linki zostają bez zmian, więc notatka otwiera się w Obsidianie tak samo jak wcześniej.
- Obrazy, na które wskazuje notatka (`[[obraz.png]]` w sekcji Embedded Files), są pokazywane, gdy leżą w sejfie notatki: pierwszym folderze powyżej notatki, który zawiera folder `.obsidian`, a jeśli go nie ma, w folderze samej notatki. Obrazy większe niż 20 MB, w ukrytych folderach lub poza sejfem nie są pokazywane.
- Nie można jeszcze dodawać do notatki nowych obrazów. Narzędzie obrazu jest wyłączone, a upuszczanie plików na płótno jest zablokowane, bo obraz przechowywany tylko w notatce mógłby nie wyświetlić się w Obsidianie.

## Czego jeszcze nie robi

- Nie ma panelu AI. AI nie może czytać ani zmieniać rysunków.
- Nie ma eksportu do PNG ani SVG.
- Edytor nie łączy się z siecią. Czcionki są wbudowane, a wspólne biblioteki, współpraca na żywo i osadzanie stron internetowych są wyłączone. Link w rysunku otwiera się w przeglądarce tylko wtedy, gdy jest adresem internetowym lub adresem e-mail.

## Otwieranie rysunków z Eksploratora plików

Instalator dodaje aplikację do menu **Otwórz za pomocą** dla plików `.excalidraw`, ale nie ustawia jej jako programu domyślnego. Notatka z rysunkiem jest plikiem `.md`, więc otwiera się wszędzie tam, gdzie aplikacja otwiera plik Markdown, i trafia do edytora rysunków zamiast do edytora Markdown.
