# Szybki start: interfejs i podstawy

GenOffice to pakiet biurowy działający na Twoim komputerze: jedno okno, jeden rząd kart, w którym mieści się osiem edytorów — Docs (edytor tekstu), Sheets (arkusze), Slides (prezentacje), PDF, Markdown i zwykły tekst, HTML, HWP/HWPX (dokumenty Hangul) oraz mapy myśli (.xmind). Każdy edytor otwiera i zapisuje pliki w swoim formacie: .docx, .xlsx, .pptx, .pdf, .md, .html, .hwp/.hwpx i .xmind. Edycja nie wymaga sieci; funkcje AI jej potrzebują. Edytor map myśli importuje też pliki FreeMind i Freeplane (.mm) jako nowe mapy, zapisywane jako .xmind.

## Przegląd interfejsu

Okno składa się z trzech części:

- **Pasek kart (u góry)**: każdy otwarty plik to jedna karta. Karta Strona główna, najbardziej z lewej, jest zawsze obecna i nie można jej zamknąć; pozostałe karty to Twoje dokumenty. Kliknij dwukrotnie kartę, aby zmienić nazwę pliku w miejscu.
- **Obszar zawartości**: edytor (albo strona główna) należący do aktywnej karty.
- **Pasek menu**: na macOS w systemowym pasku menu, na Windows/Linux u góry okna. Menu Plik/Edycja/Widok zmieniają się tak, aby pasowały do aktywnego edytora.

## Tworzenie dokumentu

Dowolny z tych sposobów:

- Kliknij kartę szybkiego tworzenia w sekcji [Szybki start](help://getting-started) na **stronie głównej** (AI Docs, AI Sheets, AI Slides, ...).
- Menu **Plik ▸ Nowy**: Docs (⌘N/ctrl+N), Sheets, Slides, Markdown, HTML lub PDF.
- Przeciągnij plik na okno albo kliknij go dwukrotnie w menedżerze plików (jeśli GenOffice jest aplikacją domyślną).

Nowy dokument otwiera się bez tytułu; plik na dysku powstaje dopiero przy pierwszym zapisaniu.

## Otwieranie plików

- Menu **Plik ▸ Otwórz…** (⌘O/ctrl+O) otwiera systemowy selektor: .docx / .doc / .odt / .xlsx / .xls / .csv / .tsv / .pptx / .ppt / .pdf / .md / .html.
- Kliknij dowolny element na liście **Ostatnie** na stronie głównej.
- Także `ieumoffice <plik>` wpisane w terminalu otwiera pliki.

## Dokumenty ODT

Pliki .odt (tekst OpenDocument, format zapisywany przez Hancom Office, LibreOffice i inne programy) otwierają się na karcie Docs, z każdego miejsca, z którego otwiera się plik .docx. Nowy dokument nadal jest plikiem .docx.

- **Działa jak zwykle**: edycja tekstu, formatowanie znaków i akapitów, tabele (wstawianie i usuwanie wierszy oraz kolumn, scalanie i dzielenie komórek), obrazy, nagłówki i stopki, przypisy dolne i końcowe, ustawienia strony i sekcje, punktory i numeracja, style nagłówków, łącza, znajdź i zamień, pisownia, drukowanie, eksport do PDF i HTML oraz edycja przez AI.
- **Wyłączone w ODT**: komentarze, śledzenie zmian, porównywanie, znak wodny, pismo odręczne, spis treści, wstawianie równań, kształtów, pól tekstowych lub wykresów, kolumny, cytaty i bibliografia, podpisy i odsyłacze, kolor strony, hasło i ograniczanie edycji, zalecanie trybu tylko do odczytu, czcionki i kolory motywu, marginesy lustrzane. Ich przyciski są wyszarzone; aby z nich skorzystać, zapisz jako .docx.
- **Zostaje bez zmian**: równania, wykresy i rysunki z oryginału widać jako zablokowane obrazy, które można usunąć, ale nie edytować, a zablokowane komórki tabeli pozostają zablokowane. Części, których nie ruszasz, zapisują się bez zmian. Plik ODT chroniony hasłem się nie otworzy; najpierw usuń hasło.
- **Zapisz jako** oferuje .docx i .odt. Przed zmianą formatu pokazuje listę tego, co się zmieni lub przepadnie, a potem otwiera kartę ponownie z nowym plikiem. Markdown i HTML mają też **Eksportuj jako ODT…**.

## Model zapisywania

- **Zapis ręczny**: ⌘S/ctrl+S albo Plik ▸ Zapisz / Zapisz jako… Przy pierwszym zapisie zostaniesz poproszony o lokalizację i nazwę.
- **Autozapis** działa zgodnie z przełącznikiem w każdym edytorze (oraz domyślnym ustawieniem aplikacji). Plik PDF, który tylko czytasz, nigdy nie zostanie po cichu zapisany, a nowy dokument bez własnego pliku zacznie być automatycznie zapisywany po pierwszym zapisie.
- Zamknięcie karty z niezapisanymi zmianami najpierw pyta o Zapisz / Odrzuć / Anuluj.
- Każdy zapis jest atomowy (plik tymczasowy + zmiana nazwy), więc awaria zasilania nie zostawi uszkodzonego pliku.

## Popularne skróty

| Czynność              | macOS | Windows / Linux |
| --------------------- | ----- | --------------- |
| Nowy dokument         | ⌘N    | ctrl+N          |
| Otwórz                | ⌘O    | ctrl+O          |
| Zapisz                | ⌘S    | ctrl+S          |
| Zamknij kartę         | ⌘W    | ctrl+W          |
| Otwórz ten podręcznik | F1    | F1              |
| Zwiń Wstążkę          | ⌥⌘R   | Ctrl+F1         |

**Zwinięcie wstążki** działa w każdym edytorze. Wiersz kart pozostaje na miejscu, a pasek poleceń pod nim znika; wybrana karta jest zarazem przyciskiem zwijania, więc dopóki wstążka jest zwinięta, żadna karta nie jest wybrana, a naciśnięcie dowolnej karty przywraca pasek. Podwójne kliknięcie karty robi dokładnie to samo. Sposób, w jaki ją zostawili, jest zapamiętywany osobno dla każdego edytora. Docs dodaje środkową gęstość: **⌥⌘K** / Ctrl+Alt+K zagęszcza taśmę do samych ikon, pamiętane tak samo.

Skróty używane wewnątrz każdego edytora (malarz formatów, znajdź i zamień, operacje na tabelach, ...) opisano w odpowiednich rozdziałach; Docs dodatkowo udostępnia wyszukiwalne okno skrótów klawiaturowych (**⌘/**) (patrz jego rozdział).

## Skróty Option+Command

Option+Command to warstwa, którą Word rezerwuje na strukturyzowane skoki, a GenOffice wypełnia ją w ten sam sposób. Docs zajmuje większość z nich, Sheets dwa własne na potrzeby zgodności z Excelem, a jeden skrót działa wszędzie.

**Docs**

| Skrót (macOS)   | Co robi               | Windows / Linux    |
| --------------- | --------------------- | ------------------ |
| ⌥⌘1 / ⌥⌘2 / ⌥⌘3 | Nagłówek 1 / 2 / 3    | Ctrl+Alt+1 / 2 / 3 |
| ⌥⌘0             | Normalny              | Ctrl+Alt+0         |
| ⌥⌘M             | Akapit                | Ctrl+Alt+M         |
| ⌥⌘A             | Nowy komentarz        | Ctrl+Alt+A         |
| ⌥⌘F             | Wstaw przypis dolny   | Ctrl+Alt+F         |
| ⌥⌘E             | Wstaw przypis końcowy | Ctrl+Alt+D         |
| ⌥⌘G             | Przejdź do            | Ctrl+G             |

Dwa z nich działają inaczej w Windows, z tego samego powodu, dla którego Word je rozdziela. **macOS zajmuje ⌥⌘D** — pokazuje i ukrywa Dock —, więc przypis końcowy to ⌥⌘E na Macu, a wszędzie indziej Ctrl+Alt+D. A **Przejdź do** rezygnuje z Alt: Ctrl+G, tam gdzie skrót na Macu zabiera go ze sobą.

**Sheets**, gdy siatka ma fokus

| Skrót (macOS) | Co robi              | Windows / Linux |
| ------------- | -------------------- | --------------- |
| ⌥⌘0           | Krawędzie zewnętrzne | Ctrl+Shift+7    |
| ⌥⌘−           | Brak krawędzi        | Ctrl+Shift+−    |

Windows to nie przepisanie pary z Maca. Excel na Macu daje Sheets **oba** — ⌘⇧7 i ⌥⌘0 to dwa klawisze do tych samych krawędzi zewnętrznych —, więc w Windows polecenie zachowuje przypisane już miejsce Ctrl+Shift, a warstwa Option po prostu nie ma.

Zwróć uwagę, że **⌥⌘0 oznacza Normalny w Docs, a Krawędzie zewnętrzne w Sheets**. Nigdy nie pojawiają się w tym samym edytorze, więc w praktyce nic się nie koliduje, ale ⌥⌘0 jest już zajęty i niedostępny jako skrót globalny.

**Każdy edytor**: **⌥⌘R / Ctrl+F1** zwija wstążkę, jak opisano powyżej.

To zostawia ⌥⌘D wolny dla GenOffice na macOS, gdyby jakieś przyszłe polecenie go potrzebowało.

## Co dalej

- Gdzie są pliki: [Ekran strony głównej](help://home-screen).
- Zarządzanie wieloma otwartymi plikami: [Karty i zarządzanie oknami](help://tabs-and-windows).
- Zlecenie pracy sztucznej inteligencji: [Panel asystenta AI](help://ai-panel).
- Najpierw trzeba połączyć AI: [Połączenie z subskrypcją](help://subscription).
- Język, motyw, aplikacje domyślne: [Ustawienia, język, motyw i integracje MCP](help://settings-integrations).
